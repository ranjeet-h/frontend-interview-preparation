# How Do You Handle File Uploads in MERN?

## 1. The Real-World Problem — When You Actually Hit This

Your profile endpoint accepts an avatar. It works with a 200 KB JPEG in development. A few weeks later, a user uploads a 200 MB video, another renames an executable to `.jpg`, and a third sends a request claiming to edit someone else's profile. If the API reads every byte into memory, trusts the browser's MIME type, writes files under a public web directory, or stores the upload before checking authorization, the feature becomes a denial-of-service and data-exposure risk.

File upload handling is therefore a pipeline, not a single middleware call. The client sends a multipart request. The server parses it, authenticates and authorizes the operation, applies size and content checks, scans or quarantines the object when required, stores the bytes, writes safe metadata, and returns a stable API contract. Each step should have a bounded failure mode.

## 2. The Analogy — Make the Mechanic Obvious

Think of an upload facility as a receiving dock. The browser hands over a sealed package with a declared label. The dock checks that the sender is allowed to deliver to this account, limits the package's weight, inspects what is actually inside, sends suspicious packages to quarantine, and puts approved packages in a private warehouse. The database stores the warehouse location and business metadata, not the package itself.

The label is the client-provided filename and MIME type, so it is useful for display but not proof. The receiving scale is the multipart size limit. Quarantine is malware scanning. The warehouse key is an opaque object-storage key. A signed download URL is a temporary visitor pass, not a permanent public filename.

## 3. The Full Explanation — How It Actually Works

React should send a `FormData` body. Do not JSON-stringify a `File`. With `fetch`, do not manually set `Content-Type`; the browser adds the multipart boundary. With an HTTP client that sets headers automatically, the same rule avoids malformed boundaries.

Express does not parse multipart bodies by itself. A parser such as Multer reads the stream and exposes fields and files to the route. Use strict field names, file-count limits, and a byte limit. `memoryStorage()` is reasonable only for small files whose complete buffer you can safely bound. It is a poor default for videos or untrusted large payloads because concurrent buffers consume process memory.

Validation has layers. The frontend can reject an obviously large or unsupported file for fast feedback, but the backend must repeat those checks. The declared `file.mimetype`, extension, and original name are attacker-controlled. Check the file signature (magic bytes) with a trusted library, normalize or generate the storage key, and decode images or media when the format itself must be trusted. A valid signature still does not prove the file is safe, so route high-risk formats through an antivirus or malware-scanning service. Keep an upload quarantined until scanning succeeds.

Authorize before committing bytes to a user's record. Authentication answers who is making the request; authorization answers whether that user may upload for this account, use this file category, and consume the quota. Check ownership or tenant scope in the same service that creates the metadata. Do not accept a `userId` from the form as authority.

For storage, object storage such as S3-compatible storage or Cloudinary is usually better than the API server's local disk. Store an opaque key, bucket/container, media type, byte size, checksum, scan status, and owner in MongoDB. Keep the bucket private and serve downloads through an authorization-checked endpoint or short-lived signed URLs. If the database write fails after storage succeeds, mark or queue the object for cleanup; if storage fails, do not create a ready metadata record.

For large files, stream instead of buffering. Two common designs are: stream the multipart request through a bounded parser into quarantine/object storage, or have the API authorize the upload and return a short-lived presigned multipart-upload plan so the browser sends bytes directly to object storage. The second design removes large payloads from the Node process, but the API still validates the completed object's size, checksum, scan result, and ownership before publishing it.

The response contract should describe application state, not leak a storage implementation. A successful small upload can return `201` with `{ "file": { "id", "status", "downloadUrl" } }`. A rejected size or type is `400` or `413`; an unauthenticated request is `401`; an authenticated user without access is `403`; a scan result can produce `202` with `status: "scanning"` or a rejected `422`, depending on the product contract. Return structured errors with a stable `code` and message. Make retries safe with an idempotency key or client upload ID, and clean up abandoned multipart uploads.

## 4. See It In Practice — Real Code or Queries

This small-file example uses Express and Multer's memory storage with a hard 5 MiB limit. The `fileFilter` is only an early allowlist check; it is not a substitute for signature validation or malware scanning. The example assumes an authenticated `req.user`, a `file-type` package, and application functions that upload to private object storage and scan the object.

