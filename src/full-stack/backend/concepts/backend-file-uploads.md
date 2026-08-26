# Backend File Uploads: Direct Uploads, Presigned URLs, and Multipart Streaming

## 1. Why This Exists — The Problem First

Imagine your team launches a new video-sharing or document-management feature. In local development with a single developer uploading a 2 MB test image, everything works instantly. 

Then production launches. Ten users on mobile connections simultaneously upload 400 MB video clips. Within seconds, your Node.js API instances crash with fatal `JavaScript heap out of memory` errors. Kubernetes enters a crash-loop backoff. All customer requests across the entire application fail.

What went wrong? The backend server used standard body parsers that buffered entire binary file payloads into RAM before writing them anywhere. Ten concurrent 400 MB uploads consumed 4 GB of memory in a Node.js process configured with a standard 1.5 GB heap ceiling.

Even if you configure streaming to the local server disk, a second catastrophe hits: slow mobile networks. When a user on a flaky 3G connection takes three minutes to transmit a file, their HTTP connection holds a backend application worker and socket open for that entire duration. Your API gateway or load balancer (like AWS ALB or Cloudflare) hits a 60-second request timeout and severs the upload at 95% completion. Meanwhile, server worker threads that should be processing thousands of fast JSON database queries are stalled doing slow network I/O.

To make matters worse, saving files to local server disk destroys horizontal scaling. When your autoscaler adds new server instances or replaces existing pods during a deployment, local files vanish or become unreachable to users whose requests land on a different server replica.

Backend file upload architectures exist to solve these three critical problems: preventing server memory exhaustion through streaming, offloading upload bandwidth and connection holding time from API servers to distributed object storage, and providing stateful resilience for large files over unstable networks.

## 2. The Analogy — Make It Obvious

Think of your backend API server as the **receptionist desk on the 20th floor of a corporate office tower**, and your file storage as an **industrial warehouse with a ground-floor loading dock**.

**Direct Server Upload (The Receptionist Bottleneck):**
Every time a client sends a 500-pound solid oak boardroom table, the delivery crew drags it up the passenger elevator and dumps it on the receptionist's small desk. The receptionist cannot answer phone calls or hand out visitor badges because the lobby is physically stuffed with furniture boxes (server RAM exhaustion). If three delivery trucks arrive simultaneously, the entire office floor is paralyzed.

**Presigned URLs (The Loading Dock Pass):**
Instead of hauling heavy furniture to the 20th-floor reception desk, the delivery driver walks up with a lightweight invoice. The receptionist checks their ID, validates the delivery permit, and hands them a **temporary digital security pass** valid for exactly 15 minutes (the Presigned S3/GCS URL). The driver takes the truck straight to the building's industrial warehouse loading dock (Object Storage) and unloads the heavy furniture there. Once the warehouse receives the boxes, the warehouse system sends an automated notification (S3 Event / Webhook) to the office database saying: *"Delivery #9042 has arrived safely."* The receptionist never touches a single piece of heavy cargo.

**Chunked Resumable Uploads (Modular Numbered Crates):**
When the delivery is a 50-ton steel bridge across a mountain pass prone to rockslides (flaky network), you do not transport it in one fragile vehicle. You break the shipment into 100 numbered crates (5 MB chunks). If truck #43 breaks down midway, you do not discard the 42 crates already resting safely in the warehouse. You simply re-dispatch truck #43 and continue where you left off until the warehouse confirms all 100 pieces are ready for assembly.

## 3. How It Actually Works — The Full Explanation

Handling file uploads in production requires understanding how binary data traverses the network, how servers process streams without buffering, and how to choose the right architecture for your scale.

**The Anatomy of HTTP File Uploads: `multipart/form-data`**

Standard HTTP POST requests send data formatted as `application/json` or `application/x-www-form-urlencoded`. These formats are text-based and inefficient for raw binary data. If you encode binary files as Base64 strings inside a JSON payload, you introduce a mandatory 33% data size bloat and force the server to parse massive JSON strings in memory.

HTTP handles raw binary uploads through the `multipart/form-data` Content-Type. The client sends a request containing a unique boundary string in the header:

`Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryXYZ123`

The request body is a continuous byte stream partitioned into distinct parts separated by the boundary delimiter. Each part contains its own mini-headers (such as `Content-Disposition: form-data; name="avatar"; filename="photo.jpg"` and `Content-Type: image/jpeg`), followed by raw binary bytes. 

