# File Upload Fails for Large Files — How Will You Fix It

## 1. The Real-World Problem — When You Actually Hit This

Your app has been live for months. Users upload profile photos, 2 MB invoices, everything works. Then someone tries to upload a 400 MB training video. The spinner goes for 30 seconds, then fails. Sometimes it is a `413 Payload Too Large`. Sometimes it is a `504 Gateway Timeout`. Sometimes the server just crashes and restarts, and all other requests hang for a few seconds.

The same endpoint that was perfect in development with 100 test files now dies in production. The support ticket says "upload is broken" but only for large files. What happened? Three things that were invisible with small files suddenly matter: your reverse proxy has a default size limit, your app server is trying to hold the entire file in memory at once, and the network is slow enough that the connection times out before the whole file arrives.

A junior fix is "increase the limit to 1 GB." That hides the error for a week and then the server runs out of memory and crashes harder. A senior fix understands why large files need a completely different path through the system than small ones.

## 2. The Analogy — Make the Mechanic Obvious

Think of moving books from your apartment to a warehouse.

Buffering is trying to stack every book in your living room at once before you move any of them. If you have 10 books, your table holds them and it works. If you have 10,000 books, the table collapses, the door is blocked, and no one can walk through the apartment. That is what happens when your Node or Python server does `await file.read()` or uses in-memory multer on a 500 MB file — you ask a single server with 512 MB of RAM to hold the whole thing at once.

Streaming is a conveyor belt from your door to the truck. One pile of books goes out, then the next. The apartment never holds more than one box at a time. Memory stays flat whether the total is 5 MB or 5 GB.

Backpressure is what happens when the truck is loading slower than you are pushing boxes. A good conveyor belt has a sensor — when the truck is full, the belt pauses. A bad system keeps pushing and boxes pile up on the floor until the room overflows. Node streams and proper Python async iteration do that pausing for you. `await file.read()` does not.

Chunked resumable upload is numbering every box 1 to 100 and checking them off a list. If the truck breaks down after box 42, you only resend boxes 43 to 100. If you did not number them, you would have to restart from box 1 every time the network blips.

A presigned S3 URL is different again. Instead of carrying every box through your tiny apartment hallway to get to the warehouse, you give the mover a temporary signed key to the warehouse loading dock. They drive straight there. Your apartment never sees the boxes at all. That is what a presigned PUT URL does — the browser uploads directly to S3 without the data ever passing through your app server.

Nginx `client_max_body_size` is the security gate at the entrance to your building. By default the gate says "nothing taller than 1 meter passes." A couch gets rejected at the gate even before it reaches your apartment. You have to explicitly tell the gate to allow bigger items.

## 3. The Full Explanation — How It Actually Works

Start with why small files hid all the problems. A small file fits in one TCP packet burst, fits in your app's memory buffer, and finishes before any timeout fires. A large file exposes every limit in the chain: client to Nginx to app to disk or S3, and each hop has its own memory, timeout, and size rule.

The first limit people hit is Nginx. The directive `client_max_body_size` defaults to `1m`. If a request body is larger than that, Nginx rejects it early with `413 Payload Too Large` and your app code never even runs. That is intentional — it protects your app from being flooded. But you have to set it explicitly where it matters, in the right `http`, `server`, or `location` block. Setting it only at the `http` level and then overriding it lower can surprise you. You also need to think about `client_body_buffer_size` which controls whether Nginx holds the body in memory or spills it to disk, and `proxy_read_timeout` and `client_body_timeout` which decide how long Nginx waits for a slow upload before cutting it off.

Behind Nginx is your app. Here the key choice is buffering versus streaming.

Buffering means "read the whole thing, hold it, then process it." In Node, that is `multer` with `memoryStorage`, or doing `const buf = await readFile(req.file.path)`, or `let data = ''; req.on('data', c => data += c)` and then processing only at `end`. In Python FastAPI, that is `content = await file.read()` where `file` is an `UploadFile`. With a 50 MB file this seems fine. With a 1 GB file on a 512 MB container, the process runs out of memory, garbage collection stalls, the event loop blocks, and health checks fail. Everyone's requests suffer.

Streaming means "handle a little bit at a time and pass it on." Data arrives in chunks, you pipe each chunk to its destination — disk, S3, a transform — and then you forget that chunk. Memory stays constant. In Node, the primitive is a stream. An incoming HTTP request is already a readable stream. You pipe it through a parser like `busboy` into a writable stream like `fs.createWriteStream` or an S3 upload stream. You never call `readFile`. In FastAPI, `UploadFile` is actually a wrapper around a spooled temporary file. It holds small files in memory and spills larger ones to disk automatically, but that only helps if you read it in chunks. If you call `await file.read()` without a size, you pull it all back into memory anyway and lose the benefit. The correct pattern is `async for chunk in file` or `while chunk := await file.read(1024*1024):` and writing each chunk out.

