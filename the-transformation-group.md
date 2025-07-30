Here are detailed answers to the frontend developer interview questions, designed to be clear, logical, and well-commented for effective learning.

### 1. Component Development with React

**Describe how you would build a reusable counter component in React that supports increment and decrement functionality. What props and state would you expose, and how would you ensure the component remains self-contained and testable?**

To build a reusable counter component, the key is to manage the count within the component's own state while allowing parent components to control its initial value and be notified of changes.

**State and Props:**

*   **State:** The component will have one piece of internal state: `count`. This makes it self-contained.
*   **Props:**
    *   `initialValue` (optional): To set the starting count. Defaults to 0.
    *   `onChange` (optional): A callback function that notifies the parent component whenever the count changes. This is crucial for reusability.

**Implementation:**

```jsx
import React, { useState } from 'react';

// Define the types for our component's props for better type safety and clarity.
interface CounterProps {
  initialValue?: number;
  onChange?: (count: number) => void;
}

const Counter: React.FC<CounterProps> = ({ initialValue = 0, onChange }) => {
  // 'useState' initializes our component's internal state.
  // 'count' is the current value, and 'setCount' is the function to update it.
  const [count, setCount] = useState(initialValue);

  // Function to handle incrementing the count.
  const handleIncrement = () => {
    const newCount = count + 1;
    setCount(newCount);
    // If an onChange prop is provided, call it with the new count.
    if (onChange) {
      onChange(newCount);
    }
  };

  // Function to handle decrementing the count.
  const handleDecrement = () => {
    const newCount = count - 1;
    setCount(newCount);
    // If an onChange prop is provided, call it with the new count.
    if (onChange) {
      onChange(newCount);
    }
  };

  return (
    <div>
      {/* Display the current count */}
      <h2>Count: {count}</h2>
      {/* Buttons to trigger the increment and decrement handlers */}
      <button onClick={handleIncrement}>Increment</button>
      <button onClick={handleDecrement}>Decrement</button>
    </div>
  );
};

export default Counter;
```

**Self-Contained and Testable:**

*   **Self-Contained:** The component manages its own `count` state. It doesn't rely on external state management unless explicitly told to via props.
*   **Testable:** You can easily test this component in isolation. You can pass different `initialValue` props to test its initialization and mock the `onChange` function to verify that it's called with the correct value after button clicks.

### 2. Form Handling and Controlled Components

**Explain the difference between controlled and uncontrolled form components in React. Provide a code example of a controlled form input that validates user input on change and displays error messages.**

**Controlled vs. Uncontrolled Components:**

*   **Controlled Component:** The state of the form element (like the value of an input field) is controlled by React state. The value is driven by the component's state, and any changes are handled by React functions. This is the recommended approach in most cases as it makes the form state predictable and easy to manage.
*   **Uncontrolled Component:** The form element's state is managed by the DOM itself. You would typically use a `ref` to get the value from the DOM when you need it (e.g., on form submission). This can be simpler for very basic forms but makes validation and dynamic changes more difficult.

**Controlled Form Input with Validation:**

```jsx
import React, { useState } from 'react';

const ValidatedForm = () => {
  // State to hold the value of the input field.
  const [inputValue, setInputValue] = useState('');
  // State to hold any validation error messages.
  const [error, setError] = useState('');

  // This function is called every time the input value changes.
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setInputValue(value);

    // Simple validation logic: check if the input is empty.
    if (value.trim() === '') {
      setError('This field cannot be empty.');
    } else {
      // Clear the error if the input is valid.
      setError('');
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Check for errors before submitting.
    if (!error) {
      alert(`Form submitted with value: ${inputValue}`);
    } else {
      alert('Please fix the errors before submitting.');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="name">Name:</label>
        {/*
          The 'value' prop is tied to our React state ('inputValue').
          The 'onChange' prop calls our handler function ('handleChange').
          This makes it a controlled component.
        */}
        <input
          type="text"
          id="name"
          value={inputValue}
          onChange={handleChange}
        />
        {/* Conditionally render the error message if it exists. */}
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
      <button type="submit">Submit</button>
    </form>
  );
};

export default ValidatedForm;
```

### 3. React Hooks: useState and useEffect

**Write a React function component that fetches data from a public API when it mounts and displays a loading spinner until the data arrives. Outline how you would use `useState` and `useEffect`, including cleanup logic if the component unmounts before the fetch completes.**

**Using `useState` and `useEffect`:**

*   **`useState`:** We'll use it to manage three pieces of state:
    *   `data`: To store the fetched data (e.g., an array of posts).
    *   `loading`: A boolean to indicate if the data is currently being fetched.
    *   `error`: To store any error that occurs during the fetch.
*   **`useEffect`:** This hook is perfect for side effects like data fetching. We'll use it to fetch the data when the component first mounts. The empty dependency array `[]` ensures it only runs once.

**Implementation with Cleanup:**

```jsx
import React, { useState, useEffect } from 'react';

const DataFetcher = () => {
  // State for the fetched data, loading status, and any errors.
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // AbortController is used to cancel the fetch request if the component unmounts.
    const abortController = new AbortController();
    const signal = abortController.signal;

    const fetchData = async () => {
      try {
        const response = await fetch('https://jsonplaceholder.typicode.com/posts', { signal });
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const result = await response.json();
        setData(result);
      } catch (error) {
        // If the error is an AbortError, we don't update the state.
        if (error.name !== 'AbortError') {
          setError(error.message);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // The cleanup function is returned from useEffect.
    // It will be called when the component unmounts.
    return () => {
      // This will cancel the fetch request if it's still in progress.
      abortController.abort();
    };
  }, []); // The empty dependency array means this effect runs only once on mount.

  // Display a loading spinner while fetching.
  if (loading) {
    return <div>Loading...</div>;
  }

  // Display an error message if the fetch failed.
  if (error) {
    return <div>Error: {error}</div>;
  }

  // Render the fetched data.
  return (
    <div>
      <h1>Fetched Data</h1>
      <ul>
        {data && data.slice(0, 5).map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  );
};

export default DataFetcher;
```

### 4. Custom Hooks for Logic Reuse

**Describe a scenario where you would create a custom React hook. Define the hook’s API (inputs and outputs), and show how you would implement it to share data-fetching logic across multiple components.**

**Scenario:**

Imagine you have several components in your application that all need to fetch data from different API endpoints. Instead of rewriting the fetching, loading, and error handling logic in each component, you can extract it into a custom hook.

**Custom Hook: `useFetch`**

*   **API (Inputs and Outputs):**
    *   **Input:** `url` (string) - The API endpoint to fetch data from.
    *   **Outputs:** An object containing `data`, `loading`, and `error`.

**Implementation:**

```jsx
import { useState, useEffect } from 'react';

// The custom hook is just a function that uses other hooks.
const useFetch = (url) => {
  // We reuse the same state logic from the previous example.
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;

    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const result = await response.json();
        setData(result);
        setError(null);
      } catch (error) {
        if (error.name !== 'AbortError') {
          setError(error.message);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Cleanup function.
    return () => {
      abortController.abort();
    };
  }, [url]); // The effect re-runs whenever the URL prop changes.

  // The hook returns the stateful values.
  return { data, loading, error };
};

export default useFetch;
```

**Using the Custom Hook in a Component:**

```jsx
import React from 'react';
import useFetch from './useFetch'; // Import our custom hook.

const PostsList = () => {
  // Use the custom hook to fetch posts.
  const { data: posts, loading, error } = useFetch('https://jsonplaceholder.typicode.com/posts');

  if (loading) return <div>Loading posts...</div>;
  if (error) return <div>Error fetching posts: {error}</div>;

  return (
    <div>
      <h2>Posts</h2>
      <ul>
        {posts && posts.slice(0, 5).map(post => <li key={post.id}>{post.title}</li>)}
      </ul>
    </div>
  );
};

const TodosList = () => {
  // Reuse the same hook for a different endpoint.
  const { data: todos, loading, error } = useFetch('https://jsonplaceholder.typicode.com/todos');

  if (loading) return <div>Loading todos...</div>;
  if (error) return <div>Error fetching todos: {error}</div>;

  return (
    <div>
      <h2>Todos</h2>
      <ul>
        {todos && todos.slice(0, 5).map(todo => <li key={todo.id}>{todo.title}</li>)}
      </ul>
    </div>
  );
};

export { PostsList, TodosList };
```

