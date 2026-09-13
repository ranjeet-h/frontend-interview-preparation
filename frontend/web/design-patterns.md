# Frontend Design Patterns

## 1. Why This Exists — The Problem First

Every feature starts as a quick hack. Six months later you have three different ways to fetch data, components that know about the entire app state, and a "utils" folder that's a graveyard of copy-paste. New features take longer than the first version of the whole app.

Design patterns aren't academic fluff. They're **named solutions to problems that keep happening** — so your team recognizes "this is an observer situation" instead of reinventing a broken pub/sub from scratch. In frontend, the problems are UI state, composition, and communication between parts of the app.

## 2. The Analogy — Make It Obvious

Building a house without patterns: every door is a custom invention, electricians run wires differently in each room, and nobody knows which switch controls what.

Patterns are **standard blueprints** — "this is how we do doors," "this is how we route electricity." You still design each room, but you're not guessing whether the door should swing into the wall or through it.

**Creational** — how you manufacture things (one factory for all chair types).  
**Structural** — how pieces fit together (adapter plug for foreign outlets).  
**Behavioral** — how parts talk (observer: when the thermostat changes, every radiator hears about it).

Frontend lives mostly in **behavioral** (observer, strategy) and **structural** (adapter, decorator, composition).

## 3. How It Actually Works — The Full Explanation

**Observer (Pub/Sub)**  
When state changes, multiple UI pieces need to update. A **subject** notifies **observers** without knowing each one in detail.

Frontend: Redux/Zustand subscriptions, DOM events, `EventEmitter`, React context consumers re-rendering when value changes. The pattern is everywhere — UI is a function of state; many components observe the same state.

**Strategy**  
Swap algorithms at runtime without changing the client. Payment method (card vs PayPal), sorting (price vs rating), validation rules per country.

```javascript
const strategies = {
  us: validateUS,
  eu: validateEU,
};
strategies[region](formData);
```

**Module / Revealing Module**  
Encapsulate private state, expose public API. ES modules (`export`), IIFE modules in legacy code. Prevents global namespace pollution.

**Composition over inheritance**  
Build complex UI by combining small components rather than deep class hierarchies. React's entire model — props in, JSX out, nest components.

**Container / Presentational** (historical but still useful concept)  
Smart components fetch and coordinate; dumb components render props. Hooks moved logic into functions, but separation of "data orchestration" vs "pure display" remains valuable.

**Adapter**  
Wrap a third-party API to match your app's interface. Wrap `localStorage` behind `StorageService` so you can swap to `sessionStorage` or mock in tests.

**Decorator (HOC pattern)**  
Wrap a component to add behavior — logging, auth check, data fetching. React HOCs: `withAuth(Dashboard)`. Largely replaced by hooks (`useAuth`) but the idea persists.

**Singleton**  
One shared instance — app config, analytics client, connection pool. Careful in frontend tests (reset between tests).

**Factory**  
Create objects/components based on type — `createNotification('error', message)` returns the right toast component.

Patterns aren't rules to force everywhere. They're vocabulary for tradeoffs in code review: "This should be an observer, not polling every second."

## 4. Real Code — See It Working

Observer with simple pub/sub:

```javascript
function createStore(initial) {
  let state = initial;
  const listeners = new Set();

  return {
    getState: () => state,
    setState: (next) => {
      state = typeof next === 'function' ? next(state) : next;
      listeners.forEach((fn) => fn(state));
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
```

Strategy for formatting:

```javascript
const formatters = {
  currency: (n) => `$${n.toFixed(2)}`,
  percent: (n) => `${(n * 100).toFixed(1)}%`,
};

function display(value, type) {
  return formatters[type](value);
}
```

Adapter for storage:

```javascript
export const userPrefs = {
  get(key) {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are design patterns in frontend development?**

Reusable solutions to common problems — structuring components, sharing state, integrating APIs. Examples: Observer for reactive UI, Strategy for swappable behavior, Module for encapsulation, Composition for building UIs from small pieces.

**Q: Which patterns matter most in modern frontend?**

Observer (state → UI updates), Module (ES modules, feature folders), Composition (component trees), Strategy (pluggable behavior). HOC/Render Props historically; hooks often replace them but same ideas.

**Q: Observer pattern example in frontend?**

State management stores notify subscribers on change. React re-renders when state/props change. Custom event buses for decoupled widgets.

**Q: Composition vs inheritance?**

Prefer composing small components with props over extending base classes. React docs explicitly favor composition — more flexible, easier to test, avoids fragile base classes.

**Q: When would you use the Adapter pattern?**

Wrapping external libraries (maps, payment SDK, analytics) behind your own interface so the rest of the app doesn't depend on vendor API details.

## 6. The Traps — What Goes Wrong

**Pattern obsession** — Factory for a one-off button. YAGNI.

**Global singleton state everywhere** — hard to test, unclear data flow. Scope state to features.

**HOC hell** — `withA(withB(withC(Component)))`. Hooks or composition flatten this.

**Confusing pattern names with frameworks** — "We use Redux so we use Observer" — know the underlying idea.

**Copying backend patterns blindly** — frontend constraints (rendering, user input, bundle size) differ.

## 7. Compare With Related Concepts

**Design patterns vs architecture.** Patterns are local solutions; architecture is app-wide structure (feature folders, micro-frontends, layered clean architecture).

**Patterns vs principles (SOLID).** Principles guide; patterns are concrete templates. Single Responsibility often leads to smaller presentational components.

**Design patterns vs React patterns.** React patterns (controlled components, lifting state) are domain-specific applications of general ideas.

## 8. 🧠 The Memory Hook — What Sticks

Patterns are standard blueprints for recurring messes — observer when many parts need the same news, strategy when the algorithm swaps, composition when you build UI from Lego blocks instead of one inheritance tower.
