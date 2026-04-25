# **Technical Requirements Document (TRD)**

## **Time-Off Microservice**

---

## **1\. Overview**

The goal of this project is to design a Time-Off microservice responsible for managing employee leave requests and maintaining accurate leave balances.

This service operates alongside an external Human Capital Management (HCM) system, which acts as the **source of truth** for employee data and balances. Since multiple systems can update HCM independently, maintaining consistency between the local system and HCM is a key challenge.

The system must ensure that employees receive fast feedback when requesting time off while preserving balance integrity across both systems.

---

## **2\. Goals and Non-Goals**

### **Goals**

* Manage the lifecycle of time-off requests (creation, approval, rejection)  
* Maintain accurate leave balances per employee and location  
* Synchronize data with HCM using both real-time and batch mechanisms  
* Handle inconsistencies and failures gracefully  
* Ensure the system is resilient to partial failures and external dependency issues

### **Non-Goals**

* Payroll or compensation management  
* Full employee profile management  
* Frontend or UI implementation  
* Authentication and authorization (assumed to be handled externally)  
* Storing complete employee or manager data locally

### **Assumptions**

* The HCM system is the source of truth for employee, manager, and balance data  
* Authentication and authorization are handled by external systems  
* Employee and manager identities are referenced via unique IDs  
* The HCM system provides reliable APIs for real-time and batch operations

---

## **3\. System Architecture**

### **The system follows a layered architecture:**

![][image1]

System’s Layers

### **Components**

* API Layer (NestJS)  
   Exposes REST endpoints for managing requests and balances.  
* Service Layer  
   Contains business logic, including validation, approval flow, and synchronization decisions.  
* Repository Layer  
   Handles database operations.  
* Database (SQLite)  
   Stores local copies of balances and time-off requests.  
* HCM Integration Layer  
   Handles communication with the external HCM system via API.

---

## 

## **4\. Data Model**

### **![][image2]**

### 

### **Employee**

 employee\_id: string,  
 created\_at: timestamp,  
 updated\_at: timestamp  
---

### **Balance**

 location\_id: string,  
 employee\_id: string,  
 total\_days: number,  
 remaining\_days: integer,  
 last\_synced\_at: timestamp,  
 created\_at: timestamp,  
 updated\_at: timestamp  
---

### **TimeOffRequest**

 timeoff\_id: string,  
 employee\_id: string,  
 location\_id: string,  
 start\_date: date,  
 end\_date: date,  
 days\_requested: integer,  
 status: PENDING | PROCESSING | APPROVED | REJECTED | FAILED  
 manager\_id: string (optional),  
 created\_at: timestamp,  
 updated\_at: timestamp  
---

### **Support Tables**

**idempotency\_keys**  
key: string,  
method: string,  
path: string,  
request\_hash: string,  
response\_status: string,  
response\_body: string,  
last\_error: string,  
status: string,  
created\_at: integer,  
updated\_at: integer  
---

**retry\_jobs**  
id: string,  
job\_type: string,  
request\_id: string,  
payload: string,  
attempts: integer,  
max\_attempts: integer,  
next\_attempt\_at: integer,  
last\_error: string,  
status: string,  
created\_at: integer,  
updated\_at: integer

---

**5\. API Design**

![][image3]

---

### **Batch Sync Endpoint (from HCM)**

POST /sync/batch

* Receives full dataset of balances  
* Reconciles local data with HCM

### **Create Time-Off Request**

POST /time-off/request

* Uses local balance for validation  
* Creates request with status PENDING

### **Approve Request**

POST /time-off/{timeoff\_id}/approve

* Moves request to PROCESSING  
* Calls HCM to validate and apply change  
* On success → updates local DB → APPROVED  
* On failure → FAILED

### **Reject Request**

POST /time-off/{timeoff\_id}/reject

* Updates status to REJECTED

### **Get Balance**

GET /balances/{employee\_id}/{location\_id}

* Returns locally stored balance  
* May be slightly stale (eventual consistency)

