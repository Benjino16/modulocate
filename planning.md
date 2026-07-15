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
- When the election starts, **not everything** is frozen — only what specifically must not change during the running election without creating inconsistencies:
  - **The set of modules itself** (which modules exist at all) — no adding/deleting modules during the election.
  - **Blacklists** for certain classes/students (who is not allowed to see/choose which modules) — these must not suddenly change during the running election, otherwise students would have seen different options at different points in time.
  - **Not locked** (still editable): metadata such as allowed number of spots per module, image, description. The admin can therefore still adjust these values even after the election has started — they only feed into the allocation calculation (Phase 3), not into what the student sees during the election.
- The system automatically sends **presigned URLs** by email to all students.
  - Alternative with reduced security: a simple "enter your email" login page (no real auth protection, but acceptable for small/internal elections) — this should be implementable as a **per-election configuration option**, not a global switch.
- When students open their link, they automatically see the modules available to them (read from the DB, filtered by blacklist/class/year group) and submit their preferences.
- **State:** module list + blacklists locked, capacity/metadata still editable, student voting open.

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

---

*This document should be updated with every major architectural decision — especially Section 6 (open items). The decision history is now tracked via version control (Git history of this file) instead of a separate table.*