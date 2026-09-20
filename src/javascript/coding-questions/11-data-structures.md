# Data Structures

Frontend interviews rarely ask for a red-black tree, but they do ask for a Stack, a Queue, a Map-based LRU, or a trie behind an autocomplete. This page implements the structures that show up in real UI work, with the complexity of each operation stated explicitly and a linked list that survives the pointer-juggling questions.

## Implement a Stack

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement a `Stack` class with a last-in-first-out (LIFO) contract:

- `push(value)` — add to the top; returns the stack so calls can chain.
- `pop()` — remove and return the top element, or `undefined` when empty.
- `peek()` — return the top element without removing it, or `undefined`.
- `isEmpty` / `size` — read-only views of the state.
- `clear()` — drop every element.

The invariant is that the only reachable element is the most recently pushed one that has not been
popped. Decide the two contract choices up front and state them: whether `pop`/`peek` on an empty
stack return `undefined` or throw, and whether `push` returns the new length (like `Array#push`) or
the receiver (`this`). The implementation below returns `this` for chaining and `undefined` on empty.

### Examples

```text
const s = new Stack();
s.isEmpty            // => true
s.pop()              // => undefined  (empty, no throw)
s.push(1).push(2).push(3); // chaining works
s.peek()             // => 3
s.pop()              // => 3
s.pop()              // => 2
s.size               // => 1
s.clear();
s.size               // => 0
```

### Approach

An array is the obvious backing store: `push` and `pop` both touch only the end, so neither walks
the rest of the data. Two implementation details matter more than the code:

1. **Where the top lives.** Put the top at the *end* of the array. If you put it at index `0`, then
   `pop` must call `shift()`, which is `O(n)` because every remaining element has to be re-indexed.
   `Array#push`/`pop` are `O(1)` amortised: the engine occasionally reallocates (doubling) the
   backing store, and that resize is paid for across the pushes that triggered it.
2. **What empty returns.** `Array#pop` already returns `undefined` on an empty array, so "empty →
   `undefined`" falls out of the array implementation for free. That is convenient but it makes an
   explicitly stored `undefined` indistinguishable from an empty stack at the `pop` boundary — an
   honest limitation to call out.

`peek` is just the last element. A secondary, harder-to-get-wrong implementation uses a singly
linked list with the head as the top: `push` links a new head, `pop` unlinks it, and both are
`O(1)` **worst case** (no amortised resize). The array version is what you write in an interview;
the linked-list version is what you mention when asked about worst-case guarantees.

### Implementation

```javascript
class Stack {
  #items = []; // top of the stack is the END of the array

  push(value) {
    this.#items.push(value);
    return this; // chainable; document this choice
  }

  pop() {
    return this.#items.pop(); // undefined when empty — no throw
  }

  peek() {
    return this.#items[this.#items.length - 1];
  }

  get size() {
    return this.#items.length;
  }

  get isEmpty() {
    return this.#items.length === 0;
  }

  clear() {
    this.#items.length = 0; // truncate in place; O(1) to mark, drops references
  }
}

// Linked-list variant: O(1) worst case for push/pop, no amortised resize.
class LinkedStack {
  #head = null;
  #size = 0;

  push(value) {
    this.#head = { value, next: this.#head };
    this.#size += 1;
    return this;
  }

  pop() {
    if (this.#head === null) return undefined;
    const { value } = this.#head;
    this.#head = this.#head.next; // unlink; the old head is now garbage
    this.#size -= 1;
    return value;
  }

  get size() {
    return this.#size;
  }

  get isEmpty() {
    return this.#size === 0;
  }
}
```

### Walkthrough

Start with `s = new Stack()` (`#items = []`).

1. `s.push(1).push(2).push(3)` runs three times: `#items` becomes `[1]`, then `[1, 2]`, then
   `[1, 2, 3]`. Each call returns `this`, so the chain continues.
2. `s.peek()` reads `#items[3 - 1]` → `3`. Nothing is removed.
3. `s.pop()` calls `[1, 2, 3].pop()` → `3`; `#items = [1, 2]`.
4. `s.pop()` → `2`; `#items = [1]`.
5. `s.size` → `1`, and `s.isEmpty` → `false`.
6. `s.clear()` sets `length = 0`, so `size` is `0` and a further `pop()` returns `undefined`.

The linked variant follows the same order, but step 3 changes `#head` from the `3` node to the `2`
node instead of re-indexing anything.

### Complexity

Time: `push` `O(1)` amortised, `pop` `O(1)`, `peek` `O(1)`, `clear` `O(1)`. Space: `O(n)` for the
elements. The linked-list variant makes `push`/`pop` `O(1)` worst case at the cost of one pointer
per element.

### Edge Cases

- `pop()`/`peek()` on empty → `undefined` (array version); state that this is a choice, not a law.
- Pushing an explicit `undefined` then popping gives `undefined` either way — the sentinel is
  ambiguous, so use `isEmpty` or `size` when it matters.
- `NaN`, objects, and functions are stored and returned by identity; no coercion happens.
- Re-entrancy: `pop` on an array mutates only the end, so an earlier `peek` result stays valid.
- Huge stacks: `push` may trigger a doubling realloc (`O(n)` for that one call) — amortised still
  `O(1)`.
- `clear()` truncating drops references so the elements can be collected; `stack = []` would drop
  the old array entirely, which matters if another reference held it.

### Interview Follow-ups

- **Min stack:** keep a parallel stack of the running minimum; `push` stores `Math.min(value, top)`,
  giving `O(1)` `getMin`. Or store `(value, currentMin)` pairs.
- **Stack from two queues:** push into a non-empty queue, then drain the other into it so the newest
  sits at the front — `O(n)` push, `O(1)` pop.
- **Balanced brackets:** scan characters, pushing openers and matching on closers; a leftover or
  mismatched bracket means unbalanced.
- **`Array#at(-1)` vs `length - 1`:** `at` is cleaner and also handles a negative index, but both
  are `O(1)`.

### Common Mistakes

- Putting the top at index `0` and using `shift()`/`unshift()`, silently making the hot path `O(n)`.
- Forgetting that `pop` on an empty array returns `undefined` and accidentally treating a stored
  `undefined` as "empty".
- Exposing the backing array, letting callers reorder it and break the LIFO invariant.
- Returning the new length from `push` in one method and `this` in another, so chains break only on
  some calls.

### Takeaway

A stack is "add and remove at one end." With an array, that end must be the **end** so `push`/`pop`
stay `O(1)` amortised; a linked list buys `O(1)` worst case. The real decisions are what empty
`pop` returns and what `push` returns.

## Implement a Queue

`Difficulty: Easy` `Probability: Very High`

### Problem

Implement a `Queue` with a first-in-first-out (FIFO) contract:

- `enqueue(value)` — add to the back; returns the queue so calls can chain.
- `dequeue()` — remove and return the front element, or `undefined` when empty.
- `peek()` — return the front element without removing it, or `undefined`.
- `isEmpty` / `size` — read-only views of the state.

The invariant is that `dequeue` returns elements in the order they were enqueued. The trap is
performance: an array-backed queue whose front sits at index `0` has an `O(n)` `dequeue`, because
`Array#shift` re-indexes every remaining element.

### Examples

```text
const q = new Queue();
q.dequeue()                 // => undefined   (empty, no throw)
q.enqueue("a").enqueue("b").enqueue("c");
q.peek()                    // => "a"         (front stays put)
q.dequeue()                 // => "a"
q.dequeue()                 // => "b"
q.enqueue("d");
q.size                      // => 2  ("c", "d")
q.dequeue()                 // => "c"
q.dequeue()                 // => "d"
q.dequeue()                 // => undefined
```

### Approach

The key move is to stop treating "the array" as the queue and instead keep **two indices** into a
sparse store: a `head` (front) and a `tail` (one past the back). Enqueue writes at `tail` and
increments it; dequeue reads at `head`, clears that slot, and increments it. Both are `O(1)`, and
you never move the other elements.

Three viable backings:

1. **Object/`Map` keyed by a monotonically increasing index.** No re-indexing ever. `Map` lets you
   `delete` the consumed key so the entry (and whatever it references) becomes collectable; a plain
   object works too but needs `delete` as well. The counter grows arbitrarily, which is harmless
   for a `Number` until `2^53 - 1`.
2. **Ring buffer** (see "Implement a Circular Queue"): a fixed array plus `(head + size) % capacity`.
   `O(1)` and cache-friendly, but capped in size.
3. **Two stacks** (the next problem): `O(1)` amortised dequeue with no index arithmetic.

The naive `Array#shift` version is worth naming explicitly and rejecting: it is `O(n)` per dequeue,
so draining `n` elements is `O(n²)`. A common "fix" is to splice the array occasionally and reset
the head offset — that re-introduces an amortised `O(n)` copy but keeps indices small; either way,
say why.

Contract details a hasty answer misses: `dequeue` on empty returns `undefined` (it must not throw);
`size` is `tail - head`, not the number of stored keys, so it stays correct even if you forget to
`delete`; and `peek` must not consume the element.

### Implementation

```javascript
class Queue {
  #items = new Map(); // index -> value; only live indices are present
  #head = 0;          // index of the front element
  #tail = 0;          // index one past the back element

  enqueue(value) {
    this.#items.set(this.#tail, value);
    this.#tail += 1;
    return this; // chainable
  }

  dequeue() {
    if (this.#head === this.#tail) return undefined; // empty
    const value = this.#items.get(this.#head);
    this.#items.delete(this.#head); // release the reference — prevents a leak
    this.#head += 1;
    return value;
  }

  peek() {
    return this.#head === this.#tail ? undefined : this.#items.get(this.#head);
  }

  get size() {
    return this.#tail - this.#head; // derived, never a separate counter to drift
  }

  get isEmpty() {
    return this.#head === this.#tail;
  }
}
```

Without the `#items.delete(...)`, consumed entries stay reachable and the `Map` grows for the life
of the queue — the most common memory bug in this exercise. A plain object with
`this.#items[this.#tail] = value` and `delete this.#items[this.#head]` behaves the same; `Map` just
makes the "delete and move on" intent obvious.

### Walkthrough

`q.enqueue("a").enqueue("b").enqueue("c")`, then one `dequeue()`, then `enqueue("d")`:

```text
after enqueue a:  items {0:"a"}                 head=0 tail=1  size=1
after enqueue b:  items {0:"a",1:"b"}           head=0 tail=2  size=2
after enqueue c:  items {0:"a",1:"b",2:"c"}     head=0 tail=3  size=3
after dequeue:    items {1:"b",2:"c"}           head=1 tail=3  size=2   // "a" removed & deleted
after peek:       items {1:"b",2:"c"}           head=1 tail=3  size=2   // "b"
after enqueue d:  items {1:"b",2:"c",3:"d"}     head=1 tail=4  size=3
```

`dequeue` read `items.get(0) = "a"`, deleted key `0`, and moved `head` to `1`; no other entry moved.
`peek` read `items.get(1) = "b"` and touched nothing. The `enqueue("d")` wrote at `tail = 3`, so the
front stayed at index `1` and the size arithmetic (`tail - head`) stayed correct throughout. `Map`
iteration order is insertion order, but because we always address by computed index, order is really
enforced by `head`/`tail`, not by the container.

### Complexity

Time: `enqueue`, `dequeue`, `peek` are all `O(1)` (Map/object get/set/delete are `O(1)` expected).
Space: `O(n)` for the live elements. The two-index version never copies, so draining `n` elements is
`O(n)` total — versus `O(n²)` for the `Array#shift` version.

### Edge Cases

- Empty `dequeue`/`peek` → `undefined`; `size` is `0`, `isEmpty` is `true`.
- Storing an explicit `undefined` is indistinguishable from empty at the `dequeue` return value; use
  `size`/`isEmpty` when that matters.
- `NaN` and object values are returned by identity, with no coercion.
- Forgetting `#items.delete` leaks every consumed value — the queue still *behaves* correctly, so
  tests pass while memory grows.
