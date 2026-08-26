# Forms in React

## 1. Why This Exists — The Problem First

A form is not just a collection of inputs. It is a small state machine that must turn an incomplete, user-edited draft into an intentional request and then explain the server's answer.

Consider a checkout form. While the customer types, the page must preserve the draft. When a field loses focus, it may show a useful validation message. When the customer submits, the form must validate the whole payload, show a pending state, prevent duplicate orders, handle a network failure, and map a server rejection back to the right field. After success, it must reset or navigate without losing the server's source of truth. A screen reader must be able to discover the labels, errors, and changing status throughout the same flow.

The difficult part is ownership. Every value needs a source of truth, and every piece of feedback needs a deliberate lifecycle:

- The browser owns an uncontrolled input's live value in the DOM.
- React owns a controlled input's live value in state.
- A form library may own registration and subscriptions while exposing values and state to React.
- The server owns final validation, authorization, uniqueness checks, and business rules.

If those owners are mixed accidentally, common bugs appear: an input switches from uncontrolled to controlled, `reset()` updates React state but not the DOM, a stale async validation result overwrites a newer one, or a user creates two records by clicking twice. Production form design is the coordination of these boundaries.

## 2. The Analogy — Make It Obvious

Think of a form as a package moving through a staffed shipping counter.

The customer's clipboard is the draft. An uncontrolled input keeps that draft on the browser's clipboard; the application reads the packet at submission time. A controlled input gives the clerk a live photocopy after every keystroke; React can inspect or transform every character, but copying the whole packet repeatedly costs more.

Touched state is the clerk's note that a customer has actually visited a line. Dirty state is the comparison between the current packet and the original packet. Validation is a sequence of gates: cheap local checks first, cross-field checks next, and the authoritative server gate last. An asynchronous gate must identify which packet it checked so a late answer for an old packet cannot reject the new packet.

Submission is a one-way handoff. The counter disables the handoff while the request is in flight, shows progress, and gives the customer a result. A 422 response is not a generic crash: it is a returned packet with corrections attached to named lines. A network error is different because the server may never have received the packet. Reset means returning to a known baseline, not merely clearing whichever inputs happen to be visible.

## 3. How It Actually Works — The Full Explanation

**Ownership: controlled, uncontrolled, and library-managed**

A controlled input has a defined React value and an event that updates the same owner:

```tsx
const [email, setEmail] = useState("");

<input
  value={email}
  onChange={(event) => setEmail(event.target.value)}
/>;
```

React is the source of truth. This is useful when the UI must immediately derive something from the value, apply a mask, enable or disable another control, or coordinate several fields. The cost is a state update and a render path on every edit. Keep the state owner close to the fields, split large sections, and avoid recalculating unrelated expensive UI on each keystroke.

An uncontrolled input lets the DOM own the live value. `defaultValue` sets its initial value, while `value` would take control. On submit, read the current values through the form event:

```tsx
function SearchForm() {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = String(data.get("query") ?? "");
    console.log(query);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="query">Search</label>
      <input id="query" name="query" defaultValue="" />
      <button type="submit">Search</button>
    </form>
  );
}
```

This can reduce React work for large forms, but the value is not available as ordinary React state on every render. Use a ref or `FormData` when you need to read it. Do not mix `value` and `defaultValue`, and do not let a value be `undefined` on one render and a string on another: initialize controlled text fields to `""` and controlled booleans to `false`.

React Hook Form is a useful middle ground for many large forms. It registers fields with refs, subscribes only the UI that needs a particular value or error, and exposes validation, reset, dirty, touched, and submission state. Formik and a hand-built controlled model can also be appropriate; the important decision is the ownership and update granularity, not the brand of library. A library also has costs: its abstraction can make control flow and debugging less direct, adds bundle and runtime overhead, requires a learning curve, and can create migration or lock-in costs around its APIs and resolver conventions.

**Form state is more than values**

