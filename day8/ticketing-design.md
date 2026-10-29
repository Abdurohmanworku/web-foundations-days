# TicketHub — Event Ticketing System Design

## 1. Requirements

### Functional requirements

TicketHub is a website where users can discover concerts and events, select seats, reserve them temporarily, pay, and access their tickets.

- Users can register, log in, and manage a profile.
- Users can browse events by city, date, category, artist, and venue.
- Users can view event details, including date, venue, price ranges, and an interactive seat map.
- Users can view real-time seat availability.
- Users can place a temporary hold on one or more seats before paying.
- Users can pay for held seats using a supported payment provider.
- After successful payment, the system issues tickets with unique identifiers and QR codes.
- Users can view their purchased tickets in “My Tickets.”
- Organizers can create events, define seat sections and prices, and monitor sales.
- The system must prevent two customers from buying the same seat.
- The system should cancel expired unpaid seat holds and return those seats to available inventory.
- The system should send order confirmations by email.

### Non-functional requirements

| Requirement | Target |
|---|---|
| Correctness | A seat can never be sold to more than one customer. This is the highest-priority requirement. |
| Fairness | During a popular sale, no user should be able to bypass the queue or reserve seats through excessive automated requests. |
| Speed | Normal event and seat-map pages should respond in under 300 ms at the 95th percentile. |
| Availability | The site should remain available during a major sale; partial degradation is preferable to a full outage. |
| Scalability | The system must handle a sudden increase from normal traffic to a major-sale traffic spike. |
| Consistency | Payment, order, and ticket records must be accurate and recoverable after failures. |
| Security | Passwords must be hashed; payment data must be handled by a PCI-compliant payment provider; API access must be authenticated and rate-limited. |
| Auditability | Every seat transition—available, held, sold, released—must be traceable. |

Correctness and fairness matter more than showing the absolute latest seat availability. It is better for a user to see a seat as unavailable for a few seconds than to allow duplicate sales.

## 2. Traffic estimates

### Normal day

Given facts:

- 2 million registered users.
- 50,000 visitors per normal day.
- Each visitor views 10 pages.
- 5,000 tickets are sold per normal day.

Estimated normal traffic:

- Page views: \(50{,}000 \times 10 = 500{,}000\) page views per day.
- Average requests per second: \(500{,}000 / 86{,}400 \approx 5.8\) requests per second.
- Peak normal traffic: assume 5 times the average, or about 30 requests per second.
- Ticket sales: \(5{,}000\) tickets per day, or about 0.06 sales per second on average.
- Seat-map reads will be much more frequent than purchases, so the system is read-heavy during normal operation.

### Popular-concert sale

When a very popular concert goes on sale:

- 200,000 people attempt to buy 20,000 seats.
- The rush occurs within the first 10 minutes, or 600 seconds.
- Average purchase attempts: \(200{,}000 / 600 \approx 333\) purchase-related requests per second.
- Each user may make several requests: view event, load seat map, hold seats, check hold status, and pay.
- Assuming 5 requests per attempting user, peak traffic is approximately \(200{,}000 \times 5 / 600 \approx 1{,}667\) requests per second.
- If users refresh the seat map frequently, actual read traffic could be several times higher—for example, 5,000–10,000 requests per second.
- Only 20,000 seats are available, so 180,000 users will not get seats in the initial sale.

### Comparison

| Metric | Normal day | Popular-concert sale | Increase |
|---|---:|---:|---:|
| Visitors | 50,000/day | 200,000 in 10 minutes | Much higher concentration |
| Page views | 500,000/day | About 1,000,000+ in 10 minutes | Roughly 2,880x the normal per-second rate |
| Average requests | About 5.8/sec | About 1,667/sec before seat-map refreshes | About 287x |
| Seats sold | 5,000/day | 20,000 in 10 minutes | About 240x the normal sales rate |
| Main challenge | Fast browsing and reliable checkout | Fair queueing, inventory correctness, and preventing overload |

The important insight is that the big sale is not just “more traffic.” It is a short, extreme burst where many users compete for scarce inventory. The design must absorb reads cheaply, queue purchase attempts fairly, and make seat allocation transactional.

## 3. API design

