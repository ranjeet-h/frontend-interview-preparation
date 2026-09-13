# How do you handle file upload from React

## Detailed explanation

How do you handle file upload from React is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Make frontend and backend agree on auth, data contracts, errors, retries, and state.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define frontend-backend contract.
- Handle auth, cookies/tokens, CORS, and errors.
- Prevent duplicate or stale requests.
- Map backend validation to frontend UX.
- Keep contracts versioned and testable.

## 4. Visual / analogy

```txt
React UI -> API client -> backend endpoint -> response/error contract -> UI state
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply full-stack integration rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you handle file upload from react affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you send a file from React to the backend?
- **The Engine Mechanism (Why it behaves this way):** Files are sent using `FormData`, a browser API that constructs multipart/form-data requests. You create a `FormData` instance, append the file with `formData.append('file', fileObject)`, and send it via fetch or Axios. Axios automatically sets the correct Content-Type with the boundary for FormData. With fetch, you must NOT set Content-Type manually — the browser sets it with the correct boundary string.
- **The Unforgettable Mental Model:** The **Shipping Container**. FormData is like a shipping container that holds your file (cargo) along with metadata (shipping label). The container has a specific format (multipart/form-data) that the receiving dock (backend) knows how to unpack.
- **The Trap:** Setting `Content-Type: multipart/form-data` manually with fetch. This omits the required boundary string, causing the backend to fail parsing. Let the browser set it automatically when using FormData.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use FormData to send files from React. I create a FormData instance, append the file object from the input element, and send it via fetch or Axios. With Axios, the Content-Type is set automatically. With fetch, I deliberately don't set Content-Type — the browser adds it with the correct multipart boundary. For large files, I implement progress tracking using Axios's onUploadProgress or the XMLHttpRequest API, since fetch doesn't support upload progress natively."

#### How do you handle file upload progress in React?
- **The Engine Mechanism (Why it behaves this way):** Upload progress requires tracking bytes sent vs total bytes. Axios provides `onUploadProgress` callback that receives a ProgressEvent with `loaded` and `total` properties. With fetch, you must use XMLHttpRequest instead, which fires `progress` events on the `upload` property. The progress percentage is `(loaded / total) * 100`, displayed as a progress bar in the UI.
- **The Unforgettable Mental Model:** The **Package Tracking**. Instead of just "shipped" and "delivered," you get real-time updates: "10% loaded onto truck," "50% in transit," "90% at local facility." The user knows exactly where their upload stands.
- **The Trap:** Using fetch for file uploads without progress tracking. fetch's ReadableStream only supports download progress, not upload progress. For upload progress, you need Axios or XMLHttpRequest.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For upload progress, I use Axios with its `onUploadProgress` callback, which fires periodically with `loaded` and `total` bytes. I calculate the percentage and update a progress bar in the UI. If I must use fetch, I fall back to XMLHttpRequest which supports `xhr.upload.addEventListener('progress', ...)`. I also handle the indeterminate state when the server doesn't return a Content-Length header for the total."

#### How do you validate files before uploading?
- **The Engine Mechanism (Why it behaves this way):** Client-side validation checks file size, type, and dimensions before the upload begins. File size is checked via `file.size` (bytes). File type is checked via `file.type` (MIME type) or file extension. Image dimensions require reading the file with `FileReader` and loading it into an `Image` element to check `naturalWidth` and `naturalHeight`. Client-side validation provides instant feedback but must be complemented by server-side validation.
- **The Unforgettable Mental Model:** The **Airport Baggage Check**. Before your bag goes on the plane (upload), it's checked for size limits (file size), prohibited items (file type), and weight (dimensions). If it fails, you're told immediately — no need to wait until it reaches the destination (server).
- **The Trap:** Relying only on client-side validation. Users can bypass browser validation by modifying JavaScript or using API tools directly. Server-side validation is mandatory for security.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate files client-side for instant UX feedback — checking file size against limits, MIME type against allowed types, and image dimensions if applicable. For images, I use FileReader to load the file and check dimensions before upload. But critically, I always validate again on the server — client-side validation is for UX, server-side is for security. The server checks file size, type (by reading the file header, not just extension), and content to prevent malicious uploads."

#### How do you handle large file uploads?
- **The Engine Mechanism (Why it behaves this way):** Large files (>10MB) should be uploaded in chunks (resumable upload) or via a presigned URL to cloud storage (S3, GCS). Chunked upload splits the file into pieces (e.g., 5MB chunks), uploads each chunk separately, and the backend reassembles them. Presigned URLs let the frontend upload directly to cloud storage, bypassing the backend entirely. This reduces server memory usage and enables resumable uploads.
- **The Unforgettable Mental Model:** The **Mega Truck Delivery**. Instead of sending one massive truck (large file) that blocks the highway (server memory), you send multiple smaller trucks (chunks) that can be rerouted if one breaks down (resumable). Or you use a direct delivery route (presigned URL) that skips your warehouse entirely.
- **The Trap:** Loading the entire file into memory on the backend. A 500MB file upload consumes 500MB of server memory per concurrent upload. With 100 concurrent uploads, that's 50GB — a guaranteed OOM crash.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For large files, I use either chunked uploads or presigned URLs. Chunked uploads split the file into 5MB pieces, upload each independently, and the backend reassembles them — this enables resumability if the connection drops. Presigned URLs are better for cloud-native apps: the backend generates a temporary S3 upload URL, and the frontend uploads directly to S3, bypassing the server entirely. This eliminates server memory concerns and scales infinitely with cloud storage."

#### How do you handle multiple file uploads?
- **The Engine Mechanism (Why it behaves this way):** Multiple files are handled by appending each file to the same FormData instance with the same field name: `formData.append('files', file)` in a loop. The backend receives an array of files. Alternatively, files can be uploaded sequentially or in parallel with individual requests, depending on whether the backend supports batch uploads. The UI shows individual progress for each file and aggregate progress for the batch.
- **The Unforgettable Mental Model:** The **Group Photo**. Instead of taking individual photos (single uploads), you line everyone up and take one group shot (batch upload). Each person (file) is still identifiable, but they're processed together.
- **The Trap:** Uploading all files in a single request without size limits. 10 files × 50MB each = 500MB request, which may exceed server limits (nginx's `client_max_body_size`, Express's body parser limits).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I append multiple files to a single FormData instance with the same field name, which the backend receives as an array. I implement per-file progress tracking and an aggregate progress bar. I also enforce a total batch size limit client-side to prevent oversized requests. For very large batches, I upload files in parallel with a concurrency limit (e.g., 3 at a time) to avoid overwhelming the server or the user's network."

#### How do you handle file upload errors?
- **The Engine Mechanism (Why it behaves this way):** File upload errors include: network failures, server rejections (file too large, wrong type), timeout, and partial uploads. The error handler should: display the specific error message, offer retry options, and for partial uploads, resume from the last successful chunk. The UI should maintain the file selection state so the user doesn't need to re-select files on retry.
- **The Unforgettable Mental Model:** The **Failed Delivery**. If the delivery truck breaks down (network error), the package isn't lost — it's at the last checkpoint. You can resend from there (resume). If the package is rejected (wrong type), you know exactly why and can fix it.
- **The Trap:** Losing the selected file on error. If the user selects a file, the upload fails, and the file input is cleared, they must re-navigate to find the file again. Preserve the file reference for retry.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle upload errors by preserving the selected file reference so the user can retry without re-selecting. I display specific error messages — 'File too large (max 10MB)', 'Invalid file type', or 'Network error — retry?'. For chunked uploads, I resume from the last successful chunk. I also implement retry with exponential backoff for transient network errors. The key UX principle: never lose the user's file selection on error."

#### What would you monitor for file uploads in production?
- **The Engine Mechanism (Why it behaves this way):** File upload monitoring tracks upload success/failure rates, average upload size, upload latency, storage usage growth, and error breakdown by type (size limit, type rejection, network failure). These metrics reveal whether size limits are appropriate, which file types cause the most rejections, and whether storage costs are growing as expected.
- **The Unforgettable Mental Model:** The **Warehouse Dashboard**. It tracks how many packages arrived successfully (upload success rate), average package size, delivery time (latency), warehouse capacity (storage usage), and rejection reasons (error breakdown).
- **The Trap:** Not monitoring storage growth. File uploads directly impact storage costs. Without monitoring, you might not notice that storage is growing 10x faster than expected due to a bug or abuse.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor upload success/failure rates, average file sizes, upload latency percentiles, storage usage growth rate, and error breakdown by type. I set alerts for upload failure spikes (indicates server or network issues), abnormal storage growth (indicates abuse or bugs), and large file uploads exceeding expected limits. I also track the ratio of client-side validation rejections to server-side rejections — a high server-side rate means client-side validation isn't catching issues effectively."

## 8. Active recall test

1. **How do you send a file from React to the backend?**
   - **Explanation:** Use FormData: create a FormData instance, append the file with `formData.append('file', fileObject)`, and send via fetch or Axios. With fetch, don't set Content-Type manually — the browser sets it with the correct multipart boundary. Axios handles Content-Type automatically.

2. **Why can't you use fetch for upload progress tracking?**
   - **Explanation:** fetch's ReadableStream only supports download progress, not upload progress. For upload progress, use Axios with `onUploadProgress` callback or XMLHttpRequest with `xhr.upload.addEventListener('progress', ...)`.

3. **Why is client-side file validation not sufficient?**
   - **Explanation:** Client-side validation can be bypassed by modifying JavaScript or using API tools directly. It provides instant UX feedback but is not a security measure. Server-side validation is mandatory — checking file size, type (by reading file headers), and content to prevent malicious uploads.

4. **How do you handle large file uploads efficiently?**
   - **Explanation:** Use chunked uploads (split into 5MB pieces, upload separately, backend reassembles) or presigned URLs (backend generates temporary S3 upload URL, frontend uploads directly to cloud storage). Both approaches avoid loading the entire file into server memory and enable resumable uploads.

5. **What happens if you set Content-Type manually when sending FormData with fetch?**
   - **Explanation:** Setting `Content-Type: multipart/form-data` manually omits the required boundary string. The boundary is a unique delimiter that separates parts in the multipart body. Without it, the backend can't parse the request. Let the browser set Content-Type automatically.

6. **How do you handle multiple file uploads?**
   - **Explanation:** Append each file to the same FormData instance with the same field name: `formData.append('files', file)` in a loop. The backend receives an array. Implement per-file progress tracking and enforce a total batch size limit. For large batches, upload with a concurrency limit (e.g., 3 at a time).

7. **What is the most important file upload metric to monitor?**
   - **Explanation:** Storage usage growth rate. File uploads directly impact storage costs. Abnormal growth indicates abuse, bugs (duplicate uploads), or unexpected usage patterns. Combined with upload success rate and error breakdown, it provides a complete picture of upload health.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle file upload from React in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle file upload from React in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
