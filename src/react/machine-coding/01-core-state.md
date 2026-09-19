# Core React State & UI

The foundation. Every other problem is built from these moves: one source of truth, derived values, immutable updates, and functional state updates when the next value depends on the previous one.

---

## Counter with Constraints

`Difficulty: Easy` `Probability: Very High`

### What are we building?

A counter that can only move between a `min` and a `max`, in configurable `step`s. Buttons disable at the boundaries, and there is a reset. It looks trivial, which is exactly why interviewers use it: it exposes whether you store derivable state and whether you use functional updates correctly.

### Example

```text
[ - ]   7   [ + ]     [ Reset ]
```

At `min`, `-` is disabled. At `max`, `+` is disabled. With `step = 5` and `max = 10`, a single click from `7` lands on `10`, not `12`.

### What is the interviewer testing?

- Minimal state and derived values (`atMin`, `atMax` computed during render)
- Clamping and boundary logic
- Functional state updates (`setCount(c => ...)`) so rapid clicks do not lose values
- Disabled semantics and accessible labels

### State Design

```ts
min: number      // prop
max: number      // prop
step: number     // prop (or state if the user can change it)
count: number    // the ONLY state
```

**Do NOT store:** `atMin`, `atMax`, `canIncrement`, `canDecrement`. All four are derived from `count` and the props. Duplicating them means they can drift out of sync with `count`.

### Basic Version

```ts
type CounterProps = { min?: number; max?: number; step?: number };

export function Counter({ min = 0, max = 10, step = 1 }: CounterProps) {
  const [count, setCount] = useState(min);

  const atMin = count <= min;
  const atMax = count >= max;

  const change = (delta: number) =>
    setCount((c) => Math.min(max, Math.max(min, c + delta)));

  return (
    <div role="group" aria-label="Counter">
      <button onClick={() => change(-step)} disabled={atMin} aria-label="Decrease">
        -
      </button>
      <output aria-live="polite" aria-atomic="true">
        {count}
      </output>
      <button onClick={() => change(step)} disabled={atMax} aria-label="Increase">
        +
      </button>
      <button onClick={() => setCount(min)} disabled={count === min}>
        Reset
      </button>
    </div>
  );
}
```

### How It Works

- `count` is the single source of truth. Everything else is computed on every render, so the UI can never show a stale boundary state.
- `Math.min(max, Math.max(min, c + delta))` clamps into the valid range, which also makes the button a no-op at the edge rather than relying on `disabled` alone.
- The updater form `setCount((c) => ...)` reads the latest committed value. If you wrote `setCount(count + step)`, two clicks batched in the same tick would both read the same `count` and only advance once.

### Edge Cases

- `min > max`: normalize or clamp the initial value; document the behavior.
- `step` larger than the range: the first click should jump to `max`, not overshoot.
- `step` of `0` or negative: decide whether to reject it.
- Non-integer `step` and floating point (`0.1 + 0.2`).
- Rapid clicks: the functional update prevents lost updates.

### Interview Follow-ups

- **Level 1:** Add a numeric input so the user can type a value; clamp on blur.
- **Level 2:** Add a user-editable `step` that itself cannot exceed the range.
- **Level 3:** Persist `count` to `localStorage` and restore it on load.
- **Level 4:** Add history with undo/redo (see **Undo / Redo State History**).
- **Level 5:** Refactor to `useReducer` once there are four or more related actions (`increment`, `decrement`, `set`, `reset`).
- **Level 6:** Draw the state transitions as a small machine: `min &harr; idle &harr; max` with self-transitions.

### Production Version

Real counters are usually driven by URL or server state. Sync the count to a query parameter with `useSearchParams`, or keep it as local draft state and persist on blur. If a value is shared across the app, lift it into context (see **Application State & Architecture**) rather than prop-drilling.

### Accessibility

- Use `<output>` (or a live region) so screen readers announce the new value; `aria-live="polite"` avoids interrupting.
- Label icon-only buttons with `aria-label`.
- `disabled` communicates the boundary; do not hide the button.

### Performance

