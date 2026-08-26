# Component Design in React

## 1. Why This Exists — The Problem First

Component design is the work of choosing a boundary: what a component owns, what it accepts, what it guarantees, and what it leaves to its caller. The difficult part is not splitting JSX into more files. It is deciding where a behavior should live so the next feature can change without breaking unrelated screens.

Imagine a checkout page. The page owns order data and the submit workflow. PaymentForm owns fields and validation display. A shared TextField owns label wiring, focus styling, and error semantics. If TextField starts fetching payment methods, it has crossed a boundary: a low-level visual component now knows a product workflow.

Poor boundaries create familiar symptoms:

- A shared component accumulates isCheckout, showIcon, isCompact, hasFooter, and onTrackClick props.
- A page reaches into a child’s internal state because the child has no clear contract.
- Two components implement slightly different keyboard and error behavior.
- A “reusable” component is coupled to a router, store, or API client and cannot render in isolation.
- A tiny similarity is abstracted before the product requirement has stabilized.

The goal is not maximum reuse. The goal is a boundary that makes ownership obvious, gives consumers meaningful extension points, preserves accessibility, and remains easy to test.

~~~mermaid
flowchart LR
  Page["Page: route and data"] --> Feature["Feature: workflow"]
  Feature --> Shared["Shared component: UI contract"]
  Shared --> Native["DOM: semantics and browser behavior"]
  Shared -. callbacks and slots .-> Feature
~~~

## 2. The Analogy — Make It Obvious

Think of a component boundary as a restaurant kitchen pass. The dining room decides what the customer ordered and when the meal is complete. The kitchen owns the recipe and preparation. The pass has a stable contract: a ticket arrives in a known shape, the finished plate leaves in a known shape, and the server does not need to know every internal cooking step.

In React:

- The page or feature is the dining room: it owns product context, route data, and workflow decisions.
- A component is the kitchen: it owns one coherent piece of presentation or interaction.
- Props are the order ticket: they describe intent and data, not private implementation details.
- children and named slots are the plating surface: the caller supplies content without the component predicting every variation.
- Callbacks are the return ticket: the component reports events; the owner decides what those events mean.
- Accessibility is part of the plate: the component preserves semantic roles, labels, focus, and keyboard behavior wherever it owns them.

A configuration-heavy component is like a kitchen that accepts 25 flags instead of a meaningful order. Composition is usually better because the caller can arrange the parts directly. A compound component can coordinate shared behavior while exposing a flexible surface such as Tabs.Item, Tabs.Trigger, and Tabs.Panel.

The analogy has a useful limit: a component is not a black box at any cost. Its contract must document controlled state, default state, event timing, keyboard behavior, and guaranteed semantics. Hiding implementation must never mean hiding behavior consumers need to reason about.

## 3. How It Actually Works — The Full Explanation

**Start with ownership.** Put state at the lowest common owner of every consumer that needs to read or change it. A field’s draft can stay inside the field. A selected tab needed by a URL-syncing page belongs higher up. A modal can own open state until a parent needs to open it elsewhere. Lifting state past its true owner creates unnecessary wiring and re-renders.

**Separate responsibility from appearance.** A shared component may own visual variants, native attributes, and interaction guarantees. It should not own a domain fetch, route transition, or hardcoded analytics event. Pass data in and report events out. Feature components translate a domain event into a mutation or navigation.

**Design props as a small language.** Good props express intent: value, onValueChange, disabled, variant, children, and aria-label. Avoid implementation details such as setInternalIndex or shouldUseTheOldLayout. Prefer one finite variant such as neutral or danger over conflicting booleans. Forward supported native attributes so callers do not need a new wrapper prop for every id, name, data attribute, or ARIA attribute.

**Choose composition over configuration when structure varies.** Configuration works for a small, stable set of choices. It becomes prop explosion when consumers need to reorder content, inject custom markup, or combine optional parts. children, named slots, and compound subcomponents let the caller own structure while the component owns coordination.

