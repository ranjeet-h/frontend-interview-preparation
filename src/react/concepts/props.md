# Props in React

## 1. Why This Exists — The Problem First

In early UI codebases written with jQuery or vanilla JavaScript, 20 different widgets on a dashboard would frequently share and mutate global objects (`window.currentUser`) or reach directly into each other's DOM nodes. When a user updated their display name in the settings panel, widget A updated the shared object, widget B never knew it needed to redraw, widget C read a half-mutated object and threw a `TypeError`, and widget D accidentally overwrote the entire object with a stale copy. Tracking down which part of the application mutated what data, and in what sequence, was nearly impossible.

Even when modular component architectures emerged, allowing child components to mutate their input arguments caused disastrous side effects. If a child component rendering a user summary modified `user.role = 'admin'` to test permissions locally, that mutation leaked straight into sibling components sharing that same user reference.

React introduced props to eliminate this entire category of shared mutable state bugs. Components in React operate under a strict mathematical contract: a component is a pure function that transforms input data into a UI tree ($f(\text{props}) = \text{UI}$). Props establish a unidirectional, top-to-bottom data highway where inputs are strictly read-only, ownership is explicit, and components remain isolated, predictable, and reusable.

## 2. The Analogy — Make It Obvious

Think of props as a restaurant order ticket passed from the front-of-house waiter to the kitchen line cook.

When a customer orders a burger, the waiter writes down the exact specifications on a physical paper ticket:

```text
Ticket #104:
- Patty: Medium-rare beef
- Cheese: Aged Cheddar
- Sauce: On the side
- Table: 12
```

The line cook (the child component) takes this ticket (props) and prepares the meal (the rendered UI). 

1. **The ticket is read-only:** The cook reads the instructions to make the food. The cook cannot erase "Aged Cheddar" and write "Swiss" on the ticket to change the restaurant's inventory database or the customer's billing record. The cook only reads what was ordered.
2. **Every identical ticket yields the same meal:** If the waiter hands the cook five identical tickets for five different tables, the cook produces five identical burgers.
3. **Child-to-parent communication uses a call button:** If the cook runs out of cheddar cheese, the cook does not run into the dining room to change the printed menu. Instead, the cook rings the kitchen service bell (`onOutOfStock("cheddar")`). The waiter (the parent component) hears the bell, handles the situation, updates the main restaurant ordering system (parent state), and prints a revised ticket for the kitchen.

## 3. How It Actually Works — The Full Explanation

### From JSX to Component Invocation
When you write JSX in your component:

```tsx
<UserProfileCard username="alex99" role="admin" isActive={true} />
```

The compiler (Babel, SWC, or TypeScript) transforms this JSX syntax into a standard JavaScript function call:

```javascript
// React 17+ JSX Transform:
import { jsx as _jsx } from 'react/jsx-runtime';

_jsx(UserProfileCard, {
  username: "alex99",
  role: "admin",
  isActive: true
});
```

React bundles all the JSX attributes into a single plain JavaScript object called the `props` object. When React mounts or updates `UserProfileCard`, it invokes the component function, passing that `props` object as its first argument:

```javascript
UserProfileCard({ username: "alex99", role: "admin", isActive: true });
```

### The Immutability Contract and Object.freeze
In React, props are immutable inputs. A component must never modify its own props:

```javascript
function UserProfileCard(props) {
  // ❌ ILLEGAL: Never mutate props!
  props.role = props.role.toUpperCase();
}
```

To enforce this invariant, React calls `Object.freeze(props)` on the props object during development mode. If any code attempts to write to, delete from, or reconfigure a property on `props`, the JavaScript engine throws a runtime error in strict mode: `TypeError: Cannot assign to read only property 'role' of object '#<Object>'`.

While `Object.freeze` only performs a shallow freeze (nested objects inside props are not automatically frozen by the engine), mutating nested properties inside a prop object breaks React's change detection mechanism. React relies on referential equality checking (`Object.is`) during reconciliation. If you mutate an object in place, its memory address remains identical. React cannot detect that the data changed, skips re-rendering, and leaves the UI out of sync with your underlying data model.

