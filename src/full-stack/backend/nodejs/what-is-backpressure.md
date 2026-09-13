# What is Backpressure

## 1. Why This Exists — The Problem First

Your service reads a fast SSD and writes to a slow client over a 3G connection. Without flow control, the reader keeps pulling 64 KB chunks and calling `write()` on the response. The socket cannot send as fast as the disk reads. Chunks pile up in memory — first megabytes, then hundreds of megabytes. Eventually the Node process runs out of heap and crashes, even though you thought you were "streaming."

Backpressure is Node's way of saying: **the consumer is full — slow down.** It is the feedback loop that keeps producer speed matched to consumer speed so memory stays bounded.

## 2. The Analogy — Make It Obvious

Imagine a fast factory and a narrow shipping door.

- The factory (producer) makes boxes quickly.
- The door (consumer) can only push one box out at a time.
- A staging area (internal buffer) holds boxes waiting to ship. It fits, say, 100 boxes — that is `highWaterMark`.
- When staging hits 100, a red light turns on — `write()` returns `false`.
- The factory must **stop production** until the light turns green — the `drain` event.
- `pipe()` is an automated system: it watches the light and pauses the factory line without you doing it by hand.

If you ignore the red light and keep making boxes, they stack in the hallway until the building collapses — OOM.

## 3. How It Actually Works — The Full Explanation

Backpressure is a **flow-control mechanism** in Node streams. It prevents a fast producer from overwhelming a slow consumer.

**On the writable side.**

1. You call `writable.write(chunk)`.
2. Data enters the writable's internal buffer.
3. If buffered size < `highWaterMark`, `write()` returns `true` — keep writing.
4. If buffered size ≥ `highWaterMark`, `write()` returns `false` — **stop** until `drain`.
5. Node flushes buffered data to the OS (file, socket) asynchronously.
6. When the buffer drops below the threshold, `drain` fires — resume writing.

**On the readable side (when piped).**

When the downstream writable returns `false`, `pipe()` **pauses** the upstream readable. No new chunks are read until `drain`. The readable may emit `pause`. When writing resumes, the readable emits `resume`.

**`highWaterMark`.** Default 64 KB for byte streams, 16 objects for object-mode streams. It is a threshold, not a hard cap — a single large `write()` can exceed it. It controls when backpressure **signals**, not the absolute maximum buffer size.

**Automatic vs manual.**

- `readable.pipe(writable)` — backpressure handled automatically.
- `stream.pipeline()` / `stream.promises.pipeline()` — same, plus error propagation and cleanup.
- Manual loops with `write()` — you must check the return value and wait for `drain`.
- `for await (const chunk of readable)` with manual `write()` — await `drain` when `write()` returns false.

**Backpressure is not just streams.** The same principle appears anywhere production outpaces consumption: unbounded job queues, event emitters firing faster than handlers process, and database write-ahead buffers. Streams make it explicit with `false` and `drain`.

## 4. Real Code — See It Working

**Automatic — `pipe()` pauses the reader**

```js
const fs = require("fs");
const http = require("http");

http.createServer((req, res) => {
  const file = fs.createReadStream("./large-video.mp4");
  // WHY: when res.write() buffer fills, file stream pauses automatically
  file.pipe(res);
  file.on("error", (err) => res.destroy(err));
}).listen(3000);
```

**Manual backpressure — the correct write loop**

```js
const { once } = require("events");

async function pump(readable, writable) {
  for await (const chunk of readable) {
    // WHY: false means stop — wait for drain before writing more
    if (!writable.write(chunk)) {
      await once(writable, "drain");
    }
  }
  writable.end();
}
```

**Modern preferred — `pipeline()` with promise**

```js
const fs = require("fs");
const { pipeline } = require("stream/promises");

async function copyWithBackpressure(src, dest) {
  // WHY: pipeline wires pause/resume across the chain and destroys on error
  await pipeline(fs.createReadStream(src), fs.createWriteStream(dest));
}
```

**Observing pause and resume**

```js
const fs = require("fs");

const slow = new (require("stream").Writable)({
  highWaterMark: 1024, // small buffer — backpressure triggers sooner
  write(chunk, enc, cb) {
    setTimeout(cb, 100); // simulate slow consumer
  },
});

const fast = fs.createReadStream("./big.bin");
fast.on("pause", () => console.log("readable paused — backpressure"));
fast.on("resume", () => console.log("readable resumed — drain fired"));
fast.pipe(slow);
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is backpressure in Node.js?**

Backpressure is flow control in the streams API. When a writable stream's internal buffer exceeds `highWaterMark`, `write()` returns `false`, telling the producer to stop sending data until the `drain` event fires. When streams are piped, the readable is paused automatically. It prevents memory from growing without bound when the producer is faster than the consumer.

**Q: What does `write()` returning `false` mean?**

The writable's buffer is full relative to `highWaterMark`. Do not call `write()` again until you hear `drain`. Continuing to write ignores backpressure and buffers all those chunks in memory.

**Q: How does `pipe()` handle backpressure?**

`pipe()` listens for `false` from `write()` and calls `readable.pause()`. On `drain`, it calls `readable.resume()`. Data flows only as fast as the slowest writable in the chain can accept it.

**Q: What happens if you ignore backpressure?**

Memory usage grows with the speed difference between producer and consumer. A fast disk read into a slow network write can allocate gigabytes of buffered chunks and crash the process with an OOM error — even in "streaming" code.

**Q: Does backpressure apply to transform streams?**

Yes. A transform sits between readable and writable. If downstream is slow, the transform's output buffer fills, which stops it from calling your `transform()` callback for new input, which pauses upstream. A stalled transform callback also stalls the whole chain.

## 6. The Traps — What Goes Wrong

**Ignoring `write()` return value in a loop.** The classic bug. Fix with drain waiting or use `pipeline()`.

**Assuming `pipe()` handles errors.** It handles backpressure, not errors. Unhandled `error` on either stream still crashes the process.

**Mismatching `highWaterMark` across the chain.** Extreme mismatches can cause odd pause/resume patterns. Usually defaults are fine; tune only when profiling shows a bottleneck.

**Transform callback never called.** The transform stalls, backpressure never resolves downstream, and the readable stays paused forever. Looks like a hang, not a crash.

**Thinking async I/O eliminates backpressure.** Async I/O lets one thread juggle many connections, but each connection's stream buffers still fill if you write faster than the client reads. Slow clients still need backpressure on streaming responses.

## 7. Compare With Related Concepts

**Backpressure vs rate limiting**

Backpressure is **internal** flow control between producer and consumer in one process — reactive, automatic, memory-bound. Rate limiting is **external** policy (100 req/min per IP) enforced at the API layer. Both protect the system; they operate at different layers.

**Backpressure vs blocking**

Backpressure is cooperative and non-blocking. The producer pauses scheduling new writes but the event loop keeps running. Blocking the thread would freeze everything — streams do not do that.

**`pipe()` vs `pipeline()`**

Both handle backpressure. `pipeline()` additionally forwards errors, destroys streams on failure, and returns a promise — use it in new code.

**When manual backpressure matters**

Custom protocols, writing to multiple destinations from one source, or integrating streams with non-stream APIs (batch DB inserts every N chunks) — you check `write()` and await `drain` yourself.

## 8. 🧠 The Memory Hook — What Sticks

Backpressure is a **red light on the loading dock**. `write()` returning `false` means stop stacking boxes. Wait for `drain` — green light — before sending more. `pipe()` watches the light for you; manual loops must watch it themselves, or memory eats you alive.