All endpoints use JSON. Authentication uses a bearer token. IDs are UUIDs.

### 1. List events

`GET /api/v1/events?city=Istanbul&from=2026-11-01&to=2026-12-31&category=concert&page=1`

Returns a paginated list of upcoming events.

Response:

```json
{
  "items": [
    {
      "id": "evt_123",
      "name": "Aurora World Tour",
      "venue": "Istanbul Arena",
      "city": "Istanbul",
      "starts_at": "2026-12-10T20:00:00Z",
      "min_price": 750,
      "max_price": 3500,
      "availability": "AVAILABLE"
    }
  ],
  "page": 1,
  "total_pages": 12
}
```

### 2. View event and seat map

`GET /api/v1/events/{event_id}/seats`

Returns sections, rows, seats, prices, and current availability.

Response:

```json
{
  "event_id": "evt_123",
  "sections": [
    {
      "id": "sec_A",
      "name": "Floor A",
      "rows": [
        {
          "row": "1",
          "seats": [
            { "id": "seat_981", "number": "12", "price": 2500, "status": "AVAILABLE" },
            { "id": "seat_982", "number": "13", "price": 2500, "status": "HELD" }
          ]
        }
      ]
    }
  ]
}
```

### 3. Hold seats

`POST /api/v1/events/{event_id}/seat-holds`

Requires authentication. Creates a temporary hold for selected seats.

Request:

```json
{
  "seat_ids": ["seat_981", "seat_985"],
  "hold_duration_seconds": 600
}
```

Response:

```json
{
  "hold_id": "hold_456",
  "status": "ACTIVE",
  "expires_at": "2026-10-29T16:23:00Z",
  "seats": ["seat_981", "seat_985"],
  "total_price": 5000
}
```

A hold expires after 10 minutes if payment is not completed.

### 4. Pay for held seats

`POST /api/v1/seat-holds/{hold_id}/payments`

Requires authentication. Converts an active hold into an order and starts payment.

Request:

```json
{
  "payment_method_token": "pm_token_789"
}
```

Response:

```json
{
  "order_id": "ord_789",
  "status": "PROCESSING",
  "payment_id": "pay_456",
  "amount": 5000,
  "currency": "TRY"
}
```

### 5. View purchased tickets

`GET /api/v1/orders/{order_id}/tickets`

Requires authentication. Returns the buyer’s tickets after payment succeeds.

Response:

```json
{
  "order_id": "ord_789",
  "status": "CONFIRMED",
  "tickets": [
    {
      "ticket_id": "tkt_001",
      "event_id": "evt_123",
      "seat_id": "seat_981",
      "qr_code_url": "https://api.tickethub.example/tickets/tkt_001/qr",
      "status": "VALID"
    }
  ]
}
```

### Supporting endpoints

- `GET /api/v1/events/{event_id}` — event details.
- `GET /api/v1/seat-holds/{hold_id}` — check whether a hold is still active.
- `DELETE /api/v1/seat-holds/{hold_id}` — release seats before the hold expires.
- `GET /api/v1/users/me/tickets` — list all tickets owned by the signed-in user.
- `POST /api/v1/payments/{payment_id}/webhook` — internal payment-provider callback used to confirm payment.

## 4. Data model

### users

Stores customer accounts.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| email | VARCHAR | Unique, not null |
| password_hash | VARCHAR | Not null |
| full_name | VARCHAR | Not null |
| created_at | TIMESTAMP | Not null |

### events

Stores concerts and other events.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| organizer_id | UUID | References `users.id` |
| name | VARCHAR | Not null |
| venue | VARCHAR | Not null |
| city | VARCHAR | Not null |
| starts_at | TIMESTAMP | Not null |
| sale_opens_at | TIMESTAMP | Not null |
| status | ENUM | `DRAFT`, `ON_SALE`, `SOLD_OUT`, `CANCELLED` |

### seats

Stores individual bookable seats.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| event_id | UUID | References `events.id` |
| section | VARCHAR | Not null |
| row | VARCHAR | Not null |
| seat_number | VARCHAR | Not null |
| price_cents | INTEGER | Not null |
| status | ENUM | `AVAILABLE`, `HELD`, `SOLD` |
| held_by_user_id | UUID | Nullable; references `users.id` |
| hold_expires_at | TIMESTAMP | Nullable |
| version | INTEGER | Optimistic-concurrency version |