Backpressure is the piece people skip. If the writer is slower than the reader — disk is slow, S3 is throttling — where does the extra data go? In a naive loop you keep reading and piling buffers in memory. With proper streams, the system signals "pause, I am full" and the reader stops until the writer catches up. In Node, `stream.pipeline` and `readable.pipe(writable)` handle this automatically. If you manually do `req.on('data', chunk => writable.write(chunk))` without checking the return value of `write()` and without listening for `drain`, you have broken backpressure and you will still OOM under load. In Python, `await stream.write(chunk)` naturally awaits the slow writer, so backpressure is more implicit, but you still break it if you buffer before writing.

For truly large or unreliable uploads, streaming alone is not enough. Networks break. A 2 GB upload over a mobile connection will fail halfway. Without chunks, the user must restart from zero. The fix is chunked resumable upload. The frontend slices the file with `file.slice(start, end)` into 5 to 10 MB pieces, numbers them, and uploads each piece separately, often in parallel with a concurrency limit of 3 or 4. The server stores each chunk temporarily and reassembles on completion, verifying with a hash. For S3, you use S3 Multipart Upload: the server creates a multipart upload and gives the client presigned URLs for each part number, the client PUTs each part directly to S3, then tells the server to complete the upload. If part 17 fails, you only retry part 17. You need to track uploaded part numbers and ETags somewhere — in your database or cache — so a refresh can resume.

That leads to the most scalable pattern: presigned URLs. Instead of proxying gigabytes through your app server, your app authenticates the user, checks permissions and quotas, and then generates a short-lived signed URL that lets the browser upload directly to object storage. The signature encodes bucket, key, expiry, and content constraints. S3 checks the signature itself. Your app never sees the bytes, never pays for bandwidth, never risks OOM. You still need to verify the upload happened — S3 can notify you via event notification or the client can call a "complete" endpoint where you check that the key exists and record it in your database. You also need CORS on the bucket to allow a browser PUT from your domain, and you should set a content-length condition or require a checksum header so the client cannot use the URL to store arbitrary huge objects.

When do you use which? Small user content under 10 MB can go directly through your app with streaming writes to disk or S3 — simple and easy to validate. Anything predictable and large — video, datasets, exports — should use presigned URLs or chunked multipart. Chunked resumable is required when users are on slow or mobile networks or when files are above 100 MB and a single retry cost is unacceptable.

Security and correctness run alongside all of this. Never trust `Content-Type` or filename from the client. Validate extension and magic bytes server side after the first chunk, enforce max total size before starting, virus scan async after upload rather than blocking the stream, and write to a staging key before marking the file as available. Make chunk uploads idempotent — PUTting chunk 7 twice should be safe. Add timeouts everywhere: Nginx `client_body_timeout`, Node request timeout, FastAPI dependency timeout. Add observability: log `content-length`, bytes received, time to complete, number of retries, and whether the upload ended via abort, timeout, or success. Without those metrics you will never reproduce "it fails sometimes for large files."

## 4. See It In Practice — Real Code or Queries

These are minimal runnable shapes. Comments explain the why.

Nginx — the gate that rejects before your app runs:

```nginx
# /etc/nginx/nginx.conf or your site config
http {
    # Default is 1m. Set a sane global limit, override per location.
    client_max_body_size 10m;
    client_body_buffer_size 16k;  # spill to disk if larger
    client_body_timeout 60s;
    proxy_read_timeout 120s;

    server {
        listen 80;

        # Direct uploads go to object storage, not through app
        # but if you must proxy, raise limit only here
        location /api/upload {
            client_max_body_size 100m;
            proxy_pass http://app:3000;
            proxy_request_buffering off;  # stream to app, don't buffer whole body in nginx
        }

        location /api/presign {
            client_max_body_size 1m;  # this endpoint only needs JSON
            proxy_pass http://app:3000;
        }
    }
}
```

Node.js — wrong way that buffers everything and right way that streams with backpressure:

