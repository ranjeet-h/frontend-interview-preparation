# Uncontrolled Components in React

## 1. Why This Exists — The Problem First

Imagine you build a checkout page with a 40-field shipping, billing, and tax form. You wire up 40 `useState` hooks, 40 `onChange` handlers, and 40 `value` props to keep React as the single source of truth. Every single time the user presses a single key in the "Zip Code" input, React triggers a full component re-render, runs reconciliation across hundreds of virtual DOM nodes, and writes the identical value back to the DOM input. On low-end mobile devices, fast typing drops below 60 frames per second, keystrokes stutter, and the browser feels sluggish.

Worse, you encounter an unavoidable brick wall when adding a document upload field: `<input type="file" />`. Browsers intentionally forbid JavaScript from programmatically setting the `value` property of a file input for security reasons, preventing malicious scripts from silently stealing files off a user's hard drive. The moment you attempt to control a file input with React state (`<input type="file" value={myFileState} />`), the browser throws a security error or React crashes.

Then you need to integrate a legacy D3 chart or a third-party rich-text editor that expects to own its internal DOM tree. Forcing React to continuously serialize, diff, and re-render that external DOM tree causes layout thrashing, lost cursor positions, and broken animations.

Uncontrolled components exist to solve these exact problems. They allow the browser's native DOM to remain the live source of truth for form data, letting users type and interact at native 120Hz speeds without triggering React render cycles. React simply seeds the initial value on mount and reads the final data when needed.

## 2. The Analogy — Make It Obvious

Think of a **diner order pad vs. an overbearing manager standing at your shoulder**.

In a **controlled component** system, the restaurant manager (React) stands over the customer (the user). Every time the customer writes a single letter of their order on a notepad, the manager stops them, copies that letter into their own master ledger (React state), erases the customer's notepad, and meticulously rewrites that single letter back onto the customer's pad (re-render commit). If the customer writes fast, the manager gets exhausted and holds up the entire restaurant.

In an **uncontrolled component** system, the server simply hands the customer a blank order slip with their table number pre-printed on it (`defaultValue`). The customer writes whatever they want, as fast as they want, directly in pen (native DOM state). The manager walks away to handle other tables. When the customer finishes eating and clicks "Order", the server walks over, picks up the physical slip (`useRef` or `FormData`), and hands the complete order to the kitchen.

Here is how the pieces map together:
- **The physical paper slip** is the native browser DOM element (`HTMLInputElement`).
- **The pre-printed table number** is `defaultValue` or `defaultChecked` (initial data seeded once on mount).
- **The customer writing freely** is the user typing in the browser (native DOM events handled entirely by the browser engine with zero React overhead).
- **The server picking up the slip on submit** is extracting values on demand via `useRef` or native `new FormData(formElement)`.

## 3. How It Actually Works — The Full Explanation

In an uncontrolled component, React delegates state ownership to the browser's internal C++ DOM representation.

When React mounts an uncontrolled element like `<input defaultValue="alex@example.com" />`, the reconciliation engine creates the native DOM element via `document.createElement('input')` and sets the element's DOM property `node.defaultValue = "alex@example.com"`. During this initial commit phase, the browser populates the visual input.

Once mounted, React's render loop steps back completely. When a user presses a key inside the input:
1. The browser handles the low-level keyboard event natively.
2. The browser updates the input's internal `value` buffer in memory.
3. The browser paints the new character directly to the screen within the current frame.
4. No React `setState` is called, no Fiber work is scheduled, no virtual DOM diffing occurs, and no parent or sibling components re-render.

To access the data entered by the user, you have two primary mechanisms:

**1. Imperative Access via `useRef`**
A React ref provides a persistent object (`{ current: null }`) that holds a direct reference to the underlying DOM node. When you attach `ref={inputRef}` to an input, React assigns the live `HTMLInputElement` instance to `inputRef.current` during the commit phase. When an event occurs—such as a button click or a custom validation trigger—your handler reads `inputRef.current.value` or `inputRef.current.files` directly from the DOM on demand.

**2. Declarative Batch Extraction via `FormData`**
Instead of attaching individual refs to dozens of fields, you can assign standard HTML `name` attributes to your inputs and read the entire form in a single batch on submission using the standard Web API `new FormData(event.currentTarget)`. The browser crawls the form's native DOM tree, extracts all named fields (text, checkboxes, radios, multi-selects, and binary file blobs), and packages them into an iterable key-value structure.

