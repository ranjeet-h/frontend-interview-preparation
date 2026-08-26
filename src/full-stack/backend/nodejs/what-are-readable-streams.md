# What are Readable Streams

## 1. Why This Exists — The Problem First

Your export job reads a 4 GB CSV from disk and builds a JSON response. The obvious code loads the whole file into a string, parses it, and sends it. On a machine with 512 MB of RAM, the process dies with an out-of-memory error before the first byte reaches the client.

That is the core failure readable streams fix. Node.js I/O is chunk-based — network packets, file reads, and HTTP bodies arrive in pieces. If you treat them as one giant blob, memory grows with file size and latency grows with it too. The client waits until the server finishes reading everything before seeing anything.

Readable streams let you consume data as it arrives: a few kilobytes at a time, constant memory, and the ability to start processing (or forwarding) immediately.

## 2. The Analogy — Make It Obvious

Picture a water tank with a tap at the bottom.

- The tank is the underlying source — a file on disk, a socket, a database cursor.
- The tap is the readable stream — it releases water in controlled bursts, not all at once.
- Your bucket is the consumer — you catch what flows out and use it.
- The tank's fill line is the internal buffer (`highWaterMark`) — if you stop emptying your bucket, the tap slows or stops so the tank does not overflow.

Two ways to use the tap:

1. **Flowing mode** — leave the tap open; water runs out on its own (`data` events fire automatically).
2. **Paused mode** — turn the handle yourself; you pull water only when ready (`read()` on demand).

You would never hold the handle and also leave the tap fully open. Same rule applies to streams: pick one consumption style.

## 3. How It Actually Works — The Full Explanation

A readable stream is a **source** of data. Node's `stream.Readable` class wraps something that produces bytes (or objects, in object mode) and exposes a standard interface for reading it.

**Internal buffer.** Data from the source lands in an in-memory buffer first. The default `highWaterMark` for byte streams is 64 KB. While the buffer is below that threshold, the stream keeps pulling from the source. When the buffer fills and the consumer is slow, the stream pauses the source — that is backpressure working on the read side.

**Flowing vs paused mode.**

- In **flowing mode**, attaching a `data` listener (or calling `pipe()`, or using `for await...of`) switches the stream to flowing. Chunks are pushed to you automatically via `data` events.
- In **paused mode**, no `data` listener is active. You call `stream.read()` when you want the next chunk, or you wait for the `readable` event to know data is available.

Mixing both — calling `read()` while a `data` listener is attached — causes unpredictable mode switching. Avoid it.

**Key events.**

| Event | Meaning |
|---|---|
| `data` | A chunk is ready (flowing mode) |
| `end` | Source finished; no more data |
| `error` | Something broke in the source |
| `close` | Underlying resource closed (may arrive without `end` if stream destroyed early) |
| `readable` | Buffer has data you can `read()` (paused mode) |

**Encoding.** By default, chunks are `Buffer` objects. Pass `{ encoding: 'utf8' }` to the constructor or call `stream.setEncoding('utf8')` to receive strings instead.

**Where you meet them.** `fs.createReadStream()`, `http.IncomingMessage` (the request body), `zlib.createGunzip()`, child process stdout, and many database drivers expose readable streams for large result sets.

## 4. Real Code — See It Working

**Flowing mode with async iteration (preferred today)**

```js
const fs = require("fs");

async function lineCount(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  let lines = 0;

  // WHY: for await switches to flowing mode and handles backpressure internally
  for await (const chunk of stream) {
    lines += chunk.split("\n").length - 1;
  }

  return lines;
}
```

**Paused mode — explicit pull**

```js
const fs = require("fs");

function hashChunks(filePath, onChunk) {
  const stream = fs.createReadStream(filePath);

  stream.on("readable", () => {
    let chunk;
    // WHY: read() drains the internal buffer in paused mode; null means wait for more
    while ((chunk = stream.read()) !== null) {
      onChunk(chunk);
    }
  });

  stream.on("end", () => console.log("done"));
  stream.on("error", (err) => console.error("read failed:", err));
}
```

**Piping to a response — constant memory file download**