```js
// npm install express multer file-type
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import { fileTypeFromBuffer } from "file-type";

const app = express();
const objects = new Map();
const records = new Map();

function requireUser(request, _response, next) {
  request.user = { id: "demo-user" };
  next();
}

async function putPrivateObject(objectKey, buffer, contentType) {
  objects.set(objectKey, { buffer, contentType });
}

async function scanObject(_objectKey) {
  return { clean: true };
}

async function deleteObject(objectKey) {
  objects.delete(objectKey);
}

async function createFileRecord(input) {
  const record = { id: crypto.randomUUID(), ...input };
  records.set(record.id, record);
  return record;
}

async function cleanupStoredObject(objectKey) {
  try {
    await deleteObject(objectKey);
  } catch (cleanupError) {
    console.error("Could not clean up upload", { objectKey, cleanupError });
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 4 },
  fileFilter: (_request, file, callback) => {
    callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype));
  },
});

app.post("/api/me/avatar", requireUser, upload.single("avatar"), async (request, response, next) => {
  let objectKey;
  try {
    if (!request.file) {
      return response.status(400).json({ error: { code: "FILE_REQUIRED", message: "Avatar is required" } });
    }
    const detected = await fileTypeFromBuffer(request.file.buffer);
    const allowed = new Set(["jpg", "png", "webp"]);
    if (!detected || !allowed.has(detected.ext)) {
      return response.status(415).json({ error: { code: "UNSUPPORTED_FILE", message: "Unsupported image format" } });
    }

    objectKey = `quarantine/${crypto.randomUUID()}.${detected.ext}`;
    await putPrivateObject(objectKey, request.file.buffer, detected.mime);
    const scan = await scanObject(objectKey);
    if (!scan.clean) {
      await deleteObject(objectKey);
      return response.status(422).json({ error: { code: "FILE_REJECTED", message: "File failed security checks" } });
    }

    const record = await createFileRecord({
      ownerId: request.user.id,
      objectKey,
      contentType: detected.mime,
      size: request.file.size,
      status: "ready",
    });
    return response.status(201).json({ file: { id: record.id, status: record.status } });
  } catch (error) {
    if (objectKey) {
      await cleanupStoredObject(objectKey);
    }
    return next(error);
  }
});

app.use((error, _request, response, next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return response.status(status).json({ error: { code: error.code, message: "Invalid upload" } });
  }
  if (error) {
    return response.status(500).json({ error: { code: "UPLOAD_FAILED", message: "Upload failed" } });
  }
  return next();
});

// Replace these in-memory stubs with authentication, storage, scanning, and persistence adapters.
app.listen(3000);
```

The React side sends the field name the route expects and treats the response as a contract:

```js
async function uploadAvatar(file) {
  if (!file || file.size > 5 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 5 MiB");
  }

  const body = new FormData();
  body.append("avatar", file);

  const response = await fetch("/api/me/avatar", {
    method: "POST",
    credentials: "include",
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Upload failed");
  }
  return payload.file;
}
```

For a large video, replace the buffered route with an authorized presigned-upload flow. The API first creates an upload session with an owner, allowed size, allowed content type, expiry, and random object key. The browser uploads directly to private storage. A `POST /api/uploads/:id/complete` route then asks storage for the actual size and checksum, runs malware scanning, and changes the MongoDB record from `pending` to `ready` only after those checks pass. This keeps the Node process from holding the whole video in memory.

## 5. Interview Questions — All of Them, Done Properly

**Q: How does a MERN app send a file to Express?**

The React client places the `File` in `FormData` and sends a `multipart/form-data` request. Express needs a multipart parser such as Multer; `express.json()` cannot parse the file body. The field name in `formData.append("avatar", file)` must match `upload.single("avatar")`. The server still owns validation and authorization.

**Q: How do you validate an upload safely?**

Use the client for immediate size and type feedback, then repeat enforcement on the server. Apply request and file-count limits, allowlist formats, inspect magic bytes, and generate the storage name. For formats that can contain active or complex content, decode or transcode them and scan the quarantined object. Never trust only the filename or browser MIME type.

