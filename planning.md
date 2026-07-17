# modulocate — Concept & Architecture

> Module Allocation Software for Schools
> As of: July 2026
> This document is the living foundation for all further planning. Please continue to update it here for major decisions.

---

## 1. What the Software Does (Summary)

A platform that allows schools to distribute elective modules (with limited spots) to students:

1. Teachers/admins create modules with capacity and metadata.
2. Students submit their preferences via a secure link.
3. An allocation algorithm calculates a distribution that is as fair as possible.
4. Admins review, adjust if necessary, and approve the result.
5. Students and teachers automatically receive their results/lists.

---

## 2. Workflow / Phase Model

At its core, the app is a **state machine** — each phase locks certain data against changes. This should also be reflected in the data model (e.g. an `election_phase` field at the election level: `setup → open → closed → allocating → reviewing → finalized → published`).

### Phase 1 — Setup (Admin/Teacher)
- Teachers have regular accounts (user + password, managed via better-auth).
- Teachers create their modules: title, description, image, **capacity (number of spots)**.
- An admin additionally maintains:
  - The complete student list (including email addresses).
  - The election rules (e.g. "5 modules per student," minimum/maximum count, possibly mandatory/exclusion combinations).
- **State:** everything editable, no locks.

### Phase 2 — Election Starts (`open`)
- When the election starts, **not everything** is frozen — and what *is* locked by default is a fairness/policy choice, not a technical necessity. The allocator never trusts frozen state anyway; it re-derives eligibility live at computation time regardless (see "Live Resolution Instead of Frozen State" below):
  - **The set of modules** and **group/student rules & blocking** are locked *by default* — students who vote at different points in time should see the same option set. Both remain changeable through an explicit, audit-logged admin action ("emergency override," e.g. a teacher must cancel their module, or a student needs to move between groups) — this is safe for the system to absorb without special-casing the allocation logic, see below.
  - Whether this default lock can be disabled entirely per election, and how eagerly student-facing option lists refresh after such a change, are open configuration questions — see Section 6.
  - **Not locked** (still editable): metadata such as allowed number of spots per module, image, description. The admin can therefore still adjust these values even after the election has started — they only feed into the allocation calculation (Phase 3), not into what the student sees during the election.
- The system automatically sends **presigned URLs** by email to all students.
  - Alternative with reduced security: a simple "enter your email" login page (no real auth protection, but acceptable for small/internal elections) — this should be implementable as a **per-election configuration option**, not a global switch.
- When students open their link, they automatically see the modules available to them (read from a materialized eligibility snapshot for speed, not resolved live per request — see below) and submit their preferences.
- **State:** module list + rules/blacklists locked by default (configurable, emergency-override always available and logged), capacity/metadata still editable, student voting open.

### Phase 3 — Election Closes → Allocation Calculation (`closed` → `allocating`)
- The election is closed; no further votes can be submitted.
- A **worker job** reads the complete dataset (students, preferences, module capacities, rules) and starts one or more **runs** of the allocation algorithm.
- The admin can:
  - Watch progress live.
  - Trigger **multiple runs with different parameters/algorithms** (to compare results).
  - Subsequently adjust module sizes and have the calculation re-run (note: this is a special case — capacity is "frozen" in Phase 2, but is unlocked again for the admin in Phase 3 for correction purposes).
