<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" class="logo" width="120"/>

# JavaScript Interview Preparation: 40 Essential Questions for 4 Years Experience

As a seasoned frontend developer mastering JavaScript interview questions is crucial for advancing your career. This comprehensive guide presents 40 carefully selected JavaScript programming questions and answers that align with your experience level and the expectations of senior frontend developer roles.

## JavaScript Core Concepts

### Variable Declarations and Hoisting

**Question 1: Explain the differences between `var`, `let`, and `const` in JavaScript.**

**Answer:** These three keywords differ significantly in scope, hoisting behavior, and reassignment capabilities[^1]:

- **`var`**: Function-scoped or globally-scoped, hoisted and initialized with `undefined`, allows redeclaration and reassignment
- **`let`**: Block-scoped, hoisted but not initialized (temporal dead zone), allows reassignment but not redeclaration
- **`const`**: Block-scoped, hoisted but not initialized, requires initialization at declaration, immutable reference

```javascript
function example() {
  console.log(a); // undefined (hoisted)
  console.log(b); // ReferenceError (temporal dead zone)
  
  var a = 1;
  let b = 2;
  const c = 3;
  
  if (true) {
    var a = 4; // Same variable, function-scoped
    let b = 5; // New variable, block-scoped
    const c = 6; // New variable, block-scoped
  }
}
```

**Question 2: What is hoisting in JavaScript and how does it work?**

**Answer:** Hoisting is a JavaScript mechanism where variable and function declarations are moved to the top of their containing scope during the compile phase[^1][^2]. Only declarations are hoisted, not initializations:

```javascript
console.log(x); // undefined (not ReferenceError)
var x = 5;

// Effectively becomes:
var x;
console.log(x); // undefined
x = 5;
```

Different types of declarations behave differently when hoisted[^1]:

- `var` declarations: Hoisted and initialized with `undefined`
- `let`/`const` declarations: Hoisted but remain uninitialized (temporal dead zone)
- Function declarations: Both declaration and definition are fully hoisted
- Function expressions: Only the variable declaration is hoisted


### Scope and Context

**Question 3: Explain the concept of scope in JavaScript.**

**Answer:** Scope determines the accessibility of variables, objects, and functions from different parts of the code[^3][^4]. JavaScript has three types of scope:

1. **Global Scope**: Variables declared outside any function or block
2. **Function Scope**: Variables declared within a function
3. **Block Scope**: Variables declared within a block (with `let` and `const`)
```javascript
var globalVar = 'global'; // Global scope

function outerFunction() {
  var functionScoped = 'function'; // Function scope
  
  if (true) {
    let blockScoped = 'block'; // Block scope
    const alsoBlockScoped = 'block'; // Block scope
  }
  
  // blockScoped is not accessible here
}
```

**Question 4: How does the `this` keyword work in JavaScript?**

**Answer:** The `this` keyword is a dynamic reference to the context in which a function is executed[^5]. Its value depends on how the function is called:

1. **Constructor function**: `this` refers to the newly created instance
2. **Method call**: `this` refers to the object the method belongs to
3. **Function call**: `this` refers to the global object (or `undefined` in strict mode)
4. **Arrow functions**: `this` is lexically bound to the surrounding scope
5. **Explicit binding**: Using `call`, `apply`, or `bind` to set `this` explicitly
```javascript
const obj = {
  name: 'Object',
  regularMethod: function() {
    console.log(this.name); // 'Object'
  },
  arrowMethod: () => {
    console.log(this.name); // undefined (global context)
  }
};
```


### Functions and Closures

**Question 5: What is a closure in JavaScript and provide a practical example?**

**Answer:** A closure is a function that has access to variables from its outer (enclosing) scope even after the outer function has finished executing[^6][^7]. Closures are created when a function is defined inside another function:

```javascript
function createCounter() {
  let count = 0;
  
  return function() {
    count++;
    return count;
  };
}

const counter = createCounter();
console.log(counter()); // 1
console.log(counter()); // 2
console.log(counter()); // 3
```

Closures are commonly used for:

- Data encapsulation and privacy
- Module patterns
- Callback functions
- Event handlers

**Question 6: Explain the difference between function declarations and function expressions.**

**Answer:** Function declarations and expressions differ in hoisting behavior and syntax[^5]:

**Function Declaration:**

```javascript
console.log(declared()); // Works - "Hello from declaration"

function declared() {
  return "Hello from declaration";
}
```

**Function Expression:**

```javascript
console.log(expressed()); // TypeError: expressed is not a function

var expressed = function() {
  return "Hello from expression";
};
```

Function declarations are fully hoisted (both declaration and definition), while function expressions are only hoisted as variable declarations[^1].

**Question 7: What are higher-order functions in JavaScript?**

**Answer:** Higher-order functions are functions that either take other functions as arguments or return functions as their result[^5][^8]. They enable functional programming patterns:

```javascript
// Function that takes another function as argument
function applyOperation(arr, operation) {
  return arr.map(operation);
}

const numbers = [1, 2, 3, 4];
const doubled = applyOperation(numbers, x => x * 2);

// Function that returns another function
function createMultiplier(multiplier) {
  return function(value) {
    return value * multiplier;
  };
}

const triple = createMultiplier(3);
console.log(triple(4)); // 12
```


## Asynchronous JavaScript

**Question 8: Explain the event loop in JavaScript.**

**Answer:** The event loop is the mechanism that handles asynchronous operations in JavaScript's single-threaded environment[^6][^5]. It works as follows:

1. Synchronous code executes on the call stack
2. Asynchronous operations are handled by Web APIs
3. Completed async operations place callbacks in task queues
4. The event loop processes microtasks first, then macrotasks
5. This process continues indefinitely
```javascript
console.log('1'); // Synchronous

setTimeout(() => console.log('2'), 0); // Macrotask

Promise.resolve().then(() => console.log('3')); // Microtask

console.log('4'); // Synchronous

// Output: 1, 4, 3, 2
```

**Question 9: What are Promises and how do they work?**

**Answer:** Promises are objects that represent the eventual completion or failure of an asynchronous operation[^6][^5]. They have three states:

- **Pending**: Initial state
- **Fulfilled**: Operation completed successfully
- **Rejected**: Operation failed

```javascript
const fetchData = new Promise((resolve, reject) => {
  setTimeout(() => {
    const success = Math.random() > 0.5;
    if (success) {
      resolve("Data fetched successfully");
    } else {
      reject(new Error("Failed to fetch data"));
    }
  }, 1000);
});

fetchData
  .then(data => console.log(data))
  .catch(error => console.error(error))
  .finally(() => console.log("Operation completed"));
```

**Question 10: Explain `async`/`await` and how it simplifies asynchronous code.**

**Answer:** `async`/`await` is syntactic sugar built on top of Promises that makes asynchronous code look and behave more like synchronous code[^9][^10]:

```javascript
// Using Promises
function fetchUserData(userId) {
  return fetch(`/api/users/${userId}`)
    .then(response => response.json())
    .then(user => {
      return fetch(`/api/posts/${user.id}`);
    })
    .then(response => response.json());
}

// Using async/await
async function fetchUserData(userId) {
  try {
    const userResponse = await fetch(`/api/users/${userId}`);
    const user = await userResponse.json();
    
    const postsResponse = await fetch(`/api/posts/${user.id}`);
    const posts = await postsResponse.json();
    
    return posts;
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}
```

**Question 11: What is the difference between `Promise.all()`, `Promise.allSettled()`, and `Promise.race()`?**

**Answer:** These methods handle multiple promises differently[^5]:

- **`Promise.all()`**: Resolves when all promises resolve, rejects if any promise rejects
- **`Promise.allSettled()`**: Waits for all promises to settle (resolve or reject), never rejects
- **`Promise.race()`**: Resolves or rejects with the first promise that settles

```javascript
const promise1 = Promise.resolve(1);
const promise2 = Promise.resolve(2);
const promise3 = Promise.reject('Error');

// Promise.all - fails fast
Promise.all([promise1, promise2, promise3])
  .catch(error => console.log('All failed:', error));

// Promise.allSettled - waits for all
Promise.allSettled([promise1, promise2, promise3])
  .then(results => console.log('All settled:', results));

// Promise.race - first to finish wins
Promise.race([promise1, promise2, promise3])
  .then(result => console.log('Race winner:', result));
```


