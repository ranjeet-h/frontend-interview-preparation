# Designing Reusable Components in React

## 1. Why This Exists — The Problem First

Every frontend codebase starts with high hopes: someone creates a `Button.tsx` in the shared folder so everyone stops copy-pasting raw HTML. 

Two weeks later, the checkout team needs the button to show a spinner and disable itself during a Stripe payment, so they add `isLoading` and `isStripeButton`. The marketing team needs the button to act as an external link to Google OAuth without losing its button styling, so someone adds `isLink` and `href`. The analytics team injects a hardcoded `trackEvent('BUTTON_CLICK')` directly inside the component's internal `onClick` handler. The settings team notices the button sits too close to their inputs, so they add `hasMarginTop: boolean` to the shared CSS.

Six months in, your "shared" `Button` accepts 28 boolean props (`isPrimary`, `isSecondary`, `isDanger`, `isSubmit`, `isOAuth`, `hasMarginTop`, `trackCheckoutClick`, `smallPadding`), contains 40 lines of nested `if/else` checks, imports three domain API clients and an analytics SDK directly, and breaks in 12 different product features whenever someone tweaks a single CSS rule. Developers give up and start writing `<button className="...">` from scratch again.

This disaster happens because developers confuse "reusable" with "a dumping ground for every team's edge case." A truly reusable component does not try to do everything for everyone. It provides a stable, accessible, visually consistent primitive that delegates business decisions back to the caller while handling native attributes, design system variants, and keyboard accessibility out of the box.

## 2. The Analogy — Make It Obvious

Think of a reusable component like a **Standardized Shipping Container** versus a **Custom Delivery Truck**.

A custom delivery truck is built with hardcoded shelves for 20 cartons of milk and 10 crates of apples. The day you need to ship a bicycle, the interior shelves get in the way, so you hack on a bike rack. Next week you need to transport ice cream, so you bolt a generator and freezer unit onto the roof. The truck becomes a fragile, expensive monstrosity coupled to specific groceries. If the grocery changes, the truck breaks.

A standardized intermodal shipping container is completely different:

1. **Standard Exterior Twist-Locks (Prop Forwarding & Native Attributes):** Every crane, train, and cargo ship in the world can lock onto the container using the exact same standard corner fittings, regardless of what is inside.
2. **Fixed Structural Dimensions & Variants (Design Tokens & Variants):** Containers come in standard sizes (20-foot, 40-foot, refrigerated) with strict structural guarantees.
3. **Empty, Configurable Interior Volume (Slots, Children, & Inversion of Control):** The container does not care whether it holds furniture, electronics, or coffee beans. It provides the secure shell and tie-down hooks; the shipper decides what cargo goes inside.
4. **Standard Safety Seals & Hazard Placards (Accessibility & ARIA):** Built-in compliance labels and inspection points ensure safety standards everywhere it travels.

A shipping container works across every port on Earth because it standardizes the interface and delegates cargo management to the sender. A reusable React component works across every feature in your app because it standardizes the UI contract, accessibility, and styling variants while delegating business logic and content to the consuming page.

## 3. How It Actually Works — The Full Explanation

Designing a production-grade reusable component requires balancing four architectural pillars: strict separation of concerns, prop forwarding, polymorphic rendering, and inversion of control.

**Pillar 1: Separation of Concerns — Zero Domain Awareness**

