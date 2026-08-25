# Component-Based Architecture in React

## 1. Why This Exists — The Problem First

Before component-based architecture became the standard, web applications were built as giant, monolithic HTML templates paired with global stylesheets and scripts. A typical e-commerce checkout page could easily span 3,000 lines of template markup, with jQuery or vanilla JavaScript scripts querying the global DOM using selectors like `$('.btn-submit')` or `$('#shipping-form')`.

This approach broke down disastrously in production for several reasons:

1. **Global collision and invisible coupling:** If an engineer changed a class name or markup structure inside a billing form, a completely unrelated script handling the promo-code modal would fail silently because its DOM selector no longer matched.
2. **DOM as the single source of truth:** State was scattered across `data-*` attributes, hidden input tags, and arbitrary global variables. You could never look at a piece of code and know with certainty what the UI would look like given a specific set of data.
3. **Zero real reusability:** When you needed the exact same user profile card on the dashboard, the checkout summary, and the admin panel, your only choice was to copy-paste the raw HTML and CSS across three template files. If the design changed, you had to hunt down every copy and manually update it—inevitably missing one and causing visual drift.
4. **Impossible isolated testing:** You could not test a simple confirmation dialog without running the entire backend, seeding a database, and navigating through a multi-step checkout workflow.

Component-based architecture was created to eliminate this chaos. Instead of treating a web page as a monolithic document with external scripts reaching in, React treats the UI as a tree of independent, self-contained, composable building blocks. Each block encapsulates its own structure, visual styling, internal logic, and state.

---

## 2. The Analogy — Make It Obvious

Think of component-based architecture like a **modular high-end Hi-Fi stereo system**.

In an old all-in-one boombox, the cassette player, AM/FM radio tuner, amplifier, and speakers are all soldered into one molded plastic chassis. If the cassette motor burns out or you want to upgrade the speakers, you have to tear apart the whole device, risk snipping the radio antenna wire, or throw the entire unit in the trash.

A modular Hi-Fi rack works completely differently:

- **Independent Units (Components):** You have a standalone Turntable, a DAC (Digital-to-Analog Converter), a Preamplifier, and a pair of Powered Speakers. Each unit has one specific job and performs it exceptionally well.
- **Standardized Cables (Props):** The turntable connects to the preamplifier using standard RCA audio cables. The preamplifier doesn't care what brand of turntable you plug in, as long as it receives an audio signal through that standard port. Props are the cables: immutable inputs supplied from the outside.
- **Internal Dials and Mechanics (Encapsulated State):** The turntable manages its own motor speed (33 vs. 45 RPM) and needle counterweight internally. The speakers do not know or care how the turntable motor spins—they only care about the audio stream coming through their input jack.
- **Composition (The Rack):** You build a custom sound setup by plugging units into one another. Want to add Bluetooth streaming? You don't rebuild the amplifier; you simply plug a Bluetooth receiver module into an open input slot on the preamp.
- **Portability and Replacement:** If a speaker blows out, you unplug two cables, swap in a new speaker, and the rest of the sound system keeps running without touching a single wire on the turntable.

In React, your user interface is that audio rack. A `Button`, `Avatar`, `Modal`, or `UserProfileCard` is an independent module with a standardized input interface (`props`), private internal mechanics (`state`), and the ability to snap into any parent container (`composition`).

---

## 3. How It Actually Works — The Full Explanation

React's component architecture is built on five core principles that work together to produce scalable, maintainable interfaces.

### 1. Single Responsibility Principle (SRP)
Every component should have exactly one reason to change. A component generally falls into one of these distinct categories:
- **Design System Primitive (Atom):** Pure visual building blocks (e.g., `Button`, `Input`, `Badge`, `Typography`). They have zero knowledge of business models or API endpoints.
- **Compound / Layout Component:** Orchestrates spatial arrangement and structural slots (e.g., `Card`, `Modal`, `SidebarLayout`, `Grid`).
- **Domain / Feature Component:** Encapsulates business logic, data presentation, and domain behaviors (e.g., `UserProfileCard`, `InvoiceRow`, `ShoppingCartItem`).
- **Page / Route Container:** Orchestrates data fetching, top-level layout composition, URL state, and empty/error states.

When a component tries to handle both low-level layout styling and high-level business data fetching, it violates SRP and becomes rigid and fragile.

