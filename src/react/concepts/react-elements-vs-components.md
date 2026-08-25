# React Elements vs Components

## 1. Why This Exists — The Problem First

Imagine you are reviewing a pull request where a junior engineer wanted to "clean up" a messy JSX tree. They extracted a repeated piece of UI into a function `function UserCard({ user }) { ... }`, but inside the return statement, instead of writing `<UserCard user={user} />`, they wrote `{UserCard({ user })}`.

On the surface, it appears to work during a quick smoke test. Then the edge cases hit production: an input inside the card loses focus on every keystroke, conditional hooks crash the app with `Rendered fewer hooks than expected`, and when one card's internal state updates, the entire parent component violently re-renders and resets other sibling cards.

In another part of the codebase, an engineer defined `const InputField = () => <input ... />` inside the render body of a parent form component. Every single time the user types a single character, the input unmounts, loses focus, and forces the user to click back into the input box to type the next character.

Both bugs stem from the exact same fundamental misunderstanding: confusing **React Elements**, **React Components**, and **Fiber Instances**. When you treat React components as simple helper functions or create them on the fly during rendering, you bypass React's reconciler, corrupt hook state boundaries, and force the browser to destroy and recreate live DOM nodes on every frame.

## 2. The Analogy — Make It Obvious

Think of constructing a building:

- **The Component is the Architectural Firm.** It is a reusable entity with specific training and blueprints. When given requirements (props like number of rooms, paint color), it knows how to draft a blueprint. The firm itself is not a building.
- **The React Element is the Blueprint on Paper.** It is a lightweight, cheap sheet of paper describing the building: `{ type: 'House', rooms: 3, color: 'blue' }`. Printing 1,000 blueprints takes seconds and costs pennies. A blueprint has no physical mass, no running water, and no electrical wiring. If you want to change the color, you don't erase the ink—you print a fresh blueprint.
- **The React Fiber (Component Instance) is the Construction Foreman's Logbook.** The foreman stays on the construction site across days and weeks. The logbook keeps track of long-term state: who lives here, what materials are already delivered, and the exact progress of each room.
- **The DOM Node is the Physical Building of Steel and Concrete.** Constructing, modifying, or demolishing physical concrete in the real world is slow, expensive, and heavy.

When your application re-renders, React does not bulldoze the physical building. Instead, the architectural firm prints a new blueprint (a new React Element). The foreman compares today's blueprint against yesterday's blueprint. If the only difference is that the front door should be red instead of white, the foreman sends one painter to repaint the door on the physical building. The foundation and walls stay untouched.

## 3. How It Actually Works — The Full Explanation

To understand why React separates these concepts, we must trace what happens from the moment you write JSX to the moment pixels change on screen.

**Step 1: JSX is just a syntax wrapper for object creation**

Browsers cannot execute JSX natively. During your build step, tools like Babel, SWC, or TypeScript transform JSX into standard JavaScript function calls.

When you write:

```tsx
const element = <button className="btn-primary" onClick={handleClick}>Save</button>;
```

The compiler transforms it into:

```javascript
import { jsx as _jsx } from 'react/jsx-runtime';

const element = _jsx('button', {
  className: 'btn-primary',
  onClick: handleClick,
  children: 'Save'
});
```

When this function executes, it returns a plain, frozen JavaScript object known as a **React Element**:

```javascript
{
  $$typeof: Symbol.for('react.element'),
  type: 'button',
  key: null,
  ref: null,
  props: {
    className: 'btn-primary',
    onClick: handleClick,
    children: 'Save'
  },
  _owner: FiberNode,
  _store: {}
}
```

Notice what is inside this object:
- `$$typeof`: A unique JavaScript Symbol (`Symbol.for('react.element')`). This is a critical security feature. If a malicious user passes raw JSON containing an element description from an API, standard JSON cannot contain JavaScript Symbols. React checks this property to prevent Cross-Site Scripting (XSS) injection attacks.
- `type`: A string (like `'button'` or `'div'`) for native DOM elements, or a direct reference to a function or class for custom components.
- `props`: All attributes passed in JSX, including `children`.
- `key` and `ref`: Metadata used by React to track element identity and DOM references.

A React Element is 100% immutable. React freezes it in development mode (`Object.freeze`). It is nothing more than a static description of what the UI should look like at one single point in time.

**Step 2: A Component is a function that returns an Element tree**

