# File API

## 1. Why This Exists — The Problem First

An upload screen often needs to do useful work before a request is sent: show an image preview, reject a 20 MB file when the limit is 5 MB, parse a CSV, or tell the user that the chosen file is not an accepted format. The browser must make that possible without allowing a random website to scan the user's Documents folder. The File API is the boundary that gives a page access to files the user has deliberately selected or dropped, and only then lets the page inspect or read them.

That boundary matters in both directions: without it, browser apps could not build uploads and local import tools; without the user's selection step, any page could read private files.

## 2. The Analogy — Make It Obvious

Think of a secure intake desk at a company. A visitor (the user) chooses one or more documents and hands them to the receptionist. The receptionist writes down each document's name, size, and category on an intake list, but does not hand the application an open door to the visitor's filing cabinet.

The mapping is direct:

- The file picker or drop zone is the intake desk where the user presents files.
- `FileList` is the receptionist's list of the presented documents.
- A `File` is one document on that list. Its metadata is available immediately.
- `FileReader`, `file.text()`, `file.arrayBuffer()`, and `file.stream()` are different ways of opening and reading the document's contents.
- `URL.createObjectURL(file)` is a temporary badge that lets an image, video, or other browser consumer refer to the presented document without first copying its contents into a JavaScript string.
- Server-side validation is the final security inspection. The receptionist's label is useful for routing and user feedback, but it is not proof that the document is safe.

## 3. How It Actually Works — The Full Explanation

The normal flow is:

```text
user action -> FileList -> File metadata -> optional content read -> upload or local processing
```

1. A user chooses files through `<input type="file">`, or drops files onto a page. For an input, the browser exposes the selection through `input.files`; for a drop, it is available through `event.dataTransfer.files`.
2. The result is a `FileList`, an array-like collection supplied by the browser. It has `length` and indexed access, but it is not a normal JavaScript array that your code creates and mutates.
3. Each item is a `File`, which extends `Blob`. It provides `name`, `size` in bytes, `type` as a browser-provided MIME hint, and `lastModified`. A `File` can be inspected without reading its entire payload.
4. Reading content is explicit. `await file.text()` is convenient for text, `await file.arrayBuffer()` gives binary data, and `file.stream()` exposes a `ReadableStream` for incremental processing. `FileReader` is the older event-based API and is still useful in code that uses its event lifecycle or needs broad legacy-style compatibility.
5. A `Blob` URL gives browser APIs a URL-shaped reference to a `File` or `Blob`. It is usually a good fit for a preview. Every call creates a new URL, even for the same file, so a long-lived application should call `URL.revokeObjectURL()` when that preview is no longer needed.

The browser's security rule is about how the `File` was obtained. A page cannot ask for an arbitrary path such as `/Users/alice/secret.txt` and read it through the File API. The user must grant access by choosing or dropping something. A script can also construct a `File` from bytes it already has, but that does not give it access to new local files.

The selection itself is not the upload. A `File` remains client-side until code sends it, commonly in `FormData` with `fetch`. Conversely, reading a file locally does not make the data trustworthy: the browser's `type`, the filename extension, and even client-side validation can be wrong or deliberately bypassed. The server must validate size, format, authorization, and content again.

For previews, object URLs and data URLs have different costs. An object URL is a short-lived browser-managed reference. `FileReader.readAsDataURL()` reads the whole file and produces a Base64 data URL, which is convenient for small files but increases representation size and retains a large string in memory. Neither choice is a security validation step.

## 4. Real Code — See It Working

**Select, inspect, validate, and upload.**

This is a complete browser example. The `accept` attribute helps the picker filter choices, but the JavaScript check is still needed for immediate feedback, and the server must check again.

