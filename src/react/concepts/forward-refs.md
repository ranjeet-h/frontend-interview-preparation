# Forwarding Refs in React (`forwardRef` and React 19 Ref Props)

## 1. Why This Exists — The Problem First

You are building a reusable design system component for your team. You create a polished `<TextInput />` component that wraps a native HTML `<input>` with label styling, error messaging, floating icons, and accessibility badges. It works flawlessly when consumer components pass standard props like `value`, `onChange`, and `placeholder`.

Then a feature team consumes your component inside a checkout form. When a customer submits an invalid credit card number, the checkout form needs to focus the invalid input immediately:

```tsx
const inputRef = useRef<HTMLInputElement>(null);
return <TextInput ref={inputRef} label="Card Number" />;
```

The consumer clicks submit and calls `inputRef.current?.focus()`, but nothing happens. `inputRef.current` remains `null`. In React 18, React prints a warning to the console: *"Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?"*

The developer tries to fix this inside `<TextInput />` by destructuring `ref` like a regular prop:

```tsx
function TextInput({ ref, label, ...props }) {
  return <input ref={ref} {...props} />;
}
```

Now `ref` evaluates to `undefined`.

This happens because React treats `ref` (along with `key`) as a reserved attribute, not a standard prop. When the JSX compiler transforms `<TextInput ref={inputRef} />`, React extracts `ref` out of the props object entirely during element creation. Function components are opaque boundaries by default; outsiders cannot reach into a component's private JSX tree and attach pointers to internal DOM elements. 

To bridge this gap without breaking component encapsulation, React introduced `React.forwardRef` to explicitly tunnel refs to inner elements. In React 19, React re-engineered this behavior so function components can finally accept `ref` directly as a first-class prop.

## 2. The Analogy — Make It Obvious

Imagine a corporate office building with a strict security desk at the lobby entrance.

The outer parent component is a courier. The native `<input>` DOM node inside your component is an employee sitting at Desk 42 on the 5th floor. The `ref` object is a physical tracking tag the courier wants to stick directly onto that specific desk.

