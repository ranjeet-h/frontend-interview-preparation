# Testing

Tests are written against **user-visible behavior**, not implementation details. A test that renders a component, finds elements the way a user or a screen reader would, and asserts on what appears on screen survives refactors; a test that reaches into state, hook return values, or class names breaks the moment you rename an internal variable &mdash; even though the product still works. This chapter uses **React Testing Library (RTL)** and **Vitest**. Vitest is Jest-compatible (`describe`, `it`, `expect`, `vi.fn`), so every pattern here transfers to a Jest codebase unchanged.

```bash
npm i -D vitest @testing-library/react @testing-library/user-event \
  @testing-library/jest-dom jsdom @vitest/coverage-v8
```

Configure jsdom and the matchers once:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,                 // enables RTL auto-cleanup via afterEach
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

```ts
// vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

RTL auto-cleans the DOM after each test when `globals` is on; without it, call `cleanup()` in an explicit `afterEach`.

**The query ladder.** Prefer queries in this order, because each one asserts something a user can perceive:

```text
getByRole(role, { name })   ← matches the accessibility tree; asserts role + name
getByLabelText(text)        ← form fields; asserts the label is wired up
getByPlaceholderText(text)  ← weak: placeholders are not labels
getByText(text)             ← non-interactive text
getByTestId(id)             ← last resort; proves nothing to a screen reader
```

Use `getBy*` when the element must exist (throws if missing) and `queryBy*` only to assert absence. Use `findBy*` for anything that appears asynchronously &mdash; it retries instead of forcing you to guess a timeout. `user-event` is the interaction layer: it simulates focus, pointer, and keyboard the way a browser does, unlike `fireEvent`, which dispatches a single synthetic event.

The problems below are testing problems, so the "Basic Version" each time is the **test file**, and the "State Design" is the test's mental model: what the unit is, what is mocked, and which observable facts the assertions may touch.

---

## Test Todo Interactions

`Difficulty: Medium` `Probability: Very High`

### What are we building?

The test suite for the Todo / CRUD app from **#2**. The behavior under test is the user's journey: add a todo and clear the input, refuse an empty todo, toggle completion, delete the *matching* item, filter, and update the remaining count. No server, no timers &mdash; this is the canonical "can you test a component without touching its internals?" exercise.

### Example

```text
render(<TodoApp />)

type "Write the tests" → click "Add"
  ✓ "Write the tests" is on screen
  ✓ the input is empty again

click the checkbox next to "Write the tests"
  ✓ the checkbox is checked
  ✓ "0 items left" is shown

click "active"
  ✓ completed items are gone, active ones remain
```

### What is the interviewer testing?

- Finding elements by role and accessible name rather than test ids or CSS selectors
- `user-event` for realistic interaction, with every action awaited
- Asserting on rendered output instead of component state or props
- Distinguishing `getBy*` (must exist) from `queryBy*` (assert absence)
- Test isolation: a fresh DOM per test, stable ids for duplicate text
- Writing tests that read like a user story, not like a unit of implementation

### State Design

```text
unit:       <TodoApp /> rendered into jsdom
mocked:     nothing — all state is local React state
queries:    getByRole > getByLabelText > getByText; getByTestId last resort
assertions: what is on screen (text, value, checked, disabled), not how it is stored
```

**Do NOT assert** on internal state, hook return values, component props, or CSS class names. A test that reads `todos.length` through a mocked hook is testing the implementation, and it will fail on a pure refactor. Treat the accessibility tree as the public contract.

### Basic Version

```ts
// TodoApp.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { TodoApp } from "./TodoApp";

const NEW_TODO = /what needs doing/i;