**Understand controlled and uncontrolled contracts.** A controlled component receives its current value and an event that requests a change. It renders from the prop and does not maintain a competing source of truth. An uncontrolled component receives defaultValue and owns subsequent changes internally. A reusable component can support both, but the contract must be explicit:

~~~tsx
import * as React from "react";

function useControllableValue({
  value,
  defaultValue = "",
  onValueChange,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const isControlled = value !== undefined;
  const currentValue = value ?? internalValue;

  const setValue = (nextValue: string) => {
    if (!isControlled) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };

  return [currentValue, setValue] as const;
}
~~~

defaultValue is an initial value, not a live value. Changing it after mount does not reset an uncontrolled component. For reset behavior, expose a deliberate API or remount with a new key. Do not switch modes during the component’s lifetime without documenting the behavior.

The Tabs API makes that distinction visible in its type: controlled usage supplies value and does not require defaultValue; uncontrolled usage may supply defaultValue and falls back to an empty string when it does not. That fallback is only a safe initial value, not a claim that an empty tab is valid.

**Use compound components when parts share a protocol.** Tabs, menus, dialogs, and accordions have related pieces that need shared state and IDs. A root can provide a narrow context; subcomponents consume only the protocol they need. Context removes prop drilling, but it does not make arbitrary children valid. Validate misuse with a clear error and test required parent-child relationships.

**Treat render props and function children as inversion of control.** A render prop lets a component own behavior while the caller owns markup:

~~~tsx
import * as React from "react";

function AsyncBoundary<T>({
  state,
  children,
}: {
  state:
    | { status: "pending" }
    | { status: "error"; message: string }
    | { status: "success"; data: T };
  children: (data: T) => React.ReactNode;
}) {
  if (state.status === "pending") return <p>Loading…</p>;
  if (state.status === "error") return <p role="alert">{state.message}</p>;
  return <>{children(state.data)}</>;
}
~~~

This is useful when behavior is stable but the visual result varies. It can be harder to read, type, and memoize than ordinary composition. Use it when it removes a real duplication seam. Hooks are often simpler when no wrapper or coordinated markup is needed.

**Make accessibility part of the responsibility.** A component rendering a button must use a button, expose disabled state, preserve an accessible name, and keep visible focus. A tabs component must associate triggers and panels with stable IDs, expose selection state, and define keyboard behavior. Do not add ARIA to compensate for choosing the wrong native element. If a consumer supplies a custom child through a slot, document the semantics, event, and ref contract that child must satisfy.

**Design for testing seams.** A good boundary lets a test render plain props and assert user-visible behavior. Test that a controlled value renders, a click requests the next value, disabled controls do not activate, labels connect to inputs, and invalid compound usage fails clearly. Keep APIs, routing, and domain transformations outside shared UI so those concerns can be tested at feature boundaries.

**Delay abstraction until the concept is stable.** Extract when repeated behavior has the same responsibility, accessibility contract, change cadence, and consumer vocabulary. A local component is often correct when it serves one feature, encodes domain language, or is likely to diverge. Shared placement is an ownership decision, not a reward for copying JSX twice.

## 4. Real Code — See It Working

This small controlled/uncontrolled tabs implementation demonstrates one owner for selection, a compound API for structure, native buttons for keyboard-friendly activation, and explicit trigger/panel relationships. It intentionally uses no effects because it does not synchronize with an external system.

~~~tsx
import * as React from "react";

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
  name: string;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);
const TabItemContext = React.createContext<string | null>(null);

function useTabs() {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("Tabs parts must be inside Tabs");
  return context;
}

function useTabItem() {
  const item = React.useContext(TabItemContext);
  if (item === null) throw new Error("Tabs parts need a Tabs.Item");
  return item;
}