Irrelevant at this scale. Do not wrap anything in `useMemo`/`useCallback` "just in case" &mdash; the component is cheaper than the memo bookkeeping.

### Testing

```text
✓ renders the initial value (min)
✓ increments and decrements by step
✓ disables "-" at min and "+" at max
✓ clamps a large step to max
✓ reset returns to min
```

### Common Mistakes

- Storing `atMin`/`atMax` in state and forgetting to update them.
- `setCount(count + step)` in a handler that can fire twice per tick.
- Checking `count === max` instead of `count >= max`, which breaks with step overshoot.
- Forgetting `min`/`max` in a `useEffect` dependency array &mdash; usually a sign the effect should not exist at all.

### Interview Takeaway

Store the smallest possible value and derive everything else during render. Use functional updates whenever the next value depends on the previous one. This one habit prevents most counter bugs and scales to every reducer you will write later.

---

## Todo / CRUD Application

`Difficulty: Easy` `Probability: Very High`

### What are we building?

The canonical CRUD list: add a todo, toggle complete, delete, and filter by all / active / completed, with remaining-item count. It is the most common warm-up question because it exercises arrays, immutable updates, stable keys, controlled inputs, derived state, and accessibility all at once.

### Example

```text
[ What needs doing?          ]  [ Add ]
( ) Write the migration
(x) Read the existing page
( ) Prepare the demo

All | Active | Completed       2 items left
```

### What is the interviewer testing?

- Array state updates without mutation (`map`, `filter`, spread)
- Stable, unique keys (`id`, not array index)
- A single controlled input vs storing a "new todo" object
- Derived filtering and counts
- Basic form accessibility

### State Design

```ts
type Todo = { id: string; text: string; done: boolean };

todos: Todo[]        // source of truth
filter: Filter       // "all" | "active" | "completed"
draft: string        // the input value
```

**Do NOT store:** the filtered list, `remainingCount`, `activeCount`, or `isValid`. All are derived from `todos` and `filter` during render.

### Basic Version

```ts
type Filter = "all" | "active" | "completed";
type Todo = { id: string; text: string; done: boolean };

export function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState("");

  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setTodos((prev) => [...prev, { id: crypto.randomUUID(), text, done: false }]);
    setDraft("");
  };

  const toggle = (id: string) =>
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  const remove = (id: string) => setTodos((prev) => prev.filter((t) => t.id !== id));

  const visible = todos.filter((t) =>
    filter === "all" ? true : filter === "active" ? !t.done : t.done,
  );
  const remaining = todos.filter((t) => !t.done).length;

  return (
    <section aria-labelledby="todo-heading">
      <h3 id="todo-heading">Todos</h3>

      <form onSubmit={addTodo}>
        <label htmlFor="new-todo">What needs doing?</label>
        <input
          id="new-todo"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What needs doing?"
        />
        <button type="submit" disabled={!draft.trim()}>
          Add
        </button>
      </form>

      <ul>
        {visible.map((todo) => (
          <li key={todo.id}>
            <label>
              <input type="checkbox" checked={todo.done} onChange={() => toggle(todo.id)} />
              <span style={{ textDecoration: todo.done ? "line-through" : "none" }}>
                {todo.text}
              </span>
            </label>
            <button onClick={() => remove(todo.id)} aria-label={`Delete ${todo.text}`}>
              Delete
            </button>
          </li>
        ))}
      </ul>

      <p>{remaining} item{remaining === 1 ? "" : "s"} left</p>

      <div role="group" aria-label="Filter todos">
        {(["all", "active", "completed"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}>
            {f}
          </button>
        ))}
      </div>
    </section>
  );
}
```

### How It Works

- Every update produces a new array. `map` rebuilds one item, `filter` removes one, and spread appends. React sees new references and re-renders.
- `visible` and `remaining` are computed on every render, so they cannot go stale after a toggle or delete.
- `crypto.randomUUID()` gives a stable identity per todo. `key={todo.id}` lets React correctly preserve the checkbox and input state of the right row when items are removed.
- The form's `onSubmit` + `disabled={!draft.trim()}` prevents empty todos without an effect that watches `draft`.

### Edge Cases

