# `useReducer`: Predictable Complex State Transitions

## 1. Why This Exists — The Problem First

You are three sprints deep on a checkout wizard. The user can add items, apply promo codes, pick a shipping method, toggle a billing address, and submit payment. Each piece of data lives in its own `useState` call:

```tsx
const [cart, setCart] = useState<CartItem[]>([]);
const [coupon, setCoupon] = useState<string | null>(null);
const [discountPercent, setDiscountPercent] = useState(0);
const [status, setStatus] = useState<'idle' | 'validating' | 'submitting' | 'success' | 'error'>('idle');
const [errorMessage, setErrorMessage] = useState<string | null>(null);
```

A user clicks **Apply Coupon**. To handle this correctly your button handler must: set `status` to `'validating'`, clear any lingering `errorMessage` from the previous attempt, call the validation API, then set `discountPercent` and `coupon` together if it succeeds, or set `status` to `'error'` and `errorMessage` if it fails, then flip `status` back to `'idle'` regardless.

That is five separate state setters for one logical event. If a developer forgets to clear `errorMessage` on the happy path, the UI shows a green success banner while the old red error message still sits underneath it — a valid-looking impossible state. If the async validation resolves after the user has already navigated away or removed the only item in the cart, `discountPercent` and `cart` drift out of sync. Race conditions become inevitable as the transition logic scatters across six different `onClick` handlers and several `useEffect` callbacks, none of which know what the others are doing.

`useReducer` was built specifically to fix this. Instead of telling React *how* to update five different variables, your event handlers announce *what happened*. A single pure function owns all the rules for how those five variables evolve together, atomically, from one consistent state to the next.

## 2. The Analogy — Make It Obvious

Think of `useReducer` as a **bank with a teller window**.

Suppose a bank let customers walk freely behind the counter and rewrite their own balance in the ledger. Customers would make arithmetic mistakes, skip the audit trail, and create mismatched balances across systems. The bank's books would be corrupted within a week.

So instead, the bank enforces a strict protocol. When you want to deposit money, you fill out a standardized deposit slip. That slip says what happened — `{ type: 'DEPOSIT', amount: 500, checkNumber: '1042' }` — it says nothing about what the resulting balance should be. You slide the slip through the permanently fixed teller window slot. You cannot reach through that slot. You can only push paper through it.

The teller on the other side is a strictly trained employee following a rulebook. She takes your current account state and your slip, applies the rules, and returns an updated account statement. She never guesses. Given the exact same starting balance and the exact same deposit slip, she will always calculate the exact same resulting balance. She never touches the outside world — no making phone calls, no editing other customers' accounts, no flipping a coin.

In React, the deposit slip is the action object, the teller window slot is `dispatch`, the teller is your reducer function, and the updated account statement is the new state that triggers a re-render. The window slot — `dispatch` — is physically bolted to the building. It never moves. You can hand its address to anyone in the bank and they will always find it in the same place.

## 3. How It Actually Works — The Full Explanation

The hook signature is:

```tsx
const [state, dispatch] = useReducer(reducer, initialArg, init);
```

The first thing to internalize is the reducer's contract: `(state, action) => newState`. It takes the current state snapshot and an action object, and it returns the complete next state snapshot. That contract comes with three hard rules. First, given the same `state` and the same `action`, the reducer must always return the exact same `newState` — always, no exceptions. Second, it must never mutate the incoming `state` object. If `state` is `{ items: [A, B, C] }`, the reducer must not call `state.items.push(D)` and return `state` — it must return a fresh object with a fresh array. Third, it must perform zero side effects. No `fetch` calls, no `setTimeout`, no `localStorage.setItem`, no `Math.random()`, nothing that touches the world outside the function.

React enforces this purity aggressively. In development with StrictMode enabled, React intentionally calls your reducer twice per dispatch — on purpose — to expose any accidental mutation or side effect. In Concurrent Mode, React can interrupt, pause, discard, and restart rendering trees. If your reducer fired off a network request during that discarded render, the request already went out. The page never finished rendering, but the API call happened anyway. Pure reducers are the only reason `useReducer` is safe in concurrent environments.

When you call `dispatch(action)`, React does not run your reducer immediately. It creates an update object wrapping your action and attaches it to the internal update queue on the component's Fiber node — a node in React's internal tree that represents this component instance. React then schedules a re-render. When the re-render runs, React walks through every queued action in the order they arrived, feeding each one into your reducer sequentially: `currentState = reducer(currentState, action)`. The final output becomes the `state` value for this render. Before triggering child re-renders, React compares the reducer's output to the previous state using `Object.is`. If your reducer returned the exact same object reference, React bails out entirely — no children re-render, no DOM updates.

