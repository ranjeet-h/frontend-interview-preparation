<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" class="logo" width="120"/>

# i have 4 years of experience in frontend development i want 40 react only programming coding questions and answers that i can prepare for interviews

 Interview questions will move beyond basic concepts and focus on practical application, performance, and advanced patterns. This list of 40 React coding questions is designed to test your ability to build robust, scalable, and optimized components, with a strong emphasis on modern hooks and best practices[^1][^2].

### Custom Hooks

Custom hooks are a key indicator of an experienced React developer's ability to create reusable and clean logic.

**1. Create a `useToggle` hook.**
*Implement a hook that takes an initial boolean value and returns the current state and a function to toggle it.*

```jsx
import { useState, useCallback } from 'react';

export const useToggle = (initialState = false) => {
  const [state, setState] = useState(initialState);
  const toggle = useCallback(() => setState(s => !s), []);
  return [state, toggle];
};

// --- Usage ---
function App() {
  const [isOn, toggleIsOn] = useToggle(false);
  return <button onClick={toggleIsOn}>{isOn ? 'ON' : 'OFF'}</button>;
}
```

**Key Concepts:** Reusability, `useState`, `useCallback` for a stable toggle function[^2].

**2. Create a `useFetch` hook.**
*Implement a hook to fetch data from an API, handling loading and error states.*

```jsx
import { useState, useEffect } from 'react';

export const useFetch = (url) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error('Network response was not ok');
        const json = await res.json();
        setData(json);
        setError(null);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    return () => controller.abort(); // Cleanup function
  }, [url]);

  return { data, loading, error };
};
```

**Key Concepts:** `useEffect` for side effects, dependency arrays, state management for async operations, and cleanup functions for aborting requests[^3].

**3. Create a `useLocalStorage` hook.**
*Implement a hook to sync a component's state with `localStorage`.*

```jsx
import { useState, useEffect } from 'react';

export const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.log(error);
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.log(error);
    }
  };

  return [storedValue, setValue];
};
```

**Key Concepts:** Interacting with browser APIs, lazy initialization in `useState`, handling potential errors from `JSON.parse` or `localStorage`.

**4. Create a `useDebounce` hook.**
*Implement a hook that debounces a value.*

```jsx
import { useState, useEffect } from 'react';

export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup the timeout if value or delay changes
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};
```

**Key Concepts:** `useEffect` with cleanup, `setTimeout`, managing side effects based on changing props or state.

**5. Create a `usePrevious` hook.**
*Implement a hook to track the previous value of a prop or state.*

```jsx
import { useRef, useEffect } from 'react';

export const usePrevious = (value) => {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
};
```

**Key Concepts:** `useRef` for storing mutable values that don't cause a re-render, `useEffect` execution timing (after render).

### Performance Optimization

Questions in this area test your understanding of what causes re-renders and how to prevent them[^2].

**6. Fix an unnecessary re-render with `React.memo`.**
*Given a parent passing props to a child, prevent the child from re-rendering if its props haven't changed.*

```jsx
import React, { useState } from 'react';

const ExpensiveChild = React.memo(({ data }) => {
  console.log('Child rendered');
  return <div>{data.name}</div>;
});

function Parent() {
  const [count, setCount] = useState(0);
  const childData = { name: 'Stable' };

  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>Increment: {count}</button>
      <ExpensiveChild data={childData} />
    </>
  );
}
```

**Explanation:** `React.memo` performs a shallow comparison of props. Since `childData` is a stable object reference, `ExpensiveChild` will not re-render when the parent's `count` state changes.

**7. Fix a `React.memo` component that still re-renders due to a callback function.**
*Use `useCallback` to memoize a function passed as a prop.*

```jsx
import React, { useState, useCallback } from 'react';

const Child = React.memo(({ onAction }) => {
  console.log('Child rendered');
  return <button onClick={onAction}>Click Me</button>;
});

function Parent() {
  const [count, setCount] = useState(0);
  
  // Without useCallback, this function is recreated on every render.
  const handleAction = useCallback(() => {
    console.log('Action!');
  }, []);

  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>Increment: {count}</button>
      <Child onAction={handleAction} />
    </>
  );
}
```

**Key Concepts:** Referential equality, `useCallback` to preserve a function's identity across renders[^2].

**8. Optimize an expensive calculation with `useMemo`.**
*Given a component that performs a heavy computation on every render, use `useMemo` to optimize it.*

```jsx
import React, { useState, useMemo } from 'react';

const expensiveCalculation = (num) => {
  console.log('Calculating...');
  // Simulate a heavy task
  for (let i = 0; i < 1000000000; i++) {}
  return num * 2;
};

function Calculator({ num }) {
  const [count, setCount] = useState(0);

  const calculationResult = useMemo(() => expensiveCalculation(num), [num]);

  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>Rerender: {count}</button>
      <p>Number: {num}, Calculation: {calculationResult}</p>
    </>
  );
}
```

**Key Concepts:** Memoizing computed values, dependency arrays for re-computation[^2].

**9. Render a large list of items efficiently.**
*Create a basic "windowed" or "virtualized" list component that only renders the items currently in the viewport.*

```jsx
// This is a complex problem, so a simplified outline is expected.
function VirtualizedList({ items, itemHeight, containerHeight }) {
  const [scrollTop, setScrollTop] = useState(0);

  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    items.length - 1,
    Math.floor((scrollTop + containerHeight) / itemHeight)
  );

  const visibleItems = items.slice(startIndex, endIndex + 1);

  return (
    <div 
      style={{ height: containerHeight, overflowY: 'scroll' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: `${startIndex * itemHeight}px` }}>
          {visibleItems.map(item => (
            <div key={item.id} style={{ height: itemHeight }}>
              {item.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Key Concepts:** DOM performance, rendering only visible elements, calculating offsets.

**10. Create a component that defers rendering until it is visible using `IntersectionObserver`.**

```jsx
import React, { useState, useRef, useEffect } from 'react';