- Whitespace-only input: `trim()` before validating.
- Duplicate text: identity is the `id`, not the text, so duplicates are safe.
- Deleting the last visible item: show an empty state, not a blank area.
- Very long lists: virtualization if the list can reach thousands (see **Virtualized List**).
- Filter that hides newly added items: adding a todo while "Completed" is active is confusing; consider switching to "all" or showing a hint.

### Interview Follow-ups

- **Level 1:** Edit an existing todo (see **Inline Editable List**).
- **Level 2:** "Clear completed" bulk action and a select-all checkbox.
- **Level 3:** Persist to `localStorage` with `useLocalStorage`.
- **Level 4:** Move all transitions into a `useReducer` (`add`, `toggle`, `remove`, `edit`, `clearCompleted`) &mdash; the natural next step once actions multiply.
- **Level 5:** Optimistic server CRUD with rollback (see **API / Async React**).
- **Level 6:** Add undo/redo across the whole list (see **Undo / Redo State History**).
- **Level 7:** Drag-to-reorder with the native Drag and Drop API (see **Sortable List**).

### Production Version

For a server-backed todo list, do not keep a parallel client array that you manually sync. Either treat the server as the source of truth and refetch/mutate, or use an optimistic cache. TanStack Query's `useMutation` with `onMutate`/`onError` is the production-grade version of the rollback logic you will write by hand in **Optimistic Mutation with Rollback**.

### Accessibility

- Use a real `<form>` so Enter submits.
- Every input needs a `<label>`; placeholders are not labels.
- The "items left" count should live in a polite live region if it changes while the user is elsewhere.
- Delete buttons need accessible names containing the item text.

### Performance

For thousands of items, filter and render work becomes visible. `useMemo` around `visible` and virtualization are the real fixes (see **Performance & Large Data**). Do not memoize the `TodoItem` prematurely for a 10-item list.

### Testing

```text
✓ adds a todo and clears the input
✓ does not add an empty/whitespace todo
✓ toggles a todo's completed state
✓ deletes the correct todo
✓ filters by active/completed
✓ shows the correct remaining count
```

### Common Mistakes

- Mutating state: `todos.push(...)`, `todos[i].done = true`.
- `key={index}`, which causes the wrong row's state to survive a delete.
- Storing `visible` in state and forgetting to recompute on filter change.
- Reading `todos` inside a `setInterval` without a functional update (stale closure).
- Using an effect to "sync" derived data.

### Interview Takeaway

CRUD is array state plus derived views. Keep one array, update it immutably, key by stable id, and compute filters/counts during render. Once the action list grows past a few handlers, graduate to `useReducer`.

---

## Inline Editable List

`Difficulty: Medium` `Probability: High`

### What is we building?

A list where any row can switch into an edit mode: the label becomes an input, Enter/blur saves, Escape cancels, and only one row is editable at a time.

### Example

```text
( ) Buy milk            [ Edit ]
( ) [Buy oat milk____]  [ Save ] [ Cancel ]
( ) Call the bank        [ Edit ]
```

### What is the interviewer testing?

- A single `editingId` instead of a boolean per row
- Draft state separated from committed state
- Blur vs Escape vs Enter semantics
- Focus management when entering edit mode
- Cancelling restores the original value

### State Design

```ts
items: Item[]            // committed data
editingId: string | null // which row is in edit mode
draft: string            // the in-progress text
```

**Do NOT store:** an `isEditing` flag inside each item. That scatters UI state into the data and makes "only one at a time" hard to enforce.

### Basic Version

```ts
type Item = { id: string; label: string };

export function EditableList({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (item: Item) => {
    setEditingId(item.id);
    setDraft(item.label);
  };

  const commit = () => {
    if (editingId === null) return;
    const label = draft.trim();
    if (label) {
      setItems((prev) => prev.map((it) => (it.id === editingId ? { ...it, label } : it)));
    }
    setEditingId(null);
  };

  const cancel = () => setEditingId(null);

  useEffect(() => {
    if (editingId !== null) inputRef.current?.select();
  }, [editingId]);

  return (
    <ul>
      {items.map((item) =>
        item.id === editingId ? (
          <li key={item.id}>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") cancel();
              }}
              onBlur={commit}
              aria-label="Edit item"
            />
            <button onMouseDown={(e) => e.preventDefault()} onClick={commit}>
              Save
            </button>
            <button onClick={cancel}>Cancel</button>
          </li>
        ) : (
          <li key={item.id}>
            <span>{item.label}</span>
            <button onClick={() => startEdit(item)}>Edit</button>
          </li>
        ),
      )}
    </ul>
  );
}
```