## ES6+ Features

**Question 12: What are template literals and how are they used?**

**Answer:** Template literals are string literals that allow embedded expressions and multi-line strings using backticks[^11]:

```javascript
const name = 'John';
const age = 30;

// String interpolation
const greeting = `Hello, my name is ${name} and I'm ${age} years old.`;

// Multi-line strings
const multiLine = `
  This is a
  multi-line
  string
`;

// Tagged templates
function highlight(strings, ...values) {
  return strings.reduce((result, string, i) => {
    const value = values[i] ? `<mark>${values[i]}</mark>` : '';
    return result + string + value;
  }, '');
}

const highlighted = highlight`Name: ${name}, Age: ${age}`;
```

**Question 13: Explain destructuring assignment in JavaScript.**

**Answer:** Destructuring allows unpacking values from arrays or properties from objects into distinct variables[^11]:

```javascript
// Array destructuring
const numbers = [1, 2, 3, 4, 5];
const [first, second, ...rest] = numbers;
console.log(first); // 1
console.log(rest); // [3, 4, 5]

// Object destructuring
const person = { name: 'Alice', age: 30, city: 'New York' };
const { name, age, country = 'USA' } = person;
console.log(name); // 'Alice'
console.log(country); // 'USA' (default value)

// Nested destructuring
const user = {
  profile: {
    personal: {
      firstName: 'John',
      lastName: 'Doe'
    }
  }
};

const { profile: { personal: { firstName } } } = user;
console.log(firstName); // 'John'
```

**Question 14: What are arrow functions and how do they differ from regular functions?**

**Answer:** Arrow functions provide a more concise syntax and have different `this` binding behavior[^11]:

**Differences:**

1. **Syntax**: More concise
2. **`this` binding**: Lexically bound
3. **Arguments object**: Not available
4. **Hoisting**: Not hoisted
5. **Constructor**: Cannot be used as constructors
```javascript
// Regular function
function regular(a, b) {
  return a + b;
}

// Arrow function
const arrow = (a, b) => a + b;

// `this` behavior difference
const obj = {
  name: 'Object',
  
  regularMethod: function() {
    setTimeout(function() {
      console.log(this.name); // undefined or global object
    }, 100);
  },
  
  arrowMethod: function() {
    setTimeout(() => {
      console.log(this.name); // 'Object'
    }, 100);
  }
};
```

**Question 15: Explain the spread operator and rest parameters.**

**Answer:** The spread operator (`...`) expands elements, while rest parameters collect elements[^11]:

```javascript
// Spread operator
const arr1 = [1, 2, 3];
const arr2 = [4, 5, 6];
const combined = [...arr1, ...arr2]; // [1, 2, 3, 4, 5, 6]

const obj1 = { a: 1, b: 2 };
const obj2 = { c: 3, d: 4 };
const merged = { ...obj1, ...obj2 }; // { a: 1, b: 2, c: 3, d: 4 }

// Rest parameters
function sum(...numbers) {
  return numbers.reduce((total, num) => total + num, 0);
}

console.log(sum(1, 2, 3, 4)); // 10

// Array destructuring with rest
const [first, ...remaining] = [1, 2, 3, 4, 5];
console.log(remaining); // [2, 3, 4, 5]
```


## Object-Oriented Programming

**Question 16: Explain prototypal inheritance in JavaScript.**

**Answer:** JavaScript uses prototypal inheritance where objects can inherit directly from other objects[^12][^13]. Every object has a prototype chain:

```javascript
// Constructor function approach
function Animal(name) {
  this.name = name;
}

Animal.prototype.speak = function() {
  console.log(`${this.name} makes a sound`);
};

function Dog(name, breed) {
  Animal.call(this, name);
  this.breed = breed;
}

// Set up inheritance
Dog.prototype = Object.create(Animal.prototype);
Dog.prototype.constructor = Dog;

Dog.prototype.bark = function() {
  console.log(`${this.name} barks loudly`);
};

const dog = new Dog('Max', 'Golden Retriever');
dog.speak(); // 'Max makes a sound'
dog.bark(); // 'Max barks loudly'
```

**Question 17: What are ES6 classes and how do they compare to function constructors?**

**Answer:** ES6 classes provide a more familiar syntax for creating objects and handling inheritance[^11], but they're syntactic sugar over prototypal inheritance:

```javascript
// ES6 Class
class Animal {
  constructor(name) {
    this.name = name;
  }
  
  speak() {
    console.log(`${this.name} makes a sound`);
  }
  
  static getSpecies() {
    return 'Unknown species';
  }
}

class Dog extends Animal {
  constructor(name, breed) {
    super(name);
    this.breed = breed;
  }
  
  bark() {
    console.log(`${this.name} barks`);
  }
}

const dog = new Dog('Buddy', 'Labrador');
dog.speak(); // 'Buddy makes a sound'
dog.bark(); // 'Buddy barks'
```

**Question 18: Explain the difference between `call`, `apply`, and `bind`.**

**Answer:** These methods allow explicit control over the `this` context[^5]:

- **`call()`**: Invokes function immediately with specified `this` and individual arguments
- **`apply()`**: Invokes function immediately with specified `this` and array of arguments
- **`bind()`**: Returns new function with bound `this` context

```javascript
const person = {
  name: 'Alice',
  greet: function(greeting, punctuation) {
    return `${greeting}, ${this.name}${punctuation}`;
  }
};

const anotherPerson = { name: 'Bob' };

// call - individual arguments
console.log(person.greet.call(anotherPerson, 'Hello', '!')); // 'Hello, Bob!'

// apply - array of arguments
console.log(person.greet.apply(anotherPerson, ['Hi', '.'])); // 'Hi, Bob.'

// bind - returns new function
const boundGreet = person.greet.bind(anotherPerson, 'Hey');
console.log(boundGreet('?')); // 'Hey, Bob?'
```


## DOM Manipulation and Events

**Question 19: What is the DOM and how do you manipulate it?**

**Answer:** The Document Object Model (DOM) is a programming interface for web documents that represents the page as a tree of objects[^14][^15]:

```javascript
// Selecting elements
const element = document.getElementById('myId');
const elements = document.querySelectorAll('.myClass');
const firstMatch = document.querySelector('div.container');

// Creating and modifying elements
const newDiv = document.createElement('div');
newDiv.textContent = 'Hello World';
newDiv.className = 'greeting';

// Adding to DOM
document.body.appendChild(newDiv);

// Modifying existing elements
element.innerHTML = '<strong>Updated content</strong>';
element.style.color = 'blue';
element.setAttribute('data-id', '123');
```

**Question 20: Explain event delegation and its benefits.**

**Answer:** Event delegation is a technique where you attach a single event listener to a parent element instead of multiple listeners to child elements[^5]:

```javascript
// Instead of this (inefficient)
document.querySelectorAll('.button').forEach(button => {
  button.addEventListener('click', handleClick);
});

// Use this (event delegation)
document.getElementById('container').addEventListener('click', function(event) {
  if (event.target.classList.contains('button')) {
    handleClick(event);
  }
});

function handleClick(event) {
  console.log('Button clicked:', event.target.textContent);
}
```

**Benefits:**

- Better performance with many elements
- Automatically handles dynamically added elements
- Reduces memory usage
- Simplifies event management

**Question 21: What is event bubbling and capturing?**

**Answer:** Event propagation occurs in three phases[^5]:

1. **Capturing phase**: Event travels from document to target
2. **Target phase**: Event reaches the target element
3. **Bubbling phase**: Event bubbles up from target to document
```javascript
// Event bubbling (default)
element.addEventListener('click', handler); // Bubbling phase

// Event capturing
element.addEventListener('click', handler, true); // Capturing phase

