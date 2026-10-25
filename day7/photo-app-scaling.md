# SnapShare: Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from people they follow. This document estimates the load and designs an architecture that can handle it.

## 1. Assumptions

Starting facts:
- 10 million registered users
- 10% of users are active each day
- Each active user uploads 1 photo per day
- Each active user views 50 feed pages per day
- An average photo is 2 MB, and each photo also gets a 50 KB thumbnail

My extra assumptions:
- One day has 86,400 seconds, and a year has 365 days.
- Traffic is spread evenly over the day for the average figures. Peak traffic is 5 times the average.
- One feed page view is one request to the API. The images on the page are served separately by the CDN.
- Sizes use decimal units (1 MB = 1,000,000 bytes, 1 TB = 1,000,000 MB).
- Backups and extra copies of the data are ignored in the basic estimate (see the note under storage).

**Daily active users (DAU)**

10,000,000 registered users × 10% = **1,000,000 DAU**

## 2. Estimates

### Uploads per second

- Uploads per day: 1,000,000 users × 1 photo = 1,000,000 photos/day
- Average: 1,000,000 ÷ 86,400 ≈ **11.6 uploads/second**
- Peak (5×): 11.6 × 5 ≈ **58 uploads/second**
- At peak this is about 58 × 2 MB ≈ 116 MB/s of incoming photo data.

### Feed views per second

- Feed views per day: 1,000,000 users × 50 = 50,000,000 views/day
- Average: 50,000,000 ÷ 86,400 ≈ **579 views/second**
- Peak (5×): 579 × 5 ≈ **2,900 views/second**

### Storage per year

- Originals per day: 1,000,000 × 2 MB = 2 TB/day
- Thumbnails per day: 1,000,000 × 50 KB = 50 GB/day
- Total per day: about 2.05 TB
- Originals per year: 2 TB × 365 = 730 TB
- Thumbnails per year: 50 GB × 365 ≈ 18.25 TB
- **Total photo storage per year: about 748 TB (roughly 0.75 PB)**

Note: if the storage service keeps 3 copies of every file for safety, this becomes about 2.2 PB per year.

For comparison, the photo metadata (owner, caption, time, file path) is about 1 KB per photo. That is about 1 GB/day, or roughly 365 GB/year. This is tiny compared with the photo files themselves.

## 3. Read-heavy or write-heavy?

**SnapShare is read-heavy.** Feed views (about 579/second) outnumber uploads (about 11.6/second) by about **50 to 1**.

What this means for the design:
- Optimise the read path first: use a CDN for images, a cache for feeds and metadata, and read replicas for the database.
- Reads can be cached and copied, so adding more read capacity is cheap and easy.
- Writes are fewer but heavy (2 MB each), so they must not slow readers down. We store the files in object storage and do slow work (thumbnails) in the background through a queue.

## 4. Why photos should not be stored in the database

- **Size:** the photos add about 748 TB per year, while the useful metadata is only about 365 GB per year. Putting files in the database would make it hundreds of times bigger than it needs to be.
- **Speed:** large binary files slow down queries, backups, restores and replication, and they fill the database's memory cache with images instead of useful rows.
- **Cost:** database storage is much more expensive per terabyte than object storage.
- **Delivery:** databases cannot serve files to browsers over HTTP or work with a CDN, but object storage can.

**Instead:** store the photo files (originals and thumbnails) in **object storage** (such as Amazon S3). The database only keeps each photo's metadata and its file path or URL.

## 5. Architecture diagram

```
                     Users (mobile app / web browser)
                        |                      ^
            API requests|                      | images (photos and thumbnails)
                        v                      |
                 +-----------------+           |
                 |  Load Balancer  |      +----------+
                 +-----------------+      |   CDN    |
                  |       |       |       +----------+
                  v       v       v            ^
             +-------+ +-------+ +-------+     | on cache miss
             | App   | | App   | | App   |     |
             | Server| | Server| | Server| ... |
             +-------+ +-------+ +-------+     |
               | |  |                          |
   +-----------+ |  +---------------------+    |
   |             |                        |    |
   v             v                        v    |
+-------+   +-----------+   +--------------------------+
| Cache |   | Database  |   |     Object Storage       |
|(Redis)|   | (Primary) |   |  originals + thumbnails  |
+-------+   +-----------+   +--------------------------+
                  |                     ^   ^
          replicate|                    |   |
                  v                     |   |
            +-----------+               |   |
            | Read      |               |   |
            | Replica   |               |   |
            +-----------+               |   |
                                        |   |
   App Server --(1 message per photo)-> +-------+      +---------------+
                                        | Queue | ---> | Thumbnail     |
                                        +-------+      | Worker(s)     |
                                                       +---------------+
                                                        reads original, writes
                                                        thumbnail, updates DB
```