**React 19 Actions and Uncontrolled Forms**
React 19 elevates uncontrolled components to first-class architecture through Form Actions. When you pass an async function to `<form action={async (formData) => { ... }}>`:
- The form remains completely uncontrolled—no state, no refs, and no `onChange` handlers are needed.
- On submission, React automatically constructs a `FormData` object from the native DOM elements and passes it directly to your action function.
- It supports progressive enhancement: if JavaScript fails or hasn't loaded yet, standard HTML form submission still posts data to the server.
- Hooks like `useActionState` and `useFormStatus` read pending status and server responses without forcing inputs to become controlled.

**Native Constraint Validation**
Because uncontrolled inputs live in the native DOM, they integrate seamlessly with the browser's built-in HTML5 Constraint Validation API. Attributes like `required`, `pattern`, `minlength`, `type="email"`, and `type="number"` are validated by the browser before form submission triggers. You can inspect `inputRef.current.validity.valid`, call `inputRef.current.checkValidity()`, or set custom error tooltips using `inputRef.current.setCustomValidity("Invalid promo code")` without introducing third-party validation libraries.

## 4. Real Code — See It Working

**Example 1: Full Uncontrolled Form with Native `FormData` and React 19 Actions**
This pattern handles dozens of inputs, checkboxes, and file uploads with zero state overhead.

```tsx
import React from 'react';

export function RegistrationForm() {
  async function handleRegister(formData: FormData) {
    // Read individual fields directly by their HTML 'name' attribute
    const username = formData.get('username') as string;
    const role = formData.get('role') as string;
    const agreeToTerms = formData.get('terms') === 'on';
    const avatarFile = formData.get('avatar') as File;

    // Convert all standard text entries into a plain JavaScript object
    const payload = {
      username,
      role,
      agreeToTerms,
      avatarFileName: avatarFile?.name || null,
    };

    console.log('Submitting uncontrolled payload:', payload);
    // await api.registerUser(payload);
  }

  return (
    <form action={handleRegister} className="form-container">
      {/* defaultValue sets the initial DOM value on mount; React never touches it again */}
      <label>
        Username:
        <input
          name="username"
          type="text"
          defaultValue="johndoe"
          required
          minLength={3}
        />
      </label>

      <label>
        Role:
        <select name="role" defaultValue="developer">
          <option value="designer">Designer</option>
          <option value="developer">Developer</option>
          <option value="manager">Product Manager</option>
        </select>
      </label>

      {/* File inputs MUST be uncontrolled due to browser security constraints */}
      <label>
        Profile Picture:
        <input name="avatar" type="file" accept="image/*" />
      </label>

      {/* defaultChecked controls the initial boolean state of checkboxes/radios */}
      <label>
        <input name="terms" type="checkbox" defaultChecked={true} required />
        I agree to the terms of service
      </label>

      <button type="submit">Complete Registration</button>
    </form>
  );
}
```

**Example 2: Imperative DOM Access with `useRef` and File Reset**
When you need programmatic focus management, direct measurements, or custom file reset logic, `useRef` gives you direct access to the DOM node.

