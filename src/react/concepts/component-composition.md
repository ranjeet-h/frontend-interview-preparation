# Component Composition Patterns in React

## 1. Why This Exists — The Problem First

Every frontend team eventually creates a "God Component." It usually starts innocently with a reusable modal, card, or dropdown:

```tsx
// Month 1: Simple and clean
<Modal title="Delete User" isOpen={isOpen} onClose={handleClose} onSubmit={handleDelete} />
```

Three months later, the product team wants a modal with an icon in the header. Next sprint, marketing needs a modal with a promotional banner at the top and no footer buttons. Then billing needs a modal with a two-column layout and a sticky terms-and-conditions drawer.

If you solve this by adding configuration props, your component quickly explodes into an unmaintainable monster:

```tsx
// Month 6: The Mega-Component Prop Explosion
<Modal
  title="Upgrade Plan"
  isOpen={isOpen}
  onClose={handleClose}
  hasIcon
  iconType="sparkles"
  showBanner
  bannerType="discount"
  customHeaderRight={<HelpButton />}
  hideDefaultFooter
  customFooter={<ThreeTierCheckoutButtons />}
  layoutVariant="two-column"
  isScrollableBody
  withDividers
  bodyClassName="p-8"
/>
```

Inside this `Modal`, you end up with twenty nested ternary operators, fragile boolean flags overriding one another, and brittle CSS selectors. Modifying the modal for billing breaks the checkout page. 

The alternative classical OOP developers reached for was class inheritance (`class SpecialBillingModal extends BaseModal`). But in UI development, class inheritance creates rigid hierarchies: base class changes ripple destructively down all subclasses, and you cannot combine behaviors (like a modal that is both draggable and animated) without running into the diamond inheritance problem.

React was built on a foundational philosophy: **Composition over Inheritance**. Instead of asking a single component to anticipate every possible visual layout through boolean flags or rigid class hierarchies, you build small, focused components that wrap around and slot inside one another.

---

## 2. The Analogy — Make It Obvious

Think of component composition as the difference between a **Pre-Packaged TV Dinner** and a **Bespoke Bento Box**.

A **Pre-Packaged TV Dinner** (the monolithic mega-component with boolean props) comes in a single molded aluminum tray from the factory. It has fixed compartments: one for mystery meat, one for mashed potatoes, one for corn, and one for a brownie. If you want double potatoes and no meat, or want to replace the corn with steamed broccoli, you cannot do it. You have to ask the factory to design a whole new SKU (`TVDinnerVariant_DoublePotato_NoMeat_Broccoli`). The container dictates and restricts the entire contents.

A **Bespoke Bento Box** (component composition) is an elegant box with modular dividers:

- **The Box itself** provides the outer structure, border, and backdrop (the layout wrapper like `<Modal>` or `<Card>`).
- **The Compartments** are the slots (`children`, `headerSlot`, `footerSlot`) that define *where* things go without caring *what* goes into them.
- **The Food Dishes** are the independent child components (`<Button>`, `<Avatar>`, `<Badge>`, `<Form>`) prepared separately.
- **The Table Manners & Chopsticks** represent shared behavior via React Context (the Compound Component pattern), where dishes inside the same box coordinate state without the consumer having to wire wires between every individual piece.

If you want sushi today and tempura tomorrow, you never rebuild the bento box. You just place different dishes into its compartments.

---

## 3. How It Actually Works — The Full Explanation

In React, components are plain JavaScript functions that accept props and return React elements. A React element is not actual DOM; it is a lightweight JavaScript object descriptor (e.g., `{ type: 'div', props: { children: 'Hello' } }`). 

Because React elements are plain JavaScript objects, they can be passed as arguments, assigned to variables, returned from functions, and nested inside other elements without any special framework magic.

There are five core patterns of component composition in modern React:

**1. Containment (`children` and Named Element Slots)**
Some components do not know their children ahead of time (e.g., `Sidebar`, `Dialog`, `Card`). They use the special `children` prop to pass whatever is nested between their opening and closing JSX tags directly into their output.

When you need multiple independent insertion zones, you use named slots. In React, a slot is simply a prop that accepts a `ReactNode` or `ReactElement`:

```tsx
function Layout({ sidebar, header, children }: LayoutProps) {
  return (
    <div className="layout">
      <aside>{sidebar}</aside>
      <main>
        <header>{header}</header>
        <section>{children}</section>
      </main>
    </div>
  );
}
```

