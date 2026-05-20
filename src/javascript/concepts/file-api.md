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
- What is File API?
- How get selected file?
- How preview image?
- Why revoke object URL?
- How validate uploads?

## 8. Active recall test
1. What element gives files?
2. What object stores file list?
3. Name file metadata fields.
4. How create preview URL?
5. Why revoke URL?

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