```javascript
// WRONG: memoryStorage holds whole file in RAM — crashes on large files
import multer from 'multer';
const badUpload = multer({ storage: multer.memoryStorage() });
app.post('/upload-bad', badUpload.single('file'), (req, res) => {
  // req.file.buffer is the entire file in memory
  res.send('ok');
});

// RIGHT: streaming with pipeline and busboy, constant memory + backpressure handled
import { pipeline } from 'node:stream/promises';
import Busboy from 'busboy';
import fs from 'node:fs';
import path from 'node:path';

app.post('/upload', (req, res) => {
  const busboy = Busboy({ headers: req.headers, limits: { fileSize: 500 * 1024 * 1024 } });
  let fileWriteDone = null;

  busboy.on('file', (fieldname, fileStream, info) => {
    const { filename } = info;
    // Validate extension early before piping bytes
    if (!filename.endsWith('.mp4') && !filename.endsWith('.pdf')) {
      fileStream.resume(); // drain and discard if invalid
      return;
    }
    const dest = fs.createWriteStream(path.join('/tmp/uploads', filename));
    // pipeline wires backpressure: pauses fileStream when dest is full
    fileWriteDone = pipeline(fileStream, dest);
  });

  busboy.on('error', (err) => {
    console.error('busboy error', err);
    res.status(400).send('upload failed');
  });

  busboy.on('finish', async () => {
    try {
      if (fileWriteDone) await fileWriteDone;
      res.send('uploaded');
    } catch (e) {
      res.status(500).send('write failed');
    }
  });

  req.pipe(busboy);

  // Handle client abort — clean up partial file
  req.on('aborted', () => {
    busboy.destroy();
  });
});
```

Node presigned URL — let the browser go direct to S3:

```javascript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: 'us-east-1' });

app.post('/presign', async (req, res) => {
  const { filename, contentType, size } = req.body;
  // Auth check + quota check BEFORE signing anything
  if (size > 2 * 1024 * 1024 * 1024) return res.status(400).send('too large');

  const key = `uploads/${req.user.id}/${Date.now()}-${filename}`;
  const command = new PutObjectCommand({
    Bucket: 'my-app-uploads',
    Key: key,
    ContentType: contentType,
    ContentLength: size, // S3 will enforce it
  });

  // URL is valid for 15 minutes, client PUTs directly to this URL
  const url = await getSignedUrl(s3, command, { expiresIn: 900 });
  res.json({ url, key });
});
```

FastAPI — wrong buffering versus correct chunked streaming:

```python
from fastapi import FastAPI, UploadFile, File, HTTPException
import shutil
import os

app = FastAPI()

# WRONG: pulls entire file into RAM regardless of SpooledTemporaryFile spill
@app.post("/upload-bad")
async def upload_bad(file: UploadFile = File(...)):
    content = await file.read()  # OOM on large files
    open(f"/tmp/{file.filename}", "wb").write(content)
    return {"ok": True}

# RIGHT: iterate in chunks, constant memory, works for GB files
@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    # Validate early before streaming bytes
    if file.size and file.size > 2 * 1024 * 1024 * 1024:
        raise HTTPException(400, "file too large")
    dest = f"/tmp/{file.filename}"
    try:
        with open(dest, "wb") as out:
            # 1 MB chunks — await each write, so slow disk backpressures the read
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
    finally:
        await file.close()
        # Clean up if client aborted mid-stream; real code would check completeness
    return {"path": dest}

# Presigned URL equivalent with boto3
import boto3
from pydantic import BaseModel

s3 = boto3.client("s3", region_name="us-east-1")

class PresignReq(BaseModel):
    filename: str
    content_type: str

@app.post("/presign")
def presign(req: PresignReq):
    # Auth already checked in dependency — omitted for brevity
    key = f"uploads/{req.filename}"
    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": "my-app-uploads", "Key": key, "ContentType": req.content_type},
        ExpiresIn=900,
    )
    return {"url": url, "key": key}
```

Frontend — chunked resumable slicing:

```javascript
async function uploadChunked(file, getPresignedPartUrl, complete) {
  const CHUNK = 8 * 1024 * 1024; // 8 MB
  const total = Math.ceil(file.size / CHUNK);
  const uploaded = new Set(); // in real app, persist to localStorage or server

  for (let i = 0; i < total; i++) {
    if (uploaded.has(i)) continue;
    const start = i * CHUNK;
    const end = Math.min(start + CHUNK, file.size);
    const blob = file.slice(start, end);

    // Each chunk gets its own presigned URL with partNumber
    const { url } = await getPresignedPartUrl({ partNumber: i + 1 });

    const res = await fetch(url, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': file.type },
    });
    if (!res.ok) throw new Error(`chunk ${i} failed`);
    // S3 returns ETag for each part — collect to complete
    uploaded.add(i);
  }
  await complete(); // tells server to call CompleteMultipartUpload
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Users report file upload works for small files but fails for large ones. Where do you start?**

Start outside your app and move inward. First check what error the client actually sees in the network tab — `413`, `504`, `CORS`, or a dropped connection tells you which hop failed. Then check Nginx access logs and error logs for `client intended to send too large body`. If Nginx is clean, check app metrics: memory, CPU, event-loop lag, and whether the process restarted. Check app logs for `request aborted` or `payload too large` from your framework middleware. Finally check timeouts — `client_body_timeout` in Nginx, `server.timeout` in Node, or a load balancer idle timeout. You want to know whether the request was rejected at the gate, timed out on the wire, or OOMed inside the app before you change any code.

**Q: What is the difference between buffering and streaming for uploads, and why does it matter?**

Buffering reads the entire request body into memory before you process it. Streaming handles it piece by piece and writes each piece out before reading the next. With buffering, memory grows with file size — a 500 MB file needs 500 MB of RAM per concurrent upload, so two concurrent uploads on a 512 MB container will crash it. With streaming, memory stays flat at a few megabytes no matter how big the file is, because you only hold one chunk at a time. Buffering is simple and fine for small JSON bodies. Streaming is required for anything where the body size is unpredictable or large.

**Q: What is backpressure and how do you handle it in Node.js?**

Backpressure is the signal that the writer cannot keep up with the reader. Imagine you are reading from the network at 100 MB per second but writing to disk at 20 MB per second. Without backpressure, the 80 MB per second of difference piles up in memory until you crash. Node streams solve this with `pipe` and `pipeline`. When the writable buffer is full, `write()` returns false and the readable pauses. When the writable drains, it emits `drain` and the readable resumes. If you do it by hand with `req.on('data', chunk => writer.write(chunk))` and ignore the return value, you have no backpressure. Always use `pipeline(readable, writable)` which wires all of this for you and also forwards errors.

**Q: In Node.js, how do you handle large file uploads without blocking the event loop?**

Never use `multer.memoryStorage` or `fs.readFile` for uploads. Treat the incoming request as a readable stream. Use a streaming multipart parser like `busboy` or `multiparty`, and pipe the file stream directly to a writable destination with `stream.pipeline`. That keeps everything off the main thread's memory and lets backpressure work. For uploads to S3, pipe to the S3 upload stream instead of a file. Set `limits.fileSize` in the parser so a malicious client cannot send infinite data, and handle `aborted` to clean up partial files. Also increase the server timeout if you expect slow uploads, or better, switch to presigned direct upload.

**Q: How does FastAPI handle `UploadFile` and what is the common mistake?**

`UploadFile` wraps a `SpooledTemporaryFile` that keeps data in memory up to a threshold and then spills to disk automatically. That sounds like it solves the memory problem, but only if you stream it. The mistake is `content = await file.read()` with no size argument — that reads the entire spooled file back into RAM and defeats the spill. The right way is to read in a loop like `while chunk := await file.read(1024*1024): out.write(chunk)` or `async for chunk in file`. Also remember to `await file.close()` to clean up the temp file, and validate `file.size` and `content_type` before you start streaming, not after.

**Q: What does Nginx `client_max_body_size` do and why does it cause 413?**

It is the maximum allowed size of a client request body. Nginx checks the `Content-Length` header against it before proxying to your app. If the body is larger, Nginx immediately returns `413 Payload Too Large` and never forwards the request. The default is `1m`, so any file upload above 1 MB fails by default. Fix it by setting `client_max_body_size` in the right block — a `location /api/upload` can have a larger limit than the global one. But do not just set it to `0` meaning unlimited — pick a real limit you validate again in your app, and pair it with `client_body_timeout` and `proxy_request_buffering off` if you want the upload to stream rather than buffer in Nginx.

**Q: When should you use S3 presigned URLs instead of proxying through your app?**

Use presigned URLs when files are large, numerous, or bandwidth-heavy. If every byte goes through your app server, you pay for two transfers — client to app and app to S3 — and you hold connections open for minutes, which limits concurrency. With a presigned URL, the app only does auth and signing, then the browser PUTs directly to S3. The app stays fast and cheap. The trade-off is you lose in-flight validation — you cannot virus scan or transcode the bytes as they pass through, so you do that async after the S3 event. You also need to handle CORS, URL expiry, and a completion callback where the client tells you the key so you can record it.

**Q: How do you make uploads resumable?**

Split the file on the client with `file.slice()`. Assign each chunk a part number. Upload chunks individually, each with its own retry. Store which parts have succeeded. For storage through your server, write each part to a temp dir keyed by upload ID and reassemble when all parts arrive, verifying total size and hash. For S3, use S3 Multipart Upload: call `CreateMultipartUpload` on the server to get an upload ID, presign each `UploadPart` URL with its part number, have the client PUT each chunk to its URL, collect the ETags, then call `CompleteMultipartUpload`. If the connection drops, query which parts S3 already has and only re-upload the missing ones. Make every part PUT idempotent and clean up incomplete multipart uploads with a lifecycle rule so abandoned uploads do not bill you forever.

## 6. The Traps — What Goes Wrong in Production

The most common trap is bumping `client_max_body_size` to something huge and thinking the job is done. Nginx now accepts the body but your Node process still has `multer.memoryStorage` and the next 500 MB upload OOMs the container. The 413 is gone but the crash is worse.

A second trap is calling `await file.read()` in FastAPI or `fs.readFile` in Node on an `UploadFile` or uploaded path. It works in tests where files are 10 KB and then kills production where they are gigabytes. Always read in a sized loop.

A third trap is ignoring backpressure. People do `req.on('data', chunk => s3stream.write(chunk))` without checking the return value of `write`. Under load the writable fills up, memory grows without bound, and the process is killed by the OOM killer with no stack trace. Use `pipeline`.

Another trap is missing client abort handling. If the user closes the tab mid-upload, the request emits `aborted` but the handler keeps writing a partial file. You end up with corrupt half-files on disk or in S3 and no cleanup. Listen for `aborted` or `close` on the request and delete the partial.

Timeouts are a quiet killer. Nginx `proxy_read_timeout`, AWS ALB idle timeout at 60 seconds, and Node `server.requestTimeout` all default to values that are fine for APIs but too short for large uploads on slow networks. The upload fails halfway with no useful error, just a closed connection. Raise or disable request buffering and set timeouts explicitly for upload routes.

With presigned URLs, forgetting CORS is a classic. The browser can generate the URL fine, but the PUT to S3 is blocked by CORS and the error shows as a cryptic network failure. The bucket needs a CORS rule allowing `PUT` from your origin, and the presigned headers must match exactly — if you signed `Content-Type: video/mp4`, the client must send exactly that.

Not making chunk uploads idempotent hurts retries. If the client retries chunk 5 and the server appends it again, the final file is corrupt. Key chunks by `uploadId` plus `partNumber` and let duplicate PUTs overwrite.

People also forget orphan cleanup. Every failed chunked or multipart upload leaves temp parts on disk or in S3. Without a cron that deletes stale temp dirs or an S3 lifecycle rule that aborts incomplete multipart uploads after 24 hours, storage grows forever.

Finally, trusting filename and `Content-Type` without verification. A client can send `image/jpeg` but upload an executable. Check magic numbers after the first chunk, restrict allowed types on the bucket, and run virus scanning async after the upload completes, not during the stream.

## 7. Compare With Related Concepts

Streaming versus buffering is not a preference, it is a memory decision. Buffering says "hold everything then act." Streaming says "act on a little then forget it." Use buffering when the body is bounded and small like JSON APIs. Use streaming whenever the size is untrusted or large like file uploads. If you can name the maximum size and it is under a few megabytes, buffering is simpler. If you cannot, you must stream.

Chunked resumable upload versus S3 multipart upload are the same idea at different layers. Chunked is the client pattern — slice and retry. S3 multipart is the storage protocol that makes chunked efficient on AWS — each chunk becomes a part with its own ETag and the service reassembles. You can do chunked to your own server without S3, but S3 multipart gives you retry per part without your server holding any bytes. If you are on S3 and files are over 100 MB, use multipart.

Presigned URL versus proxied upload is a bandwidth and responsibility split. Proxied means bytes flow through your app, so you can validate, scan, and transform inline but you pay for bandwidth and concurrency. Presigned means bytes go direct, so your app stays light but you validate after. Choose proxied when you need to inspect or reject mid-stream and files are small. Choose presigned when files are large and you can do validation async via S3 events.

Nginx `client_max_body_size` versus `client_body_buffer_size` controls two different things. `max_body_size` is the gate that rejects too-large requests with 413. `body_buffer_size` controls whether a request that is allowed is held in memory or spilled to disk. Raising the gate without thinking about the buffer means large allowed requests sit in RAM.

Node `stream.pipeline` versus manual `on('data')` write is the difference between backpressure-aware and backpressure-blind. Pipeline pauses the source when the destination is full and forwards errors correctly. Manual handlers keep reading regardless and silently leak memory under load. Default to pipeline.

## 8. 🧠 The Memory Hook

Buffering is stacking the whole library on one table until it collapses. Streaming is a conveyor belt where backpressure is the pause button. If the file is big enough to notice, do not carry it through your apartment — hand the mover a signed key to the warehouse.