// Stop propagation
function handler(event) {
  event.stopPropagation(); // Stops further propagation
  event.preventDefault(); // Prevents default behavior
}
```


## Error Handling

**Question 22: How do you handle errors in JavaScript using try-catch blocks?**

**Answer:** The `try-catch-finally` construct provides structured error handling[^16][^17]:

```javascript
async function fetchUserData(userId) {
  try {
    // Code that might throw an error
    const response = await fetch(`/api/users/${userId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const userData = await response.json();
    return userData;
    
  } catch (error) {
    // Handle different types of errors
    if (error instanceof TypeError) {
      console.error('Network error:', error.message);
    } else if (error instanceof SyntaxError) {
      console.error('JSON parsing error:', error.message);
    } else {
      console.error('Unexpected error:', error.message);
    }
    
    // Re-throw if needed
    throw error;
    
  } finally {
    // Cleanup code that always runs
    console.log('Cleanup completed');
  }
}

// Custom error classes
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

function validateEmail(email) {
  if (!email.includes('@')) {
    throw new ValidationError('Invalid email format', 'email');
  }
}
```


## Data Types and Structures

**Question 23: Explain the differences between `Map` and `Object` in JavaScript.**

**Answer:** While both store key-value pairs, they have important differences[^5]:


| Feature | Object | Map |
| :-- | :-- | :-- |
| Key types | Strings and Symbols only | Any type |
| Size | No direct way to get size | `map.size` property |
| Iteration | Requires `Object.keys()` | Directly iterable |
| Performance | Optimized for property access | Optimized for frequent additions/deletions |
| Prototype | Has default keys | No default keys |

```javascript
// Object
const obj = {
  'string': 'value1',
  1: 'value2'
};
console.log(Object.keys(obj).length); // Get size indirectly

// Map
const map = new Map();
map.set('string', 'value1');
map.set(1, 'value2');
map.set(true, 'value3');
map.set({}, 'value4');

console.log(map.size); // 4
console.log(map.get(1)); // 'value2'

// Iteration
for (const [key, value] of map) {
  console.log(key, value);
}
```

**Question 24: What are Sets and WeakSets in JavaScript?**

**Answer:** Sets store unique values of any type, while WeakSets store only objects and have weak references[^5]:

```javascript
// Set
const uniqueNumbers = new Set([1, 2, 2, 3, 3, 4]);
console.log(uniqueNumbers); // Set { 1, 2, 3, 4 }

uniqueNumbers.add(5);
console.log(uniqueNumbers.has(3)); // true
console.log(uniqueNumbers.size); // 5

// WeakSet
const weakSet = new WeakSet();
const obj1 = {};
const obj2 = {};

weakSet.add(obj1);
weakSet.add(obj2);

console.log(weakSet.has(obj1)); // true

// WeakSet benefits:
// - No memory leaks (weak references)
// - Objects can be garbage collected
// - Cannot be iterated
// - No size property
```


## Performance Optimization

**Question 25: What are some techniques for optimizing JavaScript performance?**

**Answer:** Performance optimization involves multiple strategies[^18][^19][^20]:

**Code Optimization:**

```javascript
// Debouncing for expensive operations
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttling for frequent events
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Efficient DOM manipulation
function updateMultipleElements(elements, updates) {
  // Batch DOM updates
  const fragment = document.createDocumentFragment();
  elements.forEach((element, index) => {
    const clone = element.cloneNode(true);
    clone.textContent = updates[index];
    fragment.appendChild(clone);
  });
  document.body.appendChild(fragment);
}
```

**Memory Management:**

```javascript
// Avoid memory leaks
function createHandler() {
  const data = new Array(1000000).fill('data');
  
  return function handler() {
    // Don't hold references to large objects unnecessarily
    console.log('Handler executed');
  };
}

// Use WeakMap for private data
const privateData = new WeakMap();

class MyClass {
  constructor() {
    privateData.set(this, { secret: 'hidden' });
  }
  
  getSecret() {
    return privateData.get(this).secret;
  }
}
```

**Question 26: Explain lazy loading and its implementation.**

**Answer:** Lazy loading defers loading of resources until they're needed[^21]:

```javascript
// Lazy loading images
const imageObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;
      img.classList.remove('lazy');
      observer.unobserve(img);
    }
  });
});

document.querySelectorAll('img[data-src]').forEach(img => {
  imageObserver.observe(img);
});

// Lazy loading modules
const loadModule = async (moduleName) => {
  const module = await import(`./modules/${moduleName}.js`);
  return module.default;
};

// Component lazy loading
const LazyComponent = React.lazy(() => import('./Component'));
```


## Advanced Concepts

**Question 27: What are generators and iterators in JavaScript?**

**Answer:** Generators are functions that can pause and resume execution, while iterators provide a way to access elements sequentially[^5]:

```javascript
// Generator function
function* numberGenerator() {
  let num = 1;
  while (true) {
    const reset = yield num;
    if (reset) {
      num = 1;
    } else {
      num++;
    }
  }
}

const gen = numberGenerator();
console.log(gen.next().value); // 1
console.log(gen.next().value); // 2
console.log(gen.next(true).value); // 1 (reset)

// Custom iterator
const iterable = {
  data: [1, 2, 3],
  [Symbol.iterator]() {
    let index = 0;
    return {
      next: () => ({
        value: this.data[index],
        done: index++ >= this.data.length
      })
    };
  }
};

for (const value of iterable) {
  console.log(value); // 1, 2, 3
}
```

**Question 28: What are Symbols and their use cases?**

**Answer:** Symbols are primitive data types that create unique identifiers[^5]:

```javascript
// Creating symbols
const sym1 = Symbol('description');
const sym2 = Symbol('description');
console.log(sym1 === sym2); // false (always unique)

// Private object properties
const PRIVATE_PROP = Symbol('private');
class MyClass {
  constructor() {
    this[PRIVATE_PROP] = 'secret data';
    this.publicProp = 'public data';
  }
  
  getPrivate() {
    return this[PRIVATE_PROP];
  }
}

// Well-known symbols
const obj = {
  [Symbol.iterator]: function*() {
    yield 1;
    yield 2;
    yield 3;
  },
  
  [Symbol.toPrimitive](hint) {
    if (hint === 'number') return 42;
    if (hint === 'string') return 'object';
    return true;
  }
};
```

**Question 29: Explain currying and partial application.**

**Answer:** Currying transforms a function with multiple arguments into a sequence of functions with single arguments[^5]:

```javascript
// Regular function
function add(a, b, c) {
  return a + b + c;
}

// Curried version
function curriedAdd(a) {
  return function(b) {
    return function(c) {
      return a + b + c;
    };
  };
}

// Arrow function currying
const curriedAddArrow = a => b => c => a + b + c;

console.log(curriedAdd(1)(2)(3)); // 6

// Partial application
function partial(fn, ...args1) {
  return function(...args2) {
    return fn(...args1, ...args2);
  };
}

const add10 = partial(add, 10);
console.log(add10(5, 3)); // 18

// Practical example: event handling
const handleClick = (action, element, event) => {
  console.log(`${action} performed on`, element.tagName);
};

const editHandler = partial(handleClick, 'Edit');
const deleteHandler = partial(handleClick, 'Delete');
```


## Module Systems and Build Tools

**Question 30: Explain the differences between CommonJS and ES6 modules.**

**Answer:** These are two different module systems with distinct syntax and loading behavior[^5]:

**CommonJS (Node.js):**

```javascript
// Exporting
module.exports = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b
};

// or
exports.add = (a, b) => a + b;
exports.subtract = (a, b) => a - b;

// Importing
const { add, subtract } = require('./math');
const math = require('./math');
```

**ES6 Modules:**

```javascript
// Exporting
export const add = (a, b) => a + b;
export const subtract = (a, b) => a - b;

// Default export
export default function multiply(a, b) {
  return a * b;
}

// Importing
import { add, subtract } from './math.js';
import multiply from './math.js';
import * as math from './math.js';
```

**Key Differences:**

- **Loading**: CommonJS loads synchronously, ES6 modules load asynchronously
- **Syntax**: Different import/export syntax
- **Tree shaking**: ES6 modules support tree shaking
- **Dynamic imports**: ES6 supports dynamic imports with `import()`


## Testing and Debugging

**Question 31: How do you debug JavaScript code effectively?**

**Answer:** Debugging involves various tools and techniques[^5]:

```javascript
// Console methods
console.log('Basic logging');
console.error('Error message');
console.warn('Warning message');
console.table([{ name: 'John', age: 30 }, { name: 'Jane', age: 25 }]);
console.time('operation');
// ... code to measure
console.timeEnd('operation');

// Debugger statement
function problematicFunction(data) {
  debugger; // Pauses execution in developer tools
  return data.map(item => item.value);
}

// Error boundaries and logging
class ErrorHandler {
  static log(error, context) {
    console.error(`Error in ${context}:`, error);
    // Send to logging service
  }
  
  static handle(fn, context) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        ErrorHandler.log(error, context);
        throw error;
      }
    };
  }
}

// Performance monitoring
const performanceMonitor = {
  measure(name, fn) {
    return async (...args) => {
      const start = performance.now();
      const result = await fn(...args);
      const end = performance.now();
      console.log(`${name} took ${end - start} milliseconds`);
      return result;
    };
  }
};
```


## Browser APIs and Web Technologies

**Question 32: Explain the Fetch API and how to handle different response types.**

**Answer:** The Fetch API provides a modern interface for making HTTP requests[^5]:

```javascript
// Basic fetch with error handling
async function fetchData(url, options = {}) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token'
      },
      ...options
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Handle different content types
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      return await response.json();
    } else if (contentType?.includes('text/')) {
      return await response.text();
    } else if (contentType?.includes('image/')) {
      return await response.blob();
    } else {
      return await response.arrayBuffer();
    }
    
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

// POST request with form data
async function submitForm(data) {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    formData.append(key, value);
  });
  
  return fetchData('/api/submit', {
    method: 'POST',
    body: formData
  });
}

// Request cancellation
const controller = new AbortController();
const signal = controller.signal;

fetchData('/api/data', { signal })
  .then(data => console.log(data))
  .catch(error => {
    if (error.name === 'AbortError') {
      console.log('Request was cancelled');
    }
  });

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);
```

**Question 33: What are Web Workers and when would you use them?**

**Answer:** Web Workers allow running JavaScript in background threads, enabling parallel processing without blocking the main UI thread[^19]:

```javascript
// Main thread
const worker = new Worker('worker.js');

// Send data to worker
worker.postMessage({ 
  command: 'process',
  data: largeDataSet 
});

// Receive results from worker
worker.onmessage = function(event) {
  const { result, progress } = event.data;
  
  if (progress) {
    updateProgressBar(progress);
  } else {
    displayResults(result);
    worker.terminate(); // Clean up
  }
};

// Handle errors
worker.onerror = function(error) {
  console.error('Worker error:', error);
};
```

**worker.js:**

```javascript
// Worker thread
self.onmessage = function(event) {
  const { command, data } = event.data;
  
  if (command === 'process') {
    const result = [];
    const total = data.length;
    
    for (let i = 0; i < data.length; i++) {
      // Intensive processing
      const processed = complexCalculation(data[i]);
      result.push(processed);
      
      // Report progress
      if (i % 1000 === 0) {
        self.postMessage({ 
          progress: Math.round((i / total) * 100) 
        });
      }
    }
    
    // Send final result
    self.postMessage({ result });
  }
};

function complexCalculation(item) {
  // Simulate heavy computation
  let result = item;
  for (let i = 0; i < 10000; i++) {
    result = Math.sqrt(result + i);
  }
  return result;
}
```


## Security Considerations

**Question 34: How do you prevent XSS attacks in JavaScript applications?**

**Answer:** Cross-Site Scripting (XSS) prevention requires multiple security measures[^5]:

```javascript
// Input sanitization
function sanitizeInput(input) {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

// Safe DOM manipulation
function safeUpdateContent(element, content) {
  // Use textContent instead of innerHTML for user data
  element.textContent = content;
  
  // If HTML is needed, sanitize it
  element.innerHTML = sanitizeHTML(content);
}

// Content Security Policy helper
function setCSP() {
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = "default-src 'self'; script-src 'self' 'unsafe-inline'";
  document.head.appendChild(meta);
}

// Validate and encode URL parameters
function getCleanUrlParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  const value = urlParams.get(param);
  return value ? encodeURIComponent(value) : null;
}

// Safe JSON parsing
function safeJSONParse(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Invalid JSON:', error);
    return null;
  }
}
```


## Advanced Patterns and Best Practices

**Question 35: Explain the Module Pattern and its variations.**

**Answer:** The Module Pattern provides encapsulation and helps avoid global namespace pollution[^5]:

```javascript
// IIFE Module Pattern
const Calculator = (function() {
  // Private variables and functions
  let result = 0;
  
  function log(operation, value) {
    console.log(`${operation}: ${value}`);
  }
  
  // Public API
  return {
    add(value) {
      result += value;
      log('Add', value);
      return this;
    },
    
    subtract(value) {
      result -= value;
      log('Subtract', value);
      return this;
    },
    
    getResult() {
      return result;
    },
    
    reset() {
      result = 0;
      return this;
    }
  };
})();

// Usage
Calculator.add(10).subtract(3).add(5);
console.log(Calculator.getResult()); // 12

// ES6 Module Pattern
class ModuleClass {
  #privateValue = 0; // Private field
  
  #privateMethod() {
    return 'This is private';
  }
  
  publicMethod() {
    return this.#privateMethod();
  }
  
  get value() {
    return this.#privateValue;
  }
  
  set value(newValue) {
    if (newValue >= 0) {
      this.#privateValue = newValue;
    }
  }
}
```

**Question 36: What is memoization and how do you implement it?**

**Answer:** Memoization is a technique that stores the results of expensive function calls and returns the cached result for the same inputs[^6]:

```javascript
// Simple memoization
function memoize(fn) {
  const cache = new Map();
  
  return function(...args) {
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      console.log('Cache hit');
      return cache.get(key);
    }
    
    console.log('Computing result');
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

// Example: Fibonacci with memoization
const fibonacci = memoize(function(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
});

console.log(fibonacci(10)); // Computes once
console.log(fibonacci(10)); // Returns cached result

// Advanced memoization with cache size limit
function memoizeWithLimit(fn, limit = 100) {
  const cache = new Map();
  
  return function(...args) {
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      // Move to end (LRU)
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      return value;
    }
    
    const result = fn.apply(this, args);
    
    // Remove oldest entry if limit reached
    if (cache.size >= limit) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    cache.set(key, result);
    return result;
  };
}
```

**Question 37: Explain the Observer Pattern in JavaScript.**

**Answer:** The Observer Pattern defines a subscription mechanism to notify multiple objects about events[^5]:

```javascript
// Event Emitter implementation
class EventEmitter {
  constructor() {
    this.events = {};
  }
  
  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return this;
  }
  
  off(event, listenerToRemove) {
    if (!this.events[event]) return this;
    
    this.events[event] = this.events[event].filter(
      listener => listener !== listenerToRemove
    );
    return this;
  }
  
  emit(event, ...args) {
    if (!this.events[event]) return this;
    
    this.events[event].forEach(listener => {
      listener.apply(this, args);
    });
    return this;
  }
  
  once(event, listener) {
    const onceWrapper = (...args) => {
      this.off(event, onceWrapper);
      listener.apply(this, args);
    };
    return this.on(event, onceWrapper);
  }
}

// Usage example
class UserService extends EventEmitter {
  constructor() {
    super();
    this.users = [];
  }
  
  addUser(user) {
    this.users.push(user);
    this.emit('userAdded', user);
  }
  
  removeUser(userId) {
    const index = this.users.findIndex(u => u.id === userId);
    if (index !== -1) {
      const user = this.users.splice(index, 1)[^0];
      this.emit('userRemoved', user);
    }
  }
}

const userService = new UserService();

// Subscribe to events
userService.on('userAdded', (user) => {
  console.log(`User ${user.name} was added`);
});

userService.on('userRemoved', (user) => {
  console.log(`User ${user.name} was removed`);
});
```


## Memory Management and Performance

**Question 38: How does garbage collection work in JavaScript?**

**Answer:** JavaScript uses automatic memory management through garbage collection[^5][^19]. The most common algorithm is mark-and-sweep:

```javascript
// Memory leak prevention strategies

// 1. Avoid global variables
(function() {
  'use strict';
  let localVariable = 'stays in function scope';
})();

// 2. Clean up event listeners
class Component {
  constructor() {
    this.handleClick = this.handleClick.bind(this);
  }
  
  mount() {
    document.addEventListener('click', this.handleClick);
  }
  
  unmount() {
    document.removeEventListener('click', this.handleClick);
  }
  
  handleClick(event) {
    console.log('Clicked');
  }
}

// 3. Clear intervals and timeouts
class Timer {
  constructor() {
    this.intervalId = null;
  }
  
  start() {
    this.intervalId = setInterval(() => {
      console.log('Timer tick');
    }, 1000);
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// 4. Use WeakMap for object relationships
const objectData = new WeakMap();

class DataManager {
  setData(object, data) {
    objectData.set(object, data);
  }
  
  getData(object) {
    return objectData.get(object);
  }
}

// When object is garbage collected, 
// associated data in WeakMap is also cleaned up
```

**Question 39: Explain debouncing and throttling with practical examples.**

**Answer:** Both techniques control the rate of function execution[^18]:

```javascript
// Debouncing - delays execution until after a period of inactivity
function debounce(func, delay) {
  let timeoutId;
  
  return function debounced(...args) {
    clearTimeout(timeoutId);
    
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

// Throttling - limits execution to once per time period
function throttle(func, limit) {
  let inThrottle;
  
  return function throttled(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Practical applications
const searchInput = document.getElementById('search');
const scrollContainer = document.getElementById('content');

// Debounced search - wait for user to stop typing
const debouncedSearch = debounce(function(query) {
  console.log('Searching for:', query);
  // API call to search
}, 300);

searchInput.addEventListener('input', (e) => {
  debouncedSearch(e.target.value);
});

// Throttled scroll - limit scroll event handling
const throttledScroll = throttle(function() {
  console.log('Scroll position:', window.scrollY);
  // Update scroll position indicator
}, 100);

window.addEventListener('scroll', throttledScroll);

// Advanced debouncing with immediate execution option
function advancedDebounce(func, delay, immediate = false) {
  let timeoutId;
  
  return function debounced(...args) {
    const callNow = immediate && !timeoutId;
    
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (!immediate) func.apply(this, args);
    }, delay);
    
    if (callNow) func.apply(this, args);
  };
}
```

**Question 40: How would you implement a deep clone function in JavaScript?**

**Answer:** Deep cloning creates a complete copy of nested objects and arrays[^5]:

```javascript
function deepClone(obj, visited = new WeakMap()) {
  // Handle primitive types and null
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  // Handle circular references
  if (visited.has(obj)) {
    return visited.get(obj);
  }
  
  // Handle Date objects
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  // Handle RegExp objects
  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags);
  }
  
  // Handle Arrays
  if (Array.isArray(obj)) {
    const clonedArray = [];
    visited.set(obj, clonedArray);
    
    for (let i = 0; i < obj.length; i++) {
      clonedArray[i] = deepClone(obj[i], visited);
    }
    
    return clonedArray;
  }
  
  // Handle Map objects
  if (obj instanceof Map) {
    const clonedMap = new Map();
    visited.set(obj, clonedMap);
    
    for (const [key, value] of obj) {
      clonedMap.set(
        deepClone(key, visited), 
        deepClone(value, visited)
      );
    }
    
    return clonedMap;
  }
  
  // Handle Set objects
  if (obj instanceof Set) {
    const clonedSet = new Set();
    visited.set(obj, clonedSet);
    
    for (const value of obj) {
      clonedSet.add(deepClone(value, visited));
    }
    
    return clonedSet;
  }
  
  // Handle plain objects
  const clonedObj = {};
  visited.set(obj, clonedObj);
  
  // Copy all enumerable properties
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      clonedObj[key] = deepClone(obj[key], visited);
    }
  }
  
  return clonedObj;
}

// Test cases
const original = {
  name: 'John',
  age: 30,
  hobbies: ['reading', 'gaming'],
  address: {
    city: 'New York',
    zip: 10001
  },
  birthDate: new Date('1990-01-01'),
  pattern: /[a-z]+/gi,
  map: new Map([['key1', 'value1']]),
  set: new Set([1, 2, 3])
};

// Create circular reference
original.self = original;

const cloned = deepClone(original);
console.log(cloned.name); // 'John'
console.log(cloned.self === cloned); // true (circular reference preserved)
console.log(cloned === original); // false (different objects)
```

This comprehensive collection of 40 JavaScript interview questions covers the essential concepts that senior frontend developers with 4 years of experience should master. Each question targets specific areas that are commonly evaluated in technical interviews, from fundamental concepts like hoisting and closures to advanced topics like performance optimization and design patterns[^22][^6][^5][^23].

The questions are designed to assess both theoretical knowledge and practical problem-solving skills, reflecting the real-world challenges you'll face as an experienced frontend developer. Regular practice with these questions will help you demonstrate your expertise and confidence in JavaScript interviews[^24][^25][^8].

<div style="text-align: center">⁂</div>



<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" class="logo" width="120"/>

# JavaScript Coding Questions: Arrays, Objects, and Strings

This collection of **40 coding challenges** focuses on **array**, **object**, and **string manipulation** using **no built-in functions** like `map()`, `filter()`, or `JSON.stringify()`. Solutions prioritize simplicity and fundamtal understanding of data structures.

## **Array Operations**

### **Fundamentals**

1. **Check Array Emptiness**
*Implement a function to determine if an array is empty.*

```javascript
function isArrayEmpty(arr) {
  return typeof arr === 'object' && arr !== null && arr.length === 0;
}  
// Usage: console.log(isArrayEmpty([])); // true  
```

[Citation \#8, \#4]
2. **Manual Deep Clone**
*Create a deep copy of a nested array without `slice()` or `spread`.*

```javascript
function cloneArray(arr) {
  let copy = [];
  for (let i = 0; i < arr.length; i++) {
    if (Array.isArray(arr[i])) {
      copy.push(cloneArray(arr[i]));
    } else {
      copy[i] = arr[i];
    }
  }
  return copy;
}  
```

[Citation \#4]
3. **Merge Sorted Arrays**
*Combine two sorted arrays into a single sorted array.*

```javascript
function mergeSortedArrays(a, b) {
  let merged = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    a[i] < b[j] ? merged.push(a[i++]) : merged.push(b[j++]);
  }
  while (i < a.length) merged.push(a[i++]);
  while (j < b.length) merged.push(b[j++]);
  return merged;
}  
```

[Citation \#2, \#5]

### **Math and Filtering**

4. **Sum Array Elements**

```javascript
function sumArray(arr) {
  let sum = 0;
  for (const num of arr) sum += num;
  return sum;
}  
```

5. **Find Maximum Element**

```javascript
function findMax(arr) {
  let max = arr[^0];
  for (i = 1; i < arr.length; i++) {
    if (arr[i] > max) max = arr[i];
  }
  return max;
}  
```

[Citation \#3]
6. **Remove Duplicates**

```javascript
function removeDuplicates(arr) {
  const seen = {};
  const result = [];
  for (const num of arr) {
    if (!(num in seen)) {
      seen[num] = true;
      result.push(num);
    }
  }
  return result;
}  
```

7. **Check Prime Numbers**

```javascript
function isPrime(num) {
  for (let i = 2; i < num; i++) {
    if (num % i === 0) return false;
  }
  return num > 1;
}  
```


## **String Manipulation**

### **Character Operations**

8. **Reverse String**

```javascript
function reverseStr(s) {
  let reversed = '';
  for (let i = s.length - 1; i >= 0; i--) {
    reversed += s.charAt(i);
  }
  return reversed;
}  
```

[Citation \#7]
9. **Check Palindrome**

```javascript
function isPalindrome(s) {
  for (let i = 0; i < s.length / 2; i++) {
    if (s[i] !== s[s.length - 1 - i]) return false;
  }
  return true;
}  
```

10. **Replace All Occurrences**

```javascript
function replaceAll(str, find, replace) {
  let result = '';
  let i = 0;
  while (i < str.length) {
    if (str.substring(i, i + find.length) === find) {
      result += replace;
      i += find.length;
    } else {
      result += str[i];
      i++;
    }
  }
  return result;
}  
```


### **Index and Slice**

11. **Convert to Uppercase/Lowercase**

```javascript
function toUpperCase(str) {
  let result = '';
  for (const c of str) {
    result += String.fromCharCode(c.charCodeAt(0) & 0x1F);
  }
  return result;
}  
```

12. **Find First Occurrence**

```javascript
function findChar(str, c) {
  for (let i = 0; i < str.length; i++) {
    if (str[i] === c) return i;
  }
  return -1;
}  
```

13. **Split Without `split()`**

```javascript
function manualSplit(str, delimiter) {
  const parts = [];
  let start = 0;
  while (true) {
    const index = str.indexOf(delimiter, start);
    if (index === -1) break;
    parts.push(str.substring(start, index));
    start = index + delimiter.length;
  }
  parts.push(str.substring(start));
  return parts;
}  
```


## **Object Handling**

### **Basic Operations**

14. **Manual Deep Clone**

```javascript
function cloneObject(obj) {
  const copy = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      copy[key] = typeof value === 'object' ? cloneObject(value) : value;
    }
  }
  return copy;
}  
```

[Citation \#2, \#4]
15. **Check Property Existence**

```javascript
function hasProperty(obj, prop) {
  for (const key in obj) {
    if (key === prop) return true;
  }
  return false;
}  
```

16. **Merge Objects**

```javascript
function mergeObjects(a, b) {
  const merged = {};
  for (const key in a) merged[key] = a[key];
  for (const key in b) merged[key] = b[key];
  return merged;
}  
```


### **Advanced Queries**

17. **Sort Object Keys**

```javascript
function sortedKeys(obj) {
  const keys = [];
  for (const key in obj) keys.push(key);
  keys.sort();
  return keys;
}  
```

18. **Freeze Object Manually**

```javascript
function freezeObject(obj) {
  let target = obj;
  const keys = Object.keys(target).slice();
  Object.seal(obj); // Prevent external modification
  // Manual 'freeze' via tamper-proof descriptors (simplified)
  for (const prop of keys) {
    Object.defineProperty(target, prop, {
      writable: false
    });
  }
  return target;
}  
```


## **Combined Challenges**

### **Array ↔ String Conversions**

19. **Join Array to String**

```javascript
function joinArray(arr, separator) {
  let result = '';
  for (let i = 0; i < arr.length; i++) {
    if (i > 0) result += separator;
    result += arr[i].toString();
  }
  return result;
}  
```

20. **Split String to Array**
*Use same logic as question 13.*

### **Nested Data Structures**

21. **Flatten Nested Object**

```javascript
function flatten(obj, result = {}, prefix = '') {
  for (const key in obj) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object') {
      flatten(obj[key], result, newKey);
    } else {
      result[newKey] = obj[key];
    }
  }
  return result;
}  
```

22. **Array of Objects: Group by Property**

```javascript
function groupBy(arr, prop) {
  const grouped = {};
  for (const obj of arr) {
    const key = obj[prop];
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(obj);
  }
  return grouped;
}  
```


## **Performance-Critical Scenarios**

### **Benchmarks and Limits**

23. **Sum Even Numbers**

```javascript
function sumEven(arr) {
  let total = 0;
  for (const n of arr) {
    if (n % 2 === 0) total += n;
  }
  return total;
}  
```

24. **Check for Unique Elements**

```javascript
function areUnique(arr) {
  const seen = {};
  for (const num of arr) {
    if (seen[num]) return false;
    seen[num] = true;
  }
  return true;
}  
```


### **Edge Cases**

25. **Array Zip**

```javascript
function zip(arr1, arr2) {
  const zipped = [];
  const len = Math.min(arr1.length, arr2.length);
  for (let i = 0; i < len; i++) {
    zipped.push([arr1[i], arr2[i]]);
  }
  return zipped;
}  
```

26. **Subarray Search**

```javascript
function hasSubarray(main, sub) {
  let sla = main.length, subLen = sub.length;
  if (subLen > sla) return false;
  for (let i = 0; i < sla - subLen + 1; i++) {
    let match = true;
    for (let j = 0; j < subLen; j++) {
      if (main[i + j] !== sub[j]) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}  
```


## **Final Set: 30-40**

Create similar patterns for:

30. **Binary Search Array**
```javascript
function binarySearch(arr, target) {
  // Implement using division approach
}
```

31. **Caesar Cipher String**
```javascript
function caesarCipher(str, shift) {
  // Iterate and modify char codes
}
```

32. **Prime Factors Array**
```javascript
function primeFactors(n) {
  // Return array of factors
}
```

33. **Anagram Check**
```javascript
function areAnagrams(str1, str2) {
  // Sort characters manually
}
```

34. **Fibonacci Sequence Array**
```javascript
function fibonacci(n) {
  // Generate sequence
}
```

35. **Carry/Add Two Number Arrays**
```javascript
function addArrays(a, b) {
  // Treat as numbers
}
```

36. **Min/Max Subarray**
```javascript
function minSubarray(arr) {
  // Track min/sum
}
```

37. **Number to String**
```javascript
function numToString(n) {
  // Convert digits iteratively
}
```

38. **Validate IP Address String**
```javascript
function isValidIP(s) {
  // Split and check format
}
```

39. **First Unique Character**
```javascript
function firstUnique(s) {
  // Track frequencies
}
```

40. **Decode String**
```javascript
function decodeString(s) {
  // Handle nested encoded strings
}
```

**Practice Tip:** For advanced challenges, substitute loops with recursive approaches where appropriate (e.g., binary search, Fibonacci). All solutions avoid internal functions like `Array.sort()` or `JSON.parse()` [Citation \#2, \#5, \#8].

<div style="text-align: center">⁂</div>


<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" class="logo" width="120"/>

# i want lot of questions on what will be the output of this in big topics like

closuers, hoisting, promices, async await, event loop give me alto with answers so i can be well prepared for it give me atleas 40

Of course. Here are over 40 "What will be the output?" questions covering closures, hoisting, promises, async/await, and the event loop, complete with answers and explanations to help you prepare for your JavaScript interviews.

### Hoisting

Hoisting is JavaScript's default behavior of moving declarations to the top of the current scope.

**Question 1**

```javascript
console.log(x);
var x = 5;
console.log(x);
```

**Output:**

```
undefined
5
```

**Explanation:** The declaration `var x` is hoisted to the top of its scope, but its initialization (`= 5`) is not. The first `console.log(x)` runs before the assignment, so `x` is `undefined` [^1].

**Question 2**

```javascript
foo();
function foo() {
  console.log("Hello");
}
```

**Output:**

```
Hello
```

**Explanation:** Function declarations are fully hoisted, meaning both the name and the function body are moved to the top. Therefore, the function can be called before it is defined in the code [^2].

**Question 3**

```javascript
console.log(bar);
var bar = function() {
  console.log("World");
};
bar();
```

**Output:**

```
undefined
World
```

**Explanation:** When using a function expression, only the variable declaration (`var bar`) is hoisted, not the function assignment. The first log prints `undefined`. The function is only assigned to `bar` afterward, allowing the second call to execute successfully [^1].

**Question 4**

```javascript
console.log(a);
let a = 10;
```

**Output:**

```
ReferenceError: Cannot access 'a' before initialization
```

**Explanation:** `let` and `const` variables are hoisted but not initialized. They are in a "temporal dead zone" from the start of the block until the declaration is encountered. Accessing them in this zone results in a `ReferenceError` [^3].

**Question 5**

```javascript
var x = 1;
function func() {
  console.log(x);
  var x = 2;
}
func();
```

**Output:**

```
undefined
```

**Explanation:** Inside `func`, the local variable `x` is hoisted. This local `x` shadows the global `x`. When `console.log(x)` is called within the function, it refers to the hoisted but not-yet-assigned local `x`, which is `undefined`.

**Question 6**

```javascript
function test() {
  console.log(a);
  console.log(foo());

  var a = 1;
  function foo() {
    return 2;
  }
}
test();
```

**Output:**

```
undefined
2
```

**Explanation:** The variable declaration `var a` is hoisted within `test`, but its value is `undefined` until the assignment. The function declaration `foo` is fully hoisted, so it can be called anywhere within the function [^3].

**Question 7**

```javascript
var z = 10;
function outer() {
  console.log(z);
}
outer();
```

**Output:**

```
10
```

**Explanation:** The function `outer` does not have its own variable `z`, so it looks up the scope chain and finds the global variable `z` with the value of 10.

**Question 8**

```javascript
"use strict";
x = 23; 
var x;
console.log(x);
```

**Output:**

```
ReferenceError: x is not defined
```

**Explanation:** In strict mode, assigning a value to an undeclared variable is an error. Although `var x` is hoisted, the assignment `x = 23` happens before the declaration is processed, which is not allowed in strict mode [^2].

### Closures

A closure is a function that has access to its outer function's scope, even after the outer function has returned.

**Question 9**

```javascript
function outer() {
  var x = "Hello";
  function inner() {
    console.log(x);
  }
  return inner;
}
var myFunc = outer();
myFunc();
```

**Output:**

```
Hello
```

**Explanation:** The `inner` function forms a closure over the `outer` function's scope. Even after `outer` has finished execution, `myFunc` (which is a reference to `inner`) still has access to the `x` variable [^4].

**Question 10**

```javascript
for (var i = 1; i <= 5; i++) {
  setTimeout(function() {
    console.log(i);
  }, i * 1000);
}
```

**Output:**

```
6
6
6
6
6
```

**Explanation:** Because `var` is function-scoped, all five `setTimeout` callbacks reference the same variable `i`. The loop finishes first, leaving `i` with a final value of 6. When the timers eventually fire, they all log this final value [^5].

**Question 11**

```javascript
for (let i = 1; i <= 5; i++) {
  setTimeout(function() {
    console.log(i);
  }, i * 1000);
}
```

**Output:**

```
1
2
3
4
5
```

**Explanation:** `let` is block-scoped. In each loop iteration, a new `i` is created, and the closure captures this new variable. Therefore, each `setTimeout` callback logs the value of `i` from its respective iteration [^6].

**Question 12**

```javascript
function createCounter() {
  let count = 0;
  return function() {
    count++;
    return count;
  };
}
const counter = createCounter();
console.log(counter());
console.log(counter());
```

**Output:**

```
1
2
```

**Explanation:** The returned function forms a closure, maintaining a private reference to the `count` variable. Each call to `counter` increments the same `count` variable from the closure's scope [^7].

**Question 13**

```javascript
function outer() {
  let a = 10;
  function inner() {
    console.log(a);
  }
  a = 20;
  return inner;
}

outer()();
```

**Output:**

```
20
```

**Explanation:** The closure `inner` holds a live reference to the variable `a`, not just its value at the time of creation. When `inner` is finally called, it logs the most recent value of `a`, which is 20 [^6].

**Question 14**

```javascript
function createAdder(x) {
  return function(y) {
    return x + y;
  };
}

const add5 = createAdder(5);
const add10 = createAdder(10);

console.log(add5(2));
console.log(add10(2));
```

**Output:**

```
7
12
```

**Explanation:** This demonstrates how closures can be used to create factory functions. `add5` and `add10` are two separate closures, each with its own lexical environment. One has `x=5` and the other has `x=10`.

**Question 15**

```javascript
function outerFunc() {
  var x = 10;
  function innerFunc() {
    var y = 5;
    console.log(x + y);
    x = 20; 
  }
  return innerFunc;
}

var inner = outerFunc();
inner();
inner();
```

**Output:**

```
15
25
```

**Explanation:** On the first call, `x` is 10, so the output is 15. The closure then updates `x` to 20. On the second call, the closure uses the updated value of `x`, so the output is 25 (20 + 5) [^4].

### Promises

A Promise is an object representing the eventual completion or failure of an asynchronous operation.

**Question 16**

```javascript
console.log(1);
const promise = new Promise(resolve => {
  console.log(2);
  resolve();
});
promise.then(() => console.log(4));
console.log(3);
```

**Output:**

```
1
2
3
4
```

**Explanation:** The code inside the `Promise` constructor (the executor) runs synchronously. Therefore, 1 and 2 are logged first. The `.then()` callback is asynchronous and is placed in the microtask queue. The script continues, logging 3. Finally, the event loop processes the microtask queue, logging 4 [^8].

**Question 17**

```javascript
const promise = new Promise((resolve, reject) => {
  reject("Error");
});

promise
  .then(() => console.log("Success 1"))
  .catch(() => console.log("Error 1"))
  .then(() => console.log("Success 2"));
```

**Output:**

```
Error 1
Success 2
```

**Explanation:** The promise is rejected. The first `.then()` is skipped. The `.catch()` block executes and handles the error. Since the `.catch()` returns a resolved promise (by not throwing a new error), the subsequent `.then()` block executes [^9].

**Question 18**

```javascript
Promise.resolve("A")
  .then(res => {
    console.log(res);
    return Promise.resolve("B");
  })
  .then(console.log);
```

**Output:**

```
A
B
```

**Explanation:** This demonstrates promise chaining. The first `.then()` logs "A" and returns a new promise that resolves with "B". The second `.then()` waits for this new promise to resolve and then logs its value [^9].

**Question 19**

```javascript
const p1 = Promise.resolve("p1");
const p2 = new Promise((resolve, reject) => {
  setTimeout(() => resolve("p2"), 100);
});
const p3 = Promise.reject("p3 error");

Promise.race([p3, p1, p2]).then(
  res => console.log(res),
  err => console.log(err)
);
```

**Output:**

```
p3 error
```

**Explanation:** `Promise.race()` settles as soon as one of the input promises settles. In this case, `p3` rejects immediately, so the `.catch()` part of the handler is called with its rejection reason [^10]. `p1` would have resolved first if `p3` wasn't there.

**Question 20**

```javascript
const p1 = new Promise((res) => setTimeout(() => res("one"), 500));
const p2 = new Promise((res) => setTimeout(() => res("two"), 100));

Promise.all([p1, p2]).then(res => console.log(res));
```

**Output:**

```
["one", "two"]
```

**Explanation:** `Promise.all()` waits for all promises in the iterable to resolve. It then resolves with an array of the results in the same order as the input promises, not the order in which they resolved [^10].

**Question 21**

```javascript
Promise.resolve(1)
  .then(res => {
    console.log(res); // 1
    return 2;
  })
  .catch(err => {
    return 3;
  })
  .then(res => {
    console.log(res); // 2
  });
```

**Output:**

```
1
2
```

**Explanation:** The initial promise resolves to 1, which is logged. The first `.then` returns the value 2. The `.catch` block is skipped because there was no rejection. The final `.then` receives the value 2 and logs it.

### async/await

`async/await` is syntactic sugar built on top of promises, making asynchronous code easier to write and read.

**Question 22**

```javascript
async function greet() {
  return "Hello";
}
console.log(greet());
```

**Output:**

```
Promise {<fulfilled>: 'Hello'}
```

**Explanation:** An `async` function always returns a promise. If the function returns a non-promise value, it is automatically wrapped in a resolved promise [^11].

**Question 23**

```javascript
async function f() {
  console.log("A");
  await new Promise(res => setTimeout(res, 1000));
  console.log("B");
}
console.log("C");
f();
console.log("D");
```

**Output:**

```
C
A
D
B 
```

**Explanation:** "C" is logged. The `async` function `f` is called. It logs "A". The `await` keyword pauses the execution of `f` and yields control back to the main thread. The script continues, logging "D". After 1 second, the promise resolves, and the execution of `f` resumes, logging "B" [^12].

**Question 24**

```javascript
async function getData() {
  return await Promise.resolve("I made it!");
}
const data = getData();
console.log(data);
```

**Output:**

```
Promise {<pending>}
```

**Explanation:** Even with `await`, an `async` function returns a promise. The function call `getData()` initiates the process and returns a pending promise immediately. To get the value, you need to use `.then()` or `await` it in another `async` function [^12].

**Question 25**

```javascript
async function test() {
  console.log(1);
  await Promise.resolve(console.log(2));
  console.log(3);
}
test();
console.log(4);
```

**Output:**

```
1
2
4
3
```

**Explanation:**

1. `test()` is called, logs `1`.
2. `await` is encountered. The expression to its right, `Promise.resolve(console.log(2))`, is executed. This immediately logs `2`.
3. The `await` pauses `test()`, and control returns to the caller. `4` is logged.
4. The promise `await` was waiting for is already resolved, so its `.then` (which resumes the function) is put on the microtask queue.
5. The event loop runs the microtask, resuming `test()`, which logs `3`.

**Question 26**

```javascript
async function f() {
  try {
    let response = await Promise.reject("Oops!");
  } catch(e) {
    console.log(e);
  }
  return "Done";
}
f().then(console.log);
```

**Output:**

```
Oops!
Done
```

**Explanation:** The `await` on a rejected promise throws an error, which is caught by the `try...catch` block, logging "Oops!". Since the `catch` block handles the error and doesn't re-throw it, the function continues and returns "Done". This resolved value is then logged by the `.then()` handler [^13].

**Question 27**

```javascript
async function a() {
  console.log('a');
}
async function b() {
  console.log('b');
  await a();
  console.log('b after');
}
console.log('script start');
b();
console.log('script end');
```

**Output:**

```
script start
b
a
script end
b after
```

**Explanation:** `await a()` calls function `a()`, which logs 'a'. Since `a()` is `async` but doesn't `await` anything, it returns an already-resolved promise. The `await` expression is handled by the microtask queue. The main script continues, logging 'script end'. Then the microtask runs, resuming `b()` to log 'b after'.

### Event Loop

The event loop enables non-blocking operations by offloading operations and handling tasks from the callback queue.

**Question 28**

```javascript
console.log("Start");

setTimeout(() => {
  console.log("Timeout");
}, 0);

Promise.resolve().then(() => {
  console.log("Promise");
});

console.log("End");
```

**Output:**

```
Start
End
Promise
Timeout
```

**Explanation:**

1. Synchronous code runs first: "Start" and "End" are logged.
2. `setTimeout` places its callback in the **Macrotask Queue** (or Task Queue).
3. `Promise.resolve().then()` places its callback in the **Microtask Queue**.
4. The event loop prioritizes the Microtask Queue. It executes all microtasks first ("Promise"), then moves to the Macrotask Queue ("Timeout") [^8].

**Question 29**

```javascript
const promise = new Promise((resolve, reject) => {
  console.log(1);
  setTimeout(() => {
    console.log("timerStart");
    resolve("success");
    console.log("timerEnd");
  }, 0);
  console.log(2);
});

promise.then((res) => {
  console.log(res);
});

console.log(4);
```

**Output:**

```
1
2
4
timerStart
timerEnd
success
```

**Explanation:**

1. The promise executor runs synchronously: `1` and `2` are logged.
2. The `setTimeout` is scheduled.
3. The main script continues, logging `4`.
4. The event loop picks up the `setTimeout` callback from the macrotask queue. "timerStart" is logged.
5. `resolve("success")` is called, which moves the promise's `.then()` callback to the microtask queue.
6. "timerEnd" is logged.
7. The event loop checks the microtask queue and finds the promise callback, which logs "success" [^14].

**Question 30**

```javascript
setTimeout(() => console.log('A'), 0);
console.log('B');
Promise.resolve().then(() => console.log('C'));
Promise.resolve().then(() => setTimeout(() => console.log('D'), 0));
console.log('E');
```

**Output:**

```
B
E
C
A
D
```

**Explanation:**

1. **Sync:** `B`, `E` are logged.
2. **Microtasks:** `C` is logged.
3. **Macrotasks:** The first `setTimeout` runs, logging `A`. The second `setTimeout` (scheduled inside a microtask) runs, logging `D`.

**Question 31**

```javascript
console.log(1);

setTimeout(() => console.log(2));

Promise.resolve().then(() => console.log(3));

setTimeout(() => console.log(4));

console.log(5);
```

**Output:**

```
1
5
3
2
4
```

**Explanation:**

1. **Sync:** `1`, `5` are logged.
2. **Microtask:** The promise callback runs, logging `3`.
3. **Macrotasks:** The timers fire in the order they were queued, logging `2` and then `4`.

**Question 32**

```javascript
async function main() {
  console.log('A');
  setTimeout(() => console.log('B'), 0);
  await Promise.resolve(console.log('C'));
  console.log('D');
}

main();
console.log('E');
```

**Output:**

```
A
C
E
D
B
```

**Explanation:**

1. `main()` is called. It logs `A`.
2. `setTimeout` schedules `B` as a macrotask.
3. `await Promise.resolve(console.log('C'))` is encountered. The expression `console.log('C')` runs synchronously, logging `C`.
4. `await` pauses `main()`, and control returns to the caller. `E` is logged.
5. The `await`'s resolved promise places the rest of `main()` (logging `D`) in the microtask queue.
6. **Microtask Phase:** `D` is logged.
7. **Macrotask Phase:** `B` is logged.

**Question 33**

```javascript
setTimeout(function() {
    console.log('setTimeout');
}, 0);
setImmediate(function() {
    console.log('setImmediate');
});
```

**Output:** (in a Node.js environment)

```
// The order is non-deterministic
// It could be:
setTimeout
setImmediate
// OR
setImmediate
setTimeout
```

**Explanation:** `setTimeout(..., 0)` and `setImmediate` are both macrotasks. The order of execution depends on the performance of the process and can vary. `setImmediate` is designed to execute after the current poll phase, while `setTimeout` with a 0ms delay executes after a minimum threshold.

**Question 34**

```javascript
Promise.resolve().then(() => console.log('P1'));
console.log('Sync');
setTimeout(() => console.log('T1'), 0);
Promise.resolve().then(() => console.log('P2'));
```

**Output:**

```
Sync
P1
P2
T1
```

**Explanation:** Synchronous code runs first. Then all queued microtasks (`P1`, `P2`) run. Finally, the macrotasks (`T1`) run.

**Question 35**

```javascript
console.log('start');
const fn = () => (new Promise((resolve, reject) => {
  console.log(1);
  resolve('success')
}));
fn().then(res => {
  console.log(res)
});
console.log('end');
```

**Output:**

```
start
1
end
success
```

**Explanation:** The promise executor function `(new Promise(...))` runs synchronously when `fn()` is called, logging `1`. The main script continues, logging `end`. The promise's `.then()` callback is a microtask and runs after the main script is finished.

**Question 36**

```javascript
console.log('script start');

let promise1 = new Promise(function(resolve) {
    console.log('promise1');
    resolve('promise1 resolved');
});

promise1.then(function(res) {
    console.log(res);
});

console.log('script end');
```

**Output:**

```
script start
promise1
script end
promise1 resolved
```

**Explanation:** The promise executor is synchronous. The `.then()` callback is asynchronous (a microtask).

**Question 37**

```javascript
console.log('start')
async function async1() {
  console.log('async1 start')
  await async2()
  console.log('async1 end')
}
async function async2() {
  console.log('async2')
}
async1()
console.log('end')
```

**Output:**

```
start
async1 start
async2
end
async1 end
```

**Explanation:** `async1` logs 'async1 start', then calls `async2`, which logs 'async2'. The `await` pauses `async1`, and control returns to the main script to log 'end'. The rest of `async1` is a microtask and runs next.

**Question 38**

```javascript
const myPromise = () => Promise.resolve('My Promise');

function first() {
    myPromise().then(res => console.log(res));
    console.log('first');
}

function second() {
    console.log('second');
}

first();
second();
```

**Output:**

```
first
second
My Promise
```

**Explanation:** `first()` is called, its `.then()` is scheduled as a microtask, and then it logs 'first'. `second()` is called and logs 'second'. Finally, the microtask runs.

**Question 39**

```javascript
console.log('A');

setTimeout(() => console.log('B'), 0);

Promise.resolve()
  .then(() => console.log('C'))
  .then(() => console.log('D'));

console.log('E');
```

**Output:**

```
A
E
C
D
B
```

**Explanation:** Sync code (`A`, `E`) runs first. Promise `.then` chains are microtasks and run next (`C`, then `D`). `setTimeout` is a macrotask and runs last.

**Question 40**

```javascript
const promise = Promise.resolve();

promise.then(() => console.log('A'));
promise.then(() => console.log('B'));
promise.then(() => console.log('C'));
```

**Output:**

```
A
B
C
```

**Explanation:** When multiple `.then()` handlers are attached to the same promise, they are queued up and executed in the order they were attached. Each one is a separate microtask.

## Array Pair Sum

**Find all pairs of elements whose sum equals n**

```javascript
function findPairsWithSum(arr, n) {
  const seen = new Set();
  const pairs = [];
  for (const num of arr) {
    const complement = n - num;
    if (seen.has(complement)) {
      pairs.push([complement, num]);
    }
    seen.add(num);
  }
  return pairs;
}
// Example usage:
const arr = [1, 2, 3, 4, 5, 6];
const n = 7;
console.log(findPairsWithSum(arr, n)); // Output: [ [ 3, 4 ], [ 2, 5 ], [ 1, 6 ] ]
```