function LazyComponent({ children }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.unobserve(ref.current);
      }
    });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) observer.unobserve(ref.current);
    };
  }, []);

  return <div ref={ref}>{isVisible ? children : 'Loading...'}</div>;
}
```

**Key Concepts:** Browser APIs, `useRef` for DOM elements, lazy loading content.

### Component Design and Patterns

These questions test your ability to structure components and manage state flow.

**11. Build a controlled form component.**
*Create a form with an input field whose state is managed by React.*

```jsx
import { useState } from 'react';

function ControlledForm() {
  const [value, setValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    alert(`Submitted: ${value}`);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input 
        type="text" 
        value={value} 
        onChange={(e) => setValue(e.target.value)} 
      />
      <button type="submit">Submit</button>
    </form>
  );
}
```

**Key Concepts:** Single source of truth, managing form state with `useState`.

**12. Build an uncontrolled form component.**
*Create a form where the input state is handled by the DOM, and you retrieve it using a ref.*

```jsx
import { useRef } from 'react';

function UncontrolledForm() {
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    alert(`Submitted: ${inputRef.current.value}`);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" ref={inputRef} />
      <button type="submit">Submit</button>
    </form>
  );
}
```

**Key Concepts:** `useRef` for DOM access, when to let the DOM manage state.

**13. Implement a star rating component.**
*Create a component that allows users to select a rating from 1 to 5 stars.*

```jsx
import { useState } from 'react';

function Star({ filled, onClick }) {
  return <span onClick={onClick} style={{ cursor: 'pointer' }}>{filled ? '★' : '☆'}</span>;
}

function StarRating({ totalStars = 5 }) {
  const [rating, setRating] = useState(0);

  return (
    <div>
      {[...Array(totalStars)].map((_, i) => (
        <Star 
          key={i} 
          filled={i < rating} 
          onClick={() => setRating(i + 1)}
        />
      ))}
    </div>
  );
}
```

**Key Concepts:** Component composition, managing state, rendering lists from an array.

**14. Create a reusable `Modal` component using a portal.**

```jsx
import ReactDOM from 'react-dom';

function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay">
      <div className="modal-content">
        <button onClick={onClose}>Close</button>
        {children}
      </div>
    </div>,
    document.getElementById('modal-root')
  );
}
```

**Key Concepts:** Portals for rendering outside the parent DOM tree, event bubbling.

**15. Build a simple accordion component.**

```jsx
import { useState } from 'react';

function Accordion({ items }) {
  const [activeIndex, setActiveIndex] = useState(null);

  const onTitleClick = (index) => {
    setActiveIndex(index === activeIndex ? null : index);
  };

  return (
    <div>
      {items.map((item, index) => (
        <div key={item.title}>
          <div onClick={() => onTitleClick(index)}>{item.title}</div>
          {index === activeIndex && <div>{item.content}</div>}
        </div>
      ))}
    </div>
  );
}
```

**Key Concepts:** Conditional rendering, managing state for UI elements.

**16. Implement a tabs component.**

```jsx
import { useState } from 'react';

function Tabs({ items }) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div>
      <div>
        {items.map((item, index) => (
          <button key={index} onClick={() => setActiveTab(index)}>
            {item.label}
          </button>
        ))}
      </div>
      <div>{items[activeTab].content}</div>
    </div>
  );
}
```

**Key Concepts:** State management, dynamic content rendering based on state.

**17. Create a Higher-Order Component (HOC) `withLogger`.**
*Create an HOC that logs props when a component mounts and updates.*

```jsx
import React, { useEffect } from 'react';

const withLogger = (WrappedComponent) => {
  return (props) => {
    useEffect(() => {
      console.log(`Component ${WrappedComponent.name} mounted/updated with props:`, props);
    }, [props]);

    return <WrappedComponent {...props} />;
  };
};
```

**Key Concepts:** HOC pattern, props proxying, `useEffect` for lifecycle-like behavior.

**18. Create a component that renders its children using a render prop.**

```jsx
import { useState } from 'react';

function MouseTracker({ render }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    setPosition({ x: e.clientX, y: e.clientY });
  };

  return (
    <div style={{ height: '100vh' }} onMouseMove={handleMouseMove}>
      {render(position)}
    </div>
  );
}

// Usage: <MouseTracker render={position => <p>X: {position.x}, Y: {position.y}</p>} />
```

**Key Concepts:** Render prop pattern for sharing logic.

**19. Show how to lift state up.**
*Create two sibling input components that display the same value, managed by a common parent.*

```jsx
import { useState } from 'react';

function Input({ value, onChange }) {
  return <input value={value} onChange={onChange} />;
}

function Parent() {
  const [value, setValue] = useState('');
  const handleChange = (e) => setValue(e.target.value);
  
  return (
    <>
      <Input value={value} onChange={handleChange} />
      <Input value={value} onChange={handleChange} />
    </>
  );
}
```

**Key Concepts:** Single source of truth, passing state down and events up.

**20. Build a component to render a tree structure recursively.**

```jsx
function TreeNode({ node }) {
  return (
    <li>
      {node.name}
      {node.children && (
        <ul>
          {node.children.map(child => <TreeNode key={child.id} node={child} />)}
        </ul>
      )}
    </li>
  );
}