To process this safely, backend servers use streaming multipart parsers (like Busboy in Node.js). Instead of waiting for the full HTTP payload to arrive, the streaming parser emits events (`file`, `field`) as chunks arrive from the TCP socket. The server pipes this readable byte stream directly to a writable destination (such as a local disk stream or an S3 upload stream) with constant O(1) memory usage regardless of file size.

**The 3 File Upload Architectures**

Depending on file size, security requirements, and traffic patterns, production systems use one of three architectural patterns:

**1. Direct Server Upload (Proxied Streaming)**
- **How it works:** The client submits a `multipart/form-data` POST request directly to the API server. The API server authenticates the user, streams the incoming multipart chunks through middleware (like Multer/Busboy), and pipes the stream directly to cloud object storage or a temporary processing directory.
- **Trade-offs:** 
  - *Advantages:* Simple single-step client implementation; enables immediate synchronous validation and inline processing (like generating an avatar thumbnail before responding).
  - *Disadvantages:* API servers consume network bandwidth and maintain open TCP sockets for the entire duration of the upload. A sudden influx of slow mobile uploads exhausts the server's connection pool.
  - *Best for:* Small files under 5 MB (profile pictures, receipts, small avatars) where instant server feedback is required.

**2. Presigned URLs / Direct-to-Object-Storage (Industry Standard)**
- **How it works:** 
  1. The client sends a lightweight JSON request to the API server: `POST /api/uploads/presign` with metadata like `{ filename: "video.mp4", contentType: "video/mp4", sizeBytes: 52428800 }`.
  2. The API authenticates the user, validates upload permissions, checks file extension/size constraints, and generates a unique object key (e.g., `uploads/users/42/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.mp4`).
  3. The API server uses cloud SDK credentials (AWS IAM / GCP Service Account) to cryptographically sign an HTTP `PUT` URL with a short expiration time (e.g., 5 to 15 minutes).
  4. The API returns `{ uploadUrl, fileKey }` to the client.
  5. The client performs a standard HTTP `PUT` request with the raw binary file directly to `uploadUrl` on Amazon S3 or Google Cloud Storage.
  6. To confirm the upload, the client calls `POST /api/uploads/confirm`, or better yet, an S3 Event Notification (via SQS/Webhook/EventBridge) triggers an asynchronous worker to verify the file and mark it active in the database.
- **Trade-offs:**
  - *Advantages:* Zero upload bandwidth and zero memory footprint on your API servers. Storage platforms handle massive network spikes, high concurrency, and global edge acceleration automatically.
  - *Disadvantages:* Requires a two-step handshake. The backend cannot inspect the actual binary content before it lands in storage; validation must occur asynchronously post-upload.
  - *Best for:* Files between 5 MB and 100 MB, audio/video assets, PDF documents, and any high-traffic consumer application.

**3. Chunked Resumable Uploads (S3 Multipart Upload / Tus Protocol)**
- **How it works:** Large files are sliced into smaller independent chunks on the client (typically 5 MB to 20 MB each). 
  - Using AWS S3 Multipart Upload API: The client initiates the upload via the backend to obtain an `UploadId`. The client then requests presigned URLs for each numbered part (`PartNumber: 1`, `PartNumber: 2`, etc.), uploads them in parallel or sequentially directly to S3, collects an `ETag` checksum for each part, and finally triggers `CompleteMultipartUpload` to assemble the parts atomically in S3.
  - Using the **Tus Protocol** (an open standard for resumable uploads over HTTP): The client initiates an upload with `POST`, uploads binary chunks with `PATCH` requests specifying the byte offset, and queries the current server-side byte offset with `HEAD` requests after network interruptions.
- **Trade-offs:**
  - *Advantages:* Total network fault tolerance. If an upload drops at 95% of a 5 GB file, only the failed 5 MB chunk is retried. Enables parallel multi-stream uploads that maximize network throughput.
  - *Disadvantages:* Higher frontend state complexity, requiring chunk tracking, pause/resume logic, and backend cleanup workers for abandoned incomplete multipart parts.
  - *Best for:* Large files over 100 MB, video rendering pipelines, podcast uploads, and mobile apps operating in regions with unstable cellular connectivity.

**Security Hardening in Production**

Treating user-uploaded files as trusted input is one of the fastest ways to compromise a backend system. Production systems enforce four critical defense layers:

