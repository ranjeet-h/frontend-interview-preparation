# React Design Patterns

## 1. Why This Exists — The Problem First

You copy-paste fetch logic into five components. Modals stack wrong because z-index and state live in random places. Every parent passes `user` and `setUser` through four layers of props. Someone wraps a component in a HOC inside another HOC and debugging becomes archaeology.

React doesn't force one architecture — that's a feature and a trap. **Patterns** are how teams agree on where state lives, how logic is reused, and how components stay testable. Senior interviews don't ask "what is a hook" — they ask whether you'd reach for composition, a custom hook, or context for a given problem.

## 2. The Analogy — Make It Obvious

React components are **employees in a company**.

**Presentational components** are customer-facing staff — they follow a script (props) and display information. They don't call the warehouse.

**Container components** (or hooks today) are managers — they call APIs, hold state, and hand props down to presenters.

**Custom hooks** are **internal playbooks** — "how we always handle fetching" extracted so every manager doesn't rewrite the same procedure.

**Context** is the **company bulletin board** — fine for info everyone needs (theme, locale), terrible if every desk runs to the board every second for everything.

**HOCs and render props** are older ways to **loan an employee a temporary uniform** with extra powers — still valid, but hooks often fit better now.

## 3. How It Actually Works — The Full Explanation

**Component composition**  
Build UIs by nesting components and passing `children`. Layout shells, card + card body, modal frame + arbitrary content. Prefer `children` and small prop APIs over props drilling configuration objects.

**Container / Presentational**  
Split data/logic from pure UI. Presentational: no data fetching, mostly functions of props, easy to snapshot test. Container: hooks, effects, stores. With hooks, the "container" is often just a parent that calls `useProducts()` and passes results to `<ProductList items={items} />`.

**Lifting state up**  
Shared state moves to closest common ancestor. Sibling components sync through parent. When drilling gets deep → context or external store.

**Controlled vs uncontrolled**  
Controlled: React state is source of truth for input value (`value` + `onChange`). Uncontrolled: DOM holds state (`ref` + `defaultValue`). Controlled for most forms; uncontrolled for simple file inputs or integrating non-React widgets.

**Custom hooks**  
Extract stateful logic: `useFetch`, `useDebounce`, `useLocalStorage`, `useMediaQuery`. Share behavior without wrapper component trees. Rules of Hooks apply — only call at top level of React functions.

**Context**  
Avoid prop drilling for **stable, widely needed** values: theme, auth user, i18n. Split contexts (ThemeContext vs UserContext) to limit re-renders. Not a replacement for Redux for high-frequency updates — context changes re-render all consumers unless split/memoized.

**Higher-Order Components (HOC)**  
`function withAuth(Component) { return function Wrapped(props) { ... } }`  
Adds props or behavior. Downsides: wrapper hell, ref forwarding (`forwardRef`), DevTools nesting. Hooks often replace.

**Render props**  
`<DataFetcher render={(data) => <List items={data} />} />`  
Share logic via function prop. Flexible; can cause awkward JSX. Custom hooks usually cleaner today.

**Compound components**  
Related components share implicit state via context — `<Select>`, `<Select.Option>`. API feels cohesive (Radix, Headless UI style).

**Conditional rendering**  
`{isLoggedIn ? <Dashboard /> : <Login />}`, `{error && <Alert />}`, early returns for loading/error states. Keep branches readable — extract subcomponents when messy.

**Memoization patterns**  
`React.memo` for expensive pure components, `useMemo` for expensive calculations, `useCallback` for stable function refs passed to memoized children. Don't memo everything — measure first.

## 4. Real Code — See It Working

Custom hook replacing duplicated fetch logic:

```javascript
function useFetch(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [url]);

  return { data, error, loading };
}
```

Presentational + container split:

```javascript
function ProductList({ products, onAddToCart }) {
  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>
          {p.name} — ${p.price}
          <button type="button" onClick={() => onAddToCart(p.id)}>Add</button>
        </li>
      ))}
    </ul>
  );
}

function ProductPage() {
  const { data, loading, error } = useFetch('/api/products');
  const addToCart = useCart().add;

  if (loading) return <p>Loading…</p>;
  if (error) return <p>Something went wrong</p>;
  return <ProductList products={data} onAddToCart={addToCart} />;
}
```

Compound component sketch:

```javascript
const TabsContext = createContext(null);

function Tabs({ children, defaultTab }) {
  const [active, setActive] = useState(defaultTab);
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      {children}
    </TabsContext.Provider>
  );
}

Tabs.List = function TabsList({ children }) { /* ... */ };
Tabs.Panel = function TabsPanel({ id, children }) { /* ... */ };
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are common React design patterns?**

Composition, container/presentational split, lifting state, custom hooks, context for shared stable state, controlled components, compound components, conditional rendering. HOCs and render props for logic reuse (legacy/heavy libs).

**Q: Custom hooks vs HOCs?**

Hooks share logic without component nesting, avoid ref issues, simpler DevTools. HOCs still appear in older codebases and some libraries. Prefer hooks for new code.

**Q: When use Context vs Redux/Zustand?**

Context: low-frequency updates, theme, locale, auth snapshot. External store: many updates, complex middleware, devtools time-travel, selectors for fine-grained subscriptions. Context alone re-renders all consumers on any value change.

**Q: Controlled vs uncontrolled components?**

Controlled: React state drives input value. Uncontrolled: DOM/ref holds value. Controlled for predictable forms and validation; uncontrolled occasionally for files or third-party widgets.

**Q: What is lifting state up?**

Move shared state to parent of components that need it. Single source of truth, data flows down via props, events flow up via callbacks.

## 6. The Traps — What Goes Wrong

**Context for everything** — performance death by re-renders.

**God components** — 800 lines mixing fetch, form, modal, table. Split.

**Custom hook that returns 20 values** — hard to use; split hooks or use object return with clear names.

**Premature `useMemo`/`memo`** — complexity without measurement.

**Prop drilling 8 levels** — sign you need context or colocated state (move state down if only one branch needs it).

**Copying class lifecycle patterns into effects** — think synchronization, not translation chart from `componentDidMount`.

## 7. Compare With Related Concepts

**React patterns vs general design patterns.** Observer ≈ state subscription. Strategy ≈ swapping render or hook implementation. Adapter ≈ wrapper component around non-React widget.

**Server state vs client state.** TanStack Query for server cache; useState/context/Zustand for UI state. Don't stuff API cache in Context.

**React Server Components.** Server components fetch on server — shifts some "container" logic off client. Client patterns still apply to interactive islands.

## 8. 🧠 The Memory Hook — What Sticks

Hooks are playbooks, composition is Lego, context is the bulletin board (don't post every heartbeat). Presentational components take props and shut up about fetch; shared logic lives in custom hooks, not copy-paste.