### How It Works

- `editingId: string | null` encodes "which row" and "is anything being edited" in one value. A per-item boolean would allow two open editors.
- `draft` is a scratch copy. The item array is only changed on commit, so Escape and blur-away can discard safely.
- The focus effect selects the input when edit mode begins. It depends on `editingId`, so it runs once per edit session, not every keystroke.
- `onMouseDown={preventDefault}` on Save stops the input from blurring before the click registers. Otherwise blur commits first and the button's click can hit an unmounted node.

### Edge Cases

- Empty draft: keep the old value or delete the row &mdash; pick one and state it.
- Escape followed by blur: both handlers may fire; `editingId` becomes `null` and the second commit is a no-op.
- Clicking Edit on a second row while one is open: commit the first, then open the second.
- IME composition (e.g. Japanese) and Enter during composition: check `e.nativeEvent.isComposing`.
- Very long text: use a textarea and handle Enter vs newline.

### Interview Follow-ups

- **Level 1:** Commit on Enter, cancel on Escape, commit on blur (the version above).
- **Level 2:** Persist edits; show a spinner while saving and roll back on failure.
- **Level 3:** Add/remove rows as well as edit them.
- **Level 4:** Validate the draft and show an inline error instead of silently discarding.
- **Level 5:** Extract `useEditableRow` or move the reducer into a single `itemsReducer` for add/edit/remove.
- **Level 6:** Support bulk edit and multi-select.

### Production Version

Separate optimistic editing from persistence: update local state immediately, fire the request, and roll back on error. A form library such as React Hook Form helps when rows have many fields, but each row still needs the same `editingId`/`draft` discipline.

### Accessibility

- Label the edit input (`aria-label="Edit item"` or a visually hidden label tied to the row).
- Announce save/cancel results through a live region if the save is async.
- Keep focus predictable: after commit, return focus to the row's Edit button if the row still exists.

### Performance

Rendering an input for the edited row only is cheap. Do not keep a hidden input for every row.

### Testing

```text
✓ clicking Edit shows an input seeded with the current value
✓ Enter saves and updates the label
✓ Escape restores the original value
✓ blur saves
✓ only one row can be edited at a time
```

### Common Mistakes

- Storing `isEditing` on each item.
- Using `onClick` (which fires after blur) instead of `onMouseDown` on Save/Cancel.
- Reading `items` inside `commit` from a stale closure; use the functional updater.
- Not guarding against an empty draft.

### Interview Takeaway

Model transient UI modes with a single discriminator (`editingId`) and keep a separate draft for in-progress edits. Commit explicitly; cancel is then free.

---

## Like / Favorite Button with Optimistic Updates

`Difficulty: Medium` `Probability: Very High`

### What are we building?

A like/favorite toggle that updates immediately, calls the server, and rolls back if the request fails. It is the smallest realistic optimistic-UI exercise and the clearest place to demonstrate rollback.

### Example

```text
before click:  (heart) 41
click:         (heart) 42   -> spinner / disabled
failure:       (heart) 41   -> toast: "Could not save. Try again."
```

### What is the interviewer testing?

- Optimistic UI: update local state before the request resolves
- Rollback on failure
- Preventing double submits while a request is in flight
- Functional state updates for counts
- `aria-pressed` semantics

### State Design

```ts
liked: boolean       // optimistic local truth
count: number        // optimistic local count
pending: boolean     // request in flight, disables the button
error: string | null // surfaced to the user
```

**Do NOT store:** a second "serverLiked" copy you sync with an effect. Keep one optimistic value and reconcile it when the response arrives.

### Basic Version