```js
const fs = require("fs");
const http = require("http");

http.createServer((req, res) => {
  const file = fs.createReadStream("./exports/report.csv");
  res.setHeader("Content-Type", "text/csv");

  // WHY: pipe() wires readable → writable and handles backpressure + end automatically
  file.on("error", (err) => {
    if (!res.headersSent) res.statusCode = 500;
    res.end(err.message);
  });
  file.pipe(res);
}).listen(3000);
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a readable stream?**

A readable stream is a Node.js abstraction for a data **source** you consume incrementally. Instead of loading all bytes into memory, you receive chunks through `data` events, `read()`, async iteration, or `pipe()`. The stream buffers incoming data up to `highWaterMark`, pauses the source when the consumer falls behind, and emits `end` when the source is exhausted. File reads, HTTP request bodies, and decompression pipelines all use this pattern.

**Q: What is the difference between flowing and paused mode?**

Flowing mode pushes data to you — chunks arrive via `data` events without you asking. Paused mode waits for you to pull with `read()`. Attaching a `data` listener, calling `pipe()`, or using `for await...of` puts the stream in flowing mode. Once flowing, calling `read()` can switch modes mid-flight and cause duplicate or missed chunks. Pick one style and stick with it.

**Q: Why do readable streams matter for large files and APIs?**

Memory stays bounded. Processing a 10 GB log file with a readable stream uses roughly one buffer's worth of RAM, not 10 GB. For HTTP, streaming a response means the client starts downloading immediately — better time-to-first-byte and no server-side spike holding the entire payload in memory.

**Q: What is `highWaterMark` on a readable stream?**

It is the buffer size threshold that controls when the stream tells its source to pause. Default is 64 KB for byte streams. If your consumer is slow and the buffer fills, the readable stops requesting more data from the underlying source until space opens up. Tuning it trades memory for throughput — larger buffers batch more I/O but use more RAM.

**Q: How do you handle errors on readable streams?**

Always attach an `error` listener or wrap async iteration in try/catch. An unhandled `error` event on a stream can crash the process. When piping, attach `error` on **both** the readable and the writable — `pipe()` does not forward errors for you.

## 6. The Traps — What Goes Wrong

**Mixing flowing and paused consumption.** Adding `stream.on('data', ...)` and later calling `stream.read()` in the same pipeline causes mode flips. Symptoms: duplicate chunks, skipped data, or a stream that never emits `end`. Fix: use `for await...of`, or only `readable` + `read()`, or only `data` — not both.

**Assuming chunks align with logical records.** A 16 KB read from a JSON-lines file can split a line in half. Your parser must buffer partial lines across chunks. Readable streams deliver **byte boundaries**, not message boundaries.

**Forgetting encoding.** Without `{ encoding: 'utf8' }`, every chunk is a `Buffer`. Calling string methods directly fails or behaves oddly. Set encoding at creation or convert explicitly with `chunk.toString('utf8')`.

**Ignoring `close` without `end`.** If the stream is destroyed early (client disconnect, timeout), you may get `close` but not `end`. Treat that as an incomplete read and clean up partial work.

**Not handling errors when piping.** This crashes production regularly:

```js
// BAD — error on the file stream is unhandled
fs.createReadStream("missing.txt").pipe(res);

// GOOD
const src = fs.createReadStream("missing.txt");
src.on("error", (err) => { /* respond or log */ });
src.pipe(res);
```

## 7. Compare With Related Concepts

**Readable vs writable stream**

Readable = source (you read from it). Writable = destination (you write to it). HTTP request body is readable; HTTP response body is writable. Data flows readable → writable.

**Readable stream vs `fs.readFile` / buffering whole file**

`readFile` loads everything into memory before your callback runs. Fine for a 50 KB config file; wrong for a 2 GB upload. Use streams when size is unknown or large.

**Readable stream vs EventEmitter**

Streams inherit from EventEmitter, but they add flow control — buffering, backpressure, and a standard `pipe()` API. Raw EventEmitter events have no built-in pause/resume when the consumer is slow.

**When to use which**

- Small, known-size data → `readFile`, `JSON.parse`, string in memory.
- Large or unbounded data → readable stream.
- Transform in the middle → add a transform stream between readable and writable.

## 8. 🧠 The Memory Hook — What Sticks

A readable stream is a **tap**, not a bucket. You do not wait for the whole tank to arrive — you open the tap, take one cup at a time, and if your cups fill up, the tap slows down. Pick flowing (`for await...of` / `pipe`) or paused (`read()`), never both, and always listen for `error`.