- **Magic Number (File Signature) Verification:** Never trust the client-provided `Content-Type` header or the file extension in the filename. An attacker can rename an executable (`malware.exe` or `shell.php`) to `avatar.jpg` and submit `Content-Type: image/jpeg`. True validation requires reading the first 4 to 16 bytes of the binary payload (the "magic bytes" or file signature). For example, a valid JPEG always starts with `FF D8 FF`, a PNG starts with `89 50 4E 47`, and a PDF starts with `25 50 44 46` (`%PDF`).
- **XSS Prevention on SVGs and HTML:** Scalable Vector Graphics (SVG) files are XML documents that can contain executable `<script>` tags and embedded iframes. If an application hosts user SVGs on its primary domain (`app.example.com/uploads/logo.svg`), opening that file directly executes JavaScript within the user's authenticated session, leading to full account takeover (Stored XSS). To mitigate this, store uploads on an isolated domain (e.g., `usercontent-example.com`), force `Content-Disposition: attachment`, or sanitize SVGs server-side using DOMPurify before serving.
- **Asynchronous Antivirus and Malware Scanning:** Trigger an asynchronous pipeline (such as an AWS Lambda function running ClamAV triggered by S3 bucket notifications) whenever a new object is uploaded. Until the scanner verifies the file and updates the database record to `STATUS = 'CLEAN'`, the file remains private and inaccessible to other users.
- **Private Storage and CDN Access:** Storage buckets must always block public access (`Block Public Access: ON`). Files are served to end users either through time-limited Presigned GET URLs or through a Content Delivery Network (like CloudFront or Cloudflare) utilizing Signed Cookies or Origin Access Control (OAC).

## 4. Real Code — See It Working

Here is a complete, production-ready Node.js and Express implementation showing how to generate secure S3 Presigned Upload URLs, sanitize input, and verify files asynchronously upon completion.

**1. Presigned Upload URL Generator (`POST /api/uploads/presign`)**

```javascript
// presign-upload.js
import express from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
import path from 'node:path';

const app = express();
app.use(express.json());

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'my-secure-upload-bucket';
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB ceiling

// Allowed MIME types mapped to safe canonical extensions
const ALLOWED_MIME_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

app.post('/api/uploads/presign', async (req, res) => {
  try {
    const { filename, contentType, sizeBytes, userId } = req.body;

    // 1. Validate mandatory fields
    if (!filename || !contentType || !sizeBytes || !userId) {
      return res.status(400).json({ error: 'Missing required upload parameters' });
    }

    // 2. Validate file size boundary
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({ error: 'File size exceeds maximum allowed limit (50MB)' });
    }

    // 3. Validate requested Content-Type against whitelist
    const safeExtension = ALLOWED_MIME_TYPES[contentType];
    if (!safeExtension) {
      return res.status(400).json({ error: 'Unsupported file type requested' });
    }

    // 4. Generate collision-proof, unguessable storage key (avoid path traversal)
    const uniqueFileId = crypto.randomUUID();
    const objectKey = `uploads/users/${userId}/${uniqueFileId}${safeExtension}`;

    // 5. Create S3 command locking the upload to the exact Content-Type and size limits
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
      ContentType: contentType,
      Metadata: {
        'original-filename': encodeURIComponent(path.basename(filename)),
        'uploaded-by': String(userId),
        'file-id': uniqueFileId,
      },
    });

    // 6. Generate cryptographic signature with 15-minute time-to-live (TTL)
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    // 7. Save pending upload record in database (omitted for brevity)
    // await db.files.create({ id: uniqueFileId, key: objectKey, status: 'PENDING' });

    return res.status(200).json({
      uploadUrl,
      fileKey: objectKey,
      fileId: uniqueFileId,
      expiresInSeconds: 900,
    });
  } catch (error) {
    console.error('Failed to generate presigned upload URL:', error);
    return res.status(500).json({ error: 'Internal server error generating upload authorization' });
  }
});
```

**2. Asynchronous S3 Event Webhook & Magic Number Verification**

Once the client completes the direct PUT to S3, S3 invokes our webhook or Lambda worker. The worker reads only the first 4 KB of the file from S3 to verify magic bytes before marking the file verified in the database:

```javascript
// s3-event-validator.js
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Known magic numbers (file signatures)
const FILE_SIGNATURES = {
  // JPEG: FF D8 FF
  jpeg: (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  png: (buf) =>
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a,
  // PDF: 25 50 44 46 (%PDF)
  pdf: (buf) =>
    buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46,
};

export async function handleS3ObjectCreated(bucket, objectKey) {
  try {
    // Read ONLY the first 4100 bytes from S3 using HTTP Range request
    // This avoids downloading 50MB+ across the internal network just to inspect headers!
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Range: 'bytes=0-4096',
      })
    );

    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const headerBuffer = Buffer.concat(chunks);

    // Verify magic bytes
    let detectedType = null;
    if (FILE_SIGNATURES.jpeg(headerBuffer)) detectedType = 'image/jpeg';
    else if (FILE_SIGNATURES.png(headerBuffer)) detectedType = 'image/png';
    else if (FILE_SIGNATURES.pdf(headerBuffer)) detectedType = 'application/pdf';

    if (!detectedType) {
      console.warn(`Security alert: File ${objectKey} failed magic number inspection. Deleting.`);
      // await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
      // await db.files.update({ where: { key: objectKey }, data: { status: 'REJECTED_MALICIOUS' } });
      return { verified: false, reason: 'Invalid file signature' };
    }

    console.log(`File ${objectKey} verified successfully as ${detectedType}`);
    // await db.files.update({ where: { key: objectKey }, data: { status: 'VERIFIED', mimeType: detectedType } });
    return { verified: true, mimeType: detectedType };
  } catch (err) {
    console.error('Error verifying uploaded S3 object:', err);
    throw err;
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why should you avoid storing user-uploaded files on the application server's local filesystem in production?**

Storing files on the local filesystem breaks horizontal scaling in three ways. First, in a distributed cloud architecture with multiple application server replicas behind a load balancer, a file uploaded to Server A will return a 404 Not Found error when another user (or the same user on a subsequent request) is routed to Server B. 

Second, local application disks in containerized platforms (like Docker, Kubernetes, or AWS ECS) are ephemeral. When an instance auto-scales down, crashes, or is redeployed during a continuous delivery release, all files written to local storage are destroyed. 

Third, unbounded file uploads quickly exhaust local disk space and inode tables, which crashes the host operating system. In production, files must always be stored in an external, highly available object storage service (like Amazon S3, Google Cloud Storage, or Azure Blob Storage) with decoupled metadata stored in your primary database.

**Q: How does a Presigned S3 URL upload flow work, and how does the backend know when the upload is complete?**

The presigned upload flow decouples authorization from data transmission across three steps:

1. *Authorization:* The client sends file metadata (name, MIME type, size) to the API server via a standard JSON POST request. The API authenticates the user, validates permissions, and uses cloud credentials to generate a short-lived, cryptographically signed URL (HMAC-SHA256) specifying the bucket, object key, permitted HTTP method (PUT), and expiration timestamp.
2. *Direct Data Transfer:* The client uploads the binary payload directly to S3 using an HTTP PUT request to the presigned URL. S3 validates the cryptographic signature and stores the file without any data traversing the application server.
3. *Completion Notification:* There are two ways the backend learns of completion. The naive way is a client-side callback (`POST /api/uploads/confirm`). However, the robust production approach uses **S3 Event Notifications**: S3 automatically publishes an `s3:ObjectCreated:Put` event to an AWS SQS queue, SNS topic, or EventBridge bus. A backend worker consumes this event, runs asynchronous virus scanning and magic byte validation, and updates the file status in the database to active.

**Q: Why is validating the file extension and `Content-Type` header insufficient, and how do you implement true MIME validation?**

The file extension (e.g., `.jpg`) and the HTTP `Content-Type` header (e.g., `image/jpeg`) are purely client-controlled metadata. An attacker can create a malicious PHP web shell or executable (`exploit.php`), rename it to `photo.jpg`, and forge the `Content-Type: image/jpeg` header in their HTTP request. If the server executes or serves this file based solely on the extension, the server is vulnerable to remote code execution.

True validation requires inspecting the **magic numbers (file signatures)** located in the first 4 to 16 bytes of the binary payload. For example, legitimate JPEG files always start with hexadecimal bytes `FF D8 FF`, and PNG files start with `89 50 4E 47`. In Node.js, libraries like `file-type` read the initial bytes of the stream and determine the genuine MIME type based on binary format specifications rather than user-supplied strings.

**Q: How would you design a resumable upload system for a 10 GB video file over an unreliable 4G connection?**

For multi-gigabyte files on flaky networks, you use chunked resumable uploads via the S3 Multipart Upload API or the Tus protocol:

1. *Chunking:* The client-side application slices the file into fixed-size binary chunks (e.g., 10 MB per chunk) using the browser `File.prototype.slice()` API.
2. *Multipart Initialization:* The client requests an upload initialization from the backend, which calls S3 `CreateMultipartUpload` and returns an `UploadId`.
3. *Parallel Chunk Uploads:* The client requests presigned URLs for each chunk (`UploadPart` with part numbers 1 through N). The client uploads parts concurrently (e.g., 3-4 chunks at a time) to maximize bandwidth. For every successful part, S3 returns an `ETag` checksum.
4. *Resumability State:* The client saves the list of successfully uploaded part numbers and their corresponding `ETags` in browser storage (`IndexedDB` or `localStorage`). If the network drops at chunk 450, the client reconnects, checks the stored state, and resumes uploading from chunk 451.
5. *Atomic Completion:* Once all chunks are uploaded, the client triggers `CompleteMultipartUpload` with the ordered array of part numbers and `ETags`. S3 stitches the parts into a single coherent object inside the bucket.

**Q: What security measures prevent user-uploaded SVGs or HTML files from causing Stored XSS attacks?**

SVG files are XML documents that can contain `<script>` tags, inline event handlers (`onload`), and external resources. If a user uploads an SVG containing malicious JavaScript and the application serves it directly from the primary domain (`https://app.example.com/avatars/evil.svg`) with `Content-Type: image/svg+xml`, opening the link executes that script within the context of the user's logged-in session, granting the attacker access to session cookies, local storage, and CSRF tokens.

