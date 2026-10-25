# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from people they follow.

## 1. Assumptions

- 10,000,000 registered users, and 10% are active each day.
- Each active user uploads 1 photo per day and views 50 feed pages per day.
- An average photo is 2 MB, and each photo also gets a 50 KB thumbnail.
- One feed page view is one request. Peak traffic is 5x the average.
- A day has 86,400 seconds, and a year has 365 days.
- Sizes use decimal units (1 TB = 1,000,000 MB).

**Daily active users (DAU)** = 10,000,000 x 10% = **1,000,000**

## 2. Estimates

| Measure | Calculation | Result |
|---|---|---|
| Uploads per day | 1,000,000 x 1 | 1,000,000 |
| Uploads per second (average) | 1,000,000 / 86,400 | about 12/s |
| Uploads per second (peak) | 12 x 5 | about 60/s |
| Feed views per day | 1,000,000 x 50 | 50,000,000 |
| Feed views per second (average) | 50,000,000 / 86,400 | about 580/s |
| Feed views per second (peak) | 580 x 5 | about 2,900/s |
| Original photos per year | 1,000,000 x 2 MB x 365 | 730 TB |
| Thumbnails per year | 1,000,000 x 50 KB x 365 | about 18 TB |
| **Total photo storage per year** | 730 TB + 18 TB | **about 750 TB** |

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. There are 50 feed views for every 1 upload, so reads outnumber writes by about 50 to 1.

What this means for the design:
- Make reads cheap with a **CDN** and a **cache**, so most requests never reach the database.
- Add a **read replica** so feed queries do not slow down uploads.
- Keep uploads simple and fast, and move slow work (thumbnails) to the background.

## 4. Why photos do not go in the database

A database is built for small, structured rows, not 2 MB files. Storing photos there makes the database huge, slows queries and backups, costs more, and makes it impossible to serve images through a CDN. Photos belong in **object storage**, which is cheap, scales to petabytes and gives each file a URL. The database stores only the photo's metadata (id, owner, caption, storage key).

## 5. Architecture

```
  User (browser / app)
     |                         +-----------------------------+
     |  photos & thumbnails    |             CDN             |
     +------------------------>| (caches files near users)   |
     |                         +--------------+--------------+
     |  API requests                          | cache miss
     v                                        v
+-----------------+                +----------------------+
|  Load balancer  |                |    Object storage    |
+--------+--------+                | originals+thumbnails |
         |                         +----------+-----------+
   +-----+------+------+                      ^   ^
   v            v      v                      |   |
+------+    +------+ +------+     save        |   | save thumbnail
| App  |    | App  | | App  |  original ------+   |
|server|    |server| |server|                     |
+--+---+    +--+---+ +--+---+                +-----+-----+
   |           |        |                    |  Worker   |
   +-----------+--------+                    +-----+-----+
        |       |      |                           ^
        |       |      |   "make thumbnail"        |
        |       |      +-------------> +-----------+-----------+
        |       |                      |     Message queue     |
        |       |                      +-----------------------+
        |       v
        |  +---------+
        |  |  Cache  |  (feeds, photo details)
        |  +---------+
        v
 +--------------+  replicates   +--------------+
 | DB (primary) |-------------->| Read replica |
 |   writes     |               |    reads     |
 +--------------+               +--------------+
```

## 6. Components

- **CDN:** delivers photos from servers close to the user, so they load fast and the origin servers carry less traffic.
- **Load balancer:** spreads requests across many app servers, so no single server is overloaded and one failure does not stop the app.
- **App servers:** run the SnapShare logic (login, upload, feed) and can be added or removed as traffic changes.
- **Cache:** keeps popular data such as feeds and photo details in memory, so repeated reads skip the database.
- **Database (primary):** stores users, follows and photo metadata reliably, and handles all writes.
- **Read replica:** holds a copy of the database that answers read queries, which takes pressure off the primary.
- **Object storage:** stores the photo files cheaply at huge scale and gives each file a URL.
- **Queue:** holds thumbnail jobs so the upload request can finish without waiting for the slow work.
- **Worker:** takes jobs from the queue and creates the thumbnails in the background.

## 7. Upload flow

1. The user selects a photo, and the app sends it to the load balancer.
2. The load balancer forwards the request to an app server.
3. The app server checks that the user is logged in and that the file is a valid image of an allowed size.
4. The app server saves the original photo in object storage under a unique key, for example `originals/2026/10/9812.jpg`.
5. The app server writes a row in the database (the primary) with the owner, the original's storage key and the status `processing`. The database returns the new `photo_id`, for example 9812.
6. **The app server pushes a message to the queue.** The message is small and holds only references, never the photo itself:
   ```json
   {
     "job": "create_thumbnail",
     "photo_id": 9812,
     "original_key": "originals/2026/10/9812.jpg",
     "thumbnail_key": "thumbnails/2026/10/9812.jpg"
   }
   ```
   The queue stores the message safely and confirms it has received it. If the push fails, the row stays at `processing`, and a clean-up job later finds old `processing` rows and queues them again.
7. The app server replies "upload successful" straight away, so the user does not wait for the thumbnail.
8. A worker takes the next message from the queue. The queue hides that message from other workers for a short time, so two workers do not do the same job.
9. The worker downloads the original from object storage using `original_key` and resizes it to a thumbnail of about 50 KB.
10. The worker saves the thumbnail in object storage under `thumbnail_key`.
11. **Only after the thumbnail is safely stored, the worker updates the database.** It sends a write to the primary:
    ```sql
    UPDATE photos
    SET thumbnail_key = 'thumbnails/2026/10/9812.jpg', status = 'ready'
    WHERE id = 9812;
    ```
    The read replica copies this change a moment later.
12. The worker tells the queue the job is done, and the queue deletes the message.
13. The cache entries for followers' feeds are refreshed, and the photo and thumbnail are served through the CDN.

**If something goes wrong:**
- If the worker crashes before step 12, the message becomes visible again and another worker retries it. The retry is safe because it writes the same thumbnail file and sets the same status.
- If a job fails several times, the queue moves the message to a "failed jobs" list, and the worker sets the row's status to `failed` so the problem can be investigated.

## 8. Trade-offs

- **Cache speed vs fresh data:** the cache makes feeds fast, but a user may see slightly old data until the cache expires or is refreshed. A short expiry time keeps it fresher but gives fewer cache hits.
- **Read replica lag:** reads from the replica are fast and protect the primary, but the replica can be a moment behind. A user may upload a photo and not see it in their feed for a second.
- **Background thumbnails vs instant thumbnails:** the queue keeps uploads fast and survives traffic spikes, but a new photo may show a placeholder until the worker finishes. Doing it during the upload would be simpler but slower.
- **Cost vs performance:** a CDN and extra servers make the app faster and more reliable, but add monthly cost and more parts to maintain. At about 750 TB of new photos per year, storage cost also grows steadily.