### 5. Advanced React Patterns: Higher-Order Components

**What is a Higher-Order Component (HOC) in React? Build a simple HOC that injects a `user` prop (fetched from context or an API) into any wrapped component.**

**What is a HOC?**

A Higher-Order Component (HOC) is a function that takes a component as an argument and returns a new component. HOCs are a pattern for reusing component logic. They are not part of the React API itself but are a consequence of React's compositional nature. While custom hooks are now often preferred for logic reuse, HOCs are still useful and prevalent in many codebases.

**HOC Implementation: `withUser`**

This HOC will "inject" a `user` prop into the component it wraps.

```jsx
import React from 'react';

// A mock user object. In a real app, this might come from an API call or React Context.
const fakeUser = {
  name: 'Jane Doe',
  email: 'jane.doe@example.com',
};

// This is the Higher-Order Component. It's a function that takes a component as an argument.
const withUser = (WrappedComponent) => {
  // It returns a new component.
  return (props) => {
    // This new component renders the WrappedComponent with the additional 'user' prop.
    // It also passes through any other props it received.
    return <WrappedComponent {...props} user={fakeUser} />;
  };
};

export default withUser;
```

**Using the HOC:**

```jsx
import React from 'react';
import withUser from './withUser'; // Import our HOC.

// This is a simple component that expects a 'user' prop.
const UserProfile = ({ user }) => {
  if (!user) {
    return <div>Loading user profile...</div>;
  }

  return (
    <div>
      <h1>{user.name}</h1>
      <p>Email: {user.email}</p>
    </div>
  );
};

// Now, we wrap our UserProfile component with the HOC.
const UserProfileWithUserData = withUser(UserProfile);

// This is the component we would render in our application.
// It will automatically receive the 'user' prop from the HOC.
const App = () => {
  return (
    <div>
      <h2>My Application</h2>
      <UserProfileWithUserData />
    </div>
  );
};

export default App;
```

### 6. Redux Core Concepts and Setup

**Walk us through setting up Redux in a new React application using Redux Toolkit. Include code snippets for configuring the store, writing a slice (actions and reducer), and connecting a component with `useSelector` and `useDispatch`.**

Redux Toolkit is the official, recommended way to write Redux logic. It simplifies store setup, reduces boilerplate, and prevents common mistakes.

**Step 1: Installation**

```bash
npm install @reduxjs/toolkit react-redux
```

**Step 2: Configure the Redux Store (`app/store.js`)**

`configureStore` simplifies the store setup process.

```javascript
// app/store.js
import { configureStore } from '@reduxjs/toolkit';
import counterReducer from '../features/counter/counterSlice'; // We will create this next.

export const store = configureStore({
  // The 'reducer' field is an object where each key is a slice of state
  // and the value is the reducer function for that slice.
  reducer: {
    counter: counterReducer,
  },
});
```

**Step 3: Write a Redux Slice (`features/counter/counterSlice.js`)**

A "slice" is a collection of the reducer logic and actions for a single feature of your app. `createSlice` automatically generates action creators and action types.

```javascript
// features/counter/counterSlice.js
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  value: 0,
};

export const counterSlice = createSlice({
  name: 'counter', // A name for the slice.
  initialState,
  // The 'reducers' field defines the actions and how they update the state.
  reducers: {
    // Redux Toolkit uses Immer library internally, so you can "mutate" the state directly.
    increment: (state) => {
      state.value += 1;
    },
    decrement: (state) => {
      state.value -= 1;
    },
    // Action with a payload.
    incrementByAmount: (state, action) => {
      state.value += action.payload;
    },
  },
});

// Export the generated action creators.
export const { increment, decrement, incrementByAmount } = counterSlice.actions;

// Export the reducer function for the store.
export default counterSlice.reducer;
```

**Step 4: Provide the Redux Store to React (`index.js`)**

Wrap your `<App>` component with the `<Provider>` from `react-redux`.

```jsx
// index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { store } from './app/store';
import { Provider } from 'react-redux';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {/* The Provider makes the Redux store available to any nested components. */}
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
```

**Step 5: Connect a Component (`features/counter/Counter.js`)**

Use the `useSelector` hook to read data from the store and `useDispatch` to dispatch actions.

```jsx
// features/counter/Counter.js
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { decrement, increment, incrementByAmount } from './counterSlice';

export function Counter() {
  // 'useSelector' reads a value from the Redux store state.
  const count = useSelector((state) => state.counter.value);
  // 'useDispatch' gets the dispatch function to send actions to the store.
  const dispatch = useDispatch();

  return (
    <div>
      <div>
        <button
          aria-label="Increment value"
          onClick={() => dispatch(increment())}
        >
          Increment
        </button>
        <span>{count}</span>
        <button
          aria-label="Decrement value"
          onClick={() => dispatch(decrement())}
        >
          Decrement
        </button>
        <button
          onClick={() => dispatch(incrementByAmount(5))}
        >
          Add 5
        </button>
      </div>
    </div>
  );
}
```

### 7. Managing Complex State in Redux

**Given a shopping cart feature, sketch out the Redux state shape and actions needed to add, update quantity, and remove items. Implement the corresponding reducer functions.**

**State Shape:**

The state should be normalized for easy lookup. An object where keys are item IDs is generally better than an array for quick updates and removals.

```json
{
  "cart": {
    "items": {
      "item_101": { "id": "item_101", "name": "Laptop", "price": 1200, "quantity": 1 },
      "item_102": { "id": "item_102", "name": "Mouse", "price": 25, "quantity": 2 }
    },
    "totalPrice": 1250
  }
}
```

**Cart Slice Implementation:**

```javascript
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  items: {}, // Using an object for easy lookup by ID.
  totalPrice: 0,
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    /**
     * Action to add an item to the cart. If the item already exists, increase its quantity.
     * @param {object} state - The current state.
     * @param {object} action - The action, with payload being the item to add.
     */
    addItem: (state, action) => {
      const item = action.payload; // e.g., { id: 'item_103', name: 'Keyboard', price: 75 }
      const existingItem = state.items[item.id];

      if (existingItem) {
        // If item exists, just increment the quantity.
        existingItem.quantity++;
      } else {
        // If it's a new item, add it to the cart with quantity 1.
        state.items[item.id] = { ...item, quantity: 1 };
      }
      // Recalculate total price.
      state.totalPrice += item.price;
    },

    /**
     * Action to remove an item completely from the cart.
     * @param {object} state - The current state.
     * @param {object} action - The action, with payload being the item ID to remove.
     */
    removeItem: (state, action) => {
      const itemId = action.payload;
      const itemToRemove = state.items[itemId];

      if (itemToRemove) {
        // Subtract the item's total cost from the cart's total price.
        state.totalPrice -= itemToRemove.price * itemToRemove.quantity;
        // Delete the item from the items object.
        delete state.items[itemId];
      }
    },

    /**
     * Action to update the quantity of an item.
     * @param {object} state - The current state.
     * @param {object} action - The action, with payload being { id, quantity }.
     */
    updateQuantity: (state, action) => {
      const { id, quantity } = action.payload;
      const itemToUpdate = state.items[id];

      if (itemToUpdate) {
        // First, remove the old item's cost from the total.
        state.totalPrice -= itemToUpdate.price * itemToUpdate.quantity;

        if (quantity > 0) {
          // Update the quantity and add the new cost to the total.
          itemToUpdate.quantity = quantity;
          state.totalPrice += itemToUpdate.price * quantity;
        } else {
          // If quantity is 0 or less, remove the item.
          delete state.items[id];
        }
      }
    },
  },
});

export const { addItem, removeItem, updateQuantity } = cartSlice.actions;
export default cartSlice.reducer;
```

This implementation demonstrates how Redux Toolkit simplifies handling complex state updates by allowing "mutations" in reducers and providing clear action definitions.

### 8. TypeScript in React: Interfaces and Generics