type TabsProps = {
  children: React.ReactNode;
  onValueChange?: (value: string) => void;
} & (
  | { value: string; defaultValue?: never }
  | { value?: undefined; defaultValue?: string }
);

type TabsComponent = React.FC<TabsProps> & {
  Item: typeof Item;
  Trigger: typeof Trigger;
  Panel: typeof Panel;
};

function TabsRoot({ children, value, defaultValue, onValueChange }: TabsProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const currentValue = value ?? internalValue;
  const name = React.useId();

  const setValue = (nextValue: string) => {
    if (!isControlled) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };

  return (
    <TabsContext.Provider value={{ value: currentValue, setValue, name }}>
      <div>{children}</div>
    </TabsContext.Provider>
  );
}

function Item({ value, children }: { value: string; children: React.ReactNode }) {
  return <TabItemContext.Provider value={value}>{children}</TabItemContext.Provider>;
}

function Trigger({ children }: { children: React.ReactNode }) {
  const { value, setValue, name } = useTabs();
  const itemValue = useTabItem();
  const selected = value === itemValue;
  const triggerId = name + "-trigger-" + itemValue;
  const panelId = name + "-panel-" + itemValue;

  return (
    <button
      id={triggerId}
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      onClick={() => setValue(itemValue)}
    >
      {children}
    </button>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  const { value, name } = useTabs();
  const itemValue = useTabItem();
  if (value !== itemValue) return null;

  const triggerId = name + "-trigger-" + itemValue;
  const panelId = name + "-panel-" + itemValue;
  return (
    <div id={panelId} role="tabpanel" aria-labelledby={triggerId} tabIndex={0}>
      {children}
    </div>
  );
}

const Tabs: TabsComponent = Object.assign(TabsRoot, {
  Item,
  Trigger,
  Panel,
});

export function AccountTabs() {
  return (
    <Tabs defaultValue="profile">
      <div role="tablist" aria-label="Account">
        <Tabs.Item value="profile"><Tabs.Trigger>Profile</Tabs.Trigger></Tabs.Item>
        <Tabs.Item value="billing"><Tabs.Trigger>Billing</Tabs.Trigger></Tabs.Item>
      </div>
      <Tabs.Item value="profile"><Tabs.Panel>Profile details</Tabs.Panel></Tabs.Item>
      <Tabs.Item value="billing"><Tabs.Panel>Billing details</Tabs.Panel></Tabs.Item>
    </Tabs>
  );
}
~~~

The root owns the selection contract. The consumer owns content and ordering. The primitive owns IDs and relationships. A full tabs primitive must also define arrow-key roving focus, Home/End behavior, orientation, and activation mode; do not claim accessibility merely because role tab is present.

Here is the same boundary in a feature. The shared button reports an event; the feature decides what it means:

~~~tsx
import * as React from "react";

type ButtonProps = React.ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "danger";
};

function ActionButton({ variant = "primary", className, ...props }: ButtonProps) {
  return <button className={"button button-" + variant + " " + (className ?? "")} {...props} />;
}

type DeleteProjectRequest = (projectId: string) => Promise<void>;

function DeleteProject({
  projectId,
  onDeleted,
  deleteProject,
}: {
  projectId: string;
  onDeleted: () => void;
  deleteProject: DeleteProjectRequest;
}) {
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteProject(projectId);
      onDeleted();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ActionButton type="button" variant="danger" disabled={isDeleting} onClick={handleDelete}>
      {isDeleting ? "Deleting…" : "Delete project"}
    </ActionButton>
  );
}

const deleteProjectStub: DeleteProjectRequest = async () => {};

export function ProjectActions({ projectId, onDeleted }: { projectId: string; onDeleted: () => void }) {
  return (
    <DeleteProject
      projectId={projectId}
      onDeleted={onDeleted}
      deleteProject={deleteProjectStub}
    />
  );
}
~~~