Treat these as separate dimensions rather than one vague `formState` boolean:

- **Values:** the current draft, normalized only where the product contract requires it.
- **Touched:** whether the user has interacted with and left a field. Show field feedback after blur or after a submit attempt, not necessarily on the initial render.
- **Dirty:** whether a field or the whole draft differs from its baseline. Compare normalized values deliberately; an empty string and a missing value may or may not be equivalent in the API.
- **Errors:** field errors with stable paths, plus form-level errors for failures that do not belong to one field.
- **Submitting:** whether the current submit request is in flight. It controls the submit affordance and status message.
- **Validating:** whether a field or form-level asynchronous check is pending.

The baseline changes after a successful save if the form remains on the page. In a library this is often `reset(savedValues)`, not just `setValue` for each field. On an edit screen, compare against the last server-confirmed values, not against the values from the first mount forever.

**Validation has layers**

Native constraints such as `required`, `type="email"`, and `minLength` provide fast browser feedback and useful semantics. The `accept` attribute is different: it primarily filters the file-picker choices; it is not authoritative file-type validation. Client validation adds product-specific rules and better messages. A schema validator such as Zod can define a typed payload, transformations, and cross-field rules in one place. Server validation remains authoritative because a client can be bypassed and because only the server knows current uniqueness, authorization, inventory, and business state.

Choose timing intentionally:

- Validate on change for short, local rules where immediate feedback helps.
- Validate on blur for less intrusive field feedback.
- Validate the entire form on submit, including untouched fields.
- Run async validation only when needed, debounce expensive checks, and associate each result with the value that started it.

Async field validation must not allow an old response to win. Use cancellation where the API supports it, or compare a request sequence/value before applying the result. An email availability check is advisory; the submit response still decides whether the email is accepted.

**Submission is an asynchronous state transition**

The submit path should be explicit:

1. Prevent the browser's default navigation when handling the request in JavaScript.
2. Mark the submit attempt and run full client validation.
3. If valid, snapshot or serialize the values and enter a pending state.
4. Disable the submit action and guard the handler while pending.
5. Send the request and handle success, field errors, form errors, and transport errors separately.
6. On success, update the baseline and reset, navigate, or show confirmation.
7. In a `finally` path, clear the pending state unless the mutation abstraction owns it.

Disabling the button improves UX but is not a complete duplicate-prevention strategy: keyboard submission or another caller can still invoke the handler. The handler itself needs an in-flight guard, and the backend should use an idempotency key or equivalent when duplicate side effects matter. A mutation library can centralize pending, retry, cancellation, and cache invalidation, but it does not remove the need for a clear form state model.

**Server errors, reset, accessibility, and files**

Map a structured 422 response such as `{ fieldErrors: { email: "Already registered" } }` to the field named `email`; preserve the other draft values. Put an error with no field path in a form-level live region. Never use a server error as a reason to silently clear the form.

Reset behavior is a product decision. A cancel action might restore the last saved baseline. A successful create might clear to empty defaults. A failed submit should usually preserve the draft. Native `form.reset()` restores the DOM's initial defaults, while a controlled form must restore its React state too; use one reset owner or a library's reset API so they do not diverge.

Every field needs a real `<label>` or an equivalent accessible name. Give an invalid control `aria-invalid="true"` and connect its message with `aria-describedby`. Use a stable `id` for each error. Announce global success, submission progress, and form-level failures with a polite or assertive live region appropriate to the urgency. Focus the first invalid field after a submit attempt, but do not steal focus on every keystroke. A grouped radio or checkbox set needs a `fieldset` and `legend`; keyboard users must be able to reach every control.

File inputs are special: their value cannot be controlled by setting a string in React. Read `input.files`, validate type and size on the client for feedback, and send the file in `FormData` (usually without manually setting the multipart boundary). Clear a file input by resetting the form, changing its `key`, or using a ref to set its value to an empty string. The server must re-check size, type, content, authorization, and storage policy.

