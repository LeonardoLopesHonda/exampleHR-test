# Curl Scripts — Manual API Testing Reference

A sequential set of curl commands covering all happy paths and edge cases. Run them in order — later scenarios depend on IDs captured from earlier responses.

> **Prerequisites:**
> 1. App is running: `pnpm run start:dev`
> 2. Balance is seeded (step 0 below)
> 3. Replace `<REQUEST_ID>` placeholders with actual UUIDs from prior responses
> 4. Optional: install `jq` for pretty-printed JSON output

---

## 0. Seed a Balance

Most scenarios require a balance for `emp-1` / `loc-1`. Insert one directly into SQLite (stop the app first if it holds a write lock, or use WAL mode — the default — which allows concurrent reads):

```bash
sqlite3 database.sqlite \
  "INSERT OR REPLACE INTO balances (employeeId, locationId, totalDays, remainingDays)
   VALUES ('emp-1', 'loc-1', 25, 25);"
```

---

## 1. Health Check

```bash
curl -i http://localhost:3000/
```

```
# Expected: HTTP 200
# Body: "Hello World!"
```

---

## 2. Read Balance — Happy Path

```bash
curl -i http://localhost:3000/balances/emp-1/loc-1
```

```json
// Expected: HTTP 200
{
  "employeeId": "emp-1",
  "locationId": "loc-1",
  "totalDays": 25,
  "remainingDays": 25
}
```

---

## 3. Read Balance — Not Found

```bash
curl -i http://localhost:3000/balances/emp-1/loc-unknown
```

```json
// Expected: HTTP 404
{
  "statusCode": 404,
  "message": "Balance not found for employee emp-1 at location loc-unknown",
  "error": "Not Found"
}
```

---

## 4. Create Time-Off Request — Happy Path

```bash
curl -i -X POST http://localhost:3000/timeoff/request \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "emp-1",
    "locationId": "loc-1",
    "startDate": "2026-07-01",
    "endDate": "2026-07-05",
    "daysRequested": 5,
    "managerId": "mgr-1"
  }'
```

```json
// Expected: HTTP 201
// Save the returned "id" for use in steps 11, 13, 15, 18
{
  "id": "<REQUEST_ID>",
  "employeeId": "emp-1",
  "locationId": "loc-1",
  "startDate": "2026-07-01",
  "endDate": "2026-07-05",
  "daysRequested": 5,
  "status": "PENDING",
  "managerId": "mgr-1",
  "rejectionReason": null
}
```

---

## 5. Create — Invalid Date Format

`startDate` must be `YYYY-MM-DD`.

```bash
curl -i -X POST http://localhost:3000/timeoff/request \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "emp-1",
    "locationId": "loc-1",
    "startDate": "01-07-2026",
    "endDate": "2026-07-05",
    "daysRequested": 5
  }'
```

```json
// Expected: HTTP 400
{
  "statusCode": 400,
  "message": ["startDate must be ISO date YYYY-MM-DD"],
  "error": "Bad Request"
}
```

---

## 6. Create — endDate Before startDate

```bash
curl -i -X POST http://localhost:3000/timeoff/request \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "emp-1",
    "locationId": "loc-1",
    "startDate": "2026-07-10",
    "endDate": "2026-07-01",
    "daysRequested": 5
  }'
```

```json
// Expected: HTTP 400
{
  "statusCode": 400,
  "message": "endDate must be on or after startDate",
  "error": "Bad Request"
}
```

---

## 7. Create — daysRequested Less Than 1

```bash
curl -i -X POST http://localhost:3000/timeoff/request \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "emp-1",
    "locationId": "loc-1",
    "startDate": "2026-07-01",
    "endDate": "2026-07-01",
    "daysRequested": 0
  }'
```

```json
// Expected: HTTP 400
{
  "statusCode": 400,
  "message": ["daysRequested must not be less than 1"],
  "error": "Bad Request"
}
```

---

## 8. Create — Insufficient Balance

```bash
curl -i -X POST http://localhost:3000/timeoff/request \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "emp-1",
    "locationId": "loc-1",
    "startDate": "2026-07-01",
    "endDate": "2026-07-31",
    "daysRequested": 999
  }'
```

```json
// Expected: HTTP 400
{
  "statusCode": 400,
  "message": "Requested 999 days but only 25 remain",
  "error": "Bad Request"
}
```

