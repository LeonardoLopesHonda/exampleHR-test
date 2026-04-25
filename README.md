# Time-Off Microservice

A NestJS + SQLite microservice that manages employee time-off requests and leave balances. It is designed to operate alongside an external Human Capital Management (HCM) system, which is the source of truth for balances; the local database is a performance/availability cache, and HCM is consulted at critical decision points.

> Built on NestJS 11 with TypeORM and `better-sqlite3`. The HCM integration is always mocked in this codebase.

---

## Table of Contents

- [Goals and Non-Goals](#goals-and-non-goals)
- [Covered Edge Cases](#covered-edge-cases)
- [Architecture](#architecture)
- [Folder Structure](#folder-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Running the App](#running-the-app)
- [Database](#database)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Available Scripts](#available-scripts)
- [Project Roadmap](#project-roadmap)

---

## Goals and Non-Goals

### Goals

- Manage the lifecycle of time-off requests (creation, approval, rejection).
- Maintain accurate leave balances per employee and location.
- Synchronize data with HCM using both real-time and batch mechanisms.
- Handle inconsistencies and partial failures gracefully.
- Remain resilient to external dependency issues (HCM downtime, slow responses).

### Non-Goals

- Payroll or compensation management.
- Full employee or manager profile management — entities are referenced by ID only.
- Frontend or UI implementation.
- Authentication and authorization (assumed to be handled externally).
- Storing complete employee or manager data locally.

---

## Covered Edge Cases

The service is designed to handle the following scenarios. See the [PRD](./docs/) and `*.integration.spec.ts` files for the full specification.


| Scenario              | Behaviour                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Duplicate request     | Idempotency key returns the previously stored result.                                       |
| HCM success + DB fail | Inconsistency is logged; retry runs asynchronously; batch sync reconciles.                  |
| Concurrent approvals  | Row-level locking on `(employeeId, locationId)` prevents negative balances.                 |
| Stale local balance   | Final validation is deferred to the approval phase via the HCM API.                         |
| HCM downtime          | Request stays in `PROCESSING` or transitions to `FAILED`; retried with exponential backoff. |
| Out-of-sync balances  | Reconciled by the batch sync endpoint (HCM overrides local data).                           |


---

## Architecture

The service follows a layered architecture: **Controller → Service → Repository → Database**, with the Service layer also responsible for HCM integration.

```
┌────────┐   ┌─────────┐   ┌────────────┐   ┌──────────┐
│  API   │ → │ Service │ → │ Repository │ → │ Database │
└────────┘   └────┬────┘   └────────────┘   └──────────┘
                  │
                  ▼
              ┌───────┐
              │  HCM  │  (mocked)
              └───────┘
```

**Consistency model:** local DB for performance, HCM validation for critical operations (approvals), batch sync for eventual reconciliation.

---

## Folder Structure

```
example-hr/
├── src/
│   ├── main.ts                       # App bootstrap, global ValidationPipe, listens on PORT
│   ├── app.module.ts                 # Root module — wires TypeORM + feature modules
│   ├── app.controller.ts             # Health/root controller
│   ├── app.service.ts
│   ├── balance/                      # Balance feature module
│   │   ├── balance.entity.ts         # TypeORM entity (composite key: employeeId, locationId)
│   │   ├── balance.controller.ts     # GET /balances/:employeeId/:locationId
│   │   ├── balance.service.ts        # Repository access for balances
│   │   ├── balance.module.ts
│   │   ├── balance.controller.spec.ts
│   │   ├── balance.service.spec.ts
│   │   └── balance.integration.spec.ts
│   └── time-off/                     # Time-off feature module
│       ├── time-off.entity.ts        # TimeOffRequest entity + TimeOffStatus enum
│       ├── time-off.controller.ts    # POST /timeoff/request, GET /timeoff/:id, GET /timeoff
│       ├── time-off.service.ts       # Request creation, balance check
│       ├── time-off.module.ts
│       ├── dto/
│       │   └── create-time-off-request.dto.ts
│       ├── time-off.controller.spec.ts
│       ├── time-off.service.spec.ts
│       └── time-off.integration.spec.ts
├── test/                             # End-to-end tests (separate Jest config)
│   ├── app.e2e-spec.ts
│   ├── time-off.e2e-spec.ts
│   └── jest-e2e.json
├── docs/                             # Project plans and PRD-related docs
├── database.sqlite                   # Local SQLite DB (gitignored, auto-created on first run)
├── nest-cli.json
├── eslint.config.mjs
├── tsconfig.json
├── tsconfig.build.json
├── package.json
└── pnpm-lock.yaml
```

---

## Prerequisites

You need **Node.js ≥ 20** and **pnpm**. The fastest path on a fresh machine:

```bash
# 1. Install nvm + Node 20 LTS, then enable pnpm via Corepack
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash \
  && export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" \
  && nvm install 20 && corepack enable && corepack prepare pnpm@latest --activate

# Verify
node -v && pnpm -v
```

> Already have Node? Just run `corepack enable && corepack prepare pnpm@latest --activate`.
> Native build tools are required by `better-sqlite3`: on Debian/Ubuntu install `build-essential python3`; on macOS install Xcode Command Line Tools (`xcode-select --install`).

---

## Getting Started

```bash
git clone <your-fork-url> example-hr && cd example-hr
pnpm install
```

Optional — set a custom port (defaults to `3000`):

```bash
echo "PORT=3000" > .env   # only PORT is read today; .env is gitignored
```

That's it — the SQLite database file is created automatically the first time the app boots.

---

## Running the App

```bash
pnpm run start:dev      # watch mode (recommended during development)
pnpm run start          # one-shot run
pnpm run build && pnpm run start:prod   # production-style: compile to dist/, then run
pnpm run start:debug    # watch mode with --inspect for Chrome/VS Code debugger
```

Once running, the service listens on `http://localhost:3000`.

Quick smoke test:

```bash
curl http://localhost:3000/
```

---

## Database

- **Engine:** SQLite via `better-sqlite3`, driven by TypeORM.
- **File:** `./database.sqlite` (in the project root, gitignored).
- **Schema:** auto-synced on boot — `synchronize: true` is enabled because this project ships without migrations during Phase 1. Do not rely on this in production.
- **Reset:** stop the app and delete `database.sqlite`; the schema is recreated on next boot.

### Entities

`**Balance`** (composite key: `employeeId` + `locationId`)


| Field           | Type    | Notes                  |
| --------------- | ------- | ---------------------- |
| `employeeId`    | string  | Primary key (part 1)   |
| `locationId`    | string  | Primary key (part 2)   |
| `totalDays`     | integer | Total annual allowance |
| `remainingDays` | integer | Remaining balance      |


`**TimeOffRequest**`


| Field           | Type    | Notes                                                 |
| --------------- | ------- | ----------------------------------------------------- |
| `id`            | string  | Primary key (server-assigned)                         |
| `employeeId`    | string  | Indexed                                               |
| `locationId`    | string  |                                                       |
| `startDate`     | string  | `YYYY-MM-DD`                                          |
| `endDate`       | string  | `YYYY-MM-DD`                                          |
| `daysRequested` | integer | Must be ≥ 1                                           |
| `status`        | string  | `PENDING | PROCESSING | APPROVED | REJECTED | FAILED` |
| `managerId`     | string? | Optional                                              |


### Seeding a balance manually

Until a seed script is provided, you can insert a row directly:

```bash
sqlite3 database.sqlite "INSERT INTO balances (employeeId, locationId, totalDays, remainingDays) VALUES ('emp-1', 'loc-1', 25, 25);"
```

---

## API Reference

All endpoints are prefixed by `http://localhost:3000`. Request bodies must be JSON; the global `ValidationPipe` rejects unknown fields.

### Get balance

```bash
curl http://localhost:3000/balances/emp-1/loc-1
```

```json
{ "employeeId": "emp-1", "locationId": "loc-1", "totalDays": 25, "remainingDays": 25 }
```

### Create a time-off request

```bash
curl -X POST http://localhost:3000/timeoff/request \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "emp-1",
    "locationId": "loc-1",
    "startDate": "2026-05-01",
    "endDate": "2026-05-05",
    "daysRequested": 5,
    "managerId": "mgr-1"
  }'
```

Returns the persisted request with status `PENDING`.

### Get a request by id

```bash
curl http://localhost:3000/timeoff/<request-id>
```

### List requests for an employee

```bash
curl "http://localhost:3000/timeoff?employeeId=emp-1"
```

> Endpoints planned for later phases (`POST /timeoff/:id/approve`, `POST /timeoff/:id/reject`, `POST /sync/batch`) are not yet implemented. See the [Roadmap](#project-roadmap).

---

## Testing

Three layers of tests are wired up:


| Layer       | Location                               | Command                       |
| ----------- | -------------------------------------- | ----------------------------- |
| Unit        | `src/**/*.spec.ts` (excl. integration) | `pnpm run test`               |
| Integration | `src/**/*.integration.spec.ts`         | `pnpm run test` (same runner) |
| End-to-end  | `test/*.e2e-spec.ts`                   | `pnpm run test:e2e`           |


Common workflows:

```bash
pnpm run test                              # all unit + integration tests, verbose output
pnpm run test:watch                        # re-run on change
pnpm run test:cov                          # with coverage report (./coverage)
pnpm run test:e2e                          # end-to-end tests (separate Jest config)

# Run a single file
pnpm run test -- --testPathPattern=balance.service
pnpm run test -- src/time-off/time-off.service.spec.ts

# Run a single test by name
pnpm run test -- -t "should create a request with valid balance"

# Debug a test in Node Inspector
pnpm run test:debug
```

Both `test` and `test:e2e` run with `--verbose` so each individual case is printed; drop the flag in `package.json` if you prefer a quieter output.

---

## Available Scripts


| Script                 | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `pnpm run start`       | Start the app (no watch).                             |
| `pnpm run start:dev`   | Start in watch mode.                                  |
| `pnpm run start:debug` | Watch mode with `--inspect` for attaching a debugger. |
| `pnpm run start:prod`  | Run the compiled output (`node dist/main`).           |
| `pnpm run build`       | Compile TypeScript to `dist/`.                        |
| `pnpm run lint`        | ESLint + Prettier (auto-fix).                         |
| `pnpm run format`      | Prettier-only formatting.                             |
| `pnpm run test`        | Unit + integration tests (verbose).                   |
| `pnpm run test:watch`  | Tests in watch mode.                                  |
| `pnpm run test:cov`    | Tests with coverage.                                  |
| `pnpm run test:debug`  | Tests under Node Inspector.                           |
| `pnpm run test:e2e`    | End-to-end tests (verbose).                           |


---

## Project Roadmap

The codebase is built phase-by-phase. The active phase is communicated per session — do not introduce hooks, abstractions, or interfaces for future phases.

- **Phase 1 — Core API & data layer** *(current)*: schema, TimeOffRequest creation/read, balance read.
- **Phase 2 — Approval flow + HCM mock integration**: `POST /timeoff/:id/approve`, `POST /timeoff/:id/reject`, mocked HCM client.
- **Phase 3 — Idempotency, retries, failure handling**: idempotency keys, retry/backoff, structured failure logging.
- **Phase 4 — Batch sync, edge cases**: `POST /sync/batch`, reconciliation, race-condition hardening.