**How would you type a React component in TypeScript that takes a generic list of items and renders them? Provide interface definitions, the generic component signature, and an example usage with a list of user objects.**

Using generics (`<T>`) in TypeScript allows us to create components that can work with any data type while maintaining type safety.

**1. Interface Definitions**

First, let's define an interface for a user object.

```typescript
// Define the shape of a user object.
interface User {
  id: number;
  name: string;
  email: string;
}
```

**2. Generic Component Signature and Implementation**

We create a generic `List` component. The `<T>` is a placeholder for any type we want to pass in.

```typescript
import React from 'react';

// Define the props for our generic list component.
// It will work with an array of items of type 'T'.
interface ListProps<T> {
  items: T[]; // An array of items of the generic type T.
  renderItem: (item: T) => React.ReactNode; // A function to render each item.
}

// The component is defined with a generic type 'T'.
// We constrain 'T' to be an object with an 'id' property for the key.
const GenericList = <T extends { id: number | string }>({ items, renderItem }: ListProps<T>) => {
  return (
    <ul>
      {/* Map over the items and use the renderItem function for each one. */}
      {items.map((item) => (
        // Using item.id as the key is important for React's rendering performance.
        <li key={item.id}>
          {renderItem(item)}
        </li>
      ))}
    </ul>
  );
};

export default GenericList;
```

**3. Example Usage with a List of User Objects**

Now we can use our `GenericList` component with the `User` type.

```typescript
import React from 'react';
import GenericList from './GenericList'; // Import our generic component.

// Define the User interface.
interface User {
  id: number;
  name: string;
  email: string;
}

const UserList = () => {
  // Sample list of user objects. TypeScript ensures this array matches the User[] type.
  const users: User[] = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com' },
  ];

  return (
    <div>
      <h2>User List</h2>
      {/*
        We use our GenericList component here.
        TypeScript infers that 'T' is of type 'User'.
        The 'renderItem' prop receives a 'user' object of the correct type.
      */}
      <GenericList<User>
        items={users}
        renderItem={(user) => (
          <div>
            <strong>{user.name}</strong> ({user.email})
          </div>
        )}
      />
    </div>
  );
};

export default UserList;
```

This approach creates a highly reusable and type-safe `List` component that can render any kind of data, as long as the data items have an `id` property.

### 9. GraphQL Query and Mutation Integration

**Describe how you would implement a GraphQL query to fetch paginated blog posts and a mutation to create a new post. Include schema definitions, query/mutation strings, and sample React code using `@apollo/client`.**

**1. GraphQL Schema Definitions (on the server)**

First, you would define the types and operations in your GraphQL schema.

```graphql
# Defines the structure of a blog post.
type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
}

# Defines the structure for a paginated response.
type PaginatedPosts {
  posts: [Post!]!
  totalCount: Int!
  hasNextPage: Boolean!
}

# Defines the available queries.
type Query {
  # Fetches a list of posts with pagination.
  posts(limit: Int, offset: Int): PaginatedPosts!
}

# Defines the available mutations.
type Mutation {
  # Creates a new post.
  createPost(title: String!, content: String!): Post!
}
```

**2. Query and Mutation Strings (on the client)**

In your React app, you define the GraphQL operations you want to execute using the `gql` template literal from `@apollo/client`.

```javascript
import { gql } from '@apollo/client';

// Query to fetch a paginated list of posts.
export const GET_POSTS = gql`
  query GetPosts($limit: Int, $offset: Int) {
    posts(limit: $limit, offset: $offset) {
      posts {
        id
        title
      }
      totalCount
      hasNextPage
    }
  }
`;

// Mutation to create a new post.
export const CREATE_POST = gql`
  mutation CreatePost($title: String!, $content: String!) {
    createPost(title: $title, content: $content) {
      id
      title
      content
    }
  }
`;
```

**3. React Component Implementation with `@apollo/client`**

You use the `useQuery` hook for fetching data and the `useMutation` hook for performing mutations.

**Installation:**

```bash
npm install @apollo/client graphql
```

**Component Code:**

```jsx
import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { GET_POSTS, CREATE_POST } from './graphql'; // Import the operations.

const PostsManager = () => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  // Use the useQuery hook to fetch posts.
  const { loading, error, data, fetchMore } = useQuery(GET_POSTS, {
    variables: { limit: 5, offset: 0 },
  });

  // Use the useMutation hook for creating a post.
  const [createPost, { loading: mutationLoading, error: mutationError }] = useMutation(CREATE_POST, {
    // After the mutation is successful, we refetch the posts query to update the list.
    refetchQueries: [{ query: GET_POSTS, variables: { limit: 5, offset: 0 } }],
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createPost({ variables: { title, content } });
    setTitle('');
    setContent('');
  };

  if (loading) return <p>Loading posts...</p>;
  if (error) return <p>Error fetching posts: {error.message}</p>;

  return (
    <div>
      {/* Form to create a new post */}
      <form onSubmit={handleSubmit}>
        <h3>Create New Post</h3>
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          placeholder="Content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button type="submit" disabled={mutationLoading}>
          {mutationLoading ? 'Creating...' : 'Create Post'}
        </button>
        {mutationError && <p>Error creating post: {mutationError.message}</p>}
      </form>

      {/* Display the list of posts */}
      <h2>Posts</h2>
      <ul>
        {data.posts.posts.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  );
};

export default PostsManager;
```

This example shows how `@apollo/client` hooks simplify data fetching and state management for GraphQL operations, including handling loading states, errors, and updating the UI after a mutation.

### 10. Test-Driven Development with Jest

**Outline how you would write unit tests for a simple utility function that formats dates. Show Jest test cases covering valid inputs, edge cases, and error handling.**

**The Utility Function (`formatDate.js`)**

Let's assume we have a simple function that formats a `Date` object into `MM/DD/YYYY` format.

```javascript
// utils/formatDate.js
const formatDate = (date) => {
  if (!(date instanceof Date) || isNaN(date)) {
    throw new Error("Invalid date provided. Expected a valid Date object.");
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
  const year = date.getFullYear();

  return `${month}/${day}/${year}`;
};

export default formatDate;
```

**The Jest Test Suite (`formatDate.test.js`)**

We use `describe` to group related tests, `it` or `test` for individual test cases, and `expect` with matcher functions (`toBe`, `toThrow`) to assert the results.

**Installation:**

```bash
npm install --save-dev jest
```

**Test Code:**

```javascript
// utils/formatDate.test.js
import formatDate from './formatDate';

// Group all tests for the formatDate function.
describe('formatDate', () => {

  // Test case for a standard, valid date input.
  test('should format a valid date correctly', () => {
    const date = new Date('2023-10-26T10:00:00Z');
    // Assert that the output is what we expect.
    expect(formatDate(date)).toBe('10/26/2023');
  });

  // Test case for a single-digit day and month to check padding.
  test('should add leading zeros to single-digit month and day', () => {
    const date = new Date('2024-01-05T10:00:00Z');
    expect(formatDate(date)).toBe('01/05/2024');
  });

  // Edge case: Test the end of a month.
  test('should correctly format the last day of a month', () => {
    const date = new Date('2023-02-28T10:00:00Z');
    expect(formatDate(date)).toBe('02/28/2023');
  });

  // Edge case: Test a leap year date.
  test('should handle leap years correctly', () => {
    const date = new Date('2024-02-29T10:00:00Z');
    expect(formatDate(date)).toBe('02/29/2024');
  });

  // Error handling: Test for invalid input type (e.g., a string).
  test('should throw an error for non-Date inputs', () => {
    // We expect the function to throw an error when called with a string.
    expect(() => formatDate('2023-10-26')).toThrow('Invalid date provided. Expected a valid Date object.');
  });

  // Error handling: Test for an invalid Date object.
  test('should throw an error for an invalid Date object', () => {
    const invalidDate = new Date('not a real date');
    // We expect the function to throw an error for a Date object that is not valid.
    expect(() => formatDate(invalidDate)).toThrow('Invalid date provided. Expected a valid Date object.');
  });

  // Error handling: Test for null or undefined input.
  test('should throw an error for null input', () => {
    expect(() => formatDate(null)).toThrow('Invalid date provided. Expected a valid Date object.');
  });
});
```