```ts
type LikeResponse = { liked: boolean; count: number };

export function LikeButton({
  initialLiked,
  initialCount,
  onToggle,
}: {
  initialLiked: boolean;
  initialCount: number;
  onToggle: (next: boolean) => Promise<LikeResponse>;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (pending) return;

    const prevLiked = liked;
    const prevCount = count;
    const next = !prevLiked;

    // 1. Optimistic update
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    setPending(true);
    setError(null);

    try {
      // 2. Reconcile with the server's truth
      const result = await onToggle(next);
      setLiked(result.liked);
      setCount(result.count);
    } catch {
      // 3. Roll back
      setLiked(prevLiked);
      setCount(prevCount);
      setError("Could not save. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={liked}
        aria-label={liked ? "Unlike" : "Like"}
      >
        {liked ? "\u2665" : "\u2661"} {count}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
```

### How It Works

- The handler captures `prevLiked`/`prevCount` *before* updating, because those snapshots are the rollback data.
- `setCount((c) => c + ...)` uses the functional form so it cannot read a stale count.
- Deriving `next` once from `prevLiked` avoids the classic `!liked` bug where the value changes between read and use.
- On success we *replace* the optimistic values with the server's response, keeping client and server consistent.
- `pending` guards against double clicks; optimistic UIs are especially prone to duplicate requests.

### Edge Cases

- Rapid clicks: `if (pending) return;` collapses them. A queue is rarely worth it for a like.
- Component unmounts mid-request: use an `AbortController` and ignore the result after abort; also guard `setState` after unmount in frameworks without automatic batching (React 18 no longer warns, but the request should still be cancelled).
- Server returns a different count than optimistic: reconciliation handles it.
- The user's like was already counted elsewhere: trust the server response, not the delta.

### Interview Follow-ups

- **Level 1:** Local-only toggle.
- **Level 2:** Optimistic update with rollback (the version above).
- **Level 3:** Abort the request on unmount.
- **Level 4:** Add a retry button instead of only an error message.
- **Level 5:** Batch rapid toggles and debounce persistence.
- **Level 6:** Apply the same hook (`useOptimisticMutation`) to votes, follows, saves.

### Production Version

React 19 exposes `useOptimistic`, and TanStack Query exposes `onMutate`/`onError`/`onSettled` for optimistic caches. Both implement exactly this rollback contract. Interviewers still expect you to reason through it manually, because the library is not the answer &mdash; the reconciliation strategy is.

### Accessibility

- Use `aria-pressed` for a toggle button, not `aria-checked`.
- Announce errors with `role="alert"` (or a polite live region).
- Keep the count in the accessible name so screen-reader users hear "Unlike, 42".

### Performance

Trivial. If the same entity's like state appears in several places, centralize it (context or a cache) rather than firing duplicate requests.

### Testing

```text
✓ clicking updates the count immediately
✓ on success, the server value replaces the optimistic value
✓ on failure, liked and count roll back
✓ the button is disabled while pending
✓ a failed request shows an alert
```

### Common Mistakes

- Forgetting rollback on error.
- Using `setCount(count + 1)` and losing concurrent updates.
- Reading `liked` after calling `setLiked` in the same handler.
- No in-flight guard, causing duplicate POSTs.
- Swallowing errors, leaving the UI lying to the user.

### Interview Takeaway

Optimistic UI is: snapshot &rarr; apply &rarr; request &rarr; reconcile or roll back. Once you can write that for one button, you can apply it to carts, votes, and feeds.

---

## Undo / Redo State History

`Difficulty: Medium` `Probability: Medium`

### What are we building?

An editor with undo and redo across a document or list: every committed change is reversible, and redo works until a new change is made. A text or canvas toy app makes the demo concrete.

### Example

```text
type: "Hello"
type " world"   -> "Hello world"
[Undo]          -> "Hello"
[Redo]          -> "Hello world"
type "!"        -> "Hello world!"   (redo history cleared)
```

### What is the interviewer testing?

- Modeling history as `past`, `present`, `future`
- Immutable transitions and functional updates
- Toggling redo availability correctly
- Dependency arrays, keyboard shortcuts, and cleanup
- Coalescing bursts (e.g., typing) into one history entry