### 2. Props as Pure, Read-Only Inputs
In mathematical terms, a React component is a function mapping inputs to UI:

$$\text{UI} = f(\text{props}, \text{state})$$

Props flow strictly downward from parent to child (unidirectional data flow). A component must treat its `props` as immutable. If a child component needs to communicate a change to its parent, it does not mutate the parent's data directly; instead, it triggers an event callback function passed down as a prop.

### 3. Encapsulation of State and Behavior
A component owns its internal state and behavior. For example, a `DropdownMenu` component manages whether its popup menu is currently visible (`isOpen: boolean`) and handles keyboard navigation (Arrow Up/Down, Escape). The parent component that places the dropdown on the screen does not need to manually attach keyboard event listeners or toggle CSS visibility classes. The internal mechanics are completely encapsulated.

### 4. Composition Over Inheritance
React never uses class inheritance hierarchies (such as `class ModalWithHeader extends BaseModal`) to share functionality or UI. Instead, it relies on composition. React components can accept other components as props—most notably through the special `children` prop, as well as named slot props (e.g., `header={<Avatar />}`, `footer={<ActionButtons />}`).

Composition allows you to create flexible, open-ended containers without hardcoding what goes inside them.

### 5. The Component Hierarchy and Fiber Tree
When your application runs, React builds an in-memory tree of Fiber nodes representing every component instance. When a component's internal state changes:
1. React schedules a render phase for that specific component and its subtree.
2. React invokes the component function with its current props and state, producing a virtual tree of React Elements (plain JavaScript objects).
3. React's reconciliation engine compares (diffs) the new element tree against the previous one.
4. During the commit phase, React applies only the minimal necessary changes to the real browser DOM.

Because components isolate state and rendering logic, React can reconcile and update isolated branches of the DOM tree without tearing down or recalculating the entire page.

---

## 4. Real Code — See It Working

Here is a practical, production-ready example showing how low-level primitives, compound layout containers, and domain feature components compose together cleanly.

### Step 1: Low-Level UI Primitive (`Button`)

```tsx
import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
}

// Pure design system primitive: handles styling, accessibility, and disabled state.
// Has zero knowledge of any business entity.
export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  children,
  className = '',
  ...restProps
}: ButtonProps) {
  const baseStyles = 'px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2';

  const variantStyles: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400',
    secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-200 focus:ring-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-400',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      {...restProps}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <span>Loading...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
```

### Step 2: Compound Layout Component (`Card` with Named Slots)

```tsx
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

// Structural container: provides visual bounding box and shadow
export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// Sub-components allow flexible slot-based composition without boolean flags
Card.Header = function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 border-b border-gray-100 pb-3">{children}</div>;
};

Card.Body = function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="text-gray-700">{children}</div>;
};

Card.Footer = function CardFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-4">{children}</div>;
};
```

### Step 3: Domain Component Composing Primitives (`UserProfileCard`)

```tsx
import React, { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  isSuspended: boolean;
}

interface UserProfileCardProps {
  user: User;
  onStatusChange: (userId: string, shouldSuspend: boolean) => Promise<void>;
}

// Domain component: encapsulates business rules, manages local action state,
// and composes generic primitives into a cohesive feature UI.
export function UserProfileCard({ user, onStatusChange }: UserProfileCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggleSuspension = async () => {
    setIsUpdating(true);
    try {
      await onStatusChange(user.id, !user.isSuspended);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card className="max-w-md">
      <Card.Header>
        <div className="flex items-center gap-4">
          <img
            src={user.avatarUrl}
            alt={`${user.name}'s profile avatar`}
            className="h-12 w-12 rounded-full object-cover ring-2 ring-gray-100"
          />
          <div>
            <h3 className="text-lg font-bold text-gray-900">{user.name}</h3>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>
      </Card.Header>

      <Card.Body>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Role:</span>
            <span className="font-medium text-gray-800">{user.role}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Account Status:</span>
            <span
              className={`font-medium ${
                user.isSuspended ? 'text-red-600' : 'text-green-600'
              }`}
            >
              {user.isSuspended ? 'Suspended' : 'Active'}
            </span>
          </div>
        </div>
      </Card.Body>

      <Card.Footer>
        <Button
          variant={user.isSuspended ? 'primary' : 'danger'}
          isLoading={isUpdating}
          onClick={handleToggleSuspension}
        >
          {user.isSuspended ? 'Reactivate Account' : 'Suspend Account'}
        </Button>
      </Card.Footer>
    </Card>
  );
}
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is component-based architecture in React, and how does it fundamentally differ from traditional MVC web architectures?**