To run the tests, you would typically have a script in your `package.json` like `"test": "jest"` and then run `npm test`.

### 11. Component Testing with React Testing Library

**Provide a test suite using React Testing Library for a modal component that opens on a button click, displays dynamic content, and calls a callback when closed. Include tests for user interactions and accessibility attributes.**

**The Modal Component (`Modal.js`)**

```jsx
import React from 'react';

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) {
    return null;
  }

  return (
    // The role="dialog" and aria-modal="true" are important for accessibility.
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="modal-content">
        <h2 id="modal-title">{title}</h2>
        <div>{children}</div>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

// A parent component to control the modal's state.
export const ModalWrapper = ({ onModalClose }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleClose = () => {
    setIsOpen(false);
    if (onModalClose) {
      onModalClose();
    }
  };

  return (
    <div>
      <button onClick={() => setIsOpen(true)}>Open Modal</button>
      <Modal isOpen={isOpen} onClose={handleClose} title="My Modal">
        <p>This is the modal content.</p>
      </Modal>
    </div>
  );
};```

**The Test Suite (`Modal.test.js`)**

React Testing Library focuses on testing the component from a user's perspective.

**Installation:**

```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

**Test Code:**

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom'; // for extra matchers like .toBeInTheDocument()
import { ModalWrapper } from './Modal';

describe('Modal', () => {
  // Test 1: The modal should be hidden initially.
  test('is not visible on initial render', () => {
    render(<ModalWrapper />);
    // `queryByRole` is used because it returns null if the element is not found,
    // which is what we want to assert. `getByRole` would throw an error.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Test 2: The modal should appear when the "Open Modal" button is clicked.
  test('opens when the trigger button is clicked', () => {
    render(<ModalWrapper />);
    // Find the button to open the modal.
    const openButton = screen.getByRole('button', { name: /open modal/i });
    // Simulate a user click.
    fireEvent.click(openButton);
    // Now, the modal should be in the document.
    const modal = screen.getByRole('dialog');
    expect(modal).toBeInTheDocument();
    // Check for the title and content.
    expect(screen.getByText('My Modal')).toBeInTheDocument();
    expect(screen.getByText('This is the modal content.')).toBeInTheDocument();
  });

  // Test 3: The modal should close when the "Close" button is clicked.
  test('closes when the close button is clicked', () => {
    render(<ModalWrapper />);
    // First, open the modal.
    fireEvent.click(screen.getByText(/open modal/i));
    // The modal should be visible.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Find the close button inside the modal and click it.
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);
    // The modal should no longer be in the document.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Test 4: The onClose callback should be called when the modal is closed.
  test('calls the onClose callback when closed', () => {
    // Create a mock function using Jest.
    const handleClose = jest.fn();
    render(<ModalWrapper onModalClose={handleClose} />);
    // Open the modal.
    fireEvent.click(screen.getByText(/open modal/i));
    // Close the modal.
    fireEvent.click(screen.getByText(/close/i));
    // Assert that our mock function was called exactly once.
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  // Test 5: Check for accessibility attributes.
  test('has correct accessibility attributes when open', () => {
    render(<ModalWrapper />);
    fireEvent.click(screen.getByText(/open modal/i));
    const modal = screen.getByRole('dialog');
    // `aria-modal="true"` tells screen readers that content outside the modal is inert.
    expect(modal).toHaveAttribute('aria-modal', 'true');
    // `aria-labelledby` points to the element that serves as the modal's title.
    expect(modal).toHaveAttribute('aria-labelledby', 'modal-title');
    // Check that the title element has the correct ID.
    expect(screen.getByText('My Modal')).toHaveAttribute('id', 'modal-title');
  });
});
```

### 12. Responsive Layout with CSS Grid and Flexbox

**Draft the HTML and CSS (or styled-components) for a two-column responsive layout that collapses to one column on screens narrower than 600px. Explain your choice of CSS properties and breakpoints.**

This is a classic layout problem that can be elegantly solved with either CSS Grid or Flexbox. Here's a solution using CSS Grid, which is often ideal for top-level page layouts.

**HTML Structure**

The HTML is simple and semantic.

```html
<div class="container">
  <main class="main-content">
    <h2>Main Content</h2>
    <p>This is the primary content area. It takes up more space on larger screens.</p>
  </main>
  <aside class="sidebar">
    <h3>Sidebar</h3>
    <p>This is the sidebar content. It appears next to the main content on wide screens.</p>
  </aside>
</div>
```

**CSS using CSS Grid**

```css
/*
  This container will use CSS Grid for its direct children.
*/
.container {
  display: grid;
  /*
    'grid-template-columns' defines the columns of the grid.
    '2fr 1fr' means the first column (main-content) will take up 2 parts
    of the available space, and the second column (sidebar) will take up 1 part.
    This creates a 2/3 and 1/3 layout.
  */
  grid-template-columns: 2fr 1fr;
  /* 'gap' adds space between the grid items. */
  gap: 20px;
  padding: 20px;
}

.main-content {
  background-color: #f0f0f0;
  padding: 20px;
}

.sidebar {
  background-color: #e0e0e0;
  padding: 20px;
}

/*
  A media query is used to apply different styles on smaller screens.
  'max-width: 600px' means these styles will apply only when the viewport
  is 600 pixels wide or less.
*/
@media (max-width: 600px) {
  .container {
    /*
      On smaller screens, we change the grid to have only one column.
      '1fr' means the single column will take up all available space.
      This causes the items to stack vertically.
    */
    grid-template-columns: 1fr;
  }
}
```

**Explanation of Choices:**

*   **CSS Grid:** I chose CSS Grid because it's designed for two-dimensional layouts (rows and columns). It makes creating a main content area and a sidebar incredibly straightforward with `grid-template-columns`. The `fr` unit is perfect for creating proportional columns that automatically adjust to the available space.
*   **Breakpoint (600px):** 600px is a common breakpoint for switching from a multi-column layout to a single-column layout, as it typically represents the transition from small tablets/large phones to smaller mobile devices. The choice of breakpoint should always be based on the content itself—you should change the layout when the content starts to look cramped or breaks, not based on specific device widths.
*   **Mobile-First Alternative:** While this example is "desktop-first," a common best practice is to design "mobile-first." In that approach, the default styles would be for the single-column layout, and you would use a `min-width` media query to introduce the two-column layout on larger screens.

### 13. CSS Animations and Transitions

**Create a button that, on hover, smoothly transitions its background color and scales up slightly. Write the CSS rules and explain how you ensure performance and cross-browser compatibility.**

Here is the CSS to create a performant and compatible animated button.

**HTML:**

```html
<button class="animated-button">Hover Over Me</button>
```

**CSS:**

```css
.animated-button {
  /* Basic styling for the button */
  background-color: #007bff; /* Initial background color */
  color: white;
  border: none;
  padding: 15px 30px;
  font-size: 16px;
  cursor: pointer;
  border-radius: 5px;
  outline: none; /* Removes the default outline on focus */

  /*
    The 'transition' property is key. It tells the browser to animate changes
    to the specified properties over a given duration.
    - 'background-color 0.3s ease': Animate the background color over 0.3 seconds
      with an 'ease' timing function (slow start, fast middle, slow end).
    - 'transform 0.3s ease': Animate the transform property as well.
  */
  transition: background-color 0.3s ease, transform 0.3s ease;
}

/*
  The ':hover' pseudo-class applies styles when the user's mouse is over the button.
*/
.animated-button:hover {
  background-color: #0056b3; /* The new background color */
  /*
    'transform: scale(1.1)' makes the button 10% larger.
    This is a performant animation property.
  */
  transform: scale(1.05);
}

/*
  The ':focus' pseudo-class is important for accessibility. It provides a visual
  cue when a user has navigated to the button using a keyboard.
*/
.animated-button:focus {
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.5);
}
```

**Explanation for Performance and Compatibility:**