Unique constraint: `(event_id, section, row, seat_number)`.

### seat_holds

Tracks temporary reservations.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | References `users.id` |
| event_id | UUID | References `events.id` |
| status | ENUM | `ACTIVE`, `EXPIRED`, `RELEASED`, `CONVERTED` |
| expires_at | TIMESTAMP | Not null |
| created_at | TIMESTAMP | Not null |

### orders

Represents a purchase attempt.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | References `users.id` |
| event_id | UUID | References `events.id` |
| seat_hold_id | UUID | References `seat_holds.id` |
| status | ENUM | `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED` |
| total_cents | INTEGER | Not null |
| payment_provider_id | VARCHAR | Nullable |
| created_at | TIMESTAMP | Not null |

### tickets

Issued only after successful payment.

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| order_id | UUID | References `orders.id` |
| seat_id | UUID | References `seats.id` |
| user_id | UUID | References `users.id` |
| qr_code | VARCHAR | Unique |
| status | ENUM | `VALID`, `USED`, `CANCELLED` |
| issued_at | TIMESTAMP | Not null |

Unique constraint: `seat_id`, ensuring that one seat can have only one valid ticket.

### Relationships

- One user can create many seat holds, orders, and tickets.
- One event has many seats.
- One seat belongs to exactly one event.
- One seat hold can contain many seats and can produce at most one order.
- One order can contain many tickets.
- One ticket corresponds to exactly one seat and one order.
- A seat can be held by only one user at a time and can ultimately have only one sold ticket.

## 5. Preventing double-booking

Double-booking is prevented by combining a database transaction, a conditional update, and database constraints.

When a user requests a hold, the service performs this inside one database transaction:

```sql
BEGIN;

UPDATE seats
SET status = 'HELD',
    held_by_user_id = :user_id,
    hold_expires_at = :expires_at,
    version = version + 1
WHERE id IN (:seat_ids)
  AND event_id = :event_id
  AND status = 'AVAILABLE';

-- If the number of updated rows is not equal to the requested seat count,
-- roll back and return 409 CONFLICT.

INSERT INTO seat_holds (id, user_id, event_id, status, expires_at)
VALUES (:hold_id, :user_id, :event_id, 'ACTIVE', :expires_at);

INSERT INTO seat_hold_items (hold_id, seat_id)
VALUES (:hold_id, :seat_id), (:hold_id, :seat_id_2);

COMMIT;
```

The key is the condition `status = 'AVAILABLE'`. If two users try to hold the same seat at the same time, only one `UPDATE` can change that row from `AVAILABLE` to `HELD`. The other transaction sees zero updated rows and is rejected.

At payment time, the system uses another atomic transaction:

```sql
BEGIN;

UPDATE seats
SET status = 'SOLD',
    held_by_user_id = NULL,
    hold_expires_at = NULL,
    version = version + 1
WHERE id IN (:seat_ids)
  AND status = 'HELD'
  AND held_by_user_id = :user_id
  AND hold_expires_at > NOW();

-- If updated rows do not match, roll back and cancel the order.

UPDATE seat_holds
SET status = 'CONVERTED'
WHERE id = :hold_id AND status = 'ACTIVE';

INSERT INTO orders (...);
INSERT INTO tickets (...);

COMMIT;
```

Additional protections:

- `seats.status` uses a database-level state machine: `AVAILABLE -> HELD -> SOLD`.
- A unique index on `tickets.seat_id` makes it impossible to insert two valid tickets for the same seat.
- Expired holds are released by a scheduled job or lazily checked when the seat map or payment is accessed.
- Payment confirmation is idempotent: if a payment webhook arrives twice, the system recognizes the existing order and does not create duplicate tickets.
- A distributed lock or Redis-based reservation key can reduce wasted work before the database transaction, but the database transaction and unique constraint remain the final source of truth.

## 6. Architecture