```html
<input id="picker" type="file" accept="image/png,image/jpeg" />
<p id="status"></p>

<script>
  const picker = document.querySelector("#picker");
  const status = document.querySelector("#status");
  const maxBytes = 5 * 1024 * 1024;

  picker.addEventListener("change", async () => {
    const file = picker.files[0];
    if (!file) return;

    if (file.size > maxBytes) {
      status.textContent = "Choose an image smaller than 5 MB.";
      picker.value = "";
      return;
    }

    const allowedTypes = new Set(["image/png", "image/jpeg"]);
    if (!allowedTypes.has(file.type)) {
      status.textContent = "Only PNG and JPEG images are accepted.";
      picker.value = "";
      return;
    }

    status.textContent = `${file.name}: ${file.size} bytes`;

    // FormData keeps the original file payload; it does not require us to
    // turn the file into a Base64 string first.
    const body = new FormData();
    body.append("avatar", file, file.name);

    // This local mock makes the example runnable without a backend. Replace
    // it with the real fetch call when wiring the form to an API.
    const mockFetch = async (url, options) => {
      if (url !== "/api/avatar" || options.method !== "POST" || options.body !== body) {
        throw new Error("Unexpected upload request");
      }

      return { ok: true, status: 201 };
    };

    const response = await mockFetch("/api/avatar", { method: "POST", body });
    if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);

    // Clearing allows selecting the same path again to produce another
    // change event after this processing flow finishes.
    picker.value = "";
    status.textContent += " Upload complete (local demo).";
  });
</script>
```

**Preview an image with an object URL.**

```js
function showPreview(file, image) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Preview requires an image file");
  }

  const previewUrl = objectUrlApi.createObjectURL(file);
  image.src = previewUrl;

  // Revoke it when this preview is replaced or removed from the UI.
  // Do not revoke immediately if the image still needs the URL for actions
  // such as opening or saving the image.
  return () => objectUrlApi.revokeObjectURL(previewUrl);
}

const previewUrls = new Set();
const objectUrlApi = {
  createObjectURL(file) {
    const url = `blob:demo-${file.name}`;
    previewUrls.add(url);
    return url;
  },
  revokeObjectURL(url) {
    previewUrls.delete(url);
  },
};


const image = { src: "" };
const file = { name: "avatar.png", type: "image/png" };
const releasePreview = showPreview(file, image);
if (image.src !== "blob:demo-avatar.png") {
  throw new Error("Preview URL was not assigned");
}
releasePreview();
if (previewUrls.size !== 0) throw new Error("Preview URL was not revoked");
```

**Read a text file without loading it through a FileReader callback.**

```js
async function readCsv(file) {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("CSV is too large for this import screen");
  }

  const text = await file.text();
  return text
    .trim()
    .split("\n")
    .map((line) => line.split(","));
}

(async () => {
  const csvFile = {
    size: 20,
    async text() {
      return "name,score\nAda,10\nLinus,9";
    },
  };

  const rows = await readCsv(csvFile);
  const expectedRows = [["name", "score"], ["Ada", "10"], ["Linus", "9"]];
  if (JSON.stringify(rows) !== JSON.stringify(expectedRows)) {
    throw new Error("CSV was not parsed as expected");
  }
})().catch((error) => {
  throw error;
});
```

For a large file, prefer `file.stream()` and process chunks rather than converting the entire file to one string. For older event-based code, `FileReader.readAsText(file)` and `FileReader.readAsArrayBuffer(file)` perform the read asynchronously and report completion or errors through events.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the File API, and what security boundary does it provide?**

It is a set of browser APIs for working with `File` and `Blob` objects supplied by user-facing browser actions or created from data the page already owns. A page cannot use it to enumerate or read arbitrary local paths. The user must select or drop the file first, which gives the page a handle to that selected data. The API is therefore a controlled input mechanism, not general filesystem access.

**Q: What is the difference between `FileList`, `File`, and `Blob`?**

`FileList` is the browser-provided collection of selected files. `File` represents one file and adds file metadata such as `name` and `lastModified` to the binary data behavior inherited from `Blob`. `Blob` is the more general immutable, file-like container for bytes and a MIME type; it can represent data created in memory and does not need a filename.

**Q: How do you get files from a picker and from drag-and-drop?**

Listen for `change` on the file input and read `event.currentTarget.files` or `input.files`. In a drop handler, call `event.preventDefault()` so the browser does not navigate to the dropped resource, then read `event.dataTransfer.files`. Both paths produce `FileList`-like access to the files the user supplied.

**Q: When would you use an object URL, `FileReader`, or `file.text()`?**

Use an object URL when a browser element needs to display or consume a file, such as an image preview or a video source. Use `file.text()` or `file.arrayBuffer()` when JavaScript needs the contents as a whole, and use `file.stream()` when incremental processing matters. Use `FileReader` when its event-based API fits the surrounding code or compatibility requirements. An object URL is not a decoded copy of the file, and a data URL is not automatically better just because it is a string.