In traditional MVC (Model-View-Controller) web architectures, code is divided along technical layers: Models hold raw data, Views define HTML templates, and Controllers contain event handling and business coordination. In practice, this creates tight, invisible coupling across three separate files every time you want to build or update a single UI feature.

React's component-based architecture decomposes applications along **feature and domain boundaries** rather than technical layers. A component co-locates markup (JSX), styling logic, event listeners, and local state management into a single cohesive unit of responsibility. Instead of maintaining one giant controller that manipulates a giant view template, React applications are trees of small, self-contained components that pass data down via props and events up via callbacks.

---

**Q: How do you determine where to draw component boundaries when breaking down a complex screen?**

Component boundaries should be drawn based on **single responsibility, state ownership, and change frequency**, not arbitrary line counts. Use these four practical criteria:

1. **Responsibility Boundary:** Does this piece of UI represent a distinct concept (e.g., `NavigationHeader`, `ProductFilterSidebar`, `RatingStars`)?
2. **State Co-location:** Does a piece of state only matter to a specific section of the UI? If a search input's text only matters to the autocomplete dropdown, isolate that input and dropdown into their own component so typing doesn't re-render the entire parent page.
3. **Reusability Boundary:** Does this visual pattern or interaction appear in two or more places (e.g., `Modal`, `Button`, `StatusBadge`)?
4. **Performance / Render Boundary:** If a specific sub-tree updates frequently (like a live countdown timer or animated canvas), isolating it in a child component prevents re-rendering the heavy, static sibling components around it.

---

**Q: What is the difference between shared design-system primitives and domain/feature components?**

The fundamental difference lies in their **knowledge of business entities**:

- **Shared Design-System Primitives (`Button`, `Modal`, `Tabs`, `Input`):**
  - Completely domain-agnostic. They have no knowledge of `User`, `Invoice`, or API payloads.
  - Their props define abstract visual and structural traits (`variant`, `size`, `isOpen`, `onClose`, `children`).
  - Highly reusable across entirely different projects or business domains.
  - Live in a shared library or `/components/ui` directory.

- **Domain / Feature Components (`UserProfileCard`, `InvoiceTable`, `CheckoutPaymentForm`):**
  - Tightly coupled to the application's domain models and business requirements.
  - Accept domain-specific data types (e.g., `user: User`, `order: OrderSummary`).
  - Compose design-system primitives to satisfy specific business workflows.
  - Live within feature-specific directories (e.g., `/features/billing/components`).

---

**Q: What makes a component truly reusable versus falsely reusable?**

A truly reusable component has a **minimal, predictable API surface** that relies on composition rather than conditional branching. It does one thing well, accepts data via generic props or `children`, and does not make assumptions about its parent container or data source.

A falsely reusable component tries to satisfy multiple divergent use cases by accumulating dozens of optional boolean props (e.g., `<Card isUserProfile hasBillingTable showAdminControls hideHeaderOnMobile />`). Inside, it becomes a tangle of nested ternary operators. The moment a new requirement arises for one use case, editing that component risks breaking all other use cases. True reusability is achieved by providing composable slots (`Card.Header`, `Card.Body`, `Card.Footer`) so callers can customize content without modifying the underlying component code.

---

**Q: How does component composition solve the prop-drilling problem?**

Prop drilling occurs when you pass a prop through intermediate components that don't need the data themselves, just to reach a deeply nested child (e.g., `Page -> Layout -> Sidebar -> UserMenu -> Avatar`).

Composition solves this directly through component lifting using `children` or slot props:

```tsx
// Before: Layout and Sidebar must accept and pass user avatar props they don't care about
<Page user={user}>
  <Layout user={user}>
    <Sidebar user={user} />
  </Layout>
</Page>

// After: Page composes the components directly; Layout and Sidebar only render {children}
<Page>
  <Layout
    sidebar={
      <Sidebar>
        <Avatar src={user.avatarUrl} />
      </Sidebar>
    }
  >
    <MainContent />
  </Layout>
</Page>
```

By assembling the nested components at the top level where the data already exists, the intermediate layout containers don't need to know anything about the user data.

---

## 6. The Traps — What Goes Wrong