### **Optional Support Endpoints**

GET /time-off/{timeoff\_id}

* Retrieve request details

GET /time-off?{employee\_id}

* List requests for employee

GET /health

* Service health status

---

## **6\. Core Workflows**

### **6.1 Create Request**

1. Validate input  
2. Check local balance  
3. Create request as PENDING

### **6.2 Approve Request**

1. Move request to PROCESSING  
2. Call HCM API to validate and deduct balance  
3. If HCM succeeds:  
   * Update local balance  
   * Mark request as APPROVED  
4. If HCM fails:  
   * Mark request as FAILED

### **6.3 Reject Request**

1. Move request to REJECTED

### **6.4 Batch Synchronization**

1. Receive full balance dataset from HCM  
2. Compare with local data  
3. Update local balances  
4. Resolve conflicts (HCM overrides local data)

---

## **7\. Consistency Strategy**

The system follows a **hybrid consistency model**:

* Local database is used for performance and availability  
* HCM is used for validation during critical operations (e.g., approval)  
* Batch synchronization ensures eventual consistency

HCM is always treated as the **source of truth**, but not always queried in real-time.

---

## **8\. Key Challenges and Solutions**

### **8.1 Data Inconsistency**

* Caused by independent updates in HCM  
* **Solution:**If the local DB update fails after a successful HCM call, the operation is logged and retried asynchronously. If retries fail, batch sync will reconcile the state.

### **8.2 Partial Failures**

* HCM succeeds but local DB fails  
* **Solution:** The system logs the inconsistency and retries the local update. Retries are performed asynchronously to avoid blocking the main request flow. Batch sync ensures eventual correction

### **8.3 Race Conditions**

* Concurrent requests may attempt to modify the same balance simultaneously, leading to inconsistent or invalid states (negative balances).  
* **Solution:** Approval operations are executed within database transactions, with row-level locking applied to the corresponding balance record (employeeId, locationId). This ensures that only one transaction can read and update the balance at a time, preventing concurrent deductions from producing invalid results.

### **8.4 Idempotency**

* Duplicate requests or retries  
* **Solution:** Requests include an idempotency key; repeated requests return the original result without duplicating side effects.

### **8.5 External Dependency Failures (HCM)**

* HCM may be unavailable or inconsistent  
* **Solution:** Requests remain in PROCESSING or transition to FAILED and are retried using exponential backoff.

### **8.6 Stale Balance at Request Creation**

* Time-off requests are created using locally stored balances, which may be outdated compared to HCM. This can lead to requests being initially accepted despite insufficient actual balance.  
* **Solution:** Final validation is performed during the approval phase by calling the HCM API. If the balance is insufficient, the request is rejected or marked as failed, ensuring correctness at the decision point.

---

## **9\. Edge Case Handling**

* **Duplicate request** → return previously stored result using idempotency key  
* **HCM success \+ DB fail** → retry \+ batch correction   
* **Concurrent approvals** → row locking   
* **Stale balance** → validated at approval   
* **HCM downtime** → retry \+ FAILED state 

---

## **10\. Testing Strategy**

### **Unit Tests**

* Business logic (balance validation, lifecycle transitions)

### **Integration Tests**

* API \+ database interactions

### **Mock HCM Tests**

* Simulate:  
  * Successful responses  
  * Failures  
  * Delayed responses  
  * External balance changes

### **Edge Cases**

* Concurrent approvals  
* Duplicate requests  
* Out-of-sync balances  
* Partial failures

---

## **11\. Alternatives Considered**

### **Option 1: Always trust local database**

* Provides low latency but risks divergence from the source of truth, especially under concurrent updates 

### **Option 2: Always call HCM**

* Provides high fidelity to the source of truth but leaves the latency higher, especially under multiple requests, without a cache to query from.

### **Option 3: Hybrid (Chosen)**

* Local-first for performance  
* HCM validation for correctness  
* Batch sync for reconciliation

---

## **12\. Future Improvements**

