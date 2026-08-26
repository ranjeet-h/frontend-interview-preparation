# What are Transform Streams

## 1. Why This Exists — The Problem First

You need to gzip a 3 GB log file before uploading it to S3. The obvious approach: read the file into a Buffer, compress it, write the result. That triples peak memory — raw file, compressed blob, and whatever the HTTP client buffers — and the process dies on a modest VM.

Transform streams solve this by processing data **in flight**. Each chunk enters, gets modified, and exits immediately. Compression, encryption, CSV-to-JSON parsing, and line filtering all happen with roughly constant memory, one chunk at a time.

## 2. The Analogy — Make It Obvious

Picture an assembly-line station between two conveyor belts.

- The **input belt** brings raw parts (readable side of the transform).
- The **worker at the station** inspects each part, modifies it, and places it on the **output belt** (writable side).
- The station has a small workbench (internal buffer). If the output belt backs up, the worker stops taking parts from the input belt — backpressure flows both directions.
- The worker must signal "done with this part" before grabbing the next one — that is calling the `callback` in `transform()`.

If the worker freezes mid-part without signaling done, the whole line stops. Parts pile up behind the station.

## 3. How It Actually Works — The Full Explanation

A transform stream is a **duplex** stream — it is both readable and writable. Data enters via `write()` (or from an upstream `pipe()`), passes through your `transform()` function, and exits as output chunks on the readable side.

**The `transform(chunk, encoding, callback)` contract.**

1. Node delivers one input chunk.
2. You process it — sync or async.
3. You **must** call `callback()` when done with that chunk.
   - Success: `callback(null, outputChunk)` — push transformed data downstream.
   - Error: `callback(err)` — propagates through the pipeline.
   - No output for this chunk: `callback()` or `callback(null)` — valid for stateful parsers that need more bytes first.
4. Only after the callback runs does Node deliver the next input chunk.

**Backpressure in transforms.** If downstream is slow, the transform's output buffer fills. That pauses the input side automatically — the upstream readable stops producing until space opens. You rarely handle this manually in a well-piped chain.

**Built-in transforms.** `zlib.createGzip()`, `crypto.createCipheriv()`, and `stream.Transform` subclasses in the standard library. You subclass or pass a `transform` function to the constructor for custom logic.

**Chunk boundaries are not record boundaries.** A transform receives whatever size the upstream readable emitted — often 16–64 KB. A JSON object, UTF-8 character, or CSV row can be split across two chunks. Stateful transforms buffer leftovers until a complete unit is available.

**Object mode.** Pass `{ objectMode: true }` when chunks are JavaScript objects (not Buffers/strings). Database row streams and object pipelines use this. Both upstream and downstream must agree on the mode.

## 4. Real Code — See It Working

**Uppercase transform — minimal custom transform**

```js
const { Transform } = require("stream");

const upper = new Transform({
  transform(chunk, encoding, callback) {
    // WHY: callback(null, result) pushes output and unblocks the next input chunk
    callback(null, chunk.toString().toUpperCase());
  },
});

process.stdin.pipe(upper).pipe(process.stdout);
```

**Line parser — handling split chunk boundaries**

```js
const { Transform } = require("stream");

const lineParser = new Transform({
  transform(chunk, encoding, callback) {
    this._buffer = (this._buffer || "") + chunk.toString();
    const lines = this._buffer.split("\n");
    this._buffer = lines.pop(); // WHY: last piece may be an incomplete line — hold it

    for (const line of lines) {
      this.push(JSON.stringify({ line }) + "\n");
    }
    callback();
  },
  flush(callback) {
    // WHY: flush runs at end() — emit any trailing partial line
    if (this._buffer) this.push(JSON.stringify({ line: this._buffer }) + "\n");
    callback();
  },
});
```

**Full pipeline — gzip on the fly**

```js
const fs = require("fs");
const zlib = require("zlib");
const { pipeline } = require("stream/promises");

async function compressFile(input, output) {
  // WHY: pipeline forwards errors and destroys all streams on failure
  await pipeline(
    fs.createReadStream(input),
    zlib.createGzip(),
    fs.createWriteStream(output)
  );
}
```