ActionButton is reusable because it knows presentation and native button behavior, not what deletion means. DeleteProject is feature-local because it owns a project mutation and product-specific success action. The typed request is injected, so a production caller can replace deleteProjectStub with its real feature service without coupling the shared button to that service.

## 5. The Interview Questions — All of Them, Done Properly

**How do you decide what a component should own?** Start from responsibility and consumers. Own state and behavior required by the UI contract. Put route data, domain mutations, and workflow decisions in the feature or page that gives them meaning. If siblings need a value, lift it to their lowest common owner.

**Composition versus configuration: when do you choose each?** Configuration suits a small, stable set of semantic options such as size or variant. Composition is better when structure, ordering, or content varies. Ten boolean props usually mean the component is predicting consumers’ markup. children, named slots, or compound parts express that variation directly.

**What makes a component controlled or uncontrolled?** A controlled component renders from a parent-owned value and requests changes through a callback. An uncontrolled component initializes internal state from defaultValue and owns it afterward. Supporting both is useful, but the component must not maintain two truths, and mode changes must be documented.

**When are compound components useful?** Use them when several parts form one widget and need shared state or IDs. A root owns context; named children render their portions. They provide readable composition and layout freedom, at the cost of more API surface, context coupling, and nesting rules.

**What is a higher-order component, and when does it help?** A higher-order component is a function that accepts a component and returns a component with added behavior or props. It can help when the same cross-cutting concern must wrap many components, especially in legacy class-component or third-party integrations. Its costs are wrapper nesting, prop collisions, ref and static-property handling, and less direct data flow. For new code, composition, hooks, and context usually make the dependency clearer; use a higher-order component when its wrapper contract is genuinely the best integration seam.

**What is the provider pattern?** A provider places a value or service at the top of a subtree so descendants can consume it without threading props through every intermediate component. It helps with scoped concerns such as theme, locale, authentication, or the shared state of a compound widget. The trade-offs are implicit dependencies, provider nesting, and broad re-renders when an unstable value changes. A custom hook should expose the context contract and fail clearly outside its provider; context is a delivery mechanism, not automatically a global state solution.

**What is the state reducer pattern?** A reusable component owns its normal state transitions but accepts a reducer supplied by the consumer, often called with the current state and an action, so the consumer can override or extend those transitions. It helps when a widget needs an escape hatch for product-specific rules without exposing every internal setter. The trade-offs are a more complex API, coupling consumers to action shapes, and harder reasoning about the final state. A hook or ordinary useReducer is usually simpler when the logic is owned by one feature; use the state reducer pattern when a stable reusable state machine needs controlled customization.

**What are render props or children-as-function good for?** They expose behavior while letting the caller render the result. This helps when consumers share a state machine but intentionally need different markup. Trade-offs include nested syntax, more complex types, function identity concerns, and reduced readability compared with a hook or ordinary children.

**When would you use a reusable component, hook, or local component?** Use a component when markup, interaction, or accessibility is shared. Use a hook when only stateful logic is shared. Keep it local when it represents one feature’s vocabulary or requirements are changing. Reuse should follow a stable concept, not just duplicated lines.

**How do you prevent prop explosion?** Remove domain decisions from shared UI, replace conflicting booleans with a union or variant, forward native attributes, and use composition for variable structure. Many unrelated props are evidence to split responsibilities.

**Where should accessibility behavior live?** The component that owns interaction should own its semantic element, labels, relationships, focus behavior, and keyboard contract. Consumers can supply content and styling without removing guarantees. Test roles, accessible names, keyboard interactions, and state attributes.

**How do you test a component boundary?** Render through the public API and exercise user actions. Assert controlled values, callback payloads, uncontrolled changes, disabled behavior, labels, IDs, and invalid compound nesting. Test feature data and mutations at the feature seam, not through private component state.

**When is duplication better than abstraction?** When similarities are accidental, requirements may diverge, or an abstraction needs many escape hatches. Two local implementations can be cheaper than one confusing shared API. Extract after observing a stable responsibility and shared reason to change.