## 4. Real Code — See It Working

This self-contained TypeScript React example uses controlled text and checkbox fields because it needs derived validation and explicit ownership. It demonstrates touched state, a form-level server error, field error mapping, reset-after-success, accessibility connections, and both a handler guard and a disabled button for duplicate-submit protection. The API function is injected so the component remains runnable with a fake implementation in a test or demo.

```tsx
import { useState } from "react";

type Values = { email: string; password: string; remember: boolean };
type FieldErrors = Partial<Record<keyof Values, string>>;
type RegisterResult =
  | { ok: true }
  | { ok: false; status: 422; fieldErrors: FieldErrors }
  | { ok: false; status: 500 };

type RegisterFormProps = {
  registerUser: (values: Values) => Promise<RegisterResult>;
};

const emptyValues: Values = { email: "", password: "", remember: false };

function validate(values: Values): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.email.includes("@")) errors.email = "Enter a valid email address.";
  if (values.password.length < 8) errors.password = "Use at least 8 characters.";
  return errors;
}

export function RegisterForm({ registerUser }: RegisterFormProps) {
  const [values, setValues] = useState(emptyValues);
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError("");
    setStatus("idle");
  }

  function markTouched(field: keyof Values) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const clientErrors = validate(values);
    setErrors(clientErrors);
    setTouched({ email: true, password: true });
    if (Object.keys(clientErrors).length > 0) return;

    setSubmitting(true);
    setFormError("");
    try {
      const result = await registerUser(values);
      if (!result.ok && result.status === 422) {
        setErrors(result.fieldErrors);
        setTouched({ email: true, password: true });
        return;
      }
      if (!result.ok) {
        setFormError("We could not create the account. Try again.");
        return;
      }
      setValues(emptyValues);
      setTouched({});
      setErrors({});
      setStatus("success");
    } catch {
      setFormError("The network request failed. Your draft is still here.");
    } finally {
      setSubmitting(false);
    }
  }

  function errorFor(field: keyof Values) {
    return touched[field] ? errors[field] : undefined;
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
      <div role="status" aria-live="polite">
        {status === "success" ? "Account created." : submitting ? "Creating account…" : ""}
      </div>
      {formError && <p role="alert">{formError}</p>}

      <label htmlFor="register-email">Email</label>
      <input
        id="register-email"
        name="email"
        type="email"
        value={values.email}
        onChange={(event) => update("email", event.target.value)}
        onBlur={() => markTouched("email")}
        aria-invalid={Boolean(errorFor("email"))}
        aria-describedby={errorFor("email") ? "register-email-error" : undefined}
      />
      {errorFor("email") && <p id="register-email-error" role="alert">{errorFor("email")}</p>}

      <label htmlFor="register-password">Password</label>
      <input
        id="register-password"
        name="password"
        type="password"
        value={values.password}
        onChange={(event) => update("password", event.target.value)}
        onBlur={() => markTouched("password")}
        aria-invalid={Boolean(errorFor("password"))}
        aria-describedby={errorFor("password") ? "register-password-error" : undefined}
      />
      {errorFor("password") && <p id="register-password-error" role="alert">{errorFor("password")}</p>}

      <label>
        <input
          name="remember"
          type="checkbox"
          checked={values.remember}
          onChange={(event) => update("remember", event.target.checked)}
        />
        Remember this device
      </label>

      <button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
```

The important details are behavioral. `event.currentTarget` would be the correct form owner for a native `FormData` read; the example instead submits the controlled snapshot `values`. The local validator runs before the request. A 422 preserves the draft and marks relevant fields touched. A transport failure preserves the draft. Success resets all controlled state to the same baseline, so the visible inputs and the logical form agree. `noValidate` is intentional here because the example owns the message presentation; in a real form, keep native constraints when their browser behavior is part of the desired UX.

