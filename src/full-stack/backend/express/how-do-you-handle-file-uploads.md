# How do you handle file uploads

## Detailed explanation

How do you handle file uploads is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you handle file uploads by linking what it is, why it exists, and how it fails in production.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define the concept in backend terms.
- Explain the problem it solves.
- Show where it appears in real services.
- Call out security, performance, or reliability impact.
- Compare it with nearby concepts.

## 4. Visual / analogy

```txt
Request/API/service -> concept applied -> safer production behavior
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply Express.js rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you handle file uploads affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle file uploads in Express?
- **The Engine Mechanism (Why it behaves this way):** Express's built-in body parsers (`express.json()`, `express.urlencoded()`) cannot handle multipart/form-data, which is the encoding used for file uploads. You need a dedicated middleware like `multer`. Multer parses multipart form data, extracts files, and makes them available on `req.file` (single file) or `req.files` (multiple files). Each file object contains `fieldname`, `originalname`, `encoding`, `mimetype`, `size`, `destination`, `filename`, and `path`. Multer can store files to disk or memory (buffer). Configuration includes destination directory, filename generation, file size limits, and file type filtering.
- **The Unforgettable Mental Model:** The **Package Receiving Dock**. Regular mail (JSON) goes through the standard mailroom (express.json()). But oversized packages (file uploads) need a special receiving dock (multer) with scales (size limits), inspectors (file type filters), and storage bins (destination).
- **The Trap:** Using `express.json()` for file uploads — it silently ignores multipart data, leaving `req.body` empty and `req.file` undefined. Also, not setting file size limits, allowing users to upload gigabyte files and exhaust disk space.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Express can't handle multipart/form-data natively, so I use multer middleware. Multer parses the multipart request, extracts files, and makes them available on req.file or req.files. I configure it with file size limits, allowed file types, and a storage strategy — either disk storage with custom filenames or memory storage for direct upload to cloud storage. I always validate file types and sizes before accepting uploads."

#### What is multer and how does it work?
- **The Engine Mechanism (Why it behaves this way):** Multer is Express middleware that processes `multipart/form-data` requests. It uses the `busboy` library under the hood to parse multipart streams. Configuration options: `dest` (upload directory), `storage` (custom storage engine — `multer.diskStorage()` or `multer.memoryStorage()`), `limits` (fileSize, files, fields), `fileFilter` (function to accept/reject files). Usage: `const upload = multer({ dest: 'uploads/', limits: { fileSize: 5 * 1024 * 1024 } }); app.post('/upload', upload.single('avatar'), (req, res) => { console.log(req.file); })`.
- **The Unforgettable Mental Model:** The **Customs Inspector**. Multer inspects every incoming package (file), checks its contents (file type), weighs it (file size), decides whether to accept it (fileFilter), and either stores it in a warehouse (diskStorage) or holds it temporarily in a processing area (memoryStorage).
- **The Trap:** Using `dest` without a custom filename — multer generates random filenames with no extension. Use `diskStorage` with a `filename` function to control naming. Also, not cleaning up temporary files after processing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Multer is the standard middleware for handling multipart file uploads in Express. It parses the multipart stream, applies file type and size filters, and stores files either to disk or memory. I prefer diskStorage with a custom filename function that generates unique names with proper extensions. For production, I usually combine multer's memoryStorage with direct upload to cloud storage like S3, avoiding local disk entirely."

#### How do you limit file size and type?
- **The Engine Mechanism (Why it behaves this way):** File size limits are set via `limits: { fileSize: 5 * 1024 * 1024 }` (5MB). When exceeded, multer emits a `LIMIT_FILE_SIZE` error. File type filtering uses the `fileFilter` function: `fileFilter: (req, file, cb) => { if (file.mimetype.startsWith('image/')) cb(null, true); else cb(new Error('Invalid file type'), false); }`. The callback `cb(null, true)` accepts the file, `cb(null, false)` rejects silently, `cb(error, false)` rejects with an error. Always validate both MIME type and file extension — MIME types can be spoofed.
- **The Unforgettable Mental Model:** The **Weight and ID Check**. The bouncer (fileFilter) checks both the person's ID (MIME type) and their physical appearance (file extension/magic bytes). And the scale (limits) ensures nobody too heavy (large files) gets in.
- **The Trap:** Only checking file extension without checking MIME type. A malicious user can rename `malware.exe` to `photo.jpg` — the extension passes but the MIME type reveals the truth. Also, not handling the `LIMIT_FILE_SIZE` error, causing unhandled exceptions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I set file size limits via multer's limits option and file type filtering via the fileFilter function. The fileFilter checks both MIME type and, for extra security, I verify the file's magic bytes (header bytes that identify the actual file format). When limits are exceeded or file types don't match, multer throws an error that I catch in my error-handling middleware and return a 400 response. I never trust file extensions alone."

#### How do you upload files to cloud storage (S3)?
- **The Engine Mechanism (Why it behaves this way):** Two approaches: (1) **Server-mediated** — multer stores to memory (`memoryStorage()`), then your route handler uploads the buffer to S3 using the AWS SDK: `const s3 = new S3Client(); await s3.send(new PutObjectCommand({ Bucket, Key: req.file.originalname, Body: req.file.buffer }))`. (2) **Presigned URLs** — the backend generates a presigned S3 upload URL, the frontend uploads directly to S3, bypassing your server entirely. The server-mediated approach is simpler but uses server memory/bandwidth. Presigned URLs are more scalable but require more frontend complexity.
- **The Unforgettable Mental Model:** The **Shipping Options**. Server-mediated is like receiving a package at your office and re-shipping it to the warehouse (uses your resources). Presigned URLs is like giving the sender the warehouse address directly (saves your resources but requires more coordination).
- **The Trap:** Storing large files in server memory with `memoryStorage()` — this can cause out-of-memory crashes with concurrent uploads. For large files, use disk storage or presigned URLs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use two approaches depending on the use case. For small files, I use multer's memoryStorage and upload the buffer to S3 via the AWS SDK in the route handler. For larger files or high-traffic apps, I generate presigned URLs that let the frontend upload directly to S3, bypassing my server entirely. This saves server bandwidth and memory. I always validate file type and size before generating presigned URLs."

#### How do you handle multiple file uploads?
- **The Engine Mechanism (Why it behaves this way):** Use `upload.array('fieldName', maxCount)` for multiple files with the same field name, or `upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'photos', maxCount: 5 }])` for multiple field names. Files are available on `req.files` as an array. Each file object has the same properties as a single file. You can iterate over `req.files` to process each one. Set `maxCount` to limit the number of files — exceeding it triggers a `LIMIT_UNEXPECTED_FILE` error.
- **The Unforgettable Mental Model:** The **Group Check-in**. Instead of processing one visitor at a time, you process the whole group together. But you still check each person's ID (file type) and enforce a group size limit (maxCount).
- **The Trap:** Not setting maxCount — a malicious user could upload thousands of files in a single request, exhausting disk space or memory. Also, not handling the case where some files in a batch are invalid.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For multiple files, I use upload.array() for same-field uploads or upload.fields() for different field names. I always set maxCount to prevent abuse. Each file in req.files is processed individually — I validate type and size, generate unique filenames, and upload to storage. If any file in the batch fails validation, I reject the entire batch to keep operations atomic."

## 8. Active recall test

1. **Why can't express.json() handle file uploads?**
   - **Explanation:** express.json() parses application/json content type. File uploads use multipart/form-data encoding, which requires a dedicated parser like multer that can handle the multipart stream format.

2. **What does multer make available on the request object?**
   - **Explanation:** `req.file` for single file uploads or `req.files` for multiple. Each file object contains fieldname, originalname, mimetype, size, destination, filename, and path.

3. **How do you set a 5MB file size limit in multer?**
   - **Explanation:** `multer({ limits: { fileSize: 5 * 1024 * 1024 } })`. When exceeded, multer emits a LIMIT_FILE_SIZE error that should be caught by error-handling middleware.

4. **What's the difference between diskStorage and memoryStorage?**
   - **Explanation:** diskStorage writes files to the filesystem. memoryStorage keeps files in memory as buffers. memoryStorage is useful for direct cloud uploads but risks OOM with large/concurrent files.

5. **What are presigned URLs and when should you use them?**
   - **Explanation:** Time-limited S3 URLs that allow direct client-to-S3 uploads. Use them for large files or high-traffic apps to avoid routing file data through your server, saving bandwidth and memory.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle file uploads in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle file uploads in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