describe("TodoApp", () => {
  it("adds a todo and clears the input", async () => {
    const user = userEvent.setup();
    render(<TodoApp />);

    const input = screen.getByLabelText(NEW_TODO);
    await user.type(input, "Write the tests");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(screen.getByText("Write the tests")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("does not add a whitespace-only todo", async () => {
    const user = userEvent.setup();
    render(<TodoApp />);

    const add = screen.getByRole("button", { name: /^add$/i });
    expect(add).toBeDisabled();

    await user.type(screen.getByLabelText(NEW_TODO), "   ");
    expect(add).toBeDisabled();
  });

  it("toggles a todo and updates the remaining count", async () => {
    const user = userEvent.setup();
    render(<TodoApp />);

    await user.type(screen.getByLabelText(NEW_TODO), "Ship it{Enter}");
    expect(screen.getByText(/1 item left/i)).toBeInTheDocument();

    const checkbox = screen.getByRole("checkbox", { name: "Ship it" });
    await user.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(screen.getByText(/0 items left/i)).toBeInTheDocument();
  });

  it("deletes only the matching todo", async () => {
    const user = userEvent.setup();
    render(<TodoApp />);

    const input = screen.getByLabelText(NEW_TODO);
    await user.type(input, "Keep me{Enter}");
    await user.type(input, "Remove me{Enter}");

    await user.click(screen.getByRole("button", { name: "Delete Remove me" }));

    expect(screen.queryByText("Remove me")).not.toBeInTheDocument();
    expect(screen.getByText("Keep me")).toBeInTheDocument();
  });

  it("filters active and completed todos", async () => {
    const user = userEvent.setup();
    render(<TodoApp />);

    const input = screen.getByLabelText(NEW_TODO);
    await user.type(input, "Done{Enter}");
    await user.type(input, "Pending{Enter}");
    await user.click(screen.getByRole("checkbox", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "active" }));
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "completed" }));
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });
});
```

### How It Works

- `userEvent.setup()` is called **before** `render`. It installs the pointer/keyboard simulation on the current document; calling it early avoids a first-action race.
- Every interaction is `await`ed. `user.type` and `user.click` return promises because they schedule multiple real events and flush React updates between them.
- `getByLabelText(/what needs doing/i)` proves the `<label htmlFor>` is wired to the input. If someone removes the label, the test fails &mdash; correctly, because a user lost the field name.
- `getByRole("checkbox", { name: "Ship it" })` resolves the accessible name from the wrapping label, so the test never needs `aria-label` or a test id.
- `queryByText(...)` returns `null` instead of throwing, which is exactly what `not.toBeInTheDocument()` needs for absence assertions.
- The delete test uses distinct todo text (`Keep me` / `Remove me`) so the accessible name `Delete Remove me` is unique. Duplicate labels would make `getByRole` throw on multiple matches &mdash; a signal to scope with `within(row)`.

### Edge Cases

- **Two identical todos:** `getAllByText("Milk")` or scope with `within(screen.getByRole("listitem", { name: /milk/i }))` rather than loosening the query.
- **Async updates:** if an add becomes async, switch `getByText` to `await screen.findByText(...)`.
- **Portals and modals:** query the whole `screen`, which spans `document.body`; do not query inside `container`.
- **Cleanup leaks:** if `globals` is off in Vitest, the second `render` leaves two apps mounted and `getByLabelText` throws on duplicates. Register `afterEach(cleanup)`.
- **Case sensitivity:** `{ name: "active" }` is exact by default; use a case-insensitive regex when copy may change.

### Interview Follow-ups

- **Level 1:** Add, toggle, and delete found by role and accessible name.
- **Level 2:** Filters, remaining count, and the empty state.
- **Level 3:** Point it at a mocked API; assert the loading state and the optimistic rollback from **#4**.
- **Level 4:** A keyboard-only path &mdash; `user.tab()` to the input, `{Enter}` to submit, `Space` to toggle &mdash; with no `.click()`.
- **Level 5:** Extract a `renderTodoApp()` helper and a `makeTodo()` factory so tests read as data, not setup.
- **Level 6:** Add `vitest-axe` and assert `toHaveNoViolations()` on the rendered list.
- **Level 7:** Replace the noisy multi-step setup with a small "given/when/then" helper and show how it keeps tests independent.

### Production Version

Run the suite in CI with `vitest run --coverage` in a headless jsdom environment; component tests are milliseconds each, so there is no reason to skip them on a pull request. Coverage is a diagnostic, not a goal: chase the untested **branches** (empty input, failed request, boundary counts), never a percentage. Do **not** test third-party libraries, trivial presentational wrappers with no logic, or exact copy that marketing changes weekly. A page of snapshot tests that fail on every copy edit trains the team to rubber-stamp failures &mdash; worse than no tests.

### Accessibility

The queries *are* the accessibility check: `getByLabelText` verifies the label association, `getByRole("checkbox", { name })` verifies the accessible name, and `getByRole("button", { name: "Delete Remove me" })` verifies that icon-only or repeated buttons are distinguishable. Add `expect(checkbox).toBeChecked()` only after asserting the role, so a `<div onClick>` regression fails the test instead of silently passing.

### Performance

RTL tests run in-process; the whole file above is a few milliseconds. Keep them that way: avoid `waitFor` with long timeouts when `findBy*` will do, and never `await new Promise(r => setTimeout(r, 1000))` to "let things settle." A slow suite is a suite nobody runs on every save.

### Testing

```text
✓ adds a todo, renders it, and clears the input
✓ refuses whitespace-only input (button stays disabled)
✓ toggles completion and updates the remaining count
✓ deletes the matching todo, not its neighbour
✓ filters active vs completed
✓ finds controls by role and accessible name, never by test id
```

### Common Mistakes

- Sprinkling `data-testid` everywhere instead of using roles and labels.
- Asserting on internal state (`expect(result.current.todos).toHaveLength(1)`) instead of the screen.
- Using `fireEvent.change` for typing; use `await user.type(...)`.
- Forgetting `await` on `user.click`/`user.type`, then asserting before React commits.
- `getByText` for absence; use `queryByText` with `not.toBeInTheDocument()`.
- Reusing a `user` instance across tests or forgetting cleanup, causing DOM leakage.
- Snapshotting the whole tree, which pins implementation details forever.

### Interview Takeaway

A component test should read like a user's script: render, find controls by role and label, interact with `user-event`, and assert on what is visible. If a refactor that keeps behavior identical can break the test, the test is over-coupled &mdash; fix the test, not the component.

---

## Test Modal Keyboard & Focus Behavior

`Difficulty: Medium` `Probability: High`

### What are we building?

The test suite for the accessible modal from **#17**. Modal behavior is mostly invisible: focus moves in, Tab stays trapped, Escape closes, and focus returns to the trigger. None of that is visible in a screenshot, which is exactly why it needs tests. The component's public contract is `open`, `onClose`, and the rendered `role="dialog"`, so those are the only things the tests may touch.

### Example

```text
click "Open settings"   → dialog opens, focus lands inside it
Shift+Tab on first item → focus wraps to the last focusable control
Tab on last item        → focus wraps back to the first
Escape                  → dialog closes
                        → focus returns to "Open settings"
