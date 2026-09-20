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