- The index counters grow forever; reusing the queue for millions of operations is fine numerically
  until `2^53 - 1`, at which point a ring buffer is the honest answer.
- Interleaving `enqueue` and `dequeue` never breaks ordering because `tail - head` is derived, not
  stored.

### Interview Follow-ups

- **Bound the queue (ring buffer):** fixed capacity, `(head + size) % capacity`, and a full check —
  that is the next problem but circular.
- **Queue with two stacks:** no index arithmetic; `O(1)` amortised dequeue. See the following
  problem.
- **`Array#shift` is `O(n)` — prove it:** draining `[1..n]` with repeated `shift` is `O(n²)` because
  each call re-indexes the remaining elements.
- **Batched producer/consumer:** a queue plus a drain loop is the shape of a microtask/task queue;
  production code would use a ring buffer or a deque.

### Common Mistakes

- Using `Array#shift()` or `unshift()` and calling the result a queue, missing the `O(n)` cost.
- Tracking `size` in a separate counter that drifts when `dequeue` is called on an empty queue.
- Not deleting consumed keys, so the backing store grows without bound.
- Returning the index instead of the value, or consuming on `peek`.
- Assuming `Map.size` equals the queue length without deleting — it does not.

### Takeaway

A queue is "add at the back, remove at the front." Keep two indices (`head`, `tail`) into a sparse
store instead of shifting an array, and delete consumed entries to avoid a leak; then every
operation is `O(1)`.

## Implement a Queue using two Stacks

`Difficulty: Medium` `Probability: High`

### Problem

Implement a FIFO queue using only two stacks (LIFO) and the stack operations `push`, `pop`, `peek`,
and `length`. No array indexing, no `shift`, no `unshift`, and no second data structure.

- `enqueue(value)` — add to the back.
- `dequeue()` — remove and return the front, or `undefined` when empty.
- `peek()` — return the front without removing it.
- `size` / `isEmpty`.

The constraint is the point of the exercise: each stack reverses order, so the puzzle is how to get
FIFO back out of two LIFOs without copying on every operation.

### Examples

```text
const q = new TwoStackQueue();
q.enqueue(1); q.enqueue(2); q.enqueue(3);
q.peek()     // => 1
q.dequeue()  // => 1
q.enqueue(4);
q.dequeue()  // => 2
q.dequeue()  // => 3
q.dequeue()  // => 4
q.dequeue()  // => undefined
```

### Approach

Name the two stacks by role: an **inbox** (where `enqueue` pushes) and an **outbox** (where
`dequeue` pops). `enqueue` always pushes onto the inbox — `O(1)`, unconditional.

`dequeue` needs the *oldest* element, which is at the **bottom** of the inbox. So when the outbox is
empty, pour the entire inbox into it: popping from the inbox and pushing to the outbox reverses the
order, putting the oldest element on top of the outbox. Then `pop` the outbox. The critical move is
to transfer **only when the outbox is empty**, never per operation:

- If you transfer on every `dequeue`, each call moves `O(n)` elements and draining `n` items is
  `O(n²)`.
- If you transfer lazily, each element is moved **at most once** — inbox → outbox — and then popped
  once. Amortised, that is `O(1)` per `dequeue` over `n` operations: `n` enqueues plus `n` moves
  plus `n` pops is `O(n)` total.

`peek` mirrors `dequeue` but returns the outbox top without popping it; the same lazy transfer
applies. Both operations must transfer, or `peek` would see an empty outbox while the front element
sits at the inbox bottom.

The invariant that makes it correct: **the outbox is always the front of the queue, newest on the
bottom; the inbox is the back of the queue, oldest on the bottom.** An element in the outbox is
older than every element in the inbox. That is why you must drain the outbox completely before
refilling it from the inbox — mixing them would reorder the queue.

### Implementation

```javascript
class TwoStackQueue {
  #inbox = [];  // enqueue pushes here (back of the queue is the array end)
  #outbox = []; // dequeue pops here (front of the queue is the array end)

  enqueue(value) {
    this.#inbox.push(value);
    return this;
  }

  // Move everything from inbox to outbox, reversing it, only when needed.
  #pour() {
    if (this.#outbox.length === 0) {
      while (this.#inbox.length > 0) {
        this.#outbox.push(this.#inbox.pop());
      }
    }
  }

  dequeue() {
    this.#pour();
    return this.#outbox.pop(); // undefined when both stacks are empty
  }

  peek() {
    this.#pour();
    return this.#outbox[this.#outbox.length - 1];
  }

  get size() {
    return this.#inbox.length + this.#outbox.length;
  }

  get isEmpty() {
    return this.#inbox.length === 0 && this.#outbox.length === 0;
  }
}
```

Arrays are used only as stacks here: `push`/`pop` on the end, plus `length`. The `#pour` guard is the
entire performance story — without the `if`, the queue is `O(n)` per dequeue.

### Walkthrough

Trace `enqueue(1)`, `enqueue(2)`, `enqueue(3)`, `dequeue()`, `enqueue(4)`, `dequeue()`:

```text
enqueue 1:  inbox=[1]            outbox=[]
enqueue 2:  inbox=[1,2]          outbox=[]
enqueue 3:  inbox=[1,2,3]        outbox=[]
dequeue:    pour -> pop inbox 3,2,1 into outbox
            inbox=[]             outbox=[3,2,1]   -> pop outbox = 1
enqueue 4:  inbox=[4]            outbox=[3,2]
dequeue:    outbox not empty -> no pour
            inbox=[4]            outbox=[3,2]    -> pop outbox = 2
```

The single `#pour` moved three elements once. The next two dequeues (returning `3` then `4`) each
pop the outbox with no transfer; when the outbox finally empties, the next dequeue pours `[4]` and
returns it. Every element crossed the inbox→outbox boundary at most once.

### Complexity

Time: `enqueue` `O(1)` worst case; `dequeue`/`peek` `O(1)` **amortised** (`O(n)` on the rare pour),
`O(n)` worst case for a single call. Space: `O(n)` across both stacks. Total work to drain `n`
elements is `O(n)`.

### Edge Cases

- Both stacks empty → `dequeue`/`peek` return `undefined` after a no-op pour.
- Stored `undefined` is still ambiguous with empty at the return boundary; use `size`.
- Adding elements after a partial drain appends to the inbox, which is correctly *newer* than
  everything in the outbox — no pour happens until the outbox empties.
- `peek` must also pour; skipping it makes `peek` return `undefined` while data waits in the inbox.
- Alternating enqueue/dequeue one-at-a-time causes a pour per element only when the outbox is empty,
  which is still `O(1)` amortised overall.
- `NaN`/objects pass through by identity, untouched.

### Interview Follow-ups

- **Why not pour on every dequeue?** It is `O(n)` per call and `O(n²)` to drain; the empty-check is
  the amortisation argument in one line.
- **Worst-case dequeue:** acknowledge it is `O(n)`; the *amortised* bound is the one that matters.
  Contrast with a ring buffer, which is `O(1)` worst case.
- **Queue from two queues / stack from two queues:** the symmetric puzzles; push is the expensive
  side for a stack.
- **Where does this show up?** Anywhere a LIFO primitive must serve FIFO, e.g. undoing a stream of
  operations, or a browser event loop simplifying its task queue.

### Common Mistakes

- Transferring in `enqueue` instead of `dequeue`, which makes the enqueue path `O(n)` and can still
  be correct but is the wrong trade.
- Forgetting the "outbox empty" guard, turning the whole queue into `O(n)` per dequeue.
- Forgetting to pour inside `peek`, so `peek` disagrees with `dequeue`.
- Draining only part of the inbox, so the older elements stay buried.
- Claiming `O(1)` worst case instead of `O(1)` amortised.

### Takeaway

Two LIFOs make a FIFO if you pour one into the other **only when the output stack is empty**. Each
element moves at most once, so `dequeue` is `O(1)` amortised.

## Implement a Circular Queue

`Difficulty: Medium` `Probability: High`

### Problem

Implement a fixed-capacity ring buffer `CircularQueue(capacity)` with:

- `enqueue(value)` — add at the back; returns `true` on success, `false` if full.
- `dequeue()` — remove and return the front, or `undefined` if empty.
- `peek()` — return the front without removing it.
- `get size`, `get isEmpty`, `get isFull`, `get capacity`.

The whole point is **full/empty disambiguation**: with `head` and `tail` alone, both states can show
`head === tail`. Pick a strategy and defend it.

### Examples

```text
const cq = new CircularQueue(3);
cq.capacity          // => 3
cq.isEmpty           // => true
cq.enqueue(1)        // => true
cq.enqueue(2)        // => true
cq.enqueue(3)        // => true
cq.isFull            // => true
cq.enqueue(4)        // => false   (full, rejected — no silent overwrite)
cq.dequeue()         // => 1
cq.enqueue(4)        // => true    (wraps to the slot just freed)
cq.dequeue()         // => 2
cq.peek()            // => 3
cq.size              // => 2
```

### Approach

A ring buffer stores elements in a fixed array and computes positions modulo the capacity, so
indices wrap from the last slot back to `0` instead of shifting memory. `enqueue` writes at
`(head + size) % capacity`; `dequeue` reads at `head` and advances `head = (head + 1) % capacity`.
Nothing is ever copied, so both are `O(1)` worst case.

The classic trap: with only `head` and `tail`, `head === tail` means **both** empty and full, so you
cannot tell the states apart. There are three standard fixes:

1. **Keep a `size` counter** (used below). `size === 0` is empty, `size === capacity` is full. The
   extra integer is the clearest and my default; `head`, `tail`, and `size` cannot drift if you
   update them together.
2. **Waste one slot.** Cap the live elements at `capacity - 1`. Empty is `head === tail`; full is
   `(tail + 1) % capacity === head`. No counter, but you lose a slot and "capacity" is a lie by one.
3. **Keep a `full` boolean** toggled when the pointers meet. Works, but it is state that can drift
   and needs updating in two places.

State the invariant: **`size` elements occupy slots `head, (head+1) % capacity, …,
(head+size-1) % capacity`.** The slot at `(head + size) % capacity` is the next write position.
Rejecting on full (`return false`) is a design choice; the alternative is overwriting the front,
which silently corrupts the FIFO order — always ask which behaviour is wanted.

### Implementation

```javascript
class CircularQueue {
  #buffer;
  #head = 0;  // index of the front element
  #size = 0;  // live element count: this is what disambiguates full from empty

  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError("capacity must be a positive integer");
    }
    this.#buffer = new Array(capacity);
  }

  enqueue(value) {
    if (this.#size === this.#buffer.length) return false; // full: refuse
    const tail = (this.#head + this.#size) % this.#buffer.length;
    this.#buffer[tail] = value;
    this.#size += 1;
    return true;
  }

  dequeue() {
    if (this.#size === 0) return undefined; // empty
    const value = this.#buffer[this.#head];
    this.#buffer[this.#head] = undefined; // drop the reference
    this.#head = (this.#head + 1) % this.#buffer.length;
    this.#size -= 1;
    return value;
  }

  peek() {
    return this.#size === 0 ? undefined : this.#buffer[this.#head];
  }

  get size() { return this.#size; }
  get capacity() { return this.#buffer.length; }
  get isEmpty() { return this.#size === 0; }
  get isFull() { return this.#size === this.#buffer.length; }
}
```

### Walkthrough

`const cq = new CircularQueue(3)`, then the sequence from the Examples block:

```text
start:      buffer=[_, _, _]  head=0 size=0
enqueue 1:  tail=(0+0)%3=0   buffer=[1, _, _]  head=0 size=1
enqueue 2:  tail=(0+1)%3=1   buffer=[1, 2, _]  head=0 size=2
enqueue 3:  tail=(0+2)%3=2   buffer=[1, 2, 3]  head=0 size=3  -> isFull
enqueue 4:  size === capacity -> return false; buffer unchanged
dequeue:    value=buffer[0]=1; buffer=[_, 2, 3]; head=(0+1)%3=1; size=2
enqueue 4:  tail=(1+2)%3=0   buffer=[4, 2, 3]  head=1 size=3
dequeue:    value=buffer[1]=2; buffer=[4, _, 3]; head=(1+1)%3=2; size=2
peek:       buffer[head]=buffer[2] -> 3
```