The `dispatch` function itself is guaranteed by React to be referentially stable across every re-render of the component. React creates it once when the component mounts, binds it to that Fiber's update queue internally, and that reference never changes. This stability is architecturally significant. You can pass `dispatch` as a prop into deeply nested child components wrapped in `React.memo` and those children will never re-render because of `dispatch` alone. You can put `dispatch` into a React Context and consumers will not re-render when state changes — only when the context value itself changes. You do not need to wrap `dispatch` in `useCallback`. Omitting it from `useEffect` or `useCallback` dependency arrays is safe, though including it satisfies your linter without adding any re-run cost.

The third argument, `init`, is the lazy initializer. When you write `useReducer(reducer, someValue)`, React sets initial state directly to `someValue`. But `someValue` is still a JavaScript expression — if you wrote `useReducer(reducer, parseStoredCart(localStorage.getItem('cart')))`, that `parseStoredCart` call runs every single time the component re-renders, not just on mount. React only uses the result during the first render, but JavaScript evaluates the argument unconditionally every time. The fix is the three-argument form: `useReducer(reducer, 'cart', parseStoredCart)`. Now React calls `parseStoredCart('cart')` once, during initial mount, and never again. As a bonus, this form makes state reset trivial — your reducer can handle a `'RESET'` action by calling `init(action.payload ?? initialArg)` and getting a clean initial state without duplicating the logic anywhere.

For TypeScript, never type actions as `{ type: string; payload?: any }`. That loses every guarantee. Use discriminated unions instead. A discriminated union is a set of object types that all share one common literal field — the discriminant — and TypeScript uses the value of that field to automatically narrow all the other fields inside each branch. When you write `switch (action.type)` and enter the `case 'ADD_ITEM'` branch, TypeScript already knows that `action.payload` is `CartItem`, not `Item | Coupon | string | undefined`. The exhaustiveness check seals it: add a `default` case that assigns the action to a variable typed as `never`. If anyone adds a new action variant to the union but forgets to add a matching `case` in the reducer, the TypeScript compiler fails the build immediately, before the code ever ships.

## 4. Real Code — See It Working

Here is a complete shopping cart and checkout manager. It uses discriminated unions, lazy initialization from `localStorage`, immutable state transitions, and the exhaustive `never` check.