*The Critical Performance Invariant of Containment:*
When a parent renders JSX and passes it as `children` to a wrapper component, that child JSX is evaluated in the *parent's* render scope. If the wrapper component re-renders due to its own internal state (e.g., an expand/collapse toggle or a hover animation), the `children` element object reference remains identical across renders. React recognizes that the element reference hasn't changed and skips re-rendering that child subtree. Containment is one of React's most powerful built-in performance optimization techniques.

**2. Specialization (Configuring Generics into Specific Variants)**
Instead of using inheritance to make a "subclass" of a component, we use specialization: a specific component renders a generic one and configures it with distinct props or children.

```tsx
// Generic Base Component
function Dialog({ title, children }: DialogProps) {
  return (
    <div className="dialog-box">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

// Specialized Variant
function WelcomeDialog() {
  return (
    <Dialog title="Welcome to the Platform">
      <p>Thank you for signing up. Let's get your profile set up.</p>
    </Dialog>
  );
}
```

This establishes a "has-a" relationship instead of an "is-a" relationship, keeping the codebase flexible and easy to refactor.

**3. Compound Components (Implicit State Sharing with Context)**
Compound components are sets of components that work together to accomplish a single UI task while sharing state behind the scenes (like `<select>` and `<option>` in native HTML, or `<Tabs>` and `<Tab>` in UI libraries).

Instead of passing explicit state props to every single child, the parent container exposes a React Context. The subcomponents consume that context directly to read active state and trigger state changes. 

This inverts control back to the consumer. The consumer can rearrange tabs, insert custom icons, or wrap tab panels in arbitrary divs for layout without breaking the underlying tab switching logic.

**4. Render Props (Delegating Render Logic via Functions)**
A render prop is a prop whose value is a function that returns a React element. The component manages stateful behavior or calculations (such as mouse coordinates, virtualization windows, or list filtering) and calls the function with that internal data, delegating the visual rendering back to the caller.

While custom hooks have largely replaced render props for sharing pure state logic, render props remain essential for *render delegation*—such as virtualized list renderers (`<VirtualList renderItem={(item) => <Row item={item} />} />`) where a parent component manages layout dimensions and DOM virtualization while letting the caller define the item's markup.

**5. Higher-Order Components (HOC) vs. Custom Hooks**
In older class-based React, logic composition was achieved through Higher-Order Components—functions that took a component and returned an enhanced component (`withAuth(UserProfile)`).

HOCs suffered from three major architectural flaws:
- Prop collisions (two HOCs injecting a prop with the same name).
- Wrapper hell in the React DevTools tree (10 layers of nesting).
- Type inference complexity in TypeScript.

Modern React uses Custom Hooks (`const { user } = useAuth()`) inside function components to compose logic flatly, while using component composition (`children` and Compound Components) to compose markup and structure.

---

## 4. Real Code — See It Working

Here are production-ready patterns illustrating containment, named slots, and compound components with TypeScript.

**Example 1: Containment with Named Slots and Render Optimization**

```tsx
import React, { useState } from 'react';

interface CollapsiblePanelProps {
  title: string;
  actionsSlot?: React.ReactNode;
  children: React.ReactNode;
}

// The wrapper manages its own toggle state without causing children to re-render
export function CollapsiblePanel({ title, actionsSlot, children }: CollapsiblePanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="border border-neutral-200 rounded-lg shadow-sm">
      <div className="flex items-center justify-between p-4 bg-neutral-50 border-b">
        <h3 className="font-semibold text-lg text-neutral-800">{title}</h3>
        <div className="flex items-center gap-2">
          {/* Named Slot: Injected header actions */}
          {actionsSlot}
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="text-sm px-2 py-1 bg-white border rounded hover:bg-neutral-100"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {/* Default Slot: Content passed through children */}
      {isExpanded && <div className="p-4">{children}</div>}
    </div>
  );
}

// Usage: Heavy chart does not recalculate/re-render when panel expands or collapses
export function DashboardView() {
  return (
    <CollapsiblePanel
      title="Revenue Analytics"
      actionsSlot={<button className="text-xs text-blue-600 font-medium">Export CSV</button>}
    >
      <p className="text-neutral-600">All data synced 5 minutes ago.</p>
    </CollapsiblePanel>
  );
}
```

**Example 2: Complete Compound Component Pattern with React Context**

Below is a complete, accessible, type-safe `<Accordion>` widget implementing compound components with static namespace exports.