The write for the second `enqueue(4)` computed `tail = 0`, wrapping **behind** `head = 1` into the
slot just freed, without moving `2` or `3`. That wrap is the entire data structure. `size` never
reached an ambiguous state: it was `3` (full) before the failed enqueue, `2` after the dequeue, and
`3` again after the wrap — while `head === tail` never occurred in a way we had to interpret.

### Complexity

Time: `enqueue`, `dequeue`, `peek` are all `O(1)` **worst case** (modulo arithmetic, no shifting).
Space: `O(capacity)` fixed, regardless of how many elements are live.

### Edge Cases

- `capacity = 0` or a non-integer/negative capacity → constructor throws `RangeError`; there is no
  meaningful ring of size zero.
- Full `enqueue` returns `false` and changes nothing; the caller must decide whether to drop the new
  value or evict the front.
- Empty `dequeue`/`peek` → `undefined`; `head` is left untouched.
- `head` wraps correctly because it is always reduced modulo `capacity` in one place.
- Clearing the dequeued slot to `undefined` releases the reference so a large object does not stay
  alive while its slot is empty.
- After `capacity` operations of each kind the pointers are back where they started, so long-running
  use never grows memory.
- Stored `undefined` values are still distinguishable from empty because emptiness is `size === 0`,
  not `buffer[head] === undefined`.

### Interview Follow-ups

- **Waste-one-slot variant:** drop `size`, cap live elements at `capacity - 1`, full is
  `(tail + 1) % capacity === head`. Explain the trade: no counter, one unusable slot.
- **Dynamic resizing:** when full, allocate double and copy elements in order from `head`; amortised
  `O(1)` enqueue, like `Array#push`, but now you own the growth policy.
- **Overwrite policy:** for a fixed-size log/telemetry buffer you often *want* the oldest value
  evicted; `enqueue` would advance `head` when full instead of returning `false`.
- **Deque:** support `O(1)` push/pop at both ends using two heads in one ring.
- **Where it appears:** audio/stream buffers, log ring buffers, and any bounded producer–consumer
  channel.

### Common Mistakes

- Trying to use `head`/`tail` equality for both full and empty, then rejecting valid enqueues or
  reading stale slots.
- Forgetting `% capacity` on the tail, so the index runs past the array and writes `undefined` holes.
- Copying with `shift()` inside a "circular" queue, defeating the whole point.
- Declaring a `size` counter but forgetting to decrement it on `dequeue`, so `isFull` lies.
- Silent overwrite on full when the problem asked for rejection (or vice versa).

### Takeaway

A ring buffer is `enqueue` at `(head + size) % capacity` and `dequeue` at `head`, both `O(1)`
worst case. To tell full from empty, keep a `size` counter — pointers alone are ambiguous.

## Implement a Priority Queue

`Difficulty: Hard` `Probability: Medium`

### Problem

Implement a `PriorityQueue` backed by a binary heap:

- `enqueue(value, priority)` — insert with a priority (lower number = higher priority).
- `dequeue()` — remove and return the value with the highest priority, or `undefined` when empty.
- `peek()` — return `{ value, priority }` for the front without removing it, or `undefined`.
- `get size`, `get isEmpty`.

Ties must dequeue in **insertion order** (FIFO among equal priorities), and a custom comparator
must be supported. The invariant is that the root of the heap is the highest-priority element and
every parent outranks its children.

### Examples

```text
const pq = new PriorityQueue();
pq.enqueue("low", 5);
pq.enqueue("urgent", 1);
pq.enqueue("mid", 3);
pq.peek()      // => { value: "urgent", priority: 1 }
pq.dequeue()   // => "urgent"
pq.enqueue("also-1", 1);
pq.dequeue()   // => "also-1"   (ties keep insertion order, not "mid")
pq.dequeue()   // => "mid"
pq.dequeue()   // => "low"
pq.dequeue()   // => undefined
```

### Approach

A priority queue is not "sort on every insert." Either a sorted array (`O(n)` insert, `O(1)` remove)
or a full sort (`O(n log n)` per operation) is the rookie answer. The right structure is a **binary
heap**: a complete binary tree stored flat in an array, where the root is the extremum.

Array layout for index `i`: children are `2i + 1` and `2i + 2`, parent is `(i - 1) >> 1`. Because
the tree is complete, no pointers are needed and it never has a "hole."

- **`enqueue`** appends at the end (new leaf) and **bubbles up**: while the element outranks its
  parent, swap. At most the height, so `O(log n)`.
- **`dequeue`** saves the root, moves the last element to the root, then **sinks down**: repeatedly
  swap with the better of its two children until it outranks both. `O(log n)`.
- **`peek`** is `heap[0]`, `O(1)`.
- **Building from an existing array** is `O(n)`, not `O(n log n)`: sink from the last parent down to
  the root, because most nodes are near the bottom.

Two contract details that separate a good answer:

1. **Stability.** A plain heap is not stable: equal-priority elements can come out in either order
   depending on swaps. Attach a monotonically increasing insertion sequence and break ties with it
   (`a.order - b.order`) so equal priorities are FIFO. This is a deliberate, testable guarantee.
2. **Comparator direction.** Decide once whether a comparator returns "negative means `a` first"
   (like `Array#sort`) and document it. We use a min-heap by default (`lower priority number wins`)
   and a `compare(a, b)` over the raw entries.

Min-heap vs max-heap is just the comparator; do not write two classes.

### Implementation

```javascript
class PriorityQueue {
  #heap = []; // entries: { value, priority, order }
  #order = 0; // monotonically increasing insertion sequence for stable ties
  #compare;

  constructor(compare = (a, b) => a.priority - b.priority) {
    this.#compare = compare; // negative  => a before b (Array#sort convention)
  }

  get size() {
    return this.#heap.length;
  }

  get isEmpty() {
    return this.#heap.length === 0;
  }

  peek() {
    const top = this.#heap[0];
    return top === undefined ? undefined : { value: top.value, priority: top.priority };
  }

  enqueue(value, priority) {
    this.#heap.push({ value, priority, order: this.#order });
    this.#order += 1;
    this.#bubbleUp(this.#heap.length - 1);
    return this;
  }

  dequeue() {
    if (this.#heap.length === 0) return undefined;
    const top = this.#heap[0];
    const last = this.#heap.pop();       // O(1) removal of the last leaf
    if (this.#heap.length > 0) {
      this.#heap[0] = last;              // promote the last leaf to the root
      this.#sinkDown(0);                 // and restore the heap property
    }
    return top.value;
  }

  // True when `a` should be dequeued before `b`.
  #before(a, b) {
    const byPriority = this.#compare(a, b);
    return byPriority !== 0 ? byPriority < 0 : a.order < b.order; // stable tie-break
  }

  #bubbleUp(index) {
    const heap = this.#heap;
    while (index > 0) {
      const parent = (index - 1) >> 1;  // integer floor division by 2
      if (!this.#before(heap[index], heap[parent])) break;
      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
  }

  #sinkDown(index) {
    const heap = this.#heap;
    const length = heap.length;
    for (;;) {
      const left = 2 * index + 1;
      const right = left + 1;
      let best = index;
      if (left < length && this.#before(heap[left], heap[best])) best = left;
      if (right < length && this.#before(heap[right], heap[best])) best = right;
      if (best === index) return;       // both children outranked by the parent
      [heap[index], heap[best]] = [heap[best], heap[index]];
      index = best;
    }
  }
}
```

### Walkthrough

Heap as an array, values shown as `value:priority`. `enqueue("low",5)`, `enqueue("urgent",1)`,
`enqueue("mid",3)`, then `dequeue()`:

```text
enqueue low:5     push at 0 -> [low:5]
enqueue urgent:1  push at 1 -> [low:5, urgent:1]
                  parent (1-1)>>1=0 -> urgent:1 before low:5 -> swap
                  [urgent:1, low:5]
enqueue mid:3     push at 2 -> [urgent:1, low:5, mid:3]
                  parent (2-1)>>1=0 -> urgent:1 already better -> stop
dequeue           top=urgent:1; pop last mid:3 -> [urgent:1, low:5]
                  heap[0]=mid:3 -> [mid:3, low:5]
                  sinkDown(0): left=1 low:5; before(low:5, mid:3)? no -> stop
                  return "urgent"
enqueue also-1:1  push at 2 -> [mid:3, low:5, also-1:1]
                  parent 0 mid:3 -> also-1:1 before mid:3 -> swap
                  [also-1:1, low:5, mid:3]
dequeue           top=also-1:1; pop last mid:3 -> [also-1:1, low:5]
                  heap[0]=mid:3 -> [mid:3, low:5]
                  sinkDown(0): left=1 low:5; before(low:5, mid:3)? no -> stop
                  return "also-1"
```

The second `dequeue` returns `"also-1"` ahead of `"mid"` because both the priority `1`s were ordered
by their insertion sequence: `urgent` (order 1) beat `also-1` (order 3), and `also-1` still beat the
priority-`3` `"mid"`. Without the `order` tie-break the heap could have returned either `1` first.

### Complexity

Time: `enqueue` `O(log n)`, `dequeue` `O(log n)`, `peek`/`isEmpty`/`size` `O(1)`. Building from an
array with repeated sinks is `O(n)`. Space: `O(n)` for the entries. Each entry carries one extra
integer (`order`), a small constant.

### Edge Cases

- Empty `dequeue`/`peek` → `undefined`; `dequeue` on a one-element heap pops the last leaf and skips
  the sink because the array is now empty.
- Equal priorities → insertion order (FIFO), thanks to the `order` tie-break; document it or tests
  that assume FIFO will flake.
- `NaN` priority: `NaN - NaN` is `NaN`, and `NaN < 0` is `false`, so `#before` is `false` both ways
  and the tie-break decides. Explicitly reject or normalise `NaN` if that matters.
- Negative and fractional priorities work because the comparator is arithmetic, not a bucket index.
- Floating-point priorities: `a - b` can lose precision for very close huge values; a comparator
  returning `-1/0/1` is safer than subtraction.
- Custom comparator must return a number; returning a boolean silently breaks `#before`
  (`true < 0` is `false`).
- `#order` grows with every enqueue; it is a `Number`, so it is exact until `2^53 - 1`.
- Mutating the `{ value, priority }` object returned by `peek` does not affect the heap (it is a
  copy), unlike returning the internal entry.

### Interview Follow-ups

- **Heapify in `O(n)`:** start at the last parent `(n >> 1) - 1` and sink each down; the proof is
  that most nodes are leaves, so the sum of heights is `O(n)`.
- **Decrease-key:** for Dijkstra you need to lower an existing priority; keep a side `Map` from value
  to index, then bubble up from that index.
- **k largest / k smallest:** keep a heap of size `k` — `O(n log k)` time, `O(k)` space — the
  interview's usual payoff question.
- **Which heap?** Binary is enough; a `d`-ary heap trades shallower height for more comparisons per
  level, and a Fibonacci heap gives `O(1)` amortised decrease-key at high constant cost.
- **Production:** reach for a tested library or a sorted structure when stability and
  decrease-key matter; hand-rolled heaps are easy to get subtly wrong.

### Common Mistakes

- Re-sorting on every `enqueue`, or using `Array#shift`/`splice` on the front, giving `O(n)` per
  operation.
- Off-by-one in the child/parent formulas: children are `2i+1`/`2i+2`, **not** `2i`/`2i+1`.
- Forgetting the sink's child comparison must pick the *better* of the two children, not the left
  one blindly.
- Skipping the `order` tie-break and then claiming stability, which a heap does not provide.
- Returning the internal entry from `peek`, so callers can corrupt priorities.
- Building from an array by `enqueue`-ing each item, which is `O(n log n)` when an `O(n)` heapify is
  available.

### Takeaway