**Async transform — hash each chunk**

```js
const crypto = require("crypto");
const { Transform } = require("stream");

const hasher = new Transform({
  async transform(chunk, encoding, callback) {
    try {
      const digest = crypto.createHash("sha256").update(chunk).digest("hex");
      callback(null, digest + "\n");
    } catch (err) {
      callback(err); // WHY: errors must go to callback, not thrown, or the stream stalls
    }
  },
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a transform stream?**

A duplex stream that modifies data as it passes through. It implements both readable and writable interfaces: upstream data enters, your `transform()` function processes each chunk, and output exits on the readable side. Used in pipelines like `readable.pipe(gzip).pipe(writable)` for compression, encryption, parsing, and filtering without loading entire files into memory.

**Q: Why must you call the callback in `transform()`?**

The callback tells Node you finished processing the current chunk. Until it runs, the transform will not accept the next input chunk. Forgetting it stalls the entire pipeline — upstream buffers fill, backpressure kicks in, and nothing moves. Always call `callback()`, `callback(null, output)`, or `callback(err)`.

**Q: How do transform streams handle backpressure?**

They sit in the middle of a pipe chain. When the downstream writable buffer is full, the transform stops pulling input. When the transform's own output buffer fills, it pauses the upstream readable. This is automatic when using `pipe()` or `pipeline()` — you do not manually pause/read.

**Q: What is the chunk boundary problem?**

Stream chunks are sized by buffering and I/O, not by your application logic. A single HTTP chunk might contain `"{"name":"jo` and the next `"e"}"`. Transforms that parse structured data must accumulate partial data in an instance buffer and only emit complete records. Use the `flush()` hook to emit trailing partial data when the stream ends.

**Q: When would you use object mode?**

When each "chunk" is a JavaScript object — for example, transforming database rows or parsed JSON objects. Set `{ objectMode: true }` on the transform and ensure the entire pipeline uses object mode. The buffer counts objects instead of bytes.

## 6. The Traps — What Goes Wrong

**Forgetting the callback.** The stream hangs silently. No error, no CPU spike — just frozen throughput. Every code path in `transform()` must reach `callback()`.

**Throwing instead of `callback(err)`.** An uncaught throw inside `transform()` may not propagate cleanly through the pipeline. Pass errors to the callback so `pipeline()` can destroy all streams and reject the promise.

**Assuming one chunk = one record.** Leads to corrupt JSON, broken UTF-8 sequences, and wrong CSV rows. Always buffer across chunks for line- or token-based parsing.

**Not implementing `flush()`.** The last incomplete line or token in your buffer is lost when the stream ends. `flush()` runs once after all input — emit remaining buffered data there.

**Mixing object mode and byte mode.** Passing a Buffer to an object-mode transform (or vice versa) throws or produces garbage. Keep the whole chain consistent.

## 7. Compare With Related Concepts

**Transform vs readable vs writable**

Readable = source only. Writable = sink only. Transform = both — reads input, writes modified output. It is the middle link in `readable → transform → writable`.

**Transform stream vs doing work in a `data` listener**

A manual `data` listener on a readable bypasses the standard backpressure contract unless you carefully check `writable.write()` return values. Transforms integrate with `pipe()` and `pipeline()` and handle flow control correctly.

**Transform vs middleware (Express)**

Express middleware transforms **request/response objects** at the HTTP layer. Transform streams transform **byte/object chunks** in a pipeline. You might use both — Express route hands off `req` (a readable) to a transform pipeline.

**When to use which**

- Simple pass-through or filter on bytes → transform stream in a pipeline.
- One-shot in-memory transform of small data → just process the Buffer/string directly.
- CPU-heavy per-chunk work on huge files → transform in pipeline, possibly with worker threads for the heavy step.

## 8. 🧠 The Memory Hook — What Sticks

A transform stream is a **worker on a conveyor belt** between two belts. Each part comes in, you modify it, you push it out, and you **signal done** (`callback`) before the next part arrives. Chunks are random slices — not whole records — so keep a scrap bin (`_buffer`) for pieces that do not fit yet.