```tsx
import React, { createContext, useContext, useState } from 'react';

// 1. Context definition for internal state sharing
interface AccordionContextType {
  openItemId: string | null;
  toggleItem: (id: string) => void;
}

const AccordionContext = createContext<AccordionContextType | undefined>(undefined);

function useAccordionContext() {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error('Accordion compound subcomponents must be rendered within an <Accordion>');
  }
  return context;
}

// 2. Parent Container Component
interface AccordionProps {
  defaultOpenId?: string;
  children: React.ReactNode;
}

export function Accordion({ defaultOpenId = null, children }: AccordionProps) {
  const [openItemId, setOpenItemId] = useState<string | null>(defaultOpenId);

  const toggleItem = (id: string) => {
    setOpenItemId((prev) => (prev === id ? null : id));
  };

  return (
    <AccordionContext.Provider value={{ openItemId, toggleItem }}>
      <div className="divide-y divide-neutral-200 border rounded-lg overflow-hidden">
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

// 3. Item Context & Subcomponent
interface AccordionItemProps {
  id: string;
  children: React.ReactNode;
}

const ItemContext = createContext<{ id: string } | undefined>(undefined);

function AccordionItem({ id, children }: AccordionItemProps) {
  return (
    <ItemContext.Provider value={{ id }}>
      <div className="group">{children}</div>
    </ItemContext.Provider>
  );
}

// 4. Trigger Subcomponent
function AccordionTrigger({ children }: { children: React.ReactNode }) {
  const { openItemId, toggleItem } = useAccordionContext();
  const item = useContext(ItemContext);

  if (!item) {
    throw new Error('<Accordion.Trigger> must be used within an <Accordion.Item>');
  }

  const isOpen = openItemId === item.id;

  return (
    <button
      type="button"
      onClick={() => toggleItem(item.id)}
      aria-expanded={isOpen}
      className="w-full flex justify-between items-center p-4 text-left font-medium text-neutral-800 hover:bg-neutral-50 transition-colors"
    >
      <span>{children}</span>
      <span className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
        ▼
      </span>
    </button>
  );
}

// 5. Content Subcomponent
function AccordionContent({ children }: { children: React.ReactNode }) {
  const { openItemId } = useAccordionContext();
  const item = useContext(ItemContext);

  if (!item) {
    throw new Error('<Accordion.Content> must be used within an <Accordion.Item>');
  }

  if (openItemId !== item.id) {
    return null;
  }

  return (
    <div className="p-4 bg-neutral-50 text-neutral-600 text-sm border-t border-neutral-100">
      {children}
    </div>
  );
}

// 6. Attach subcomponents for clean, namespaced dot-notation usage
Accordion.Item = AccordionItem;
Accordion.Trigger = AccordionTrigger;
Accordion.Content = AccordionContent;

// 7. Consumer Usage: Total layout flexibility without manual state wiring
export function FAQSection() {
  return (
    <Accordion defaultOpenId="q1">
      <Accordion.Item id="q1">
        <Accordion.Trigger>How does billing work?</Accordion.Trigger>
        <Accordion.Content>
          Subscriptions are billed monthly on the date you signed up.
        </Accordion.Content>
      </Accordion.Item>

      <Accordion.Item id="q2">
        <Accordion.Trigger>Can I cancel anytime?</Accordion.Trigger>
        <Accordion.Content>
          Yes, you can cancel directly from your account settings without penalties.
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is component composition in React, and why is it preferred over class inheritance?**

Component composition is the architectural practice of building complex user interfaces by combining small, discrete, single-responsibility components through props and nesting (`children`), rather than extending base classes.

React prefers composition because UI elements naturally fit a "has-a" relationship (a `Dialog` *has a* header, a body, and buttons) rather than an "is-a" relationship (`SpecialConfirmDialog` *is a* `ConfirmDialog` *is a* `BaseDialog`). 

Class inheritance in UI creates brittle hierarchies:
1. Base class modifications unintentionally break unknown descendants.
2. Code reuse across unrelated branches of the inheritance tree requires complex multi-inheritance or mixins.
3. Components become tightly coupled to the exact implementation of their parent classes.

With composition, components remain independent functions. You can swap subcomponents, pass custom markup via slots, and test each component in isolation with standard props.

**Q: How does passing JSX via `children` or named slots prevent unnecessary re-renders?**

In React, a component only re-renders if its own state changes, its parent re-renders, or its consumed Context updates. 

When you pass JSX elements to a component as `children` (e.g., `<Wrapper><HeavyChild /></Wrapper>`), the `<HeavyChild />` element is created during the render of the *outer component* that hosts both of them. When `Wrapper` updates its own internal state, it re-executes its own function. However, `props.children` is an existing element object reference passed into `Wrapper` from the outer host.

Because the reference `props.children` has not changed, React's Fiber reconciler recognizes that the child tree descriptor is identical and bails out of re-rendering `<HeavyChild />`. This allows you to encapsulate stateful animations, toggles, or scroll listeners inside layout wrappers without penalizing the rendering performance of the nested UI.

**Q: What are compound components, and how do they coordinate state between children?**

Compound components are a collection of related components that work together to implement a unified UI widget (such as `<Select>`, `<Select.Trigger>`, and `<Select.Option>`).

They coordinate state implicitly using React Context. The top-level wrapper maintains the active state (such as the selected value, focus index, and open/closed state) and provides state plus dispatch functions through a Context Provider. Child components call a custom hook consuming that context to read current state and dispatch actions.

This pattern eliminates prop drilling, gives the consumer full freedom to structure the layout (placing icons, headings, or custom dividers between items), and keeps the component API declarative and expressive.

**Q: When should you use Render Props versus Custom Hooks in modern React?**

Use **Custom Hooks** when you want to share stateful logic or side effects with zero UI attachment. For example, `useWindowSize()`, `useDebounce()`, or `useAuth()` extract behavior and return plain values or functions without dictating any JSX.

Use **Render Props** when you need *render delegation*—meaning the parent component owns visual layout boundaries, virtualization, or DOM orchestration, but must let the consumer decide how individual items or slots are rendered. A classic example is a virtualized windowing library like `react-window`, where `<FixedSizeList>` calculates absolute row positioning and scroll offsets, but delegates the actual row JSX rendering to a function prop: `children={({ index, style }) => <div style={style}>Row {index}</div>}`.

**Q: How does component composition solve the prop drilling problem without global state stores?**

Prop drilling occurs when data must be passed down through multiple intermediate components that do not need the data themselves, merely to reach a deeply nested child.

Instead of reaching for Redux or Zustand immediately, you can solve this by lifting the child component up to the parent and passing the instantiated element down via `children` or a named slot:

```tsx
// Before (Prop Drilling): Page -> Layout -> Sidebar -> Nav -> UserAvatar
<Page user={user} />

