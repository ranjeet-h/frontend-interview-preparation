# How do you handle file uploads in MERN

## Detailed explanation

How do you handle file uploads in MERN is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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
Work   -> apply MERN backend rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you handle file uploads in mern affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle file uploads in a MERN app?
- **The Engine Mechanism (Why it behaves this way):** Full flow: (1) **Frontend** — React uses `<input type="file" />` or a drag-and-drop library. Creates FormData: `const formData = new FormData(); formData.append('avatar', file);`. Sends via axios: `await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })`. (2) **Backend** — Express uses multer middleware: `const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); app.post('/upload', upload.single('avatar'), uploadHandler)`. (3) **Processing** — Route handler receives file buffer, uploads to cloud storage (S3, Cloudinary), saves URL in MongoDB. (4) **Response** — Returns the file URL: `res.json({ url: fileUrl })`. (5) **Frontend update** — React updates user profile with the new URL.
- **The Unforgettable Mental Model:** The **Photo Lab**. You drop off a photo (file upload). The lab (multer) receives it, processes it (validates, resizes), sends it to the archive (cloud storage), and gives you a reference number (URL) to find it later.
- **The Trap:** Not setting `Content-Type: multipart/form-data` — axios defaults to application/json, which breaks file uploads. Also, not validating file type and size on the backend.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle file uploads with FormData on the frontend and multer on the backend. React creates FormData with the file and sends it with multipart/form-data headers. Express uses multer to parse the multipart request, validate file type and size, and make the file available as a buffer. The route handler uploads the file to cloud storage (S3 or Cloudinary) and saves the URL in MongoDB. I never store files directly in MongoDB — only the URL reference."

#### How do you handle file upload progress in React?
- **The Engine Mechanism (Why it behaves this way):** Use axios's `onUploadProgress` callback: `await api.post('/upload', formData, { onUploadProgress: (progressEvent) => { const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total); setUploadProgress(percent); } })`. Render a progress bar: `<ProgressBar value={uploadProgress} />`. For large files, show the progress bar, disable the submit button, and allow cancellation: `const controller = new AbortController(); await api.post('/upload', formData, { signal: controller.signal, onUploadProgress: ... });`. Call `controller.abort()` to cancel.
- **The Unforgettable Mental Model:** The **Loading Bar**. Instead of a spinning wheel that gives no information, the progress bar tells the user exactly how far along the upload is. They can see it's working and decide whether to wait or cancel.
- **The Trap:** Not providing upload feedback for large files — users think the app is frozen and refresh the page, interrupting the upload.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use axios's onUploadProgress callback to track upload progress and display a progress bar. For large files, I also implement cancellation with AbortController so users can cancel uploads. The key UX detail is providing feedback — without a progress bar, users think the app is frozen during large uploads. I also disable the submit button during upload to prevent duplicate submissions."

#### How do you validate files on the frontend before upload?
- **The Engine Mechanism (Why it behaves this way):** Validate before creating FormData: `const validateFile = (file) => { const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']; const maxSize = 5 * 1024 * 1024; if (!allowedTypes.includes(file.type)) return 'Invalid file type'; if (file.size > maxSize) return 'File too large'; return null; };`. Show validation errors immediately without making an API call. For image files, preview the image before upload: `const preview = URL.createObjectURL(file);`. Revoke the URL when done: `URL.revokeObjectURL(preview)`.
- **The Unforgettable Mental Model:** The **Pre-Flight Check**. Before the plane takes off (upload), check the fuel (file size), the destination (file type), and the weather (format). Catch problems on the ground, not in the air.
- **The Trap:** Only validating on the backend — users wait for the upload to complete before learning the file is invalid. Validate on the frontend first for immediate feedback.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate files on the frontend before upload — checking file type against an allowlist and file size against a maximum. I show errors immediately without making an API call. For images, I create a preview using URL.createObjectURL so users can see what they're uploading. Frontend validation is for UX — backend validation is still required for security. But catching invalid files early saves bandwidth and provides a better experience."

#### How do you handle multiple file uploads?
- **The Engine Mechanism (Why it behaves this way):** Frontend: `files.forEach(file => formData.append('photos', file));` or `formData.append('photos', files)` for an array. Backend: `upload.array('photos', 5)` accepts up to 5 files with the field name 'photos'. Files are available on `req.files` as an array. Process each file: `const urls = await Promise.all(req.files.map(async (file) => { const url = await uploadToS3(file); return url; }));`. Save all URLs in MongoDB: `user.photos = urls; await user.save();`. Return all URLs to the frontend.
- **The Unforgettable Mental Model:** The **Group Photo Session**. Instead of one photo at a time, you take multiple photos in one session. Each photo is processed individually but returned as a group.
- **The Trap:** Not setting a max file count — users can upload unlimited files. Also, not handling partial failures — if one file in a batch fails, decide whether to reject the entire batch or save successful ones.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For multiple files, I use upload.array() on the backend with a max count limit. Frontend appends all files to FormData. I process files in parallel with Promise.all for efficiency. I save all URLs in MongoDB as an array. For error handling, I reject the entire batch if any file fails validation — this keeps operations atomic. I also show individual progress for each file in the batch on the frontend."

#### How do you handle file deletion in a MERN app?
- **The Engine Mechanism (Why it behaves this way):** When deleting a record with file references: (1) **Get the file URL** from the database record. (2) **Delete from cloud storage** — `await s3.deleteObject({ Bucket, Key: extractKey(url) })`. (3) **Delete from database** — `await User.findByIdAndUpdate(id, { $unset: { avatar: 1 } })`. (4) **Handle errors** — if cloud deletion fails, log the error but still delete the database reference (or vice versa, depending on consistency requirements). For orphaned files, run a periodic cleanup job that finds files in storage without database references.
- **The Unforgettable Mental Model:** The **Two-Step Cleanup**. Delete the file from the archive (cloud storage) AND remove the reference from the catalog (database). If you only do one, you either have a broken reference (dangling URL) or an orphaned file (wasted storage).
- **The Trap:** Only deleting the database reference without deleting the actual file from cloud storage — orphaned files accumulate and waste storage space.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: File deletion is a two-step process — delete from cloud storage and remove the reference from the database. I handle errors carefully: if cloud deletion fails, I log it but still remove the database reference to prevent broken URLs. I also run a periodic cleanup job that finds orphaned files in storage (files without database references) and deletes them. Consistency between storage and database is the key challenge."

## 8. Active recall test

1. **How does React send files to Express?**
   - **Explanation:** Using FormData with multipart/form-data Content-Type. Create FormData, append the file, and send via axios with the correct header.

2. **What does multer do in Express?**
   - **Explanation:** Parses multipart/form-data requests, extracts files, validates type and size, and makes them available as buffers (memoryStorage) or files on disk (diskStorage).

3. **How do you show upload progress in React?**
   - **Explanation:** Use axios's onUploadProgress callback to calculate percentage and update a progress bar state. For large files, also implement cancellation with AbortController.

4. **Why validate files on the frontend before upload?**
   - **Explanation:** For immediate UX feedback — users see errors before waiting for an upload. Saves bandwidth by rejecting invalid files early. Backend validation is still required for security.

5. **How do you handle file deletion?**
   - **Explanation:** Delete from cloud storage first, then remove the reference from the database. Handle errors carefully and run periodic cleanup for orphaned files.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle file uploads in MERN in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle file uploads in MERN in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