A priority queue is a binary heap in an array: bubble up on insert, sink down on remove, both
`O(log n)`. Lower-priority-number-wins is just the default comparator, and a per-entry insertion
sequence buys stable FIFO ties that a raw heap does not have.

## Implement a Linked List

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement a singly linked list with `Node { value, next }` and a `LinkedList` class:

- `prepend(value)` — insert at the head, `O(1)`.
- `append(value)` — insert at the tail, `O(n)` without a tail pointer (`O(1)` with one).
- `delete(value)` — remove the first node whose value matches, return `true`/`false`.
- `find(value)` — return the index of the first match, or `-1`.
- `reverse()` — reverse the list in place, `O(1)` extra space.
- `get size`, `nodeAt(index)`, `toArray()`.

The contract detail is **value comparison**: use `Object.is` (or `===` with an explicit `NaN`
check) so that `NaN` is found; `===` fails for `NaN` and there is no other natural way to make it
findable.

### Examples

```text
const list = new LinkedList();
list.append(2); list.append(3); list.prepend(1);
list.toArray()        // => [1, 2, 3]
list.size             // => 3
list.find(3)          // => 2
list.find(99)         // => -1
list.delete(2)        // => true
list.toArray()        // => [1, 3]
list.reverse();
list.toArray()        // => [3, 1]
list.delete(99)       // => false
```

### Approach

A singly linked list is a chain of heap-allocated nodes; each node knows only its successor. The
list object holds a `head` reference and a `size` counter. The trade versus an array is explicit:
`O(1)` insert/delete **at the head** (no re-indexing, no resize), but `O(n)` random access and
`O(n)` tail insert unless you keep a `tail` pointer.

The four operations the interviewer cares about:

1. **Insert at head** — allocate a node whose `next` is the old head, then move `head`. The order of
   those two assignments matters; do them in the wrong order and you lose the rest of the list.
2. **Insert at tail** — walk to the last node (`next === null`) and link. Walking is the `O(n)`
   cost; a `tail` pointer makes it `O(1)`, at the price of updating `tail` in `prepend`, `delete`,
   and `reverse` too.
3. **Delete by value** — you need the **predecessor** to unlink. Handle the head separately, then
   walk `current` and inspect `current.next`. Deleting the first match only; returning `false` when
   absent stops a caller from assuming success.
4. **Reverse** — three pointers, `prev`/`current`/`next`. Save `next` before rewiring
   `current.next = prev`, then advance all three. Getting the save order wrong drops nodes; that is
   the number-one bug.

Use a private `#size` rather than recomputing by traversal, or `size` becomes `O(n)`.

### Implementation

```javascript
class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

class LinkedList {
  #head = null;
  #size = 0;

  get size() { return this.#size; }
  get head() { return this.#head; }

  prepend(value) {
    const node = new Node(value);
    node.next = this.#head; // point the new node at the old head FIRST
    this.#head = node;
    this.#size += 1;
    return this;
  }

  append(value) {
    const node = new Node(value);
    if (this.#head === null) {
      this.#head = node;
      this.#size += 1;
      return this;
    }
    let current = this.#head;
    while (current.next !== null) current = current.next; // O(n) walk to the tail
    current.next = node;
    this.#size += 1;
    return this;
  }

  find(value) {
    let index = 0;
    for (let current = this.#head; current !== null; current = current.next) {
      if (Object.is(current.value, value)) return index; // Object.is finds NaN
      index += 1;
    }
    return -1;
  }

  delete(value) {
    if (this.#head === null) return false;

    if (Object.is(this.#head.value, value)) { // deleting the head needs no predecessor
      this.#head = this.#head.next;           // the old head is now unreachable
      this.#size -= 1;
      return true;
    }

    for (let current = this.#head; current.next !== null; current = current.next) {
      if (Object.is(current.next.value, value)) {
        current.next = current.next.next;      // unlink the node after `current`
        this.#size -= 1;
        return true;
      }
    }
    return false;
  }

  nodeAt(index) {
    if (index < 0 || index >= this.#size) return null;
    let current = this.#head;
    for (let i = 0; i < index; i += 1) current = current.next;
    return current;
  }

  reverse() {
    let prev = null;
    let current = this.#head;
    while (current !== null) {
      const next = current.next; // save BEFORE rewiring
      current.next = prev;       // flip the arrow
      prev = current;            // advance prev
      current = next;            // advance current
    }
    this.#head = prev; // the old tail is the new head
    return this;
  }

  toArray() {
    const out = [];
    for (let current = this.#head; current !== null; current = current.next) {
      out.push(current.value);
    }
    return out;
  }
}
```

### Walkthrough

Build `2 -> 3`, prepend `1`, then `delete(2)` and `reverse()`:

```text
append(2):   head=null -> head=[2]->null                       size=1
append(3):   walk: [2] is last -> [2]->[3]->null               size=2
prepend(1):  node1.next = head([2]); head=node1 -> [1]->[2]->[3]->null   size=3
find(3):     index 0 [1], 1 [2], 2 [3] -> return 2
delete(2):   head [1] != 2; current=[1], current.next=[2] matches
             current.next = [2].next = [3]  ->  [1]->[3]->null   size=2
reverse():   prev=null, current=[1]
   iter1: next=[3]; [1].next=null; prev=[1]; current=[3]
   iter2: next=null; [3].next=[1]; prev=[3]; current=null
   head=prev=[3]  ->  [3]->[1]->null
```

`delete(2)` never touched `[1]`'s value; it only rewired `[1].next` past `[2]`, so `[2]` became
garbage. `reverse()` flipped one arrow per iteration and saved `next` before each flip, which is why
no node was lost. Note `delete` compares `current.next`, not `current`, because unlinking needs the
**predecessor**.

### Complexity

Time: `prepend` `O(1)`; `append` `O(n)` (`O(1)` with a `tail` pointer); `find`/`delete`/`nodeAt`
`O(n)`; `reverse` `O(n)`; `toArray` `O(n)`. Space: `O(n)` for the nodes; the iterative `reverse`
uses `O(1)` extra space, a recursive one would use `O(n)` stack.

### Edge Cases

- Empty list: `delete` returns `false`, `find` returns `-1`, `toArray` is `[]`, `reverse` leaves
  `head = null`.
- Single node: `reverse` sets `next = null` and `head` stays that node; `delete` clears the head.
- `NaN`: `Object.is(NaN, NaN)` is `true`, so `find`/`delete` work; `===` would never match.
- Objects and arrays are matched by **identity**, not deep equality — a deliberate contract choice.
- Duplicates: `delete` removes only the first match; documenting this avoids "it deleted the wrong
  one" bug reports.
- Deleting the head: handled before the walk, because the head has no predecessor.
- `nodeAt` bounds-checks, so a negative or out-of-range index returns `null` instead of throwing.
- A `head` getter that leaks nodes lets callers mutate `next` and corrupt `size`; return copies or
  keep traversal inside the class.
- Very long lists: iterative `reverse` is safe; the recursive form can overflow the call stack.

### Interview Follow-ups

- **Add a `tail` pointer:** `append` becomes `O(1)`; the extra work is maintaining `tail` in
  `prepend`, `delete`, and `reverse` (and resetting it when the list empties).
- **Cycle detection:** Floyd's tortoise and hare — one step vs two; they meet iff there is a cycle.
  Follow up with finding the cycle's entry point.
- **Find the middle:** slow/fast pointers, `O(n)` time and `O(1)` space; do it in one pass.
- **Merge two sorted lists:** dummy-head pattern, repeatedly attach the smaller head.
- **Remove the nth node from the end:** two pointers `n` apart, one pass.
- **Reverse in groups of `k`:** `O(n)` time, `O(1)` space; the recursion variant is `O(n/k)` stack.

### Common Mistakes

- Losing the tail of the list by assigning `head` before setting the new node's `next` in `prepend`.
- Comparing with `===` (or a naive `value === target`) so `NaN` can never be found.
- Trying to delete a node by walking `current` and checking `current.value`, then having no way to
  unlink it — you must track the predecessor (or use a dummy head).
- Forgetting `#size` updates, so `size` and the real chain disagree.
- In `reverse`, rewiring `current.next` before saving `next`, which drops every remaining node.
- Implementing the list as a thin wrapper over an array, missing the pointers the question is
  about.

### Takeaway

A linked list trades random access for `O(1)` head mutation. Keep `head` and `size`; insert by
rewiring in the safe order; delete via the predecessor; and reverse with three pointers, saving
`next` before you flip. Use `Object.is` so `NaN` is findable.

## Implement a Doubly Linked List

`Difficulty: Hard` `Probability: Medium`

### Problem

Implement a doubly linked list with `Node { value, prev, next }`, `head`, and `tail`:

- `prepend(value)` / `append(value)` — insert at either end, both `O(1)`.
- `remove(node)` — unlink a node you already hold, `O(1)` (no traversal).
- `removeValue(value)` — find by value (`O(n)`) then unlink (`O(1)`).
- `find(value)` — return the node or `null`.
- `insertBefore(node, value)` — insert just before a held node.
- `reverse()` — reverse in place, `O(n)` time, `O(1)` space.
- `get size`, `toArray()`, `toArrayReverse()`.

The headline contract is `remove(node)` in `O(1)`: the `prev` pointer is what makes deletion
pointer-free of a search, and it is why an **LRU cache** (hash map + doubly linked list) is the
canonical answer to "design a cache with `O(1)` get and put."

### Examples

```text
const dll = new DoublyLinkedList();
const b = dll.append("b");
dll.append("c");
dll.prepend("a");       // list: a <-> b <-> c
dll.toArray()           // => ["a", "b", "c"]
dll.toArrayReverse()    // => ["c", "b", "a"]
dll.remove(b);          // O(1): we already hold the node
dll.toArray()           // => ["a", "c"]
dll.find("c")           // => node for "c"
dll.removeValue("a")    // => true   (head deletion)
dll.toArray()           // => ["c"]
dll.reverse();
dll.toArray()           // => ["c"]  (one element, unchanged)
```

### Approach

Add a `prev` pointer to every node and a `tail` reference to the list. The extra pointer buys three
things a singly linked list cannot do: `O(1)` append **and** `O(1)` prepend, `O(1)` deletion given a
node reference, and backward traversal.

Deletion is the important one, so isolate its four cases by asking two questions per side:

- **Left side:** is the removed node the head (`node.prev === null`)? If so, move `head` forward;
  else bridge `node.prev.next` to `node.next`.
- **Right side:** is it the tail (`node.next === null`)? If so, move `tail` back; else bridge
  `node.next.prev` to `node.prev`.

Setting the removed node's own `prev`/`next` to `null` afterwards detaches it cleanly, so a stale
reference cannot reach back into the list.

`reverse()` swaps `prev` and `next` on every node and then swaps `head` with `tail`. The traversal
subtlety: save the old `next` **before** the swap; afterwards that old `next` lives in
`current.prev`, so advancing means following the saved reference (equivalently, `current.prev`),
otherwise you walk back into the part you already reversed.

Use sentinel (dummy) head/tail nodes to eliminate the null cases entirely — a strong follow-up
answer: the real nodes always sit between two dummies, so unlink is unconditional and insert is
symmetric. The cost is two permanent nodes and slightly less obvious traversal boundaries.

### Implementation