```tsx
import React, { useReducer, useEffect } from 'react';

// ── State shape ───────────────────────────────────────────────────────────────

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface CheckoutState {
  items: CartItem[];
  couponCode: string | null;
  discountPercent: number;
  status: 'idle' | 'submitting' | 'success' | 'error';
  errorMessage: string | null;
}

// ── Discriminated union — every possible event the UI can announce ─────────

export type CartAction =
  | { type: 'ADD_ITEM'; payload: Omit<CartItem, 'quantity'> }
  | { type: 'REMOVE_ITEM'; payload: { id: string } }
  | { type: 'UPDATE_QUANTITY'; payload: { id: string; quantity: number } }
  | { type: 'APPLY_COUPON'; payload: { code: string; discountPercent: number } }
  | { type: 'REMOVE_COUPON' }
  | { type: 'CHECKOUT_START' }
  | { type: 'CHECKOUT_SUCCESS' }
  | { type: 'CHECKOUT_FAILURE'; payload: { error: string } }
  | { type: 'RESET_CART' };

// ── Lazy initializer — runs ONCE on mount, never on subsequent re-renders ────

export function initCartState(storageKey: string): CheckoutState {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        items: Array.isArray(parsed) ? parsed : [],
        couponCode: null,
        discountPercent: 0,
        status: 'idle',
        errorMessage: null,
      };
    }
  } catch {
    // If JSON is corrupt or localStorage is unavailable, fall through to clean state
  }
  return {
    items: [],
    couponCode: null,
    discountPercent: 0,
    status: 'idle',
    errorMessage: null,
  };
}

// ── Pure reducer — the single source of truth for all state transitions ──────

export function cartReducer(state: CheckoutState, action: CartAction): CheckoutState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existingIndex = state.items.findIndex(item => item.id === action.payload.id);
      const nextItems =
        existingIndex > -1
          ? state.items.map((item, i) =>
              i === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
            )
          : [...state.items, { ...action.payload, quantity: 1 }];

      // Clear any error when the user takes a positive action — atomically with the item update
      return { ...state, items: nextItems, errorMessage: null };
    }

    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(item => item.id !== action.payload.id) };

    case 'UPDATE_QUANTITY': {
      // Quantity of zero or less means the user effectively removed the item
      if (action.payload.quantity <= 0) {
        return { ...state, items: state.items.filter(item => item.id !== action.payload.id) };
      }
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.payload.id ? { ...item, quantity: action.payload.quantity } : item
        ),
      };
    }

    case 'APPLY_COUPON':
      // Both couponCode and discountPercent update together atomically — impossible to get one without the other
      return {
        ...state,
        couponCode: action.payload.code,
        discountPercent: action.payload.discountPercent,
        errorMessage: null,
      };

    case 'REMOVE_COUPON':
      return { ...state, couponCode: null, discountPercent: 0 };

    case 'CHECKOUT_START':
      return { ...state, status: 'submitting', errorMessage: null };

    case 'CHECKOUT_SUCCESS':
      // Reset cart contents but preserve the success status so the UI can show a confirmation
      return {
        ...state,
        items: [],
        couponCode: null,
        discountPercent: 0,
        status: 'success',
        errorMessage: null,
      };

    case 'CHECKOUT_FAILURE':
      return { ...state, status: 'error', errorMessage: action.payload.error };

    case 'RESET_CART':
      // Re-use the init function so reset logic never diverges from initial-mount logic
      return initCartState('shopping_cart_v1');

    default: {
      // If you add a new CartAction variant but forget its case here,
      // TypeScript cannot assign the unhandled type to never — build fails immediately
      const _exhaustiveCheck: never = action;
      return state;
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ShoppingCart() {
  // Third argument = lazy initializer: initCartState('shopping_cart_v1') runs ONCE on mount
  const [state, dispatch] = useReducer(cartReducer, 'shopping_cart_v1', initCartState);

  // Side effects live outside the reducer, in useEffect where they belong
  useEffect(() => {
    localStorage.setItem('shopping_cart_v1', JSON.stringify(state.items));
  }, [state.items]);

  // Derived values are computed inline — no state needed for calculated totals
  const subtotal = state.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const discountAmount = subtotal * (state.discountPercent / 100);
  const finalTotal = Math.max(0, subtotal - discountAmount);

  const handleCheckout = async () => {
    dispatch({ type: 'CHECKOUT_START' });
    try {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          if (state.items.length === 0) reject(new Error('Cart is empty'));
          else resolve(true);
        }, 800);
      });
      dispatch({ type: 'CHECKOUT_SUCCESS' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      dispatch({ type: 'CHECKOUT_FAILURE', payload: { error: message } });
    }
  };

  return (
    <div style={{ maxWidth: '500px', margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h2>Checkout Terminal</h2>

      {state.status === 'error' && (
        <div style={{ color: 'red', marginBottom: '1rem' }}>{state.errorMessage}</div>
      )}
      {state.status === 'success' && (
        <div style={{ color: 'green', marginBottom: '1rem' }}>Order placed successfully!</div>
      )}

      <button
        onClick={() =>
          dispatch({ type: 'ADD_ITEM', payload: { id: 'p1', name: 'Mechanical Keyboard', price: 120 } })
        }
      >
        Add Keyboard ($120)
      </button>

      <ul style={{ paddingLeft: '1.2rem', marginTop: '1rem' }}>
        {state.items.map(item => (
          <li key={item.id} style={{ margin: '0.5rem 0' }}>
            {item.name} — ${item.price} × {item.quantity}
            <button
              style={{ marginLeft: '0.5rem' }}
              onClick={() =>
                dispatch({ type: 'UPDATE_QUANTITY', payload: { id: item.id, quantity: item.quantity + 1 } })
              }
            >+</button>
            <button
              style={{ marginLeft: '0.25rem' }}
              onClick={() =>
                dispatch({ type: 'UPDATE_QUANTITY', payload: { id: item.id, quantity: item.quantity - 1 } })
              }
            >-</button>
            <button
              style={{ marginLeft: '0.5rem' }}
              onClick={() => dispatch({ type: 'REMOVE_ITEM', payload: { id: item.id } })}
            >Delete</button>
          </li>
        ))}
      </ul>

      <div style={{ borderTop: '1px solid #ccc', paddingTop: '1rem', marginTop: '1rem' }}>
        <p>Subtotal: ${subtotal.toFixed(2)}</p>
        {state.discountPercent > 0 && (
          <p style={{ color: 'green' }}>
            Discount ({state.discountPercent}%): -${discountAmount.toFixed(2)}
          </p>
        )}
        <h3>Total: ${finalTotal.toFixed(2)}</h3>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button
          onClick={() =>
            dispatch({ type: 'APPLY_COUPON', payload: { code: 'SAVE20', discountPercent: 20 } })
          }
        >
          Apply SAVE20
        </button>
        <button onClick={() => dispatch({ type: 'REMOVE_COUPON' })}>Remove Coupon</button>
        <button
          disabled={state.status === 'submitting' || state.items.length === 0}
          onClick={handleCheckout}
        >
          {state.status === 'submitting' ? 'Processing...' : 'Pay Now'}
        </button>
      </div>
    </div>
  );
}
```