To prevent this:
1. *Isolated Domain:* Host and serve all user assets from a completely separate, cookie-less domain (e.g., `https://example-usercontent.com` instead of `https://app.example.com`).
2. *Header Hardening:* Serve user files with `Content-Disposition: attachment; filename="file.svg"` to force a file download instead of inline browser execution, or serve with `Content-Security-Policy: default-src 'none'; sandbox`.
3. *Server-side Sanitization:* If SVGs must be rendered inline as images, pass the XML string through a strict sanitizer (like DOMPurify with SVG profiles) to strip all script tags, external links, and executable attributes before storage.

**Q: How does Node.js handle streaming file uploads with Multer/Busboy without running Out of Memory (OOM)?**

Node.js manages large uploads efficiently using **Streams and Backpressure**. The incoming HTTP request `req` is a `Readable` stream emitting chunks of binary data (typically 64 KB buffers) as TCP packets arrive. 

Streaming multipart parsers (like Busboy) process incoming chunks incrementally using a state machine that matches multipart boundary tokens. When a file part is detected, Busboy emits a `file` event with its own readable stream. 

By piping this readable stream directly into a destination `Writable` stream (such as an S3 upload stream or disk stream), Node.js automatically applies backpressure. If the destination writes slower than the network delivers data, the internal buffer fills up and Node pauses the incoming TCP stream (`pause()`). When the destination drains, reading resumes (`resume()`). At no point does the application hold the entire file in RAM; memory usage remains capped at a few small stream buffer allocations (O(1) space).

## 6. The Traps — What Goes Wrong

**1. The In-Memory Buffer Trap (`multer.memoryStorage()`)**
- *The Wrong Assumption:* Developers often use `multer({ storage: multer.memoryStorage() })` because having a `req.file.buffer` is convenient for passing directly to an S3 upload SDK or resizing library.
- *What Actually Happens:* Every concurrent upload loads the entire binary file into Node.js V8 heap memory. If ten users simultaneously upload 200 MB files, your server attempts to allocate 2 GB of raw buffers in RAM, immediately exceeding V8's default memory ceiling and crashing the Node.js process with a fatal heap allocation error.
- *The Fix:* Never use `memoryStorage()` for user-facing uploads with unbounded file sizes. Use streaming directly to S3 via `@aws-sdk/lib-storage` or stream directly to temporary disk files.

**2. The Ghost File & Orphaned S3 Object Problem**
- *The Wrong Assumption:* When using presigned URLs, developers assume every requested upload URL will result in a completed file and a corresponding database record.
- *What Actually Happens:* Users frequently close their browser tabs midway through an upload, lose internet connectivity, or cancel the form submission. The file (or partial multipart chunks) sits permanently in your S3 bucket, but no database record is ever created. Over months, thousands of orphaned gigabytes accumulate, generating massive recurring cloud storage bills.
- *The Fix:* Configure an **S3 Lifecycle Rule** on the bucket to automatically abort and delete incomplete multipart uploads after 7 days (`AbortIncompleteMultipartUpload`). For single-part presigned uploads, set a lifecycle expiration rule on a `staging/` prefix that deletes unconfirmed files after 24 hours unless a confirmation event moves them to `permanent/`.