1.  **Performance - `transform` and `opacity`:** For animations, it's best to animate only the `transform` and `opacity` properties whenever possible. These properties can be handled by the browser's GPU (compositor thread) without causing the browser to recalculate layout or repaint pixels on the main thread. This results in much smoother, jank-free animations. Animating properties like `width`, `height`, or `margin` is less performant as it triggers layout recalculations. In this example, `transform: scale()` is highly performant. While `background-color` does trigger a repaint, it's generally considered acceptable for simple hover effects.

2.  **Cross-Browser Compatibility - `transition`:** The `transition` property is very well-supported across all modern browsers. In the past, you would have needed vendor prefixes like `-webkit-transition` for Safari or `-moz-transition` for Firefox, but for a property this common, it's no longer necessary for the vast majority of users. However, for maximum compatibility with very old browsers, you might still include them:
    ```css
    -webkit-transition: background-color 0.3s ease, -webkit-transform 0.3s ease;
    -moz-transition: background-color 0.3s ease, -moz-transform 0.3s ease;
    transition: background-color 0.3s ease, transform 0.3s ease;
    ```    Modern build tools like Autoprefixer can handle adding these prefixes automatically.

3.  **Smoothness - `ease` Timing Function:** The `ease` timing function makes the transition feel more natural than a linear one. It provides a subtle acceleration and deceleration, which is more pleasing to the eye.

4.  **Accessibility - `:focus` State:** It's crucial to provide a visible focus state for users who navigate with a keyboard. The `:hover` state is for mouse users, but the `:focus` state ensures keyboard users know which element is active. A common and clear way to do this is with a `box-shadow` or `outline`.

### 14. Node.js and Express Endpoint Design

**Design an Express.js REST endpoint for user authentication that accepts email and password, validates input, checks credentials against a database, and returns a JWT. Show route definition, middleware for validation, and error handling.**

Here is a complete, well-structured example of an authentication endpoint using Express.js.

**Prerequisites:**

You would need to install several packages:

```bash
npm install express jsonwebtoken bcryptjs express-validator
```

*   `express`: The web framework.
*   `jsonwebtoken`: To create and sign JSON Web Tokens (JWTs).
*   `bcryptjs`: To securely hash and compare passwords.
*   `express-validator`: For easy request validation middleware.

**File Structure:**

```
/
├── server.js       # Main Express server file
├── routes/
│   └── auth.js     # Authentication routes
└── middleware/
    └── validator.js  # Validation rules
```

**1. Validation Middleware (`middleware/validator.js`)**

Using `express-validator` keeps the validation logic separate and reusable.

```javascript
// middleware/validator.js
const { body, validationResult } = require('express-validator');

// Define the validation rules for the login route.
const loginValidationRules = () => {
  return [
    // email must be a valid email
    body('email').isEmail().withMessage('Please provide a valid email address.'),
    // password must be at least 6 chars long
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.'),
  ];
};

// Middleware function to check for validation errors.
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next(); // If no errors, proceed to the next middleware/route handler.
  }
  // If there are errors, return a 400 Bad Request response with the errors.
  const extractedErrors = [];
  errors.array().map(err => extractedErrors.push({ [err.param]: err.msg }));

  return res.status(400).json({
    errors: extractedErrors,
  });
};

module.exports = {
  loginValidationRules,
  validate,
};
```

**2. The Authentication Route (`routes/auth.js`)**

This file contains the logic for the `/login` endpoint.

```javascript
// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { loginValidationRules, validate } = require('../middleware/validator');

const router = express.Router();

// This is a mock database. In a real app, you'd connect to MongoDB, PostgreSQL, etc.
const MOCK_DB = {
  // Passwords should ALWAYS be stored hashed, never in plain text.
  // This hash was generated from the password "password123".
  'user@example.com': {
    id: 'user123',
    email: 'user@example.com',
    passwordHash: '$2a$10$N9oqX.vjK2mFT.b/dY38Qeq7t63wT40D/jE0yv.mY.A5sGoY4q.gC',
  },
};

// The JWT secret should be stored securely in environment variables.
const JWT_SECRET = 'your_super_secret_key';

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post('/login', loginValidationRules(), validate, async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Check if the user exists in the database.
    const user = MOCK_DB[email];
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    // 2. Check if the provided password matches the stored hash.
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      // Use a generic error message to prevent attackers from knowing which part was wrong.
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    // 3. If credentials are correct, create the JWT payload.
    const payload = {
      user: {
        id: user.id,
        email: user.email,
      },
    };

    // 4. Sign the JWT.
    jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: '1h' }, // Token expires in 1 hour.
      (err, token) => {
        if (err) throw err;
        // 5. Return the token to the client.
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
```

**3. The Main Server File (`server.js`)**

This file sets up the Express app and brings everything together.

```javascript
// server.js
const express = require('express');
const authRoutes = require('./routes/auth');

const app = express();

// Middleware to parse incoming JSON requests.
app.use(express.json());

// Define the base path for our authentication routes.
// Any request to /api/auth/... will be handled by our auth router.
app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
```

**How it Works:**

1.  A `POST` request is sent to `/api/auth/login` with a JSON body containing `email` and `password`.
2.  The `loginValidationRules()` middleware runs, checking if the email is valid and the password meets the length requirement.
3.  The `validate` middleware checks the result. If there are errors, it sends a `400` response and stops.
4.  If validation passes, the route handler executes. It finds the user by email in the (mock) database.
5.  `bcrypt.compare` securely checks if the provided password, when hashed, matches the stored hash. This is crucial for security.
6.  If the credentials are valid, a JWT is created containing the user's ID and email.
7.  The JWT is signed with a secret key and sent back to the client. The client would then store this token (e.g., in `localStorage` or a cookie) and include it in the `Authorization` header of subsequent requests to protected routes.

### 15. Deploying a React App on AWS EC2

**Describe step-by-step how you would deploy a React single-page application to an EC2 instance, including setting up the server, security groups, build process, and configuration for continuous deployment.**

Deploying a React app to an EC2 instance involves setting up a Linux server to serve the static files generated by the React build process.

**Assumptions:**

*   You have an AWS account.
*   Your React app is in a Git repository (e.g., on GitHub).
*   You have the AWS CLI installed and configured locally (optional but helpful).

---

**Part 1: Initial Manual Deployment**

This part covers setting up the infrastructure and doing the first deployment manually.

**Step 1: Launch an EC2 Instance**

1.  **Navigate to the EC2 Dashboard** in the AWS Console.
2.  Click **"Launch instances"**.
3.  **Choose an AMI (Amazon Machine Image):** Select an **Amazon Linux 2** or **Ubuntu** AMI. These are common and well-supported choices.
4.  **Choose an Instance Type:** For a simple React app, a `t2.micro` or `t3.micro` (Free Tier eligible) is sufficient to start.
5.  **Configure Key Pair:** Create a new key pair or select an existing one. **Download the `.pem` file and keep it safe.** You will need it to connect to your instance via SSH.
6.  **Configure Security Group:** This is a crucial step. A security group acts as a virtual firewall.
    *   Create a new security group.
    *   Add a rule for **SSH (port 22)**. For better security, set the source to **"My IP"** instead of "Anywhere".
    *   Add a rule for **HTTP (port 80)** from source **"Anywhere" (0.0.0.0/0)** so users can access your web server.
    *   Add a rule for **HTTPS (port 443)** from source **"Anywhere" (0.0.0.0/0)** if you plan to set up an SSL certificate.
7.  **Launch Instance:** Review the settings and click "Launch".

**Step 2: Connect to the EC2 Instance**

1.  Find your instance in the EC2 dashboard and copy its **Public IPv4 address**.
2.  Open a terminal and use SSH to connect. Replace `your-key.pem` and `your-ec2-ip` with your details.
    ```bash
    # Set the correct permissions for your key file
    chmod 400 /path/to/your-key.pem

    # Connect to the instance
    ssh -i /path/to/your-key.pem ec2-user@your-ec2-ip
    # (Note: For Ubuntu, the user is 'ubuntu', so it would be 'ubuntu@your-ec2-ip')
    ```

**Step 3: Set Up the Web Server (Nginx)**

We will use Nginx as a high-performance web server to serve our static React files.