```javascript
class DNode {
  constructor(value) {
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

class DoublyLinkedList {
  #head = null;
  #tail = null;
  #size = 0;

  get size() { return this.#size; }
  get head() { return this.#head; }
  get tail() { return this.#tail; }

  append(value) {
    const node = new DNode(value);
    if (this.#tail === null) {
      this.#head = node;
      this.#tail = node;
    } else {
      node.prev = this.#tail;   // new node points back
      this.#tail.next = node;   // old tail points forward
      this.#tail = node;
    }
    this.#size += 1;
    return node; // return the node so callers can later remove() in O(1)
  }

  prepend(value) {
    const node = new DNode(value);
    if (this.#head === null) {
      this.#head = node;
      this.#tail = node;
    } else {
      node.next = this.#head;
      this.#head.prev = node;
      this.#head = node;
    }
    this.#size += 1;
    return node;
  }

  remove(node) { // O(1): the node carries both neighbours
    if (node === null || node === undefined) return false;

    if (node.prev !== null) node.prev.next = node.next; // bridge left
    else this.#head = node.next;                        // removing the head

    if (node.next !== null) node.next.prev = node.prev; // bridge right
    else this.#tail = node.prev;                        // removing the tail

    node.prev = null; // detach so the node cannot reach into the list
    node.next = null;
    this.#size -= 1;
    return true;
  }

  find(value) {
    for (let current = this.#head; current !== null; current = current.next) {
      if (Object.is(current.value, value)) return current;
    }
    return null;
  }

  removeValue(value) {
    const node = this.find(value); // O(n) search, then O(1) unlink
    return node === null ? false : this.remove(node);
  }

  insertBefore(node, value) { // insert just before a node we already hold
    const fresh = new DNode(value);
    fresh.prev = node.prev;
    fresh.next = node;
    if (node.prev !== null) node.prev.next = fresh; // fix the left neighbour
    else this.#head = fresh;                        // node was the head
    node.prev = fresh;
    this.#size += 1;
    return fresh;
  }

  reverse() {
    let current = this.#head;
    while (current !== null) {
      const next = current.next;
      [current.prev, current.next] = [current.next, current.prev]; // swap the arrows
      current = next;
    }
    [this.#head, this.#tail] = [this.#tail, this.#head]; // ends trade places
    return this;
  }

  toArray() {
    const out = [];
    for (let current = this.#head; current !== null; current = current.next) {
      out.push(current.value);
    }
    return out;
  }

  toArrayReverse() {
    const out = [];
    for (let current = this.#tail; current !== null; current = current.prev) {
      out.push(current.value);
    }
    return out;
  }
}
```

### Walkthrough

```javascript
const list = new DoublyLinkedList();
list.append(1);
list.append(2);
list.prepend(0);
list.toArray();          // => [0, 1, 2]

const node = list.find(1); // the middle node, found by value in O(n)
list.remove(node);         // ...then unlinked in O(1): bridge 0 <-> 2
list.toArray();          // => [0, 2]
list.toArrayReverse();   // => [2, 0] (walks back from the tail)
list.size;               // => 2
```

The `remove` is the whole point: `node.prev` (`0`) and `node.next` (`2`) are both known,
so neither side needs a search. The head/tail checks handle the ends — removing `0`
would move `#head` to `2` instead of bridging — and the removed node's own pointers are
nulled so a stale reference cannot silently stay linked.

### Complexity

Time: `append`/`prepend`/`remove(node)` are `O(1)`; `find`/`removeValue` are `O(n)`;
`reverse` and both `toArray` variants are `O(n)`. Space: `O(n)` for the nodes — each
node pays one extra pointer over a singly linked list.

### Edge Cases

- Empty list: `#head`/`#tail` are `null`, `size` is `0`; `find` returns `null`,
  `toArray()` returns `[]`.
- Single node: it is both head and tail; removing it must clear *both* references.
- Removing the head or tail: the bridge logic is skipped and the end pointer moves.
- `remove` on a node from a *different* list: the pointers still splice, corrupting both
  lists — a production version tags nodes with their owner or documents the contract.
- `#size` must change on every mutation path, including the empty-list branch.

### Interview Follow-ups

- **LRU cache:** `Map` (key → node) plus this list (recency order) — the canonical use.
- **Reverse in place:** swap `next`/`prev` on every node, then swap `#head`/`#tail`.
- **`insertBefore`/`insertAfter` with a held node:** `O(1)` splices, same bridge pattern.
- **Why not an array?** `unshift`/`splice` at the front are `O(n)`; the list is `O(1)`.

### Common Mistakes

- Forgetting `#size += 1` / `-= 1` on one of the branches (usually the empty-list one).
- Removing the last node but leaving `#tail` (or `#head`) pointing at it.
- Linking in the wrong order in `append`: `node.prev` must be read from the *old* tail
  before `#tail` moves.
- Not nulling the removed node's pointers, so `node.next` still reaches into the list.
- Using `removeValue` in a loop for bulk deletion — each deletion is `O(1)` but each
  search re-scans, so it degrades to `O(n²)`.

### Takeaway

The `prev` pointer buys exactly one thing: deletion with a held node in `O(1)`. That is
why every LRU cache is a hash map plus a doubly linked list — and the reason to reach
for this structure in an interview.






## Implement a Hash Map (Separate Chaining)

`Difficulty: Medium` `Probability: High`

### Problem

Implement a hash map from scratch with `set(key, value)`, `get(key)`, `has(key)`, `delete(key)`,
a `size` count, and iteration via `keys()`, `values()`, and `entries()`. Use **separate chaining**
(each bucket holds a list of entries) and **resize/rehash** when the load factor crosses a
threshold so operations stay amortised `O(1)`.

The contract, stated before any code:

- `set` on an existing key **overwrites** the value and must **not** change `size`.
- `get` returns `undefined` for a missing key — indistinguishable from a stored `undefined`,
  exactly like `Map.prototype.get`.
- `delete` returns `true` if the key was present, `false` otherwise.
- `size` is maintained incrementally; it never walks the buckets.
- Keys here are normalised with `String(key)`, so they are compared as strings. A real `Map`
  compares keys with **SameValueZero** and treats distinct objects as distinct keys; this
  teaching implementation does not. Say this out loud in an interview.

### Examples

```text
const m = new HashMap();
m.set("a", 1).set("b", 2).set("a", 99);
m.size            // => 2        (overwrite did not grow it)
m.get("a")        // => 99
m.get("missing")  // => undefined
m.has("b")        // => true
m.delete("b")     // => true
m.delete("b")     // => false
[...m.keys()]     // => ["a"]
```

### Approach

A hash map is an **array of buckets** plus a hash function that maps a key to a bucket index.
Separate chaining stores, at each bucket, a small list of `[key, value]` pairs. Lookup hashes the
key, then scans that one chain comparing keys.

1. **Hash.** FNV-1a over the UTF-16 code units of `String(key)`. `Math.imul` keeps the multiply
   in 32-bit space, and `>>> 0` makes the result unsigned, so the modulo below is never negative.
2. **Index.** `hash % capacity`. Only use `hash & (capacity - 1)` when capacity is a power of two.
3. **Insert.** Scan the chain for an equal key: if found, overwrite; otherwise push a new pair and
   increment `size`.
4. **Resize.** When `size / capacity > loadFactor` (typically `0.75`), allocate a bucket array
   twice as large and **rehash** every entry, because a key's index depends on capacity.

The invariant: every live key appears in exactly one bucket at the index its hash resolves to, and
`size` equals the number of pairs across all buckets. A bounded load factor keeps chains short, so
the expected chain length is `O(1)`.

### Implementation

```javascript
class HashMap {
  constructor(initialCapacity = 8, loadFactor = 0.75) {
    this.capacity = initialCapacity; // number of buckets
    this.loadFactor = loadFactor;    // resize when size / capacity exceeds this
    this.buckets = Array.from({ length: initialCapacity }, () => []);
    this.size = 0;
  }

  // FNV-1a: cheap and well-distributed for short string keys.
  static hashString(str) {
    let hash = 2166136261;                 // 32-bit offset basis
    for (let i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);    // FNV prime, wraps at 32 bits
    }
    return hash >>> 0;                     // unsigned, so % is non-negative
  }

  bucketIndex(key) {
    const normalized = typeof key === "string" ? key : String(key);
    return HashMap.hashString(normalized) % this.capacity;
  }

  set(key, value) {
    const bucket = this.buckets[this.bucketIndex(key)];
    for (let i = 0; i < bucket.length; i += 1) {
      if (bucket[i][0] === key) {
        bucket[i][1] = value;              // overwrite: size is unchanged
        return this;
      }
    }
    bucket.push([key, value]);
    this.size += 1;
    if (this.size / this.capacity > this.loadFactor) this.#resize();
    return this;
  }


  get(key) {
    const bucket = this.buckets[this.bucketIndex(key)];
    for (let i = 0; i < bucket.length; i += 1) {
      if (bucket[i][0] === key) return bucket[i][1];
    }
    return undefined;
  }

  has(key) {
    const bucket = this.buckets[this.bucketIndex(key)];
    for (let i = 0; i < bucket.length; i += 1) {
      if (bucket[i][0] === key) return true;
    }
    return false;
  }

  delete(key) {
    const bucket = this.buckets[this.bucketIndex(key)];
    for (let i = 0; i < bucket.length; i += 1) {
      if (bucket[i][0] === key) {
        bucket.splice(i, 1);               // O(chain length), not O(capacity)
        this.size -= 1;
        return true;
      }
    }
    return false;
  }

  *keys() {
    for (const bucket of this.buckets) for (const [key] of bucket) yield key;
  }
  *values() {
    for (const bucket of this.buckets) for (const [, value] of bucket) yield value;
  }
  *entries() {
    for (const bucket of this.buckets) for (const entry of bucket) yield entry;
  }
  [Symbol.iterator]() {
    return this.entries();
  }

  #resize() {
    const oldBuckets = this.buckets;
    this.capacity *= 2;
    this.buckets = Array.from({ length: this.capacity }, () => []);
    this.size = 0;                         // re-set entry by entry so the count is exact
    for (const bucket of oldBuckets) {
      for (const [key, value] of bucket) this.set(key, value);
    }
  }
}
```

### Walkthrough

Take `capacity = 4`, `loadFactor = 0.75` (resize when `size > 3`). With this FNV-1a, the indices at
capacity 4 are `"a" -> 0`, `"b" -> 1`, `"c" -> 2`, `"d" -> 3`.

1. `set("a", 1)` → bucket 0 empty → push; `size = 1`.
2. `set("b", 2)` → bucket 1; `size = 2`.
3. `set("c", 3)` → bucket 2; `size = 3`. `3 / 4 = 0.75`, which is **not** `> 0.75`, so no resize.
4. `set("d", 4)` → bucket 3; `size = 4`. `4 / 4 = 1 > 0.75` → `#resize`.
5. `#resize` doubles capacity to 8, empties the buckets, resets `size = 0`, and re-inserts all four
   keys. Their indices are recomputed modulo 8: `"a" -> 4`, `"b" -> 5`, `"c" -> 2`, `"d" -> 3`.

The rehash is mandatory: `"a"` sat in bucket 0 at capacity 4 and must move to bucket 4 at capacity 8,
because the index is `hash % capacity`, not a fixed slot.

To see chaining, at capacity 8 the keys `"a"`, `"age"`, `"ega"`, and `"eman"` all hash to bucket 4.
`set` appends each as a new pair, and `get("ega")` walks bucket 4 comparing keys until it reaches
`"ega"` — three comparisons. With more keys, resize keeps that chain short.

### Complexity

Time: `set`/`get`/`has`/`delete` are **`O(1)` expected**, `O(n)` worst case when every key collides
into one chain. `#resize` is `O(n)`, but it happens after `Ω(capacity)` inserts, so the amortised
cost per insert is `O(1)`. Space: `O(n + capacity)` — `n` pairs plus the bucket array.

### Edge Cases

- **Object keys collapse.** `String({}) === "[object Object]"`, so all plain objects land in one
  bucket and overwrite each other. This version only claims string/number keys.
- **`NaN` keys break equality.** `String(NaN) === "NaN"` puts it in a bucket, but `NaN === NaN` is
  `false`, so `get(NaN)` never finds it. A real `Map` uses SameValueZero; fix with
  `a === b || (a !== a && b !== b)`.
- **`-0` and `0`** normalise to `"0"` and compare equal, matching SameValueZero (not `Object.is`).
- **Stored `undefined`** is indistinguishable from a missing key in `get`, just like `Map`. Use
  `has` to disambiguate.
- **Iteration order changes on resize.** Chaining yields bucket order, so entries jump around. A
  real `Map` guarantees insertion order; keep a linked list alongside the buckets if you need it.