### State Design

```ts
past: Doc[]        // oldest -> newer
present: Doc       // current committed value
future: Doc[]      // redo stack (nearest redo last)
```

**Do NOT store:** `canUndo`/`canRedo` (derive from `past.length`/`future.length`) or a copy of the present inside `past`.

### Basic Version (reducer)

```ts
type State<T> = { past: T[]; present: T; future: T[] };

type Action<T> =
  | { type: "SET"; value: T }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET"; value: T };

function historyReducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case "SET":
      return { past: [...state.past, state.present], present: action.value, future: [] };
    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { past: [...state.past, state.present], present: next, future: rest };
    }
    case "RESET":
      return { past: [], present: action.value, future: [] };
  }
}

export function useHistory<T>(initial: T) {
  const [state, dispatch] = useReducer(historyReducer<T>, {
    past: [],
    present: initial,
    future: [],
  });

  const set = useCallback((value: T) => dispatch({ type: "SET", value }), []);
  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);
  const reset = useCallback((value: T) => dispatch({ type: "RESET", value }), []);

  return {
    value: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    set,
    undo,
    redo,
    reset,
  };
}
```

```ts
export function NotesEditor() {
  const { value, canUndo, canRedo, set, undo, redo } = useHistory("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  return (
    <div>
      <textarea value={value} onChange={(e) => set(e.target.value)} aria-label="Notes" />
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
    </div>
  );
}
```

### How It Works

- `SET` commits the previous present into `past` and clears `future`. That single line is what makes redo disappear after a new edit.
- `UNDO` moves present into `future` and pops from `past`. `REDO` is its mirror.
- `canUndo`/`canRedo` are derived, so the buttons are never stale.
- The reducer is pure, which makes history logic easy to unit test without React.

### Edge Cases

- Undo at the beginning / redo at the end: return the same state reference so React bails out.
- Every keystroke becoming a history entry: add debounce/coalescing so typing one word is one entry.
- Memory growth on a large document: cap `past` (e.g., keep the last 100) or store patches instead of full snapshots.
- Async changes arriving out of order: only commit history on success, or commit optimistically and reconcile.
- Redo cleared on load persists correctly after a new edit.

### Interview Follow-ups

- **Level 1:** Undo/redo a single value (above).
- **Level 2:** Coalesce rapid input into one entry with a debounce.
- **Level 3:** Cap history and add a "history depth" indicator.
- **Level 4:** Undo/redo across a list of items, not just one value.
- **Level 5:** Add `BEGIN_TRANSACTION`/`COMMIT` so a drag becomes one undo step.
- **Level 6:** Persist history to `localStorage` or an undo log for a collaborative editor.

### Production Version

Real editors (ProseMirror, Slate, CodeMirror) use operation-based history with transformations, plus server reconciliation. The `past/present/future` model is the mental model behind all of them; mention that you would store patches, not full documents, at scale.

### Accessibility

- Keyboard shortcuts must not fire while the user is typing in an unrelated input; scope them or skip when `e.target` is editable if the shortcut should be global.
- Announce the result of undo/redo in a live region for non-visual users.
- Buttons need `disabled` and clear labels, not just icons.

### Performance

Snapshot-based history is fine for small documents. For large ones, cap depth or store diffs. Avoid `useMemo` around the reducer &mdash; reducers are already cheap and the memo adds complexity.

### Testing

```text
✓ SET pushes present to past and clears future
✓ UNDO restores the previous value and enables redo
✓ REDO reapplies the undone value
✓ a new SET after undo clears the redo stack
✓ undo at the start is a no-op
```

### Common Mistakes

- Keeping `future` after a new edit.
- Mutating `past`/`future` arrays with `push`/`pop` instead of returning new arrays.
- A keyboard listener that is registered but never removed.
- Reading `canUndo` from state that was set by an effect.

### Interview Takeaway

History is three values: past, present, future. A reducer makes the transitions explicit, derived flags keep the UI honest, and a cap keeps memory bounded.

---

## Theme Switcher with Persisted Preference