1.  **Update the package manager and install Nginx:**
    ```bash
    # For Amazon Linux 2
    sudo yum update -y
    sudo amazon-linux-extras install nginx1 -y

    # For Ubuntu
    # sudo apt update -y
    # sudo apt install nginx -y
    ```
2.  **Start and enable Nginx:**
    ```bash
    sudo systemctl start nginx
    sudo systemctl enable nginx # This makes it start automatically on reboot
    ```
3.  **Verify Nginx is running:** Open your web browser and navigate to `http://your-ec2-ip`. You should see the default Nginx welcome page.

**Step 4: Build and Deploy the React App**

1.  **Install Node.js and npm on the server:**
    ```bash
    # For Amazon Linux 2 (using nvm is recommended)
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
    source ~/.bashrc
    nvm install --lts

    # For Ubuntu
    # sudo apt install nodejs npm -y
    ```
2.  **Clone your project from Git:**
    ```bash
    git clone https://github.com/your-username/your-react-app.git
    ```3.  **Install dependencies and build the app:**
    ```bash
    cd your-react-app
    npm install
    npm run build # This creates the 'build' or 'dist' folder with static files.
    ```
4.  **Copy the build files to the Nginx web root:**
    ```bash
    sudo cp -r build/* /usr/share/nginx/html/
    ```
    *   It's a good practice to first remove the default Nginx files: `sudo rm -rf /usr/share/nginx/html/*`.

**Step 5: Configure Nginx for React Router**

For a Single Page Application (SPA), you need to configure Nginx to redirect all routes to `index.html`.

1.  **Edit the Nginx configuration file:**
    ```bash
    sudo nano /etc/nginx/conf.d/default.conf
    # Or on Ubuntu: sudo nano /etc/nginx/sites-available/default
    ```
2.  **Modify the `location /` block:**
    ```nginx
    server {
        listen 80;
        server_name your-ec2-ip; # Or your domain name

        root /usr/share/nginx/html;
        index index.html index.htm;

        location / {
            # Try to serve the requested file, then a directory,
            # and if neither exists, fall back to serving /index.html.
            # This is the key for React Router to work correctly.
            try_files $uri $uri/ /index.html;
        }
    }
    ```
3.  **Restart Nginx to apply changes:**
    ```bash
    sudo systemctl restart nginx
    ```
4.  **Test:** Go to `http://your-ec2-ip`. Your React app should now be live. Try navigating to a deep link (e.g., `http://your-ec2-ip/about`) and refreshing the page; it should still work.

---

**Part 2: Setting Up Continuous Deployment (CI/CD)**

Manually deploying every time is tedious and error-prone. A CI/CD pipeline automates this process. We'll use **GitHub Actions**.

**Goal:** When you push code to the `main` branch on GitHub, it should automatically build and deploy to your EC2 instance.

**Step 1: Create an IAM User for GitHub Actions**

Create a user in AWS IAM with programmatic access. Attach a policy that gives it just enough permissions to interact with EC2 (e.g., `AmazonEC2FullAccess` for simplicity, but a more restrictive custom policy is better for production). **Save the `Access Key ID` and `Secret Access Key`**.

**Step 2: Add Secrets to Your GitHub Repository**

In your GitHub repo, go to **Settings > Secrets and variables > Actions**. Add the following repository secrets:

*   `AWS_ACCESS_KEY_ID`: The access key from the IAM user.
*   `AWS_SECRET_ACCESS_KEY`: The secret access key.
*   `AWS_REGION`: The region of your EC2 instance (e.g., `us-east-1`).
*   `EC2_HOST`: The public IP address of your EC2 instance.
*   `EC2_USER`: The username for your instance (`ec2-user` or `ubuntu`).
*   `EC2_KEY`: The **private key** from your `.pem` file. Copy the entire content of the file and paste it here.

**Step 3: Create the GitHub Actions Workflow File**

In your project's root, create a directory `.github/workflows/` and add a YAML file, e.g., `deploy.yml`.

```yaml
# .github/workflows/deploy.yml

name: Deploy React App to EC2

# Trigger the workflow on pushes to the main branch
on:
  push:
    branches:
      - main

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest # The job will run on a fresh Ubuntu machine provided by GitHub

    steps:
      # 1. Check out the repository code
      - name: Checkout code
        uses: actions/checkout@v3

      # 2. Set up Node.js
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18' # Use a specific version of Node

      # 3. Install dependencies and build the React app
      - name: Install and Build
        run: |
          npm install
          npm run build

      # 4. Deploy to EC2
      - name: Deploy to EC2
        uses: appleboy/scp-action@master
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_KEY }}
          source: "build/*" # Source files to copy
          target: "/usr/share/nginx/html" # Target directory on the server
          strip_components: 1 # Removes the 'build' directory level

      # 5. Optional: Restart Nginx on the server to ensure changes are applied
      - name: Restart Nginx
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_KEY }}
          script: |
            sudo systemctl restart nginx
```

**How the CI/CD Pipeline Works:**

1.  When you `git push` to the `main` branch, GitHub automatically detects the `deploy.yml` file.
2.  It spins up a temporary virtual machine (`ubuntu-latest`).
3.  It checks out your code, installs Node.js, runs `npm install`, and `npm run build`.
4.  The `scp-action` then securely copies the contents of the `build` folder over to the `/usr/share/nginx/html` directory on your EC2 instance using the credentials you stored in GitHub Secrets.
5.  Finally, the `ssh-action` runs the command to restart Nginx on your server, ensuring the new files are served immediately.

This setup provides a robust and automated way to deploy your React application.

### 17. Performance Optimization Strategies

**List three techniques to optimize performance in a React application and demonstrate one (e.g., code splitting with React.lazy and Suspense) with code examples.**

Optimizing a React application is crucial for a good user experience. Here are three key techniques:

**1. Memoization with `React.memo`, `useMemo`, and `useCallback`:**

*   **What it is:** Memoization is a technique where you cache the result of expensive function calls and return the cached result when the same inputs occur again. In React, this prevents unnecessary re-renders of components.
*   **How it helps:**
    *   **`React.memo`:** A Higher-Order Component that prevents a functional component from re-rendering if its props have not changed.
    *   **`useMemo`:** A hook that memoizes the result of a calculation. It re-runs the calculation only when one of its dependencies changes. Useful for expensive computations.
    *   **`useCallback`:** A hook that memoizes a function definition. It returns the same function instance between renders, which is important when passing callbacks to optimized child components that rely on referential equality.

**2. Virtualizing Long Lists:**

*   **What it is:** Instead of rendering thousands of items in a list at once (which can be very slow and consume a lot of memory), virtualization is a technique where you only render the items that are currently visible in the viewport.
*   **How it helps:** It dramatically improves performance for applications that display large tables or lists by keeping the number of DOM nodes to a minimum. Libraries like `react-window` and `react-virtualized` are excellent for this.

**3. Code Splitting with `React.lazy` and `Suspense`:**

*   **What it is:** Code splitting is the process of breaking up your application's bundle into smaller chunks that can be loaded on demand. Instead of downloading the entire app on the first load, the user only downloads what they need for the initial page.
*   **How it helps:** It significantly reduces the initial load time of your application, which is a critical performance metric. `React.lazy` and `Suspense` make it easy to implement code splitting for different routes or components.

---

**Demonstration: Code Splitting with `React.lazy` and `Suspense`**

Let's imagine an application with a main dashboard and a separate, heavy "Analytics" page that not every user will visit. It's a perfect candidate for code splitting.

**Without Code Splitting:**

All components are bundled together in one large file.

```jsx
// App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import HomePage from './HomePage';
import AnalyticsPage from './AnalyticsPage'; // AnalyticsPage is loaded immediately.

function App() {
  return (
    <Router>
      <nav>
        <Link to="/">Home</Link> | <Link to="/analytics">Analytics</Link>
      </nav>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Routes>
    </Router>
  );
}
```

**With Code Splitting:**

We use `React.lazy` to load the `AnalyticsPage` component only when the user navigates to its route.