- **Shrinking is not handled.** Deleting many keys leaves a large, sparse bucket array. Add
  `#resizeDown` when `size / capacity < 0.1`.
- **A chain longer than expected** means a weak hash or a hostile key set; consider a tree per
  bucket (Java-style) to bound the worst case at `O(log n)`.
- **`size` is a plain field**, so callers can corrupt it. A real implementation hides it behind a
  getter and a private counter.

### Interview Follow-ups

- **Open addressing instead of chaining:** probe linearly (`(index + i) % capacity`) and store the
  key in the slot itself; delete needs tombstones or you break probe chains.
- **LRU-ordered map:** thread a doubly linked list through the entries so `get` can move a key to
  the front in `O(1)` — this is exactly the next-but-one problem.
- **SameValueZero keys:** keep a wrapper object per key and compare with `===` (objects are unique),
  or store a `Map` of primitives.
- **Why 0.75?** Lower load factors mean shorter chains but more memory; 0.75 is the usual
  time/space compromise (`HashMap` in Java uses the same default).
- **Production:** use `Map`. Its hashing is native, ordered, and handles arbitrary keys.

### Common Mistakes

- Forgetting `>>> 0`, so a negative hash indexes `buckets[-3]` and silently vanishes.
- Using `& (capacity - 1)` without a power-of-two capacity.
- Recomputing `size` by scanning on every call instead of maintaining it.
- Resetting `size = 0` in `#resize` and then forgetting that `set` must re-count, ending at `0`.
- Comparing keys with `==`, which merges `1` and `"1"` inconsistently with the hash normalisation.

### Takeaway

A hash map is an array of chains plus a hash function and a load factor. `set` overwrites, `get`
scans one chain, and `#resize` rehashes everything because the index depends on capacity. Get the
SameValueZero and iteration-order caveats right and you have described `Map`.

## Implement a Set

`Difficulty: Easy` `Probability: High`

### Problem

Implement a `Set`: `add(value)`, `has(value)`, `delete(value)`, `clear()`, a `size` getter, and
iteration via `values()`/`keys()`/`forEach()`/`Symbol.iterator`. Membership must be `O(1)` on
average, duplicates must collapse, and the `add`/`delete` chaining style of the native API is worth
preserving.

Contract:

- `add` on a value that already exists is a **no-op** and does not change `size`.
- `add` returns the set, so `s.add(1).add(2)` chains; `delete` returns a boolean.
- `Set` has **no indices**, so `values()` and `keys()` are the same iterator (unlike `Map`).
- `forEach(callback, thisArg)` calls `callback.call(thisArg, value, value, set)`; the return value
  is ignored. The order is insertion order for a native `Set`.
- Membership uses **SameValueZero**: `NaN` equals `NaN`, and `-0` equals `0`.

Reuse the `HashMap` from the previous problem: a set is a map whose keys and values are the same
value. That is not a shortcut — it is how `Set` is specified relative to `Map`.

### Examples

```text
const s = new HashSet();
s.add(1).add(2).add(2);
s.size            // => 2       (duplicate ignored)
s.has(2)          // => true
s.delete(2)       // => true
s.delete(2)       // => false
[...s]            // => [1]

const a = new HashSet(); a.add(1); a.add(2);
const b = new HashSet(); b.add(2); b.add(3);
[...a.union(b)]        // => [1, 2, 3]
[...a.intersection(b)] // => [2]
[...a.difference(b)]   // => [1]
```

### Approach

A set is a map with no values, so delegate all membership work to `HashMap` and add only the set
vocabulary.

1. Store `key -> key` so the map's overwrite-on-existing behaviour *is* the set's no-op-on-duplicate
   behaviour, and `size` is maintained for free.
2. `values()` `yield*` the map's keys; `keys()` is an alias, because a set has no separate index.
3. `forEach` mirrors the native signature `(value, value, set)` and honours `thisArg` with `.call`.
4. `[Symbol.iterator]` returns `values()`, which is what makes `[...set]`, `for...of`, and `new
   Set(iterable)` work.
5. Bulk operations reuse iteration: `union` adds both sides, `intersection` iterates the **smaller**
   set and probes the larger one (fewer lookups), `difference` keeps values the other set lacks.

The alternative — a plain object keyed by `String(value)` — collapses `1` and `"1"`, cannot represent
`NaN`, and is vulnerable to prototype keys. Delegating to the hash map is the honest design; the
cost is the same normalisation caveat noted in that problem.

### Implementation

```javascript
class HashSet {
  constructor(initialCapacity = 8) {
    this.map = new HashMap(initialCapacity); // key -> key
  }

  get size() {
    return this.map.size;
  }

  add(value) {
    this.map.set(value, value); // overwriting is the duplicate no-op
    return this;
  }

  has(value) {
    return this.map.has(value);
  }

  delete(value) {
    return this.map.delete(value);
  }

  clear() {
    this.map = new HashMap();
    return this;
  }


  *values() {
    yield* this.map.keys(); // a set keeps no values of its own
  }

  keys() {
    return this.values(); // native Set.keys === Set.values
  }

  forEach(callback, thisArg) {
    for (const value of this.values()) {
      callback.call(thisArg, value, value, this); // (value, value, set)
    }
  }

  [Symbol.iterator]() {
    return this.values();
  }

  union(other) {
    const result = new HashSet();
    for (const value of this) result.add(value);
    for (const value of other) result.add(value);
    return result;
  }

  intersection(other) {
    const result = new HashSet();
    // Iterate the smaller set so total lookups are min(|a|, |b|).
    const [small, large] = this.size <= other.size ? [this, other] : [other, this];
    for (const value of small) if (large.has(value)) result.add(value);
    return result;
  }

  difference(other) {
    const result = new HashSet();
    for (const value of this) if (!other.has(value)) result.add(value);
    return result;
  }
}
```

### Walkthrough

`s.add(1).add(2).add(2)` with capacity 8: FNV-1a puts `1` in some bucket and `2` in another.

1. `add(1)` → `map.set(1, 1)` → bucket empty → push; `map.size = 1`; `add` returns `s`.
2. `add(2)` → new key → push; `map.size = 2`.
3. `add(2)` again → `set` finds the existing pair, overwrites the value (`2 -> 2`), returns without
   incrementing, so `s.size` stays `2` and the set has no duplicate.

Now `intersection`: `a = {1, 2}`, `b = {2, 3}`, both size 2, so `small = a`. The loop probes
`b.has(1)` → `false` (skip), then `b.has(2)` → `true` (add). Result iterates as `[2]`.

### Complexity

Time: `add`/`has`/`delete` are `O(1)` expected (delegated to the hash map), `O(n)` worst case on hash
collisions. `forEach`/`values` are `O(capacity + n)`. `union` is `O(n + m)`, `intersection` and
`difference` are `O(min(n, m))` lookups. Space: `O(n)`.

### Edge Cases

- **Duplicate adds are no-ops** — guaranteed by the map's overwrite path, not by an extra `has`
  check (which would double the hashing cost).
- **`NaN` and `-0`:** the set inherits the map's caveat. Native `Set` stores `NaN` once and treats
  `-0`/`0` as one value; this version cannot until the key comparison uses SameValueZero.
- **Object values collapse** to one entry because `String({})` is constant. Fine for primitive
  membership, wrong for object identity.
- **`forEach` mutation:** adding during iteration may or may not be visited, depending on buckets
  and resize. Native `Set` visits values added before iteration ends; do not rely on it.
- **`clear()` replaces the backing map**, so iterators created before the call keep yielding from
  the old buckets — again unlike native, where they finish against the live set.
- **`new HashSet(iterable)`** is not implemented; a native-style constructor would loop the iterable
  and `add` each element.
- **Empty set operations:** `union` with an empty set copies the other side; `intersection` with an
  empty set is `O(1)` because the smaller side has size 0.

### Interview Follow-ups

- **`new HashSet(iterable)` + `size` from a getter** is most of the native constructor; add the
  loop and you can consume any iterable.
- **`isSubsetOf` / `isSupersetOf`:** iterate the candidate subset and probe the other set, returning
  early on the first miss.
- **Symmetric difference:** `union` minus `intersection`, or iterate both sets and add values the
  other lacks.
- **Object identity without SameValueZero:** assign each object a `Symbol`/`WeakMap` id, or keep a
  `Map` keyed by the object itself.
- **Production:** use native `Set`; it is ordered, handles arbitrary keys, and its bulk methods
  (`union`, `intersection`, `difference`, `symmetricDifference`, `isSubsetOf`) exist in ES2025.

### Common Mistakes

- Reimplementing membership with `indexOf`, which is `O(n)` and uses `===` (so `NaN` never matches).
- Adding a `has` check before `add` — redundant, because `add` already dedupes.
- Using an object keyed by `value` without guarding `__proto__`, `constructor`, and `toString`.
- Forgetting that `Set.keys` and `Set.values` are the same function.
- Building `union`/`intersection` with array methods, silently allowing duplicates.

### Takeaway

A set is a map with the value doubling as the key: dedupe and `size` come from the map's overwrite
rule, and iteration comes from its keys. The only genuinely set-specific decisions are SameValueZero
key comparison and the `(value, value, set)` `forEach` signature.

## Implement an LRU Cache

`Difficulty: Medium` `Probability: Very High`

### Problem

Implement `LRUCache(capacity)` with `get(key)` and `put(key, value)`, both **`O(1)`**. The cache
holds at most `capacity` entries; `get` returns the value (or `-1` when absent) and marks the key as
**most recently used**; `put` inserts or updates and marks the key most recent, evicting the
**least recently used** key when the cache is full.

Contract:

- `capacity` must be a positive integer; otherwise throw.
- `get` on a missing key returns `-1` and does **not** disturb recency.
- `put` on an existing key updates the value and promotes it; it must not evict.
- Eviction removes exactly one key, the least recently used, only when inserting a **new** key into
  a full cache.
- Both operations are `O(1)` — no scanning to find the LRU.

The trick is that JavaScript's `Map` **preserves insertion order**, so the oldest key is always the
first one the iterator yields.

### Examples

```text
const lru = new LRUCache(2);
lru.put(1, 1);   // cache: {1=1}
lru.put(2, 2);   // cache: {1=1, 2=2}
lru.get(1);      // => 1     (1 becomes most recent: {2=2, 1=1})
lru.put(3, 3);   // evicts 2 (LRU)          -> {1=1, 3=3}
lru.get(2);      // => -1
lru.get(3);      // => 3
lru.put(3, 30);  // update, no eviction     -> {1=1, 3=30}
lru.put(4, 4);   // evicts 1                -> {3=30, 4=4}
```

### Approach

`Map` is a hash table **plus a linked list of entries in insertion order**, so iteration is ordered
and `delete`/`set` are `O(1)`. Use that order as the recency order: the first iterated key is the
least recently used, the last is the most recently used.

- **Why `Map` preserves insertion order:** the spec stores entries in `[[MapData]]`, an ordered
  list. `Map.prototype.set` on a **new** key appends an entry; on an **existing** key it updates the
  value in place and leaves the position untouched. Iteration (`keys`, `values`, `entries`,
  `forEach`, `Symbol.iterator`) walks that list start to end. So reordering requires removing and
  re-adding the key — you cannot promote an existing key by calling `set` again.
- **The re-insertion trick:** to mark a key most recent, `delete` it, then `set` it again. The fresh
  entry is appended at the end, which is the MRU end. This is the whole LRU mechanism.
- **Eviction:** when a new key arrives at capacity, read `cache.keys().next().value` — the first key
  in insertion order, i.e. the LRU — and `delete` it.
- Do the `has` check for `get` rather than comparing `get(...) === undefined`, because a stored
  `undefined` is a legitimate value.

The alternative — a doubly linked list of nodes plus a hash map from key to node — does the same in
`O(1)` with explicit pointers and is what you write when the language has no ordered map. Mention it;
the `Map` version is shorter and just as correct.

### Implementation