`Difficulty: Easy` `Probability: High`

### What is we building?

A light/dark/system theme switcher that persists across reloads, respects the OS preference, and applies the theme without a flash of the wrong colors.

### Example

```text
Theme:  [ Light ] [ Dark ] [ System ]
```

Selecting "System" follows `prefers-color-scheme` and updates live when the OS changes.

### What is the interviewer testing?

- Reading and writing `localStorage` safely
- `matchMedia` and its `change` listener (with cleanup)
- Applying a `data-theme` attribute vs React-rendered classes
- Avoiding theme flash on first paint
- Cross-tab sync (optional, advanced)

### State Design

```ts
theme: "light" | "dark" | "system"   // persisted preference
```

**Do NOT store:** `resolvedTheme` separately. Derive it from `theme` plus the media query. (`resolvedTheme` can be memoized, but it should not be a second source of truth.)

### Basic Version

```ts
type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme-preference";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => getSystemTheme());

  const resolved = theme === "system" ? systemTheme : theme;

  // follow the OS while "system" is selected
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(mql.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // apply + persist
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, resolved]);

  return (
    <fieldset>
      <legend>Theme</legend>
      {(["light", "dark", "system"] as const).map((option) => (
        <label key={option}>
          <input
            type="radio"
            name="theme"
            value={option}
            checked={theme === option}
            onChange={() => setTheme(option)}
          />
          {option}
        </label>
      ))}
    </fieldset>
  );
}
```

### How It Works

- The lazy initializer `useState(() => readStoredTheme())` reads storage once, on mount, and tolerates bad/absent values.
- `resolved` is derived: it is the explicit theme, or the current system theme when the preference is "system".
- One effect tracks the media query; another applies the attribute and persists the *preference* (not the resolved value), so "system" survives a reload.
- Applying a `data-theme` attribute to `<html>` lets CSS own the colors (`[data-theme="dark"] { ... }`), which avoids a re-render just to theme.

### Edge Cases

- `localStorage` throws in private mode or when disabled: wrap reads/writes in `try/catch` and fall back to "system".
- SSR/first paint: the HTML is server-rendered with no theme, so a small blocking inline script in `<head>` should set `data-theme` before paint. The playbook's page already sets theme via CSS; the same attribute approach works here.
- OS theme changes while the tab is backgrounded: the `change` listener fires on return.
- Cross-tab: listen for the `storage` event if other tabs should update live.

### Interview Follow-ups

- **Level 1:** Light/dark toggle only.
- **Level 2:** Persist to `localStorage` and restore on reload.
- **Level 3:** Add "system" and follow `matchMedia`.
- **Level 4:** Prevent flash with an inline head script.
- **Level 5:** Sync across tabs with the `storage` event.
- **Level 6:** Support multiple named themes (e.g., high-contrast) and store an object.

### Production Version

`next-themes` is the production package for exactly this (it injects the no-flash script and handles SSR). Say that in an interview, but implement the manual version first so you can explain the flash problem and the `matchMedia` cleanup.

### Accessibility

- Use a `fieldset`/`legend` or a labelled `radiogroup`; radio inputs give arrow-key selection for free.
- Do not rely on color alone for the selected state; the radio itself conveys it.
- Honor `prefers-reduced-motion` if you animate the switch.

### Performance

Negligible. The only real concern is the no-flash script, which must run before the first paint.

### Testing

```text
✓ reads the stored preference on mount
✓ clicking Dark applies data-theme="dark" and persists it
✓ "system" follows matchMedia
✓ a system theme change updates resolved theme while "system" is selected
✓ invalid stored values fall back to "system"
```

### Common Mistakes

- Storing and syncing both `theme` and `resolvedTheme` as state.
- Registering a `matchMedia` listener without removing it.
- Persisting the resolved theme, so "system" is lost after reload.
- Reading `localStorage` during render on every keystroke instead of once.
- Forgetting the no-flash script and shipping a white flash.

### Interview Takeaway

Persist the *preference*, derive the *resolved* theme, and let CSS own the visuals via an attribute. `matchMedia` is just another subscription: add it, and always remove it.
