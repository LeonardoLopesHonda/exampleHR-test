# Phase 3 — PRD Update Notes

Temporary reference for updating the PRD. Lists every Phase 3 surface that crosses the API or DB boundary, plus the one new background process.

---

## New tables

### `idempotency_keys`

Caches the response for replays of write operations carrying an `Idempotency-Key` header. Composite primary key on `(key, method, path)` so the same client-supplied UUID can be reused across distinct routes.

| Column           | Type    | Notes                                                                  |
| ---------------- | ------- | ---------------------------------------------------------------------- |
| `key`            | text    | PK part 1 — value of the `Idempotency-Key` header.                     |
| `method`         | text    | PK part 2 — HTTP method (`POST`).                                      |
| `path`           | text    | PK part 3 — route path template (e.g. `/timeoff/request`).             |
| `requestHash`    | text    | sha256 of the canonicalized request body. Detects key reuse with different bodies. |
| `responseStatus` | integer | HTTP status code of the cached response.                               |
| `responseBody`   | text    | JSON-stringified response body returned to the replay.                 |
| `createdAt`      | integer | epoch ms; reserved for future TTL/cleanup (not used yet).              |

Unique index on `(key, method, path)`.

### `retry_jobs`

Durable queue of deferred operations that follow a partial or transient failure. Polled by `RetryWorker` (see below) every 10 seconds.

| Column          | Type    | Notes                                                                                                |
| --------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `id`            | text    | PK — UUID v4.                                                                                        |
| `jobType`       | text    | `HCM_APPROVAL` (re-run HCM call + local apply) or `LOCAL_BALANCE_APPLY` (HCM already succeeded; redo local DB write only). |
| `requestId`     | text    | Foreign reference to `time_off_requests.id`. Indexed.                                                |
| `payload`       | text    | JSON blob carrying the data needed to re-run the operation (currently `{ managerId }`).              |
| `attempts`      | integer | Incremented each time the worker claims the job.                                                     |
| `maxAttempts`   | integer | Hard cap (default `5`).                                                                              |
| `nextAttemptAt` | integer | epoch ms; worker only claims rows where `nextAttemptAt <= now()`. Indexed.                           |
| `lastError`     | text    | Most recent failure message; null on success.                                                        |
| `status`        | text    | `PENDING`, `IN_PROGRESS`, `COMPLETED`, or `EXHAUSTED`. Indexed.                                      |
| `createdAt`     | integer | epoch ms.                                                                                            |
| `updatedAt`     | integer | epoch ms.                                                                                            |

**Backoff schedule** (deterministic, no jitter): attempt 1: 0 s, 2: 5 s, 3: 15 s, 4: 60 s, 5: 300 s. After `maxAttempts`, status flips to `EXHAUSTED` and the linked `TimeOffRequest` is marked `FAILED` with `rejectionReason="Retry exhausted after N attempts: <error>"`.

---

## API surface changes

**No new endpoints.** Phase 3 adds one HTTP header to existing write routes.

### `Idempotency-Key` request header

Optional. Recognized on:

- `POST /timeoff/request`
- `POST /timeoff/:id/approve`
- `POST /timeoff/:id/reject`

Behavior:

| Scenario                                                        | Response                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Header absent                                                   | Normal processing; nothing cached.                                                        |
| First request with a fresh key                                  | Normal processing; if the response is `2xx`, body + status are cached.                    |
| Replay with same key + identical body                           | Cached response is returned immediately; the handler does not re-run.                     |
| Replay with same key but a different body                       | `409 Conflict` (`Idempotency-Key "<key>" reused with a different request body`).          |
| First request errored (4xx/5xx)                                 | Nothing cached; replay re-executes the handler from scratch.                              |

### `POST /timeoff/:id/approve` response semantics changed

Body shape is unchanged. The status field on the returned `TimeOffRequest` may now be:

- `APPROVED` — happy path (HCM succeeded, balance decremented).
- `PROCESSING` — HCM call is being retried asynchronously (transient failure) **or** HCM succeeded but the local balance write failed and is being retried.
- `FAILED` — HCM rejected the operation as a permanent error (e.g. HCM-side insufficient balance). `rejectionReason` carries the HCM message.

A response of `PROCESSING` means the client should poll `GET /timeoff/:id` to observe the eventual outcome (`APPROVED` or `FAILED`).

---

## New background process

### `RetryWorker`

NestJS-managed singleton. `@Cron` tick every 10 seconds (`CronExpression.EVERY_10_SECONDS`). On each tick:

1. Claim up to 10 `retry_jobs` rows where `status='PENDING'` and `nextAttemptAt <= now()`, ordered by `nextAttemptAt` ascending.
2. For each, mark `IN_PROGRESS`, increment `attempts`.
3. Re-execute the operation according to `jobType`:
   - `HCM_APPROVAL` — re-call HCM, then run the local-apply transaction (decrement balance + flip request to `APPROVED`).
   - `LOCAL_BALANCE_APPLY` — run the local-apply transaction only (HCM already succeeded on a prior attempt).
4. On success: `status='COMPLETED'`.
5. On `HcmPermanentError`: mark request `FAILED`, complete the job (no further retries).
6. On any other error: reschedule with the backoff schedule above; if `attempts >= maxAttempts`, set `status='EXHAUSTED'` and mark the request `FAILED`.

The worker is registered via `ScheduleModule.forRoot()` in `AppModule`. It is exposed for tests via `RetryWorker.runOnce()`, which performs one cycle synchronously.

---

## Internal error taxonomy (non-PRD)

`HcmMockClient.submitApproval()` now distinguishes:

- `HcmTransientError` — retryable (5xx, network, timeout). Triggers retry-queue path.
- `HcmPermanentError` — terminal (semantic rejection from HCM). Triggers immediate `FAILED`.

Out of scope for the PRD itself, but the consistency-strategy section may want to mention that the service treats HCM responses as either retryable or terminal.

---

## What this plan did **not** add (still Phase 4)

- `lastSyncedAt` on `Balance`.
- `createdAt` / `updatedAt` on `Balance` and `TimeOffRequest` (the new auxiliary tables have their own internal timestamps; the core entities do not).
- Explicit pessimistic row locks on `Balance` (current design relies on SQLite's writer serialization).
- `POST /sync/batch` and reconciliation logic.
- TTL / cleanup for `idempotency_keys` and completed `retry_jobs`.