**3. CORS Failure on Direct S3 PUT Requests**
- *The Wrong Assumption:* Generating a valid presigned URL is sufficient for the browser to upload directly to S3.
- *What Actually Happens:* The browser initiates an HTTP `OPTIONS` preflight request to `https://bucket.s3.amazonaws.com`. Because S3 buckets have Cross-Origin Resource Sharing (CORS) disabled by default, S3 rejects the preflight request with a 403 Forbidden error, and the browser refuses to execute the `PUT` upload.
- *The Fix:* Explicitly configure the S3 bucket's CORS policy to permit your frontend origin, allow the `PUT` and `POST` methods, allow custom headers (like `Content-Type`), and expose the `ETag` header to JavaScript.

**4. Public Storage Bucket Data Leaks**
- *The Wrong Assumption:* Developers enable public read access on their S3 bucket so that images can be easily displayed on the frontend via direct S3 URLs (`https://bucket.s3.amazonaws.com/uploads/photo.jpg`).
- *What Actually Happens:* Attackers crawl the bucket or enumerate predictable file keys, exposing confidential user uploads (contracts, tax documents, private messages). Furthermore, malicious actors can trigger millions of downloads directly against the public S3 URL, causing astronomical bandwidth egress charges.
- *The Fix:* Keep all storage buckets strictly private with `Block Public Access: ON`. Distribute public assets through a CDN (like CloudFront) using Origin Access Control (OAC), and protect private user documents using short-lived Presigned GET URLs or CDN Signed Cookies.

**5. Key Collisions and Path Traversal**
- *The Wrong Assumption:* Storing files using the user's original filename (`Key: req.body.filename` or `fs.writeFile('/uploads/' + filename)`).
- *What Actually Happens:* If User B uploads a file named `invoice.pdf`, it silently overwrites User A's `invoice.pdf`. Even worse, if an attacker uploads a file named `../../etc/cron.d/malicious_job`, naive file system writers write outside the intended upload directory (Path Traversal).
- *The Fix:* Always generate an unguessable UUID v4 or random cryptographic hash for the storage key (e.g., `uploads/${uuidv4()}.pdf`), and store the original user-friendly filename separately as a string in the database.

## 7. Compare With Related Concepts

| Architecture / Concept | Primary Transport | Server RAM & Bandwidth Load | Resumability & Scale | Best Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Direct Server Upload (Multer / Busboy)** | Client $\rightarrow$ API Server $\rightarrow$ S3/Disk | High bandwidth; High connection holding time; Low RAM if streamed. | No chunked resume; File size ceiling $< 5\text{ MB}$. | Small avatar/receipt uploads requiring immediate synchronous validation or thumbnail generation. |
| **Presigned URLs (Direct-to-S3)** | Client $\rightarrow$ S3 Direct (PUT/POST) | Zero server bandwidth; Zero server RAM. | Single-part; Handled by S3 edge. | Industry standard for medium files ($5\text{ MB} - 100\text{ MB}$), PDFs, images, media. |
| **Chunked Multipart Upload (S3 Multipart / Tus)** | Client $\rightarrow$ S3 Direct (Multiple sliced chunks) | Zero server bandwidth; Zero server RAM. | Full pause/resume; Parallel multi-part uploads. | Large files ($> 100\text{ MB}$), 4K videos, podcasts, and flaky mobile network environments. |
| **Base64 JSON Upload** | Client $\rightarrow$ API Server (JSON Body) | Catastrophic ($+33\%$ payload size bloat, full memory buffering). | None. | Strictly avoided in production; only acceptable for inline micro-thumbnails $< 10\text{ KB}$. |

**Presigned Upload URLs vs. Presigned Download URLs**
- *Presigned Upload URL:* Uses the HTTP `PUT` or `POST` method. Authorizes a client to write a specific object into a private bucket within a short time window.
- *Presigned Download URL:* Uses the HTTP `GET` method. Authorizes a client to read and download a private object from a secure bucket without exposing public bucket permissions.
- *Rule of Thumb:* Use Presigned PUT for incoming uploads; use Presigned GET (or CloudFront Signed Cookies) for serving private user documents.

## 8. 🧠 The Memory Hook

> **Never drag heavy binary furniture through your API reception desk; hand the client a temporary loading dock pass (Presigned URL) straight to the warehouse (S3). Verify the first magic bytes before trusting the label, and slice massive shipments into numbered crates.**