---

## 9. Create — Unknown Employee / Location Pair

No balance exists for this combination.

```bash
curl -i -X POST http://localhost:3000/timeoff/request \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "emp-unknown",
    "locationId": "loc-1",
    "startDate": "2026-07-01",
    "endDate": "2026-07-05",
    "daysRequested": 5
  }'
```

```json
// Expected: HTTP 400
{
  "statusCode": 400,
  "message": "No balance found for employee emp-unknown at location loc-1",
  "error": "Bad Request"
}
```

---

## 10. Create — Missing Required Field

`daysRequested` is omitted entirely.

```bash
curl -i -X POST http://localhost:3000/timeoff/request \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "emp-1",
    "locationId": "loc-1",
    "startDate": "2026-07-01",
    "endDate": "2026-07-05"
  }'
```

```json
// Expected: HTTP 400
{
  "statusCode": 400,
  "message": [
    "daysRequested must not be less than 1",
    "daysRequested must be an integer number"
  ],
  "error": "Bad Request"
}
```

---

## 11. Read Request by ID — Happy Path

Replace `<REQUEST_ID>` with the `id` from step 4.

```bash
curl -i http://localhost:3000/timeoff/<REQUEST_ID>
```

```json
// Expected: HTTP 200
{
  "id": "<REQUEST_ID>",
  "employeeId": "emp-1",
  "locationId": "loc-1",
  "startDate": "2026-07-01",
  "endDate": "2026-07-05",
  "daysRequested": 5,
  "status": "PENDING",
  "managerId": "mgr-1",
  "rejectionReason": null
}
```

---

## 12. Read Request by ID — Not Found

```bash
curl -i http://localhost:3000/timeoff/00000000-0000-0000-0000-000000000000
```

```json
// Expected: HTTP 404
{
  "statusCode": 404,
  "message": "Time-off request 00000000-0000-0000-0000-000000000000 not found",
  "error": "Not Found"
}
```

---

## 13. List Requests — Happy Path

```bash
curl -i "http://localhost:3000/timeoff?employeeId=emp-1"
```

```json
// Expected: HTTP 200 — array containing the request from step 4
[
  {
    "id": "<REQUEST_ID>",
    "employeeId": "emp-1",
    "locationId": "loc-1",
    "startDate": "2026-07-01",
    "endDate": "2026-07-05",
    "daysRequested": 5,
    "status": "PENDING",
    "managerId": "mgr-1",
    "rejectionReason": null
  }
]
```

---

## 14. List Requests — No Results

```bash
curl -i "http://localhost:3000/timeoff?employeeId=emp-nobody"
```

```json
// Expected: HTTP 200
[]
```

---

## 15. Approve Request — Happy Path

Replace `<REQUEST_ID>` with the `id` from step 4. After this call, `remainingDays` for `emp-1/loc-1` drops from 25 to 20.

```bash
curl -i -X POST http://localhost:3000/timeoff/<REQUEST_ID>/approve \
  -H "Content-Type: application/json" \
  -d '{ "managerId": "mgr-1" }'
```

```json
// Expected: HTTP 201
{
  "id": "<REQUEST_ID>",
  "employeeId": "emp-1",
  "locationId": "loc-1",
  "startDate": "2026-07-01",
  "endDate": "2026-07-05",
  "daysRequested": 5,
  "status": "APPROVED",
  "managerId": "mgr-1",
  "rejectionReason": null
}
```

Verify balance was decremented:

```bash
curl -i http://localhost:3000/balances/emp-1/loc-1
# Expected: remainingDays: 20
```

---

## 16. Approve — Missing managerId

```bash
curl -i -X POST http://localhost:3000/timeoff/<REQUEST_ID>/approve \
  -H "Content-Type: application/json" \
  -d '{}'
```

```json
// Expected: HTTP 400
{
  "statusCode": 400,
  "message": ["managerId must be a string"],
  "error": "Bad Request"
}
```

---

## 17. Approve — Non-Existent Request

```bash
curl -i -X POST http://localhost:3000/timeoff/00000000-0000-0000-0000-000000000000/approve \
  -H "Content-Type: application/json" \
  -d '{ "managerId": "mgr-1" }'
```