function Tree({ data }) {
  return <ul><TreeNode node={data} /></ul>;
}
```

**Key Concepts:** Recursion in components, rendering nested data structures.

### State Management \& Hooks

This section dives deeper into React's built-in state management tools.

**21. Refactor a component from `useState` to `useReducer` for complex state.**
*Convert a component managing multiple related state values into one using `useReducer`.*

```jsx
import { useReducer } from 'react';

const initialState = { count: 0, step: 1 };

function reducer(state, action) {
  switch (action.type) {
    case 'increment': return { ...state, count: state.count + state.step };
    case 'decrement': return { ...state, count: state.count - state.step };
    case 'setStep': return { ...state, step: action.payload };
    default: throw new Error();
  }
}

function Counter() {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <>
      <p>Count: {state.count}</p>
      <button onClick={() => dispatch({ type: 'increment' })}>+</button>
      <input value={state.step} onChange={e => dispatch({type: 'setStep', payload: Number(e.target.value)})} />
    </>
  );
}
```

**Key Concepts:** `useReducer` for predictable state transitions, dispatching actions.

**22. Implement a theme switcher using `useContext`.**
*Create a `ThemeProvider` and a `useTheme` hook to provide theme data to nested components.*

```jsx
import React, { createContext, useState, useContext } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('light');
  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);

// --- Usage ---
function ThemedButton() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>Current theme: {theme}</button>;
}
```

**Key Concepts:** `createContext`, `useContext`, Provider pattern for avoiding prop drilling.

**23. Create a timer that can be started, stopped, and reset.**

```jsx
import { useState, useRef, useEffect } from 'react';

function Timer() {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTime(t => t + 1);
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  return (
    <div>
      <p>{time}s</p>
      <button onClick={() => setIsRunning(!isRunning)}>{isRunning ? 'Stop' : 'Start'}</button>
      <button onClick={() => setTime(0)}>Reset</button>
    </div>
  );
}
```

**Key Concepts:** `useEffect` cleanup for intervals, `useRef` to hold a mutable value (the interval ID) across renders.

**24. What is wrong with this `useEffect`? Fix it.**

```jsx
// Problematic Code
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`).then(res => res.json()).then(setUser);
  }, []); // The bug is here
}
```

```jsx
// Corrected Code
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`).then(res => res.json()).then(setUser);
  }, [userId]); // Add userId to the dependency array
}
```

**Explanation:** If `userId` changes, the effect will not re-run because it's not in the dependency array. This leads to stale data being displayed.

**25. Implement a simple "undo" functionality for a text input.**

```jsx
import { useState } from 'react';

function UndoableInput() {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState([]);

  const handleChange = (e) => {
    setHistory([...history, value]);
    setValue(e.target.value);
  };

  const handleUndo = () => {
    if (history.length > 0) {
      const previousValue = history[history.length - 1];
      setValue(previousValue);
      setHistory(history.slice(0, -1));
    }
  };

  return (
    <>
      <input value={value} onChange={handleChange} />
      <button onClick={handleUndo} disabled={history.length === 0}>Undo</button>
    </>
  );
}
```

**Key Concepts:** State design, managing a history stack.

### Remaining Questions (26-40): Short-form Challenges

26. **Build an auto-focusing input field on mount.** (Use `useRef` and `useEffect`).
27. **Create a component that fetches and displays a list of GitHub repos for a user.** (Use the `useFetch` hook).
28. **Implement a character counter for a `textarea`.** (Use `useState` and `onChange`).
29. **Build a component that toggles between two child components.** (Use `useState` and conditional rendering).
30. **Show how to pass a ref to a custom component using `React.forwardRef`.**
31. **Create a multi-step form wizard.** (Manage current step and form data in parent state).
32. **Build a component that detects clicks outside of itself.** (Use `useEffect` with a `mousedown` event listener on `document`).
33. **Implement an infinite scroll component.** (Use `IntersectionObserver` at the bottom of a list to trigger more data fetching).
34. **Refactor a class component with `state` and `componentDidMount` to a functional component with hooks.**
35. **Create a simple search filter for a list of items.** (Filter the list based on an input's value).
36. **Build a component that displays the current window width and height, updating on resize.** (Use `useEffect` with a `resize` event listener).
37. **Show how to use the `key` prop correctly when rendering a list where items can be added or removed.**
38. **Implement an "optimistic update" for a "like" button.** (Update UI immediately, then revert if the API call fails).
39. **Create a component that throws an error to be caught by an Error Boundary.**
40. **Combine `useContext` and `useReducer` to create a simple Redux-like store.** (The provider holds the `dispatch` function and `state`).

<div style="text-align: center">⁂</div>



<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" class="logo" width="120"/>

# give me what will be the output like questions for react coding where it covers all the react concepts like memo, useCallback, all hooks like context and redux etc all where interviewer shows me code asks for what will be the out put give me at least 40 such questions

Of course. Here are over 40 "What will be the output?" questions designed for an experienced React developer, covering hooks, performance, state management, and more.

### `useState` and Re-renders

**1. Basic State Update**

```jsx
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  console.log('Render');

  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  );
}
// Assume the user clicks the button once.
```

**Output:**

```
Render
Render
// On screen: Count: 1
```

**Explanation:** The initial render logs "Render" and displays a count of 0. Clicking the button updates the state, triggering a re-render, which logs "Render" again and displays the new count of 1.

**2. Stale State in Closures**

```jsx
import { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);
  };

  return <button onClick={handleClick}>Count: {count}</button>;
}
// Assume the user clicks the button once.
```

**Output on screen:**

```
Count: 1
```

**Explanation:** All three `setCount` calls use the `count` value from the initial render's closure (which is 0). React batches these state updates, and each call effectively sets the count to `0 + 1`. The final state is 1.

**3. Functional State Updates**

```jsx
import { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    setCount(prevCount => prevCount + 1);
    setCount(prevCount => prevCount + 1);
    setCount(prevCount => prevCount + 1);
  };

  return <button onClick={handleClick}>Count: {count}</button>;
}
// Assume the user clicks the button once.
```

**Output on screen:**

```
Count: 3
```

**Explanation:** The functional update form of `setCount` receives the most up-to-date state. React queues these updates and applies them in order, correctly incrementing the count three times.

**4. State Update with Object**

```jsx
import { useState } from 'react';