### Trap 1: The "God Component" (Config-Driven Everything)
- **The Mistake:** Creating a single generic component that attempts to handle every possible screen variation using endless configuration flags:
  ```tsx
  // Bad: God component with 15 boolean flags and branching logic
  <DataCard
    type="invoice"
    showActions
    isAdminView={false}
    condensedLayout
    withAvatar={false}
    highlightOverdue
  />
  ```
- **Why It Fails:** Cyclomatic complexity explodes. Every time design tweaks one edge case for invoices, the component's internal `if/else` checks break for user profiles or order summaries.
- **The Fix:** Break the component into composable primitives or compound components. Use composition to let the caller assemble the specific layout they need.

---

### Trap 2: Premature Extraction and Over-Abstraction
- **The Mistake:** Extracting a shared `<TableWithSearchAndPagination />` component the very first time you build a table, assuming all future tables will behave identically.
- **Why It Fails:** Duplicate code is far cheaper than the wrong abstraction. When the second table needs infinite scrolling instead of numbered pages, and the third table needs expandable rows, the original "reusable" component gets corrupted with messy overrides.
- **The Fix:** Follow the **Rule of Three**. Write components locally for specific features first. Only extract a shared abstraction once three distinct features demonstrate identical structural and behavioral requirements.

---

### Trap 3: Leaking Business Logic and Network Calls into UI Primitives
- **The Mistake:** Embedding an API call, authentication check, or global state hook directly inside a low-level primitive:
  ```tsx
  // Bad: Button primitive checking domain permissions internally
  function DeleteButton({ itemId }: { itemId: string }) {
    const { user } = useAuth();
    const canDelete = user.permissions.includes('DELETE_ITEM');
    if (!canDelete) return null;
    return <button onClick={() => api.delete(itemId)}>Delete</button>;
  }
  ```
- **Why It Fails:** The button can no longer be used anywhere else in the application where deletion logic differs or permissions are calculated differently.
- **The Fix:** Keep UI primitives purely presentational. Pass `disabled={!canDelete}` and `onClick={handleDelete}` as props from a domain-level parent component.

---

### Trap 4: Micro-Fragmentation (Splitting Files for Line Count)
- **The Mistake:** Splitting a 60-line component into 8 separate 5-line files (`<CardWrapper />`, `<CardTitleText />`, `<CardIconContainer />`) just to keep files artificially short.
- **Why It Fails:** Adds excessive visual indirection. When reading or debugging the code, an engineer has to jump across 8 files to understand a single static piece of UI that has no independent state or logic.
- **The Fix:** Keep tightly coupled sub-markup in the same file as standard JSX or local helper functions until there is a genuine reason (state isolation, reuse, or complex independent logic) to extract it.

---

## 7. Compare With Related Concepts

| Concept Pair | Core Difference | When to Use Which |
| :--- | :--- | :--- |
| **React Component vs. Plain JS Function** | A React component returns a React element tree (JSX) describing UI and participates in React's Fiber lifecycle. A plain function computes and returns arbitrary data or triggers side effects. | Use a **Component** to render UI with props and lifecycle hooks. Use a **Plain Function** for math, string formatting, data transformations, and business calculations. |
| **Composition vs. Class Inheritance** | Composition builds complex systems by combining small, independent pieces via props and `children`. Inheritance extends a parent class to inherit its properties and methods. | Always use **Composition** in React. React's architecture does not support or recommend class inheritance for UI components. |
| **UI Primitives vs. Domain Components** | UI Primitives (`Button`, `Modal`) are domain-agnostic design system tokens. Domain components (`UserProfileCard`, `OrderRow`) understand domain data structures and business logic. | Use **UI Primitives** to maintain consistent global design and accessibility. Use **Domain Components** to implement specific application features. |
| **Presentational vs. Container Components** | Presentational components only care about how things look (purely prop-driven). Container components care about how things work (data fetching, store subscriptions, route handling). | Use **Presentational** components for modular, testable UI elements. Use **Container** components (or custom hooks) at route/page boundaries to feed data to presentational trees. |

---

## 8. 🧠 The Memory Hook — What Sticks

> **Think of components as Lego bricks, not Russian nesting dolls.**
>
> A good component doesn't dictate what can be built around it or inside it; it provides a clean, standardized interface so you can snap it together with other blocks to build anything from a tiny cottage to a skyscraper.