A React component is a JavaScript function (or ES6 class) that accepts an inputs object called `props` and returns a tree of React Elements:

```tsx
function Button({ variant, children }: ButtonProps) {
  return <button className={`btn-${variant}`}>{children}</button>;
}
```

When you write `<Button variant="primary">Save</Button>`, you are not executing the `Button` function immediately. You are creating a React Element whose `type` property is a reference to the `Button` function itself:

```javascript
{
  $$typeof: Symbol.for('react.element'),
  type: Button, // Reference to the function itself!
  props: {
    variant: 'primary',
    children: 'Save'
  }
}
```

React holds onto this element object. React decides *when* and *how* to call `Button(props)`.

**Step 3: The Fiber Node is the persistent instance**

Because React Elements are plain objects recreated on every single render pass, they cannot hold internal state, active timers, or hook values.

To keep track of state across renders, React creates an internal data structure called a **Fiber node** for every mounted component. The Fiber node is the true runtime "instance" of a component. It holds:
- `memoizedState`: A singly-linked list of all hooks (`useState`, `useEffect`, `useRef`) in the exact order they were declared.
- `memoizedProps`: The props used during the previous render.
- `stateNode`: A reference to the real browser DOM node (for host components) or class instance.
- Pointers to `child`, `sibling`, and `return` (parent) Fibers forming the Fiber tree.

**Step 4: The Reconciliation loop**

When state changes, React begins the Render Phase:
1. React visits each Fiber node in the tree.
2. If the Fiber corresponds to a function component, React invokes that function: `Component(props)`.
3. The component executes its hooks against the current Fiber's `memoizedState` linked list and returns a new tree of React Elements.
4. React compares the newly returned Element tree against the previous Fiber tree:
   - **Same `type` and `key`:** React reuses the existing Fiber node, retains its state, updates its props, and marks only the changed DOM attributes for updating.
   - **Different `type`:** React unmounts the old Fiber node completely, destroys its internal state, fires any `useEffect` cleanup functions, removes the old DOM subtree, and mounts a brand-new Fiber and DOM node from scratch.

**Why `<Component />` vs `Component()` is a catastrophic difference:**

When you write `<UserCard user={user} />`:
- You create an element `{ type: UserCard, props: { user } }`.
- React sees `type: UserCard`, creates a dedicated child Fiber node for it, mounts its hook state on that child Fiber, and isolates its lifecycle.

When you write `{UserCard({ user })}`:
- You call the function directly inside the parent component's execution frame.
- No child Fiber node is created.
- Any hooks called inside `UserCard` (like `useState` or `useEffect`) are executed directly on the **parent component's Fiber node**.
- If `UserCard` is called inside an `if` block or a `.map()` loop, the parent component executes a different number of hooks depending on runtime conditions, crashing React with `Error: Rendered fewer hooks than expected`.

## 4. Real Code — See It Working

Here are practical, runnable examples demonstrating element inspection, the hook-calling trap, element cloning, and component identity issues.

**Example 1: Inspecting the React Element object**

```tsx
import React from 'react';

interface BadgeProps {
  label: string;
  count: number;
}

function Badge({ label, count }: BadgeProps) {
  return (
    <span className="badge">
      {label}: {count}
    </span>
  );
}

// 1. Creating an element from a custom component
const customElement = <Badge label="Notifications" count={5} />;

// 2. Creating an element from a native HTML tag
const domElement = <div id="main" className="container">Hello</div>;

console.log('Custom Element:', customElement);
/* Output:
{
  $$typeof: Symbol(react.element),
  type: [Function: Badge],       // Function reference, not called yet
  props: { label: 'Notifications', count: 5 },
  key: null,
  ref: null
}
*/

console.log('DOM Element:', domElement);
/* Output:
{
  $$typeof: Symbol(react.element),
  type: 'div',                    // Plain string tag name
  props: { id: 'main', className: 'container', children: 'Hello' },
  key: null,
  ref: null
}
*/
```

**Example 2: The Direct Function Invocation Trap vs Proper JSX**