Because `cartReducer` is a plain function with no framework dependencies, you can unit test every state transition without mounting a component or mocking any React hooks:

```typescript
// cartReducer.test.ts
import { cartReducer, CheckoutState } from './ShoppingCart';

test('increments quantity when adding an existing item', () => {
  const prevState: CheckoutState = {
    items: [{ id: 'item-1', name: 'Desk Lamp', price: 40, quantity: 1 }],
    couponCode: null,
    discountPercent: 0,
    status: 'idle',
    errorMessage: null,
  };

  const nextState = cartReducer(prevState, {
    type: 'ADD_ITEM',
    payload: { id: 'item-1', name: 'Desk Lamp', price: 40 },
  });

  expect(nextState.items[0].quantity).toBe(2);
  expect(nextState.items).toHaveLength(1);
  // Confirms the reducer returned a new reference — mutating in place would break Object.is bailout
  expect(nextState).not.toBe(prevState);
});
```

This is the real testability win. The entire transition logic for a checkout flow is validated in a plain Node.js test suite with zero React setup, no `renderHook`, no `act`, no DOM.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is `useReducer` and how does it fundamentally differ from `useState`?**

At the implementation level, `useState` is literally built on top of `useReducer` inside React's source code. The conceptual difference is architectural, not capability-based.

With `useState`, you hand React the next state value directly, right there in the event handler: `setCount(c => c + 1)`. The transition logic lives in the UI layer, scattered across handlers. With `useReducer`, your event handler does not calculate anything — it announces what happened: `dispatch({ type: 'ITEM_ADDED', payload: item })`. A separate, isolated function called the reducer owns all the rules for how state evolves. That decoupling matters for three reasons: the reducer is testable in isolation with no React overhead, multiple fields always update atomically so you can never produce a half-updated state, and the complete state machine is readable in one place rather than scattered across a dozen event handlers.

**Q: Why does React guarantee that `dispatch` is referentially stable, and why does that matter in practice?**

When React mounts a `useReducer` hook it creates the `dispatch` function once, binds it internally to that component's Fiber update queue, and hands you that reference. React never creates a new `dispatch` for subsequent renders — the reference is fixed for the entire lifetime of the component instance.

This matters because React's optimization primitives work on referential equality. If you pass `dispatch` as a prop to a child wrapped in `React.memo`, the child will never re-render because `dispatch` changed — it never does. If you put `dispatch` into a Context, consumers re-render only when the context value object itself changes, not because `dispatch` is a new function. In `useEffect` or `useCallback` dependency arrays, you can safely include `dispatch` without worrying it will cause infinite loops or spurious effect re-runs.

**Q: What is the third argument to `useReducer` and when does it matter?**

The third argument is an optional lazy initializer function. When you write `useReducer(reducer, initialArg)`, React uses `initialArg` as the starting state. When you write `useReducer(reducer, initialArg, init)`, React calls `init(initialArg)` once during the component's first render and uses the return value as starting state.

The subtle trap people miss: even in the two-argument form, `initialArg` is a JavaScript expression that is evaluated on every render call, not just the first. If you write `useReducer(reducer, parseLocalStorage(key))`, that `parseLocalStorage` call runs every time the parent re-renders the component — React just ignores the result after mount. The lazy initializer form guarantees `init` only runs once. It also makes state reset clean: your reducer's `RESET` case can call `return init(action.payload ?? initialArg)` to get back to initial state without duplicating any logic.

