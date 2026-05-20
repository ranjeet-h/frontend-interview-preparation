# File API

## Detailed explanation
File API lets browser JavaScript read metadata and content from files selected by user through file inputs or drag-and-drop. It powers uploads, previews, CSV import, image validation, and local file processing.

Security model: web pages cannot freely read arbitrary files; user must choose files.

## 1. One-line mental model
File API lets app work with user-selected files.

## 2. Problem it solves
Frontend apps need upload previews, validation, and client-side parsing before sending files.

## 3. Core idea
- User selects files.
- Files appear as `FileList`.
- `File` has name/type/size.
- Read with `FileReader`, streams, or object URLs.
- Validate type/size before upload.

## 4. Visual / analogy
User hands app a file; app can inspect only that file.

```txt
input[type=file] -> FileList -> File
```

## 5. Minimal example

```js
const file = input.files[0];
console.log(file.name, file.size, file.type);
```

## 6. Real-world example

```js
const previewUrl = URL.createObjectURL(file);
image.src = previewUrl;
URL.revokeObjectURL(previewUrl);
```

## 7. Common interview questions

#### What is File API?
- **The Engine Mechanism (Why it behaves this way):** The HTML5 File API is a web-browser host environment API that gives JavaScript web applications a secure, read-only interface to interact with files from the user's local filesystem. Operating under strict browser sandboxing rules, JavaScript cannot initiate access to files arbitrarily. Instead, user intent is required to yield a file handle—either through an `<input type="file">` interaction, a Drag-and-Drop operation, or the File System Access API. A file is represented in JavaScript as a `File` object, which is a specialized subclass of `Blob` (Binary Large Object). The browser allocates a pointer to the file on disk without loading the whole file into the V8 memory heap, preventing memory bloat for large files.
- **The Unforgettable Mental Model:** A secure banking window. The customer (user) slides a specific document through the secure drawer (file input/drag-and-drop). The teller (JavaScript) can read and inspect this specific document, but has absolutely no access to the customer's wallet or briefcase (the rest of the user's filesystem).
- **The Trap:** Believing that instantiating a `File` object immediately loads the binary file data into the browser's active RAM. In reality, the `File` object is merely a metadata reference holding a file descriptor. The actual byte streams are only pulled into V8 heap memory when explicit reading methods (like `FileReader.readAsArrayBuffer()` or streams) are executed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The File API is a highly secure client-side browser interface that allows web applications to inspect and read user-selected files. It extends the `Blob` primitive to represent physical files on disk. The browser's sandboxed security model prohibits arbitrary filesystem access, meaning JavaScript can only obtain a `File` reference following an explicit user event like file selection or drag-and-drop."

#### How get selected file?
- **The Engine Mechanism (Why it behaves this way):** When a user selects a file via an HTML `<input type="file">`, the browser's layout engine captures the file descriptors from the operating system and populates the input's `files` property with a read-only, array-like `FileList` object. Because standard array indices are not directly writable on `FileList`, we access individual files using brackets (`input.files[0]`) or the `FileList.item()` method. In a drag-and-drop context, the browser dispatches a `dragover` and `drop` event; the developer intercepts the `drop` event, calls `event.preventDefault()` to block the browser's default behavior of navigating to the dropped file, and extracts the `FileList` via `event.dataTransfer.files`.
- **The Unforgettable Mental Model:** A security guard's clipboard. When the visitor arrives, the guard logs their name, ID, and size on a list (`FileList`). The JavaScript code is the manager who reads the clipboard using `list[0]` to see who has walked through the door.
- **The Trap:** Forgetting to clear the input value (`input.value = null` or `input.value = ''`) after processing a file. If the user selects a file, deletes it or changes it, and then re-selects the exact same file path, the browser's `change` event will not fire because the input value has not changed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: To retrieve a selected file, we listen to the `change` event on a file input element and access its `.files` property, which returns an array-like `FileList` containing `File` objects. For drag-and-drop, we intercept the `drop` event, suppress the default browser behavior using `preventDefault`, and access the files via `event.dataTransfer.files`. Crucially, always reset the input value to an empty string after extraction so that selecting the same file consecutively triggers the change event again."

#### How preview image?
- **The Engine Mechanism (Why it behaves this way):** There are two standard approaches: `URL.createObjectURL(file)` and `FileReader`. `URL.createObjectURL` is a synchronous C++ engine call that registers a unique, temporary string token URL mapping to the local file (e.g., `blob:https://domain/uuid`). The browser binds this token directly to the file descriptor on disk, bypassing V8 memory completely. The alternative, `FileReader.readAsDataURL(file)`, is an asynchronous, event-driven I/O operation. The browser reads the file from disk, encodes the entire binary byte payload into a Base64 string, and passes it to V8 memory as a massive text data URL. This data URL is then set as the image's `src`.
- **The Unforgettable Mental Model:** `URL.createObjectURL` is like giving someone a temporary locker key (a short string) that points directly to the locker holding the physical bag. `FileReader` is like physically opening the bag, photocopying every single pixel in it, encoding it into code letters, and handing a huge pile of photocopies to the client.
- **The Trap:** Using `FileReader` to preview very large files (e.g., 50MB images). Converting a 50MB binary file into a Base64 string increases its size by ~33%, bloating V8 heap memory and potentially locking the browser's main execution thread due to intensive string encoding.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: To preview an image, the most performant approach is using `URL.createObjectURL(file)`. This synchronously creates a temporary, lightweight pointer URL that maps directly to the file on disk, avoiding loading the binary data into JavaScript's heap memory. For small assets or when we need to persist the image data in storage, `FileReader.readAsDataURL` can be used to asynchronously serialize the file into a Base64-encoded data URI, though we must avoid this for large files to prevent thread jank."