**Q: Why should object URLs be revoked?**

`URL.createObjectURL()` registers a temporary URL for a `Blob` or `File`. The URL remains usable until it is revoked or the document is unloaded, so repeatedly creating URLs while replacing previews can retain browser-managed resources longer than necessary. Store the URL, revoke it when the consuming element no longer needs it, and clear the element's `src` when removing the preview. Do not revoke it immediately if the user still needs to interact with that preview.

**Q: Is `file.type` enough to secure an upload?**

No. It is useful client-side metadata for feedback and an early rejection, but it is not a security boundary. The client can be modified, a MIME type can be missing or misleading, and a filename extension can be changed. The server must enforce size and authorization limits and inspect the received content using the appropriate format parser or signature checks before storing or processing it.

**Q: Does choosing a file automatically upload it?**

No. Selection only gives the page a `File` reference. Upload happens when the page submits a form or explicitly sends the file, commonly by appending it to `FormData` and passing that body to `fetch` or another transport.

## 6. The Traps — What Goes Wrong

- **Treating `accept` as enforcement.** `accept="image/*"` guides the file picker and improves the UI, but it does not prove the content is an image. Check on the client for fast feedback and validate again on the server.
- **Trusting extensions or `file.type`.** `photo.jpg` can contain something else, and some files have an empty MIME string. The server must inspect the bytes with a format-aware validator before storing or serving the upload.
- **Assuming a `File` is already the file contents.** Metadata access is cheap, but `text()`, `arrayBuffer()`, `FileReader`, and stream consumption actually read bytes. Avoid converting a large file to a Base64 string just to preview it.
- **Revoking a preview URL too early.** Revoking immediately after assigning `img.src` can make the resource unavailable before the browser has finished using it. Revoke when the preview is replaced or removed, while it is still safe to stop using that URL.
- **Forgetting the lifecycle of repeated previews.** Every `createObjectURL()` call creates a distinct URL. If a component replaces previews, keep the old URL and revoke it during replacement/unmount cleanup; do not revoke only the latest URL.
- **Expecting a normal mutable array.** `FileList` is array-like, but you do not normally push into it or construct it as a normal array. Convert it with `[...input.files]` when array methods or a stable snapshot are useful.
- **Assuming selecting the same file always fires `change`.** After processing, resetting `input.value = ""` lets the user select the same path again and receive a fresh change event. This reset clears the input control, not the `File` data already captured by your code.
- **Reading everything on the main thread for a large import.** `await file.text()` is simple, but it still creates one large string. Use streams, chunked parsing, a worker, or a server-side import path when the file size makes a whole-file read expensive.

## 7. Compare With Related Concepts

- **`File` vs `Blob`:** A `File` is a `Blob` with file-oriented metadata. Use `Blob` for generated bytes; use `File` when the name and last-modified information matter, such as an upload.
- **`FileList` vs JavaScript array:** `FileList` is a browser-supplied, array-like selection. Convert it to an array when you need normal array transformations or a snapshot.
- **Object URL vs data URL:** An object URL is a temporary browser-managed reference; a data URL is the entire content encoded into a string. Use object URLs for previews and data URLs only when the small, self-contained string representation is genuinely useful.
- **`FileReader` vs modern `File` methods:** `FileReader` exposes event callbacks; `file.text()` and `file.arrayBuffer()` return promises, and `file.stream()` supports incremental consumption. Choose based on the data shape and size, not on the assumption that one API changes the security model.
- **File API vs File System Access API:** The File API works with files the user has supplied to the page. File System Access APIs can provide a longer-lived file or directory handle in supporting browsers, but they still require an explicit permission flow and are not a license to silently scan the device.
- **Client validation vs server validation:** Client validation improves speed and feedback; server validation protects the system. A production upload needs both, with the server treated as authoritative.

## 8. 🧠 The Memory Hook — What Sticks

The browser is a secure intake desk: the user must hand over a file before JavaScript can inspect it, and JavaScript chooses whether to read, preview, or upload that file. Remember the boundary—`File` is a representation of the selected bytes and their metadata, not a permission object; permission and user-consent semantics belong to the file-picking flow or File System Access API handles, not to `File` itself; `type` is a hint, not proof; and every temporary preview URL needs a clear release point.