For a file field, add an uncontrolled input with `name="avatar"` and read `event.currentTarget.files` at submit time. Build a `FormData` payload, append the file, and let `fetch` set the multipart boundary. Do not put a `File` object into JSON or attempt to set the file input's `value` to a path.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between a controlled and an uncontrolled input?**

A controlled input gets its current `value` or `checked` state from React and updates that owner in `onChange`. An uncontrolled input keeps the live value in the DOM, uses `defaultValue` or `defaultChecked` initially, and is read with a ref or `FormData` later. Controlled inputs are easier for immediate derived UI and transformations; uncontrolled inputs can reduce render work for large forms. The choice is about who owns the current value, not whether validation is possible.

**Q: Why should an input not switch between controlled and uncontrolled?**

React needs one stable owner for the element's lifetime. `value={undefined}` or an omitted value lets the DOM own the input; later supplying a string asks React to take ownership. Initialize state with the correct empty value, such as `""`, or keep the input uncontrolled with `defaultValue`. If the API is loading, render a loading state or use a deliberate reset when the loaded record becomes the new baseline.

**Q: What are touched and dirty state, and why are they different?**

Touched describes interaction, usually whether a field has been blurred. Dirty describes a value comparison with a baseline. A user can touch a field and return it to its original value: it is touched but no longer dirty. A programmatic prefill can make a field dirty without the user touching it, depending on the library's rules. Touched controls when to show feedback; dirty controls unsaved-change behavior.

**Q: Where should validation happen?**

Use browser constraints and synchronous client rules for fast feedback, schema validation for consistent shape and cross-field rules, and server validation for authority. Client validation cannot protect a system because requests can be forged and the client lacks current business state. Always handle the server response even when the client schema passes.

**Q: How would you handle asynchronous validation?**

Debounce checks that do not need to run on every keystroke, validate on blur when appropriate, and cancel or sequence requests. Apply a result only if it belongs to the current field value; otherwise a slow response for `old@example.com` can overwrite a newer result for `new@example.com`. Treat availability checks as hints and re-check the rule during submission on the server.

**Q: How do you map server validation errors into a form?**

Have the API return structured field paths and messages, for example `fieldErrors.email`. Convert those paths to the form library's `setError` API or the component's field-error map. Preserve the draft, mark the affected fields as needing attention, and put unfielded failures in a form-level error region. Do not show only a generic “request failed” message when the server gave a precise correction.

**Q: How do you prevent double submission?**

Track an in-flight state and return early from the submit handler when it is already true. Disable the button and communicate the pending state, but do not rely on the disabled attribute alone because submission can also come from the keyboard or another caller. For non-idempotent operations, send an idempotency key and make the server deduplicate retries.

**Q: How should reset work in a controlled form?**

Reset the React state that owns each controlled value, plus touched, errors, status, and the dirty baseline as the product requires. Native `form.reset()` only restores DOM defaults; it does not replace the source of truth in React. After an edit succeeds, reset to the server-confirmed response rather than the request if the server normalized data.

**Q: How do you make form errors accessible?**

Use an actual label and matching `htmlFor`/`id`. Set `aria-invalid` only when the field is invalid, connect the message with `aria-describedby`, and use a live region for status or form-level errors. Give grouped controls a `fieldset` and `legend`, keep errors in the reading order, and focus the first invalid control after submit. Do not depend on color alone or replace the browser's focus outline without an equivalent.

**Q: How do file inputs differ from ordinary inputs?**

The browser protects the selected local path, so a file input is effectively uncontrolled. Read its `FileList`, validate user-facing limits early, and submit a `File` through `FormData` or a dedicated upload flow. The server must inspect the actual bytes and enforce authorization and storage limits. Reset the input through the form, a key change, or an empty ref value.

**Q: When is a form library worth using?**