**Q: Why must a reducer be a pure function, and what actually happens when it is not?**

A pure function returns the same output for the same inputs and causes no observable side effects. React's entire rendering model — StrictMode double-invocation, Concurrent Mode interruption and replay, time-travel debugging — assumes that re-running the reducer produces identical, side-effect-free results.

In StrictMode (the default in React 18+ development), React deliberately calls your reducer twice per dispatch. If your reducer calls `fetch` or mutates a global, you get two network requests and two mutations per user action. In Concurrent Mode, React can speculatively render a component, discard that render because a higher-priority update arrived, and start over. Any side effect that ran during the discarded render — a timer, a write to localStorage, an API call — already happened. The user's UI never finished rendering, but the backend received the request. Pure reducers are the only guarantee that interrupted renders leave no ghost side effects behind.

**Q: How do you enforce type safety and catch unhandled action types at compile time in TypeScript?**

Use a discriminated union for the action type. A discriminated union is a union of object types where every member has a common literal-typed field — in this case `type: 'ADD_ITEM' | 'REMOVE_ITEM' | ...`. TypeScript uses the literal value of `type` in each `switch` branch to narrow `action.payload` to the exact shape for that branch. Inside `case 'ADD_ITEM'`, TypeScript knows `action.payload` is `Omit<CartItem, 'quantity'>`, not `unknown`.

To get exhaustiveness checking, add a `default` case that assigns the action to a `never`-typed variable: `const _exhaustiveCheck: never = action`. If a developer adds a new action to the discriminated union but forgets to add its `case` in the reducer, TypeScript cannot assign the unhandled union member to `never`, and the build fails immediately — before code review, before deployment.

**Q: When should you use `useReducer` + Context versus an external state library like Redux Toolkit or Zustand?**

`useReducer` + Context is the right default for state that is scoped to a feature or subtree — a checkout flow, a wizard, a data table with complex filter/sort/pagination state. It requires zero extra packages and works great when consuming components are all within one bounded section of the tree.

The architectural limit is re-render propagation. Every time the reducer produces a new state object, every component subscribed to that Context re-renders, even if the field it cares about did not change. Context has no selector mechanism. For application-wide state with many independent consumers — user preferences, notification counts, global auth state — this will cause perceptible performance degradation as the app scales. Zustand and Redux Toolkit both sit outside the React Context system and provide selector subscriptions, so components only re-render when their specific slice changes. They also ship with middleware hooks for logging, analytics, and time-travel debugging, which `useReducer` does not have out of the box.

**Q: What happens when you call `dispatch` unconditionally during render?**

React detects that a dispatch occurred during the render phase and immediately schedules another render. That render also hits the unconditional `dispatch`, which schedules another render. This continues until React throws: `Too many re-renders. React limits the number of renders to prevent an infinite loop.` You must call `dispatch` only inside event handlers, `useEffect` callbacks, or other asynchronous callbacks — never unconditionally in the component function body.

## 6. The Traps — What Goes Wrong

**Trap 1 — Mutating state in place inside the reducer.**

The most common bug looks like this:

```tsx
// ❌ WRONG — pushes directly onto state.todos and returns the same object reference
function reducer(state, action) {
  switch (action.type) {
    case 'ADD_TODO':
      state.todos.push(action.payload); // direct mutation!
      return state;                      // same reference as before
  }
}
```

React checks whether to trigger a re-render using `Object.is(prevState, nextState)`. Because you returned the exact same object that came in — you only mutated its internals — `Object.is` says they are equal and React bails out. The DOM never updates. The UI looks frozen even though your state array now contains the new item. The fix is always to return a fresh object with cloned nested structures:

```tsx
// ✅ CORRECT — new outer object, new array
case 'ADD_TODO':
  return { ...state, todos: [...state.todos, action.payload] };
```

**Trap 2 — Putting side effects inside the reducer.**

```tsx
// ❌ WRONG — fetch fires inside a function React may call multiple times
function reducer(state, action) {
  switch (action.type) {
    case 'SUBMIT':
      fetch('/api/checkout', { method: 'POST', body: JSON.stringify(state) }); // side effect!
      return { ...state, status: 'loading' };
  }
}
```

In StrictMode, React runs this reducer twice per dispatch in development, so you get two network requests per button click. In Concurrent Mode's discarded renders, the `fetch` fires even though the render is thrown away. Keep the reducer pure. Fire your API call in the event handler or in a `useEffect`, and dispatch clean action objects at each outcome — `CHECKOUT_START`, `CHECKOUT_SUCCESS`, `CHECKOUT_FAILURE`.