```tsx
import React, { useRef } from 'react';

export function FileUploaderWithReset() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  function handleUpload() {
    // Access the live FileList directly from the DOM node
    const selectedFiles = fileInputRef.current?.files;
    if (!selectedFiles || selectedFiles.length === 0) {
      alert('Please select a file first.');
      textInputRef.current?.focus(); // Programmatic DOM focus
      return;
    }

    const file = selectedFiles[0];
    console.log(`Uploading ${file.name}, size: ${file.size} bytes`);

    // To programmatically clear an uncontrolled file input, reset the DOM property directly
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div>
      <input
        ref={textInputRef}
        type="text"
        placeholder="File description"
        defaultValue=""
      />

      <input ref={fileInputRef} type="file" />

      <button type="button" onClick={handleUpload}>
        Upload & Reset
      </button>
    </div>
  );
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the fundamental difference between controlled and uncontrolled components in React?**

The difference comes down to who holds the single source of truth for the input's current value.

In a controlled component, React state (`useState` or `useReducer`) is the single source of truth. The element receives its live value via the `value` prop and notifies React of user input via the `onChange` callback. On every keystroke, React updates state, triggers a re-render, runs virtual DOM reconciliation, and writes the state value back into the DOM. This gives you instant access to the input value for live validation, dynamic field masking, and UI toggling, but incurs the performance cost of continuous re-rendering.

In an uncontrolled component, the native browser DOM is the single source of truth. React seeds the initial value once on mount using `defaultValue` or `defaultChecked` and does not track subsequent changes. The browser handles typing natively without triggering React renders. Values are read on demand (e.g., during form submission) via `useRef` or `FormData`. Uncontrolled components offer superior raw performance for large forms and simpler code when you only care about the final value.

**Q: Why does React provide `defaultValue` and `defaultChecked` instead of using `value` and `checked`?**

In standard HTML, the `value` attribute defines both the initial value in the markup and the current value property on the DOM node. However, in React, passing the `value` prop signals to React's reconciliation engine that this is a controlled component. If React sees `value="hello"`, it will enforce that the DOM node's value property remains `"hello"` on every render. If a user tries to type into an input with a fixed `value` and no `onChange` handler, React immediately overwrites the user's keystroke on the next cycle, making the input appear frozen.

To allow an input to be uncontrolled while still supplying an initial value from props or server data, React introduced `defaultValue` (for text, numbers, and selects) and `defaultChecked` (for checkboxes and radio buttons). React reads `defaultValue` only once during the initial mount phase to populate the DOM element's initial state. On subsequent re-renders, React completely ignores `defaultValue`, allowing the user to type freely without React overwriting the DOM.

**Q: Why can an `<input type="file" />` never be a controlled component in React?**

Browser security models strictly forbid JavaScript from programmatically assigning values to `<input type="file">`. If web applications could set `fileInput.value = "/path/to/private/ssh/key"`, a malicious website could invisibly upload sensitive files from a user's machine without their explicit consent.

Because a controlled component requires React to continuously write state back to the DOM element's `value` property on every render, and the browser throws a security violation if JavaScript attempts to set a file input's `value` to anything other than an empty string `""`, file inputs are inherently read-only from JavaScript's perspective. Therefore, file inputs in React must always be uncontrolled. You read the selected files imperatively through the DOM node's `files` property (`FileList`) via a `ref` or `FormData`.

**Q: How does React Hook Form achieve near-zero re-renders while handling complex validation?**

Traditional form libraries (like Formik) make every input controlled, storing form state in a root React component. As a result, typing in one field re-renders the entire form tree.

React Hook Form fundamentally uses uncontrolled components under the hood. When you call `register('email')`, it returns a ref callback that attaches directly to the native input element alongside native DOM event listeners (`blur`, `input`). The input values live entirely in the DOM. When the user types, React Hook Form does not call `setState` for the form values, so no component re-renders occur. It uses an internal subscription model (via `useSubscribeToStateChange` and native DOM listeners) to selectively trigger re-renders only on isolated error message components when validation fails, keeping keystroke latency at native browser speeds.

**Q: How can you force an uncontrolled component to reset or synchronize with new props from a parent?**

Because React ignores changes to `defaultValue` after the component has mounted, passing a new `defaultValue` from a parent re-render will not update what the user sees on screen.

To reset or re-initialize an uncontrolled input when incoming data changes (for example, when switching between editing User A and User B):
1. **The React Key Pattern (Recommended):** Pass a unique `key` prop tied to the data identity (e.g., `<UserForm key={user.id} defaultValues={user} />`). When the `key` changes, React completely tears down the old DOM sub-tree and mounts a fresh one, cleanly re-evaluating all `defaultValue` attributes.
2. **Imperative DOM Reset:** For a form, call the native DOM reset method on the form element: `formRef.current.reset()`. For an individual input, imperatively assign `inputRef.current.value = newInitialValue`.

**Q: How do React 19 Form Actions change the best-practice balance between controlled and uncontrolled forms?**

Prior to React 19, building forms in React often nudged developers toward controlled components because handling validation, loading spinners, and submission state required manual `useState` wiring.

React 19 shifts the standard recommendation heavily toward uncontrolled forms by introducing native Form Actions (`<form action={async (formData) => ...}>`) and hooks like `useActionState` and `useFormStatus`. Form Actions receive standard Web API `FormData` instances directly from the DOM, eliminating the need to wire up `useState` or `useRef` for standard data collection. This enables progressive enhancement, cleans up boilerplate, improves rendering performance, and integrates directly with React Server Components. Controlled components are now reserved specifically for dynamic UI requirements (such as autocompletes, instant character counters, or real-time dependent dropdowns).

## 6. The Traps — What Goes Wrong

**1. Expecting `defaultValue` to Update When Parent Props Change**
A common bug occurs when a parent component fetches data asynchronously and passes it down as `defaultValue`. When user data arrives from an API, `defaultValue` updates in the React props, but the input in the DOM has already mounted with its initial value and will not update.
- **The Wrong Assumption:** Assuming React watches `defaultValue` and re-renders the input value when the prop changes.
- **What Actually Happens:** React only assigns `defaultValue` during the initial mount commit. Subsequent changes to `defaultValue` are completely ignored during reconciliation.
- **The Fix:** If the input must reset when data changes, pass a dynamic `key` prop (e.g. `<input key={user.id} defaultValue={user.bio} />`) to force React to unmount the old DOM element and mount a fresh one. If real-time bidirectional synchronization is required, switch to a controlled component using `value` and `onChange`.

**2. Forgetting the `name` Attribute with `FormData`**
When reading form values via `new FormData(formElement)` or React 19 Form Actions, `FormData` silently skips any input that lacks a native HTML `name` attribute.
- **The Wrong Assumption:** Expecting `FormData` to extract inputs based on their React component names or IDs.
- **What Actually Happens:** The Web API `FormData` standard strictly looks for the HTML `name` attribute. Elements without `name="fieldName"` are completely omitted, leading to unexpected `null` or `undefined` payload values.
- **The Fix:** Always supply explicit `name` attributes to all form controls (`<input name="email" ... />`).

**3. Reading `ref.current` During the Render Phase**
React refs are mutated during the commit phase, after DOM nodes have been created or updated. Accessing `ref.current` during the render phase is an unsafe side effect.
- **The Wrong Assumption:** Reading `inputRef.current.value` directly in the component body during render.
- **What Actually Happens:** On the initial render, `ref.current` is `null`, which causes runtime crashes (`TypeError: Cannot read properties of null`). In concurrent rendering mode, render-phase ref reads can observe inconsistent, tearing, or stale values.
- **The Fix:** Read refs exclusively inside event handlers (e.g., `onSubmit`, `onClick`) or inside `useEffect` / `useLayoutEffect`.

**4. Accidentally Switching Between Uncontrolled and Controlled**
If you pass `value={state}` where `state` is initially `undefined`, React initializes the input as uncontrolled. If `state` later becomes a string after an API call resolves, React sees `value` defined and attempts to convert it to controlled, logging a console warning: *"A component is changing an uncontrolled input to be controlled."*
- **The Wrong Assumption:** Assuming `undefined` is equivalent to `""` for controlled inputs.
- **What Actually Happens:** React treats `value={undefined}` as an uncontrolled input with no initial value. When state resolves to a defined string, React treats the sudden arrival of `value` as an illegal mid-lifecycle architecture switch.
- **The Fix:** Always initialize controlled state with an empty string or provide a fallback (`value={state ?? ''}`).

## 7. Compare With Related Concepts

**Uncontrolled Components vs. Controlled Components**
- **Source of Truth:** In uncontrolled components, the DOM holds the current value; in controlled components, React component state (`useState`) holds the value.
- **Re-render Frequency:** Uncontrolled components do not re-render on keystrokes; controlled components re-render the component tree on every keystroke.
- **Rule of Thumb:** Use uncontrolled components for simple forms, file uploads, large high-performance forms, and submit-only workflows. Use controlled components when you need real-time input masking, live character counts, conditional field validation as the user types, or instant UI changes based on input values.

**`defaultValue` / `defaultChecked` vs. `value` / `checked`**
- **Mechanism:** `defaultValue` is read once by React during initial DOM node creation on mount and ignored thereafter. `value` is actively synchronized by React on every render pass, forcing the DOM property to match React state.
- **Rule of Thumb:** Use `defaultValue` for uncontrolled inputs where the DOM manages user typing. Use `value` strictly for controlled inputs paired with an `onChange` handler.

**`useRef` vs. `useState` for Form Handling**
- **Mechanism:** `useRef` stores a mutable pointer to a DOM node without triggering a component re-render when mutated. `useState` schedules a Fiber update and re-renders the component whenever the setter is invoked.
- **Rule of Thumb:** Use `useRef` when you need imperative, on-demand reads of DOM values or direct DOM manipulations (focusing, measuring, clearing files). Use `useState` when the rendered JSX structure or surrounding UI needs to react immediately to data changes.

**Native `FormData` vs. React State Form Objects**
- **Mechanism:** `FormData` extracts values directly from named native DOM elements on demand using standard browser C++ internals. React state form objects maintain an in-memory JavaScript representation that must be updated field-by-field.
- **Rule of Thumb:** Use `FormData` for clean, zero-boilerplate form submissions (especially with React 19 Actions and multipart file uploads). Use state objects when multi-step wizards or complex validation rules require structured in-memory data before submission.

## 8. 🧠 The Memory Hook

**Controlled means React holds the steering wheel on every keystroke; uncontrolled means the DOM drives freely and React just checks the destination when you arrive.** If you only need the value when the user clicks Submit, let the DOM do the work.