```tsx
import React, { useState } from 'react';

interface CounterProps {
  title: string;
}

function Counter({ title }: CounterProps) {
  // This hook belongs to the Fiber node of Counter
  const [count, setCount] = useState(0);

  return (
    <div className="p-4 border rounded">
      <h4>{title}</h4>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  );
}

export function Dashboard() {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div>
      <button onClick={() => setShowAdvanced(prev => !prev)}>
        Toggle View
      </button>

      {/* CORRECT: React creates a distinct Fiber for Counter.
          Its state is preserved independently. */}
      <Counter title="Standard Counter" />

      {/* CATASTROPHIC BUG: Calling Counter as a plain function.
          Hooks inside Counter attach to Dashboard's Fiber.
          When showAdvanced toggles, the number of hooks in Dashboard changes,
          throwing a fatal runtime error: 'Rendered more hooks than during previous render'. */}
      {showAdvanced && Counter({ title: 'Broken Direct Call Counter' })}
    </div>
  );
}
```

**Example 3: Modifying Elements with `React.cloneElement`**

Because React elements are immutable, you cannot do `element.props.disabled = true`. You use `React.cloneElement` to produce a new element with merged props:

```tsx
import React, { ReactElement } from 'react';

interface ButtonGroupProps {
  // Expects React Elements, not Component definitions
  children: ReactElement<{ variant?: string; size?: string }>[];
}

export function ButtonGroup({ children }: ButtonGroupProps) {
  return (
    <div className="inline-flex rounded-md shadow-sm" role="group">
      {React.Children.map(children, (child, index) => {
        // Clone the element and inject shared props without mutating the original
        return React.cloneElement(child, {
          variant: 'grouped',
          size: 'sm',
          key: child.key ?? index,
        });
      })}
    </div>
  );
}

// Usage:
export function Toolbar() {
  return (
    <ButtonGroup>
      <button onClick={() => console.log('1')}>First</button>
      <button onClick={() => console.log('2')}>Second</button>
    </ButtonGroup>
  );
}
```

**Example 4: Nested Component Definition Trap vs Extracted Component**