// After (Component Composition): Page directly instantiates UserAvatar
<Layout
  sidebar={
    <Sidebar>
      <Nav avatar={<UserAvatar user={user} />} />
    </Sidebar>
  }
>
  <MainContent />
</Layout>
```

Here, `Layout`, `Sidebar`, and `Nav` no longer need to know that `user` exists. They simply accept and render the React element slots provided to them.

**Q: Why did the React community move away from Higher-Order Components (HOCs)?**

Higher-Order Components were the dominant pattern in React 15/16 for cross-cutting concerns (e.g., `withRouter(connect(withAuth(MyComponent)))`). They fell out of favor for four reasons:
1. **Implicit Prop Collisions:** If two HOCs both injected a prop named `loading` or `data`, one would silently overwrite the other.
2. **Indirection & Wrapper Hell:** Component trees in DevTools became 15 layers deep with anonymous wrapper divs and HOC containers.
3. **TypeScript Typing Friction:** Typing HOCs with generic prop intersection and prop omission (`Omit<P, keyof InjectedProps>`) is notoriously difficult and prone to loose typing.
4. **Static Method Loss:** Wrapping a component in an HOC prevents callers from accessing static properties on the inner component unless explicitly hoisted.

Custom Hooks solved all of these problems by bringing logic composition directly into the component's execution scope with explicit variable assignments.

---

## 6. The Traps — What Goes Wrong

**Trap 1: Defining a Component Inside Another Component's Render Function**

*The Mistake:* Creating helper subcomponents inside the body of another component:

```tsx
function TableView({ data }: { data: string[] }) {
  // ❌ FATAL ERROR: Re-created on every render!
  function TableRow({ text }: { text: string }) {
    return <tr><td>{text}</td></tr>;
  }

  return (
    <table>
      <tbody>
        {data.map((item) => (
          <TableRow key={item} text={item} />
        ))}
      </tbody>
    </table>
  );
}
```

*Why it fails:* On every render of `TableView`, a brand-new function reference for `TableRow` is created in memory. To React's reconciler, a changed component function identity means the component type has changed completely. React unmounts the old DOM subtree and remounts a fresh one. This destroys local state, drops form focus, resets text inputs, and kills rendering performance.

*The Fix:* Always declare components at the top level of the module, or use standard inline JSX mapping:

```tsx
// ✅ Declare outside, pass props explicitly
function TableRow({ text }: { text: string }) {
  return <tr><td>{text}</td></tr>;
}