```jsx
// App.js with Code Splitting

import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import HomePage from './HomePage';

// Use React.lazy to dynamically import the AnalyticsPage component.
// The import() function returns a Promise that resolves to the module.
// This will create a separate chunk (e.g., 1.chunk.js) for AnalyticsPage.
const AnalyticsPage = lazy(() => import('./AnalyticsPage'));

function App() {
  return (
    <Router>
      <nav>
        <Link to="/">Home</Link> | <Link to="/analytics">Analytics</Link>
      </nav>
      {/*
        The 'Suspense' component is required by React.lazy.
        It lets you specify a fallback UI (like a loading spinner)
        to show while the lazy-loaded component is being fetched.
      */}
      <Suspense fallback={<div>Loading...</div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          {/*
            When a user clicks the "Analytics" link, React will suspend
            rendering, show the fallback UI, and start fetching the
            AnalyticsPage component's code. Once loaded, it will be rendered.
          */}
          <Route path="/analytics" element={<AnalyticsPage />} />
        </-Routes>
      </Suspense>
    </Router>
  );
}

// HomePage.js (for context)
const HomePage = () => <h2>Welcome to the Home Page</h2>;

// AnalyticsPage.js (imagine this is a large component)
const AnalyticsPage = () => <h2>Analytics Dashboard</h2>;
```

**How it Works:**

1.  When the user first loads the application, the browser only downloads the main bundle, which includes `App.js`, `HomePage.js`, React, and other core libraries. The code for `AnalyticsPage.js` is **not** included.
2.  The user sees the `HomePage` instantly.
3.  When the user clicks the "Analytics" link, the `Route` for `/analytics` is matched.
4.  React sees that `AnalyticsPage` is a `lazy` component that hasn't been loaded yet.
5.  It triggers the `Suspense` boundary, which displays the `fallback` UI (the "Loading..." message).
6.  In the background, React initiates a network request to fetch the separate JavaScript chunk for `AnalyticsPage`.
7.  Once the chunk is downloaded and parsed, `Suspense` replaces the fallback UI with the fully rendered `AnalyticsPage` component.

This ensures a faster initial page load and a better user experience, especially on slower network connections.

### 18. Observability and Monitoring

**How would you integrate performance monitoring and error tracking into a React/Node application? Name tools you’ve used (e.g., New Relic, Sentry), and outline configuration and usage.**

Integrating observability tools is essential for maintaining a healthy application in production. It allows you to proactively find and fix issues, understand user experience, and monitor performance bottlenecks.

**Key Areas of Observability:**

1.  **Error Tracking:** Capturing, reporting, and alerting on unhandled exceptions in both the frontend (React) and backend (Node.js).
2.  **Performance Monitoring (APM - Application Performance Management):** Measuring how your application performs.
    *   **Frontend:** Core Web Vitals (LCP, FID, CLS), page load times, and component render times.
    *   **Backend:** API endpoint response times, database query performance, and transaction traces.
3.  **Logging:** Collecting structured logs from your application to debug issues.

---

**Tools:**

*   **Sentry:** Excellent for error tracking and release health monitoring. It has very strong support for JavaScript and React, providing detailed stack traces and context for frontend errors.
*   **New Relic:** A comprehensive APM tool that provides deep insights into both frontend and backend performance. It's great for tracing a request all the way from the user's browser, through your Node.js backend, to your database, and back.
*   **Datadog:** Another all-in-one platform that combines logs, metrics, and APM for full-stack observability.
*   **LogRocket:** Focuses on frontend monitoring by providing session replay, allowing you to watch a video of a user's session to see exactly what led to an error.

---

**Integration Example: Sentry for Error Tracking and New Relic for Performance**

Let's outline how to set up Sentry and New Relic in a MERN-stack-like application.

**Part 1: Sentry for Error Tracking**

**Goal:** Automatically capture any uncaught JavaScript errors in the React frontend and any server-side exceptions in the Node.js backend.

**A) React Frontend Configuration**

1.  **Install Sentry SDK:**
    ```bash
    npm install --save @sentry/react @sentry/tracing
    ```2.  **Initialize Sentry:** In your main application entry point (e.g., `index.js`), initialize Sentry as early as possible.
    ```jsx
    // src/index.js
    import React from 'react';
    import ReactDOM from 'react-dom/client';
    import * as Sentry from '@sentry/react';
    import { BrowserTracing } from '@sentry/tracing';
    import App from './App';

    // Initialize Sentry
    Sentry.init({
      dsn: "YOUR_SENTRY_DSN_KEY", // This key is provided in your Sentry project settings.
      integrations: [new BrowserTracing()],

      // Set tracesSampleRate to 1.0 to capture 100%
      // of transactions for performance monitoring.
      // Adjust this value in production to a lower number (e.g., 0.2) to sample transactions.
      tracesSampleRate: 1.0,

      // You can also set environment and release version for better tracking.
      environment: process.env.NODE_ENV,
      release: `my-app@${process.env.npm_package_version}`,
    });

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    ```
3.  **Usage:** That's it for basic setup! Sentry will now automatically capture unhandled errors. For more specific cases, you can use an **Error Boundary** to catch rendering errors in a part of your UI and show a fallback.

    ```jsx
    // In your App.js or a layout component
    import { ErrorBoundary } from '@sentry/react';

    function App() {
      return (
        <ErrorBoundary fallback={<p>Something went wrong.</p>}>
          <MyRoutes />
        </ErrorBoundary>
      );
    }
    ```

**B) Node.js (Express) Backend Configuration**

1.  **Install Sentry SDK:**
    ```bash
    npm install --save @sentry/node @sentry/tracing
    ```
2.  **Initialize Sentry:** In your main server file (e.g., `server.js`), initialize Sentry before you define any routes, and add its error handlers *after* your routes.

    ```javascript
    // server.js
    const express = require('express');
    const Sentry = require('@sentry/node');
    const Tracing = require('@sentry/tracing');

    const app = express();

    // Initialize Sentry
    Sentry.init({
      dsn: "YOUR_SENTRY_DSN_KEY",
      integrations: [
        // enable HTTP calls tracing
        new Sentry.Integrations.Http({ tracing: true }),
        // enable Express.js middleware tracing
        new Tracing.Integrations.Express({ app }),
      ],
      tracesSampleRate: 1.0,
    });

    // Sentry's request handler must be the first middleware on the app
    app.use(Sentry.Handlers.requestHandler());
    app.use(Sentry.Handlers.tracingHandler());

    // --- YOUR REGULAR ROUTES GO HERE ---
    app.get('/', (req, res) => {
      res.send('Hello World!');
    });

    app.get('/debug-sentry', (req, res) => {
      // This route will intentionally throw an error to test Sentry
      throw new Error('My first Sentry error!');
    });
    // -----------------------------------

    // The Sentry error handler must be before any other error handling middleware
    // and after all controllers
    app.use(Sentry.Handlers.errorHandler());

    // Optional fallthrough error handler
    app.use(function onError(err, req, res, next) {
      res.statusCode = 500;
      res.end(res.sentry + "\n");
    });

    app.listen(3000);
    ```
    Now, if you visit `/debug-sentry`, the error will be captured and sent to your Sentry dashboard with a full stack trace.

---

**Part 2: New Relic for Performance Monitoring**

**Goal:** Monitor frontend page load times and backend API transaction performance.

**A) React Frontend (Browser Agent)**

1.  **Get the New Relic Browser Agent Snippet:** In your New Relic account, go to **Browser > Add an application**. Follow the steps to get a JavaScript snippet.
2.  **Add the Snippet to your `index.html`:** Paste the snippet into the `<head>` section of your `public/index.html` file. It must be placed as high up as possible to accurately measure load times.

    ```html
    <!-- public/index.html -->
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <!-- NEW RELIC BROWSER AGENT SNIPPET GOES HERE -->
        <script type="text/javascript">
          /* Paste the generated script from New Relic here */
        </script>
        <!-- END NEW RELIC SNIPPET -->
        <title>React App</title>
      </head>
      <body>
        <noscript>You need to enable JavaScript to run this app.</noscript>
        <div id="root"></div>
      </body>
    </html>
    ```
3.  **Usage:** Once deployed, the browser agent will start sending performance data (Page Load Timing, Core Web Vitals, AJAX request times, JS errors) to your New Relic dashboard automatically.

**B) Node.js Backend (APM Agent)**