* Event-driven architecture (message queues using rabbitMQ)  
* Distributed locking  
* Caching layer (Redis)  
* Retry queues for failed operations  
* Observability (logging, metrics)

# **13\. Test Cases**

The following test cases validate the system’s behavior across normal operations, edge cases, and failure scenarios. These tests are designed to ensure correctness, resilience, and consistency, especially in interactions with the HCM system.

## **13.1 Request Creation**

### **Should create request with valid balance**

* **Given:** Employee has sufficient local balance  
* **When:** A time-off request is created  
* **Then:** Request is stored with status `PENDING`

### **Should reject request with insufficient local balance**

* **Given:** Employee has insufficient local balance  
* **When:** A request is created  
* **Then:** Request is rejected

### **Should allow request with stale balance (validated later)**

* **Given:** Local balance is outdated but appears sufficient  
* **When:** Request is created  
* **Then:** Request is stored as PENDING  
* **And:** Final validation is deferred to approval phase


## **13.2 Approval Flow**

### **Should approve request when HCM confirms sufficient balance**

* **Given:** Request is PENDING  
* **When:** Approval is triggered and HCM validates balance  
* **Then:** Request status becomes APPROVED  
* **And:** Local balance is updated

### **Should fail approval if HCM reports insufficient balance**

* **Given:** Request is PENDING  
* **When:** HCM rejects due to insufficient balance  
* **Then:** Request status becomes FAILED or REJECTED

### **Should handle HCM failure during approval**

* **Given:** Request is PROCESSING  
* **When:** HCM API is unavailable or errors  
* **Then:** Request remains PROCESSING or becomes FAILED  
* **And:** Retry mechanism is triggered


## **13.3 Idempotency**

### **Should not duplicate request with same idempotency key**

* **Given:** A request is created with an idempotency key  
* **When:** The same request is sent again  
* **Then:** System returns the original result  
* **And:** No duplicate request is created

### **Should not duplicate approval action**

* **Given:** An approval request is retried  
* **When:** Same operation is executed again  
* **Then:** No additional balance deduction occurs


## **13.4 Partial Failures**

### **HCM success but local DB fails**

* **Given:** HCM successfully processes approval  
* **When:** Local DB update fails  
* **Then:** Operation is logged  
* **And:** Retry mechanism attempts to update DB  
* **And:** Batch sync eventually reconciles state

### **Local success but HCM fails**

* **Given:** Local system attempts approval  
* **When:** HCM fails before confirmation  
* **Then:** Request is marked FAILED  
* **And:** No local balance change is finalized


## **13.5 Race Conditions**

### **Concurrent approvals should not produce negative balance**

* **Given:** Two requests attempt to deduct from the same balance  
* **When:** They are processed concurrently  
* **Then:** Only one transaction succeeds at a time  
* **And:** Balance never becomes negative


## **13.6 Batch Synchronization**

### **Should update local balances from HCM batch data**

* **Given:** Batch data is received from HCM  
* **When:** Sync process runs  
* **Then:** Local balances are updated to match HCM

### **Should override conflicting local balances**

* **Given:** Local balance differs from HCM  
* **When:** Batch sync runs  
* **Then:** HCM value overrides local value


## **13.7 Stale Data Handling**

### **Should correct stale balances after approval**

* **Given:** Request was created with outdated local balance  
* **When:** Approval is processed  
* **Then:** HCM validation ensures correctness  
* **And:** Local balance is updated accordingly


## **13.8 System Resilience**

### **Should retry failed HCM calls with backoff**

* **Given:** HCM API fails temporarily  
* **When:** Retry mechanism triggers  
* **Then:** Requests are retried using exponential backoff

### **Should log all failure scenarios**

* **Given:** Any failure occurs (HCM or DB)  
* **When:** Error is detected  
* **Then:** System logs the failure for observability and debugging

[image1]: <data:image/png;base64,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>