**What is a headless component?** It supplies behavior, state, and accessibility semantics while leaving visual presentation to the consumer. It can support multiple layouts or brands, but still needs precise contracts for slots, refs, IDs, keyboard behavior, and controlled state.

## 6. The Traps — What Goes Wrong

- **The god component:** A Card or Button imports analytics, routing, API clients, and product stores. Keep shared UI domain-agnostic.
- **Boolean multiplication:** isPrimary, isDanger, and isGhost allow contradictions. Use one discriminated variant.
- **The wrapper maze:** Extra wrappers break CSS, semantics, or form behavior. Keep the DOM contract intentional.
- **Controlled/uncontrolled drift:** Internal state changes while a value prop exists, or a component changes modes after mount. Keep one source of truth.
- **defaultValue synchronization:** An uncontrolled default is initialization, not a live prop. Expose deliberate reset behavior.
- **ARIA as decoration:** role tab without IDs, selection state, focus rules, and keyboard behavior is not an accessible tabs widget.
- **Render-prop overuse:** A function child is added where ordinary children or a hook would be clearer.
- **Global by default:** A feature-local component is put in shared because it might be useful someday. Let stable repeated use earn a shared home.
- **Premature extraction:** The first implementation encodes assumptions no consumer has validated. Extract the smallest stable primitive.
- **Testing internals:** Tests call private setters or snapshot giant trees. Assert public behavior and accessibility.
- **Native prop loss:** A wrapper drops ref, type, name, or ARIA attributes. Define and preserve the root element contract.
- **Loading without semantics:** A button changes text but does not communicate busy state or preserve a useful accessible name. Decide the complete loading contract.

## 7. Compare With Related Concepts

| Concept | Primary responsibility | Boundary question |
| --- | --- | --- |
| Page component | Route-level data, layout, and workflow | What does this screen own? |
| Feature component | Domain behavior and user flow | What business decision does this interaction make? |
| Shared UI component | Stable presentation and interaction contract | Can it render without a product store or API? |
| Hook | Reusable stateful logic without required markup | Is behavior shared while UI differs? |
| Compound component | Coordinated parts of one widget | Do these parts share state, IDs, and rules? |
| Headless component | Behavior and accessibility with flexible presentation | Which semantics must consumers preserve? |
| Design system | Consistent tokens, primitives, and governance | Which contracts are organization-wide? |

Component design is related to folder structure, but it is not folder structure. A file in shared/ui can still have a poor boundary, and a feature-local component can be well designed. It is related to state management, but not all state belongs in a global store. It is related to design systems, but a design system is a larger collection of governed components and tokens. It is related to hooks, but a hook alone cannot provide markup or DOM accessibility semantics.

The practical comparison is ownership: pages know the route, features know the domain workflow, shared components know the stable UI contract, and hooks know reusable logic. Composition connects those layers without forcing one layer to impersonate another.

## 8. 🧠 The Memory Hook — What Sticks

Remember O-A-C-C:

- **O — Own one responsibility.** Put state where the people who need it can reach it, no higher.
- **A — Accept intent.** Design a small prop API, forward native attributes, and avoid implementation flags.
- **C — Compose variation.** Use children, slots, compound parts, or render props when structure belongs to the caller.
- **C — Commit to the contract.** Controlled state, accessibility, keyboard behavior, refs, and test seams are promises.

Before extracting a component, ask:

1. What does it own, and what must it never know?
2. Is the caller choosing data, behavior, or structure?
3. Is this value controlled, uncontrolled, or genuinely local?
4. Which semantic and keyboard guarantees does it make?
5. Can a test verify the boundary through user-visible behavior?
6. Is the concept stable enough to deserve a shared API?

The interview answer is not “make small components.” It is: **choose a stable ownership boundary, expose intent through a narrow contract, compose the variation, and make accessibility and testability part of the responsibility.**