#### Why revoke object URL?
- **The Engine Mechanism (Why it behaves this way):** Object URLs generated via `URL.createObjectURL()` are tied to the lifetime of the document (the page session). Because they represent a strong C++ reference pointing directly to the file stream on disk, the browser cannot release the file descriptor or reclaim the disk/memory cache resources as long as the object URL remains active in the document registry. To prevent this severe memory and resource leak, developers must call `URL.revokeObjectURL(url)`. Once revoked, the browser removes the mapping from its internal C++ registry, allowing the underlying resource to be garbage collected and freeing up file system handles.
- **The Unforgettable Mental Model:** Checking out of a library with a temp card. If you keep the library card active in your wallet, the library must keep the book reserved for you forever. Revoking the card is like handing it back to the librarian so the book can be returned to the shelf and read by others.
- **The Trap:** Revoking an object URL *before* the browser has finished rendering or decoding the image. If you call `img.src = url; URL.revokeObjectURL(url);` synchronously, the browser might fail to fetch the image bytes because the C++ lookup reference is deleted before the rendering engine's asynchronous image-decoding thread gets to fetch it. You should revoke it inside the image's `onload` event handler instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Revoking an object URL via `URL.revokeObjectURL` is critical because the browser maintains a strong internal reference to the file on disk for every generated object URL. This reference persists for the entire lifetime of the tab document, preventing garbage collection and creating a memory leak. To release these system resources safely, we should always revoke the URL once it is no longer needed—typically inside the target image's `onload` callback."

#### How validate uploads?
- **The Engine Mechanism (Why it behaves this way):** Client-side validation is performed synchronously by inspecting the metadata properties on the `File` object: `file.size` (in bytes) and `file.type` (MIME type string, parsed from the file header or extension by the OS). A validation script checks these values against application limits before sending the payload over the network. However, because client-side JavaScript can be easily bypassed or manipulated by editing the runtime execution scope, the browser cannot enforce true security. To ensure absolute security, the server-side engine must receive the file stream, parse the physical magic bytes (the initial binary signatures, like `FF D8 FF` for JPEGs), and enforce limits on the backend.
- **The Unforgettable Mental Model:** A security guard at a VIP club. The client-side validation is like checking if someone is wearing a tie. If they are, they get in the outer door. But the server-side validation is like checking their physical passport and ID under a UV light at the final security gate to verify who they actually are.
- **The Trap:** Relying on the `file.type` property or file extensions for security. An attacker can rename a malicious executable script `malicious.exe` to `photo.jpg`. The browser's `file.type` might report `image/jpeg` based on the file extension. Only a backend signature/magic number scan can verify the true file integrity.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Client-side validation is a user experience enhancement, not a security boundary. We validate file size using `file.size` and MIME type using `file.type` to provide immediate UI feedback and prevent redundant network traffic. However, because client-side metadata is easily spoofed, robust security requires strict backend validation where the file stream is intercepted, maximum sizes are enforced, and the file's binary magic numbers are analyzed to confirm its true format."

## 8. Active recall test

#### 1. What DOM elements or events provide user-selected files to the web application?
The `<input type="file">` HTML element provides selected files through its `.files` property, while custom DOM elements capture dropped files via the `drop` event's `event.dataTransfer.files` property.

#### 2. What object stores the array-like reference list of selected files?
The read-only, array-like `FileList` object contains the `File` objects.

#### 3. What metadata fields are accessible directly on a File object?
`file.name` (the filename string), `file.size` (size in bytes), `file.type` (MIME type string), and `file.lastModified` (UNIX timestamp).

#### 4. How do you programmatically create a temporary lightweight preview URL for a file?
Call `URL.createObjectURL(file)`, which registers a temporary, lightweight pointer to the file on disk.

#### 5. Why must you revoke an object URL after it is loaded, and where is the best place to do it?
To release the strong internal C++ reference the browser holds to the physical file on disk, freeing file handles and preventing memory leaks. The best place to revoke it is inside the target image's asynchronous `onload` event handler.

## 9. Mistakes / traps
- Trusting client validation only.
- Not revoking object URLs.
- Reading huge files on main thread.
- Accepting file extension as proof.

## 10. Compare with related concepts
- **File vs Blob:** File is Blob with name/metadata.
- **FileReader vs object URL:** read bytes/text vs preview reference.
- **Client validation vs server validation:** UX guard vs security enforcement.

## 11. Summary from memory
Explain image preview upload flow.

## 12. Spaced revision prompts
- 1 day: Define File API.
- 3 days: Read file metadata.
- 7 days: Preview image.
- 14 days: Explain validation limits.