**Q: When would you use memory storage, disk storage, or streaming?**

Memory storage is simple for small, tightly bounded files and lets a storage SDK receive a buffer. Local disk can avoid process memory pressure but needs quotas, cleanup, safe permissions, and a plan for multiple API instances, so it is rarely the final production store. Streaming or direct-to-object-storage uploads are better for large files because bytes are bounded and do not accumulate in the Node heap.

**Q: Where should uploaded files be stored?**

Usually in private object storage, with MongoDB storing metadata and an opaque object key. The API or a short-lived signed URL controls access. Storing binary data directly in MongoDB can be valid for small, tightly coupled data, but it increases document and database operational costs and is not a default for media uploads.

**Q: How do you prevent users from uploading malware or overwriting another user's file?**

Authorize the target resource before accepting it, generate a random key rather than using the original filename, keep the object private, and scan it while quarantined. Store owner and tenant identifiers in the metadata record and check them on reads and deletes. Never use a client-provided path or `userId` as an authorization decision.

**Q: What should the API return?**

Return a stable resource contract, such as `201` and a file ID plus `status: "ready"` for an immediately usable object. For asynchronous scanning, return `202` and `status: "scanning"`; the client can poll or receive an event. Use `413` for an entity that exceeds the limit, `415` for an unsupported media type, and structured error codes that the React UI can map to useful messages.

## 6. The Traps — What Goes Wrong in Production

**Trusting `file.mimetype` or the extension.** Both are supplied by the client. An attacker can rename a file or send a false header. Use signature checks and, where appropriate, decode/transcode and scan the content.

**Buffering unbounded files in Node.** A few concurrent uploads can exhaust the heap and take down every request. Set parser limits and use streaming or direct-to-storage uploads for large objects.

**Using the original filename as a path.** Names can collide and may contain traversal characters or misleading extensions. Generate an opaque key and keep the original name only as display metadata after normalization.

**Making the storage bucket public.** A public bucket bypasses application authorization and can expose private documents. Keep it private and issue short-lived, permission-checked download URLs.

**Scanning after publication.** A scanner that runs after the object is publicly reachable leaves a window for abuse. Store new objects in quarantine and publish only after a clean result.

**Writing storage and MongoDB as if they were one transaction.** They are separate systems. A database failure can leave an orphaned object, and a storage failure can leave a dangling record. Use explicit `pending` and `ready` states, retries, cleanup jobs, and reconciliation metrics.

**Accepting a form `userId` as authority.** This permits cross-account uploads. Derive the owner from the authenticated principal and check resource ownership or tenant scope on every mutation.

**Returning a raw provider URL or internal error.** Provider URLs couple clients to storage and may reveal sensitive details. Return a stable file resource and map parser, scanner, and storage failures to safe, documented error codes.

## 7. Compare With Related Concepts

**Multipart upload vs JSON upload.** JSON carries structured text and cannot carry a binary `File` without encoding it, which adds size and memory overhead. Multipart carries fields and binary parts; use it when the API receives bytes.

**API-proxied upload vs presigned direct upload.** Proxied uploads let the API inspect the stream in one place but consume API bandwidth and connection capacity. Presigned uploads scale large transfers better, but the API must still authorize the session and verify the completed object before making it available.

**Multer memory storage vs object storage.** Multer is a request parser, not durable storage. Memory storage produces a bounded buffer for the next step; object storage provides durable media storage. Treat them as separate responsibilities.

**File metadata vs file bytes in MongoDB.** A metadata document contains ownership, status, checksum, and an object key. The bytes live in object storage. Embedding bytes in MongoDB is a deliberate choice for small data, not an automatic consequence of using MongoDB in a MERN stack.

**Authentication vs authorization.** Authentication identifies the caller. Authorization decides whether that caller may upload, replace, download, or delete this particular object. A valid JWT does not grant access to every file.

## 8. 🧠 The Memory Hook

An upload is a **receiving dock, not a mailbox**: identify the sender, limit the package, inspect what is really inside, quarantine it, store it privately, and record only a controlled reference. The production question is always: who may upload this, how do we bound the bytes, when is it safe to publish, and what exact state does the client receive?