```json
// Expected: HTTP 404
{
  "statusCode": 404,
  "message": "Time-off request 00000000-0000-0000-0000-000000000000 not found",
  "error": "Not Found"
}
```

---

## 18. Approve — Already Approved

Re-approving the request from step 15 (now in APPROVED status).

```bash
curl -i -X POST http://localhost:3000/timeoff/<REQUEST_ID>/approve \
  -H "Content-Type: application/json" \
  -d '{ "managerId": "mgr-1" }'
```

```json
// Expected: HTTP 400
{
  "statusCode": 400,
  "message": "Cannot approve request in status APPROVED; expected PENDING",
  "error": "Bad Request"
}
```

---

## 19. Reject Request — Happy Path

First, create a fresh request (balance must have remaining days — re-seed if needed):

```bash
curl -i -X POST http://localhost:3000/timeoff/request \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "emp-1",
    "locationId": "loc-1",
    "startDate": "2026-08-01",
    "endDate": "2026-08-03",
    "daysRequested": 3
  }'
# Save the new "id" as <REJECT_ID>
```

Now reject it:

```bash
curl -i -X POST http://localhost:3000/timeoff/<REJECT_ID>/reject \
  -H "Content-Type: application/json" \
  -d '{ "managerId": "mgr-1", "reason": "Team coverage needed" }'
```

```json
// Expected: HTTP 201 — balance unchanged
{
  "id": "<REJECT_ID>",
  "employeeId": "emp-1",
  "locationId": "loc-1",
  "startDate": "2026-08-01",
  "endDate": "2026-08-03",
  "daysRequested": 3,
  "status": "REJECTED",
  "managerId": "mgr-1",
  "rejectionReason": "Team coverage needed"
}
```

---

## 20. Reject — Already Rejected

```bash
curl -i -X POST http://localhost:3000/timeoff/<REJECT_ID>/reject \
  -H "Content-Type: application/json" \
  -d '{ "managerId": "mgr-1" }'
```

```json
// Expected: HTTP 400
{
  "statusCode": 400,
  "message": "Cannot reject request in status REJECTED; expected PENDING",
  "error": "Bad Request"
}
```

---

## 21. Idempotency — Duplicate Create

Send the same `Idempotency-Key` header twice with identical bodies. Both calls must return the same response with the same `id`.

**First call:**

```bash
curl -i -X POST http://localhost:3000/timeoff/request \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-idem-key-001" \
  -d '{
    "employeeId": "emp-1",
    "locationId": "loc-1",
    "startDate": "2026-09-01",
    "endDate": "2026-09-02",
    "daysRequested": 2
  }'
# Save the returned "id" as <IDEM_ID>
```

**Second call (identical):**

```bash
curl -i -X POST http://localhost:3000/timeoff/request \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-idem-key-001" \
  -d '{
    "employeeId": "emp-1",
    "locationId": "loc-1",
    "startDate": "2026-09-01",
    "endDate": "2026-09-02",
    "daysRequested": 2
  }'
```

```json
// Expected: HTTP 201 — same "id" as the first call, no duplicate row created
{
  "id": "<IDEM_ID>",
  "status": "PENDING",
  ...
}
```

---

## 22. Batch Sync

> **Note:** The HCM integration is always mocked in this codebase. The mock client's `getBalances()` returns whatever balances were programmed via `setProgrammedBalances()` in test code, and clears them after each call. In a live running app without test setup, calling `POST /sync/batch` will always return `{ synced: 0, skipped: 0, failed: [] }` because no balances have been programmed into the mock.

To observe synced/skipped behaviour, use the integration or e2e test suite:

```bash
pnpm run test -- --testPathPattern=sync.integration
pnpm run test:e2e -- --testPathPattern=sync
```

The endpoint itself is wired up correctly:

```bash
curl -i -X POST http://localhost:3000/sync/batch
```

```json
// Expected: HTTP 201 (live app, no mock data programmed)
{
  "synced": 0,
  "skipped": 0,
  "failed": []
}
```

---

## Quick Re-seed

If you've exhausted the balance (e.g., after step 15 decremented it), reset it before running further create/approve scenarios:

```bash
sqlite3 database.sqlite \
  "UPDATE balances SET remainingDays = 25 WHERE employeeId = 'emp-1' AND locationId = 'loc-1';"
```