### Unidirectional Data Flow and Callbacks
Data in React flows in one direction: top to bottom, from parent to child. A child component has no direct way to push data upward or modify parent state.

To allow child components to trigger changes in the parent, React uses callback props. The parent passes down a reference to a function as a prop. When an event happens inside the child (such as a button click or input change), the child invokes that function, passing whatever new data or event identifiers are relevant as arguments:

```mermaid
flowchart TD
    Parent["Parent Component (Owns State)"]
    Child["Child Component (View Only)"]
    
    Parent -->|1. Passes data via props: count=5| Child
    Parent -->|2. Passes callback prop: onIncrement| Child
    Child -->|3. User clicks: calls onIncrement()| Parent
```

The callback function executes inside the parent's lexical scope, allowing the parent to call its own state setter (`setCount`), update its state, and pass newly computed props back down to the child during the next render pass.

### Modern Default Props vs Legacy defaultProps
In modern functional components, default prop values are handled directly through JavaScript ES6 object destructuring default values:

```tsx
function Button({ variant = 'primary', size = 'medium', children }: ButtonProps) {
  return <button className={`btn btn-${variant} btn-${size}`}>{children}</button>;
}
```

Earlier versions of React used a static property on component functions: `Button.defaultProps = { variant: 'primary' }`. This pattern is officially deprecated for functional components in modern React and will be removed in future releases because:
1. It adds unnecessary runtime overhead to React's element creation pipeline.
2. It conflicts with TypeScript's type inference systems, often requiring complex helper types or marking optional props as potentially undefined.
3. JavaScript's built-in parameter defaults are standard language features, evaluated at call time with zero library-specific magic.

### Props Spreading Hazards
JSX allows spreading an object into props: `<Component {...props} />`. While convenient when authoring higher-order wrappers or forwarding props to underlying components, spreading introduces several architectural hazards:
- **Polluting the DOM:** If you spread arbitrary props onto a native HTML element (e.g., `<button {...props}>`), custom component props like `isLoading` or `variant` are forwarded directly to the DOM node. The browser does not recognize these attributes on HTML elements, causing runtime console warnings.
- **Accidental overrides:** If you write `<Button onClick={handleClick} {...props} />`, any `onClick` passed inside `props` will silently overwrite your explicit `handleClick`.
- **Hidden contracts:** Spreading hides what properties a component actually depends on, making refactoring and static analysis difficult.

### How Prop Changes Drive Re-rendering
By default, whenever a parent component re-renders, all of its descendant components re-render automatically, regardless of whether their props changed.

When you wrap a component in `React.memo(Component)`, React alters this default behavior. Before re-rendering the memoized child, React compares each prop from the previous render with the corresponding prop from the next render using shallow equality (`Object.is`):

1. **Primitive props (strings, numbers, booleans):** Compared by value (`"alex" === "alex"` is `true`).
2. **Reference props (objects, arrays, functions):** Compared by reference memory address.

If a parent creates a new object literal (`style={{ color: 'red' }}`) or an inline arrow function (`onClick={() => handleSelect(id)}`) on every render, the reference memory address changes on every render pass. The shallow comparison fails (`{}` !== `{}`), and `React.memo` is forced to re-render the child anyway, rendering the memoization optimization useless.

## 4. Real Code — See It Working

### Example 1: Explicit Component Contract with Callbacks and Destructuring Defaults

Here is a production-grade task item card showing typed props, default parameters, and child-to-parent callback events:

```tsx
import React from 'react';

// 1. Define a strict contract for all data and callbacks this component accepts
interface Task {
  id: string;
  title: string;
  isCompleted: boolean;
  priority: 'low' | 'medium' | 'high';
}

interface TaskItemProps {
  task: Task;
  // Default values can make secondary configuration optional
  showPriority?: boolean;
  // Callbacks allow child to notify parent without owning the task collection
  onToggleComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

export function TaskItem({
  task,
  showPriority = true, // ES6 default parameter syntax
  onToggleComplete,
  onDelete,
}: TaskItemProps) {
  return (
    <div className={`task-row ${task.isCompleted ? 'completed' : ''}`}>
      <input
        type="checkbox"
        checked={task.isCompleted}
        // Invoking the parent callback when user interacts
        onChange={() => onToggleComplete(task.id)}
        aria-label={`Mark "${task.title}" as complete`}
      />
      
      <span className="task-title">{task.title}</span>
      
      {showPriority && (
        <span className={`badge badge-${task.priority}`}>
          {task.priority}
        </span>
      )}
      
      <button
        type="button"
        className="delete-btn"
        onClick={() => onDelete(task.id)}
      >
        Delete
      </button>
    </div>
  );
}
```

### Example 2: Discriminated Union Props for Mutually Exclusive APIs

