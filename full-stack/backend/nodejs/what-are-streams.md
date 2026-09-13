# What are streams

## 1. Why This Exists — The Problem First

Your export endpoint works on 10MB files and dies on 2GB ones — `readFile` loads the entire payload into a string, memory spikes, GC thrashes, and the process exits with `JavaScript heap out of memory`. Or you buffer a video upload in RAM because "we'll write it when the request finishes," and three concurrent uploads take down the server.

Node's answer is **streams**: move data through the process in **chunks** with bounded buffers, instead of holding the whole payload at once. That is how Node handles HTTP bodies, file copies, compression, encryption, and log pipelines without pretending every byte must fit in one variable.

## 2. The Analogy — Make It Obvious

Loading a file with `readFile` is like ** filling a bathtub to move water** — you need a tub big enough for the entire supply.

Streaming is a **hose**. Water flows continuously; you process what arrives now; the hose diameter (buffer size) stays small whether the source is a bucket or a lake.

If the drain (consumer) is slow, the hose kinks — **backpressure** — and the source slows down instead of flooding the basement (memory).

## 3. How It Actually Works — The Full Explanation

A stream is an `EventEmitter` that emits data in pieces over time instead of all at once.

**Four types:**

| Type | Role | Examples |
|---|---|---|
| **Readable** | Source — you read from it | `fs.createReadStream`, `http.IncomingMessage` |
| **Writable** | Sink — you write to it | `fs.createWriteStream`, `http.ServerResponse` |
| **Duplex** | Both directions | TCP socket, `net.Socket` |
| **Transform** | Read, modify, write | `zlib.createGzip()`, custom mappers |

**Internal buffering:** Each stream keeps an internal buffer. When the writable buffer hits `highWaterMark`, writes return `false` and the source should pause. Readable streams emit `'data'` or work with async iteration; `'end'` means no more data; `'error'` must always be handled.

**`.pipe()`** connects readable → writable and wires pause/resume for backpressure automatically. It does **not** forward errors — attach `'error'` on each stream or use `stream/promises.pipeline`.

**Memory profile:** Processing a 5GB file via streams uses roughly buffer-sized memory (kilobytes to megabytes), not 5GB.

**Object mode:** Streams can carry JavaScript objects instead of Buffers/strings (`objectMode: true`) — useful for line-by-line JSON objects, dangerous if you confuse it with byte mode.

Modern code often prefers `for await (const chunk of readable)` or `pipeline()` over manual `'data'` listeners — cleaner error handling and backpressure with async/await.

## 4. Real Code — See It Working

**Readable stream — chunk sizes:**

```js
const fs = require("fs");

const readable = fs.createReadStream(__filename, { highWaterMark: 64 * 1024 });

readable.on("data", (chunk) => {
  console.log("chunk bytes:", chunk.length);
});

readable.on("end", () => console.log("read complete"));
readable.on("error", (err) => console.error("read failed:", err.message));
```

**Pipe copy with automatic backpressure:**

```js
const fs = require("fs");
const path = require("path");
const os = require("os");

const src = __filename;
const dest = path.join(os.tmpdir(), "stream-copy-demo.txt");

fs.createReadStream(src)
  .on("error", console.error)
  .pipe(fs.createWriteStream(dest))
  .on("error", console.error)
  .on("finish", () => console.log("copied to", dest));
```

**Transform stream — uppercase on the fly:**

```js
const { Transform } = require("stream");

const upper = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase()); // WHY: pass transformed chunk to writable side
  },
});

upper.write("hello ");
upper.write("streams");
upper.end();

upper.on("data", (chunk) => process.stdout.write(chunk)); // HELLO STREAMS
```

**`pipeline` with gzip — errors propagate:**

```js
const fs = require("fs");
const zlib = require("zlib");
const { pipeline } = require("stream/promises");
const path = require("path");
const os = require("os");

async function compressSelf() {
  const out = path.join(os.tmpdir(), "self.txt.gz");
  await pipeline(
    fs.createReadStream(__filename),
    zlib.createGzip(),
    fs.createWriteStream(out)
  );
  console.log("wrote", out);
}

compressSelf().catch(console.error);
```

**Async iteration:**

```js
const fs = require("fs");

async function countLines() {
  let lines = 0;
  for await (const chunk of fs.createReadStream(__filename)) {
    lines += chunk.toString().split("\n").length - 1;
  }
  console.log("approx lines:", lines);
}

countLines();
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are streams in Node.js?**

A mechanism to process data chunk-by-chunk with bounded buffers instead of loading everything into memory. Four types: Readable, Writable, Duplex, Transform.

**Q: What is backpressure?**

When the consumer (writable) cannot keep up, its buffer fills, writes return `false`, and the producer (readable) pauses until space opens. Prevents unbounded memory growth. `.pipe()` handles this; manual code must call `readable.pause()` / `resume()`.

**Q: Does `.pipe()` handle errors?**

No. Errors on either side emit `'error'` on that stream only. Use per-stream handlers or `pipeline()` / `pipeline` from `stream/promises`, which rejects on failure and cleans up.

**Q: Why are streams memory-efficient?**

Only a small buffer of the total data lives in memory at once. Total memory stays roughly constant regardless of file size.

**Q: When would you use streams in an API?**

Large file upload/download, CSV/JSON export, proxying HTTP responses, compressing responses, reading request bodies incrementally, log tailing, video/audio piping.

## 6. The Traps — What Goes Wrong

**Trap: Assuming `pipe()` forwards errors.** Silent failures or hung pipes. Always use `pipeline()` or explicit `'error'` listeners.

**Trap: Forgetting `writable.end()`.** Buffers may not flush; clients hang waiting for end of response.

**Trap: Not destroying streams on abort.** Client disconnects mid-upload — call `stream.destroy()` and stop reading to free fds and memory.

**Trap: `'data'` listener switches to flowing mode.** Attaching `'data'` starts flowing; mixing with `'readable'` read() mode confuses beginners. Prefer `for await` or one style consistently.

**Trap: Loading streams into strings anyway.** `readFile` on stream output defeats the purpose.

## 7. Compare With Related Concepts

| Approach | Memory | Blocking risk |
|---|---|---|
| `readFile` / full buffer | O(file size) | High for large files + parse |
| Streams | O(buffer) | Low if chunks processed quickly |
| Buffers | Fixed binary chunk | Building block for stream chunks |
| `fetch` body streams | Web streams API | Similar idea in modern HTTP clients |

**Related pages:** readable/writable/transform stream chapters drill into each type; backpressure page goes deeper on flow control.

**Rule:** If size is unbounded or "large," default to streams — files, HTTP, ETL, logs.

## 8. 🧠 The Memory Hook — What Sticks

Streams are a **hose, not a bathtub** — data flows in chunks, buffers stay small, and **backpressure** kinks the hose when the consumer slows so memory never floods.