```tsx
import React, { useState } from 'react';

// BAD: Defined inside the parent component render cycle
export function BadForm() {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');

  // WRONG: On every keystroke, BadForm re-runs and generates a brand-new
  // function reference for SubInput. React diffs `prevType !== nextType`,
  // unmounts the DOM <input>, and destroys focus!
  function SubInput({ label, value, onChange }: any) {
    return (
      <label>
        {label}
        <input value={value} onChange={e => onChange(e.target.value)} />
      </label>
    );
  }

  return (
    <form>
      <SubInput label="Name" value={name} onChange={setName} />
      <SubInput label="Age" value={age} onChange={setAge} />
    </form>
  );
}

// GOOD: Defined outside so the component reference is stable across renders
interface FieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
}

function StableField({ label, value, onChange }: FieldProps) {
  return (
    <label>
      {label}
      <input value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

export function GoodForm() {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');

  return (
    <form>
      <StableField label="Name" value={name} onChange={setName} />
      <StableField label="Age" value={age} onChange={setAge} />
    </form>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the exact difference between a React Element and a React Component?**

A React Component is a blueprint or template: a JavaScript function or ES6 class that accepts props as input and returns a tree of React Elements. It encapsulates rendering logic, hook declarations, and UI structure.

A React Element is the immutable plain JavaScript object returned by invoking JSX (via `_jsx` or `React.createElement`). It contains fields like `type`, `props`, `key`, and `ref`. An element is not an instance and does not hold state; it is simply a lightweight descriptor of what a slice of UI should look like at a specific moment in time.

**Q: What happens under the hood when you call `{MyComponent()}` directly instead of rendering `<MyComponent />` in JSX?**

When you render `<MyComponent />`, JSX compiles to `_jsx(MyComponent, props)`. React receives an element descriptor with `type: MyComponent`. During reconciliation, React creates a child Fiber node for `MyComponent`, creates an isolated hook context, mounts state on that child Fiber, and tracks its lifecycle independently.

When you call `{MyComponent()}`, you execute the function immediately in the caller's stack frame. No child Fiber node is created. All hooks (`useState`, `useEffect`) inside `MyComponent` attach directly to the *parent* component's Fiber. This causes three severe failures:
1. If called conditionally or inside loops, it breaks the Rules of Hooks by altering the number or order of hooks in the parent, throwing a runtime crash.
2. State updates inside `MyComponent` trigger full parent re-renders instead of localized child updates.
3. Component devtools and error boundaries cannot identify the component boundary because it does not exist in the Fiber tree.

**Q: What is a React Fiber or component instance, and how does it relate to an element?**

A React Element is a disposable, short-lived object created and discarded during every render pass. A React Fiber is a persistent, long-lived internal data structure that represents the component's actual runtime instance in memory.

While the element only describes desired output, the Fiber node stores:
- The component's current and memoized props.
- The linked list of hooks (`useState`, `useReducer`, `useEffect`, `useRef`).
- Pointers to parent, child, and sibling Fibers in the tree.
- Direct references to the actual browser DOM elements (`stateNode`).

When an element tree is regenerated on a re-render, React matches each new element against its corresponding Fiber node using `type` and `key` to decide whether to update the existing Fiber or destroy it.

**Q: Why does every React Element have a `$$typeof: Symbol.for('react.element')` property?**

It is a security defense mechanism against Cross-Site Scripting (XSS) attacks caused by malicious server JSON responses.

If an application accepts arbitrary user JSON from an API and renders it directly, an attacker could craft a payload mimicking a React element:
```json
{
  "type": "script",
  "props": { "dangerouslySetInnerHTML": { "__html": "maliciousCode()" } }
}
```
If React only checked for plain objects with `type` and `props`, it might attempt to render this malicious object. However, valid JSON cannot serialize JavaScript `Symbol` primitives. React checks `element.$$typeof === Symbol.for('react.element')`. Because the attacker's JSON payload cannot contain real Symbols, React rejects the fraudulent element and prevents the XSS exploit.

**Q: Why are React Elements immutable, and what performance optimization does this allow?**

React elements are frozen objects describing the UI at a single point in time. Immutability guarantees that once an element tree is created for a render frame, no subsequent code can mutate its properties and corrupt that render's snapshot.

This immutability enables the **fast-path bailout optimization** in React's reconciler:
If a parent re-renders, but a child element reference has not changed (`oldElement === newElement`), React knows with 100% certainty that neither the component's `type` nor its `props` have changed. React can completely skip rendering that entire subtree. This is the foundation of `React.memo`, `useMemo`, and passing JSX as `children`.

**Q: Can React Elements be stored in variables, arrays, or passed as props?**

Yes. Because React elements are standard JavaScript objects, they are first-class citizens. You can assign them to variables (`const header = <Header />`), store them in arrays (`[<Tab key="1" />, <Tab key="2" />]`), or pass them as props (`<Layout sidebar={<Sidebar />} />` or `props.children`).

However, you should avoid storing React elements in `useState`. Elements are static snapshots of the props and state at the millisecond they were created. If data changes later, an element stored in state will remain frozen with stale data. Always store raw data in state and construct elements during the render phase.

**Q: What does React compare during reconciliation — component source code, DOM nodes, or elements?**

React compares **trees of React Elements**.

React does not parse your component function's source code or compare JavaScript function bodies. It also does not inspect the live browser DOM tree during the diffing phase because reading from the DOM is slow.

Instead, React compares the previous element tree (stored on the Fibers) with the newly returned element tree:
- If `prevElement.type === nextElement.type` and `prevElement.key === nextElement.key`, React preserves the Fiber and DOM node, updating only changed props.
- If the `type` differs (e.g., `'div'` changed to `'span'`, or `Button` changed to `Card`), React tears down the old subtree and constructs a new one from scratch.

## 6. The Traps — What Goes Wrong

**Trap 1: Calling a component as a helper function (`{RenderHeader()}`) instead of using JSX (`<RenderHeader />`)**

- **The Mistake:** Writing `{RenderHeader()}` to avoid creating a new file or because it feels like a simple template helper.
- **Why it breaks:** The function executes within the parent's Fiber context. If `RenderHeader` uses any hooks (`useState`, `useEffect`), those hooks are registered on the parent component. If `RenderHeader` is called conditionally (`{isLoggedIn && RenderHeader()}`), toggling `isLoggedIn` changes the parent's total hook count between renders, causing React to throw `Rendered fewer hooks than expected`.
- **The Fix:** Always render as JSX: `<RenderHeader />`. If it does not need hooks or component lifecycle, make it a pure helper function that returns plain data or primitive strings, not hook-dependent JSX.

**Trap 2: Declaring a component definition inside another component's body**

- **The Mistake:**
  ```tsx
  function Parent() {
    // Nested component definition
    const Row = ({ text }: { text: string }) => <div>{text}</div>;
    return <Row text="Hello" />;
  }
  ```
- **Why it breaks:** Every time `Parent` re-renders, a brand-new `Row` function is allocated at a new memory address. When React reconciles `<Row />`, it compares `prevElement.type !== nextElement.type` by reference equality. Because the function reference changed, React assumes this is an entirely different component type. It completely unmounts the old `Row`, unmounts all children, resets all child state to initial values, and causes text inputs to lose focus on every keystroke.
- **The Fix:** Move the component definition outside of the parent function, or pass needed data down via standard props.

**Trap 3: Storing React Elements in `useState`**

- **The Mistake:**
  ```tsx
  const [modal, setModal] = useState(<UserModal user={currentUser} />);
  ```
- **Why it breaks:** `<UserModal user={currentUser} />` evaluates immediately into a static React Element object capturing the value of `currentUser` at that instant. When `currentUser` updates later in the parent component, the element stored inside `modal` state remains unchanged and stale.
- **The Fix:** Store only boolean flags or raw IDs in state (`const [isOpen, setIsOpen] = useState(false)`), and construct the element dynamically during render: `{isOpen && <UserModal user={currentUser} />}`.

**Trap 4: Mutating element props directly**

- **The Mistake:**
  ```tsx
  function Container({ child }: { child: ReactElement }) {
    child.props.className = 'active'; // Runtime error or silent corruption
    return child;
  }
  ```
- **Why it breaks:** React elements are frozen via `Object.freeze` in development mode; attempting to mutate them throws a `TypeError: Cannot assign to read only property`. Even in production where freezing may be omitted for performance, mutating shared element objects corrupts the reconciler's ability to diff previous vs current props.
- **The Fix:** Use `React.cloneElement(child, { className: 'active' })` to create a new element with shallow-merged props.

**Trap 5: Assuming React Elements are live DOM nodes**

- **The Mistake:** Expecting to call DOM methods like `.focus()`, `.getBoundingClientRect()`, or `.addEventListener()` directly on a React Element.
- **Why it breaks:** A React element is a plain JavaScript object describing UI. It does not exist in the browser's DOM tree.
- **The Fix:** Use a React Ref (`useRef`) attached to a host JSX element (`<input ref={inputRef} />`), and call browser methods on `inputRef.current` inside `useEffect` or event handlers after the commit phase has mounted the real DOM node.

## 7. Compare With Related Concepts

**React Element vs React Component**
- **The Difference:** A Component is a reusable function or class that defines how UI should be constructed. A React Element is the plain object returned by JSX describing what should appear on screen.
- **Rule of Thumb:** Use a Component to define reusable logic and UI structure; use an Element to describe a specific instance to render.

**React Element vs Real DOM Node**
- **The Difference:** A React Element is a lightweight, immutable in-memory JavaScript object (`{ type, props }`) managed by React. A real DOM Node is an expensive, stateful browser object with hundreds of built-in properties, style recalculations, and layout trees.
- **Rule of Thumb:** React Elements are virtual blueprints created thousands of times per second; DOM Nodes are the physical browser objects painted on screen.

**React Component vs React Fiber (Instance)**
- **The Difference:** A Component is stateless source code (the function declaration). A Fiber is the stateful runtime instance created by React that persists across renders to hold hook lists, state, memoized props, and DOM pointers.
- **Rule of Thumb:** The Component is the recipe; the Fiber is the kitchen workspace tracking the active dish being cooked.

**JSX vs React Element**
- **The Difference:** JSX is compile-time syntax sugar that humans write (`<div />`). A React Element is the runtime JavaScript object produced when that JSX is compiled into `_jsx()` or `React.createElement()` calls and executed.
- **Rule of Thumb:** JSX is what you type into your code editor; a React Element is what JavaScript creates in memory at runtime.

**`React.cloneElement` vs Props Spreading (`{...props}`)**
- **The Difference:** Props spreading (`<Button {...props} />`) is used at JSX authoring time when you are creating an element from scratch. `React.cloneElement(existingElement, extraProps)` is used at runtime when you already have an instantiated element object and need to shallow-copy it with modified or injected props.
- **Rule of Thumb:** Use props spreading when writing your own JSX; use `React.cloneElement` when enhancing an element passed into your component as a prop or child.

## 8. 🧠 The Memory Hook

A **Component** is the factory, a **React Element** is the blueprint paper it prints, a **Fiber** is the supervisor's ledger holding live state, and the **DOM** is the physical building. When state changes, you print a new blueprint, the supervisor checks what changed, and only the necessary bricks are moved.