```text
                       Users
                         |
                  CDN / Static Assets
                         |
                    API Gateway
              (TLS, auth, rate limiting)
                         |
                  Load Balancer
                   /            \
          Web/API service      Queue service
             |                       |
      Read replicas             Message queue
      for event/seat maps           |
             |                  Order workers
        Primary database <-----------+
             |                       |
       Seat inventory          Payment provider
       and transactions             |
                                Webhooks
```

### Components

- **CDN:** Serves static website files, images, JavaScript bundles, and seat-map layout assets. This removes most load from application servers.
- **API gateway:** Terminates TLS, authenticates users, applies rate limits, and blocks obvious bot traffic.
- **Load balancer:** Distributes requests across multiple stateless API instances.
- **Event/browse service:** Handles event search and event details. It can use caching and read replicas because this data changes infrequently.
- **Seat-map service:** Returns seat availability. It uses a short-lived cache, such as 1–3 seconds, during a major sale. A slightly delayed seat map is acceptable; incorrect sales are not.
- **Queue service:** During a popular sale, purchase requests enter a fair virtual waiting room and queue instead of directly hammering the database.
- **Order workers:** Process queued hold and payment requests in controlled batches. They execute the transactional seat updates.
- **Primary database:** Stores users, events, seats, holds, orders, and tickets. All seat status changes and ticket creation happen here inside transactions.
- **Read replicas:** Serve browsing and reporting traffic so reads do not compete with purchase transactions.
- **Cache:** Stores event details and seat-map snapshots. Cache entries are invalidated or shortened when inventory changes.
- **Message queue:** Handles asynchronous work such as emails, QR-code generation, payment webhooks, and expired-hold cleanup.
- **Payment provider:** Processes card payments securely. TicketHub never stores raw card numbers.
- **Monitoring and alerts:** Track request latency, error rates, queue depth, database lock contention, payment failures, and seat-inventory anomalies.

### Surviving the big sale

1. **Waiting room:** When the sale opens, users enter a virtual queue. Only a controlled number of users reach the seat-selection and checkout flow at once.
2. **Rate limiting:** Each user and IP address has request limits. This reduces automated refreshing and protects the database.
3. **Read/write separation:** Seat-map browsing is served from cache and read replicas; purchases go to the primary database.
4. **Queue-based checkout:** Instead of allowing 200,000 simultaneous checkout requests, workers process a manageable number of transactions at a time.
5. **Short seat holds:** A 10-minute hold keeps inventory moving and prevents people from permanently blocking seats.
6. **Graceful degradation:** If seat-map updates become slow, the system can show a cached map with a “availability may be delayed” notice while preserving correct purchase behavior.
7. **Autoscaling:** API servers and workers scale horizontally. The database remains the carefully protected consistency boundary.

## 7. Trade-offs

### Trade-off 1: Real-time seat maps versus system stability

Showing seat availability with zero delay would require every seat-map request to read current inventory from the primary database. During a major sale, that could overwhelm the database.

Instead, TicketHub uses a short cache and read replicas. Users may occasionally see a seat as available after it has just been held. The trade-off is a slightly less “live” seat map in exchange for much better stability and correctness. The hold request still checks the database transactionally, so no seat is sold twice.

### Trade-off 2: Fair queueing versus immediate checkout

A waiting room makes the sale fairer and protects the system, but users who arrive early may have to wait before choosing seats. This is less exciting than instant checkout.

The benefit is that TicketHub can control how many people enter checkout, prevent database overload, and reduce the advantage of bots. The cost is added complexity and a longer perceived wait.

### Trade-off 3: Strong consistency versus performance

Using strict database transactions for every seat change guarantees correctness but creates contention when many people target the same popular section.

An eventually consistent design would be faster but could allow temporary overselling or complicated compensation logic. TicketHub chooses strong consistency for the critical seat transition, while using eventual consistency for non-critical actions such as emails, analytics, and cache updates.

### Trade-off 4: Individual seats versus general-admission inventory

Individual seat maps give customers control but create many rows and more lock contention. General-admission ticket pools are simpler and scale better, but customers cannot choose exact seats.

TicketHub uses individual seats because seat selection is central to the product. For very high-demand events, organizers could offer a general-admission section as a performance-friendly alternative.