function App() {
  const [user, setUser] = useState({ name: 'Alex', age: 30 });

  const handleClick = () => {
    setUser({ age: 31 });
  };

  return (
    <div onClick={handleClick}>
      {user.name}, {user.age}
    </div>
  );
}
// Assume the user clicks the div.
```

**Output on screen:**

```
, 31
```

**Explanation:** The `setUser` call replaces the entire state object. Since the new object doesn't have a `name` property, `user.name` becomes `undefined` after the update.

### `useEffect` and Side Effects

**5. `useEffect` Execution Order**

```jsx
import { useState, useEffect } from 'react';

function App() {
  console.log('A: Component Render');

  useEffect(() => {
    console.log('C: useEffect callback');
    return () => {
      console.log('D: useEffect cleanup');
    };
  }, []);

  return <div>{console.log('B: JSX Render')}</div>;
}
// Then the component unmounts.
```

**Output:**

```
A: Component Render
B: JSX Render
C: useEffect callback
D: useEffect cleanup
```

**Explanation:** The component body executes first (A, B). After the component mounts to the DOM, `useEffect` runs (C). The cleanup function (D) only runs when the component unmounts.

**6. `useEffect` with Dependencies**

```jsx
import { useState, useEffect } from 'react';

function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    console.log(`Effect ran: ${count}`);
  }, [count]);

  return <button onClick={() => setCount(count + 1)}>Click</button>;
}
// Assume the user clicks the button twice.
```

**Output:**

```
Effect ran: 0 // Initial render
Effect ran: 1 // First click
Effect ran: 2 // Second click
```

**Explanation:** The effect runs after the initial render and after every render where the `count` value has changed.

**7. Stale `useEffect` Dependency**

```jsx
import { useState, useEffect } from 'react';