```javascript
class LRUCache {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError("capacity must be a positive integer");
    }
    this.capacity = capacity;
    this.cache = new Map(); // key -> value; insertion order = LRU ... MRU
  }

  get(key) {
    if (!this.cache.has(key)) return -1;
    const value = this.cache.get(key);
    this.cache.delete(key); // drop the old, older position ...
    this.cache.set(key, value); // ... and append at the MRU end
    return value;
  }


  put(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key); // remove so the re-insert lands at the MRU end
    } else if (this.cache.size >= this.capacity) {
      const lru = this.cache.keys().next().value; // first iterated key = least recent
      this.cache.delete(lru);
    }
    this.cache.set(key, value);
  }

  // Handy for debugging and tests: LRU -> MRU.
  keys() {
    return [...this.cache.keys()];
  }
}
```

### Walkthrough

`new LRUCache(2)`, then `put(1, 1)`, `put(2, 2)`, `get(1)`, `put(3, 3)`:

1. `put(1, 1)`: not present, `size(0) < 2` → `set` appends. Map order `1`.
2. `put(2, 2)`: not present, `size(1) < 2` → append. Map order `1, 2`.
3. `get(1)`: present → `delete(1)` then `set(1, 1)`; the entry is appended after `2`. Order `2, 1`.
   `1` is now MRU, `2` is LRU.
4. `put(3, 3)`: new key and `size(2) >= 2`, so evict `keys().next().value` = `2`. Order `1`, then
   append `3` → `1, 3`.
5. `get(2)` → `-1`; `get(3)` → `3`; `put(3, 30)` finds `3` present, deletes and re-adds it, so no
   eviction and order becomes `1, 30`; `put(4, 4)` evicts `1` and yields `3, 4`.

The recency list is exactly `Map`'s insertion order at every step — no extra bookkeeping.

### Complexity

Time: `get` and `put` are `O(1)` expected — `Map.has/get/set/delete` are `O(1)`, and
`keys().next()` is `O(1)`. Space: `O(capacity)` entries.

### Edge Cases

- **Capacity 1:** `put` on a new key first evicts the single resident, then inserts; every `put` of
  a new key replaces the cache.
- **Updating an existing key** must not evict: the `has` branch removes the old entry, bringing the
  size to `capacity - 1` before the insert.
- **Stored `undefined`:** `get` uses `has`, so `get(k)` returns `undefined` for a present key and
  `-1` for a miss. Returning `undefined` for a miss (as `Map.get` would) loses that distinction.
- **`NaN`, `-0`, object keys:** `Map` uses SameValueZero, so all three behave natively — one of the
  reasons to prefer `Map` over a hand-rolled hash map here.
- **`get` on a miss does not reorder** the cache; only hits promote.
- **Double lookup in `get`:** `has` + `get` hashes twice. If values are never `undefined`, a single
  `get` plus an `undefined` check is faster, at the cost of the ambiguity above.
- **Eviction callback:** production caches often need `onEvict(key, value)`; call it from the
  `delete(lru)` branch.
- **Large `capacity`** does not preallocate; `Map` grows on demand.

### Interview Follow-ups

- **Doubly linked list + hash map:** store `{key, value, prev, next}` nodes and a `head`/`tail`
  sentinel; `get` unlinks and relinks to the tail, eviction drops the head. Same `O(1)`, and it is
  the expected answer when the interviewer forbids relying on `Map` order.
- **LFU instead of LRU:** keep a frequency count per key (a min-heap or frequency buckets) and evict
  the least frequently used, breaking ties by recency.
- **TTL + LRU:** add an expiry timestamp per entry and check it in `get`; this is the next problem.
- **Resizing capacity:** shrinking must evict from the LRU end until `size <= capacity`.
- **Concurrency:** a single-threaded event loop makes JS LRU caches race-free per tick, but async
  `onEvict` handlers can interleave — note that if asked.

### Common Mistakes

- Using an array with `push`/`shift`: `shift` is `O(n)`, so `put` becomes `O(n)`.
- Relying on `map.set` to promote an existing key — it does **not** change insertion order, so
  recency silently stops updating.
- Forgetting to promote on `get`, which degrades the cache to FIFO.
- Finding the LRU by iterating (`for (const k of map.keys()) last = k`), which is `O(n)`.
- Checking `this.cache.get(key) === undefined` and therefore treating a stored `undefined` as a miss.
- Evicting before checking whether the key already exists.

### Takeaway

`Map`'s insertion order is a ready-made recency list, and `delete` + `set` is the `O(1)` "move to
most recent" operation. Get the promotion and eviction order right and the whole cache is ten lines.

## Implement a TTL Cache

`Difficulty: Medium` `Probability: Medium`

### Problem

Implement `TTLCache(ttlMs)` where every entry expires `ttlMs` after it is written. Support
`set(key, value, ttl?)`, `get(key)`, `has(key)`, `delete(key)`, `clear()`, a `size` getter, and
`sweep()` to proactively drop expired entries. Set `ttl` per entry, defaulting to the cache's TTL.

Contract:

- An entry is **expired** when `Date.now() >= expiresAt` (`<=` in the "expiresAt is past" sense);
  pick one boundary and keep it consistent.
- `get` on an expired key removes the entry and returns `undefined`; `has` returns `false` and also
  removes it. Expiry is enforced on **access** even if `sweep` never runs.
- `size` is the raw map size, so it may count entries that are expired but not yet removed. Call
  `sweep()` first if the caller needs a live count.
- `set` on an existing key **resets** its deadline (new value, new expiry, new position).

Two strategies, and you should name both: **lazy expiry** (check the timestamp whenever a key is
read, delete on the spot) and **eager expiry** (a timer calls `sweep()` periodically so memory is
bounded even for keys nobody reads). Production caches usually combine them.

### Examples

```text
const cache = new TTLCache(1000);        // entries live 1000 ms
cache.set("a", 1);                        // at t = 0    -> expires at 1000
cache.set("b", 2, 5000);                  // at t = 0    -> expires at 5000
cache.get("a");                           // => 1        (t = 900, still live)
cache.get("a");                           // => undefined (t = 1100, expired + removed)
cache.has("b");                           // => true
cache.size;                               // => 1
cache.sweep();                            // => 0 removed (b is still live)
cache.set("c", 3, 0);                     // ttl 0 -> already expired on next access
```

### Approach

Store a wrapper per entry: `{ value, expiresAt }`. `expiresAt` is an absolute timestamp, computed
once when the entry is written — never a countdown that you decrement, which would drift and touch
every entry on every tick.

1. **Absolute deadlines.** `expiresAt = Date.now() + ttl`. Absolute values compare in `O(1)` and do
   not need per-entry maintenance.
2. **Lazy check on read.** `get`/`has` compute `Date.now()` and compare. Expired entries are deleted
   in place, so the common path stays `O(1)` and a read-heavy cache reaches a steady state.
3. **Sweep for the untouched.** A key nobody reads would otherwise live forever. `sweep()` walks the
   map once (deleting the current entry during `Map` iteration is safe) and removes the stale ones.
   Drive it from a timer in production: `setInterval(() => cache.sweep(), intervalMs)`.
4. **`maxSize` as a backstop.** A shallow sweep cannot bound a flood of writes to never-read keys;
   evict FIFO once the map exceeds `maxSize` (combine with LRU for full semantics).

Clock honesty: `Date.now()` is wall-clock and can jump backwards (NTP, manual change), making an
entry live longer or expire early. `performance.now()` is monotonic and better for durations, but it
is relative to the process, so data persisted across reloads still needs `Date.now()`. State the
choice.

### Implementation

```javascript
class TTLCache {
  constructor(ttlMs, { maxSize = Infinity, onExpire } = {}) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError("ttlMs must be a positive number");
    }
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;   // FIFO backstop so unread keys cannot grow forever
    this.onExpire = onExpire;
    this.entries = new Map(); // key -> { value, expiresAt }
  }

  #isExpired(entry, now = Date.now()) {
    return entry.expiresAt <= now;
  }


  set(key, value, ttlMs = this.ttlMs) {
    this.entries.delete(key); // re-insert so the position is fresh
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.entries.size > this.maxSize) {
      this.#evict(this.entries.keys().next().value); // FIFO backstop
    }
    return this;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;   // absent
    if (this.#isExpired(entry)) {                // present but stale
      this.#evict(key);
      return undefined;
    }
    return entry.value;                          // note: entry is always an object,
  }                                              // so `undefined` unambiguously means "absent"

  has(key) {
    const entry = this.entries.get(key);
    if (entry === undefined) return false;
    if (this.#isExpired(entry)) {
      this.#evict(key);
      return false;
    }
    return true;
  }

  delete(key) {
    return this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size; // may include expired, unswept entries
  }

  sweep() {
    const now = Date.now(); // one clock read for the whole pass
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key); // deleting the current entry mid-iteration is safe
        this.onExpire?.(key, entry.value);
        removed += 1;
      }
    }
    return removed;
  }

  #evict(key) {
    const entry = this.entries.get(key);
    if (entry !== undefined) {
      this.entries.delete(key);
      this.onExpire?.(key, entry.value);
    }
  }
}
```

### Walkthrough

`const cache = new TTLCache(1000)` and a running clock:

1. At `t = 0`, `set("a", 1)` → `entries` holds `"a" -> { value: 1, expiresAt: 1000 }`.
2. At `t = 0`, `set("b", 2, 5000)` → `"b" -> { value: 2, expiresAt: 5000 }`; the per-entry TTL
   overrides the default.
3. At `t = 900`, `get("a")`: `#isExpired` compares `1000 <= 900` → `false`, so it returns `1` and
   leaves the entry in place.
4. At `t = 1100`, `get("a")`: `1000 <= 1100` → `true`, so `#evict("a")` removes it and `get`
   returns `undefined`.
5. At `t = 1100`, `size` is `1` — `"b"` remains — and `sweep()` finds `5000 <= 1100` false, so it
   removes nothing and returns `0`.
6. `set("c", 3, 0)` sets `expiresAt = now + 0`, so the very next `get("c")` sees `now <= now` and
   removes it. A non-positive per-entry TTL is an entry that expires immediately, not an error.

If `maxSize` were `2`, step 6 would first evict `"b"` (the oldest insertion) because inserting `"c"`
would push `size` to `3`.

### Complexity

Time: `set`, `get`, `has`, `delete` are `O(1)` expected (one `Map` operation plus one clock read).
`sweep` is `O(n)`. Space: `O(n)` for live entries, and unbounded in principle until `sweep` or
`maxSize` runs.

### Edge Cases

- **Expired but unswept keys still count in `size`.** Lazy expiry only removes what is accessed; call
  `sweep()` before trusting `size`, or track a live counter.
- **Boundary condition:** `expiresAt <= now` makes an entry expire at exactly its deadline. Using
  `<` makes it live one millisecond longer. Pick one and test the boundary.
- **`ttl <= 0`:** rejected in the constructor, but allowed per entry, where it means "expire on the
  next access."
- **`Date.now()` moves backwards** (NTP correction, DST is irrelevant since it is UTC epoch
  milliseconds, but manual changes matter). Entries can outlive their TTL. `performance.now()` is
  monotonic; use it for duration, `Date.now()` when the expiry must survive a reload.
- **Interval leak:** an eager `setInterval` keeps a Node process alive. Call `.unref()` in Node and
  `clearInterval` in `clear()`/`dispose()`. Browsers have no `unref`.
- **Storing `undefined` as a value** is fine here: the map holds an entry *object*, so
  `entries.get(key) === undefined` means "absent", never "present with `undefined`".
- **`onExpire` throwing** propagates out of `get`/`sweep`; wrap it if the cache must stay alive.
- **Many short-lived keys** can grow the map faster than sweeping; enforce `maxSize`.

### Interview Follow-ups

- **Combine TTL with LRU:** order by recency for eviction and check the deadline on read, so hot keys
  survive and stale ones die.
- **Sliding expiration:** on `get`, if the entry is live, push `expiresAt` forward — turns a fixed
  TTL into an idle timeout.