How the paths work:
- **Reading the feed:** App server checks the cache, then the read replica. Photo files come from the CDN, which fetches from object storage on a cache miss.
- **Writing (uploading):** App server saves the file to object storage, writes metadata to the primary database, and puts a message on the queue.

## 6. What each component does

- **CDN (Content Delivery Network):** keeps copies of photos and thumbnails in locations close to users, which makes images load fast and takes most of the image traffic away from our servers.
- **Load balancer:** spreads incoming requests across many app servers so that no single server is overloaded, and sends traffic only to healthy servers.
- **App servers:** run the SnapShare logic (login, uploading, building the feed) and can be copied as needed because they keep no user data of their own.
- **Cache (for example Redis):** keeps popular feeds and metadata in memory, so repeated requests are answered in milliseconds without touching the database.
- **Primary database:** stores the metadata (users, follows, photo details) and is the only place that accepts writes, which keeps the data consistent.
- **Read replica:** holds a copy of the primary database and answers read queries, so that the large number of feed reads does not slow down writes.
- **Object storage:** stores the photo files cheaply, durably and almost without limit, and serves them over HTTP to the CDN.
- **Queue:** holds "make a thumbnail" jobs so that the upload request can finish immediately instead of waiting for slow image processing, and so that no job is lost during traffic spikes.
- **Thumbnail worker:** takes jobs from the queue, creates the 50 KB thumbnail and saves it, and more workers can be added when the queue grows.

## 7. Upload flow, step by step

1. The user picks a photo in the app and taps **Upload**. The app sends it to the API.
2. The **load balancer** passes the request to one of the **app servers**.
3. The app server checks that the user is logged in and that the file is a valid image within the size limit.
4. The app server saves the **original photo** to **object storage** and gets back its file path.
5. The app server writes a new row to the **primary database** (photo id, user id, caption, time, file path) with the status `processing`.
6. The app server puts a message on the **queue**, such as `{ photo_id: 123, path: "originals/123.jpg" }`.
7. The app server immediately returns `201 Created` to the user, so the upload feels fast. The user does not wait for the thumbnail.
8. A **thumbnail worker** takes the message from the queue and downloads the original from object storage.
9. The worker creates a 50 KB thumbnail and saves it to object storage.
10. The worker updates the photo's row in the database: the thumbnail path is set and the status becomes `ready`. If the job fails, the message goes back to the queue and is retried.
11. The relevant cached feeds are cleared or updated so that followers can see the new photo.
12. Followers open their feed. The app returns the metadata (from cache or the read replica), and their devices load the thumbnails through the **CDN**.

## 8. Trade-offs

- **Cache: speed versus freshness.** The cache makes feeds fast and protects the database, but cached data can be slightly out of date. A new photo might not appear in a follower's feed until the cache expires or is cleared. We accept this, because a feed that is a few seconds old is fine, and we reduce it by clearing cache entries after uploads.
- **Read replica: scale versus consistency.** Replicas let us serve thousands of reads per second, but copying data takes a short time (replication lag). A user could upload a photo and then not see it straight away if their next read hits a replica that is behind. One fix is to read the user's own recent uploads from the primary database.
- **Queue and worker: fast uploads versus delayed thumbnails.** Uploads return quickly and traffic spikes are handled smoothly, but the thumbnail is not ready for a few seconds. The app can show a placeholder or the original until the status is `ready`. The system also becomes more complex, because we now have to monitor the queue and handle failed jobs.
- **CDN: performance versus cost and control.** A CDN makes images load faster worldwide and removes a large share of the traffic from our servers, but it is an extra paid service. Cached images can also stay visible for a while after a user deletes them, unless we clear the CDN cache.
- **Object storage: low cost versus extra complexity.** Storing 748 TB in object storage is far cheaper than using the database, but the database and storage can disagree (for example, a file saved but the database write fails). We have to handle this with clean-up jobs or by saving the file first and recording it afterwards.