function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      console.log(`Interval count: ${count}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []); // Empty dependency array

  return <button onClick={() => setCount(c => c + 1)}>Increment</button>;
}
// Assume the user clicks the button after a few seconds.
```

**Output:**

```
Interval count: 0
Interval count: 0
Interval count: 0
// ...and so on, even after clicking
```

**Explanation:** The `useEffect` hook runs only once after the initial render. The `count` variable inside its closure is captured with its initial value of 0 and never updates.

**8. `useEffect` Cleanup Timing**

```jsx
import { useState, useEffect } from 'react';

function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    console.log(`Effect for ${count}`);
    return () => {
      console.log(`Cleanup for ${count}`);
    };
  }, [count]);

  return <button onClick={() => setCount(count + 1)}>Click Me</button>;
}
// Assume the user clicks the button once.
```

**Output:**

```
Effect for 0
// -- user clicks --
Cleanup for 0
Effect for 1
```

**Explanation:** When a dependency changes, the cleanup function from the *previous* render runs *before* the effect from the *current* render. This ensures cleanup happens before the next effect is set up.

### `useMemo` \& `useCallback`

**9. `React.memo` with a Non-memoized Callback**

```jsx
import React, { useState } from 'react';

const Child = React.memo(({ onAction }) => {
  console.log('Child Rendered');
  return <button onClick={onAction}>Click</button>;
});

function Parent() {
  const [count, setCount] = useState(0);
  const handleAction = () => console.log('Action');

  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>Parent Click</button>
      <Child onAction={handleAction} />
    </>
  );
}
// Assume the user clicks the "Parent Click" button.
```

**Output:**

```
Child Rendered
```

**Explanation:** Even though `Child` is memoized, `Parent` re-renders and creates a *new* `handleAction` function instance. Since the prop `onAction` is a new function reference, `React.memo`'s shallow comparison fails, and the child re-renders.

**10. Fixing Re-renders with `useCallback`**

```jsx
import React, { useState, useCallback } from 'react';

const Child = React.memo(({ onAction }) => {
  console.log('Child Rendered');
  return <button onClick={onAction}>Click</button>;
});

function Parent() {
  const [count, setCount] = useState(0);
  const handleAction = useCallback(() => console.log('Action'), []);

  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>Parent Click</button>
      <Child onAction={handleAction} />
    </>
  );
}
// Assume the user clicks the "Parent Click" button.
```

**Output:**

```
// (nothing is logged)
```

**Explanation:** `useCallback` memoizes the `handleAction` function. When `Parent` re-renders, `handleAction` maintains the same function reference. `React.memo` sees that the `onAction` prop hasn't changed, so it skips re-rendering the `Child` component[^1].

**11. `useMemo` for Expensive Calculations**

```jsx
import React, { useState, useMemo } from 'react';

const expensiveCalculation = (num) => {
  console.log('Calculating...');
  return num * 2;
};

function App({ num }) {
  const [count, setCount] = useState(0);
  const calculation = useMemo(() => expensiveCalculation(num), [num]);

  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>Rerender: {count}</button>
      <p>Result: {calculation}</p>
    </>
  );
}
// App is rendered with num=5. Then the "Rerender" button is clicked.
```

**Output:**

```
Calculating...
// (after click, nothing is logged from the calculation)
```

**Explanation:** `useMemo` caches the result of `expensiveCalculation`. The calculation only re-runs if `num` changes. Since only the internal `count` state changed, the cached value is reused, preventing the expensive calculation[^2].

**12. `useMemo` vs. `useCallback`**

```jsx
import { useMemo, useCallback } from 'react';

function App() {
  const memoizedValue = useMemo(() => {
    console.log('useMemo function ran');
    return () => console.log('Hello from memoized value');
  }, []);
  
  const memoizedCallback = useCallback(() => {
    console.log('Hello from memoized callback');
  }, []);

  console.log('Value is function:', typeof memoizedValue === 'function');
  console.log('Callback is function:', typeof memoizedCallback === 'function');

  return null;
}
```

**Output:**

```
useMemo function ran
Value is function: true
Callback is function: true
```

**Explanation:** `useMemo` calls the function and caches its **return value**. `useCallback` caches the **function definition itself**. Both can result in a memoized function, but their purpose is different. `useCallback(fn, deps)` is equivalent to `useMemo(() => fn, deps)`[^2].

### `useContext`

**13. Basic `useContext`**

```jsx
import React, { useContext, createContext } from 'react';

const ThemeContext = createContext('light');

function Display() {
  const theme = useContext(ThemeContext);
  return <div>Theme: {theme}</div>;
}

function App() {
  return (
    <ThemeContext.Provider value="dark">
      <Display />
    </ThemeContext.Provider>
  );
}
```

**Output on screen:**

```
Theme: dark
```

**Explanation:** The `Display` component consumes the value provided by the nearest `ThemeContext.Provider` up the tree, which is "dark"[^3].

**14. `useContext` with Default Value**

```jsx
const ThemeContext = createContext('light');

function Display() {
  const theme = useContext(ThemeContext);
  return <div>Theme: {theme}</div>;
}

function App() {
  return <Display />;
}
```

**Output on screen:**

```
Theme: light
```

**Explanation:** When a component using `useContext` is not wrapped in a corresponding Provider, it receives the default value passed to `createContext`.

**15. Context Re-renders**

```jsx
const CountContext = createContext(0);

const Child = () => {
  console.log('Child Rendered');
  return <div>Child</div>;
};

const Grandchild = () => {
  const count = useContext(CountContext);
  console.log('Grandchild Rendered');
  return <div>Count: {count}</div>;
};

function App() {
  const [count, setCount] = useState(0);
  return (
    <CountContext.Provider value={count}>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
      <Child />
      <Grandchild />
    </CountContext.Provider>
  );
}
// Assume the user clicks the button.
```

**Output:**

```
Grandchild Rendered
```

**Explanation:** When the value of a Context Provider changes, only the components that *consume* that context (`Grandchild`) will re-render. `Child` does not call `useContext`, so it is not affected by the provider's value change. (Note: In older versions of React or with non-memoized children, `Child` might re-render simply because its parent `App` re-rendered).

### `useReducer`

**16. Basic `useReducer`**

```jsx
import { useReducer } from 'react';

const reducer = (state, action) => {
  if (action.type === 'INCREMENT') return { count: state.count + 1 };
  return state;
};

function App() {
  const [state, dispatch] = useReducer(reducer, { count: 0 });
  return <button onClick={() => dispatch({ type: 'INCREMENT' })}>Count: {state.count}</button>;
}
// Assume the user clicks the button.
```

**Output on screen:**

```
Count: 1
```

**Explanation:** Clicking the button dispatches an action to the reducer. The reducer calculates the new state based on the current state and the action, and returns it.

### More "What will be the output?" Questions (17-40)

17. **`useRef` for a Counter:** What is logged when the button is clicked?
    ```jsx
    function App() {
      const countRef = useRef(0);
      return <button onClick={() => { countRef.current++; console.log(countRef.current); }}>Click</button>;
    }
    ```
    **Output:** `1` is logged, but the component does not re-render.
    18. **Strict Mode Double `useEffect`:** In `<React.StrictMode>`, what is logged?
    ```jsx
    useEffect(() => {
      console.log('Effect setup');
      return () => console.log('Effect cleanup');
    }, []);
    ```
    **Output:** `Effect setup`, `Effect cleanup`, `Effect setup`. (Strict Mode intentionally double-invokes effects in development to find bugs).
    19. **Keys and Component State:** What happens when the "Switch" button is clicked?
    ```jsx
    function Counter() {
      const [count, setCount] = useState(0);
      return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
    }
    function App() {
      const [isFirst, setIsFirst] = useState(true);
      return (
        <>
          <button onClick={() => setIsFirst(!isFirst)}>Switch</button>
          {isFirst ? <Counter key="a" /> : <Counter key="b" />}
        </>
      );
    }
    ```
    **Output:** The counter resets to 0. Changing the `key` causes React to unmount the old component and mount a new one, destroying its state.
    20. **Asynchronous `setState`:** What is logged?

```jsx
function App() {
  const [count, setCount] = useState(0);
  const handleClick = () => {
    setCount(1);
    console.log(count);
  };
  return <button onClick={handleClick}>Click</button>;
}
```

**Output:** `0`. State updates are asynchronous; the `count` variable still holds the value from the current render.
21. **Initial `useReducer` State:** What is logged on the initial render?

```jsx
const init = (initialCount) => ({ count: initialCount + 5 });
const reducer = (state, action) => state;
function App() {
  const [state, dispatch] = useReducer(reducer, 10, init);
  console.log(state.count);
  return null;
}
```

**Output:** `15`. The `init` function is used to calculate the initial state.
22. **`forwardRef` and `useImperativeHandle`:** What is logged when the button is clicked?

```jsx
const Child = React.forwardRef((props, ref) => {
  useImperativeHandle(ref, () => ({
    sayHi: () => console.log('Hi')
  }));
  return <input />;
});
function Parent() {
  const childRef = useRef();
  return (
    <>
      <Child ref={childRef} />
      <button onClick={() => childRef.current.sayHi()}>Focus</button>
    </>
  );
}
```

**Output:** `Hi`. `useImperativeHandle` customizes the instance value exposed to parent components when using `ref`.
23. **Context with No Provider:** What is rendered?

```jsx
const UserContext = createContext({ name: 'Guest' });
function Greeter() {
  const user = useContext(UserContext);
  return <p>Hello, {user.name}</p>;
}
// No <UserContext.Provider> is used in the tree.
```

**Output:** `Hello, Guest`. The default context value is used.
24. **Stale `useCallback` Dependency:** What is logged on the second click?

```jsx
function App() {
  const [count, setCount] = useState(0);
  const logCount = useCallback(() => {
    console.log(`Current count is: ${count}`);
  }, []); // Missing dependency
  return (
    <>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <button onClick={logCount}>Log Count</button>
    </>
  );
}
```

**Output:** `Current count is: 0`. The `logCount` function is memoized with a stale closure where `count` is 0.
25. **`Object.is` Comparison in `useState`:** Does the component re-render?

```jsx
function App() {
  const [user, setUser] = useState({ name: 'John' });
  console.log('Render');
  return <button onClick={() => setUser(user)}>Click</button>;
}
```

**Output:** `Render` is logged only once. React uses `Object.is` to compare states, and since the object reference is the same, it bails out of the update.
26. **Render Prop Pattern:** What is rendered?

```jsx
const DataProvider = ({ render }) => render({ data: 'Hello World' });
const App = () => <DataProvider render={props => <h1>{props.data}</h1>} />;
```

**Output:** An `h1` tag with the text `Hello World`.
27. **HOC Prop Merging:** What is rendered for `user.name`?

```jsx
const withUser = (Component) => (props) => <Component {...props} user={{ name: 'HOC User' }} />;
const MyComponent = ({ user }) => <p>{user.name}</p>;
const EnhancedComponent = withUser(MyComponent);
const App = () => <EnhancedComponent user={{ name: 'Prop User' }} />;
```

**Output:** `HOC User`. The prop from the HOC overwrites the prop passed to the enhanced component because of the spread order.
28. **Conditional Hook Call (Error):** What is the result?

```jsx
function App({ shouldShow }) {
  if (shouldShow) {
    const [state, setState] = useState(0); // Error!
  }
  return <div>Test</div>;
}
```

**Output:** A runtime error: "React Hook "useState" is called conditionally. React Hooks must be called in the exact same order in every component render."
29. **Fragment vs. Div:** What is the DOM structure?

```jsx
// Case 1:
const App1 = () => <><p>A</p><p>B</p></>;
// Case 2:
const App2 = () => <div><p>A</p><p>B</p></div>;
```

**Output:** Case 1 renders two `<p>` tags as siblings. Case 2 renders a `<div>` that contains two `<p>` tags.
30. **Simulated Redux `connect`:** What happens when the `user` prop changes but `data` does not?

```jsx
// Assuming a memoized child connected to a store
const Child = React.memo(({ data }) => {
  console.log('Child Rendered');
  return <div>{data}</div>;
});
// The parent gets re-rendered with a new `user` prop
// but the `data` prop passed to Child is the same.
```

**Output:** `Child Rendered` is not logged. `React.memo` prevents the re-render.
31. **`useEffect` vs. `useLayoutEffect`:** What is the log order?

```jsx
function App() {
  useEffect(() => console.log('useEffect'));
  useLayoutEffect(() => console.log('useLayoutEffect'));
  return null;
}
```

**Output:** `useLayoutEffect`, then `useEffect`. `useLayoutEffect` runs synchronously after all DOM mutations but before the browser has painted.
32. **Passing `null` to `useState`:** What is `typeof value`?

```jsx
const [value, setValue] = useState(null);
console.log(typeof value);
```

**Output:** `object`. This is a quirk of JavaScript, where `typeof null` is "object".
33. **Event Bubbling:** Which log appears first?

```jsx
function App() {
  return (
    <div onClick={() => console.log('Parent')}>
      <button onClick={() => console.log('Child')}>Click</button>
    </div>
  );
}
```

**Output:** `Child`, then `Parent`. The event bubbles up from the button to the div.
34. **`e.stopPropagation()`:** What is logged?

```jsx
function App() {
  return (
    <div onClick={() => console.log('Parent')}>
      <button onClick={(e) => { e.stopPropagation(); console.log('Child'); }}>Click</button>
    </div>
  );
}
```

**Output:** `Child`. `stopPropagation` prevents the event from bubbling up to the parent `div`.
35. **Destructuring Props:** What is rendered if `user` prop is undefined?

```jsx
function Card({ user: { name } }) {
  return <div>{name}</div>;
}
// <Card /> is rendered without a user prop
```

**Output:** A runtime error: "TypeError: Cannot read properties of undefined (reading 'name')".
36. **Default Props for Destructuring:** How do you fix the previous example?

```jsx
function Card({ user: { name } = { name: 'Guest' } }) {
  return <div>{name}</div>;
}
// <Card /> is rendered
```

**Output:** `Guest`. A default value is provided for the destructured `user` object.
37. **State update with `NaN`:** Does the component re-render?

```jsx
const [value, setValue] = useState(NaN);
console.log('Render');
// Assume a button click calls setValue(NaN)
```

**Output:** `Render` is logged again. `Object.is(NaN, NaN)` is `true`, but React still triggers a re-render in this edge case for compatibility reasons.
38. **Lazy Initialization of `useState`:** When is `heavy() ` called?

```jsx
const heavy = () => { console.log('Heavy calc'); return 0; };
function App() {
  const [count, setCount] = useState(heavy());
  return <button onClick={() => setCount(c => c + 1)}>Click</button>;
}
```

**Output:** `Heavy calc` is logged on every render.
39. **Correct Lazy Initialization:** How do you fix the previous example?

```jsx
const heavy = () => { console.log('Heavy calc'); return 0; };
function App() {
  const [count, setCount] = useState(heavy); // Pass the function reference
  return <button onClick={() => setCount(c => c + 1)}>Click</button>;
}
```

**Output:** `Heavy calc` is logged only on the initial render. Passing a function to `useState` makes it a lazy initializer.
40. **Chained Promises in `useEffect`:** What is the log order?

```jsx
useEffect(() => {
  Promise.resolve().then(() => console.log('Promise 1'));
  console.log('Effect Sync');
  Promise.resolve().then(() => console.log('Promise 2'));
}, []);
```

**Output:** `Effect Sync`, `Promise 1`, `Promise 2`. Promises resolve asynchronously after the synchronous code in the effect has finished.

<div style="text-align: center">⁂</div>


<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" class="logo" width="120"/>

# last give me question what will be the output on useMemo and useCallback like renedering based 10 at least

Of course. Here are 11 "what will be the output" questions focused on `useMemo` and `useCallback`, specifically looking at how they impact component rendering.

### Rendering and Memoization Questions

**1. `React.memo` with a Non-Memoized Callback**

*Code:*

```jsx
import React, { useState } from 'react';

const ChildComponent = React.memo(({ onAction }) => {
  console.log('Child Rendered');
  return <button onClick={onAction}>Click Me</button>;
});

function Parent() {
  const [count, setCount] = useState(0);

  const handleAction = () => {
    console.log('Action triggered!');
  };

  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>Parent Count: {count}</button>
      <ChildComponent onAction={handleAction} />
    </>
  );
}

// Scenario: The user clicks the "Parent Count" button once.
```

**What is the output?**

```
Child Rendered
```

**Explanation:**
Even though `ChildComponent` is wrapped in `React.memo`, it re-renders. This is because the `handleAction` function is redefined on every render of the `Parent` component. Since a new function instance is a new reference, the `onAction` prop is considered "changed," causing `React.memo`'s shallow comparison to fail.

**2. Fixing Re-renders with `useCallback`**

*Code:*

```jsx
import React, { useState, useCallback } from 'react';

const ChildComponent = React.memo(({ onAction }) => {
  console.log('Child Rendered');
  return <button onClick={onAction}>Click Me</button>;
});

function Parent() {
  const [count, setCount] = useState(0);

  const handleAction = useCallback(() => {
    console.log('Action triggered!');
  }, []);

  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>Parent Count: {count}</button>
      <ChildComponent onAction={handleAction} />
    </>
  );
}

// Scenario: The user clicks the "Parent Count" button once.
```

**What is the output?**

```
// Nothing is logged to the console.
```

**Explanation:**
`useCallback` memoizes the `handleAction` function. Because its dependency array `[]` is empty, React returns the exact same function instance on every render. `React.memo` now sees that the `onAction` prop has not changed, so it correctly skips re-rendering the `ChildComponent`.

**3. Stale State in `useCallback`**

*Code:*

```jsx
import React, { useState, useCallback } from 'react';

function App() {
  const [count, setCount] = useState(0);

  const logCount = useCallback(() => {
    console.log(`The current count is: ${count}`);
  }, []); // Note the empty dependency array

  return (
    <>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <button onClick={logCount}>Log Count</button>
    </>
  );
}

// Scenario: The user clicks "Increment" three times, then clicks "Log Count".
```

**What is the output?**

```
The current count is: 0
```

**Explanation:**
The `logCount` function is created during the initial render when `count` is 0. Because the dependency array is empty, the function is never recreated. The `count` variable inside it is a stale closure, forever holding the value of 0 from the initial render.

**4. `useMemo` for Expensive Calculations**

*Code:*

```jsx
import React, { useState, useMemo } from 'react';

const fibonacci = (n) => {
  if (n <= 1) return 1;
  return fibonacci(n - 1) + fibonacci(n - 2);
};

function App() {
  const [num, setNum] = useState(10);
  const [theme, setTheme] = useState('dark');

  const result = useMemo(() => {
    console.log('Calculating Fibonacci...');
    return fibonacci(num);
  }, [num]);

  return (
    <div>
      <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        Toggle Theme
      </button>
      <p>Fibonacci of {num} is {result}</p>
    </div>
  );
}

// Scenario: The user clicks the "Toggle Theme" button.
```

**What is the output?**

```
// Nothing is logged to the console.
```

**Explanation:**
The `useMemo` hook caches the `result` of the expensive `fibonacci` calculation. When the component re-renders because the `theme` state changes, `useMemo` sees that its dependency (`num`) has not changed. It therefore returns the cached result without re-executing the calculation function.

**5. `useMemo` with an Unstable Object Dependency**

*Code:*

```jsx
import React, { useState, useMemo } from 'react';

function App() {
  const [count, setCount] = useState(0);
  const user = { name: 'Alex' }; // This object is recreated on every render

  const memoizedValue = useMemo(() => {
    console.log('useMemo ran');
    return `User: ${user.name}`;
  }, [user]);

  return <button onClick={() => setCount(c => c + 1)}>Re-render: {count}</button>;
}

// Scenario: The user clicks the "Re-render" button.
```

**What is the output?**

```
useMemo ran
```

**Explanation:**
The `useMemo` hook runs again. Although the content of the `user` object is the same, the object itself is a new instance created during the re-render. Since `useMemo` performs a shallow comparison of its dependencies, it sees a new object reference and re-runs the function.

**6. `useMemo` with a Stable Object Dependency**

*Code:*

```jsx
import React, { useState, useMemo } from 'react';

function App() {
  const [count, setCount] = useState(0);

  // The object is now memoized itself
  const user = useMemo(() => ({ name: 'Alex' }), []);

  const memoizedValue = useMemo(() => {
    console.log('useMemo ran');
    return `User: ${user.name}`;
  }, [user]);

  return <button onClick={() => setCount(c => c + 1)}>Re-render: {count}</button>;
}

// Scenario: The user clicks the "Re-render" button.
```

**What is the output?**

```
// Nothing is logged to the console.
```

**Explanation:**
This time, the `user` object itself is memoized with `useMemo` and an empty dependency array. This gives it a stable reference across re-renders. When the component re-renders, the `memoizedValue` hook compares the `user` dependency, sees that the reference has not changed, and skips re-running.

**7. `useMemo` vs. `useCallback` for returning functions**

*Code:*

```jsx
import { useMemo, useCallback } from 'react';

function App() {
  const callbackFunc = useCallback(() => 'hello', []);
  const memoFunc = useMemo(() => () => 'hello', []);

  console.log('Are the functions identical?', callbackFunc === memoFunc);

  return null;
}
```

**What is the output?**

```
Are the functions identical? false
```

**Explanation:**
While `useCallback(fn, deps)` is equivalent in behavior to `useMemo(() => fn, deps)`, they produce different function instances. Each hook creates and memoizes its own separate function. They are not the same object in memory.

**8. Memoized Child with Changing Props**

*Code:*

```jsx
import React, { useState, useCallback } from 'react';

const Child = React.memo(({ onAction, clicks }) => {
  console.log('Child Rendered');
  return <p>Clicks: {clicks}</p>;
});

function Parent() {
  const [clicks, setClicks] = useState(0);
  const handleAction = useCallback(() => {}, []);

  return (
    <>
      <button onClick={() => setClicks(c => c + 1)}>Increment Clicks</button>
      <Child onAction={handleAction} clicks={clicks} />
    </>
  );
}

// Scenario: The user clicks the "Increment Clicks" button.
```

**What is the output?**

```
Child Rendered
```

**Explanation:**
Even though `onAction` is memoized with `useCallback`, `React.memo` performs a shallow comparison on *all* props. Since the `clicks` prop changed from 0 to 1, the child component still re-renders.

**9. `useCallback` with Functional State Update**

*Code:*

```jsx
import React, { useState, useCallback } from 'react';

function App() {
  const [count, setCount] = useState(0);

  // No 'count' dependency needed because we use the functional update form
  const increment = useCallback(() => {
    setCount(c => c + 1);
  }, []); // Is this correct?

  console.log('Parent Rendered');
  return <button onClick={increment}>Count: {count}</button>;
}

// Scenario: The user clicks the button.
```

**What is the output?**

```
Parent Rendered // From the state update
// The component correctly displays "Count: 1"
```

**Explanation:**
This is a correct and common optimization pattern. By using the functional update form (`setCount(c => c + 1)`), the callback no longer needs to close over the `count` variable. This means `count` can be safely omitted from the dependency array, making the `increment` function stable across all renders without causing a stale state bug.

**10. `useMemo` to Memoize a React Element**

*Code:*

```jsx
import React, { useState, useMemo } from 'react';

const HeavyComponent = () => {
  console.log('Heavy Component Rendered');
  return <div>I am heavy!</div>;
};

function App() {
  const [theme, setTheme] = useState('light');

  const memoizedHeavyComponent = useMemo(() => {
    return <HeavyComponent />;
  }, []); // Empty dependency array

  return (
    <div>
      <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
        Toggle Theme
      </button>
      {memoizedHeavyComponent}
    </div>
  );
}

// Scenario: The user clicks the "Toggle Theme" button.
```

**What is the output?**

```
// Nothing is logged to the console.
```

**Explanation:**
`useMemo` can store not just primitive values but also React elements (the output of JSX). Because the dependency array is empty, `useMemo` returns the exact same `<HeavyComponent />` element object on every render. React sees the same element and skips re-rendering that part of the component tree, so `HeavyComponent`'s log message does not appear after the initial render.

**11. Inline `useMemo` dependency**

*Code:*

```jsx
import React, { useState, useMemo } from 'react';

function App() {
    const [count, setCount] = useState(0);

    const data = useMemo(() => {
        console.log("Memoizing data");
        return { value: count * 2 };
    }, [count]);

    const transformedData = useMemo(() => {
        console.log("Memoizing transformed data");
        return { ...data, transformed: true };
    }, [data]);

    return (
        <button onClick={() => setCount(c => c + 1)}>
            Count: {count}
        </button>
    );
}

// Scenario: The user clicks the button once.
```

**What is the output?**

```
// Initial render:
Memoizing data
Memoizing transformed data

// After click:
Memoizing data
Memoizing transformed data
```

**Explanation:**
When `count` changes, the first `useMemo` (for `data`) re-runs. This produces a new object for `data`. The second `useMemo` (for `transformedData`) has `data` as a dependency. Since `data` is a new object reference, the second `useMemo` also re-runs. This shows how changes in one memoized value can cascade to others that depend on it.

