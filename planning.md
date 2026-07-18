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
- When students open their link, they automatically see the modules available to them (resolved live per request via the shared eligibility-resolution function — see below; no materialized snapshot for now) and submit their preferences.
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
- **OR-alternatives between rule paths** — dropped because a greedy, preference-driven allocator has no lookahead: it can accumulate partial progress across multiple competing alternatives without ever completing one, wasting module slots. Real school rules didn't need true disjunctive paths (e.g. "2x Sport OR 1x Sprache+1x Kunst") — see `packages/db/src/schema.ts`.
- **A separate "distinct-group" flag/table alongside plain category+count requirements** — dropped because two overlapping groups referencing a shared category (e.g. `{Sprache,Kunst}` and `{Kunst,Musik}`) created unresolvable ambiguity over whether distinctness is transitive (does Sprache≠Kunst and Kunst≠Musik imply Sprache≠Musik?). The sub-rule model sidesteps that ambiguity entirely by not needing a "distinctness" concept at all: exclusivity is enforced once, at allocation time, on *assigned modules* ("a module may satisfy at most one sub-rule") — never on the sub-rules' category sets. **A category may therefore repeat freely across sub-rules of the same rule** — that's the intended way to express a count without a count field: "2x Sport" is two sub-rules that each hold just `{Sport}` (see `packages/db/src/schema.ts`'s `category_in_sub_rule` comment and `AllocationSubRule` in `packages/allocation-engine/src/types.ts`).

This decision spans three layers that must stay in sync: the DB schema (`rules` → `sub_rules` → `category_in_sub_rule` in `packages/db/src/schema.ts`), the `AllocationRule`/`AllocationSubRule` types in `packages/allocation-engine`, and any future rule-editing UI. Changing the rule model again later means touching all three — treat it as a stable foundation, not something to casually adjust in just one layer.

### Locked Decision: Blocking Lives on the Rule, Not on the Group/Student
Blocking (which categories/dates are off-limits) is expressed as `rule_blocked_category`/`rule_blocked_date` rows keyed by `rule_id` — a plain "belongs to this rule's block list" membership, no per-row boolean or allow/deny distinction. There is exactly one rule-assignment mechanism in the whole system (`student_groups.rule_id`, overridden by `students.rule_id` when set), and blocking now rides along on it instead of having its own parallel group/student-level tables:
- **Before:** `group_blocked_category`/`group_blocked_module`/`group_blocked_date` and `student_blocked_category`/`student_blocked_module`/`student_blocked_date` (six tables), each with an `is_blocked` boolean where a student-level `false` acted as an explicit whitelist overriding a group-level block — two override layers to resolve per entity type.
- **Now:** two tables (`rule_blocked_category`, `rule_blocked_date`) owned by `rules` (cascade-deleted with their rule, like `sub_rules`). A group's or student's blocked set is just "look up the blocked_* rows of the effective rule" — the same single `student.rule_id ?? group.rule_id` resolution already used for sub-rules, reused for blocking instead of a second override mechanism. A `rule_blocked_module` table existed briefly alongside these two but was dropped — see "Locked Decision: No `rule_blocked_module`" below.
- **Why:** many groups sharing identical restrictions previously meant re-entering the same blocked rows on every group; now they just share one `rule_id`. A student needing an exception no longer needs an explicit per-student whitelist row per entity — they get their own rule (a copy of the group's with the exception applied), which is also more UI-legible: one rule = one coherent policy (what's required + what's blocked), not a base layer plus a diff to mentally merge.
- Consequence for "Live Resolution Instead of Frozen State" below: eligibility is re-derived from `rule_blocked_category`/`rule_blocked_date` of each student's effective rule, not from the old six-table group+student blocking set.
- **Open question, not yet settled (see Section 6): where blocking gets translated from rule-shaped storage into per-student decisions.** The DB storage change above is independent of this — regardless of the answer, `rule_blocked_category`/`date` stay the source of truth. Current code (`AllocationRule` in `packages/allocation-engine/src/types.ts`) has the worker's translation layer flatten blocking into `AllocationStudent.eligibleModuleIds` before the allocator runs, mirroring how sub-rules were already handled — but this is a provisional default, not a locked decision. See Section 6 for the actual trade-off. (A blocked date has no separate field alongside `eligibleModuleIds` — see "Locked Decision: No Separate `blockedDateIds`" below.)

### Locked Decision: No `rule_blocked_module`
`rule_blocked_module` (blocking a specific module directly, rather than via category) was dropped from the schema. The same effect is reachable by putting the module in a category of its own and blocking that category instead — a dedicated per-module block row didn't earn its keep as a separate mechanism. Consequence: `resolveStudentEligibility` (`packages/db/src/eligibility.ts`) only checks `rule_blocked_category`/`rule_blocked_date` now; `AllocationRule`/`AllocationStudent` in `packages/allocation-engine/src/types.ts` were never given a `blockedModuleIds` field, so nothing there needed to change.

### Locked Decision: `moduleCount`/`priority` on `rules`
Every rule now also stores `moduleCount` (integer, how many modules a student under this rule should end up with) and `priority` (boolean, whether students under this rule get priority during allocation) directly on the `rules` row — sibling fields to `subRules`/blocking, not a separate table, since both are single scalar values per rule. Neither is consumed by the allocator yet (it isn't built — see Section 2/6), but the rule-editing UI (`RuleDialog.tsx`) now collects both alongside sub-rules and blocked categories so the data exists once the allocator needs it.

### Locked Decision: Live Resolution Instead of Frozen State

The system's correctness never depends on frozen state. Whenever the worker assembles an `AllocationInput` for a run (Phase 3, and every re-run in Phase 3/4), it re-derives each student's eligibility **fresh from the current blocking tables** (`rule_blocked_category`/`rule_blocked_date` of each student's effective rule, `category_includes_category` composition, current group membership, current rule override) and filters/cross-checks `student_preferences` against that live result — every run, not only after an admin makes an emergency change. `AllocationStudent.preferences`'s type comment, *"only modules the student was allowed to see"* (`packages/allocation-engine/src/types.ts`), is a contract the input-assembly layer (worker) must actively enforce — the allocation engine itself stays a pure function with no DB access (Section 5) and simply trusts whatever input it's handed.

This one principle is what makes retroactive changes safe in general, not just for modules:

- **Module add/remove**, **editing a group's rule/blocking config**, and **moving a student between groups** all change a student's effective eligibility/rule-set — and all of them are handled correctly by the live-resolution step regardless of when they happen relative to the vote, because the allocator was never trusting a frozen snapshot of that state to begin with.
- **A student leaving the election entirely** is a hard delete of the student's row (see "Locked Decision: Hard Delete, No Soft-Delete Fields" below) — it has zero effect on anyone else's data, and — before Phase 4 — doesn't even free or block a capacity slot, since slots are only consumed via `student_in_module`.
- What every such action still requires, mechanically: an audit log entry (who/what/when/for whom), which is about accountability if a result is later disputed, not about correctness. Nothing else needs to happen mechanically — since the vote app resolves eligibility live per request (see below), a student who hasn't voted yet simply sees the updated option set on their next load, with no separate refresh/propagation step to build or maintain. Students who already submitted keep their preference rows untouched either way; it's the live-resolution step at allocation time that actually guarantees correctness, not the vote app's read path.

Module-specific mechanics carried over from the original design:
- **Remove:** hard delete of the `modules` row (see "Locked Decision: Hard Delete, No Soft-Delete Fields" below). Students who already ranked the removed module keep their now-dangling preference row only if the DB doesn't cascade the delete — how referencing `student_preferences` rows are cleaned up on a Phase-2+ module delete is an open item (Section 6), not yet resolved. Resulting rule violations, once that's settled, would surface through the existing `AllocationIssue` mechanism for manual handling in Phase 4.
- **Add:** the module is added to a student's `eligibleModuleIds` **without** a synthetic preference/rank entry — `AllocationStudent` already distinguishes `preferences` (actively ranked) from `eligibleModuleIds` (merely allowed to see). The allocator treats "eligible but unranked" as lowest priority: only assigned to satisfy a mandatory rule/sub-rule or fill otherwise-unfillable capacity, never displacing an actively-ranked module. This must be a first-class case in the allocator's design from the start, since the engine isn't implemented yet.
- Both are deliberately backend-only/invisible to students until results are published, avoiding the fairness problem the default lock guards against: students voting at different times must not end up seeing different option sets.

### Locked Decision: Hard Delete, No Soft-Delete Fields

Modules and students are hard-deleted (`DELETE FROM ...`), full stop — no `withdrawn_at`/`deleted_at` timestamp columns anywhere in the schema. Superseded an earlier soft-delete design (both fields existed briefly during initial CRUD build-out) for a clarity reason, not a technical one: with soft-delete, every future query against `modules`/`students` has to remember to filter the tombstone column, and "does this row still count" becomes a question you have to ask at every call site instead of a question the row's mere existence already answers. Data either exists or it doesn't — that invariant is worth more than the ability to silently hide a row.

Consequences, deliberately left open rather than guessed at now:
- The `modules.remove`/`students.remove` procedures currently hard-delete with no `onDelete` cascade configured on the referencing tables (`student_preferences`, blocking tables, `student_in_group`, `student_in_module`) — so today, deleting a module/student that already has votes or group memberships fails with a DB FK error rather than silently cascading. Whether that should become an explicit cascade, or stay a hard stop that forces the admin to resolve dependents first, is unresolved (Section 6).
- Hard delete is still permitted after the election opens (Phase 2+), but it's a materially riskier action once real votes/eligibility exist against that row — the UI must gate it behind an explicit, hard-to-misclick confirmation with a clear warning that consequences (orphaned or cascaded dependent data, changed rule/capacity math) aren't always fully predictable. This is a Phase 2+ UI requirement, not yet built (see Section 6).
- The vote app may end up needing to show a student an eligible-module list containing a module id that no longer resolves (deleted after the student's snapshot was taken) — how that's filtered/handled client- or server-side is an open question, deliberately deferred (Section 6).

### Deferred Decision: Live Resolution for the Vote App — No Snapshot Table (Yet)

Both the vote app's "which modules can this student see" lookup and the worker's `AllocationInput` eligibility assembly (Phase 3) need the same blocking resolution: effective rule (`student.rule_id ?? group.rule_id`) → `rule_blocked_category`/`rule_blocked_date` (composed through `category_includes_category`) → a flat `eligibleModuleIds` list. Rather than solving this twice, it's a single shared resolver function, callable either per-student (vote route, on demand, live per request) or in bulk (worker, before a run) — and it does not belong in `packages/allocation-engine`, which stays a pure function with no DB access per Architectural Principle 5. It lives wherever both `backend` and `worker` can reach it (e.g. a query module in `packages/db`), not duplicated in each app. Note this resolver only covers the flat blocking side — sub-rule exclusivity stays rule-shaped and is passed to the allocator separately, since it's inherently per-assignment and can't be flattened ahead of time (see the open item on worker-vs-allocator resolution in Section 6).

This supersedes an earlier design that additionally persisted the result as a materialized `student_eligible_module` snapshot table, refreshed at the `setup → open` transition. That table's only justification was vote-app read speed under the load spike right after the election-open email blast. Dropped for now because:

- **The correctness case for it was always zero** — see "Live Resolution Instead of Frozen State" above: the allocator never trusted a frozen snapshot to begin with, so this only ever affected the vote app's read path, never the allocation guarantee.
- **At school scale (hundreds to low thousands of students), the live query is expected to be cheap** — an indexed lookup (`student.rule_id`/`group.rule_id` → blocked rows → module join) for a single student on page load, not a full-table scan. Worth building live-first and only optimizing if load testing during a real election-open burst says otherwise.
- **It removes an open question instead of creating one:** the snapshot design left "refresh cadence" (how/when does the snapshot catch up with an admin's emergency change?) unresolved. A live query has no staleness concept to design at all — a student's next page load always reflects current state.
- **Deleted modules resolve themselves:** a module hard-deleted mid-election simply stops appearing in the live join on the next request — no separate "stale snapshot id" case to handle in the vote app (this also resolves the open item that used to live in Section 6 about dangling snapshot references).

Not ruled out permanently — if load testing shows the live query is too slow under real concurrent traffic, the fix is additive (a cache/materialization layer in front of the same shared resolver), not a rearchitecture. Revisit only on evidence.

### Locked Decision: No Separate `blockedDateIds` — It Collapses Into `eligibleModuleIds`

`AllocationStudent` originally carried both `eligibleModuleIds` and a separate `blockedDateIds` field (the effective rule's raw blocked dates, "for schedule-conflict checks alongside `module.dateIds`" per the old type comment). Removed — a blocked date has no independent meaning of its own:

- A blocked date resolves to "every module tagged with that date" via `module_in_date`, exactly the same shape as a blocked category resolving via `module_in_category`. There's nothing date-specific about it; it's just a third exclusion check (alongside blocked category/module) that already gets folded into `eligibleModuleIds` — carrying it separately duplicated information the caller already has.
- The one thing that sounded like it needed the raw list — "schedule-conflict checks" — isn't actually about the rule's block list at all. A genuine conflict between two *different, both-eligible* modules (neither individually blocked) is answered by comparing their own `AllocationModule.dateIds` directly against each other, which was always a separate field for exactly that purpose. `blockedDateIds` was never load-bearing for that check.
- Net effect: `resolveStudentEligibility` (`packages/db/src/eligibility.ts`) and `AllocationStudent` (`packages/allocation-engine/src/types.ts`) both only expose `eligibleModuleIds` now — one less field for every future caller to remember to populate/consume correctly.

### Locked Decision: `phase` Column on `projects`

The phase/state-machine described throughout this section (`setup → open → closed → allocating → reviewing → finalized → published`, see the Section 2 intro) didn't yet exist as an actual field anywhere in the schema — not on `projects`, not in the otherwise-unused `settings` table. Since the vote app's routes need to gate on it ("is voting currently open?") and the portal's "Umfrage starten"/"schließen" actions (per `design_planning.md`) need something to flip, this has to exist before the vote routes can be built:

- **Where:** a `phase` column directly on `projects` — there's no separate `elections` table in the current schema, and one project maps to one election/voting round (matches the 5-phase portal sidebar: Daten/Umfrage/Zuteilung/Anpassungen/Ergebnisse). If elections ever become distinct from projects (an open question noted earlier in this doc), the column moves with that split.
- **Type:** plain `text`, validated by a Zod enum in `packages/shared` (`setup | open | closed | allocating | reviewing | finalized | published`) — consistent with how every other constrained field in this codebase is validated (Zod, not a Postgres enum type), and avoids a migration every time a phase name or transition rule changes.
- **UI-to-state mapping** (worth keeping explicit, since the two vocabularies don't line up 1:1): Daten = `setup`, Umfrage = `open`/`closed`, Zuteilung = `allocating`, Anpassungen = `reviewing`, Ergebnisse = `finalized`/`published`.

### Locked Decision: Two Separate Auth Mechanisms — better-auth for Staff, Custom Session Cookie for Students

Admin/teacher accounts and student vote access are deliberately **not** routed through the same auth mechanism, despite both ultimately needing "verify who's making this request" at the tRPC layer:

- **Staff (admin/teacher): better-auth.** Matches its actual design center — persistent `user` + password identity, reused across projects/years, growing over time (roles, invitations, possibly multi-tenancy later — see the open "roles/permissions model" item in Section 6).
- **Students: a small hand-rolled JWT-cookie exchange, not better-auth.** A student "session" isn't an identity — it's a scoped, ephemeral access grant: no password, valid for exactly one project, meaningless once that project's election is done. Modeling it as a better-auth `user` would mean either creating real persistent user rows per student per project/year (forcing an answer to an identity question the system doesn't actually need to ask — "is the same email across two elections the same person?"), or fighting the library's persistent-identity assumptions to fake a lighter-weight type. Either path costs more than the direct sign-and-verify flow needs, since the student-side login mutation (exchange `students.signInCode` for a session) has to be hand-written regardless of which path is chosen.
- **Flow:** the vote app calls a login mutation with the `signInCode` from the emailed link; the backend looks up the student, signs a JWT (`studentId`, `projectId`, `exp`), and sets it as an `HttpOnly; Secure; SameSite=None` cookie — cross-origin between `vote-web` and `backend`, so `SameSite=None` is required, and CORS needs `credentials: true` plus an explicit allowed origin (not `*`). Subsequent vote routes go through a `protectedStudentProcedure` that verifies the cookie and attaches `ctx.student`. Logout is a mutation that clears the cookie server-side (can't be done client-side, since it's `HttpOnly`). `signInCode` itself never expires — re-clicking the email link always mints a fresh cookie, which doubles as "lost session" recovery without extra work.
- **Why not unify:** the two flows share almost no real surface — no shared password reset, no shared MFA, not even a shared login page (different apps: `portal` vs. `vote`). The only shared need is "verify a cookie, know who's asking," which costs about the same amount of code whether or not a shared library is involved. Keeping them separate avoids coupling two systems with genuinely different lifecycles and growth trajectories — admin auth will grow features that should never need to touch student sessions, and vice versa.

This refines the Tech Stack table's original "better-auth ... flexible enough for custom presigned-token flows alongside regular admin/teacher login" framing, which read as though a single mechanism would cover both — that turned out to cost more than it saves once looked at concretely.

---

## 3. Tech Stack (Overview)

| Area | Choice | Rationale (Summary) |
|---|---|---|
| Language | TypeScript (throughout) | Shared validation/rule logic between client, backend, and worker |
| API Layer | tRPC | End-to-end type safety without codegen; fits the client-side pre-check pattern |
| REST Compatibility | `@trpc/openapi` (official, actively maintained alpha package) | Generate REST endpoints from existing tRPC procedures later if needed, without duplicating logic |
| Backend HTTP Server | Fastify or Hono | Lightweight, official tRPC adapters available |
| Auth | better-auth (admin/teacher) + custom JWT session cookie (students) | Two mechanisms, deliberately not unified — see "Locked Decision: Two Separate Auth Mechanisms" above. Lucia is deprecated — do not use for either. |
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
- [ ] **Where does blocking get translated from rule-shaped storage (`rule_blocked_category`/`module`/`date`) into per-student decisions — worker or allocator?** Two options, undecided:
  - **Worker pre-flattens** (current code): before each allocator run, the worker resolves every student's effective rule and writes a flat `eligibleModuleIds`/`blockedDateIds` onto `AllocationStudent`. Allocator never sees `rule_blocked_*` at all — sub-rules remain the only raw/rule-shaped thing it's handed, because their exclusivity is inherently per-assignment and can't be flattened ahead of time. Pro: allocator stays a pure function with zero indirection in its hot loop; resolution happens once even across multiple Phase-3 comparison runs sharing one `AllocationInput`. Con: for many students sharing one rule (the exact case the new schema optimizes for), flattening re-duplicates the same blocked-id list onto every student instead of storing it once per rule — larger payload/memory the more students share a rule.
  - **Allocator resolves internally**: `AllocationRule` carries `blockedCategoryIds`/`blockedDateIds` directly (module eligibility derived via each student's `ruleId` pointer + `module.categoryIds`), so the worker only needs to pass rule objects once, deduplicated, regardless of how many students share them. Con: breaks the "allocator is a dumb pure function, all resolution logic lives in the worker" property that both the shared eligibility-resolution function (see "Deferred Decision: Live Resolution for the Vote App" above) and sub-rule handling currently assume elsewhere; every algorithm implementation would need its own (or a shared helper's) blocking-resolution step internally.
  - Whoever ends up building the worker's `AllocationInput` assembly step and the first real allocator algorithm should decide this together — the "translation has to happen somewhere regardless" point stands, so it's really a question of a single upfront pass (worker) vs. dedup-friendly lazy/shared resolution (allocator-side), not whether resolution happens at all. At school-election scale (hundreds of students, dozens of rules) neither is likely to be a measurable bottleneck either way — this is more a code-cleanliness/payload-size call than a hard performance one.
- [ ] Refine the allocation algorithm: Gale-Shapley variant vs. ILP approach (highs-js/OR-Tools) — depending on how hard/soft the constraints actually are (group sizes, exclusions, sibling coupling, etc.).
- [ ] Refine the roles/permissions model (admin vs. teacher — may teachers only see/edit their own modules?).
- [ ] Set up the Docker Compose setup for local development (Postgres, Redis, MinIO, backend, worker).
- [ ] Should a per-election (or global, super-admin-only) setting allow disabling emergency overrides entirely — a strict "no retroactive changes to modules/rules/groups after election open" mode, for schools that prefer rigidity over flexibility?
- [ ] If live eligibility resolution turns out to be too slow under real election-open load, what does the caching/materialization layer look like (see "Deferred Decision: Live Resolution for the Vote App" above) — short-TTL per-request cache, or a full snapshot table again? Only worth answering once load testing shows it's actually needed.
- [ ] Following "Locked Decision: Hard Delete, No Soft-Delete Fields" above: should deleting a module/student with existing dependents (`student_preferences`, blocking rows, group membership) cascade automatically, or keep failing with a DB FK error until the admin resolves dependents manually? No `onDelete` cascade is configured yet.
- [ ] Design the Phase 2+ "hard delete of a module/student that already has votes" admin UI flow — needs an explicit, hard-to-misclick confirmation with a clear warning that consequences aren't always fully predictable, per the above decision.

---

*This document should be updated with every major architectural decision — especially Section 6 (open items). The decision history is now tracked via version control (Git history of this file) instead of a separate table.*