A common prop design mistake is having optional props that only make sense in certain combinations (e.g., a modal that takes `errorMessage` when `variant="error"` but shouldn't allow it when `variant="success"`). TypeScript discriminated unions let you create impossible states at compile time:

```tsx
import React from 'react';

// Discriminated union: variant determines which specific props are valid
type BannerProps =
  | {
      variant: 'info' | 'success';
      title: string;
      message: string;
    }
  | {
      variant: 'error';
      title: string;
      message: string;
      errorCode: number;
      onRetry: () => void; // Required for error banners, invalid for others
    };

export function Banner(props: BannerProps) {
  if (props.variant === 'error') {
    // TypeScript automatically narrows props to the error branch
    return (
      <div className="banner banner-error" role="alert">
        <h4>{props.title} (Error #{props.errorCode})</h4>
        <p>{props.message}</p>
        <button onClick={props.onRetry}>Try Again</button>
      </div>
    );
  }

  // TypeScript knows onRetry and errorCode do not exist here
  return (
    <div className={`banner banner-${props.variant}`}>
      <h4>{props.title}</h4>
      <p>{props.message}</p>
    </div>
  );
}
```

### Example 3: Composition with `children` to Eliminate Prop Drilling

Instead of passing 8 different configuration props down 5 levels just to feed a deeply nested button, pass components directly as `children`:

```tsx
import React, { ReactNode } from 'react';

interface DialogProps {
  title: string;
  // ReactNode accepts any renderable React content: JSX, text, numbers, fragments
  children: ReactNode;
  footerActions?: ReactNode;
}

export function Dialog({ title, children, footerActions }: DialogProps) {
  return (
    <div className="dialog-overlay">
      <div className="dialog-modal" role="dialog" aria-modal="true">
        <header className="dialog-header">
          <h3>{title}</h3>
        </header>
        
        <div className="dialog-body">
          {children}
        </div>
        
        {footerActions && (
          <footer className="dialog-footer">
            {footerActions}
          </footer>
        )}
      </div>
    </div>
  );
}

// Usage at parent level: Parent wires up actions without intermediate drilling
export function DeleteAccountFlow() {
  const handleDelete = () => console.log('Deleted');

  return (
    <Dialog
      title="Confirm Deletion"
      footerActions={
        <button className="btn-danger" onClick={handleDelete}>
          Permanently Delete
        </button>
      }
    >
      <p>This action cannot be undone. All database records will be erased.</p>
    </Dialog>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are props in React and how does React pass them internally?**

Props (short for properties) are the configuration object passed from a parent component to a child component to customize its rendering and behavior. 

Under the hood, JSX tags compile to `jsx(Component, propsObject)` or `React.createElement(Component, propsObject)`. When React reconciles and renders the component tree, it executes the functional component as a plain JavaScript function, passing the bundled attributes as the first argument (`props`). In class components, React assigns this object to `this.props` before calling `render()`. React treats props as the immutable parameter list of a pure UI function: given identical props and state, a component should return the exact same JSX tree.

---

**Q: Are props mutable? What happens if you try to mutate a prop?**

Props are strictly read-only. A receiving component must never modify its props.

In development mode, React calls `Object.freeze(props)` on the props object. Attempting to reassign a property (e.g., `props.name = 'Bob'`) throws a `TypeError` in strict mode. 

If you mutate nested properties of an object or array passed via props (e.g., `props.user.name = 'Bob'`), `Object.freeze` does not throw because it is shallow, but it causes severe runtime bugs:
1. **Broken Change Detection:** React compares prop references using `Object.is`. Because the object reference did not change, `React.memo` or React's internal reconciler will not detect that a re-render is required.
2. **Leaked Side Effects:** Sibling components sharing that same `user` object reference will now hold mutated data without having rendered the update, causing state desynchronization across the entire UI tree.

---

**Q: How do children pass data back up to parent components in a unidirectional data flow architecture?**

Children communicate with parents through callback props (inversion of control). 

Because data only flows down in React, a parent that needs to receive information from a child passes a JavaScript function reference down as a prop (e.g., `<SearchBar onSearch={handleSearch} />`). When the child detects an event (such as a form submit or input keystroke), it invokes the callback: `props.onSearch(searchTerm)`.

The function executes in the parent's lexical scope. The parent can then update its own local state using `useState` or `useReducer`. This updates the parent's state, causing the parent to re-render and flow the newly computed data back down the tree as updated props.

---

**Q: What is prop drilling, and how should you address it in production applications?**

Prop drilling is the process of passing props through several layers of intermediate components that have no use for that data, purely to deliver it to a deeply nested child component that needs it.

While prop drilling 2 or 3 layers is normal, explicit, and easy to trace, drilling through 5 to 10 layers causes severe maintenance pain:
- Intermediate components become tightly coupled to data shapes they do not care about.
- Refactoring the data shape requires modifying every intermediate component in the path.
- Renaming or deleting props becomes error-prone.

To resolve prop drilling:
1. **Component Composition:** Pass the leaf component down as `children` or as a JSX prop (e.g., `<Layout sidebar={<UserProfile user={user} />} />`). The intermediate layout component does not need to know what props `UserProfile` requires; it just places the slot.
2. **React Context:** Use `createContext` and `useContext` for truly global or ambient data (themes, authenticated user session, localization).
3. **State Management Libraries:** For complex interactive domain state, use external stores (Zustand, Redux Toolkit, Jotai).

---

**Q: Why does passing inline functions or new object literals to props break `React.memo`?**

`React.memo` optimizes functional components by performing a shallow equality comparison (`Object.is`) on all props between renders. If every prop is identical to its previous value, React skips rendering the component and its children.

In JavaScript, objects, arrays, and functions are compared by reference, not by structure or content:
```javascript
(() => {}) === (() => {}) // false
({ a: 1 }) === ({ a: 1 }) // false
```

When a parent component re-renders, any inline function (`onClick={() => doWork()}`) or inline object (`config={{ theme: 'dark' }}`) declared in JSX is instantiated as a brand new reference in memory. When `React.memo` compares `prevProps.onClick` to `nextProps.onClick`, `Object.is` returns `false`. The memoization comparison fails every single render, causing the child to re-render anyway and wasting CPU cycles on unnecessary shallow comparisons.

To preserve memoization, wrap functions in `useCallback` and objects/arrays in `useMemo`, or declare static constants outside the component body.

---

**Q: What is the difference between `defaultProps` and ES6 default parameter syntax, and why was `defaultProps` deprecated?**

`defaultProps` is a static property attached to component functions (`Button.defaultProps = { variant: 'primary' }`). During element creation, React copied default values into the props object before passing it to the component.

ES6 default parameter syntax uses native JavaScript destructuring right in the function signature:
```tsx
function Button({ variant = 'primary', size = 'md' }: ButtonProps) {}
```

`defaultProps` on functional components was deprecated because:
- **TypeScript incompatibility:** TypeScript struggled to infer whether a prop with `defaultProps` was optional for callers while guaranteed to be defined inside the component body, requiring messy workarounds.
- **Runtime cost:** React had to perform an extra property lookup and copy step during element creation.
- **Language standards:** ES6 destructuring defaults are a native JavaScript standard that executes directly at function call time with no React runtime baggage.

---

**Q: How should you type the `children` prop in TypeScript, and what is the difference between `ReactNode`, `ReactElement`, and `JSX.Element`?**

In almost all cases, `children` should be typed as `React.ReactNode`:

```tsx
interface CardProps {
  title: string;
  children: React.ReactNode;
}
```

The differences between the three core React types are:
- `React.ReactNode`: The broadest type. Represents anything that React can render: a JSX element, a string, a number, a boolean, `null`, `undefined`, a React Fragment, or an array of these. This is the correct type for `children`.
- `React.ReactElement`: Represents a formal React element object returned by `React.createElement` or JSX. It excludes primitives like strings, numbers, and `null`. Use this only when a component strictly requires a single valid React element (e.g., a wrapper component that clones its child via `React.cloneElement`).
- `JSX.Element`: A TypeScript-specific global interface that extends `React.ReactElement<any, any>`. It represents the return type of a JSX expression.

---

**Q: What are the dangers of prop spreading (`<Component {...props} />`)?**

Spreading props is risky for three main reasons:
1. **DOM Attribute Leaks:** Spreading an uncurated props object onto an HTML element forwards non-standard attributes to the DOM. For example, `<input {...props} />` where `props` includes `customValidationRule="email"` results in React console warnings about unrecognized DOM attributes.
2. **Accidental Override Order:** In JSX, prop order matters. `<Button onClick={handleClick} {...props} />` will allow an incoming `onClick` inside `props` to overwrite `handleClick`. Conversely, `<Button {...props} onClick={handleClick} />` ensures `handleClick` always wins. Developers frequently get this ordering wrong.
3. **Loss of Static Intention:** Explicit prop passing acts as self-documenting code. Spreading makes it impossible to see at a glance what data a component consumes or passes down, making refactors and dependency tracking difficult.

## 6. The Traps — What Goes Wrong

### Trap 1: Copying Props into State (The Stale Derived State Bug)
A widespread antipattern is initializing component state directly from a prop and expecting that state to update when the parent passes a new prop:

```tsx
// ❌ WRONG: State is only initialized once on component mount!
function UserEmailEditor({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);

  // If the parent passes a different initialEmail later (e.g. user selected another profile),
  // this component WILL NOT update its email state.
  return <input value={email} onChange={(e) => setEmail(e.target.value)} />;
}
```

**Why it fails:** `useState(initialEmail)` only reads `initialEmail` on the very first mount. Subsequent re-renders with a different `initialEmail` prop are completely ignored by `useState`.

**The Fix:**
- If the component should be fully controlled by the parent, use props directly: `function UserEmailEditor({ email, onEmailChange })`.
- If the component needs to reset local state when the underlying item changes, tell React to remount the component by changing its `key` at the parent level: `<UserEmailEditor key={userId} initialEmail={user.email} />`.

---

### Trap 2: Mutating Nested Prop Objects in Place
When receiving complex data structures, developers sometimes mutate nested properties before rendering or in event handlers:

```tsx
// ❌ WRONG: In-place mutation corrupts shared references and breaks change detection
function FilterList({ filterConfig, onChange }: FilterListProps) {
  const handleToggle = (key: string) => {
    filterConfig.activeFilters[key] = !filterConfig.activeFilters[key]; // MUTATION!
    onChange(filterConfig);
  };
  // ...
}
```

**Why it fails:** `filterConfig` is an object reference owned by the parent. Modifying `filterConfig.activeFilters` alters the parent's memory reference directly without triggering React's state transition machinery. If the parent or a sibling uses `React.memo`, it compares the old `filterConfig` to the new `filterConfig`, sees they are the exact same memory pointer, and fails to update the screen.

**The Fix:** Always create shallow copies when updating objects or arrays:

```tsx
// ✅ CORRECT: Create a fresh object with updated properties
const handleToggle = (key: string) => {
  const updatedFilters = {
    ...filterConfig,
    activeFilters: {
      ...filterConfig.activeFilters,
      [key]: !filterConfig.activeFilters[key],
    },
  };
  onChange(updatedFilters);
};
```

---

### Trap 3: Breaking Memoization with New References
Wrapping a child component in `React.memo` is completely ineffective if the parent component passes unstable object or function references:

```tsx
// ❌ WRONG: Child re-renders every time Parent re-renders
function ParentDashboard() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>Increment: {count}</button>
      {/* 
        1. New inline object reference created on every render: { role: 'admin' }
        2. New inline arrow function created on every render: () => {}
      */}
      <MemoizedUserBadge
        config={{ role: 'admin' }}
        onLogout={() => console.log('logout')}
      />
    </div>
  );
}
```

**The Fix:** Stabilize reference identities with `useMemo`, `useCallback`, or module-level constants:

```tsx
// ✅ CORRECT: Stable references preserve React.memo
const USER_CONFIG = { role: 'admin' }; // Static constant outside render