Use one when the form has many fields, nested or repeated field arrays, schema integration, subscriptions, complex touched/dirty rules, accessible error handling, or repeated async submission patterns. A small two-field form may be clearer with local state and a few functions. Evaluate a library by its ownership model, render behavior, reset semantics, TypeScript support, accessibility, and how well it maps server errors—not by its API size alone.

## 6. The Traps — What Goes Wrong

- **Using `value` without an update path:** the field becomes effectively read-only. Add `onChange`, or mark it `readOnly` when that is intentional.
- **Using `value={undefined}` during loading:** the input can switch ownership later. Use stable empty values or render after initialization.
- **Reading event targets across an async boundary:** modern React no longer pools DOM `SyntheticEvent` objects, so `event.target` generally does not become unsafe merely because an `await` occurred. However, `event.currentTarget` is only meaningful while the handler is running, and snapshotting the specific value or form reference before the async boundary keeps the code precise and avoids relying on event-object lifetime details.
- **Showing every error on the first render:** this creates noisy UX. Show field errors after touch or submit while still validating the complete payload on submit.
- **Treating client validation as security:** a browser check can be bypassed. Revalidate, authorize, and normalize on the server.
- **Letting stale async results win:** cancellation, request IDs, or current-value checks are required for asynchronous validation.
- **Disabling only the button:** protect the handler and the server too; keyboard submission and retries still exist.
- **Calling `form.reset()` on controlled inputs:** the DOM may reset while React immediately renders the old state back. Reset the React owner or library state.
- **Clearing a draft after a network error:** the request may not have reached the server. Preserve the draft and explain what happened.
- **Sending files as JSON:** JSON does not carry a `File` payload. Use `FormData` or a dedicated upload protocol.
- **Using array indexes as IDs for dynamic fields:** inserting a row can move errors and focus to another row. Use stable item IDs for keys and field paths where the library supports them.
- **Relying on color, placeholder text, or an icon as a label:** these fail for assistive technology, zoom, and keyboard use. Provide names and text relationships explicitly.
- **Putting all form state at the page root:** unrelated renders become coupled. Keep ownership near the form, subscribe narrowly, or split the form into focused sections.

## 7. Compare With Related Concepts

| Concept | Its job | What it does not replace |
| --- | --- | --- |
| Controlled input | Keeps the live value in React | Server validation or request lifecycle |
| Uncontrolled input | Keeps the live value in the DOM until read | Error/touched policy by itself |
| Form library | Coordinates registration, subscriptions, and form metadata | The product's ownership decisions or API contract |
| Client/schema validation | Gives fast, consistent feedback before a request | Authorization and authoritative business rules |
| Server validation | Accepts or rejects the real command | Good client UX and field-level guidance |
| Form state | Represents the user's editable draft and its lifecycle | Cached server data and mutation invalidation |
| Mutation state | Represents an async request and its result | Whether the draft is dirty or touched |
| Native HTML form | Provides semantics, keyboard submission, and `FormData` | Complex client-only transformations without extra code |

A form library and a data-fetching library solve different boundaries. The form library owns the draft and validation metadata. A mutation abstraction owns the request, pending state, retries, and server-cache consequences. They can be composed, but one should not be forced to pretend it owns the other.

## 8. 🧠 The Memory Hook — What Sticks

Remember **DRAFT → GATES → HANDOFF → ANSWER**:

- **DRAFT:** choose one owner for every value; track touched and dirty separately.
- **GATES:** use native, client, schema, and async checks for feedback, but trust the server last.
- **HANDOFF:** validate, guard duplicates, disable pending controls, and submit a stable snapshot.
- **ANSWER:** map field errors, announce status, preserve failed drafts, and reset to the confirmed baseline only after success.

If an interview asks how you would build a production form, start with ownership, then describe the state transitions and failure paths. Mention labels and focus, file inputs, async validation races, server error mapping, and idempotency. That shows you understand a form as a user-facing protocol rather than a generic component with a submit button.