[image2]: <data:image/png;base64,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>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAloAAAEgCAYAAABsCt3QAAA8NUlEQVR4Xu3dBZPjxt634feLnCfMzMkGNtnwCTMzMzMzMzMzbpiZmTe4YWbm9Ft3n2pH7rVnWt6dHXvmvqpUM5Zljy1L6p/+3db8vyBJkqQB8f/yGZIkSZowDFqSJEkDxKAlSZI0QAxakiRJA8SgJUmSNEAMWpIkSQPEoCWpyZVXXhmmmmqq8OKLL+Z3TRA//fRTPktd7oorrgj/93//FyaddNJw0UUX5XcPOUsssUT8ecstt2T3TDiLLLJIuP766/PZGoIMWpKaLLfccrFRZZptttnCL7/8ki8yXnbYYYfwxRdf5LPV5aaeeurGdjHFFFOE1VZbLV+kyJ9//hnefvvtfHbHvv/++/DOO+/kszv27rvvhgUXXDD+Pu+882b39u+xxx7LZ7XE3zjxxBPz2RqCDFqSWnrvvffCNtts02hcJ5tssrDCCiuE0aNH54sWe/DBB+NzqbedcsopYeTIkY1tY/bZZw977713vlhLv/32W+NxTDxPtcr5xx9/hHXWWSdMMskkYYMNNohhf5pppqk8Qwg//vhjmGOOOeLjTz/99Fhxw8cffxx22223sOyyyzb9jTRxX184qZhlllkatzfbbLPKvWX4O998800+exy8xl133TWfrSHIoCWpT/fee29YffXVmxqsTTfdNLz00kv5ov1af/31w9xzz53PVo/ab7/9wlxzzdXYLqjSHH/88fli42DZ++67L5xwwglh6aWXDvPMM09jezr00EPj/Sk8UbFae+21w8MPPxxvH3vssTF8LbnkkrGbO6FSSjibbrrp4nbGMpwY8HjCHdNff/3VWL6VM844I3aPJvvuu2/l3jK89quvvjpWq84666z87oY11lgjbLfddvlsDUEGLUlFzj///LDYYovFhig1rPvss09swErxmAsvvDCfrR639dZbhxlnnLGxXfz3v/8Nl112Wb5Yw0wzzRT++eefxm0CEZWkTz/9NFZOV1lllcrS/6s0EcYISpNPPnn8G7nNN988rLTSSrFrEmuttVbYc889s6X6xmvgvSQnnXRS5d6+vfXWWzGYVU9IZp555qZlqkFvo402Cttvv33lXg1VBi1JHWFczAwzzNBoVGgAb7311nyxhkceeSSGteT5559vapQSxv5Uu1RowFn27LPPjrep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6adh5513DlNMMUVjgDIb3vhs/BdeeGE+a7zxuq655pp8dtcwaJVjXQ2VahYXqd1yyy0bDSiN9worrJAvNl4IcVRE0NeBeyDsscce8X3NOOOMYZ999onzuADzrrvuGjbffPOw4YYbZo/oDfxbtHXWWSefPeCWWWaZxtgwJtbhq6++mi9WJD3PYYcd1vak5emnn46fIV2kVO+oMrWy1157hemmmy4umyOQEOrSdN9994Wvv/46X2wctCf8n18QqGaZZZZw1VVXNe5/++234+t/9tlnG/MG2mqrrRa++OKLxu3zzz9/gp3A89mOHTs2/s56fuqpp2K4bLfOV1xxxfDBBx/ks9WPngxaCRWjhJDFa77ssssqS5Tj7GBC4/Vce+21+eyuYdDqH2ewHHwXWWSR/K4h44ILLgiLL754oyGlcSGUdOqXX34JW2+9deP2NttsU7n3f/773/+Gjz/+OJ89QVC1qlY5XnnllXD//ff/u0APSp/NYKOCROBLr4dAPf/88+eLtfXiiy/Gx7377rvhoosuipdMoWqWcBLN/cstt1xjHstQTQOhifup5Hz11VeNZXgu5vOFFQIY2xeVmt9++60x9Vf5+vnnn8MWW2zRuL3UUkuF119/vbLEv0Hr4IMPDieffHLsWv3uu+/CTDPNNCDb2COPPDLO57788ss33e5Lem18TjmCJ8/Nuqki4P70009N80AApVKt+no6aM0wwwxNtxdYYIFYCu3EQJRDWYcDsfNNKAat/tFo98K+MCEcfvjhja4SJvYnut/qOuOMM5qqWAQtuvs5E7/xxhvjPJ5/QlfRku22267pNvsg3S29itDK+qKa0C2oqLCe07ZCxbCkq5iux+r+RIPOsTcdJ+mpSNtIQkUpPWbttdeOoSsPTWxbV1xxRfjxxx/jbUJQXaecckp44403GreffPLJuA98/vnn8Tavlb+f3jMTwQ5UnAaicst6Yd1W1d1veG1nnXVWPjue6OTHtrvuuiucd955TfMSlr344ovz2SrQ00ErjVegzEkpl8SdD9T7448/mm7jiSeeiO+vetaUysV33313WHrppRsp/9577w1LLrlkWGWVVRolU86Uzj777HimnLpHkm+//Tb+j0gqbIsttljTfd2GdWDQao2zQNYPQWu4/j9IGpXqGJ311lsvNj59OeaYY5rOntNjGU9ZWt394YcfmoYB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6+LXX38NN9xwQwxTrXz33XdhmmmmaVQEOWGaZZZZmvZjnu/LL79s3J4QLrnkkvh3BxvH/csvv7xx++uvvw6HH354uPLKKytLtWbQkmriYDLffPPls4eU888/v3HGxjT77LPHqtL4oOFMVQOe87XXXsuWaO+dd94JDz30UD5bExHVn6WXXrqxTTBtscUWYcyYMfmibT399NNh1llnDXfffXesLlW7op566qlG8DrqqKPCN998E8PT22+/He9P2+P6668f9t1337DCCivE6stvv/0Wp5IuKx5/4YUXxt8JDuzH47tdt8O62WijjfLZE9UJJ5wQ3zPrKsc6rAYt/P7777Fa08pss80W31Oy1FJLhddff72yRAjTTTdd0+0JgaDF6yTQnHjiiTGE875avafxxXvP10my2GKLhfvvv79pHsel448/vmleKwYtqaZ0wB8OOItLjSrvm29ddtK1+PPPP8cDdcLz0SVQigP6Sy+9lM/WIKCxW3DBBZsC15577hl++OGHfNFxTD311G0vkfL555/HcZDtBlSvtNJKTWGbv1nXPPPM01T5Ypvm0i0DgUDYrjo0MRFqOXHKpW9SVx188MFt9zPWVbV79cknn4xjsvjcEtZvCbrbSrrc3nrrrbD44os3bWsEcLR6T+OLwF6tWlXNP//8YezYsY3bbKfLL7980Zg/g5bUAboq0o5/0kkn5XcPSffee28845tiiika732TTTYJr7zySr7oOGaYYYbYDZXQTYmSKgQeeOCBWKqvyhtkPgcqHLzGhRdeuOm+dLBO1RGwLGfg1QBIV0B6f4xZUf9Yp9VuZxrkCy64IF8srLHGGo1xeUcccURclorPBhtsEOdR3WKd77jjjmGdddaJ9/PZ0F1PtStHRaYOGkUa0iq2k2rYYJugUkM4Oeecc2LFAnSPEQzoOmV7pwo2YsSIGNp43UsssUTsJqSLK41XWnTRRcOhhx4aK7dzzTVX3P6p6vL3CDlgm6XLDnfddVe8j/fF35hpppnC448/HtdHwuugW5/5pd24hKO0r3z00UeNz4nHV7s200kVxza66qsOO+ywcfZzug5ZnipnkkJ0qpYRynleuhjT43nPK664Yth2222bhmGcd955sXLOOkzDBKggpdeVS++JAM79Z555Zth5553j+6JamY7RaRxZq+dopVpp5/jA4/gbHMOq0n8LefTR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>