1.  **Install New Relic Agent:**
    ```bash
    npm install --save newrelic
    ```
2.  **Configure the Agent:** Create a `newrelic.js` file in the root of your Node.js project. You can generate this file by running `cp node_modules/newrelic/newrelic.js .` and then editing it. The two most important settings are:
    *   `app_name`: Give your application a name (e.g., `['My-Node-API']`).
    *   `license_key`: Your New Relic license key (from your account settings).
3.  **Load the Agent:** In your main server entry point (`server.js`), the **very first line** must be `require('newrelic');`.

    ```javascript
    // server.js
    require('newrelic'); // MUST BE THE FIRST LINE

    const express = require('express');
    const app = express();

    // ... rest of your server code
    ```
4.  **Usage:** Start your server. The agent will automatically instrument popular modules like Express and MongoDB. In the New Relic APM dashboard, you will see:
    *   A list of all your API endpoints under **"Transactions"**.
    *   Breakdowns of how much time each transaction spends in middleware, database queries, and external API calls.
    *   Detailed performance data for slow database queries.

By combining these tools, you get comprehensive observability: Sentry tells you **when and why** things break, while New Relic tells you **how slow** things are and where the bottlenecks are.

### 19. Collaborating with Stakeholders

**Describe a time when you gathered requirements from non-technical stakeholders. How did you translate their needs into technical specifications, estimate effort, and manage scope?**

**Situation:**

"At my previous company, we were tasked with building a new customer dashboard. The primary stakeholders were the Head of Customer Success and two senior support managers. They were not technical but had a clear vision of what they wanted to achieve: 'a single place where our team can see everything about a customer at a glance to reduce call times.'"

**Task:**

"My role as the lead frontend developer was to translate this high-level vision into actionable technical requirements for the development team, estimate the work involved, and ensure we didn't end up with scope creep."

**Action:**

"I broke down the process into three main phases:"

1.  **Requirement Gathering and Translation:**
    *   **Active Listening and Questioning:** I scheduled a series of workshops with the stakeholders. Instead of asking "What features do you want?", I asked "What problems are you trying to solve?" and "What questions do you need answered when you look at a customer's profile?". This shifted the focus from features to outcomes.
    *   **Wireframing and Prototyping:** I used a tool like Figma to create low-fidelity wireframes based on our discussions. For example, when they said 'see everything,' I sketched a layout with widgets for 'Recent Tickets,' 'Subscription Status,' 'Key Contacts,' and 'Product Usage.' Presenting this visual mockup was far more effective than a written document. It allowed them to say, "Yes, that's what I mean," or "Actually, the subscription status is the most important; can it be at the top?"
    *   **Defining "Done":** For each widget, I worked with them to define acceptance criteria in plain English. For the 'Recent Tickets' widget, we agreed that "Done" meant it should show the 5 most recent tickets, each with a title, status, and date, and clicking one would open the ticket in a new tab.

2.  **Technical Specification and Estimation:**
    *   **Breaking Down into User Stories:** I translated the agreed-upon wireframes and acceptance criteria into user stories in Jira. For example: "As a support manager, I want to see a customer's subscription status (e.g., Active, Canceled, Trial) on the dashboard so I can quickly understand their current standing."
    *   **Identifying Technical Components:** I then broke these stories down into technical tasks: "Create a `SubscriptionStatus` React component," "Develop a new API endpoint `/api/customers/:id/subscription`," "Integrate the endpoint with the frontend component," and "Write unit tests for the component and endpoint."
    *   **Collaborative Estimation:** I involved the backend developer and a QA engineer in the estimation process. We used story points to estimate the relative effort for each user story. This collaborative approach ensured we considered all aspects of the work and got buy-in from the whole team.

3.  **Managing Scope:**
    *   **Prioritization (MoSCoW Method):** It became clear that their initial 'everything' was too large for a single release. I introduced the MoSCoW method (Must-have, Should-have, Could-have, Won't-have). We collaboratively categorized each widget. The 'Subscription Status' and 'Recent Tickets' were 'Must-haves.' 'Product Usage' was a 'Should-have,' and a 'Lifetime Value' widget was a 'Could-have.'
    *   **Phased Rollout:** This prioritization naturally led to a phased release plan. We agreed to launch Phase 1 with only the 'Must-have' features. This guaranteed we could deliver core value quickly.
    *   **Formalizing the Backlog:** All the 'Should-have' and 'Could-have' features were added to the product backlog with the understanding that they would be prioritized in future quarters. This managed expectations and prevented scope creep while ensuring their ideas were not lost.

**Result:**

"The project was a success. We delivered the initial version of the dashboard on time, and it directly addressed the core problem of reducing the time support managers spent gathering information. The stakeholders felt heard and involved throughout the process because we spoke their language with visuals and focused on their problems. By translating their needs into a prioritized, well-defined backlog, the development team had a clear roadmap, which led to a smooth and predictable development cycle."

### 20. Leadership and Mentorship

**Provide an example of how you’ve mentored a junior engineer through code reviews. What guidelines did you follow, and how did you ensure knowledge transfer and maintain code quality?**

**Situation:**

"We recently had a junior engineer, Alex, join our team. He was enthusiastic and a quick learner but was new to our company's large, established codebase and specific coding standards. One of his first tasks was to implement a new filter feature on a search results page."

**Task:**

"My goal was to use the code review process not just to catch errors, but as a primary tool for mentoring Alex, helping him understand our standards, and empowering him to become a confident, independent contributor."

**Action:**

"When Alex submitted his first Pull Request (PR), I followed a specific set of guidelines for the review:"

1.  **Start with Positive Reinforcement:** The very first comment I left was positive. I praised his well-written unit tests and the clarity of his logic. This created a constructive and safe atmosphere, making him more receptive to feedback. For example: "Great work on the test coverage here, Alex! It's fantastic to see all the edge cases handled."

2.  **Ask Questions, Don't Make Demands:** Instead of saying, "Don't fetch data inside a `useEffect` without a proper dependency array," I asked a question to prompt his thinking. I commented, "I see you're fetching data when the component mounts. What do you think might happen if a user changes another filter on the page that doesn't unmount this component?" This led him to discover the infinite loop problem himself and learn about the `useEffect` dependency array's purpose in a more memorable way.

3.  **Explain the "Why," Not Just the "What":** When I suggested a change, I always explained the reasoning behind it, often linking to our internal documentation or a relevant article. For instance, he had created a large component with both state management and rendering logic. I commented:
    *   **What:** "Let's refactor this by extracting the data-fetching logic into a custom hook (e.g., `useFilterData`)."
    *   **Why:** "Doing this helps us follow the single-responsibility principle. It makes the component purely responsible for rendering the UI, while the hook handles the logic of fetching and managing data. This makes both parts easier to read, test, and reuse elsewhere. Here's a link to our guide on writing custom hooks: [link]."

4.  **Distinguish Between "Must-Change" and "Suggestions":** I used prefixes like `[Blocker]` for critical issues that needed to be fixed before merging and `[Suggestion]` or `[Nitpick]` for optional improvements or stylistic preferences. For example:
    *   `[Blocker]`: "This API key is hardcoded. It needs to be moved to our environment variables to prevent a security risk."
    *   `[Suggestion]`: "We could simplify this `if/else` block into a single line using a ternary operator. It's not required, but it's a common pattern in our codebase that can make things more concise."

5.  **Offer to Pair Program:** For a more complex piece of feedback regarding state management, I saw it would be too much for a back-and-forth on a PR. I left a comment saying, "This part is a bit tricky to explain in text. Do you have 15 minutes to jump on a call? We can walk through it together." We had a short screen-sharing session where we implemented the change together, which was far more efficient and collaborative.

**Result:**

"This approach had several positive outcomes. Alex's subsequent PRs showed a clear and rapid improvement. He started adopting the patterns we discussed, and his code required fewer and fewer critical comments. More importantly, he began to proactively ask questions and even started making suggestions on other team members' PRs. The code quality of the feature was high, and the knowledge transfer was effective because he learned the reasoning behind our standards, not just the rules themselves. He told me later that he appreciated the constructive and educational nature of the reviews, which made him feel like a valued part of the team from day one."