A reusable UI primitive must be completely pure regarding business logic. It must never:
- Import an API client or call `fetch` / `useQuery`.
- Read from a global domain store (e.g., pulling the logged-in user's cart from Redux or Zustand).
- Import routing hooks like `useNavigate` or `useParams`.
- Trigger hardcoded analytics events directly.

Instead, the component receives all data through props and communicates user interactions outwards strictly through event callbacks (`onClick`, `onOpenChange`, `onChange`). If the checkout page needs to track a purchase event when the button is pressed, the checkout page attaches that tracking logic to its own `onClick` prop.

**Pillar 2: Anatomy of a Component — Headless Logic vs. Presentational Shell**

High-quality design systems split components into two distinct layers:
1. **Behavioral / Headless Layer:** Manages state machines, keyboard navigation (Escape to close, arrow keys for roving focus), focus traps, and ARIA attributes (`aria-expanded`, `aria-controls`, `aria-busy`). Libraries like Radix UI Primitives or custom hooks (`useDialog`, `useDropdown`) handle this without applying any CSS.
2. **Presentational Layer:** Applies design tokens, typography, padding, color schemes, hover states, and focus rings using Tailwind CSS, CSS Modules, or CSS-in-JS.

Decoupling behavior from presentation means you can restyle an accordion or modal 20 times across different company sub-brands without rewriting the WAI-ARIA tab and keyboard accessibility mechanics.

**Pillar 3: Prop Forwarding & Native HTML Compatibility**

Consumers should never have to ask a design system maintainer to add standard HTML attributes like `type="submit"`, `id`, `name`, `aria-label`, `form`, or `data-testid`. 

By extending `React.ComponentPropsWithoutRef<'button'>` (or using `React.ButtonHTMLAttributes<HTMLButtonElement>`) and spreading `...props` onto the root DOM element, the component automatically supports every native browser attribute. Furthermore, wrapping the component in `React.forwardRef` (or accepting `ref` in React 19) allows consumers to measure dimensions, manage focus, or hook into animation libraries like Framer Motion.

**Pillar 4: Polymorphism — The `as` Prop vs. Radix `asChild` (Slot Pattern)**

Often, a UI element needs to look like a button but render semantically as an `<a>` tag or a framework link (like Next.js `<Link>`).

Historically, libraries used an `as` prop (`<Button as="a" href="/login">` or `<Button as={Link} to="/login">`). While functional, dynamic `as` props require complex TypeScript generic casting and can produce runtime prop collisions between the wrapper and the target element.

The modern industry standard is the **`asChild` (Slot) pattern**, popularized by Radix UI. Instead of creating a wrapper DOM element or dynamically instantiating a component, `<Button asChild>` uses a `Slot` utility that clones its immediate JSX child and merges the button's CSS classes, event handlers, ARIA attributes, and refs directly onto that child:

```tsx
<Button asChild variant="secondary">
  <Link href="/dashboard">Go to Dashboard</Link>
</Button>
```

This renders a single clean `<a>` tag with full button styling and keyboard behavior, with zero DOM pollution and complete TypeScript safety.

**Pillar 5: Inversion of Control with Compound Components**

When a component has multiple visual pieces (like a Modal with a header, body, close button, and footer), passing all content through a giant configuration object creates "Configuration Hell":

```tsx
// Anti-pattern: Configuration Hell
<Modal 
  title="Delete Project" 
  subtitle="This cannot be undone" 
  confirmText="Delete" 
  cancelText="Cancel" 
  showCloseIcon={true}
  headerIcon={<WarningIcon />}
/>
```

The moment a team needs the header icon to sit below the title or wants a custom checkbox inside the footer, this API breaks.

The solution is **Compound Components**. Break the component into coordinated sub-components that share state via React Context:

```tsx
// Pattern: Inversion of Control with Compound Components
<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
  <Dialog.Trigger asChild>
    <Button variant="danger">Delete</Button>
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Delete Project</Dialog.Title>
      <Dialog.Description>This cannot be undone.</Dialog.Description>
      <div className="custom-confirmation-box">
        <input type="checkbox" id="confirm" />
        <label htmlFor="confirm">I understand the consequences</label>
      </div>
      <Dialog.Footer>
        <Dialog.Close asChild>
          <Button variant="ghost">Cancel</Button>
        </Dialog.Close>
        <Button variant="danger" onClick={handleDelete}>Confirm Delete</Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

The parent manages shared state (open/closed), while the consumer controls layout, ordering, and optional sub-elements with complete flexibility.

**Pillar 6: Variant Management with `cva` (Class Variance Authority)**

Instead of scattering boolean flags across your props (`isPrimary`, `isDanger`, `isSmall`, `isLarge`), variant management uses **discriminated unions** and a class matrix with `cva`.

`cva` pairs with `clsx` and `tailwind-merge` to produce a single `cn()` helper. It maps explicit variant combinations (e.g. `variant: "primary" | "secondary" | "danger"`, `size: "sm" | "md" | "lg"`) to deterministic CSS classes and handles compound overrides cleanly.

## 4. Real Code — See It Working

Here is a complete, production-grade implementation of a polymorphic, accessible, variant-driven `Button` component, followed by a compound `Dialog` pattern.

**Example 1: Production-Grade Polymorphic Button with `cva` and `asChild`**

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility to merge Tailwind classes safely without conflicts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Minimal Slot implementation for the asChild pattern
// Merges props, className, and refs onto the single child element
export const Slot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>(
  ({ children, className, ...props }, forwardedRef) => {
    if (React.isValidElement(children)) {
      const child = children as React.ReactElement<any>;
      return React.cloneElement(child, {
        ...props,
        ...child.props,
        className: cn(className, child.props.className),
        // Merge refs so both caller and child keep access
        ref: forwardedRef ? forwardedRef : child.props.ref,
      });
    }
    return null;
  }
);
Slot.displayName = "Slot";

// Define the variant matrix using CVA
export const buttonVariants = cva(
  // Base classes applied to every button: layout, focus rings, transitions, disabled styles
  "inline-flex items-center justify-center gap-2 rounded-md font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        primary: "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-400",
        danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
        outline: "border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-400",
        ghost: "bg-transparent text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-400",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    // If asChild is true, we delegate rendering to the Slot component
    const Component = asChild ? Slot : "button";

    return (
      <Component
        ref={ref as any}
        className={cn(buttonVariants({ variant, size, className }))}
        // When loading, disable interactions and inform assistive tech via aria-busy
        disabled={disabled || isLoading}
        aria-busy={isLoading ? "true" : undefined}
        aria-disabled={disabled || isLoading ? "true" : undefined}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Loading...</span>
          </>
        ) : (
          children
        )}
      </Component>
    );
  }
);
Button.displayName = "Button";
```

**Example 2: Compound Modal with Context and Keyboard Accessibility**

```tsx
import * as React from "react";

interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog compound components must be rendered within a Dialog.Root");
  }
  return context;
}

// 1. Root container managing shared visibility state and IDs
export function DialogRoot({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange]
  );

  const titleId = React.useId();
  const descriptionId = React.useId();

  return (
    <DialogContext.Provider value={{ open, setOpen, titleId, descriptionId }}>
      {children}
    </DialogContext.Provider>
  );
}

// 2. Trigger element that toggles the dialog open
export function DialogTrigger({ children, asChild = false }: { children: React.ReactElement; asChild?: boolean }) {
  const { setOpen } = useDialogContext();
  const handleClick = (e: React.MouseEvent) => {
    children.props.onClick?.(e);
    setOpen(true);
  };

  return React.cloneElement(children, {
    onClick: handleClick,
    "aria-haspopup": "dialog",
  });
}

// 3. Dialog Content with backdrop, Escape key listener, and ARIA attributes
export function DialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const { open, setOpen, titleId, descriptionId } = useDialogContext();

  // Close dialog on Escape key press
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={() => setOpen(false)} 
        aria-hidden="true"
      />
      {/* Dialog card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn("relative z-50 w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl", className)}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  const { titleId } = useDialogContext();
  return <h2 id={titleId} className={cn("text-lg font-semibold text-gray-900", className)}>{children}</h2>;
}

export function DialogDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  const { descriptionId } = useDialogContext();
  return <p id={descriptionId} className={cn("mt-2 text-sm text-gray-600", className)}>{children}</p>;
}

export function DialogClose({ children }: { children: React.ReactElement }) {
  const { setOpen } = useDialogContext();
  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      setOpen(false);
    },
  });
}

// Namespace export for clean compound syntax
export const Dialog = {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Content: DialogContent,
  Title: DialogTitle,
  Description: DialogDescription,
  Close: DialogClose,
};
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What distinguishes a truly reusable UI primitive from an over-abstracted "god component"?**

A truly reusable UI primitive is domain-agnostic, has a single clear responsibility, and provides an open, extensible API. It knows *how* UI elements look and interact (handling hover states, focus rings, variants, and keyboard events), but it knows nothing about *what* business data it renders or *why* an action happens. It receives data through standard props and notifies parents via event callbacks.

In contrast, an over-abstracted "god component" tries to satisfy multiple unrelated product features by accumulating boolean flags (`isCheckout`, `showUserAvatar`, `hasPromoBanner`). Its internal code becomes filled with conditional branching (`if (isSettingsPage) ... else if (isBilling) ...`), it imports domain API clients or analytics trackers directly, and modifying it for one team breaks functionality for another. True reusability comes from composition and inversion of control, not massive configuration flags.

**Q: How do you design component props to prevent prop explosion and mutually exclusive state bugs?**

To prevent prop explosion:
1. **Use Discriminated Unions instead of Boolean Flags:** Never write `isPrimary`, `isSecondary`, `isDanger`, `isGhost`. A user could accidentally pass `isPrimary={true} isDanger={true}`, creating undefined styling states. Instead, use `variant: "primary" | "secondary" | "danger" | "ghost"`. TypeScript will enforce at compile time that exactly one variant is selected.
2. **Extend Native HTML Attributes:** Use `React.ComponentPropsWithoutRef<'button'>` and spread unrecognized props `...props` to the root DOM element. This gives callers instant access to `type`, `id`, `name`, `aria-*`, and event listeners without adding dozens of one-off props.
3. **Use Compound Components for Multi-Part UI:** Instead of passing 15 title, icon, and footer props to a `<Card>` or `<Modal>`, expose sub-components (`Card.Header`, `Card.Body`, `Card.Footer`) so consumers compose exactly what they need.

**Q: Why should a design system component avoid hardcoded API calls, global store selectors, or router hooks?**

The moment a component calls `useSelector((state) => state.cart)` or `useNavigate()`, it binds its existence to that specific Redux store schema and routing provider. It can no longer be rendered inside a standalone component playground (like Storybook), used in an isolated unit test without mocking global providers, or reused in another app or micro-frontend that uses a different router (e.g. Next.js App Router vs. React Router).

Shared UI components should be pure presentational functions of their props. Feature-level container components (domain components) should hold the hooks, API queries, and store selectors, passing clean data down to the reusable primitives.

**Q: What is the difference between Polymorphism via the `as` prop and the `asChild` (Radix Slot) pattern?**

The `as` prop (`<Button as="a" href="/home">` or `<Button as={CustomLink} to="/home">`) uses dynamic component instantiation (`const Component = as || 'button'`). In TypeScript, this requires complex polymorphic generic types (`PolymorphicComponentProps<C, Props>`) to ensure that `href` is valid when `as="a"` but invalid when `as="button"`. Furthermore, it can cause prop collisions if the wrapper component and the passed component share prop names with different signatures.

The `asChild` (Slot) pattern avoids dynamic instantiation entirely. `<Button asChild><Link href="/home">Home</Link></Button>` does not render a `<button>` DOM node. Instead, the `Slot` clones the immediate `<Link>` child element and merges the button's calculated CSS classes, ARIA attributes, event handlers, and refs directly onto that child. The TypeScript types remain simple, the DOM output has zero redundant wrapper nodes, and the consumer retains full native typing on their child element.

**Q: How do Compound Components implement Inversion of Control in React?**

Inversion of Control (IoC) means shifting the responsibility of rendering decisions from the component author to the component consumer. 

In a traditional component (`<Select options={items} renderItem={...} />`), the component author controls the internal loop, DOM structure, and layout. If the consumer wants to add an icon between items or group them into sections, they must beg for a new configuration prop.

With Compound Components (`<Select.Root>`, `<Select.Trigger>`, `<Select.Group>`, `<Select.Item>`), the parent component manages the hidden coordination logic (active index, open state, keyboard navigation) through React Context, while the consumer writes the actual JSX tree. The consumer can rearrange elements, inject custom badges, insert separators, or wrap items in tooltips without altering a single line of the component's internal code.

**Q: When should a disabled button use the HTML `disabled` attribute versus `aria-disabled="true"`?**

When a button has the native HTML `disabled` attribute, browsers completely remove it from the keyboard tab order and prevent all mouse events (hover, click, focus). 

While this prevents unwanted clicks, it creates two major accessibility problems:
1. Screen reader users navigating by tab key will completely skip over the button, leaving them unaware that an action even exists.
2. Tooltips explaining *why* the button is disabled (e.g., "Please fill in your email first") will never trigger because mouse and focus events are suppressed.

The accessible alternative is to keep the button focusable in the tab sequence, set `aria-disabled="true"`, prevent action execution inside the `onClick` handler (`if (disabled) e.preventDefault()`), and style it as visually disabled (`opacity-50 cursor-not-allowed`). Use native `disabled` only when the element has no tooltip and no need to be discovered by keyboard-only users.

**Q: How do you balance component flexibility with design system consistency?**

You enforce strict constraints on **visual tokens** (colors, typography scales, border radii, elevation) while providing open flexibility on **composition and layout**.

1. **Strict Variants:** Restrict visual styling to approved design system tokens via `cva` (`variant="primary" | "secondary"`). Do not allow random `color="#ff0044"` props.
2. **Encapsulate Padding, Delegate Margins:** A component should own its internal padding and border, but never include hardcoded external margins (`m-4`). External spacing is the responsibility of the parent layout container (`<Flex gap={4}>` or CSS Grid).
3. **Allow Class Overrides with Caution:** Allow an optional `className` prop that passes through `tailwind-merge` (`twMerge`) so consumers can adjust layout properties (like `w-full` or `flex-1`) without breaking core design tokens.

**Q: What is the difference between Headless UI and Styled Component Libraries, and when do you choose each?**

A **Headless UI library** (like Radix Primitives, React Aria, or Headless UI) provides unstyled, fully accessible logic: state management, ARIA roles, focus trapping, keyboard navigation, and screen reader announcements. It renders zero CSS classes. You pair it with your own styling engine (like Tailwind CSS and CVA) to build a custom, bespoke design system.

A **Styled Component library** (like MUI, Ant Design, or Mantine) provides fully styled, ready-to-use visual components with pre-baked themes and animations.

Choose **Headless UI** when building a consumer-facing product with a unique, custom brand identity where complete control over markup and micro-interactions is mandatory. Choose a **Styled Library** for internal dashboards, enterprise CRUD tools, or early-stage MVPs where development speed is more important than bespoke visual branding.

## 6. The Traps — What Goes Wrong

**Trap 1: Premature Abstraction & Visual Coincidence (The Rule of 3 Violation)**

Developers often see two cards on different pages that look identical today (same white background, border radius, and shadow) and immediately extract a `<UniversalCard>`. Two weeks later, the Marketing Card needs a background video and CTA button, while the Settings Card needs a form submit handler. The developer starts adding `if (isMarketing) ... else ...` flags inside the card.

*What actually happens:* The component becomes a tangled mess of conflicting logic because the developer abstracted based on **visual coincidence** rather than **shared behavioral purpose**.
*The fix:* Follow the **Rule of 3**. Do not extract a shared component on the first or second use. Wait until a pattern appears three distinct times across different features. If two components only share visual styling, extract shared CSS utility classes or a simple presentational container, not a monolithic component with complex props.

**Trap 2: Boolean Prop Explosion**

Adding a boolean flag for every new visual or behavioral twist:

```tsx
// The Mistake: Conflicting booleans
<Button isPrimary isDanger isSmall isLarge isSubmit />
```

*What actually happens:* What happens if another developer passes both `isPrimary={true}` and `isDanger={true}`? The CSS cascades unpredictably depending on how the classes were ordered in the stylesheet.
*The fix:* Use discriminated union variants and CVA. A single `variant="danger"` and `size="sm"` prop makes invalid states impossible to represent.

**Trap 3: Baking Margins and Layout Positioning into Reusable Primitives**

A developer builds an `<Input />` component and adds `margin-bottom: 24px` directly to its wrapper because their login form designs had 24px between fields.

*What actually happens:* When another team tries to place two inputs side-by-side inside an inline search bar, the hardcoded bottom margin breaks the flex layout alignment, forcing them to write hacky negative margin overrides (`-mb-6`).
*The fix:* Reusable components must never have external margins. They control their internal padding and dimensions. Spacing between elements is strictly the job of the parent layout (e.g. `<div className="flex flex-col gap-6">`).

**Trap 4: Forgetting Ref and Native Prop Forwarding**

Writing a custom button that only accepts `{ label, onClick }` and renders `<button onClick={onClick}>{label}</button>`.

*What actually happens:* The moment someone needs to attach a tooltip, trigger an auto-focus on page load, integrate with a form library like React Hook Form, or attach an animation with Framer Motion, the component fails because it lacks `ref` forwarding and drops standard HTML attributes like `name`, `type`, and `onBlur`.
*The fix:* Always extend `React.ComponentPropsWithoutRef<'element'>`, wrap the component in `React.forwardRef`, and spread unrecognized `...props` to the root DOM node.

**Trap 5: Domain & Analytics Coupling**

Embedding analytics tracking or API fetching directly inside shared UI primitives:

```tsx
// The Mistake: Domain coupling
function Modal({ children }) {
  useEffect(() => {
    mixpanel.track('MODAL_OPENED'); // Hardcoded tracking
  }, []);
  // ...
}
```

*What actually happens:* When the design system is used in a testing environment or a different product that uses PostHog instead of Mixpanel, the entire application throws errors or pollutes production analytics with phantom events.
*The fix:* Shared primitives emit lifecycle events via callbacks (`onOpen`, `onClose`, `onClick`). The consuming feature implements the tracking logic.

## 7. Compare With Related Concepts

**Reusable Primitives vs. Domain Components**
- **Reusable Primitive:** Completely domain-agnostic, zero API or store dependencies, owns visual variants and accessibility, lives in `components/ui/` or a design system package (e.g., `Button`, `Dialog`, `TextInput`).
- **Domain Component:** Feature-specific, imports API hooks and state selectors, composes multiple primitives into a business workflow, lives in `features/checkout/` (e.g., `CheckoutPaymentModal`, `UserProfileCard`).
- *The Rule:* If a component knows *what* business data it represents, it is a domain component; if it only knows *how* UI elements look and interact, it is a reusable primitive.

**Compound Components vs. Mega Configuration Objects**
- **Compound Components:** Deconstructs a complex UI into cooperating sub-components (`Tabs.Root`, `Tabs.List`, `Tabs.Trigger`, `Tabs.Content`) that share state via Context.
- **Mega Config Component:** Takes a single massive props object (`<Tabs items={[{ id, label, content, icon }]} />`) and renders a hardcoded internal template.
- *The Rule:* Use compound components when the layout, presence, or ordering of sub-elements varies across features; use a simple config component only for strictly uniform, non-customizable lists.

**`as` Prop vs. `asChild` (Radix Slot)**
- **`as` Prop:** Dynamically switches the rendered element tag or component via runtime props (`<Button as={Link} />`). Requires complex TypeScript generics and risks prop collisions.
- **`asChild` (Slot):** Clones the direct JSX child and merges styles, attributes, and refs onto it (`<Button asChild><Link href="/home">Home</Link></Button>`). Produces clean DOM trees, perfect native typing, and zero wrapper pollution.
- *The Rule:* Use the `asChild` Slot pattern for modern, polymorphic component architecture.

**Headless UI vs. Styled UI Libraries**
- **Headless UI (Radix Primitives, React Aria):** Provides accessibility, keyboard navigation, and state machines with zero CSS.
- **Styled Libraries (MUI, Ant Design):** Provides pre-styled, ready-to-render components with built-in visual themes.
- *The Rule:* Use Headless UI + Tailwind/CVA when you need a 100% bespoke, custom-branded design system; use Styled Libraries when build speed for internal tools outweighs custom brand design.

## 8. 🧠 The Memory Hook

A reusable component is a **shipping container**, not a **custom delivery truck**. It standardizes the exterior interface (prop forwarding, variants, accessibility) and keeps the interior empty for the caller to fill (composition, slots). The moment a UI component imports an API client, hardcodes a margin, or adds its fifth boolean flag, it stopped being a reusable primitive and became a broken delivery truck in disguise.