- Each run is stored **not in the main DB, but as a raw JSON result in Redis** (the allocator produces the result as an in-memory structure anyway, which ultimately has to be translated into DB entries — so a dedicated table isn't worthwhile until the admin makes a selection).
- When saving, the allocator automatically assigns **tags/metrics per run** so the admin can compare results, e.g.:
  - Number of errors / missing allocations (students without a complete allocation).
  - A score for how well student preferences were matched overall.
- **State:** election data is read-only for students; the admin experiments with simulations, none of which is yet in the production DB.

### Phase 4 — Review & Manual Adjustment (`reviewing`)
- The admin selects a run from Redis (e.g. based on tags/scores) and loads it into the production DB (every student now has a preliminary allocation).
- The admin makes **manual corrections** directly in the DB:
  - Conflict resolution (students with too few/no modules).
  - Special cases (students who may not/cannot participate in certain modules).
- **This phase is deliberately not locked immediately.** As long as the allocation has not yet been sent out (Phase 5), the admin can at any time:
  - Trigger new allocation runs (back to Phase 3 logic),
  - Select a different/new Redis dataset and load it again into the DB — the existing production dataset is simply overwritten in the process.
- **State:** the allocation is editable but visible only to admins — only sending it out in Phase 5 makes it final.

### Phase 5 — Publication (`finalized` / `published`)
- The allocation is set to final and **locked** (no further changes, except possibly an explicit reopen by the admin, with logging).
- A worker job automatically sends the results to all students (email).
- Teachers can export **participant lists** per module (PDF/Excel).
- **State:** fully completed, only export/evaluation remains.

### Consequences for the Architecture
- Every phase change should generate an **audit log event** (who triggered which phase and when — important for software with such a high density of "points of no return").
- Locking logic (which fields are editable in which phase) belongs in **one central, shared rule definition** in the `packages/shared` package — so that the frontend (immediate feedback: "field is locked") and backend (hard enforcement) use the same source. This is exactly the use case for which you wanted to share TypeScript between frontend and backend.
- The "compare multiple runs" requirement from Phase 3 means: allocation runs initially live only as tagged JSON blobs in Redis (key e.g. `allocation-run:{electionId}:{runId}`), not as a dedicated DB table. Only the run selected by the admin is translated into the final `assignments` entries in Postgres — and can be overwritten there by a new run at any time until it is sent out.

### Locked Decision: Allocation Rule Model (Sub-Rules instead of OR-Alternatives)
A rule consists of any number of **sub-rules**, each holding one or more categories. Categories within the same sub-rule are *not* distinct from each other (one module covering all of them satisfies the sub-rule alone); a module may satisfy **at most one sub-rule** of a rule. This single exclusivity constraint replaces two earlier ideas that were considered and rejected:
- **OR-alternatives between rule paths** — dropped because a greedy, preference-driven allocator has no lookahead: it can accumulate partial progress across multiple competing alternatives without ever completing one, wasting module slots. Real school rules didn't need true disjunctive paths (e.g. "2x Sport OR 1x Sprache+1x Kunst") — see `db_planning.md`.
- **A separate "distinct-group" flag/table alongside plain category+count requirements** — dropped because two overlapping groups referencing a shared category (e.g. `{Sprache,Kunst}` and `{Kunst,Musik}`) created unresolvable ambiguity over whether distinctness is transitive (does Sprache≠Kunst and Kunst≠Musik imply Sprache≠Musik?). The sub-rule model sidesteps that ambiguity entirely by not needing a "distinctness" concept at all: exclusivity is enforced once, at allocation time, on *assigned modules* ("a module may satisfy at most one sub-rule") — never on the sub-rules' category sets. **A category may therefore repeat freely across sub-rules of the same rule** — that's the intended way to express a count without a count field: "2x Sport" is two sub-rules that each hold just `{Sport}` (see `db_planning.md`'s `category_in_sub_rule` comment and `AllocationSubRule` in `packages/allocation-engine/src/types.ts`).

This decision spans three layers that must stay in sync: the DB schema (`rules` → `sub_rules` → `category_in_sub_rule` in `db_planning.md`), the `AllocationRule`/`AllocationSubRule` types in `packages/allocation-engine`, and any future rule-editing UI. Changing the rule model again later means touching all three — treat it as a stable foundation, not something to casually adjust in just one layer.

### Locked Decision: Live Resolution Instead of Frozen State

The system's correctness never depends on frozen state. Whenever the worker assembles an `AllocationInput` for a run (Phase 3, and every re-run in Phase 3/4), it re-derives each student's eligibility **fresh from the current blocking tables** (`group_blocked_category`/`group_blocked_module`/`student_blocked_category`/`student_blocked_module`, `category_includes_category` composition, current group membership, current rule override) and filters/cross-checks `student_preferences` against that live result — every run, not only after an admin makes an emergency change. `AllocationStudent.preferences`'s type comment, *"only modules the student was allowed to see"* (`packages/allocation-engine/src/types.ts`), is a contract the input-assembly layer (worker) must actively enforce — the allocation engine itself stays a pure function with no DB access (Section 5) and simply trusts whatever input it's handed.

This one principle is what makes retroactive changes safe in general, not just for modules:

- **Module add/remove**, **editing a group's rule/blocking config**, and **moving a student between groups** all change a student's effective eligibility/rule-set — and all of them are handled correctly by the live-resolution step regardless of when they happen relative to the vote, because the allocator was never trusting a frozen snapshot of that state to begin with.
- **A student leaving the election entirely** is a hard delete of the student's row (see "Locked Decision: Hard Delete, No Soft-Delete Fields" below) — it has zero effect on anyone else's data, and — before Phase 4 — doesn't even free or block a capacity slot, since slots are only consumed via `student_in_module`.
- What every such action still requires, mechanically: (1) **mandatory** — an audit log entry (who/what/when/for whom), which is about accountability if a result is later disputed, not about correctness; (2) **optional/best-effort** — refreshing the `student_eligible_module` snapshot (see below) for students who haven't voted yet, purely so the vote UI shows them accurate options going forward. Skippable for students who already submitted: their preference rows are left untouched either way, and it's the live-resolution step at allocation time that actually guarantees correctness, not the snapshot.

Module-specific mechanics carried over from the original design:
- **Remove:** hard delete of the `modules` row (see "Locked Decision: Hard Delete, No Soft-Delete Fields" below). Students who already ranked the removed module keep their now-dangling preference row only if the DB doesn't cascade the delete — how referencing `student_preferences`/`student_eligible_module` rows are cleaned up on a Phase-2+ module delete is an open item (Section 6), not yet resolved. Resulting rule violations, once that's settled, would surface through the existing `AllocationIssue` mechanism for manual handling in Phase 4.
- **Add:** the module is added to a student's `eligibleModuleIds` **without** a synthetic preference/rank entry — `AllocationStudent` already distinguishes `preferences` (actively ranked) from `eligibleModuleIds` (merely allowed to see). The allocator treats "eligible but unranked" as lowest priority: only assigned to satisfy a mandatory rule/sub-rule or fill otherwise-unfillable capacity, never displacing an actively-ranked module. This must be a first-class case in the allocator's design from the start, since the engine isn't implemented yet.
- Both are deliberately backend-only/invisible to students until results are published, avoiding the fairness problem the default lock guards against: students voting at different times must not end up seeing different option sets.

### Locked Decision: Hard Delete, No Soft-Delete Fields

Modules and students are hard-deleted (`DELETE FROM ...`), full stop — no `withdrawn_at`/`deleted_at` timestamp columns anywhere in the schema. Superseded an earlier soft-delete design (both fields existed briefly during initial CRUD build-out) for a clarity reason, not a technical one: with soft-delete, every future query against `modules`/`students` has to remember to filter the tombstone column, and "does this row still count" becomes a question you have to ask at every call site instead of a question the row's mere existence already answers. Data either exists or it doesn't — that invariant is worth more than the ability to silently hide a row.

Consequences, deliberately left open rather than guessed at now:
- The `modules.remove`/`students.remove` procedures currently hard-delete with no `onDelete` cascade configured on the referencing tables (`student_preferences`, `student_eligible_module`, blocking tables, `student_in_group`, `student_in_module`) — so today, deleting a module/student that already has votes or group memberships fails with a DB FK error rather than silently cascading. Whether that should become an explicit cascade, or stay a hard stop that forces the admin to resolve dependents first, is unresolved (Section 6).
- Hard delete is still permitted after the election opens (Phase 2+), but it's a materially riskier action once real votes/eligibility exist against that row — the UI must gate it behind an explicit, hard-to-misclick confirmation with a clear warning that consequences (orphaned or cascaded dependent data, changed rule/capacity math) aren't always fully predictable. This is a Phase 2+ UI requirement, not yet built (see Section 6).
- The vote app may end up needing to show a student an eligible-module list containing a module id that no longer resolves (deleted after the student's snapshot was taken) — how that's filtered/handled client- or server-side is an open question, deliberately deferred (Section 6).

### Locked Decision: Student Eligibility Snapshot — Read Optimization, Not a Correctness Gate

At the `setup → open` transition (and optionally refreshed later, see above), the backend resolves blocking once per student and persists the result as a plain Postgres table (working name `student_eligible_module`, scoped by `project_id`) — purely so the vote app has a fast, simple "who is allowed to see what" lookup instead of resolving the full blocking chain on every page load.

- **This table is explicitly not trusted by the allocator** — see "Live Resolution Instead of Frozen State" above. That's what resolves the sync problem a materialized snapshot would otherwise create: it doesn't need to be kept perfectly in lockstep with every admin edit, because it isn't the thing guaranteeing correctness.
- **Why Postgres, not Redis:** still a durable fact needed across the whole `open → allocating → reviewing → finalized` lifecycle and joined relationally against `students`/`modules`/`preferences`/`rules` (vote page, admin dashboards, later audit) — unlike the Phase 3 allocation runs, which are deliberately ephemeral/comparable and belong in Redis.
- **Read path:** the vote app queries this table for membership, joined at request time with the live-editable `modules` fields (image/description/min/max).
- **Refresh cadence is a policy knob, not a correctness requirement:** whether it updates immediately on an emergency change, on a delay, or never after `open`, only affects how many still-voting students see the latest state before submitting — it has no bearing on the correctness of the final allocation. See Section 6 for whether this should be admin-configurable.
- Open question carried over from Section 6: whether this table's scope key should be `project_id` alone or needs a separate `election_id` once elections become distinct from projects.

---

## 3. Tech Stack (Overview)

| Area | Choice | Rationale (Summary) |
|---|---|---|
| Language | TypeScript (throughout) | Shared validation/rule logic between client, backend, and worker |
| API Layer | tRPC | End-to-end type safety without codegen; fits the client-side pre-check pattern |
| REST Compatibility | `@trpc/openapi` (official, actively maintained alpha package) | Generate REST endpoints from existing tRPC procedures later if needed, without duplicating logic |
| Backend HTTP Server | Fastify or Hono | Lightweight, official tRPC adapters available |
| Auth | better-auth | TS-native, flexible enough for custom presigned-token flows alongside regular admin/teacher login. Lucia is deprecated — do not use. |
| Database | PostgreSQL | Relational integrity important for allocation logic/constraints |
| ORM | Drizzle | Close to SQL, no codegen step, lightweight — fits well in the worker context |
| Job Queue / Worker Communication | BullMQ (Redis-backed) | Standard for Node job queues, actively developed, supports job flows/progress events |
| Cache / Pub-Sub | Redis | Already present via BullMQ; later used for caching images, rate-limiting during the election phase |
| Object Storage | MinIO (S3-compatible) | Module images, exported PDFs/lists — accessible via `@aws-sdk/client-s3` |
| Allocation Algorithm | Custom TS logic (Gale-Shapley variant) + optionally `highs-js` (MIP solver, WASM) or Google OR-Tools (WASM) for more complex constraints | Capacity-constrained preference allocation with special rules |
| Frontend (Portal, Teachers+Admin) | Vite + React (SPA) | No SEO needed, behind auth, independently deployable |
| Frontend (Voting Page) | Vite + React (SPA) | Presigned-URL access, no SEO needed, independently deployable/scalable (load spikes during the election phase) |
| Routing (Frontend) | TanStack Router (or React Router v7) | Type-safe, fits the tRPC philosophy |
| Data Fetching (Frontend) | TanStack Query + `@trpc/tanstack-react-query` | Caching, refetching, optimistic updates |
| Styling | Tailwind + shared `packages/ui` (possibly on a shadcn/ui base) | Consistent look & feel across separate apps |
| Monorepo Tooling | Turborepo + pnpm Workspaces | Build caching, shared packages, multiple apps |

---

## 4. Architectural Principles

1. **Shared validation instead of duplicated logic.** Zod schemas and rule definitions (e.g. "max. 5 modules per student," phase locking) live in `packages/shared` and are used equally by the client (immediate feedback), backend (hard validation), and worker (consistency check before calculation).
2. **Separate frontend apps instead of one shared app.** The portal and voting page have different auth models, different load profiles, and different release cycles — hence two independently deployable Vite apps (`apps/portal`, `apps/vote`), connected only via shared packages (`ui`, `shared`), not via a shared deployment.
3. **Allocation simulation is decoupled from the final state.** Multiple algorithm runs (Phase 3) are stored as standalone, comparable datasets — only an explicit admin action turns a run into production `assignments`.
4. **Phase state machine with hard locks + audit log.** Every "point of no return" (election start, election close, finalization) is enforced and logged server-side.
5. **Worker for everything computation- and dispatch-intensive.** Allocation calculation and email dispatch (presigned links, results) run asynchronously via BullMQ, not within the backend's request-response cycle.

---

## 5. Monorepo Structure & Naming Convention

Project name: **modulocate** (repo/org name can be adjusted later if needed or transferred to a GitHub organization).

Folder names stay short and practical; uniqueness is established via the `package.json` namespace (`@modulocate/...`), not via nested/lengthened folder names:

```
apps/
  portal/              # @modulocate/portal-web – Vite+React SPA for teachers & admin
  vote/                # @modulocate/vote-web    – Vite+React SPA for student voting
  backend/             # @modulocate/backend     – Fastify/Hono + tRPC router, better-auth
  worker/              # @modulocate/worker      – BullMQ worker: allocation, email, exports

packages/
  shared/              # @modulocate/shared            – Zod schemas, tRPC router types, phase/rule logic
  ui/                  # @modulocate/ui                – Shared components, Tailwind base, design tokens
  allocation-engine/   # @modulocate/allocation-engine – Allocation algorithm, framework-agnostic, independently testable

infra/
  docker-compose.yml   # Postgres, Redis (MinIO to follow later if needed)
```

**Why "portal" instead of "admin":** In the workflow (Section 2), regular teacher accounts also manage modules — not just admins. "admin" would therefore wrongly suggest the app is only for admins. "portal" addresses the target audience (school staff) rather than a single role, and forms a clear counterpart to "vote" (staff vs. students).

### Concrete Setup Roadmap (First Steps)

Goal: prove a working end-to-end chain (frontend → tRPC → backend) as early as possible, before adding domain logic.

1. **Monorepo skeleton**: `pnpm init`, `pnpm-workspace.yaml`, Turborepo (`turbo.json`), create the empty folder structure as above, commit.
2. **`packages/shared`**: minimal Zod schema (e.g. `moduleSchema`) — tests whether other packages can import it cleanly.
3. **`apps/backend`**: a single `health` tRPC query (`{ status: "ok" }`), no Drizzle, no auth — proves Fastify/Hono + tRPC + workspace setup works.
4. **`apps/portal`**: Vite+React, calls only the `health` query and displays it — proves the complete `shared → backend → portal` chain including type pass-through.
5. **`infra/docker-compose.yml`**: bring up Postgres + Redis locally (MinIO only later, once images/PDFs are actually needed).
6. **Connect Drizzle**: first minimal table (`modules`), the `health` query is replaced by a real `modules.list` from Postgres.
7. **First real CRUD** in `portal`: create/list modules — this is where `packages/shared` pays off for the first time with real validation (client + server).

Only after that: better-auth, `packages/allocation-engine` (developable in parallel/isolation, a pure function with no infrastructure dependency), BullMQ worker, voting page (`apps/vote`), presigned-URL mechanism. MinIO comes last, retrofittable independently of the rest.

---

## 6. Open Items / To-Do for Future Planning Rounds

- [ ] Design the data model in detail (tables: `schools`/`teachers`, `students`, `modules`, `elections`, `election_rules`, `preferences`, `allocation_runs`, `assignments`, `audit_log`).
- [ ] Refine the allocation algorithm: Gale-Shapley variant vs. ILP approach (highs-js/OR-Tools) — depending on how hard/soft the constraints actually are (group sizes, exclusions, sibling coupling, etc.).
- [ ] Specify the presigned-URL mechanism in detail (token format, expiration time, reset/resend flow for a lost link).
- [ ] Refine the roles/permissions model (admin vs. teacher — may teachers only see/edit their own modules?).
- [ ] Set up the Docker Compose setup for local development (Postgres, Redis, MinIO, backend, worker).
- [ ] Should a per-election (or global, super-admin-only) setting allow disabling emergency overrides entirely — a strict "no retroactive changes to modules/rules/groups after election open" mode, for schools that prefer rigidity over flexibility?
- [ ] Should the eligibility-snapshot refresh cadence (see "Student Eligibility Snapshot" decision above) be admin-configurable per election — e.g. "never" (every student votes under strictly identical conditions) vs. "immediately on change" (maximize how many students see an update before voting)? Since correctness no longer depends on the snapshot, this is a pure fairness/UX trade-off, not a technical constraint.
- [ ] Following "Locked Decision: Hard Delete, No Soft-Delete Fields" above: should deleting a module/student with existing dependents (`student_preferences`, `student_eligible_module`, blocking rows, group membership) cascade automatically, or keep failing with a DB FK error until the admin resolves dependents manually? No `onDelete` cascade is configured yet.
- [ ] Design the Phase 2+ "hard delete of a module/student that already has votes" admin UI flow — needs an explicit, hard-to-misclick confirmation with a clear warning that consequences aren't always fully predictable, per the above decision.
- [ ] How should the vote app handle a student's eligible-module list referencing a module id that's been hard-deleted after the student's `student_eligible_module` snapshot was taken (e.g. does the vote API return all modules and let the frontend filter by the snapshot, or does it join and silently drop dangling ids)?

---

*This document should be updated with every major architectural decision — especially Section 6 (open items). The decision history is now tracked via version control (Git history of this file) instead of a separate table.*