**Trap 3 — Expensive initial state computed on every render.**

```tsx
// ❌ WRONG — parseStoredCart runs on every single render invocation
const [state, dispatch] = useReducer(reducer, parseStoredCart(localStorage.getItem('cart')));
```

JavaScript evaluates `parseStoredCart(localStorage.getItem('cart'))` every time the parent renders this component. React ignores the result after mount, but the computation still runs. Fix it with the lazy initializer:

```tsx
// ✅ CORRECT — parseStoredCart runs once, on mount
const [state, dispatch] = useReducer(reducer, 'cart', parseStoredCart);
```

**Trap 4 — Treating `useReducer` like a fancy `useState` with setter-style actions.**

```tsx
// ❌ ANTI-PATTERN — this is just useState with extra steps
dispatch({ type: 'SET_FIRST_NAME', payload: 'Jane' });
dispatch({ type: 'SET_LAST_NAME', payload: 'Doe' });
dispatch({ type: 'SET_IS_DIRTY', payload: true });
```

This pattern completely misses the point. You are still pushing the coordination logic into the event handler, still calling multiple dispatches for one logical user action, still risking intermediate invalid states. The right mental model is to dispatch events, not setters. Name the action after what happened in the user's world, not after which field you want to change:

```tsx
// ✅ CORRECT — one dispatch, one domain event, the reducer handles all field updates atomically
dispatch({ type: 'USER_PROFILE_UPDATED', payload: { firstName: 'Jane', lastName: 'Doe' } });
```

**Trap 5 — Reading state immediately after dispatching.**

```tsx
const handleIncrement = () => {
  dispatch({ type: 'INCREMENT' });
  console.log(state.count); // ❌ prints the OLD count, not the incremented one
};
```

`dispatch` does not mutate `state`. It enqueues an update and schedules a re-render. The `state` variable in the current closure is the snapshot from when this render ran — it is immutable within this execution frame. The new count only exists in the next render's `state`. If you need to derive a value to use immediately after dispatching, compute it from the current state before calling dispatch, or read it inside a `useEffect` that runs after the re-render completes.

## 7. Compare With Related Concepts

**`useReducer` vs `useState`**

`useState` is the right tool for independent primitive values — a toggle, a text input, a counter — where the next value is a simple calculation from the current one. `useReducer` is the right tool when state is a complex object where multiple fields need to update together in response to a single event, when the next state depends on several parts of the previous state simultaneously, or when you want transition logic to be testable outside of a component. A helpful rule: if you ever catch yourself calling three different setter functions inside one event handler to represent one user action, that is the signal to move to `useReducer`.

**`useReducer` + Context vs Redux Toolkit / Zustand**

`useReducer` + Context is built in, ships zero bytes, and works perfectly for feature-scoped state in a bounded subtree. The fundamental limitation is that Context has no selector mechanism — every state change re-renders all consumers, regardless of whether they care about the changed slice. Redux Toolkit and Zustand live outside the React Context system, support fine-grained selectors so components only re-render when their specific slice changes, and come with devtools for time-travel debugging. Use `useReducer` + Context for localized module state. Use Zustand or Redux Toolkit when you need global state consumed across many independent components with performance-critical selective subscriptions.

**`useReducer` vs XState (State Machines)**

`useReducer` models transitions with a switch statement, but it does not enforce that only valid transitions can happen. Nothing stops a careless developer from dispatching `CHECKOUT_SUCCESS` while `status` is already `'success'`, or dispatching `CHECKOUT_START` during an in-flight submission. You have to guard those manually with conditional checks. XState defines a formal finite state machine where each state has an explicit set of allowed transitions — unrecognized transitions are structurally impossible, not just discouraged by convention. Use `useReducer` for typical React applications needing clean, unified state transitions. Use XState when modeling mission-critical workflows — payment gateways, authentication sequences, medical device UIs — where illegal state transitions must be mathematically impossible.

## 8. 🧠 The Memory Hook — What Sticks

Don't let the customer behind the counter to touch the cash drawer — that's five scattered `setState` calls. Hand a deposit slip (`action`) through the permanently fixed teller window slot (`dispatch`) to the trained teller (`reducer`), who applies the rulebook without ever touching the outside world and returns a freshly printed statement (`new state`). The window slot never moves. You can give its address to anyone in the building.