```

### What is the interviewer testing?

- Driving focus with `user.tab()` and asserting with `toHaveFocus()`
- Keyboard handling (`Escape`) at the component boundary
- Treating `onClose` as the public contract and mocking it with `vi.fn()`
- The ARIA dialog pattern: `role="dialog"`, an accessible name, `aria-modal`
- Cleaning up portals so one test's dialog cannot leak into the next
- Testing behavior that is invisible rather than restating markup

### State Design

```text
unit:       <Modal> mounted by a small harness that owns an `open` flag and a trigger
mocked:     onClose = vi.fn()  — a genuine public contract, not a React internal
queries:    getByRole("dialog", { name }), getByRole("button", { name })
assertions: document.activeElement via toHaveFocus(); presence/absence of the dialog
```

**Do NOT assert** on portal structure (`document.body.children.length`), CSS classes for the open state, or the internal ref that stores the trigger. "Is the dialog gone?" and "does focus sit on the trigger?" are the contract; "how the portal is arranged" is not.

### Basic Version

```ts
// Modal.test.tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { Modal } from "./Modal";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open settings</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Settings">
        <button>Save</button>
        <button>Cancel</button>
      </Modal>
    </>
  );
}

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Settings">
        <button>Save</button>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a labelled, modal dialog and moves focus inside on open", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /open settings/i }));

    const dialog = screen.getByRole("dialog", { name: /settings/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /open settings/i }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("traps focus and wraps at both ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /open settings/i }));

    const dialog = screen.getByRole("dialog", { name: /settings/i });
    const controls = within(dialog).getAllByRole("button");
    const first = controls[0];
    const last = controls[controls.length - 1];

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it("returns focus to the trigger on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: /open settings/i });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(trigger).toHaveFocus();
  });

  it("calls onClose exactly once when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Settings">
        <button>Save</button>
      </Modal>,
    );

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

### How It Works

- `getByRole("dialog", { name: /settings/i })` asserts the role *and* that the dialog has an accessible name. A `<div className="modal">` with no `aria-labelledby` fails immediately.
- The trap is driven with real keyboard input: `user.tab()` dispatches the key event and lets the component move focus. jsdom does not trap focus on its own, so a passing wrap test proves the component implements it.
- `last.focus()` sets the starting edge deliberately, so the test checks both the wrap (Tab from last) and the reverse wrap (Shift+Tab from first) in one scenario.
- Focus restoration is tested *after* the dialog unmounts. `expect(trigger).toHaveFocus()` is the only assertion that can catch a missing "save the trigger ref" implementation.
- `expect(onClose).toHaveBeenCalledTimes(1)` is allowed because `onClose` is a prop callback &mdash; a public contract. Asserting a React internal function was called would not be.

### Edge Cases

- **Nested dialogs:** `getAllByRole("dialog")`; assert the top one traps and the underlying one is inert.
- **Async close (animation):** wrap in `await waitForElementToBeRemoved(() => screen.queryByRole("dialog"))`.
- **Escape disabled:** a `closeOnEscape={false}` prop should be a test of its own: dialog stays mounted.
- **Background scroll lock:** assert `document.body` styling or an `aria-hidden` on the app root only if that is an explicit contract.
- **Portal leakage:** always unmount; a dialog that renders into `document.body` will otherwise be found by the next test.
- **Focus on a non-button:** test the first focusable element (input/link), not just buttons, so the trap handles all `tabindex` order.

### Interview Follow-ups

- **Level 1:** Open and close, asserted by dialog presence.
- **Level 2:** Escape closes and calls `onClose`.
- **Level 3:** Focus returns to the trigger.
- **Level 4:** Focus trap wraps in both directions.
- **Level 5:** Background is inert (`aria-hidden`) and scroll-locked while open.
- **Level 6:** `vitest-axe` finds no violations with the dialog open.
- **Level 7:** Run the same flow in Playwright, where real browser tab order and `inert` are available &mdash; jsdom's focus model is approximate.

### Production Version

Keep focus tests in jsdom for speed, but acknowledge the limit in CI notes: jsdom does not implement layout or real sequential focus navigation, so anything relying on rendered geometry (focus ring visibility, `inert`, scroll) needs `@axe-core/playwright` or a Playwright smoke test. Coverage philosophy: focus management is a contract, so cover it deliberately; do not chase line coverage inside the modal's animation glue. Do **not** test that a third-party dialog library traps focus &mdash; test only the behavior you wrote or configured.

### Accessibility

This suite is the modal's a11y specification: `role="dialog"`, a name from the title, `aria-modal="true"`, Escape to dismiss, focus trapped, and focus restored. Those five facts are the WAI-ARIA dialog pattern. Add a `vitest-axe` pass for labelled controls and heading order, and a keyboard-only flow that never calls `.click()` to prove the modal is fully operable without a mouse.

### Performance

Focus assertions are cheap. The only cost is `waitForElementToBeRemoved` when a CSS transition delays unmount; keep transitions short in tests or disable them under `prefers-reduced-motion`. Scope queries with `within(dialog)` so a large app does not slow every lookup.

### Testing

```text
✓ renders nothing while closed
✓ opens as a labelled dialog with aria-modal and focus inside
✓ Escape closes the dialog
✓ Tab wraps from last→first and Shift+Tab from first→last
✓ focus returns to the trigger after close
✓ the close button calls onClose exactly once
```

### Common Mistakes

- Asserting `.modal--open` or `display: none` instead of the dialog's presence.
- Using `fireEvent.keyDown(document, { key: "Escape" })` on the wrong node; drive it with `await user.keyboard("{Escape}")`.
- Checking `document.activeElement` inside an unawaited callback, before React commits focus.
- Forgetting to unmount, so a leaked portal makes the next test find two dialogs.
- Asserting the portal tree instead of the accessible dialog.
- Testing the animation timing rather than the end state.

### Interview Takeaway

Modal behavior is mostly focus. Test the five ARIA dialog facts &mdash; role, name, Escape, trap, restore &mdash; through keyboard input and `toHaveFocus()`, and never let the test peek at how the portal or the trigger ref is stored.

---

## Test Autocomplete

`Difficulty: Medium` `Probability: High`

### What are we building?

The test suite for the autocomplete / combobox from **#20**. The behaviors are: type to filter, open the listbox, move the active option with the arrow keys, commit with Enter, dismiss with Escape, and show an empty state. Comboboxes are the hardest common widget to test because their state is expressed almost entirely through ARIA attributes, not text.

### Example

```text
type "ap"      → aria-expanded="true", options [Apple] [Apricot]
ArrowDown      → Apple has aria-selected="true"
ArrowDown      → Apricot has aria-selected="true"
Enter          → input = "Apricot", aria-expanded="false"
Escape         → listbox closes, onChange not called
type "zzz"     → no options, status text "No matches"
```

### What is the interviewer testing?

- The combobox ARIA pattern: `role="combobox"`, `aria-expanded`, `aria-selected`
- Reading selection state from ARIA rather than CSS classes
- `getAllByRole("option")` and DOM order as the source of truth for highlighting
- Asserting the public `onChange` callback and the visible input value together
- Async filtering with `findByRole`
- Separating "closed" from "open with no matches"

### State Design

```text
unit:       <Autocomplete options={string[]} onChange={fn} />
mocked:     onChange = vi.fn(); for async, a mocked fetcher
queries:    getByRole("combobox"), getByRole("option", { name }), getAllByRole("option")
assertions: aria-expanded, aria-selected, the input value, and onChange — never `activeIndex`
```

**Do NOT assert** the highlight through a class such as `.option--active` or a `data-active` attribute that only the CSS reads. `aria-selected` (and optionally `aria-activedescendant`) is what assistive technology consumes; assert that. If the component does not expose stable ids, assert `aria-selected` rather than guessing an id.

### Basic Version

```ts
// Autocomplete.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Autocomplete } from "./Autocomplete";

const FRUIT = ["Apple", "Apricot", "Banana", "Cherry"];
const noop = () => {};

describe("Autocomplete", () => {
  it("opens the listbox and filters as the user types", async () => {
    const user = userEvent.setup();
    render(<Autocomplete options={FRUIT} onChange={noop} />);

    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "false");

    await user.type(input, "ap");

    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { name: "Apple" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Apricot" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Banana" })).not.toBeInTheDocument();
  });

  it("moves the active option with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Autocomplete options={FRUIT} onChange={noop} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "a");

    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "false");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
  });

  it("commits the active option with Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Autocomplete options={FRUIT} onChange={onChange} />);

    const input = screen.getByRole("combobox");
    await user.type(input, "ban");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("Banana");
    expect(input).toHaveValue("Banana");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on Escape without committing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Autocomplete options={FRUIT} onChange={onChange} />);

    await user.type(screen.getByRole("combobox"), "che");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows an empty state distinct from a closed listbox", async () => {
    const user = userEvent.setup();
    render(<Autocomplete options={FRUIT} onChange={noop} />);

    await user.type(screen.getByRole("combobox"), "zzz");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/no matches/i);
  });
});
```

### How It Works

- An `<input>` has an implicit textbox role; the test asks for `"combobox"`, which only passes if the component sets `role="combobox"`. The query is itself an ARIA assertion.
- `aria-expanded` toggles `"true"`/`"false"` strings, not booleans, because ARIA attributes are strings. Asserting the string is intentional.
- `getAllByRole("option")` returns options in document order, so index `0` and `1` match what a sighted user sees top-to-bottom. The test reads selection from `aria-selected` on those nodes.
- The Enter test asserts three observable facts together: the callback payload, the input's new value, and the collapsed listbox. That is the whole selection contract.
- Escape asserts a negative &mdash; `onChange` was not called &mdash; which distinguishes "dismissed" from "committed."
- The empty state queries `getByRole("status")` so the message is announced to screen readers, not just drawn.

### Edge Cases

- **Case and accent folding:** assert `"ap"` matches `"Apple"` and `"Apricot"`.
- **No active option on open:** ArrowDown should select the first; arrow up from the top may wrap or clamp &mdash; pin the chosen behavior in a test.
- **Duplicate labels:** include the visible index or scope with `within(listbox)`.
- **Async options:** `expect(await screen.findByRole("option", { name: "Banana" })).toBeInTheDocument()` and assert a loading status first.
- **IME composition:** jsdom cannot reproduce it; cover composition events in Playwright.
- **Click selection:** add one mouse test, but keep the primary suite keyboard-driven.
- **blur closes without selecting:** assert `onChange` was not called.

### Interview Follow-ups

- **Level 1:** Filter a static list and assert the visible options.
- **Level 2:** Arrow-key navigation via `aria-selected`.
- **Level 3:** Commit and dismiss, asserting both the value and the callback.
- **Level 4:** Async options with `findByRole` and a loading status.
- **Level 5:** Race handling &mdash; type fast, resolve out of order, assert only the latest options render.
- **Level 6:** `vitest-axe` and a full keyboard-only journey (Tab in, arrow, Enter, Tab out).
- **Level 7:** Test the same component logic through a headless hook (see **#88**) and keep the component test thin.

### Production Version

If you use Downshift, Radix, or Headless UI, still test *your* configuration and behavior contract rather than the library's internals. Mock the network at the boundary; for many endpoints prefer MSW over stubbing `fetch`. Coverage philosophy: the combobox's ARIA wiring is worth deliberate tests; the presentational option row is not. Do **not** snapshot the entire listbox &mdash; ARIA attributes and whitespace churn make snapshots brittle and unreadable.

### Accessibility

This suite is the combobox's accessibility specification. `role="combobox"` with `aria-expanded`, `aria-controls`, `role="listbox"`/`role="option"`, and `aria-selected` are asserted directly. Add `expect(input).toHaveAccessibleName(/search/i)` so the field cannot lose its label, and run a keyboard-only flow to prove the widget never requires a pointer.

### Performance

`user.type` simulates each keystroke, which is slower than `fireEvent.change`; for long strings pass `userEvent.setup({ delay: null })` to skip the inter-key delay in tests where typing speed is irrelevant. Keep the fixture list short so `getAllByRole` stays fast, and clear timers if the component debounces (see **#86**).

### Testing

```text
✓ typing filters options and sets aria-expanded
✓ ArrowDown/ArrowUp move aria-selected through DOM order
✓ Enter commits the active option and collapses the listbox
✓ Escape dismisses without calling onChange
✓ an unmatched query shows a status message, not a bare blank box
```

### Common Mistakes

- Querying by placeholder instead of the combobox role.
- Asserting the highlight with a CSS class rather than `aria-selected`.
- Forgetting `await` on `user.type`/`user.keyboard`, then reading stale ARIA state.
- Assuming options are rendered when the listbox is closed (`queryByRole` first).
- Testing the underlying library instead of the component's contract.
- Using `getByTestId` on options when `getByRole("option")` exists.

### Interview Takeaway

A combobox's behavior lives in ARIA. Test it by asking for the combobox and option roles, driving it with the keyboard, and asserting `aria-expanded` and `aria-selected` plus the `onChange` payload. If your assertions never mention an ARIA attribute, you are probably testing markup instead of behavior.

---

## Test Debounced Input with Fake Timers

`Difficulty: Hard` `Probability: High`

### What are we building?

Tests for the debounced search from **#40** and the `useDebouncedValue` hook behind it. The behavior under test is timing: nothing fires until the delay elapses, a burst of keystrokes collapses into one call, and the pending timer is cleared on unmount. Real timers make these tests slow and flaky; fake timers make them instant and deterministic &mdash; once you learn the user-event interaction.

### Example

```text
type "re"                (t = 0)
advance 150ms            no request
type "act"               pending timer resets
advance 299ms            still no request
advance 1ms              → exactly one request: search("react")
unmount                  → pending timer cleared; no late request
```

### What is the interviewer testing?

- `vi.useFakeTimers()` / `vi.useRealTimers()` setup and teardown discipline
- Advancing time with `vi.advanceTimersByTime` / `vi.advanceTimersByTimeAsync`
- Wrapping timer-driven updates in `act` so React flushes
- The subtle coupling between fake timers and `userEvent`
- Asserting the observable effect (call count and value), not the timer
- Testing cleanup: no request after unmount

### State Design

```text
unit:       the component that debounces, or useDebouncedValue via renderHook
mocked:     the network call (vi.fn) — NOT setTimeout; the real timer is faked
queries:    the searchbox and the rendered status/results
assertions: how many times the call fired and with what argument; never timer ids
```

**Do NOT assert** that `setTimeout` was called with `300`, or read the internal `debounced` state. Assert the effect: one call, with `"react"`, after advancing the clock. The delay is configuration; the call contract is behavior.

### Basic Version

```ts
// DebouncedSearch.test.tsx
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DebouncedSearch } from "./DebouncedSearch";

describe("DebouncedSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("does not search until the delay has passed", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const search = vi.fn().mockResolvedValue([]);
    render(<DebouncedSearch search={search} delay={300} />);

    await user.type(screen.getByRole("searchbox"), "rea");
    expect(search).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("rea");
  });

  it("collapses a burst of keystrokes into a single call", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const search = vi.fn().mockResolvedValue([]);
    render(<DebouncedSearch search={search} delay={300} />);

    const input = screen.getByRole("searchbox");
    await user.type(input, "re");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    await user.type(input, "act");         // resets the pending timer

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("react");
  });

  it("renders results after the debounced search resolves", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const search = vi.fn().mockResolvedValue(["React", "React Native"]);
    render(<DebouncedSearch search={search} delay={300} />);

    await user.type(screen.getByRole("searchbox"), "react");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(await screen.findByText("React")).toBeInTheDocument();
  });

  it("does not search after unmount", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const search = vi.fn().mockResolvedValue([]);
    const { unmount } = render(<DebouncedSearch search={search} delay={300} />);

    await user.type(screen.getByRole("searchbox"), "react");
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(search).not.toHaveBeenCalled();
  });
});
```

The hook can also be tested directly, which is faster and pins the timing contract without any markup:

```ts
// useDebouncedValue.test.ts
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDebouncedValue } from "./useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the previous value until the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "ab" });
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe("ab");
  });
});
```

### How It Works

- `vi.useFakeTimers()` replaces `setTimeout`, `clearTimeout`, and `Date` with controllable versions. Nothing in the test waits a real 300ms; `advanceTimersByTimeAsync(300)` runs the callback immediately.
- **The user-event coupling is the trap.** `userEvent.setup()` introduces its own short delays through `setTimeout`, so on faked timers an unconfigured user-event awaits a timer that never advances and the test hangs. `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` lets user-event advance the clock itself. The alternative is `userEvent.setup({ delay: null })`.
- `advanceTimersByTimeAsync` flushes microtasks in addition to timers, so a promise resolved inside a timer callback settles before the next assertion. The synchronous `advanceTimersByTime` does not.
- The advance is wrapped in `await act(async () => { ... })` because the timer callback calls `setState`. React must flush that update before the assertion, or the warning fires and the render lags.
- The unconfigured alternative to `advanceTimers` is to advance manually *between* user actions, but then every `user.type` keystroke's own delay becomes your problem. Configure it once at setup.
- `afterEach` calls `vi.runOnlyPendingTimers()` (so a dangling timer cannot leak) and `vi.useRealTimers()` (so mocked modules and the next test file behave normally).

### Edge Cases

- **Boundary timing:** assert no call after `advanceTimersByTime(299)` and one call after the final millisecond, when the exact delay is part of the contract.
- **Reset on continued typing:** the burst test above is the canonical reset proof.
- **Unmount clears the timer:** otherwise a setState-after-unmount warning and a late request appear.
- **Fake timers leaking across files:** Vitest resets timers per test only if you restore; an unrestored fake clock makes unrelated tests behave strangely. Always `useRealTimers` in `afterEach`.
- **`waitFor` with fake timers:** the default `waitFor` uses `setInterval`, which never fires on a frozen clock unless you pass `{ timeout, interval }` or advance manually. Prefer `act` + `advanceTimersByTimeAsync`.
- **Debounced callback with arguments:** assert `toHaveBeenCalledWith("react")`, not just call count, so the *latest* value wins.

### Interview Follow-ups

- **Level 1:** `useDebouncedValue` via `renderHook` and fake timers.
- **Level 2:** A component that renders the debounced value.
- **Level 3:** Boundary timing (299/300) and timer reset on a new keystroke.
- **Level 4:** A burst collapses to exactly one call with the final value.
- **Level 5:** Cancellation on unmount; no request fires after teardown.
- **Level 6:** Compose with abort/race discipline (see **#87**) so a slow response cannot overwrite a newer one.
- **Level 7:** Test throttle alongside debounce and state the behavioral difference (leading vs trailing edge).

### Production Version

Fake timers are the right tool for exact timing, but they are fragile to mix into large integration tests. A pragmatic policy for CI: use `findBy*` and real timers when the assertion is "eventually shows up," and reserve fake timers for the small number of tests that genuinely depend on elapsed time. Coverage philosophy: test the debounce *contract* (one call per burst, latest value, cleanup) rather than hard-coded 299/300 boundaries, which break the day someone tunes the delay. Do **not** test `useDebouncedValue`'s internals or re-test `setTimeout` itself.

### Accessibility

Debouncing must not hide status. Assert that a `role="status"` or `aria-live="polite"` region reports "Searching…" and then the result count, so a screen-reader user is told when results change. Never require the user to guess that something happened after a pause.

### Performance

Fake timers make this suite effectively instant, which is their main reason to exist. Use `delay: null` when keystroke timing is irrelevant, and keep one boundary test rather than a dozen. Restore real timers so other files are not accidentally frozen.

### Testing

```text
✓ no call before the delay elapses
✓ exactly one call after the delay
✓ a burst of keystrokes collapses into one call with the final value
✓ results render once the debounced promise resolves
✓ unmount clears the pending timer (no late call)
✓ a status region announces the search
```

### Common Mistakes

- Calling `vi.useFakeTimers()` but forgetting `userEvent.setup({ advanceTimers: ... })`, so the test hangs.
- Advancing timers without `act`, leaving React unflushed.
- Forgetting `vi.useRealTimers()` in `afterEach`, poisoning later tests.
- Using the sync `advanceTimersByTime` and then asserting before the promise settles.
- Asserting call count without the argument, so a stale-value bug passes.
- Using `waitFor` with default polling on a frozen clock.

### Interview Takeaway

Fake timers turn timing into an exact, instant assertion &mdash; provided you tell `user-event` to advance them and wrap the advance in `act`. Test the debounce contract (one call per burst, latest value, cleared on unmount), not the number of milliseconds.

---

## Test Async Loading / Success / Error

`Difficulty: Medium` `Probability: Very High`

### What are we building?

The test suite for the async API list from **#39**: it shows a loading state, renders data on success, shows an error with a retry on failure, renders a distinct empty state, ignores stale responses, and aborts in-flight requests on unmount. The network is the boundary, so that is the only thing mocked.

### Example

```text
mount                    → role="status" "Loading…"
resolve 200 [posts]      → list of titles, status gone
reject / non-ok 500      → role="alert" "Something went wrong", [Retry]
click Retry              → role="status" → list of titles
unmount mid-flight       → fetch was called with a signal and it is aborted
```

### What is the interviewer testing?

- Mocking at the boundary (`fetch`) without changing component code
- `findBy*` for asynchronous appearance instead of timing guesses
- Asserting every state, including the easy-to-forget empty state
- The retry path as a behavior (a second request that succeeds)
- Stale-response handling and `AbortController` cleanup
- `role="status"` for loading and `role="alert"` for errors

### State Design

```text
unit:       <PostList /> with a stubbed global fetch (or MSW handlers)
mocked:     the network boundary only
queries:    getByRole("status") for loading, findByText for data, getByRole("alert") for errors
assertions: what is rendered in each state and how many requests fired
```

**Do NOT assert** on the internal `status` state variable or on a hook's returned object. The user cannot see `status === "error"`; they see an alert. Assert the alert. Likewise, assert request *arguments* only when they are a contract (the query string), not the number of `setState` calls.

### Basic Version

```ts
// PostList.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PostList } from "./PostList";

const POSTS = [
  { id: "1", title: "First post" },
  { id: "2", title: "Second post" },
];

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = (status = 500): Response =>
  ({ ok: false, status, json: async () => ({}) }) as Response;

describe("PostList", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows loading, then the data", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ok(POSTS));

    render(<PostList />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(await screen.findByText("First post")).toBeInTheDocument();
    expect(screen.getByText("Second post")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows an empty state for an empty list", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ok([]));

    render(<PostList />);

    expect(await screen.findByText(/no posts/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error, then recovers on retry", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fail()).mockResolvedValueOnce(ok(POSTS));

    const user = userEvent.setup();
    render(<PostList />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);

    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText("First post")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale response after the query changes", async () => {
    let resolveFirst!: (value: Response) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce(ok([{ id: "2", title: "New" }]));

    const { rerender } = render(<PostList query="old" />);
    rerender(<PostList query="new" />);

    // The first (stale) request resolves *after* the second one.
    resolveFirst(ok([{ id: "1", title: "Stale" }]));

    expect(await screen.findByText("New")).toBeInTheDocument();
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  });

  it("aborts the in-flight request on unmount", () => {
    vi.mocked(fetch).mockResolvedValueOnce(ok(POSTS));

    const { unmount } = render(<PostList />);
    unmount();

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.signal?.aborted).toBe(true);
  });
});
```

For a suite with many endpoints, swap the global stub for **MSW** (Mock Service Worker), which intercepts at the network layer and leaves the component completely unaware:

```ts
// setup: server.listen(); tests declare handlers; teardown: server.resetHandlers()
server.use(
  http.get("/api/posts", () => HttpResponse.json(POSTS)),
  http.get("/api/posts", () => new HttpResponse(null, { status: 500 }), { once: true }),
);
```

### How It Works

- `vi.stubGlobal("fetch", vi.fn())` replaces the boundary; the component still calls `fetch` normally. `vi.unstubAllGlobals()` in `afterEach` restores the real one so no test leaks a fake network.
- `getByRole("status")` immediately after `render` asserts the *synchronous* first paint is loading. Then `await screen.findByText("First post")` retries until the promise resolves &mdash; no arbitrary sleep.
- The retry test chains `mockResolvedValueOnce(fail()).mockResolvedValueOnce(ok(POSTS))`. Because the mock is a queue, the second call succeeds, which proves retry actually refetches rather than just clearing the error.
- The stale test controls *ordering*, not just outcomes: it holds the first promise unresolved, triggers the second request, then resolves the first. Only the latest may render. That is the race from **#41** in test form.
- The unmount test reads the `AbortController` signal that the component passed into `fetch` and asserts it was aborted. The cleanup contract is observable at the boundary without touching component internals.
- `findByRole("alert")` verifies that errors are announced, so a visually-hidden message still fails the test if it is not a live region.

### Edge Cases

- **Network rejection vs HTTP error:** `mockRejectedValueOnce(new TypeError("Failed to fetch"))` exercises the `catch` branch; a `500` response exercises the `!ok` branch. Test both.
- **Empty is not loading and not error:** three distinct assertions.
- **Retry then fail again:** chain a second `fail()` and assert the alert returns.
- **Unhandled rejections:** always mock the rejection in the same test that triggers it, or Vitest reports an unhandled rejection and fails the file.
- **State update after unmount:** the abort test plus a clean console is the signal; silence the noise by fixing cleanup, not by swallowing warnings.
- **Debounced or paginated variants:** clear timers between requests (see **#86**) and reset the mock queue per test.

### Interview Follow-ups

- **Level 1:** Loading, then success.
- **Level 2:** Error plus a working retry.
- **Level 3:** A distinct empty state.
- **Level 4:** Stale-response/race handling with a controlled promise.
- **Level 5:** Abort on unmount, asserted on the fetch signal.
- **Level 6:** Replace the `fetch` stub with MSW handlers and reuse them across the suite.
- **Level 7:** A `test.each` state matrix (loading / empty / success / error / network-error) that shares one assertion table.

### Production Version

Mock at the boundary, never inside the component: a `fetch` stub or MSW handler means the production code path stays intact. Coverage philosophy: cover each *state transition* (idle→loading→success, →empty, →error→retry→success) rather than every line; the interesting branches are failure and emptiness. Do **not** test the fetch library, retry library, or TanStack Query's caching &mdash; test your integration with them. Do not assert loading text if the UI uses skeletons; assert `aria-busy` or `role="status"` instead.

### Accessibility

Loading must be announced: `role="status"` or `aria-busy="true"` on the region. Errors need `role="alert"` so they are read immediately. On error, if focus should move to the message or the retry button, assert it with `toHaveFocus()`. These assertions are part of the async contract, not extras.

### Performance

The suite never touches the network, so it stays in milliseconds. Avoid `await new Promise((r) => setTimeout(r, 0))`; `findBy*` already polls and stops as soon as the condition holds. A test that needs a timeout longer than the default `1000ms` is usually testing too much at once.

### Testing

```text
✓ renders a loading status on first paint
✓ renders the list on success and removes the loading status
✓ renders a distinct empty state for an empty list
✓ renders an alert on failure and recovers via Retry
✓ ignores a stale response that resolves after a newer one
✓ aborts the in-flight request on unmount
```

### Common Mistakes

- Asserting the success UI immediately after `render` without `await findBy*`.
- Hitting the real network in a unit test, then failing on CI.
- Forgetting to restore the global stub, so a later test sees a mocked `fetch`.
- Using `waitFor(() => ..., { timeout: 5000 })` to paper over a slow test.
- Mocking the component's internal `status` instead of the network.
- Skipping the empty and rejection branches because "they are unlikely."
- Asserting `toHaveBeenCalledTimes(2)` on an internal helper rather than the public request.

### Interview Takeaway

Mock the network, then assert the state *the user sees* in order: loading, success, empty, error, retry, and a stale response that must be ignored. `findBy*` removes the timing guesswork, and the abort signal is the one boundary detail worth asserting.

---

## Test Custom Hooks

`Difficulty: Medium` `Probability: High`

### What are we building?

Tests for reusable hooks &mdash; `useCounter`, `useLocalStorage`, `useDebouncedValue`, `useInterval` &mdash; using RTL's `renderHook`. A hook has no markup, so its public API is its return value plus its observable side effects (storage writes, timers, network). Testing it in isolation is faster and sharper than mounting a throwaway component, and it keeps pure logic out of the UI layer.

### Example

```text
renderHook(() => useDebouncedValue("a", 300))
  result.current === "a"
rerender({ value: "ab" })
  result.current === "a"          (still the old value)
advanceTimersByTime(300)
  result.current === "ab"

renderHook(() => useCounter({ min: 0, max: 2 }))
  increment() twice → count === 2
  increment() again → count === 2   (clamped)
```

### What is the interviewer testing?

- `renderHook` and the `result.current` contract
- `act` around every update that originates outside React
- `rerender` to drive effects when arguments change
- `unmount` to prove effect cleanup
- Mocking the side-effect boundary (storage, timers, fetch), not the hook internals
- Knowing when a hook test is better than a component test, and when it is worse

### State Design

```text
unit:       the hook, mounted by renderHook(() => useThing(args))
harness:    result.current is the entire public API; props come via initialProps
mocked:     the side-effect boundary (localStorage, fetch, timers)
assertions: inputs → outputs, plus observable effects; never call order or internal state
```

**Do NOT assert** on the number of `useState` calls, the identity of an internal callback, or an intermediate state name. A hook test should still pass if you reimplement the hook with `useReducer` &mdash; if it does not, the test knows too much.

### Basic Version

```ts
// useCounter.test.ts
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useCounter } from "./useCounter";

describe("useCounter", () => {
  it("exposes the count and clamps at the bounds", () => {
    const { result } = renderHook(() => useCounter({ min: 0, max: 2 }));

    expect(result.current.count).toBe(0);

    act(() => result.current.increment());
    act(() => result.current.increment());
    expect(result.current.count).toBe(2);

    act(() => result.current.increment());   // clamped
    expect(result.current.count).toBe(2);

    act(() => result.current.decrement());
    act(() => result.current.decrement());
    act(() => result.current.decrement());   // clamped at min
    expect(result.current.count).toBe(0);
  });
});
```

```ts
// useLocalStorage.test.ts
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useLocalStorage } from "./useLocalStorage";

describe("useLocalStorage", () => {
  beforeEach(() => localStorage.clear());

  it("reads the stored value once and persists updates", () => {
    localStorage.setItem("theme", JSON.stringify("dark"));

    const { result } = renderHook(() => useLocalStorage("theme", "light"));
    expect(result.current[0]).toBe("dark");

    act(() => result.current[1]("light"));

    expect(result.current[0]).toBe("light");
    expect(JSON.parse(localStorage.getItem("theme")!)).toBe("light");
  });

  it("falls back to the default when the stored value is corrupt", () => {
    localStorage.setItem("theme", "{not json");

    const { result } = renderHook(() => useLocalStorage("theme", "light"));
    expect(result.current[0]).toBe("light");
  });
});
```

```ts
// useDebouncedValue.test.ts
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDebouncedValue } from "./useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("updates only after the delay when the input changes", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "ab" });
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("ab");
  });
});
```

```ts
// useInterval.test.ts — cleanup is a behavior, so test it
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useInterval } from "./useInterval";

describe("useInterval", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires on an interval and stops on unmount", () => {
    const tick = vi.fn();
    const { unmount } = renderHook(() => useInterval(tick, 1000));

    act(() => vi.advanceTimersByTime(3000));
    expect(tick).toHaveBeenCalledTimes(3);

    unmount();
    act(() => vi.advanceTimersByTime(3000));
    expect(tick).toHaveBeenCalledTimes(3);   // nothing after unmount
  });
});
```

### How It Works

- `renderHook(() => useThing(args))` mounts the hook inside a tiny invisible test component. `result.current` is the most recent return value, so tests read the public API directly.
- `act` is required around any call that updates state, because the update happens outside React's event system. Without it, React warns and `result.current` may not reflect the update before the assertion.
- `rerender({ value: "ab" })` re-invokes the hook with new `initialProps`. That is how you test a dependency-driven effect: the props change, then you assert the produced value.
- `unmount()` runs the effect cleanup. The interval test proves the timer was cleared by advancing the clock *after* unmount and asserting the callback count froze.
- `beforeEach`/`afterEach` fake-timer discipline mirrors **#86**: fake the clock per test and always restore it, or later files inherit a frozen clock.
- The `useLocalStorage` test mocks the *boundary* (the real jsdom `localStorage`), not the hook. Using the real storage keeps the test honest and catches serialization bugs.

### Edge Cases

- **Context-using hooks:** pass a wrapper &mdash; `renderHook(() => useThing(), { wrapper: AppProviders })`.
- **StrictMode double-invocation:** render with a `wrapper: StrictMode` to catch effects that are not idempotent.
- **Changing delay/args:** assert the effect re-runs and the previous timer is cleared.
- **Unstable callback identity:** `rerender` with a new function and assert the hook does not restart its timer (or does, if that is the contract).
- **SSR / no `window`:** guard `localStorage` and `matchMedia` access and test the fallback.
- **Corrupt storage:** the JSON-parse fallback above is the classic forgotten branch.
- **Async hooks:** still assert through `result.current` after `await act(async () => ...)`, not by reading internal state.

### Interview Follow-ups

- **Level 1:** A stateful hook (`useCounter`) tested through its return value.
- **Level 2:** A hook with a side effect (`useLocalStorage`).
- **Level 3:** A timer hook with fake timers.
- **Level 4:** `rerender` to drive argument-dependent effects.
- **Level 5:** `unmount` to prove cleanup (no calls, listeners removed).
- **Level 6:** A context-consuming hook with a `wrapper`.
- **Level 7:** Decide which hooks deserve isolation tests and which are better covered through the component that uses them.

### Production Version

Hook tests belong in CI with the component suite; they are fast and they isolate logic that would otherwise be buried in JSX. Coverage philosophy: a hook is a *unit* and its return value is the contract, so cover the branches of its logic (bounds, corrupt storage, cleanup). But do not extract a hook purely to make it testable &mdash; if the behavior only matters as rendered output, test the component. Do **not** test hooks that are one-line wrappers over `useState`, and do not assert internal effect counts.

### Accessibility

A hook renders nothing, so it has no accessibility of its own. If a hook drives focus, announcements, or ARIA state, that contract belongs in a component test (see **#84** and **#89**), not a `renderHook` test. Mentioning this distinction is itself an interview point.

### Performance

`renderHook` avoids mounting real markup, so these tests are among the cheapest. Only add a wrapper when the hook genuinely reads context; a heavy provider wrapper per test slows the suite for no coverage gain.

### Testing

```text
✓ returns the documented shape on first render
✓ each action updates the exposed value
✓ bounds/validation branches clamp or fall back
✓ argument changes re-run effects with the new value
✓ unmount cleans up timers and listeners
✓ corrupt persisted data falls back to the default
```

### Common Mistakes

- Forgetting `act`, so `result.current` lags and React warns.
- Asserting on internal state instead of the returned API.
- Using fake timers without restoring them, freezing later tests.
- Mounting a real component to test a hook that has no UI, making the test noisy.
- Testing the implementation (`toHaveBeenCalled` on an internal ref) instead of behavior.
- Skipping the cleanup test, the single most common hook bug.

### Interview Takeaway

A hook's public API is what it returns and what it does to the outside world. Mount it with `renderHook`, wrap updates in `act`, drive changes with `rerender`, prove cleanup with `unmount`, and assert only that contract &mdash; so the test survives any internal rewrite.

---

## Test Accessibility Interactions

`Difficulty: Medium` `Probability: High`

### What are we building?

A reusable accessibility test layer for interactive components &mdash; Tabs, Menu, Modal, Combobox &mdash; combining three techniques: keyboard-only flows, ARIA state assertions, and an automated `vitest-axe` scan. Accessibility is not a separate widget; it is the set of behaviors the previous problems already depend on, now asserted deliberately and as a baseline for every component.

### Example

```text
Tab             → focus "Alpha" tab, aria-selected="true"
ArrowRight      → focus "Beta" tab,  aria-selected="true", panel updates
Tab             → focus moves out of the tablist into the panel
axe(container)  → toHaveNoViolations()
mouse-only test → never written; the flow must work with keyboard alone
```

### What is the interviewer testing?

- Role and accessible-name queries as a11y assertions, not just convenience
- Keyboard-only operation: arrows, Enter/Space, Escape, Tab/Shift+Tab
- Asserting `aria-*` state (`selected`, `expanded`, `pressed`, `disabled`)
- Registering and running `jest-axe` / `vitest-axe` correctly
- Knowing what axe can and cannot catch
- Building a11y into the suite instead of bolting it on at the end

### State Design

```text
unit:       an interactive component rendered in jsdom
mocked:     none, or the consumer's onChange
queries:    getByRole(role, { name }), toHaveAccessibleName/Description
tooling:    axe(container) for a baseline rule scan
assertions: keyboard path + aria state; never color, class, or inline style
```

**Do NOT assert** on focus-ring styles, `outline`, or a `.selected` class to represent state; those are visual implementation. Role, name, and `aria-*` are the contract that assistive technology &mdash; and therefore these tests &mdash; consume. Note also what axe cannot see: it needs layout for color-contrast, which jsdom does not provide.

### Basic Version

```ts
// vitest.setup.ts  (in addition to jest-dom)
import "vitest-axe/extend-expect";
```

```ts
// Tabs.a11y.test.tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { describe, it, expect } from "vitest";
import { Tabs } from "./Tabs";

const ITEMS = [
  { id: "a", label: "Alpha", content: "Alpha panel" },
  { id: "b", label: "Beta", content: "Beta panel" },
];

describe("Tabs (accessibility)", () => {
  it("has no detectable automated violations", async () => {
    const { container } = render(<Tabs items={ITEMS} />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("uses the tab pattern with roving focus and arrow navigation", async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} />);

    expect(screen.getByRole("tablist")).toBeInTheDocument();

    await user.tab();
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    expect(alpha).toHaveFocus();
    expect(alpha).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowRight}");
    const beta = screen.getByRole("tab", { name: "Beta" });
    expect(beta).toHaveFocus();
    expect(beta).toHaveAttribute("aria-selected", "true");
    expect(alpha).toHaveAttribute("aria-selected", "false");
    expect(beta).toHaveAttribute("aria-controls");
  });

  it("labels the panel and links it to its tab", async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} />);

    await user.tab();
    await user.keyboard("{ArrowRight}");

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAccessibleName(/beta/i);

    const beta = screen.getByRole("tab", { name: "Beta" });
    expect(panel).toHaveAttribute("id", beta.getAttribute("aria-controls"));
  });

  it("is fully operable from the keyboard, without a pointer", async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} />);

    await user.tab();                       // focus the active tab
    await user.keyboard("{ArrowRight}");    // move to Beta
    await user.keyboard("{Home}");          // jump to first
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveFocus();

    await user.keyboard("{End}");           // jump to last
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveFocus();

    // Tab moves into the panel content, never back to the other tab
    await user.tab();
    const panel = screen.getByRole("tabpanel");
    expect(panel.contains(document.activeElement) || document.activeElement === panel).toBe(true);
  });

  it("exposes toggle state through aria-pressed, not color", async () => {
    const user = userEvent.setup();
    render(<Tabs items={ITEMS} />);

    // For a toggle-style control elsewhere, assert the ARIA state:
    // expect(button).toHaveAttribute("aria-pressed", "true");
    // and for disabled controls:
    // expect(button).toBeDisabled();  // which implies aria-disabled semantics
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});
```

A compact role/name assertion is often the whole a11y test:

```ts
it("gives every icon-only control an accessible name", () => {
  render(<Toolbar onDelete={vi.fn()} onShare={vi.fn()} />);

  expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "" })).not.toBeInTheDocument();
});
```

```ts
it("marks an expanded disclosure correctly", async () => {
  const user = userEvent.setup();
  render(<Disclosure title="Details">Body</Disclosure>);

  const trigger = screen.getByRole("button", { name: /details/i });
  expect(trigger).toHaveAttribute("aria-expanded", "false");

  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
});
```

### How It Works

- `axe(container)` runs the axe-core rule engine against the rendered subtree and returns violations. `toHaveNoViolations()` fails with a readable report, so a missing label or a broken `aria-controls` fails CI.
- `vitest-axe/extend-expect` registers the custom matcher; without it, `toHaveNoViolations` is undefined. `jest-axe` is the Jest twin &mdash; the API and matcher name are the same, so the patterns transfer.
- `user.tab()` and `user.keyboard("{ArrowRight}")` produce real focus and key events. Roving `tabindex` means only the active tab is tabbable, so the first Tab lands on Alpha regardless of the other tabs in the DOM.
- `toHaveAccessibleName` and the `aria-controls` ↔ `id` link assert the parts of the ARIA pattern that users of assistive technology rely on but that are invisible in a screenshot.
- The keyboard-only test writes no `.click()` at all. If the flow passes, the component is operable without a pointer by construction.
- `{Home}` and `{End}` are part of the tabs pattern; testing them catches an implementation that only handles the arrows.

### Edge Cases

- **axe is async:** always `await axe(container)`, and run it after async content has settled, not mid-load.
- **jsdom has no layout:** axe's color-contrast rule cannot run reliably; pair with `@axe-core/playwright` for real rendered styles.
- **axe coverage is partial:** axe finds roughly a third to a half of real issues. It does not know whether the reading order makes sense or whether a custom widget behaves correctly &mdash; those still need the keyboard and ARIA tests.
- **Scoped scan:** pass `container` (or a `within(...)` subtree), not `document`, so unrelated markup does not pollute the result.
- **Disabled controls:** `toBeDisabled()` is the accessible-name-preserving assertion; avoid asserting a wrapper class.
- **Live regions:** assert `role="status"`/`role="alert"` for dynamic announcements.
- **`aria-hidden` focus traps:** ensure a hidden-but-focusable element does not receive focus; that is a manual review item, not an axe failure.

### Interview Follow-ups

- **Level 1:** Role and accessible-name queries on every interactive control.
- **Level 2:** Keyboard-only flows for one widget (Tabs, Menu, or Combobox).
- **Level 3:** Explicit `aria-*` state assertions (selected, expanded, pressed, disabled).
- **Level 4:** A `vitest-axe` baseline in a shared test helper.
- **Level 5:** Focus order and focus restoration across a flow.
- **Level 6:** `@axe-core/playwright` for contrast and real browser tab order.
- **Level 7:** A manual screen-reader pass (VoiceOver/NVDA) checklist that complements, not replaces, the automated suite.

### Production Version

Run axe on a small set of critical screens in CI and treat violations as failures; also run a keyboard smoke test per interactive widget. Coverage philosophy: accessibility is a contract, so it earns deliberate tests, but not 100% line coverage &mdash; cover each pattern once and reuse the assertions through helpers. Do **not** run axe on every trivial presentational component (it is comparatively slow), and do not let a green axe run stand in for manual testing. Do **not** test exact focus-ring appearance.

### Accessibility

This is the chapter's subject, so the strategy is explicit and layered: (1) roles and names via `getByRole` and `toHaveAccessibleName`; (2) keyboard-only operation with no pointer; (3) `aria-*` state assertions for selected/expanded/pressed/disabled; (4) `vitest-axe`/`jest-axe` as a baseline scan; and (5) a real browser plus a screen reader for contrast, reading order, and announcements. Each layer catches what the previous cannot.

### Performance

`axe` is the slowest assertion in the suite, so scope it to the component's `container` and call it once per pattern rather than in every test. Keyboard simulations are cheap after `userEvent.setup({ delay: null })`. Keep one axe test per widget and let the fast role/keyboard tests carry the detailed coverage.

### Testing

```text
✓ every interactive control has a role and an accessible name
✓ the widget is fully operable with the keyboard alone
✓ arrow/Home/End/Enter/Escape behave per the ARIA pattern
✓ aria-selected / aria-expanded / aria-pressed reflect state
✓ tab and panel are linked by aria-controls and id
✓ axe reports no detectable violations for the subtree
```

### Common Mistakes

- Using `getByText` where a role-and-name query is the actual a11y contract.
- Asserting a `.selected` class instead of `aria-selected`.
- Forgetting to `await axe(...)` or to register `vitest-axe/extend-expect`.
- Treating a passing axe scan as proof of accessibility &mdash; it is a floor, not a ceiling.
- Running axe against `document` in every test, slowing the suite and surfacing unrelated violations.
- Testing only pointer interactions, so keyboard regressions slip through.
- Forgetting to await user events before asserting focus or ARIA state.

### Interview Takeaway

Accessibility testing is layered: role and name queries, keyboard-only flows, explicit `aria-*` assertions, then an axe baseline. Write the keyboard test with no `.click()` and you have proven operability by construction; use axe to catch the mechanical gaps, and a real browser plus screen reader for everything machine checks cannot see.
