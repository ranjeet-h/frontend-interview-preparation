# How do you Handle Large File Uploads

## 1. Why This Exists — The Problem First

A user uploads a 2 GB video. Your Express handler does `const body = await getRawBody(req)` or uses middleware that buffers the entire multipart body in memory. Three users upload at once on a 1 GB RAM container. The OOM killer terminates Node. Every other API request on that instance goes down with it.

Large uploads are not "big strings." They are **long-running byte streams**. The fix is to never hold the whole file in memory — stream chunks from the socket straight to disk or object storage, validate as you go, and enforce limits before the damage is done.

## 2. The Analogy — Make It Obvious

Picture a fire brigade passing buckets of water.

- The river (client) has unlimited water (file data).
- Each person passes one bucket at a time — a chunk — to the next.
- The reservoir (disk or S3) receives water continuously.
- Nobody tries to **move the entire river** into one tank.

At the gate, a guard checks: Is this person allowed in? Is the bucket too heavy (size limit)? Is it actually water, not gasoline (file type)? If someone drops their bucket mid-chain, you mop up the spill (delete partial files).

That is streaming upload handling — move data through, do not hoard it.

## 3. How It Actually Works — The Full Explanation

**The request body is a readable stream.** In Node HTTP, `req` is a `stream.Readable`. Data arrives in TCP chunks. Your job is to pipe or consume those chunks into a destination without accumulating them.

**Multipart parsing.** Browser file uploads use `multipart/form-data`. Raw `req.pipe(fs.createWriteStream())` only works for the entire body as one blob — not for form fields mixed with files. Libraries parse the multipart boundary and expose each file as its own stream:

- **Busboy** — low-level, stream-native, widely used under the hood.
- **Multer** — Express middleware built on Busboy; writes to disk or memory.
- **Formidable** — similar, framework-agnostic.

**The pipeline.**

1. Client starts POST with `Content-Type: multipart/form-data`.
2. Server parses boundaries; each file field becomes a readable stream.
3. That stream pipes to a writable — local temp file or cloud upload stream (S3 `Upload` from `@aws-sdk/lib-storage`).
4. Backpressure slows the read if disk/network is slow — memory stays flat.
5. On success, move/rename the temp file or finalize the multipart upload.
6. On error or client disconnect, delete partial files.

**Validation layers (defense in depth).**

- **Size limit** — reject early via `Content-Length` check and stream byte counter; enforce in parser limits (e.g. Multer `limits.fileSize`).
- **MIME / extension** — check declared type and magic bytes (file signature), not just `.jpg` in the filename.
- **Auth** — only authenticated users can upload.
- **Concurrency** — cap simultaneous uploads per user/IP.
- **Virus scan** — stream through ClamAV or scan after upload before marking file available.

**Cloud storage.** Stream directly to S3/GCS with multipart upload APIs — never download to memory first. The AWS SDK v3 `@aws-sdk/lib-storage` `Upload` class accepts a readable stream.

**Client disconnect.** Listen for `req.on('aborted')` or `fileStream.on('limit')` and delete temp files. Partial uploads fill disk if you do not clean up.

## 4. Real Code — See It Working

**Multer — disk storage with size limit (Express)**

```js
const express = require("express");
const multer = require("multer");

const upload = multer({
  dest: "/tmp/uploads",
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB — WHY: reject before unbounded buffering
    files: 1,
  },
  fileFilter(req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const app = express();

app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ path: req.file.path, size: req.file.size });
});

app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large" });
  }
  next(err);
});
```

**Busboy — raw streaming without buffering the whole body**

```js
const http = require("http");
const busboy = require("busboy");
const fs = require("fs");
const path = require("path");

http.createServer((req, res) => {
  if (req.method !== "POST") return res.end();

  const bb = busboy({ headers: req.headers, limits: { fileSize: 500 * 1024 * 1024 } });

  bb.on("file", (name, fileStream, info) => {
    const dest = path.join("/tmp", `${Date.now()}-${info.filename}`);
    const writeStream = fs.createWriteStream(dest);
    let uploaded = 0;

    fileStream.on("data", (chunk) => {
      uploaded += chunk.length;
    });

    fileStream.on("limit", () => {
      // WHY: busboy stops the stream at limit — delete partial file
      writeStream.destroy();
      fs.unlink(dest, () => {});
      res.writeHead(413);
      res.end("too large");
    });

    fileStream.pipe(writeStream);

    writeStream.on("finish", () => {
      res.writeHead(200);
      res.end(JSON.stringify({ path: dest, bytes: uploaded }));
    });
  });

  req.pipe(bb);
}).listen(3000);
```