In standard React without ref forwarding, the building is an opaque black box. When the courier arrives at the lobby and says *"I want to stick this tracking tag directly on Desk 42,"* the front desk receptionist (React's component boundary) refuses. The courier can drop off standard letters (props like `label="Card Number"`), but outsiders are not allowed to wander private hallways and attach hardware to internal desks.

`React.forwardRef` is an official diplomatic pass displayed at the lobby desk. It tells the receptionist: *"This building explicitly allows couriers to hand over an external tracking tag, and the receptionist is programmed to carry it directly up to Desk 42."*

If the component also uses `useImperativeHandle`, the receptionist does something even safer. Instead of letting the courier stick a tracker directly onto Desk 42 (giving them raw access to change the desk's physical layout or rummage through its drawers), the receptionist hands the courier a dedicated one-button intercom that only triggers a buzzer on Desk 42 saying *"Please focus!"*

In React 19, the building's mail room was upgraded: the lobby receptionist can now accept tracking tags as standard mail packages without needing the special diplomatic pass protocol (`React.forwardRef`) at all.

## 3. How It Actually Works — The Full Explanation

Understanding how refs pass through components requires looking at three distinct layers: how JSX creates elements, how React reconciles fiber nodes, and how React 19 modernized the pipeline.

**Why `ref` is extracted before reaching `props`**

When you write `<TextInput ref={myRef} label="Name" />`, your build tool (Babel, SWC, or TypeScript) transforms that JSX into a function call:

In legacy JSX transforms:
```js
React.createElement(TextInput, { ref: myRef, label: "Name" });
```

In modern JSX transforms:
```js
_jsx(TextInput, { label: "Name" }, null, false, { ref: myRef });
```

Inside React's element factory (`createElement` or `jsxRuntime`), React inspects the passed attributes. It explicitly removes `key` and `ref` from the `props` dictionary and assigns them directly to the top-level React element object:

```js
const element = {
  $$typeof: Symbol.for('react.element'),
  type: TextInput,
  key: null,
  ref: myRef, // stored separately on the element descriptor
  props: { label: "Name" }, // ref is NOT in here
};
```

When React's reconciler executes a standard function component during the render phase, it calls `TextInput(element.props)`. Because `ref` was stripped during element creation, `props.ref` is `undefined`.

**How `React.forwardRef` penetrates the boundary (React 16.3 to 18)**

`React.forwardRef` is a higher-order wrapper function. When you wrap a component with it:

```tsx
const TextInput = React.forwardRef((props, ref) => {
  return <input ref={ref} {...props} />;
});
```

React creates an object with a distinct internal symbol: `element.$$typeof = Symbol.for('react.forward_ref')`.

When React's Fiber reconciler processes this fiber during the render phase (`updateForwardRef` in React's fiber work loop), it checks the component type. Recognizing the forward-ref symbol, the engine retrieves `element.ref` from the element descriptor and passes it as a distinct second argument into your render function: `Component(element.props, element.ref)`.

During the commit phase—after the browser DOM nodes have been created and attached to the document—React sets `myRef.current = htmlInputElement`. If the component unmounts, React resets `myRef.current = null`.

**Controlled ref exposure with `useImperativeHandle`**

Passing a raw DOM node directly to a parent breaks the Law of Demeter. A parent holding an `HTMLInputElement` can mutate `style.display`, manipulate `classList`, read uncommitted attributes, or even call `.remove()` to delete the element from under React's feet.

`useImperativeHandle` lets the child component intercept the incoming ref and supply a custom, restricted object instead of the raw DOM node:

```tsx
useImperativeHandle(ref, () => ({
  focus: () => innerInputRef.current?.focus(),
  select: () => innerInputRef.current?.select(),
}));
```

During the commit phase, React executes the factory function passed to `useImperativeHandle` and assigns its returned object to `ref.current`. The parent receives a tailored, secure API surface with only `focus()` and `select()`, keeping the internal DOM structure completely private.

**The React 19 simplification**

React 19 eliminated the architectural distinction that required `forwardRef`. In React 19, function components can accept `ref` directly as a regular prop:

```tsx
function TextInput({ ref, label, ...props }: TextInputProps) {
  return <input ref={ref} {...props} />;
}
```

The JSX runtime in React 19 leaves `ref` inside the `props` object for function components unless the component was explicitly wrapped in legacy `forwardRef`. While `React.forwardRef` is deprecated in React 19 and will eventually be removed, understanding both approaches is critical because existing design systems, npm libraries, and React 18 codebases rely heavily on `forwardRef`.

**TypeScript typing mechanics**

When using `React.forwardRef` in TypeScript, the generic parameter order is counterintuitive:

```tsx
React.forwardRef<RefTargetType, ComponentPropsType>((props, ref) => ...)
```

The DOM node or handle type comes **first**, and the props type comes **second**. 

To build resilient component types, inherit native HTML attributes using `React.ComponentPropsWithoutRef<'input'>` so consumers get full autocomplete for `type`, `placeholder`, and `aria-*` attributes without type collisions on `ref`.

## 4. Real Code — See It Working

Here is how to implement forwarded refs across common production patterns: a design system input with standard `forwardRef`, the modern React 19 syntax, and a controlled modal dialog using `useImperativeHandle`.

**Pattern 1: Production Design System Input with `React.forwardRef` (React 18 & Transitional)**

```tsx
import React, { forwardRef, useId } from 'react';

// Props inherit all native <input> attributes except the ref itself
interface TextInputProps extends React.ComponentPropsWithoutRef<'input'> {
  label: string;
  error?: string;
  helperText?: string;
}

// Generic order: <DOM Element Type, Props Type>
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, error, helperText, id, className = '', ...restProps }, ref) => {
    // Generate accessible fallback IDs for label and error linking
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className="flex flex-col gap-1.5 text-sm">
        <label htmlFor={inputId} className="font-medium text-slate-700">
          {label}
        </label>

        <input
          ref={ref} // Forwarded ref attaches directly to host DOM node
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`px-3 py-2 border rounded-md outline-none transition-colors ${
            error ? 'border-red-500 focus:ring-2 focus:ring-red-200' : 'border-slate-300 focus:border-blue-500'
          } ${className}`}
          {...restProps}
        />

        {error ? (
          <p id={errorId} className="text-xs text-red-600 font-medium">
            {error}
          </p>
        ) : helperText ? (
          <p className="text-xs text-slate-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

// Explicit displayName ensures clear component names in DevTools and stack traces
TextInput.displayName = 'TextInput';
```

**Pattern 2: Modern React 19 Direct `ref` as a Prop**

```tsx
import React, { useId } from 'react';

// In React 19, ref is part of standard ComponentPropsWithRef or explicit props
interface ModernInputProps extends React.ComponentPropsWithRef<'input'> {
  label: string;
  error?: string;
}

export function ModernTextInput({ label, error, ref, id, ...restProps }: ModernInputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={inputId} className="font-semibold text-slate-800">
        {label}
      </label>
      {/* ref is received as a standard prop without forwardRef wrapper */}
      <input
        ref={ref}
        id={inputId}
        className="border border-slate-300 rounded px-3 py-2"
        {...restProps}
      />
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
```

**Pattern 3: Controlled Handle Exposure with `useImperativeHandle`**

```tsx
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';

// Define the exact public interface the parent is allowed to invoke
export interface ConfirmModalHandle {
  openModal: (title: string, message: string) => Promise<boolean>;
  closeModal: () => void;
}

interface ConfirmModalProps {
  onConfirm?: () => void;
}

export const ConfirmModal = forwardRef<ConfirmModalHandle, ConfirmModalProps>(
  ({ onConfirm }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const [content, setContent] = useState({ title: '', message: '' });
    
    // Store resolver for promise-based imperative confirmation
    const resolverRef = useRef<((value: boolean) => void) | null>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);

    // Expose only open and close methods; hide internal state and DOM nodes
    useImperativeHandle(ref, () => ({
      openModal: (title: string, message: string) => {
        setContent({ title, message });
        setIsOpen(true);
        
        // Auto-focus cancel button for keyboard accessibility on next tick
        setTimeout(() => cancelButtonRef.current?.focus(), 0);

        return new Promise<boolean>((resolve) => {
          resolverRef.current = resolve;
        });
      },
      closeModal: () => {
        setIsOpen(false);
        if (resolverRef.current) {
          resolverRef.current(false);
          resolverRef.current = null;
        }
      },
    }), []);

    if (!isOpen) return null;

    const handleConfirm = () => {
      setIsOpen(false);
      resolverRef.current?.(true);
      resolverRef.current = null;
      onConfirm?.();
    };

    const handleCancel = () => {
      setIsOpen(false);
      resolverRef.current?.(false);
      resolverRef.current = null;
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
          <h2 className="text-lg font-bold text-slate-900">{content.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{content.message}</p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              ref={cancelButtonRef}
              onClick={handleCancel}
              className="px-4 py-2 border rounded text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }
);

ConfirmModal.displayName = 'ConfirmModal';
```

**Pattern 4: Parent Form Consuming Forwarded Ref and Imperative Modal**

```tsx
import React, { useRef } from 'react';
import { TextInput } from './TextInput';
import { ConfirmModal, ConfirmModalHandle } from './ConfirmModal';

export function UserProfileEditor() {
  const emailInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<ConfirmModalHandle>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = false; // Simulate validation check failure

    if (!isValid) {
      // Focus the forwarded input DOM element imperatively on error
      emailInputRef.current?.focus();
      emailInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleDeleteAccount = async () => {
    // Invoke the custom imperative handle method
    const confirmed = await modalRef.current?.openModal(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.'
    );

    if (confirmed) {
      console.log('Account deleted permanently');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto p-6 space-y-4">
      <TextInput
        ref={emailInputRef}
        label="Email Address"
        placeholder="alex@example.com"
        error="Please enter a valid work email address"
      />

      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded font-medium"
        >
          Save Changes
        </button>
        <button
          type="button"
          onClick={handleDeleteAccount}
          className="px-4 py-2 border border-red-300 text-red-600 rounded font-medium"
        >
          Delete Account
        </button>
      </div>

      <ConfirmModal ref={modalRef} />
    </form>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why is `ref` not passed as a regular prop in React function components (React 16–18)?**

In React, `key` and `ref` are reserved attributes with special runtime lifecycles. When JSX is compiled into `createElement(Component, config)` or executed via the modern JSX runtime, React strips `key` and `ref` off the config object and attaches them directly to the React element descriptor as top-level metadata (`element.ref` and `element.key`). When React renders a functional component, it calls `Component(element.props)`. Because `ref` was extracted into `element.ref`, it is never placed inside `props`. React did this deliberately to enforce component encapsulation: components are meant to be black boxes configured declaratively through props, so accessing inner DOM nodes requires an explicit opt-in mechanism like `React.forwardRef`.

**Q: What is `React.forwardRef` and what changed in React 19?**

`React.forwardRef` is a higher-order function that wraps a component to allow it to receive a `ref` from its parent and forward it to an inner DOM node or component. Internally, `forwardRef` tags the component with the `Symbol.for('react.forward_ref')` type. During the render phase, React's Fiber reconciler recognizes this tag and passes the ref as the second parameter: `(props, ref) => JSX`. 

In React 19, the React team refactored element creation and fiber reconciliation so that `ref` is treated as a first-class prop on standard function components. You can simply declare `function MyInput({ ref, ...props })` without wrapping the component in `forwardRef`. `React.forwardRef` is deprecated in React 19 and will eventually be removed in future versions.

**Q: How do you type `forwardRef` in TypeScript, and why is its generic signature counterintuitive?**

In TypeScript, `React.forwardRef` takes two generic type arguments:

```tsx
React.forwardRef<RefType, PropsType>((props, ref) => ...)
```

The generic order is counterintuitive because the target DOM element or handle type comes **first**, while the component's props type comes **second**—the exact opposite of how normal component function signatures are written (`(props: Props) => JSX`). If you write `React.forwardRef<PropsType, RefType>`, TypeScript will misinterpret your props as the ref type, producing confusing compilation errors. The recommended pattern is to type props using `React.ComponentPropsWithoutRef<'element'>` to prevent prop type conflicts with `ref`.

**Q: How does `useImperativeHandle` work and why is it preferred over exposing raw DOM nodes in design systems?**

`useImperativeHandle` is a hook used inside a forwarded component to customize the instance value that gets assigned to `ref.current`. Instead of passing a raw DOM element (like an `HTMLInputElement` or `HTMLDivElement`) to the parent, `useImperativeHandle(ref, () => ({ ... }))` returns a curated object containing specific methods (e.g. `focus()`, `reset()`, `scrollIntoView()`). 

This is preferred in robust design systems because exposing raw DOM nodes breaks component encapsulation. A parent with direct DOM access can read private dimensions, mutate styles, manipulate CSS classes, or delete child nodes, bypassing React's declarative state management. `useImperativeHandle` preserves the component's abstraction barrier by exposing only an explicit, narrow public contract.

**Q: What happens if you pass a `ref` to a standard function component in React 18 vs React 19?**

In React 18: React ignores the ref on regular function components. `props.ref` evaluates to `undefined`, the parent's `ref.current` remains `null`, and React logs a warning in development mode telling you that function components cannot be given refs and suggesting `React.forwardRef`.

In React 19: The function component receives `ref` directly inside its `props` argument (`function Component(props)` or `function Component({ ref, ...props })`). The ref functions identically to any other prop, and React attaches the underlying DOM node without warnings or wrapper functions.

**Q: Can you forward a ref through multiple layers of nested components (Ref Chaining)?**

Yes. If a parent places a ref on a high-level composite component (like `<FormField />`), and that component wraps an `<InputGroup />`, which wraps a `<TextInput />`, which renders a native `<input />`, every intermediate layer must forward the ref down to the next child. In React 18, every layer in the chain must be wrapped in `React.forwardRef` and pass the received `ref` parameter down: `<InputGroup ref={ref} />`. In React 19, each layer simply passes `ref={ref}` as a standard prop down the tree until it reaches the host DOM element.

**Q: When should you NOT forward a ref in component design?**

Refs should not be forwarded when:
1. **The component is a composite container with no single canonical DOM node:** For example, a complex `<PricingTable />` or `<DashboardGrid />` has dozens of internal elements; exposing the outer `<div>` provides no semantic value to the parent.
2. **The use case can be solved declaratively with props:** If a parent wants to change a component's appearance, open state, or active tab, passing props like `isOpen={true}` or `activeTab="settings"` is much cleaner, testable, and idiomatic than calling imperative methods via refs.
3. **The internal DOM hierarchy is volatile:** If you expose an internal DOM element as part of your component's contract, any internal DOM refactor (such as wrapping an input in a new container `<div>`) can silently break consuming parents that relied on specific DOM properties.

## 6. The Traps — What Goes Wrong

**Trap 1: Destructuring `ref` from `props` in React 18 or transitional codebases**

*The Mistake:* Developers accustomed to regular props write:
```tsx
function SearchInput({ ref, placeholder }: { ref: React.Ref<HTMLInputElement>; placeholder: string }) {
  return <input ref={ref} placeholder={placeholder} />;
}
```
*Why it fails:* In React 18, `ref` is extracted before `props` is populated. `props.ref` is always `undefined`. The component renders, but the parent's ref never attaches to the DOM node, silently leaving `ref.current` as `null`.
*The Fix:* Wrap the component in `React.forwardRef<HTMLInputElement, SearchInputProps>((props, ref) => ...)` or upgrade the project to React 19.

**Trap 2: Inverting the TypeScript generic parameter order**

*The Mistake:* Writing the props interface first:
```tsx
// WRONG: Inverted generic arguments
const CustomInput = forwardRef<CustomInputProps, HTMLInputElement>((props, ref) => { ... });
```
*Why it fails:* TypeScript assigns `CustomInputProps` as the ref's element type and `HTMLInputElement` as the props type. TypeScript will then complain that `props` does not contain your component's props, or fail to type-check `ref.current` methods like `.focus()`.
*The Fix:* Memorize the order: `<ElementOrHandleType, PropsType>`.

**Trap 3: Anonymous functions losing component names in DevTools**

*The Mistake:* Passing an inline arrow function directly to `forwardRef`:
```tsx
export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => (
  <button ref={ref} {...props} />
));
```
*Why it fails:* Arrow functions passed to higher-order functions do not infer variable names in all build pipelines. In React DevTools and error stack traces, the component displays as `Anonymous` or `ForwardRef`, making component inspection and error tracing difficult.
*The Fix:* Explicitly assign `Button.displayName = 'Button';` or use a named function expression inside `forwardRef(function Button(props, ref) { ... })`.

**Trap 4: Accessing or mutating `ref.current` during the render phase**

*The Mistake:* Reading or modifying the ref value directly in the component body:
```tsx
const TextInput = forwardRef<HTMLInputElement, Props>((props, ref) => {
  // WRONG: Reading ref during render execution
  if (ref && 'current' in ref && ref.current) {
    console.log(ref.current.offsetWidth);
  }
  return <input ref={ref} {...props} />;
});
```
*Why it fails:* The render phase runs before DOM nodes are created, reconciled, or committed. During render, `ref.current` is either `null` or holds stale DOM references from a previous render. Furthermore, reading or mutating refs during render violates React's purity contract and breaks concurrent rendering.
*The Fix:* Access `ref.current` exclusively inside event handlers (like `onClick`) or inside `useEffect` / `useLayoutEffect`, which execute after the commit phase has completed.

**Trap 5: Leaking full DOM nodes instead of a restricted imperative handle**

*The Mistake:* Exposing the raw outer container DOM node on complex widgets:
```tsx
export const DatePicker = forwardRef<HTMLDivElement, DatePickerProps>((props, ref) => {
  return <div ref={ref}><input /><CalendarPopup /></div>;
});
```
*Why it fails:* If the parent needed to focus the date input, calling `ref.current.focus()` on the outer `<div>` fails unless the `div` has a `tabIndex`. If the parent tries to query `ref.current.querySelector('input')`, it tightly couples the parent to the internal DOM structure of the `DatePicker`.
*The Fix:* Use `useImperativeHandle` to expose a deliberate `{ focusDateInput, clearDate }` API.

**Trap 6: Conditional ref forwarding causing null references and layout thrashing**

*The Mistake:* Attaching the forwarded ref to different elements based on state:
```tsx
const DynamicControl = forwardRef<HTMLElement, Props>(({ isEditing, ...props }, ref) => {
  return isEditing 
    ? <input ref={ref as React.Ref<HTMLInputElement>} {...props} />
    : <span ref={ref as React.Ref<HTMLSpanElement>}>{props.value}</span>;
});
```
*Why it fails:* When `isEditing` toggles, React unmounts the old element (setting `ref.current = null`) and mounts the new element (setting `ref.current = newElement`). If a parent has event listeners or observers attached to `ref.current`, they detach or point to obsolete DOM nodes, causing memory leaks and null reference bugs.
*The Fix:* Keep ref targets stable, or attach the ref to a consistent wrapper element.

## 7. Compare With Related Concepts

**`useRef` vs `forwardRef`**
- *The Comparison:* `useRef` is a hook used inside a single component to create a persistent mutable container that holds a DOM element or value across renders without triggering re-renders. `forwardRef` is a higher-order component wrapper used to pass a ref from a parent component down into a child component.
- *The Rule:* Use `useRef` to **create and own** a ref; use `forwardRef` (in React 18) to **receive and pass through** a ref created by a parent.

**`forwardRef` vs `useImperativeHandle`**
- *The Comparison:* `forwardRef` opens the communication channel so an incoming ref can penetrate a component boundary; `useImperativeHandle` customizes what value actually travels through that channel.
- *The Rule:* Use `forwardRef` to **accept** a ref from a parent; pair it with `useImperativeHandle` when you want to **restrict or transform** the methods exposed on `ref.current`.

**`ref` Prop vs Custom Prop (e.g. `inputRef` or `innerRef`)**
- *The Comparison:* The standard `ref` prop integrates natively with React's reconciliation engine, automatic cleanup lifecycles, and component libraries. Custom props (like `inputRef={myRef}`) are plain JavaScript props that bypass React's ref extraction, behaving as ordinary object references.
- *The Rule:* Always use the standard `ref` prop for public design system components and standard DOM targets; use custom prop names only as a legacy workaround when a single component must accept multiple distinct refs for separate internal elements (e.g. `startIconRef` and `inputRef`).

**React 18 `forwardRef` vs React 19 First-Class `ref` Prop**
- *The Comparison:* In React 18, function components cannot receive `ref` in `props`, requiring the `React.forwardRef((props, ref) => JSX)` wrapper. In React 19, the JSX compiler and reconciler pass `ref` directly inside the first `props` argument without any wrapper.
- *The Rule:* Use `React.forwardRef` when authoring npm libraries or maintaining React <= 18 codebases; use direct `ref` prop destructuring for greenfield React 19+ applications.

## 8. 🧠 The Memory Hook

By default, a React component is a private office with locked doors—outsiders cannot touch the furniture inside. `forwardRef` is the explicit mail slot that lets a parent slide an imperative tracking tag directly onto an internal desk, while `useImperativeHandle` decides whether the parent gets a physical key to the desk or just an intercom button.
