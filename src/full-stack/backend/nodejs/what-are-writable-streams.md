# What are Writable Streams

## 1. Why This Exists — The Problem First

You build an endpoint that accepts a CSV export and writes it to disk. The naive version concatenates every row into one giant string, then calls `fs.writeFile`. Under load, three concurrent exports each hold 800 MB in memory. The Node process hits its heap limit and restarts — taking down every other request with it.

Writable streams flip the model. You push data out in chunks as you produce it. The stream buffers only what the disk or network can absorb right now. Memory stays flat even when the total output is huge.

## 2. The Analogy — Make It Obvious

Think of a post office with a loading dock and a mail truck.

- You (the producer) drop packages on the dock — that is `stream.write(chunk)`.
- The dock has limited space — that is the internal buffer, sized by `highWaterMark`.
- When the dock is full, the clerk holds up a **stop sign** — `write()` returns `false`.
- You wait until the truck clears space and the clerk waves you on — the `drain` event.
- At the end of the day you lock the dock and send the truck — that is `stream.end()`.

If you never call `end()`, packages sit on the dock forever. The truck never leaves. The destination never gets the final signal that delivery is complete.

## 3. How It Actually Works — The Full Explanation

A writable stream is a **destination** for data. You call `write()` to push chunks in; the stream drains them to the underlying resource (file descriptor, socket, compression engine) asynchronously.

**The write path.**

1. You call `stream.write(chunk)`.
2. If the internal buffer is below `highWaterMark`, the chunk is queued and `write()` returns `true` — keep going.
3. If the buffer is at or above the threshold, `write()` returns `false` — **stop writing** until `drain` fires.
4. The stream flushes buffered data to the OS/network in the background.
5. When the buffer drops below the threshold, it emits `drain`.
6. When you are done, call `end()` (optionally with a final chunk). After all buffered data is flushed, the stream emits `finish`.

**Key events.**

| Event | Meaning |
|---|---|
| `drain` | Buffer emptied enough — safe to write again after `write()` returned `false` |
| `finish` | All data flushed after `end()` |
| `error` | Write failed (disk full, broken pipe) |
| `close` | Underlying resource closed |
| `pipe` | A readable stream was piped into this writable |

**`end()` is not optional.** Without it, buffered bytes may never flush and `finish` never fires. HTTP responses hang open. Files on disk are truncated or empty.

**Built-in writables you already use.** `fs.createWriteStream()`, `http.ServerResponse`, `zlib.createGzip()`, and `process.stdout` are all writable streams.

## 4. Real Code — See It Working

**Basic write and end**

```js
const fs = require("fs");

const out = fs.createWriteStream("./output.log");

out.write("request started\n");
out.write(`user=${process.env.USER}\n`);
// WHY: end() flushes the buffer and closes the file descriptor
out.end("request finished\n");

out.on("finish", () => console.log("file closed cleanly"));
out.on("error", (err) => console.error("write failed:", err));
```

**Manual backpressure — the pattern every senior dev should know**

```js
const fs = require("fs");

function writeLines(filePath, lines) {
  const stream = fs.createWriteStream(filePath);
  let i = 0;

  function writeNext() {
    let ok = true;
    while (i < lines.length && ok) {
      // WHY: write() returning false means the buffer is full — stop the loop
      ok = stream.write(lines[i] + "\n");
      i++;
    }

    if (i < lines.length) {
      // WHY: wait for drain before resuming — prevents unbounded memory growth
      stream.once("drain", writeNext);
    } else {
      stream.end();
    }
  }

  writeNext();
  stream.on("error", (err) => console.error(err));
}
```

**Piping — let Node handle backpressure**

```js
const fs = require("fs");
const zlib = require("zlib");

// WHY: pipe() pauses the readable when the gzip writable buffer fills
fs.createReadStream("./big.json")
  .pipe(zlib.createGzip())
  .pipe(fs.createWriteStream("./big.json.gz"));
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a writable stream?**

A writable stream is a Node.js destination you feed data to chunk by chunk via `write()`. It buffers outgoing data, flushes it asynchronously to the underlying resource, signals backpressure when the buffer is full (`write()` returns `false`), and requires `end()` to flush remaining data and signal completion via `finish`.

**Q: What does it mean when `write()` returns `false`?**

The internal buffer hit `highWaterMark`. You are producing faster than the destination can absorb. Stop calling `write()` until the `drain` event fires. Ignoring this queues unbounded data in memory and can OOM the process — even though you are "streaming."

**Q: Why must you call `end()`?**

`write()` only queues data. `end()` tells the stream no more chunks are coming, triggers a final flush, and closes the resource when done. Skipping `end()` leaves files incomplete, HTTP responses hanging, and listeners waiting forever for `finish`.

**Q: How does `pipe()` relate to writable streams?**

`readable.pipe(writable)` connects a source to a destination and handles backpressure automatically — it pauses the readable when `write()` returns `false` and resumes on `drain`. You still need error handlers on both sides; `pipe()` does not catch errors for you.

**Q: What is the difference between `finish` and `close`?**

`finish` means all queued data was successfully flushed after `end()`. `close` means the underlying resource (file descriptor, socket) was closed. You normally wait for `finish` to know the write succeeded. `close` can follow; if you see `close` without `finish`, the stream was destroyed early and data may be lost.

## 6. The Traps — What Goes Wrong

**Ignoring the return value of `write()`.** This is the most common production bug. Loops that call `write()` in a tight loop without checking `false` buffer millions of chunks in RAM. Always check the return value or use `pipe()` / `pipeline()`.

**Never calling `end()`.** Symptoms: open HTTP connections, zero-byte files, `finish` never fires. Every writable path needs a clear `end()` on success and `destroy()` on failure.

**Calling `end()` twice.** Throws `ERR_STREAM_WRITE_AFTER_END`. Guard with a flag or structure your code so only one code path ends the stream.

**Writing after `end()`.** Same error. If you need to append later, create a new stream or use a different API.

**Unhandled errors.** A disk-full or broken-pipe error emits `error`. Without a listener, the process crashes. Attach `on('error')` before writing.

**Assuming strings vs Buffers.** By default, writables accept strings and Buffers. If you mix encodings or pass objects without `objectMode: true`, you get runtime errors or corrupted output.

## 7. Compare With Related Concepts

**Writable vs readable stream**

Writable = destination (you push to it). Readable = source (you pull from it). In an HTTP server, `req` is readable; `res` is writable.

**Writable stream vs `fs.writeFile` / `fs.promises.writeFile`**

`writeFile` is fine when you already have the full content in memory. Writable streams are for content generated incrementally or too large to hold at once.

**Writable stream vs `pipeline()` from `stream/promises`**

`pipe()` connects streams but error handling is manual. Node 10+ `pipeline(readable, transform, writable)` forwards errors, destroys streams on failure, and returns a promise — preferred in modern code.

**When to use which**

- Known small payload → `writeFile`, `res.send(json)`.
- Generated or large payload → writable stream + backpressure handling.
- Readable → writable with transforms → `pipeline()`.

## 8. 🧠 The Memory Hook — What Sticks

Writable streams are a **loading dock with a stop sign**. `write()` drops a package; `false` means the dock is full — wait for `drain`. `end()` sends the truck. Skip `end()` and nothing ever arrives. Skip backpressure and the dock becomes a warehouse that eats your RAM.