function ParentDashboard() {
  const [count, setCount] = useState(0);

  const handleLogout = useCallback(() => {
    console.log('logout');
  }, []); // Stable callback identity

  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>Increment: {count}</button>
      <MemoizedUserBadge config={USER_CONFIG} onLogout={handleLogout} />
    </div>
  );
}
```

---

### Trap 4: Spreading Unknown Props into Native HTML Elements
When building custom UI wrapper components, spreading `...rest` props onto raw HTML nodes often leaks custom properties into the DOM:

```tsx
interface CustomButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  variant?: 'primary' | 'secondary';
}

// ❌ WRONG: isLoading and variant get spread directly onto <button>
function BadButton({ isLoading, variant, ...rest }: CustomButtonProps) {
  // If rest contains custom properties, or if you write <button {...props}>,
  // React warns: "Received `true` for a non-boolean attribute `isLoading`."
  return <button {...rest} className={`btn-${variant}`} />;
}
```

**The Fix:** Destructure all custom component props explicitly, so only valid HTML attributes remain in the `rest` object before spreading onto the DOM node:

```tsx
// ✅ CORRECT: Only standard button attributes remain in restProps
function GoodButton({
  isLoading = false,
  variant = 'primary',
  children,
  disabled,
  className = '',
  ...restProps
}: CustomButtonProps) {
  return (
    <button
      {...restProps}
      disabled={disabled || isLoading}
      className={`btn btn-${variant} ${className}`}
    >
      {isLoading ? <Spinner /> : children}
    </button>
  );
}
```

## 7. Compare With Related Concepts

| Concept | What It Is | Who Owns It | Mutable by Component? | Primary Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Props** | Read-only input object passed from parent to child | Parent component | No (Immutable / Read-only) | Configuring child components and flowing data down the tree |
| **State** | Local, private memory managed within a component | The component itself | Yes (Via setter functions like `useState`) | Storing data that changes over time based on user interactions |
| **Context** | Ambient broadcast mechanism for a component subtree | Nearest `Context.Provider` | No (Consumers read; Provider owns update) | Sharing global/ambient data (themes, auth) without prop drilling |
| **DOM Attributes** | Key-value properties on native HTML DOM elements | Browser DOM engine | Yes (Via JavaScript DOM API) | Configuring native browser elements (`href`, `src`, `type`, `id`) |
| **Function Arguments** | Parameters passed into standard JavaScript functions | Caller of the function | Yes (Unless frozen or typed as readonly) | Providing inputs to any computational logic |

### Quick Decision Rules:
- **Use Props** when passing configuration, data, or event callbacks directly from an immediate parent to a child.
- **Use State** when a component needs to track data that changes over time as a result of user action (e.g., input values, toggle open/closed, pending form status).
- **Use Context** only when data is needed by many components at multiple nesting levels and passing it through intermediate components adds zero architectural value.
- **Use Composition (`children`)** when an intermediate component only acts as a visual container or layout wrapper for its contents.

## 8. 🧠 The Memory Hook — What Sticks

Props are a component's **read-only work order**: the parent writes the ticket, the child executes the instructions, and if the child needs something changed, it rings the parent's callback bell instead of rewriting the ticket.