**Cleanup on client abort**

```js
function streamToTemp(req, destPath) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(destPath);

    const cleanup = () => {
      writeStream.destroy();
      fs.unlink(destPath, () => {});
    };

    req.on("aborted", cleanup);
    writeStream.on("error", (err) => { cleanup(); reject(err); });

    req.pipe(writeStream);
    writeStream.on("finish", () => resolve(destPath));
  });
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do you handle large file uploads in Node.js?**

Treat the request body as a readable stream. Parse multipart form data with Busboy, Multer, or similar so each file is its own stream. Pipe that stream directly to disk or cloud storage (S3 multipart upload). Enforce size limits in the parser, validate file type, handle errors and client disconnects, and delete partial files on failure. Never buffer the entire upload in memory.

**Q: Why not read the whole file into a Buffer first?**

Memory usage equals file size times concurrent uploads. A few 1 GB uploads on a small VM OOM the process. Streaming keeps memory near one buffer size regardless of file size.

**Q: What validations do you apply?**

Size limits (parser + optional Content-Length pre-check), MIME type and magic-byte validation, authentication, rate/concurrency limits per user, and optionally virus scanning before exposing the file to other users. Validate early — reject before writing gigabytes to disk.

**Q: How do you handle a client disconnect mid-upload?**

Listen for `req` `aborted`/`close` events or parser `limit` events. Destroy the write stream and delete the partial temp file. Without cleanup, failed uploads consume disk until it fills.

**Q: How does the frontend get upload progress?**

The client tracks bytes sent (XHR `upload.onprogress` or Fetch with a ReadableStream wrapper). The server can emit progress via WebSocket or SSE if you need server-side processing stages. Streaming on the server does not automatically give the client progress — that is a client-side concern for outbound bytes.

**Q: Multer memory storage vs disk storage?**

`memoryStorage()` loads the file into a Buffer — fine for small images (avatar), wrong for large files. `diskStorage()` or streaming with Busboy keeps memory bounded. For production large uploads, disk temp + move to S3, or stream straight to S3.

## 6. The Traps — What Goes Wrong

**Buffering the entire body.** `express.raw()`, `body-parser` with huge limits, or Multer `memoryStorage()` on large files — all OOM risks. Use disk or direct cloud streaming.

**No file size limit.** A malicious client sends a 100 GB body. Disk fills, bandwidth saturates. Set parser limits and reject oversize Content-Length early when possible.

**Trusting the filename or MIME from the client.** `virus.exe` renamed to `photo.jpg` with `Content-Type: image/jpeg`. Check magic bytes server-side.

**Leaving partial files on failure.** Every error and abort path must `unlink` the temp file.

**Ignoring backpressure.** Even with streams, writing to a slow disk without respecting drain can buffer heavily. Prefer `pipeline()` or let Multer/Busboy handle it.

**No disk space monitoring.** Uploads succeed until the volume is full, then every write fails. Alert on disk usage above 80%.

## 7. Compare With Related Concepts

**Streaming upload vs presigned S3 URL (direct client upload)**

Presigned URLs let the browser upload straight to S3 — your server never touches the bytes. Best for very large files and scale. Streaming through your server gives you a validation choke point but costs bandwidth and CPU on your boxes.

**Large upload vs chunked/resumable upload (tus, S3 multipart from client)**

Resumable protocols split files into chunks with retry — better for flaky mobile networks. Different problem from server-side streaming, often combined (client sends chunks, server assembles via stream).

**Upload stream vs readable stream (download)**

Upload: client → `req` (readable) → disk/S3 (writable). Download: disk/S3 (readable) → `res` (writable). Same backpressure ideas, opposite direction.

**When to stream through server vs direct to cloud**

Stream through server when you need auth, virus scan, or transformation before storage. Direct presigned upload when files are huge and validation can happen post-upload via async jobs.

## 8. 🧠 The Memory Hook — What Sticks

Large uploads are a **bucket brigade, not a swimming pool**. The HTTP request is a hose — pipe it straight to disk or S3 one chunk at a time, set a max bucket size (file limit), check what is in the bucket (type validation), and mop up spills (delete partial files on abort).