function TableView({ data }: { data: string[] }) {
  return (
    <table>
      <tbody>
        {data.map((item) => <TableRow key={item} text={item} />)}
      </tbody>
    </table>
  );
}
```

**Trap 2: Over-Compounding Simple Components (Premature Abstraction)**

*The Mistake:* Splitting straightforward components into excessive compound subcomponents when a simple prop would be cleaner:

```tsx
// ❌ Over-engineered for a basic button
<Button>
  <Button.Icon><CheckIcon /></Button.Icon>
  <Button.Label>Save Changes</Button.Label>
</Button>
```

*Why it fails:* It introduces unnecessary boilerplate, cognitive overhead, and lines of code for components that have no internal state coordination or complex layout variations.

*The Fix:* Use standard props for simple, static leaf components:
```tsx
// ✅ Simple, readable, direct
<Button icon={<CheckIcon />}>Save Changes</Button>
```

**Trap 3: Misusing `React.cloneElement` for Implicit Prop Injection**

*The Mistake:* Trying to build compound components by iterating over `children` with `React.Children.map` and injecting props using `React.cloneElement`:

```tsx
// ❌ Brittle cloneElement pattern
function TabList({ children, activeIndex, onChange }: any) {
  return (
    <div>
      {React.Children.map(children, (child, index) => {
        return React.cloneElement(child, {
          isActive: index === activeIndex,
          onClick: () => onChange(index),
        });
      })}
    </div>
  );
}
```

*Why it fails:* `cloneElement` only works for direct, immediate children. If a developer wraps a tab in a `<div>` or a tooltip (`<div><Tab /></div>`), the clone mechanism fails silently because the wrapper `div` receives `isActive` instead of the `Tab`. Furthermore, TypeScript cannot safely type props injected via `cloneElement`.

*The Fix:* Always use React Context for compound component communication. Context works across any depth of nested elements.

**Trap 4: Missing Context Boundary Guards**

*The Mistake:* Failing to throw an informative error when a compound child component is rendered outside its parent provider:

```tsx
// ❌ Returns undefined silently or crashes with unhelpful TypeError
function useAccordion() {
  return useContext(AccordionContext);
}
```

*The Fix:* Validate context in the custom hook:

```tsx
// ✅ Fails fast with clear actionable developer guidance
function useAccordionContext() {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error('Accordion compound subcomponents must be rendered inside an <Accordion> parent.');
  }
  return context;
}
```

---

## 7. Compare With Related Concepts

| Concept | Key Difference | Rule of Thumb |
| :--- | :--- | :--- |
| **Component Composition vs. Class Inheritance** | Composition combines components via nesting and props ("has-a"); inheritance creates hierarchical subclasses ("is-a"). | Never use class inheritance for React UI; always compose components via `children` and slots. |
| **Compound Components vs. Prop Configuration** | Compound components split state across context-linked subcomponents; prop configuration piles boolean flags onto one component. | Use prop configuration for simple leaf widgets; use compound components when subparts need customizable layout and shared state. |
| **Render Props vs. Custom Hooks** | Render props delegate the actual JSX rendering of a visual container; custom hooks share non-visual stateful logic. | Use Custom Hooks for pure business/data logic; use Render Props when a container component must control DOM measurements or virtualization while delegating element rendering. |
| **Named Slots vs. Multiple Specific Children Props** | Named slots pass ready-to-render React elements (`header={<Header />}`); prop callbacks pass data to construct elements. | Pass React elements directly (`leftSlot={<Icon />}`) for static slots; pass functions (`renderItem={(data) => ...}`) only when data must flow back up. |
| **Component Lifting vs. Global State Management** | Lifting components and passing elements via composition resolves prop drilling locally without external libraries; global state stores data in a centralized external store. | Try component composition with slots first to bypass intermediate layout drillers before adding global stores like Zustand or Redux. |

---

## 8. 🧠 The Memory Hook

Don't build a Swiss Army knife component with forty toggle flags; build the pocket knife handle with empty slots and let the caller snap in the scissors, blade, or corkscrew. In React, components don't inherit capabilities—they contain other components.