- **Clock abstraction:** inject `now: () => number` so tests can advance time without real timers.
- **Bounded memory without a timer:** cap `maxSize` and sweep probabilistically every `k` writes
  (sampled expiry), the trick Redis uses.
- **`WeakRef`/`FinalizationRegistry`:** only for object-keyed caches; do not use finalizers for
  correctness-critical eviction.

### Common Mistakes

- Decrementing a countdown per tick instead of storing an absolute `expiresAt`.
- Using one shared `setTimeout` whose delay equals the first TTL, then expecting later entries to
  expire on time.
- Never deleting expired entries, so the "cache" leaks memory for keys nobody reads.
- Computing `Date.now()` once at module load and comparing against a frozen `now`.
- Forgetting that `size` counts expired entries, and reporting unbounded growth.
- Trusting `Date.now()` for durations across reloads or suspend/resume.

### Takeaway

Store an absolute `expiresAt` per entry, enforce it lazily on access, and sweep periodically so
keys nobody touches can still die. State your clock and boundary choices, and add `maxSize` as the
backstop that makes memory provably bounded.

## Implement a Trie

`Difficulty: Medium` `Probability: High`

### Problem

Implement a `Trie` with `insert(word)`, `search(word)`, and `startsWith(prefix)`.

Contract:

- `insert` adds a word, creating one node per character; the node reached by the last character is
  flagged as a **word terminator**.
- `search(word)` is `true` only when the walk consumes every character **and** the final node is a
  terminator. `"app"` is not a word just because `"apple"` was inserted.
- `startsWith(prefix)` is `true` when the walk consumes every character, regardless of the
  terminator — it only asks whether the path exists.
- The **terminator flag** is the whole difference between the two queries. Without it, a trie cannot
  distinguish "this is a word" from "this is a prefix of a longer word".
- Use `for...of` (code points), not `split("")` (UTF-16 units), so an emoji is one node. Combining
  and ZWJ sequences still need `Intl.Segmenter` if you claim grapheme correctness.

### Examples

```text
const t = new Trie();
t.insert("app").insert("apple").insert("apt");

t.search("app")       // => true
t.search("ap")        // => false   (path exists, but no terminator)
t.search("apple")     // => true
t.search("apples")    // => false
t.startsWith("ap")    // => true
t.startsWith("aq")    // => false
t.search("")          // => false   (empty string was never inserted)
t.startsWith("")      // => true    (the empty prefix always has a path)
```

### Approach

A trie is a tree where each edge is one character and each node represents the prefix spelled by the
path from the root. The root is the empty prefix.

1. **Node shape.** `children: Map<char, TrieNode>` plus `isEnd: boolean`. A `Map` avoids prototype
   keys entirely — using a plain object means a word containing `"__proto__"` or `"constructor"` can
   hit the prototype rather than a child. `Map` also keeps children insertion-ordered.
2. **`insert`.** Walk from the root, creating a child node whenever the next character has none, then
   set `isEnd = true` on the final node. Intermediate nodes are never terminators.
3. **`search` vs `startsWith`.** Factor out a `#walk(str)` helper that returns the node at the end of
   the path or `undefined` if it breaks. `search` requires `node && node.isEnd`; `startsWith`
   requires only `node !== undefined`. Both are the same loop with a different final test.
4. **Why the flag, not a sentinel.** Some implementations store a `"$"` child as a terminator. That
   works until a real word contains `"$"`, and it conflates edges with metadata. A boolean is
   explicit and costs one field per node.
5. **Iteration unit.** `for...of` walks code points, so an astral character (`"😀"`) is a single edge,
   matching user expectations better than `split("")`.

Invariant: the path from the root to any node spells that node's prefix, and `isEnd` is true exactly
at nodes that end an inserted word.

### Implementation

```javascript
class TrieNode {
  constructor() {
    this.children = new Map(); // char -> TrieNode (Map: no prototype keys, ordered)
    this.isEnd = false;
  }
}

class Trie {
  #root = new TrieNode();

  insert(word) {
    if (typeof word !== "string") throw new TypeError("Trie.insert expects a string");
    let node = this.#root;
    for (const char of word) { // code points: astral characters are single edges
      if (!node.children.has(char)) node.children.set(char, new TrieNode());
      node = node.children.get(char);
    }
    node.isEnd = true;
  }

  #walk(str) {
    let node = this.#root;
    for (const char of str) {
      node = node.children.get(char);
      if (node === undefined) return undefined; // the path breaks here
    }
    return node;
  }

  search(word) {
    if (typeof word !== "string") return false;
    const node = this.#walk(word);
    return node !== undefined && node.isEnd; // full word, not just a prefix
  }

  startsWith(prefix) {
    if (typeof prefix !== "string") return false;
    return this.#walk(prefix) !== undefined; // any surviving path counts
  }
}
```

### Walkthrough

```javascript
const t = new Trie();
t.insert("apple");
t.insert("app");
t.search("apple")     // => true  (path exists, isEnd set by insert("apple"))
t.search("app")       // => true  (isEnd set by insert("app") — a word and a prefix)
t.search("appl")      // => false (path exists, but isEnd is false)
t.search("apples")    // => false (no "s" edge after "apple")
t.startsWith("ap")    // => true  (the path survives)
t.startsWith("aq")    // => false (breaks at "q")
```

Inserting `"apple"` then `"app"` shares the `a-p-p` nodes; the second insert only flips
`isEnd` on the existing `"app"` node. `search("appl")` walks to a live node whose
`isEnd` is still `false` — the exact case the flag exists for.

### Complexity

Time: `insert`/`search`/`startsWith` are each `O(m)` for a string of `m` characters —
one `Map` step per character. Space: `O(total characters)` across all nodes in the
worst case (no shared prefixes); shared prefixes are stored once, which is the point.

### Edge Cases

- Empty string: `insert("")` sets `isEnd` on the root; `search("")` is then `true`,
  `startsWith("")` is always `true`. Decide and document this.
- Words that are prefixes of other words (`"app"` vs `"apple"`) — the `isEnd` flag is
  what distinguishes them.
- `"__proto__"`, `"constructor"`, `"$"` as input: safe, because children live in a
  `Map`, not a plain object.
- Non-string input: `insert` throws; `search`/`startsWith` return `false`.
- Unicode: `for...of` iterates code points, so `"😀"` is one edge, not two surrogates.

### Interview Follow-ups

- **Autocomplete:** `startsWith(prefix)` to find the node, then DFS below it collecting
  words — `O(p + k)` for prefix length `p` and `k` results.
- **Delete a word:** unset `isEnd`, then prune childless non-terminal nodes bottom-up.
- **Count words with a prefix:** store a `passCount` on each node, incremented on insert.
- **Why not a `Set` of words?** Prefix queries would scan everything; the trie answers
  them in `O(p)`.

### Common Mistakes

- Using a plain object for children and colliding with `"__proto__"`.
- Returning `true` from `search` when the path merely exists (forgetting `isEnd`).
- Marking intermediate nodes as terminators during `insert`.
- Splitting with `split("")`, which breaks astral characters into surrogate halves.
- A `"$"` sentinel child instead of a boolean flag.

### Takeaway

A trie trades one `Map` per node for `O(m)` insert, exact search, and prefix search.
`Map` children plus an `isEnd` flag, one shared `#walk`, and code-point iteration.

## Implement a Min Heap / Max Heap

`Difficulty: Medium` `Probability: Medium`

### Problem

Implement `MinHeap` with `push(value)`, `pop()` (remove and return the smallest),
`peek()` (smallest without removing), and `size`. The contract is the heap invariant:
every parent is `<=` its children, so the minimum is always at index `0`. Store the
tree in an array (`children of i at 2i+1, 2i+2`) and restore the invariant with
sift-up on insert and sift-down on removal. A `MaxHeap` is the same code with the
comparisons flipped — say so, and implement one.

### Examples

```text
const h = new MinHeap();
h.push(5); h.push(3); h.push(8); h.push(1);
h.peek()  // => 1
h.pop()   // => 1
h.pop()   // => 3
h.peek()  // => 5
h.size    // => 2
h.pop(); h.pop();
h.pop()   // => undefined (empty)
h.peek()  // => undefined (empty)
```

### Approach

Two operations, mirror images. **Sift up** (after `push`): the new leaf may be smaller
than its parent, so compare and swap upward until the parent is smaller or you reach
the root. **Sift down** (after `pop`): move the last leaf into the root hole, then
repeatedly swap it with its *smaller* child until both children are larger or it is a
leaf. The "smaller child" choice is the detail people miss — swapping with the larger
child can leave a smaller value above a larger one, breaking the invariant.

`pop` on an empty heap returns `undefined` (no throw — state the choice). `peek` is a
pure read of index `0`.

### Implementation

```javascript
class MinHeap {
  #data = [];

  get size() { return this.#data.length; }

  peek() {
    return this.#data.length === 0 ? undefined : this.#data[0];
  }

  push(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new TypeError("MinHeap expects numbers (NaN has no ordering)");
    }
    const data = this.#data;
    data.push(value);
    let i = data.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (data[parent] <= data[i]) break;
      [data[parent], data[i]] = [data[i], data[parent]];
      i = parent;
    }
  }

  pop() {
    const data = this.#data;
    if (data.length === 0) return undefined;
    const top = data[0];
    const last = data.pop();
    if (data.length > 0) {
      data[0] = last; // fill the hole, then restore downward
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < data.length && data[left] < data[smallest]) smallest = left;
        if (right < data.length && data[right] < data[smallest]) smallest = right;
        if (smallest === i) break;
        [data[smallest], data[i]] = [data[i], data[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}
```

### Walkthrough

`push(5); push(3); push(8); push(1)`:

1. `[5]`. Push `3` → `[5, 3]` → parent `5 > 3`, swap → `[3, 5]`.
2. Push `8` → `[3, 5, 8]` → parent `3 <= 8`, stop.
3. Push `1` → `[3, 5, 8, 1]` → parent of index 3 is index 1 (`5 > 1`), swap →
   `[3, 1, 8, 5]` → parent of index 1 is index 0 (`3 > 1`), swap → `[1, 3, 8, 5]`.

`pop()` → returns `1`; move last (`5`) to root → `[5, 3, 8]` → smaller child of root
is `3`, swap → `[3, 5, 8]` → children of index 1 don't exist. Stop. Root is `3`. // => 1

### Complexity

Time: `push`/`pop` are `O(log n)` — the height of the tree; `peek`/`size` are `O(1)`.
Space: `O(n)` for the array. Building a heap by repeated `push` is `O(n log n)`;
heapify from an array is `O(n)` (follow-up).

### Edge Cases

- Empty heap: `pop`/`peek` return `undefined` rather than throwing (documented choice).
- Single element: `pop` takes the `data.length > 0` skip path correctly.
- Duplicates: `<=` / strict `<` choices keep equal values stable-enough; heaps are not
  stable structures and must not promise to be.
- `NaN` is rejected: it has no ordering, so it would corrupt every comparison.
- One child missing on the last level: the bounds checks handle a lone left child.

### Interview Follow-ups

- **MaxHeap:** flip every comparison (`>=`, `>`), or take a `compare` function in the
  constructor and use it everywhere.
- **Heapify in `O(n)`:** sift down from the last parent to the root instead of pushing.
- **kth largest / top-k:** a min-heap of size `k` (used in the Arrays page).
- **Priority queue:** store `{ priority, value }` and compare on `priority`.

### Common Mistakes

- Sifting down against the *larger* child, silently breaking the invariant.
- Forgetting the `data.length > 0` guard after popping the last element (writes `last`
  back into an empty array).
- Off-by-one parent/child index math (`(i-1)>>1`, `2i+1`, `2i+2` — write them once,
  correctly).
- `peek` throwing on empty instead of returning `undefined`.
- Claiming the heap is sorted — only the root is guaranteed; use `pop` in a loop
  (heapsort) for order.

### Takeaway

A heap is an array plus two restores: sift the new leaf **up** on insert, sift the
replacement root **down** against its *smaller* child on removal. `O(log n)` both ways,
minimum always at index `0`.


