### IMP REMEBER this Prototypes

Of course. This is an excellent study guide to create. Knowing these prototype methods fluently will make you look sharp and solve coding challenges much faster.

Here is a comprehensive list of the most useful JavaScript prototype methods for coding interviews, broken down by type. For each method, you'll get:
*   **What it does:** A simple explanation.
*   **Why it's useful:** The interview context or problem it solves.
*   **A quick example.**

---

### Array Prototypes (The Most Important)

These are the most frequently used methods in coding challenges. Mastering them is non-negotiable.

#### Iteration & Transformation (Non-Mutating)

| Method | What It Does | Why It's Useful in Interviews | Quick Example |
| :--- | :--- | :--- | :--- |
| **`.map()`** | Creates a **new array** by applying a function to every element. | The most common way to transform data. For example, "take an array of user objects and return an array of just their names." | `const names = [{id:1, name:'A'}, {id:2, name:'B'}];`<br>`const userNames = names.map(u => u.name); // ['A', 'B']` |
| **`.filter()`** | Creates a **new array** with only the elements that pass a condition. | Perfect for "removing" items without changing the original array. For example, "find all products that are in stock." | `const nums = [1, 2, 3, 4];`<br>`const evens = nums.filter(n => n % 2 === 0); // [2, 4]` |
| **`.reduce()`** | Executes a function on each element to reduce the array to a **single output value**. | The most powerful iterator. Solves "calculate a total," "group items by category," or even "flatten an array." | `const nums = [1, 2, 3, 4];`<br>`const sum = nums.reduce((acc, curr) => acc + curr, 0); // 10` |

#### Searching & Finding

| Method | What It Does | Why It's Useful in Interviews | Quick Example |
| :--- | :--- | :--- | :--- |
| **`.find()`** | Returns the **first element** in the array that satisfies a condition. | When you need the actual object, not just its index. "Find the user with `id === 5`." | `const users = [{id:1, n:'A'}, {id:5, n:'B'}];`<br>`const user5 = users.find(u => u.id === 5); // {id:5, n:'B'}` |
| **`.findIndex()`** | Returns the **index** of the first element that satisfies a condition. | Useful when you need to know *where* an item is, perhaps to update or remove it later using `splice`. | `const users = [{id:1, n:'A'}, {id:5, n:'B'}];`<br>`const index = users.findIndex(u => u.id === 5); // 1` |
| **`.includes()`** | Returns `true` or `false` if an array contains a certain value. | A clean, readable way to check for existence. More modern than `indexOf`. | `const fruits = ['apple', 'banana'];`<br>`fruits.includes('banana'); // true` |

#### Slicing & Splicing

| Method | What It Does | Why It's Useful in Interviews | Quick Example |
| :--- | :--- | :--- | :--- |
| **`.slice()`** | (Non-Mutating) Returns a **shallow copy** of a portion of an array. | The safe way to create a sub-array. It **does not** change the original array. | `const letters = ['a','b','c','d'];`<br>`const middle = letters.slice(1, 3); // ['b', 'c']` |
| **`.splice()`** | (Mutating) **Changes the contents** of an array by removing, replacing, or adding elements. | The "dangerous" one. Use it when you explicitly need to *modify* the original array. "Remove two items starting at index 1." | `const letters = ['a','b','c','d'];`<br>`letters.splice(1, 2); // letters is now ['a', 'd']` |

#### Ordering & Joining

| Method | What It Does | Why It's Useful in Interviews | Quick Example |
| :--- | :--- | :--- | :--- |
| **`.sort()`** | (Mutating) **Sorts the elements** of an array in place. | **Critical Gotcha:** It sorts alphabetically by default! You must provide a compare function for numbers. | `const nums = [10, 2, 5];`<br>`nums.sort((a, b) => a - b); // nums is now [2, 5, 10]` |
| **`.join()`** | Joins all elements of an array into a **string**. | Useful for creating formatted strings, like a comma-separated list. | `const words = ['Hello', 'World'];`<br>`words.join(' '); // "Hello World"` |

---

### String Prototypes

Essential for parsing data, validating input, and manipulation.

| Method | What It Does | Why It's Useful in Interviews | Quick Example |
| :--- | :--- | :--- | :--- |
| **`.split()`** | Splits a string into an **array of substrings**. | The inverse of `join()`. Fundamental for breaking up sentences, URLs, or CSV data. | `const sentence = "Hello World";`<br>`sentence.split(' '); // ['Hello', 'World']` |
| **`.slice()`** | Extracts a section of a string and returns it as a **new string**. | The primary way to get a substring. It can take negative indices to count from the end. | `const str = "JavaScript";`<br>`str.slice(0, 4); // "Java"` |
| **`.toLowerCase()`** | Converts a string to lowercase. | Crucial for making comparisons case-insensitive. | `"Hello".toLowerCase(); // "hello"` |
| **`.toUpperCase()`** | Converts a string to uppercase. | Crucial for making comparisons case-insensitive. | `"Hello".toUpperCase(); // "HELLO"` |
| **`.trim()`** | Removes whitespace from both ends of a string. | Essential for cleaning up user input before processing. | `"  some text  ".trim(); // "some text"` |
| **`.replace()`** / **`.replaceAll()`** | Returns a new string with some or all matches of a pattern replaced. | **Gotcha:** `.replace()` only replaces the *first* match. Use `.replaceAll()` or a regex with the `/g` flag for all. | `const msg = "hi hi";`<br>`msg.replaceAll('hi', 'bye'); // "bye bye"` |

---

### Object Static Methods (The most useful ones)

Note: These are methods on the `Object` constructor itself, not on `Object.prototype`. You call them like `Object.keys(myObj)`.

| Method | What It Does | Why It's Useful in Interviews | Quick Example |
| :--- | :--- | :--- | :--- |
| **`Object.keys()`** | Returns an **array** of an object's own property **names**. | The standard way to get a list of keys to iterate over. | `const obj = {a:1, b:2};`<br>`Object.keys(obj); // ['a', 'b']` |
| **`Object.values()`** | Returns an **array** of an object's own property **values**. | Useful when you only care about the values, not the keys. | `const obj = {a:1, b:2};`<br>`Object.values(obj); // [1, 2]` |
| **`Object.entries()`** | Returns an **array** of an object's own `[key, value]` pairs. | Incredibly powerful. Lets you use array methods like `.map()` or `.filter()` on an object. | `const obj = {a:1, b:2};`<br>`Object.entries(obj); // [['a', 1], ['b', 2]]` |
| **`Object.hasOwnProperty()`** | Returns `true` or `false` if a property is the object's **own property** (not inherited). | The safe way to check for properties inside a `for...in` loop to avoid iterating over the prototype chain. | `const obj = {a:1};`<br>`obj.hasOwnProperty('a'); // true`<br>`obj.hasOwnProperty('toString'); // false` |

---

### Other Useful Prototypes & Objects

| Method / Object | What It Does | Why It's Useful in Interviews | Quick Example |
| :--- | :--- | :--- | :--- |
| **`Function.prototype.bind()`** | Creates a **new function** that, when called, has its `this` keyword set to a provided value. | Solves the "lost `this`" problem, especially in event handlers or callbacks. | `const user = {name:'A'};`<br>`const getName = function(){return this.name;};`<br>`const boundGetName = getName.bind(user);`<br>`boundGetName(); // 'A'` |
| **`Set` Object** | A collection of **unique values**. | The absolute fastest way to remove duplicates from an array or check for the existence of an item in a list of unique items. | `const arr = [1, 2, 2, 3];`<br>`const unique = [...new Set(arr)]; // [1, 2, 3]` |
| **`Map` Object** | A collection of **keyed data items**, just like an `Object`. But keys can be **any type**. | A superior hash map. The go-to solution for many algorithm problems (like "Two Sum") where you need to store and quickly retrieve information. | `const map = new Map();`<br>`map.set('a', 1);`<br>`map.get('a'); // 1`<br>`map.has('a'); // true` |

### Pro Tip for Your Interview:

When you use one of these methods, try to also mention if it's **mutating** (changes the original) or **non-mutating** (returns a new value). This shows a deeper level of understanding, which is critical for a React developer who needs to handle state immutably.

*   **Mutating:** `splice`, `sort`, `reverse`, `push`, `pop`
*   **Non-Mutating:** `map`, `filter`, `reduce`, `slice`, `concat`, `Object.keys`






Of course. For a deep dive into JavaScript, your second-round interview will likely move beyond basic syntax and into the core concepts, nuances, and practical applications of the language. Below is a comprehensive list of questions covering a wide range of JavaScript topics to help you prepare.



### Core JavaScript Concepts

These questions test your fundamental understanding of how JavaScript works.

*   **Explain the concept of "hoisting" in JavaScript.** How does it work with variables declared with `var`, `let`, and `const`? How does it affect function declarations and function expressions?
*   **What is a closure?** Can you provide a practical example of when you would use one? What are the performance implications of using closures?
*   **Describe the difference between `==` and `===` operators.** Provide examples of when `==` might be useful, and why `===` is generally preferred.
*   **What is the `this` keyword and how is its value determined?** Explain the differences in how `this` is handled in arrow functions versus regular functions. How can you explicitly set the value of `this`?
*   **Explain the concept of prototypal inheritance in JavaScript.** How do you create an object that inherits from another object? What is the difference between `__proto__` and `prototype`?
*   **What are the different data types in JavaScript?** How can you check the type of a variable? Explain the difference between `null` and `undefined`.
*   **Describe event delegation and its benefits.** Can you provide an example of how to implement it?
*   **What is the difference between `Function.prototype.apply()`, `Function.prototype.call()`, and `Function.prototype.bind()`?** Provide use cases for each.
*   **Explain the concept of scope in JavaScript.** What is the difference between global scope, function scope, and block scope?
*   **What are Immediately Invoked Function Expressions (IIFE) and why were they commonly used?** Are they still as relevant in modern JavaScript with ES6 modules?

### Asynchronous JavaScript

A crucial area for any modern web developer.

*   **What is the event loop?** Describe how it works and how it handles asynchronous operations. What are the roles of the call stack, message queue, and job queue?
*   **Explain the difference between callbacks, Promises, and `async/await`.** What are the advantages of using Promises over callbacks? How does `async/await` improve upon Promises?
*   **What is "callback hell" and how can you avoid it?**
*   **How do you handle errors in asynchronous JavaScript?** Show examples using callbacks, `.catch()` with Promises, and `try...catch` with `async/await`.
*   **What is the difference between the microtask queue and the macrotask (or task) queue?** Which one has higher priority? Where do Promises and `setTimeout` callbacks go?
*   **Can you implement your own version of `Promise.all()`?**
*   **What is `Promise.race()` and when would you use it?**

### ES6+ and Modern Features

These questions focus on modern additions to the JavaScript language.

*   **What are the main new features introduced in ES6?** Pick a few and explain them in detail.
*   **Explain the differences between `var`, `let`, and `const`.** Discuss their scope, hoisting behavior, and whether they can be reassigned or redeclared.
*   **What are arrow functions?** How do they differ from traditional function expressions? What are their main benefits?
*   **Explain destructuring assignment for arrays and objects.** Provide practical examples.
*   **What are template literals and what advantages do they offer over string concatenation?**
*   **Explain the concept of JavaScript Modules (import/export).** What is the difference between a default export and a named export?
*   **What are Sets and Maps?** How do they differ from arrays and objects, and what are their use cases?
*   **Describe the `for...of` loop.** How is it different from `for...in` and `forEach`?
*   **What are generators in JavaScript?** What is the purpose of the `yield` keyword?
*   **Explain the spread and rest operators (`...`).** Provide examples of how to use them with arrays and objects.

### Data Structures & Algorithms

These questions assess your problem-solving abilities using JavaScript.

*   **How would you reverse a string in JavaScript?**
*   **How do you check if an object is an array?**
*   **What is the best way to create a deep copy of an object in JavaScript?**
*   **How would you find the intersection of two arrays?**
*   **Implement a debounce function in JavaScript from scratch.** Explain its use case.
*   **Implement a throttle function in JavaScript from scratch.** How does it differ from debounce?
*   **Write a function that flattens a nested array.**
*   **Given an array of numbers, find the two that add up to a specific target.**

### Browser, DOM, and Web APIs

Questions related to JavaScript's interaction with the browser environment.

*   **What is the DOM (Document Object Model)?**
*   **What is the difference between `window` and `document`?**
*   **Explain the different types of web storage (localStorage, sessionStorage, cookies).** What are their limitations and use cases?
*   **What is the Same-Origin Policy and how does it relate to CORS (Cross-Origin Resource Sharing)?**
*   **Describe the browser's rendering process.** What is the Critical Rendering Path?

### Performance and Memory

For more senior roles, you might be asked about optimization.

*   **What are some common causes of memory leaks in JavaScript and how would you prevent them?**
*   **What techniques can you use to optimize the performance of a web application?**
*   **What is tree shaking in the context of JavaScript bundling?**
*   **Explain the concept of memoization and provide an example.**

By preparing for these questions, you will be well-equipped to demonstrate a deep understanding of JavaScript in your interview. Good luck

















Of course. Here are the solutions and detailed explanations for the comprehensive list of JavaScript interview questions.

### JavaScript interview questions and Answers start

#### 1. Hoisting

**Hoisting** is JavaScript's default behavior of moving declarations to the top of their containing scope before code execution.

*   **`var`**: Variables declared with `var` are hoisted to the top of their function (or global) scope and are initialized with `undefined`. This means you can access them before the line they are declared, and their value will be `undefined`.
*   **`let` and `const`**: These declarations are also hoisted, but they are not initialized. They are in a "temporal dead zone" from the start of the block until the declaration is encountered. Accessing them before their declaration will result in a `ReferenceError`.
*   **Function Declarations**: These are fully hoisted, meaning both the function's name and its body are moved to the top. You can call a function declaration before it appears in the code.
*   **Function Expressions**: Only the variable declaration part of a function expression is hoisted. If it's declared with `var`, the variable will be `undefined` until the expression is reached. If declared with `let` or `const`, it will be in the temporal dead zone.

**Example:**
```javascript
console.log(myVar); // Output: undefined
var myVar = 5;

// console.log(myLet); // Throws ReferenceError
let myLet = 10;

myFunction(); // Output: "Hello!"
function myFunction() {
  console.log("Hello!");
}
```

---

#### 2. Closures

A **closure** is the combination of a function and the lexical environment within which that function was declared. In simpler terms, a closure gives you access to an outer function's scope from an inner function, even after the outer function has finished executing.

**Practical Example:** Closures are often used for data privacy, creating private variables and methods.

```javascript
function createCounter() {
  let count = 0; // Private variable

  return {
    increment: function() {
      count++;
      return count;
    },
    getValue: function() {
      return count;
    }
  };
}

const counter = createCounter();
console.log(counter.increment()); // Output: 1
console.log(counter.increment()); // Output: 2
console.log(counter.getValue());   // Output: 2
// console.log(count); // Throws ReferenceError: count is not defined 
```
In this example, the inner functions `increment` and `getValue` have access to the `count` variable from the `createCounter` scope, even after `createCounter` has returned.

**Performance Implications:** Since closures hold references to their outer scopes, the variables within those scopes are not garbage collected. This can lead to increased memory consumption if many closures are created, so they should be used judiciously.

---

#### 3. `==` vs `===`

*   **`===` (Strict Equality):** This operator checks for equality without performing any type conversion. It returns `true` only if both the value and the data type of the operands are the same. It is generally the preferred method for comparison.
*   **`==` (Loose or Abstract Equality):** This operator compares two values for equality after converting both values to a common type (type coercion).

**Examples:**
```javascript
console.log(5 === "5");   // Output: false
console.log(5 == "5");    // Output: true (string "5" is coerced to number 5)

console.log(null == undefined); // Output: true
console.log(null === undefined); // Output: false

console.log(0 == false);    // Output: true
console.log(0 === false);   // Output: false
```

---

#### 4. The `this` Keyword

The `this` keyword refers to the object from which the function is called. Its value is determined by the **execution context**.

*   **Global Context:** In the global scope (outside of any function), `this` refers to the global object (`window` in a browser).
*   **Function Context:** Inside a regular function, the value of `this` depends on how the function is called. If called as a method of an object (`myObject.myMethod()`), `this` is the object itself. If called as a standalone function (`myFunction()`), `this` will be the global object in non-strict mode, and `undefined` in strict mode.
*   **Arrow Functions:** Arrow functions do not have their own `this` binding. Instead, they inherit `this` from the parent scope at the time they are defined (lexical `this`).
*   **Explicitly Setting `this`:**
    *   **`call(thisArg, arg1, arg2, ...)`:** Invokes the function with a specified `this` value and arguments provided individually.
    *   **`apply(thisArg, [argsArray])`:** Similar to `call`, but arguments are provided as an array.
    *   **`bind(thisArg)`:** Returns a *new function* where `this` is permanently bound to the provided value.

---

#### 5. Prototypal Inheritance

Prototypal inheritance is a fundamental concept in JavaScript where objects can inherit properties and methods from other objects. Every JavaScript object has a private property which holds a link to another object called its **prototype**. That prototype object has a prototype of its own, and so on, until an object is reached with `null` as its prototype. This is known as the **prototype chain**.

*   **`prototype` vs. `__proto__`**:
    *   `prototype` is a property on a constructor function that defines the prototype for all objects created by that constructor.
    *   `__proto__` (now accessible via `Object.getPrototypeOf()`) is an internal property of an object, pointing to its prototype in the chain.

**Example:**
```javascript
// Constructor function
function Animal(name) {
  this.name = name;
}

// Add a method to the Animal prototype
Animal.prototype.speak = function() {
  console.log(`${this.name} makes a noise.`);
}

// Create an instance
const animal = new Animal('Generic Animal');
animal.speak(); // Output: Generic Animal makes a noise.

// Using Object.create for inheritance
const dog = Object.create(animal);
dog.name = 'Rex';
dog.speak(); // Output: Rex makes a noise.
```

---

#### 6. Data Types

JavaScript has eight data types:
*   **Primitive Types:**
    1.  **String:** A sequence of characters.
    2.  **Number:** Numeric values (both integer and floating-point).
    3.  **BigInt:** For arbitrarily large integers.
    4.  **Boolean:** `true` or `false`.
    5.  **`undefined`:** A variable that has been declared but not assigned a value.
    6.  **`null`:** Represents the intentional absence of any object value.
    7.  **Symbol:** A unique and immutable primitive value.
*   **Non-Primitive Type:**
    8.  **Object:** A collection of key-value pairs.

You can check the type of a variable using the `typeof` operator. Note that `typeof null` returns `"object"`, which is a well-known historical bug.

*   **`null` vs. `undefined`**: `undefined` typically means a value has not been assigned, while `null` is an assignment value used to represent "no value".

---

#### 7. Event Delegation

Event delegation is a technique where you add a single event listener to a parent element to manage events for all of its children (and any future children). When an event is triggered on a child element, it "bubbles up" through the DOM to its ancestors. The parent's listener can then catch the event and use `event.target` to determine which child element was actually clicked.

**Benefits:**
*   **Improved Performance:** Fewer event listeners to manage, reducing memory usage.
*   **Dynamic Elements:** Automatically handles events for elements added to the DOM after the initial page load without needing to attach new listeners.

**Example:**
```html
<ul id="myList">
  <li>Item 1</li>
  <li>Item 2</li>
</ul>
```````javascript
document.getElementById('myList').addEventListener('click', function(e) {
  // Check if the clicked element is an <li>
  if (e.target && e.target.nodeName === 'LI') {
    console.log('Clicked item:', e.target.textContent);
  }
});
```

---

#### 8. `apply()`, `call()`, `bind()`

These are methods on the `Function.prototype` used to control a function's `this` context.

*   **`call()`**: Executes the function immediately, with a given `this` value and a list of arguments passed individually.
    *   *Use Case:* Calling a function that requires a specific `this` context, like borrowing methods from another object.
*   **`apply()`**: Executes the function immediately, with a given `this` value and arguments provided as an array.
    *   *Use Case:* Similar to `call`, but useful when the number of arguments is unknown and can be passed as an array.
*   **`bind()`**: Returns a *new function* with the `this` value permanently bound to the provided context. It does not execute the function immediately.
    *   *Use Case:* In event listeners or callbacks where the function will be called later, ensuring `this` refers to the correct object.

---

#### 9. Scope

Scope determines the accessibility of variables and functions at various parts of one's code.

*   **Global Scope:** Variables declared outside any function are in the global scope and are accessible from anywhere in the code.
*   **Function Scope:** Variables declared with `var` inside a function are accessible only within that function.
*   **Block Scope:** Variables declared with `let` and `const` inside a block (e.g., within `{...}`, `if`, `for`) are accessible only within that block.

---

#### 10. IIFE (Immediately Invoked Function Expression)

An IIFE is a JavaScript function that is executed as soon as it is defined.

**Syntax:**
```javascript
(function() {
  // ... code ...
})();
```
The primary reason for using an IIFE was to create a private scope to avoid polluting the global namespace and to create closures for data privacy. While still useful, the introduction of ES6 modules and block-scoped variables (`let`, `const`) has reduced their necessity, as modules have their own scope by default.

### Asynchronous JavaScript

#### 11. The Event Loop

The JavaScript event loop is the mechanism that allows a single-threaded language like JavaScript to perform non-blocking asynchronous operations.

It works with these key components:
*   **Call Stack:** Where function calls are pushed and executed. It's a LIFO (Last-In, First-Out) stack.
*   **Web APIs / C++ APIs:** Asynchronous operations like `setTimeout`, DOM events, or `fetch` requests are handed off to the browser's Web APIs to be processed outside the main JavaScript thread.
*   **Callback Queue (or Macrotask Queue):** When a Web API finishes its task (e.g., a timer expires), the associated callback function is placed in the Callback Queue.
*   **Job Queue (or Microtask Queue):** Callbacks from Promises (`.then()`, `.catch()`, `.finally()`) and other microtasks are placed here. The Job Queue has a higher priority than the Callback Queue.

**The Process:** The event loop continuously checks if the call stack is empty. If it is, it will first process all tasks in the Microtask Queue, one by one. Once the Microtask Queue is empty, it will take the first task from the Macrotask Queue and push it onto the call stack for execution.

---

#### 12. Callbacks, Promises, and `async/await`

These are three ways to handle asynchronous operations.

*   **Callbacks:** A function passed as an argument to another function, which is then executed after an async operation completes.
    *   **Problem:** Can lead to "Callback Hell" (nested callbacks) which is hard to read and maintain.
*   **Promises:** An object representing the eventual completion (or failure) of an asynchronous operation. A promise can be in one of three states: pending, fulfilled, or rejected.
    *   **Advantages:** Avoids callback hell through method chaining (`.then()`, `.catch()`), leading to more readable and manageable code.
*   **`async/await`:** Syntactic sugar built on top of Promises. It allows you to write asynchronous code that looks and behaves more like synchronous code, making it even easier to read and reason about.
    *   `async` functions implicitly return a Promise.
    *   The `await` keyword pauses the execution of the `async` function until the awaited Promise is resolved or rejected.

---

#### 13. Callback Hell

"Callback Hell" (also known as the Pyramid of Doom) refers to the situation where multiple nested callbacks make the code difficult to read and debug.

**How to avoid it:**
1.  **Use Promises:** Chain `.then()` calls to create a flatter code structure.
2.  **Use `async/await`:** This is often the cleanest solution, making async code look synchronous.
3.  **Name your functions:** Instead of anonymous functions, use named functions to improve readability and stack traces.
4.  **Modularize:** Break down your code into smaller, reusable functions.

---

#### 14. Asynchronous Error Handling

*   **Callbacks:** Typically use an "error-first" convention, where the first argument to the callback is reserved for an error object (`(err, data) => { ... }`).
*   **Promises:** Use the `.catch()` method at the end of a promise chain to handle any rejection that occurs in the chain.
*   **`async/await`:** Use a standard `try...catch` block, which is a very intuitive and familiar way to handle errors.

**Example:**
```javascript
// Promise .catch()
myPromiseFunction()
  .then(result => { /* ... */ })
  .catch(error => console.error(error));

// async/await try...catch
async function fetchData() {
  try {
    const data = await myPromiseFunction();
    // ... use data
  } catch (error) {
    console.error(error);
  }
}
```

---

#### 15. Microtask vs. Macrotask Queue

*   **Macrotask Queue (or Task Queue):** Includes tasks like `setTimeout`, `setInterval`, I/O, and UI rendering.
*   **Microtask Queue (or Job Queue):** Includes tasks like Promise callbacks (`.then`, `.catch`), `queueMicrotask()`, and `MutationObserver`.

**Priority:** The event loop gives priority to the Microtask Queue. After each task from the macrotask queue is completed, the event loop will execute *all* tasks in the microtask queue before moving on to the next macrotask. This means a long series of microtasks could starve the macrotask queue, potentially delaying rendering or other I/O operations.

---

#### 16. Implement `Promise.all()`

`Promise.all(iterable)` takes an iterable of promises and returns a single Promise that resolves when all of the promises in the iterable have resolved, or rejects with the reason of the first promise that rejects.

```javascript
function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    const results = [];
    let completed = 0;
    if (promises.length === 0) {
      resolve(results);
      return;
    }

    promises.forEach((promise, index) => {
      Promise.resolve(promise) // Handle non-promise values
        .then(value => {
          results[index] = value;
          completed++;
          if (completed === promises.length) {
            resolve(results);
          }
        })
        .catch(reject); // Reject immediately if any promise rejects
    });
  });
}
```

---

#### 17. `Promise.race()`

`Promise.race(iterable)` returns a promise that fulfills or rejects as soon as one of the promises in the iterable fulfills or rejects, with the value or reason from that promise.

**Use Case:** It's useful when you want to get a result from the fastest of several asynchronous operations, or for implementing a timeout on a promise. For example, you can race a `fetch` request against a `setTimeout` promise. If the timeout finishes first, you can assume the network request is too slow and act accordingly.

```javascript
const p1 = new Promise((resolve) => setTimeout(resolve, 500, 'one'));
const p2 = new Promise((resolve) => setTimeout(resolve, 100, 'two'));

Promise.race([p1, p2]).then((value) => {
  console.log(value); // "two" - p2 was faster
});
```

### ES6+ and Modern Features

#### 18. Main ES6 Features

Some of the most significant features introduced in ES6 (ECMAScript 2015) include:
*   `let` and `const` for block-scoped variables.
*   Arrow Functions (`=>`).
*   Promises for asynchronous programming.
*   Template Literals for easier string interpolation.
*   Destructuring Assignment for arrays and objects.
*   Default, Rest, and Spread parameters for functions.
*   Classes for a cleaner object-oriented syntax.
*   Modules (`import`/`export`) for organizing code.
*   New data structures like `Map` and `Set`.

---

#### 19. `var` vs. `let` vs. `const`

*   **Scope:**
    *   `var`: Function-scoped.
    *   `let` & `const`: Block-scoped (`{}`).
*   **Hoisting:**
    *   `var`: Hoisted and initialized with `undefined`.
    *   `let` & `const`: Hoisted but not initialized (Temporal Dead Zone).
*   **Reassignment/Redeclaration:**
    *   `var`: Can be redeclared and reassigned.
    *   `let`: Can be reassigned but not redeclared in the same scope.
    *   `const`: Cannot be reassigned or redeclared. Note that for objects and arrays declared with `const`, their properties or elements can still be modified.

---

#### 20. Arrow Functions

Arrow functions provide a concise syntax for writing function expressions.

**Differences from traditional functions:**
*   **Syntax:** More compact (`(a, b) => a + b`).
*   **`this` binding:** They do not have their own `this`. They lexically bind `this` from their enclosing scope. This makes them ideal for callbacks and event handlers where you want to preserve the `this` context.
*   **`arguments` object:** They do not have their own `arguments` object. You can use rest parameters (`...args`) instead.
*   **Constructor:** They cannot be used as constructors (i.e., with the `new` keyword).

---

#### 21. Destructuring Assignment

Destructuring is a syntax that makes it possible to unpack values from arrays, or properties from objects, into distinct variables.

**Array Destructuring:**
```javascript
const [first, second] = [1, 2, 3];
// first = 1, second = 2
```

**Object Destructuring:**
```javascript
const person = { name: 'Alice', age: 30 };
const { name, age } = person;
// name = 'Alice', age = 30
```

---

#### 22. Template Literals

Template literals are strings enclosed by backticks (`` ` ``) instead of single or double quotes.

**Advantages:**
*   **String Interpolation:** You can embed expressions directly within the string using `${expression}`. [26]
*   **Multiline Strings:** They allow for strings that span multiple lines without needing concatenation or `\n`. [26]

**Example:**
```javascript
const name = "World";
const greeting = `Hello, ${name}!
This is a multiline string.`; 
```

---

#### 23. JavaScript Modules (`import`/`export`)

ES6 modules provide a standardized way to organize and share code between different JavaScript files. Each module is a file.

*   **`export`**: Used to export functions, objects, or primitive values from a module so they can be used by other programs. [27]
    *   **Named Export:** Exports multiple values. Must be imported using the exact same name.
      ```javascript
      // utils.js
      export const pi = 3.14;
      export function greet() { /* ... */ }
      ```
    *   **Default Export:** Exports a single value. Can be imported with any name. A module can only have one default export. [27]
      ```javascript
      // my-component.js
      export default function MyComponent() { /* ... */ }
      ```
*   **`import`**: Used to import live bindings from an exported module. [28]
    ```javascript
    import { pi, greet } from './utils.js'; // Named import
    import Component from './my-component.js'; // Default import
    ```

---

#### 24. `Set` and `Map`

*   **`Set`**: A collection of unique values. [29] You can't have duplicate values in a Set.
    *   **Use Cases:** Removing duplicate elements from an array, storing a list of unique items.
    *   **vs. Array:** Faster for checking if an item exists (`.has()`).
*   **`Map`**: A collection of keyed data items, just like an `Object`. But the main difference is that `Map` allows keys of any type (including objects and functions), whereas `Object` keys must be either a `String` or a `Symbol`. [30]
    *   **Use Cases:** When you need keys that aren't strings, or when you need a collection that maintains the insertion order of its elements.

---

#### 25. `for...of` Loop

The `for...of` statement creates a loop that iterates over iterable objects (including `Array`, `Map`, `Set`, `String`, etc.).

*   **`for...of` vs. `for...in`**:
    *   `for...of` iterates over the **values** of an iterable.
    *   `for...in` iterates over the **keys (or properties)** of an object. [31] It's generally not recommended for arrays because it can iterate over properties from the prototype chain.
*   **`for...of` vs. `forEach`**:
    *   `forEach` is a method on the `Array` prototype.
    *   `for...of` can be used with any iterable, not just arrays.
    *   You can use `break` and `continue` within a `for...of` loop, but not within `forEach`.

---

#### 26. Generators

A generator function is a special type of function that can be paused and resumed, allowing it to produce a sequence of values over time. It is defined using `function*` and uses the `yield` keyword to pause and return a value. [32]

When a generator function is called, it returns a generator object. Calling the `.next()` method on this object resumes execution until the next `yield` expression is encountered.

**Example:**
```javascript
function* idGenerator() {
  let id = 1;
  while (true) {
    yield id++;
  }
}

const gen = idGenerator();
console.log(gen.next().value); // 1
console.log(gen.next().value); // 2
```

---

#### 27. Spread (`...`) and Rest (`...`) Operators

The `...` syntax is used for both spread and rest, but they are used in different contexts.

*   **Spread Operator:** "Expands" an iterable (like an array or string) into individual elements. It's used in places where multiple elements are expected, such as in function calls or array literals.
    ```javascript
    const arr1 = [1, 2];
    const arr2 = [...arr1, 3, 4]; // [1, 2, 3, 4]

    const name = "hi";
    const chars = [...name]; // ['h', 'i']
    ```
*   **Rest Parameters:** "Collects" multiple elements and condenses them into a single element (an array). It's used in function parameter lists to capture all remaining arguments.
    ```javascript
    function sum(...numbers) { // numbers is an array
      return numbers.reduce((acc, current) => acc + current, 0);
    }
    sum(1, 2, 3); // 6
    ```

### Data Structures & Algorithms

#### 28. Reverse a String

```javascript
function reverseString(str) {
  // Easiest method
  return str.split('').reverse().join('');
}
```

---

#### 29. Check if Object is an Array

The most reliable way is `Array.isArray()`.
```javascript
const myArray = [1, 2];
const myObject = { a: 1 };

console.log(Array.isArray(myArray));   // true
console.log(Array.isArray(myObject));  // false
```
Using `instanceof Array` can fail across different frames or realms.

---

#### 30. Deep Copy an Object

A "deep copy" creates a new object and recursively copies all properties of the original object, including nested objects and arrays.

*   **Simple Method (with limitations):** `JSON.parse(JSON.stringify(obj))`. This is easy but has drawbacks: it loses `Date` objects (converts them to strings), functions, `undefined`, and `Symbol` properties.
*   **Robust Method:** A recursive function or using a library like Lodash (`_.cloneDeep()`).

```javascript
// A simple recursive implementation
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  const clone = Array.isArray(obj) ? [] : {};

  for (let key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = deepClone(obj[key]);
    }
  }
  return clone;
}
```

---

#### 31. Intersection of Two Arrays

```javascript
function intersection(arr1, arr2) {
  const set1 = new Set(arr1);
  return arr2.filter(value => set1.has(value));
}
```

---

#### 32. Debounce Function

Debouncing is a technique to limit the rate at which a function gets called. A debounced function will only be executed after a certain amount of time has passed without it being called again. It's useful for handling events like search input or window resizing. [33]

```javascript
function debounce(func, delay) {
  let timeoutId;

  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}
```

---

#### 33. Throttle Function

Throttling ensures that a function is executed at most once every specified period. Unlike debounce, it doesn't wait for a pause; it just caps the execution frequency. It's useful for events like scrolling or mouse movement. [33]

```javascript
function throttle(func, limit) {
  let inThrottle = false;
  
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
```

---

#### 34. Flatten a Nested Array

```javascript
// Modern ES2019+ method
const nested = [1, [2, 3], [4, [5]]];
const flat = nested.flat(Infinity); // [1, 2, 3, 4, 5]

// Recursive implementation
function flatten(arr) {
  let result = [];
  arr.forEach(item => {
    if (Array.isArray(item)) {
      result = result.concat(flatten(item));
    } else {
      result.push(item);
    }
  });
  return result;
}
```

---

#### 35. Two Sum Problem

Given an array of numbers and a target, find the two numbers that add up to the target.

```javascript
function twoSum(nums, target) {
  const map = new Map(); // Store numbers and their indices

  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) {
      return [map.get(complement), i];
    }
    map.set(nums[i], i);
  }
}
```

### Browser, DOM, and Web APIs

#### 36. DOM (Document Object Model)

The DOM is a programming interface for web documents. It represents the page so that programs can change the document structure, style, and content. The DOM represents the document as a tree of nodes, where each node represents a part of the document (e.g., an element, an attribute, or a text node). [34]

---

#### 37. `window` vs. `document`

*   **`window`**: The `window` object represents the browser's window that contains the DOM document. It is the global object in client-side JavaScript. It holds properties like `navigator`, `location`, `screen`, and methods like `setTimeout` and `alert`.
*   **`document`**: The `document` object is a property of the `window` object (`window.document`). It is the entry point to the page's content (the DOM tree). You use it to manipulate the elements on the page.

---

#### 38. Web Storage

*   **`localStorage`**: Stores data with no expiration date. The data will persist even when the browser is closed and reopened. [35]
*   **`sessionStorage`**: Stores data for one session only. The data is cleared when the page session ends (i.e., when the browser tab is closed). [35]
*   **Cookies**: Store small pieces of data sent from a website and stored on the user's computer. They are sent back to the server with every request. [36] They are mainly used for session management, personalization, and tracking. They have a size limit and can have an expiration date.

---

#### 39. Same-Origin Policy & CORS

*   **Same-Origin Policy (SOP)**: A critical security mechanism that restricts how a document or script loaded from one "origin" can interact with a resource from another "origin". An origin is defined by the combination of protocol, hostname, and port. [37] SOP prevents a malicious script on one page from obtaining sensitive data from another web page.
*   **Cross-Origin Resource Sharing (CORS)**: A mechanism that uses additional HTTP headers to tell browsers to give a web application running at one origin access to selected resources from a different origin. [38] It is a way to relax the SOP in a controlled manner.

---

#### 40. Browser Rendering Process (Critical Rendering Path)

The Critical Rendering Path refers to the sequence of steps the browser goes through to convert HTML, CSS, and JavaScript into pixels on the screen. [39]

1.  **DOM Construction**: The browser parses the HTML to create the Document Object Model (DOM).
2.  **CSSOM Construction**: The browser parses the CSS to create the CSS Object Model (CSSOM).
3.  **Render Tree Formation**: The DOM and CSSOM are combined to form the Render Tree, which contains only the nodes required to render the page.
4.  **Layout (or Reflow)**: The browser calculates the size and position of each node in the render tree.
5.  **Paint (or Rasterization)**: The browser paints the pixels for each node onto the screen.
6.  **Compositing**: The browser combines the painted layers into a final image to be displayed.

### Performance and Memory

#### 41. JavaScript Memory Leaks

A memory leak occurs when a piece of memory that is no longer needed is not released, leading to a gradual decrease in available memory. Common causes include: [40]

*   **Accidental Global Variables:** If a variable is not declared with `var`, `let`, or `const`, it can become a property of the global object, which is never garbage collected.
*   **Forgotten Timers or Callbacks:** `setInterval` or event listeners that are not cleared or removed when they are no longer needed can keep references to objects, preventing them from being collected.
*   **Closures:** Closures that hold references to large objects can prevent those objects from being garbage collected.
*   **Detached DOM Elements:** If you remove an element from the DOM but still hold a reference to it in your JavaScript, the memory for that element cannot be freed.

---

#### 42. Web Performance Optimization Techniques

*   **Minimize HTTP Requests:** Combine files (CSS, JS), use CSS Sprites, or inline small assets.
*   **Minify and Compress:** Minify HTML, CSS, and JavaScript. Use compression like Gzip on the server.
*   **Use a CDN (Content Delivery Network):** Serve static assets from a CDN to reduce latency.
*   **Optimize the Critical Rendering Path:** Load CSS before JavaScript, and place scripts at the end of the `<body>` tag or use `async`/`defer`.
*   **Optimize Images:** Use appropriate image formats, compress images, and use lazy loading for off-screen images.
*   **Use Caching:** Leverage browser caching and server-side caching.
*   **Code Optimization:** Use efficient algorithms, debounce/throttle event handlers, and avoid memory leaks.

---

#### 43. Tree Shaking

Tree shaking is a term commonly used in the context of JavaScript bundlers like Webpack or Rollup. It refers to the process of eliminating dead code (unreachable code that is not used). [41] For example, if you import a library but only use one function from it, a tree-shaking-enabled bundler will only include that one function in the final bundle, reducing the file size. This works with ES6 modules (`import`/`export`).

---

#### 44. Memoization

Memoization is an optimization technique used to speed up computer programs by storing the results of expensive function calls and returning the cached result when the same inputs occur again. [42] It's a way of caching a function's return value based on its arguments.

**Example:**
```javascript
function memoize(fn) {
  const cache = {};
  return function(...args) {
    // Create a unique key for the cache based on the arguments.
    // JSON.stringify is a simple way to do this for complex arguments.
    const key = JSON.stringify(args);

    // If the result for these arguments is already in the cache, return it.
    if (cache[key]) {
      console.log(`Fetching from cache for args: ${key}`);
      return cache[key];
    }

    // Otherwise, compute the result by calling the original function.
    console.log(`Calculating result for args: ${key}`);
    const result = fn.apply(this, args);

    // Store the new result in the cache before returning it.
    cache[key] = result;
    return result;
  };
}

// --- Example Usage ---
const slowFib = (n) => {
  if (n < 2) return n;
  return slowFib(n - 1) + slowFib(n - 2);
};

const memoizedFib = memoize(slowFib);

console.log(memoizedFib(40)); // Will be slow the first time
console.log(memoizedFib(40)); // Will be instantaneous the second time
```
Of course. Let's continue with more advanced, situational, and ecosystem-related questions to ensure you are prepared for a deep-dive interview.

### Design Patterns in JavaScript

Design patterns are reusable solutions to commonly occurring problems within a given context in software design.

#### 45. What is the Singleton Pattern in JavaScript? Can you implement it?

The **Singleton Pattern** is a design pattern that restricts the instantiation of a class to a single object. This is useful when exactly one object is needed to coordinate actions across the system.

**Implementation:**
This can be achieved by creating a class with a method that creates a new instance of the class if one doesn't exist. If an instance already exists, it simply returns a reference to that object.

```javascript
const Singleton = (function() {
  let instance;

  function createInstance() {
    // Private methods and variables
    const privateVariable = 'I am private';
    function privateMethod() {
      console.log('I am a private method.');
    }

    return {
      // Public methods and variables
      publicMethod: function() {
        console.log('The public can see me!');
      },
      publicVariable: 'I am public'
    };
  }

  return {
    getInstance: function() {
      if (!instance) {
        instance = createInstance();
      }
      return instance;
    }
  };
})();

const instanceA = Singleton.getInstance();
const instanceB = Singleton.getInstance();

console.log(instanceA === instanceB); // Output: true
```

---

#### 46. Explain the Observer Pattern. Where is it used in JavaScript?

The **Observer Pattern** is a behavioral pattern where an object, known as the "subject," maintains a list of its dependents, called "observers," and notifies them automatically of any state changes.

This pattern is fundamental to event-driven programming.

*   **Subject:** Maintains a collection of observers and has methods to add, remove, and notify them.
*   **Observer:** An object that wishes to be notified of the subject's state changes. It has an `update` method that the subject calls.

**Use in JavaScript:**
*   **Event Listeners:** The DOM event system is a prime example. The DOM element is the "subject," and the event listener functions are the "observers." When an event (state change) occurs on the element, it notifies all its listeners.
*   **Redux/Vuex:** State management libraries in frameworks like React and Vue use this pattern. The central store is the subject, and the UI components are observers that update when the state changes.

---

#### 47. What is the Factory Pattern? Provide a simple example.

The **Factory Pattern** is a creational pattern that provides an interface for creating objects in a superclass, but allows subclasses to alter the type of objects that will be created. It's used when you want to create objects without specifying the exact class of the object that will be created.

**Example:**
Imagine you have different types of employees. A factory function can create the correct employee object based on a given type.

```javascript
function EmployeeFactory() {
  this.create = function(name, type) {
    let employee;

    if (type === 'fulltime') {
      employee = new FullTime(name);
    } else if (type === 'parttime') {
      employee = new PartTime(name);
    }

    employee.type = type;

    employee.say = function() {
      console.log(`${this.name} is a ${this.type} employee with a salary of $${this.hourly}.`);
    }

    return employee;
  }
}

function FullTime(name) {
  this.name = name;
  this.hourly = 50;
}

function PartTime(name) {
  this.name = name;
  this.hourly = 25;
}

const factory = new EmployeeFactory();
const employees = [];

employees.push(factory.create("John Doe", "fulltime"));
employees.push(factory.create("Jane Smith", "parttime"));

employees.forEach(emp => emp.say());
```

---

### Web Security

#### 48. What is Cross-Site Scripting (XSS) and how can you prevent it?

**Cross-Site Scripting (XSS)** is a security vulnerability where an attacker injects malicious scripts into a trusted website. When an unsuspecting user visits the website, the malicious script is executed in their browser, allowing the attacker to steal information (like cookies or session tokens) or perform actions on behalf of the user.

**Prevention:**
1.  **Sanitize User Input:** The most crucial step. Before rendering any user-provided content in the DOM, escape the HTML to prevent it from being interpreted as code. For example, convert `<` to `&lt;` and `>` to `&gt;`. Libraries like `DOMPurify` are excellent for this.
2.  **Use Appropriate Response Headers:** A `Content-Security-Policy` (CSP) HTTP header can be configured to restrict which scripts can be executed on a page, providing a strong layer of defense.
3.  **Set `HttpOnly` Flag on Cookies:** If a cookie is marked as `HttpOnly`, it cannot be accessed via client-side scripts, which mitigates the damage of an XSS attack aimed at stealing session cookies.
4.  **Use Modern Frameworks:** Frameworks like React, Angular, and Vue automatically escape data bindings, which helps prevent XSS by default.

---

#### 49. What is Cross-Site Request Forgery (CSRF) and how do you mitigate it?

**Cross-Site Request Forgery (CSRF)** is an attack that tricks a user into submitting a malicious request to a web application where they are currently authenticated. For example, a user might click a link on a malicious site that secretly makes a request to `your-bank.com/transfer?amount=1000&to=attacker`, using the user's existing authenticated session.

**Mitigation:**
1.  **Anti-CSRF Tokens:** The most common defense. The server generates a unique, unpredictable token and embeds it in a hidden field in the form. When the form is submitted, the server checks if the submitted token matches the one it expected for that session. An attacker's site cannot guess this token.
2.  **SameSite Cookie Attribute:** Setting cookies with `SameSite=Strict` or `SameSite=Lax` tells the browser not to send the cookie along with cross-site requests, which effectively stops CSRF attacks. `SameSite=Strict` is the most secure option.
3.  **Check Referer/Origin Headers:** The server can check the `Referer` or `Origin` HTTP header to verify that the request is coming from its own origin. This is less reliable as these headers can sometimes be spoofed or suppressed.

---

### Modern Web APIs

#### 50. What is the `Fetch` API? How does it differ from `XMLHttpRequest` (XHR)?

The **`Fetch` API** is a modern, promise-based interface for making network requests in the browser.

**Differences from `XMLHttpRequest`:**
*   **Syntax:** `fetch` is much cleaner and more readable, using Promises and `async/await`. XHR is event-based and more verbose.
*   **Promises:** `fetch` returns a Promise, which simplifies handling asynchronous responses and avoids "callback hell."
*   **Immutability:** `Request` and `Response` objects in `fetch` are immutable, which improves consistency.
*   **CORS:** `fetch` handles CORS more easily and securely by default.
*   **Error Handling:** A `fetch()` promise only rejects when a network error occurs. It does **not** reject on HTTP error statuses (like 404 or 500). You must check the `response.ok` property or `response.status` to handle HTTP errors. XHR's `onerror` handles network errors, and `onreadystatechange` or `onload` can be used to check for HTTP status codes.

---

#### 51. What are Service Workers? What are they used for?

A **Service Worker** is a script that your browser runs in the background, separate from a web page, enabling features that don't need a web page or user interaction.

**Key Use Cases:**
1.  **Offline Capabilities:** They can intercept network requests and serve responses from a cache, allowing a web application to work offline.
2.  **Push Notifications:** They can listen for push messages from a server and display notifications to the user, even when the web page is not open.
3.  **Background Sync:** They can defer actions (like sending form data) until the user has a stable internet connection.

---

#### 52. What is the `Intersection Observer` API?

The `Intersection Observer` API provides a way to asynchronously observe changes in the intersection of a target element with an ancestor element or with a top-level document's viewport.

It is far more performant than traditional methods like listening to scroll events and calling `getBoundingClientRect()`.

**Common Uses:**
*   **Lazy-loading images or content:** Load content only when it scrolls into view.
*   **Implementing "infinite scroll":** Load more content as the user approaches the end of a list.
*   **Tracking ad visibility:** Determine if an ad has been seen by the user.

---

### Build Tools, Environment, and Testing

#### 53. What is the purpose of a tool like Webpack or Rollup?

**Webpack**, **Rollup**, and **Vite** are modern JavaScript **module bundlers**. Their primary purpose is to take your JavaScript files (and other assets like CSS and images), process them, and bundle them into optimized files for the browser.

**Key Functions:**
*   **Bundling:** Combine multiple JavaScript modules into a single (or a few) files to reduce the number of HTTP requests.
*   **Transpilation:** Use loaders (like Babel) to convert modern JavaScript (ES6+) into older, more widely supported JavaScript (ES5).
*   **Asset Management:** Process other assets like CSS, SASS, images, and fonts.
*   **Optimization:** Perform tasks like minification (removing whitespace and shortening variable names) and tree shaking (removing unused code).
*   **Development Server:** Provide a live-reloading development server for a better developer experience.

---

#### 54. What is the difference between `npm` and `npx`?

*   **`npm` (Node Package Manager):** This is the default package manager for Node.js. It is used to install, manage, and publish packages (libraries, frameworks, tools) to and from the npm registry. Its primary command is `npm install <package-name>`.
*   **`npx` (Node Package Execute):** This is a package *runner* that comes bundled with npm. `npx` allows you to execute a command from an npm package without having to install it globally or as a local project dependency. For example, `npx create-react-app my-app` will download the `create-react-app` package, run its command to create a new React project, and then discard the package. It's a convenient way to run one-off commands.

---

#### 55. What is unit testing? What tools would you use to test JavaScript code?

**Unit Testing** is a level of software testing where individual units or components of a software are tested. The purpose is to validate that each unit of the software code performs as expected. In JavaScript, a "unit" can be a single function, a module, or a component.

**Common JS Testing Tools:**
*   **Testing Framework:** Provides the structure and runner for your tests.
    *   **Jest:** A popular, all-in-one testing framework developed by Facebook. It comes with an assertion library, mocking support, and a test runner built-in. Excellent for React applications but works with any JavaScript project.
    *   **Mocha:** A flexible and mature testing framework. It provides the test runner but allows you to choose your own assertion library (like Chai) and mocking library (like Sinon).
*   **Assertion Library:** Provides functions to check if your code produces the expected outcomes (e.g., `expect(sum(1, 2)).toBe(3)`).
    *   **Chai:** A popular assertion library often paired with Mocha.
*   **Testing Library:** A family of packages for testing UI components in a user-centric way.
    *   **React Testing Library / Vue Testing Library:** Encourages writing tests that resemble how users interact with your application, leading to more resilient tests.

---

### Situational & Conceptual Questions

#### 56. You've noticed that a web page you are working on is slow to load. What steps would you take to diagnose and fix the problem?

This question tests your holistic understanding of web performance.

1.  **Measure First:** Use browser developer tools (`Lighthouse` and `Performance` tabs in Chrome DevTools) to get a baseline report. This will identify key bottlenecks like a high Time to Interactive (TTI), a large bundle size, or a long First Contentful Paint (FCP).
2.  **Analyze the Network Waterfall:** Check the `Network` tab to see what resources are being loaded. Look for:
    *   **Large file sizes:** Are images unoptimized? Are JS/CSS bundles too big?
    *   **Too many requests:** Can files be combined?
    *   **Slow server response:** Is the Time to First Byte (TTFB) high? This could indicate a backend issue.
    *   **Render-blocking resources:** Are scripts or stylesheets in the `<head>` blocking the initial render?
3.  **Check Bundle Size:** Use a tool like `webpack-bundle-analyzer` to visualize what's inside the JavaScript bundles. Are there large, unnecessary libraries? Is code splitting implemented?
4.  **Implement Fixes based on Diagnosis:**
    *   **Asset Optimization:** Compress images, minify JS/CSS.
    *   **Code Splitting:** Use dynamic `import()` to split code into smaller chunks that are loaded on demand.
    *   **Lazy Loading:** Defer loading of off-screen images and components.
    *   **Caching:** Ensure proper browser caching headers are set.
    *   **Use a CDN:** Serve static assets from a CDN.
    *   **Optimize Critical Rendering Path:** Defer non-critical CSS and use `async` or `defer` for scripts.
5.  **Measure Again:** After implementing fixes, run the performance analysis again to quantify the improvement.

---

#### 57. What is the difference between imperative and declarative programming? Is React/Vue considered imperative or declarative?

*   **Imperative Programming:** Focuses on **how** to achieve a result. You write code that describes the step-by-step instructions the computer must perform to reach the goal. A `for` loop that manually iterates and manipulates the DOM is an example of imperative code.
    ```javascript
    // Imperative
    const target = document.getElementById('my-app');
    const header = document.createElement('h1');
    header.textContent = 'Hello World';
    target.appendChild(header);
    ```
*   **Declarative Programming:** Focuses on **what** you want to achieve, without specifying how to do it. You declare your desired outcome, and the underlying engine (e.g., the framework) figures out the steps to get there.
    ```jsx
    // Declarative (React)
    function App() {
      return <h1>Hello World</h1>;
    }
    ```

Modern UI frameworks like **React, Vue, and Angular are declarative**. You declare what the UI should look like for a given state, and the framework takes on the imperative job of updating the DOM efficiently to match that desired state. This makes code easier to reason about and less error-prone.
Of course. Here is a continuation with more advanced, ecosystem-specific, and architectural questions that test a candidate's depth of knowledge and experience.

### Advanced Language Features & Nuances

#### 58. Explain `Symbol`, `Proxy`, and `Reflect` in JavaScript.

These are metaprogramming features introduced in ES6 that allow developers to intercept and customize fundamental language operations.

*   **`Symbol`**: A `Symbol` is a primitive data type whose instances are unique and immutable. Its main purpose is to be used as a key for an object property to avoid name collisions. Since symbols are unique, you can add properties to objects without the risk of overwriting existing property keys.
    ```javascript
    const mySymbol = Symbol('description');
    const myObj = {};

    myObj[mySymbol] = 'This is a hidden value!';
    console.log(myObj[mySymbol]); // 'This is a hidden value!'
    // It won't show up in a for...in loop or Object.keys()
    ```

*   **`Proxy`**: A `Proxy` object is used to create a wrapper around another object (the "target"). It allows you to intercept and redefine fundamental operations for that object, such as property lookup, assignment, and function invocation. This is done by providing a "handler" object with "traps" (methods) that intercept the operations.
    ```javascript
    const target = {
      message: "hello"
    };

    const handler = {
      get: function(target, prop, receiver) {
        if (prop === 'message') {
          return 'world';
        }
        return Reflect.get(...arguments); // Forward the operation
      }
    };

    const proxy = new Proxy(target, handler);

    console.log(proxy.message); // Output: "world"
    console.log(target.message); // Output: "hello"
    ```

*   **`Reflect`**: `Reflect` is a built-in object that provides methods for interceptable JavaScript operations, essentially the same methods used as "traps" in `Proxy` handlers. It is not a constructor. `Reflect` makes it easier to forward the original operation from within a proxy trap. For example, `Reflect.get(target, prop)` performs the default "get" operation.

---

#### 59. What is the difference between `WeakMap`/`WeakSet` and `Map`/`Set`?

The key difference lies in how they handle object references and garbage collection.

*   **`Map` and `Set`**: Create "strong" references to the objects they contain. This means that as long as an object is present in a `Map` or `Set`, it will not be garbage collected, even if it's the *only* remaining reference to that object.
*   **`WeakMap` and `WeakSet`**: Create "weak" references. If an object stored in a `WeakMap` or `WeakSet` is no longer referenced anywhere else in the program, it can be garbage collected.

**Key Characteristics and Use Cases:**
*   **`WeakMap` keys must be objects**, not primitive values.
*   You cannot iterate over a `WeakMap` or `WeakSet` (e.g., using `forEach`), because the entries could be removed by the garbage collector at any time.
*   **Use Case:** They are useful for associating metadata with an object without preventing that object from being garbage collected when it's no longer needed. This helps prevent memory leaks. For example, you could store extra data about a DOM element in a `WeakMap`, with the element as the key. If the DOM element is removed from the page, the `WeakMap` will not prevent it from being garbage collected.

---

#### 60. Explain the differences between `Object.freeze()`, `Object.seal()`, and `Object.preventExtensions()`.

These methods provide different levels of immutability for JavaScript objects.

*   **`Object.preventExtensions(obj)`**: This is the mildest level.
    *   Prevents new properties from being added to the object.
    *   You can still **delete** and **modify** existing properties.

*   **`Object.seal(obj)`**: This is stricter.
    *   Does everything `preventExtensions` does.
    *   Additionally, it marks all existing properties as non-configurable, meaning you **cannot delete** them.
    *   You can still **modify** the values of existing properties (if they are writable).

*   **`Object.freeze(obj)`**: This is the strictest level.
    *   Does everything `seal` does.
    *   Additionally, it makes all data properties read-only. You **cannot modify** the values of existing properties.
    *   It provides shallow immutability. If a property is itself an object, that nested object is not frozen.

---

### TypeScript

#### 61. What is TypeScript and what are its main advantages over plain JavaScript?

**TypeScript** is a statically typed superset of JavaScript, developed by Microsoft. It adds optional static types, classes, and interfaces to JavaScript. All TypeScript code is transpiled into plain JavaScript to be run in browsers or Node.js environments.

**Main Advantages:**
1.  **Static Typing:** Catches type-related errors during development (at compile-time) rather than at runtime. This leads to fewer bugs, especially in large applications. For example, `const x: number = "hello";` will immediately show an error.
2.  **Improved IDE Support:** Static types enable powerful IDE features like intelligent code completion (IntelliSense), easier refactoring, and "go to definition" functionality.
3.  **Enhanced Code Readability and Self-Documentation:** Type annotations make the code easier to understand and reason about, as the expected data shapes (like function arguments and return values) are explicit.
4.  **Access to Modern Features:** TypeScript allows you to use the latest JavaScript features and transpiles them down to older versions of JavaScript for broader browser compatibility.

---

#### 62. What is the difference between an `interface` and a `type` alias in TypeScript?

Both `interface` and `type` can be used to describe the shape of an object or a function. They have a lot in common, but there are key differences.

*   **`interface`**:
    *   Can only be used to describe the shape of objects, classes, and functions.
    *   Can be "extended" by other interfaces (`interface Dog extends Animal { ... }`).
    *   Supports **declaration merging**. If you define the same interface multiple times, TypeScript will merge their definitions. This is useful for augmenting existing interfaces, especially from third-party libraries.

*   **`type` alias**:
    *   Is more versatile. It can represent a primitive type (`type MyString = string;`), a union (`type Status = 'success' | 'error';`), a tuple, or an object shape.
    *   Does not support declaration merging. You cannot define the same `type` twice.
    *   Used with utility types like `Partial<T>`, `Pick<T>`, etc., to create new types from existing ones.

**General Guideline:** Use `interface` when defining the shape of an object or class that can be extended. Use `type` for defining unions, tuples, or when you need more advanced type manipulations.

---

### Concurrency and Parallelism

#### 63. What is the difference between concurrency and parallelism? How does JavaScript achieve them?

This is a subtle but important distinction in computer science.

*   **Concurrency**: The ability to have multiple tasks **in progress** at the same time. The tasks don't have to be executing simultaneously. On a single-core processor, tasks can be interleaved, with the system switching between them. This creates the illusion of simultaneous execution.
*   **Parallelism**: The ability to have multiple tasks **executing** at the exact same time. This requires a multi-core processor, where each core can run a separate task simultaneously.

**How JavaScript handles them:**
*   **Concurrency:** JavaScript's primary model is **single-threaded concurrency** managed by the **Event Loop**. Asynchronous operations (like `fetch` or `setTimeout`) are handed off to the browser/Node.js environment. While waiting for these operations to complete, the main thread is not blocked and can continue executing other code. When an operation finishes, its callback is placed in a queue and processed by the event loop. This is concurrency, not parallelism, because only one piece of JavaScript code is ever running at a given moment on the main thread.
*   **Parallelism:** To achieve true parallelism, you must use **Web Workers**. A Web Worker allows you to run a script on a separate background thread. This is useful for offloading CPU-intensive tasks (like complex calculations, data processing, or cryptography) from the main thread, preventing the UI from freezing. Communication between the main thread and a worker thread is done by passing messages.

---

### Code Architecture & Best Practices

#### 64. What is SOLID? Can you explain one of the principles in the context of JavaScript?

**SOLID** is an acronym for five design principles intended to make software designs more understandable, flexible, and maintainable.

1.  **S** - **Single Responsibility Principle (SRP)**
2.  **O** - **Open/Closed Principle**
3.  **L** - **Liskov Substitution Principle**
4.  **I** - **Interface Segregation Principle**
5.  **D** - **Dependency Inversion Principle**

**Explanation of the Single Responsibility Principle (SRP) in JavaScript:**
The SRP states that a class or module should have only one reason to change, meaning it should have only one job or responsibility.

*   **Bad Example (violates SRP):**
    ```javascript
    class UserReport {
      constructor(user) {
        this.user = user;
      }

      // Responsibility 1: Formatting data
      formatReport() {
        return `User Report for ${this.user.name}`;
      }

      // Responsibility 2: Saving to a database
      saveToDatabase() {
        // ... code to save the report to a DB
      }
    }
    ```
    This class has two reasons to change: if the report format changes, or if the database saving logic changes.

*   **Good Example (follows SRP):**
    ```javascript
    // Responsibility 1: Data formatting
    class ReportFormatter {
      constructor(user) {
        this.user = user;
      }
      format() {
        return `User Report for ${this.user.name}`;
      }
    }

    // Responsibility 2: Data persistence
    class ReportRepository {
      save(reportText) {
        // ... code to save the report to a DB
      }
    }
    ```
    Now, each class has a single, clear purpose. This makes the code easier to test, debug, and maintain.

---

#### 65. You are starting a new, large-scale front-end project. How would you structure your application's files and folders?

This question assesses your experience with maintainability and scalability. A good answer shows you think about long-term project health.

"There's no single 'perfect' structure, but a common and effective approach is **feature-based (or module-based) organization**.

1.  **Top-Level Structure:**
    *   `src/`: This is where all the application source code lives.
    *   `src/components/`: For globally shared, reusable, and "dumb" UI components (e.g., `Button`, `Modal`, `Input`). These components have no business logic.
    *   `src/features/` (or `src/modules/`): This is the core of the structure. The application is broken down by feature. For an e-commerce site, this might contain `products`, `cart`, `user-profile`, etc.
    *   `src/lib/` (or `src/core/`): For core logic, framework setup, and API communication logic (e.g., an `apiClient.js` wrapper around `fetch`).
    *   `src/hooks/`: For custom, reusable React hooks (if using React).
    *   `src/utils/`: For pure helper functions that are not specific to any feature (e.g., `formatDate`, `validateEmail`).
    *   `src/assets/`: For static assets like images, fonts, and global CSS.

2.  **Inside a Feature Folder (e.g., `src/features/cart/`):**
    *   `index.js`: The public API of the feature. It exports only what other features need to consume.
    *   `components/`: Components that are specific to the cart feature (e.g., `CartItem`, `CartSummary`).
    *   `cartSlice.js` (if using Redux Toolkit) or `useCart.js` (if using hooks): The state management and business logic for the cart.
    *   `api.js`: Functions for making API calls related to the cart.

**Why this structure is good:**
*   **High Cohesion:** All files related to a single feature are located together, making them easy to find and work on.
*   **Low Coupling:** Each feature is a self-contained unit. This makes it easier to change or even remove a feature without affecting the rest of the application.
*   **Scalability:** It's easy to add new features without cluttering the global folders."




### Coding questions
Excellent! Let's go through each of these questions one by one with code, explanations, and key concepts. This is the perfect way to prepare.

---

### Category 1: Array Manipulation

#### 1. Flatten an Array

*   **The Problem:** Write a function to flatten a nested array. For the follow-up, it must handle any level of nesting.

*   **The Code:**
    ```javascript
    /**
     * Flattens a nested array to a specified depth or completely.
     * @param {Array} arr The array to flatten.
     * @param {number} depth The depth of flattening. Infinity for full flattening.
     * @returns {Array} The new flattened array.
     */
    // Modern Built-in Solution (for a known, finite depth)
    const nestedArray = [1, [2, 3], [[4], 5]];
    // The `flat()` method creates a new array with all sub-array elements
    // concatenated into it recursively up to the specified depth.
    console.log(nestedArray.flat(2)); // Output: [1, 2, 3, 4, 5]

    // --- Recursive Solution (for arbitrary/unknown depth) ---
    function flattenDeep(arr) {
      let flattened = [];

      for (const element of arr) {
        // Check if the element is itself an array
        if (Array.isArray(element)) {
          // If it is, recursively call flattenDeep on it
          // and spread the result into our flattened array.
          flattened.push(...flattenDeep(element));
        } else {
          // If it's not an array, just push the element.
          flattened.push(element);
        }
      }

      return flattened;
    }

    console.log(flattenDeep([1, [2, 3], [[4], [5, [6]]]])); // Output: [1, 2, 3, 4, 5, 6]
    ```

*   **The Explanation:**
    *   **Built-in:** The `Array.prototype.flat(depth)` method is the easiest way. You provide the level of nesting you want to flatten. Using `Infinity` as the depth will flatten any arbitrarily deep array.
    *   **Recursive:** This is the classic way to solve it and what an interviewer wants to see if they ask you to code it from scratch. The function iterates through the array. If an element isn't an array, it's added to the result. If it *is* an array, the function calls itself with that sub-array, effectively diving deeper until it finds non-array elements. The spread syntax (`...`) is used to concatenate the results seamlessly.

---

#### 2. Create your own `map`, `filter`, and `reduce` (Polyfills)

*   **The Problem:** Add custom implementations of `map`, `filter`, and `reduce` to the `Array.prototype`. This demonstrates a deep understanding of `this` and callbacks.

*   **The Code:**
    ```javascript
    // --- MAP POLYFILL ---
    Array.prototype.myMap = function(callback) {
      const newArray = [];
      // 'this' refers to the array the myMap method is called on.
      for (let i = 0; i < this.length; i++) {
        // Call the callback with the element, index, and the array itself.
        newArray.push(callback(this[i], i, this));
      }
      return newArray;
    };

    // --- FILTER POLYFILL ---
    Array.prototype.myFilter = function(callback) {
      const filteredArray = [];
      for (let i = 0; i < this.length; i++) {
        // If the callback returns a truthy value, push the element.
        if (callback(this[i], i, this)) {
          filteredArray.push(this[i]);
        }
      }
      return filteredArray;
    };

    // --- REDUCE POLYFILL ---
    Array.prototype.myReduce = function(callback, initialValue) {
      // The accumulator starts as the initialValue if provided.
      let accumulator = initialValue;
      // The loop starts at index 0 if initialValue is provided.
      let startIndex = 0;

      // If no initialValue, the first element is the accumulator,
      // and we start the loop from the second element.
      if (initialValue === undefined) {
        accumulator = this[0];
        startIndex = 1;
      }

      for (let i = startIndex; i < this.length; i++) {
        accumulator = callback(accumulator, this[i], i, this);
      }
      return accumulator;
    };

    // Example Usage:
    const nums = [1, 2, 3];
    const doubled = nums.myMap(num => num * 2); // [2, 4, 6]
    const evens = nums.myFilter(num => num % 2 === 0); // [2]
    const sum = nums.myReduce((acc, curr) => acc + curr, 0); // 6
    ```

*   **The Explanation:**
    *   `this`: Inside a function added to `Array.prototype`, `this` refers to the array instance the method is called on (e.g., `nums` in the example).
    *   `callback`: These are higher-order functions because they accept another function (`callback`) as an argument. The key is to invoke the `callback` at each iteration with the correct arguments (`element`, `index`, `array`), which is the standard contract for these methods.
    *   `myReduce`: This is the most complex. You must handle the case where an `initialValue` is or is not provided. If it's not, the first element of the array becomes the initial `accumulator`.

---

#### 3. Find the Intersection of Two Arrays

*   **The Problem:** Find the common elements between two arrays.

*   **The Code:**
    ```javascript
    function getIntersection(arr1, arr2) {
      // Create a Set from the first array for efficient lookup.
      // Checking for an element's existence in a Set is very fast (O(1) on average).
      const set1 = new Set(arr1);

      // Filter the second array.
      // For each element in arr2, we keep it only if it's also present in set1.
      return arr2.filter(element => set1.has(element));
    }

    // Example Usage:
    const arrayA = [1, 2, 3, 4, 5];
    const arrayB = [4, 5, 6, 7, 8];
    console.log(getIntersection(arrayA, arrayB)); // Output: [4, 5]
    ```

*   **The Explanation:**
    This is the most efficient approach. Instead of using `arr1.includes()` inside the filter (which would be slow, O(n\*m)), we first convert `arr1` into a `Set`. `Set.prototype.has()` has an average time complexity of O(1). This makes the overall complexity O(n + m) (one pass to create the Set, one pass to filter the second array), which is much better.

---

### Category 2: Objects and Prototypes

#### 4. Deep Compare Two Objects

*   **The Problem:** Write a function `isEqual` that checks if two objects are structurally identical, including nested objects and arrays.

*   **The Code:**
    ```javascript
    function isEqual(obj1, obj2) {
      // Get the keys of both objects
      const keys1 = Object.keys(obj1);
      const keys2 = Object.keys(obj2);

      // If they don't have the same number of keys, they're not equal
      if (keys1.length !== keys2.length) {
        return false;
      }

      // Iterate over the keys of the first object
      for (const key of keys1) {
        const val1 = obj1[key];
        const val2 = obj2[key];

        // Check if both values are objects (and not null)
        const areObjects = typeof val1 === 'object' && val1 !== null && typeof val2 === 'object' && val2 !== null;

        if (areObjects) {
          // If they are objects, make a recursive call
          if (!isEqual(val1, val2)) {
            return false;
          }
        } else if (val1 !== val2) {
          // If they are primitive values and not equal, the objects are not equal
          return false;
        }
      }

      // If all keys and values match, the objects are equal
      return true;
    }

    // Example Usage:
    const objA = { a: 1, b: { c: 2 } };
    const objB = { a: 1, b: { c: 2 } };
    const objC = { a: 1, b: { c: 3 } };
    console.log(isEqual(objA, objB)); // true
    console.log(isEqual(objA, objC)); // false
    ```

*   **The Explanation:**
    This solution uses recursion.
    1.  It first checks for the most basic inequality: a different number of properties.
    2.  It then loops through the properties of one object.
    3.  For each property, it checks if the corresponding values in both objects are themselves objects.
    4.  If they are objects, it calls `isEqual` again (the recursive step) to compare them. If this recursive call returns `false`, we know the objects are not equal.
    5.  If the values are primitives (string, number, etc.), it compares them directly with `!==`.
    6.  If the loop completes without finding any differences, the objects are considered equal.

---

#### 5. "Flatten" an Object

*   **The Problem:** Convert a nested object into a single-level object with dot notation for keys.

*   **The Code:**
    ```javascript
    function flattenObject(obj, parentKey = '', result = {}) {
      for (const key in obj) {
        // Construct the new key. If there's a parent key, prefix it.
        const newKey = parentKey ? `${parentKey}.${key}` : key;

        const value = obj[key];

        // Check if the value is a plain object (not an array, not null)
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // If it's an object, make a recursive call
          flattenObject(value, newKey, result);
        } else {
          // If it's a primitive or an array, assign it to the result
          result[newKey] = value;
        }
      }
      return result;
    }

    // Example Usage:
    const nested = { a: 1, b: { c: 2, d: { e: 3 } } };
    console.log(flattenObject(nested)); // Output: { 'a': 1, 'b.c': 2, 'b.d.e': 3 }
    ```

*   **The Explanation:**
    This is another classic recursion problem.
    1.  The function iterates through the keys of the object.
    2.  It builds a `newKey` by combining the `parentKey` (from the previous recursion level) with the current `key`.
    3.  If the value associated with a key is another object, it calls itself recursively, passing the nested object, the `newKey` as the new `parentKey`, and the same `result` object to be populated.
    4.  If the value is a primitive (or an array), it adds the key-value pair to the `result` object and stops diving deeper.

---

### Category 3: Asynchronous JavaScript

#### 6. Implement `Promise.all`

*   **The Problem:** Create a function that behaves like `Promise.all`.

*   **The Code:**
    ```javascript
    function myPromiseAll(promises) {
      return new Promise((resolve, reject) => {
        const results = [];
        let completed = 0;
        // Handle empty array case
        if (promises.length === 0) {
          resolve(results);
          return;
        }

        promises.forEach((promise, index) => {
          // Ensure we are working with actual promises
          Promise.resolve(promise)
            .then(value => {
              // Store the result in the correct order
              results[index] = value;
              completed++;

              // If all promises have completed, resolve the main promise
              if (completed === promises.length) {
                resolve(results);
              }
            })
            .catch(error => {
              // If any promise rejects, reject the main promise immediately
              reject(error);
            });
        });
      });
    }

    // Example Usage:
    const p1 = Promise.resolve(3);
    const p2 = 42;
    const p3 = new Promise((resolve) => setTimeout(resolve, 100, 'foo'));

    myPromiseAll([p1, p2, p3]).then(values => console.log(values)); // Output: [3, 42, "foo"]
    ```

*   **The Explanation:**
    1.  The function returns a new `Promise`.
    2.  It initializes a `results` array to store the outcomes and a `completed` counter.
    3.  It iterates over the input `promises` array. It's important to use `forEach` with an `index` so we can place the results in the correct order, as promises may resolve at different times.
    4.  For each promise, it attaches a `.then()`. When a promise resolves, its value is placed at the correct `index` in the `results` array, and the `completed` counter is incremented.
    5.  After each promise completes, it checks if `completed === promises.length`. If so, it means all promises are done, and we can `resolve` the main promise with the `results` array.
    6.  A `.catch()` is also attached. If *any* promise rejects, the main promise is immediately rejected with that error, which is the specified behavior of `Promise.all`.

---

### Category 4: Functions, Scope, and Closures

#### 7. Implement Debounce

*   **The Problem:** Create a function that delays invoking another function until after a certain amount of time has passed without it being called again.

*   **The Code:**
    ```javascript
    function debounce(func, delay) {
      // The timer variable is kept alive in the closure.
      let timer;

      // The returned function is the one that will actually be called.
      return function(...args) {
        // 'this' context of the call is preserved.
        const context = this;

        // Clear the previous timeout to reset the waiting period.
        clearTimeout(timer);

        // Set a new timeout.
        timer = setTimeout(() => {
          // When the timeout completes, call the original function
          // with the correct context and arguments.
          func.apply(context, args);
        }, delay);
      };
    }

    // Example Usage (imagine this is tied to a search input's `onkeyup` event):
    const handleSearch = (query) => console.log(`Searching for ${query}...`);
    const debouncedSearch = debounce(handleSearch, 500); // Wait 500ms after last keypress
    debouncedSearch("react");
    debouncedSearch("react hooks"); // The previous call is cancelled. This one will execute.
    ```

*   **The Explanation:**
    This relies on **closures**.
    1.  The `debounce` function is called once, creating a scope. The `timer` variable lives in this scope.
    2.  It returns a new function. This new function is a "closure" because it has access to the `timer` variable from its parent scope.
    3.  Every time the returned function is called (e.g., on a key press), it first clears any existing timeout via `clearTimeout(timer)`. This cancels the previously scheduled execution.
    4.  Then, it sets a *new* timeout to execute the original `func` after `delay` milliseconds.
    5.  If the user keeps typing, the function keeps getting called, and the timer is constantly reset. The original `func` will only ever run once the user has stopped typing for the duration of the `delay`.

---

#### 8. What's the Output? (Closures)

*   **The Problem:** Explain the output of the `setTimeout` loop with `var` and fix it.

*   **The Code and Explanation:**
    ```javascript
    for (var i = 0; i < 5; i++) {
      setTimeout(function() {
        console.log(i);
      }, 1000);
    }
    ```
    *   **Output:** It will print the number `5`, five times.
    *   **Why:**
        1.  **Hoisting & Scope:** The `var i` is function-scoped (or globally scoped here). This means there is only **one** `i` variable in memory that is shared by all iterations of the loop.
        2.  **Execution Order:** The `for` loop runs to completion almost instantly. By the time it's done, the value of `i` is `5`.
        3.  **`setTimeout`:** The `setTimeout` callbacks are placed in a queue to be executed *after* the loop has finished. When they finally run (after ~1000ms), they all reference the *same* `i` variable, which by that point holds the value `5`.

*   **The Fixes:**

    **Fix 1: Using `let` (Modern Solution)**
    ```javascript
    for (let i = 0; i < 5; i++) {
      setTimeout(function() {
        console.log(i); // Prints 0, 1, 2, 3, 4
      }, 1000);
    }
    ```
    *   **Explanation:** `let` is **block-scoped**. In each iteration of the loop, a *new* block is created, and a *new* `i` variable specific to that block is also created. The `setTimeout` callback forms a closure over this new, unique `i` for each iteration.

    **Fix 2: Using an IIFE (Immediately Invoked Function Expression) (Classic Solution)**
    ```javascript
    for (var i = 0; i < 5; i++) {
      (function(j) { // Create a new function scope
        setTimeout(function() {
          console.log(j); // Prints 0, 1, 2, 3, 4
        }, 1000);
      })(i); // Immediately call it, passing in the current value of i
    }
    ```
    *   **Explanation:** The IIFE creates a new function scope for each iteration. We pass the current value of `i` into this scope as the argument `j`. The `setTimeout` callback now forms a closure over the `j` variable, which is unique to that specific function call, thus preserving the correct value.


Of course. Let's continue with the rest of the questions from your list.

---

### Category 1: Array Manipulation (Continued)

#### 9. Chunk an Array

*   **The Problem:** Write a function that splits an array into smaller, equal-sized arrays (chunks). The last chunk may be smaller if the array size isn't perfectly divisible by the chunk size.

*   **The Code:**
    ```javascript
    /**
     * Splits an array into chunks of a specific size.
     * @param {Array} arr The array to chunk.
     * @param {number} size The size of each chunk.
     * @returns {Array<Array>} A new array containing the chunks.
     */
    function chunkArray(arr, size) {
      const chunkedArray = [];
      let index = 0;

      // Loop while the index is less than the array's length
      while (index < arr.length) {
        // Use slice to get a chunk from the current index to index + size
        const chunk = arr.slice(index, index + size);
        chunkedArray.push(chunk);

        // Move the index to the start of the next chunk
        index += size;
      }

      return chunkedArray;
    }

    // Example Usage:
    const data = [1, 2, 3, 4, 5, 6, 7];
    console.log(chunkArray(data, 3)); // Output: [[1, 2, 3], [4, 5, 6], [7]]
    console.log(chunkArray(data, 2)); // Output: [[1, 2], [3, 4], [5, 6], [7]]
    ```

*   **The Explanation:**
    1.  We initialize an empty array `chunkedArray` to hold the results.
    2.  We use a `while` loop that continues as long as our `index` hasn't reached the end of the input array.
    3.  Inside the loop, `arr.slice(index, index + size)` is the key. `slice` extracts a portion of the array without modifying the original. It grabs elements from the current `index` up to (but not including) `index + size`.
    4.  This extracted `chunk` is pushed into our `chunkedArray`.
    5.  We then increment our `index` by the `size` to position it correctly for the next iteration.

---

### Category 2: Objects and Prototypes (Continued)

#### 10. Deep Clone an Object

*   **The Problem:** Create a true copy of an object, including any nested objects or arrays, so that changes to the copy do not affect the original.

*   **The Code:**
    ```javascript
    /**
     * Creates a deep copy of a value.
     * @param {*} value The value to clone.
     * @returns {*} The cloned value.
     */
    function deepClone(value) {
      // Base case: if the value is not an object or is null, return it directly.
      // This handles primitives (string, number, boolean, etc.) and null.
      if (typeof value !== 'object' || value === null) {
        return value;
      }

      // Determine if the value is an array or an object.
      const clone = Array.isArray(value) ? [] : {};

      // Iterate over all keys in the original object/array.
      for (const key in value) {
        // Recursively call deepClone for each nested value.
        // The result is assigned to the corresponding key in the new clone.
        clone[key] = deepClone(value[key]);
      }

      return clone;
    }

    // Example Usage:
    const original = { a: 1, b: { c: 2, d: [3, 4] } };
    const copy = deepClone(original);

    copy.b.c = 99; // Change the copy
    copy.b.d.push(5);

    console.log(original.b.c); // Output: 2 (The original is unaffected)
    console.log(original.b.d); // Output: [3, 4] (The original is unaffected)
    ```

*   **The Explanation:**
    This is a recursive solution that handles both objects and arrays.
    1.  **Base Case:** The recursion needs a stopping point. If the value is a primitive (like a number or string), it can't be broken down further, so we just return it.
    2.  **Initialization:** We create a new empty array or object (`clone`) to hold the copied values.
    3.  **Recursion:** We loop through each `key` in the `value` to be cloned. For each nested value (`value[key]`), we call `deepClone` on it. This process continues until we hit the base case (primitives). The returned result of the recursive call is assigned to the `clone`.
    *   **Why not `JSON.parse(JSON.stringify(obj))`?** While this is a common shortcut, it has limitations. It cannot clone functions, `undefined`, `Set`, `Map`, or other complex data types. The recursive approach is more robust.

---

#### 11. Prototypal Inheritance

*   **The Problem:** Demonstrate how to create an object that inherits properties and methods from a parent object.

*   **The Code:**
    ```javascript
    // 1. Define a parent object with properties and a method.
    const animal = {
      isAlive: true,
      breathe() {
        console.log("Inhale, exhale...");
      }
    };

    // 2. Create a child object that inherits from 'animal'.
    // Object.create() sets up the prototype chain.
    const dog = Object.create(animal);

    // 3. Add a property specific to the child.
    dog.breed = "Golden Retriever";

    // 4. Add a method specific to the child.
    dog.bark = function() {
      console.log("Woof!");
    };

    // 5. Override a method from the parent.
    dog.breathe = function() {
      console.log("Dog is panting...");
    };

    // --- Verification ---
    console.log(dog.breed);       // "Golden Retriever" (Own property)
    dog.bark();                   // "Woof!" (Own method)
    dog.breathe();                // "Dog is panting..." (Overridden method)
    console.log(dog.isAlive);     // true (Inherited from animal's prototype)
    ```

*   **The Explanation:**
    *   **Prototype Chain:** In JavaScript, objects can have another object as their "prototype". When you try to access a property on an object, JavaScript first checks the object itself. If it doesn't find it, it looks at the object's prototype, then the prototype's prototype, and so on, up the chain until it finds the property or reaches `null`.
    *   **`Object.create(parent)`:** This is the standard way to set up this relationship. It creates a new, empty object (`dog`) and sets its internal `[[Prototype]]` property to be the `animal` object.
    *   **Inheritance:** `dog` doesn't have its own `isAlive` property, so when we ask for `dog.isAlive`, JavaScript looks up the prototype chain and finds it on `animal`.
    *   **Overriding:** When we define `dog.breathe`, we are creating a new property directly on the `dog` object. Now, when we call `dog.breathe()`, JavaScript finds this new function first and executes it, never reaching the one on the `animal` prototype.

---

### Category 4: Functions, Scope, and Closures (Continued)

#### 12. Implement Throttle

*   **The Problem:** Create a function that ensures another function is only executed at most once per specified time period.

*   **The Code:**
    ```javascript
    function throttle(func, limit) {
      let inThrottle; // Flag to check if we are "in the cooling-down period"
      let lastArgs;
      let lastThis;

      return function(...args) {
        const context = this;
        // If not in the cooling-down period, execute the function
        if (!inThrottle) {
          func.apply(context, args);
          inThrottle = true; // Set the flag

          // Set a timeout to reset the flag after the limit
          setTimeout(() => {
            inThrottle = false;
          }, limit);
        }
      };
    }
    ```

*   **The Explanation:**
    1.  The `throttle` function uses a closure to maintain the `inThrottle` flag between calls.
    2.  When the throttled function is invoked, it first checks if `inThrottle` is `true`.
    3.  If it's `false`, it means we are not in the "cooling-down" period. The original `func` is executed, `inThrottle` is immediately set to `true`, and a `setTimeout` is scheduled.
    4.  The `setTimeout` will reset `inThrottle` back to `false` after the `limit` has passed.
    5.  If the throttled function is called again *during* this cooling-down period, the `if (!inThrottle)` check fails, and nothing happens. This ensures the function only runs once per `limit`.

### Additional Advanced Topics

Here are explanations for a few more advanced, conceptual, and environment-specific topics.

---

#### 66. Illegal Shadowing

**Variable shadowing** occurs when a variable declared within a certain scope (e.g., a local variable) has the same name as a variable in an outer scope. When this happens, the inner variable "shadows" the outer variable, and any reference to the variable within the inner scope will resolve to the inner variable.

While shadowing is allowed in many cases, there is a specific scenario called **"illegal shadowing"** that results in a `SyntaxError`. This happens when you try to declare a variable with `var` that shadows a variable declared with `let` or `const` in a block scope.

**Legal Shadowing Examples:**
```javascript
// Shadowing a global variable is legal
let x = 10;
function showX() {
  let x = 20; // This x shadows the global x
  console.log(x); // 20
}
showX();
console.log(x); // 10

// Shadowing with `let` in a nested block is also legal
let y = 5;
if (true) {
  let y = 10; // This y shadows the outer y
  console.log(y); // 10
}
console.log(y); // 5
```

**Illegal Shadowing Example:**
The "Temporal Dead Zone" (TDZ) of `let` and `const` is the reason this is illegal. A block-scoped variable cannot be referenced before it is declared. The engine prevents a `var` from "leaking" into a block and interfering with a `let` declaration of the same name.

```javascript
function test() {
  let a = "hello";
  if (true) {
    var a = "goodbye"; // Throws SyntaxError: Identifier 'a' has already been declared
  }
}
```
*   **Why is it illegal?** The `var a` declaration is function-scoped, so it's conceptually "hoisted" to the top of the `test` function. However, the `let a` creates a block-scoped binding for `a`. The JavaScript engine detects this conflict during the initial parsing of the code and throws a `SyntaxError` because the `var` declaration would interfere with the block-scoped `let` declaration within the same function.

---

#### 67. Currying

**Currying** is a functional programming technique of transforming a function that takes multiple arguments into a sequence of nested functions, each taking a single argument. Instead of taking all arguments at once, the curried function takes the first argument and returns a new function that takes the second argument, and so on, until all arguments have been supplied.

**Simple Example:**
```javascript
// A non-curried function
const add = (a, b, c) => a + b + c;

// The same function, manually curried
const curriedAdd = (a) => {
  return (b) => {
    return (c) => {
      return a + b + c;
    };
  };
};

// Usage
console.log(add(1, 2, 3)); // 6

const add1 = curriedAdd(1);
const add1and2 = add1(2);
const result = add1and2(3);
console.log(result); // 6

// Or call it all at once
console.log(curriedAdd(1)(2)(3)); // 6
```

**Why is it useful?**
*   **Creating Specialized Functions:** Currying is excellent for creating specialized, reusable functions. In the example above, `add1` is a new function that will always add `1` to the next two numbers it receives.
*   **Function Composition:** It is a key concept that makes it easier to compose functions together.

**Generic `curry` function implementation:**
```javascript
function curry(fn) {
  return function curried(...args) {
    // If the number of arguments provided is enough for the original function
    if (args.length >= fn.length) {
      return fn.apply(this, args);
    } else {
      // Otherwise, return a new function that waits for the rest of the arguments
      return function(...args2) {
        return curried.apply(this, args.concat(args2));
      };
    }
  };
}

// Example with our generic curry function
const sum = (a, b, c) => a + b + c;
const curriedSum = curry(sum);

console.log(curriedSum(1, 2, 3)); // 6
console.log(curriedSum(1)(2, 3)); // 6
console.log(curriedSum(1)(2)(3)); // 6
```

---

#### 68. Specific Browser Page Lifecycle Events

While many events exist, these four are critical for understanding the lifecycle of a web page.

| Event | When It Fires | Common Use Case |
| :--- | :--- | :--- |
| **`DOMContentLoaded`** | After the initial HTML document has been completely loaded and parsed, **without** waiting for stylesheets, images, and subframes to finish loading. | The ideal time to run JavaScript that needs to manipulate the DOM, as you can be sure all elements are available. It's the most common event for starting up frameworks and running app logic. `$(document).ready()` in jQuery is similar. |
| **`load`** | After the whole page, including all dependent resources like stylesheets and images, has **fully loaded**. | Running code that depends on the properties of resources, like getting the dimensions of an image. Also used as a fallback if you need to be absolutely sure everything is available. |
| **`beforeunload`** | Immediately before the user is about to navigate away from the page (e.g., by closing the tab, clicking a link, or hitting refresh). | To show an "Are you sure you want to leave?" confirmation dialog if the user has unsaved changes. To trigger this dialog, you must return a string from the event listener. |
| **`unload`** | When the document or a child resource is being unloaded. It fires after `beforeunload`. | Historically used for sending analytics or logging data (e.g., via `navigator.sendBeacon()`). However, this event is unreliable, especially on mobile browsers, and is not guaranteed to fire. `beforeunload` or the Page Visibility API are often better choices. |

**Example:**
```javascript
// Fires as soon as the DOM tree is ready
window.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded and parsed');
  // Safe to manipulate the DOM here
});

// Fires after all images, CSS, etc., have loaded
window.addEventListener('load', () => {
  console.log('Page fully loaded');
  // Safe to check image dimensions here
});

// Fires when you try to leave the page
window.addEventListener('beforeunload', (event) => {
  // To trigger the confirmation prompt, you must call preventDefault
  event.preventDefault();
  // Most browsers no longer display a custom message for security reasons.
  // They show a generic message instead.
  event.returnValue = '';
});
```

---

#### 69. How a JavaScript Engine Works (High-Level)

The JavaScript engine is a program that executes JavaScript code. Every major browser has one (e.g., **V8** in Chrome and Node.js, **SpiderMonkey** in Firefox). While we write JS, the computer's processor only understands machine code. The engine's job is to translate our JS into machine code.

Here is a simplified overview of the process, focusing on a modern engine like V8:

1.  **Parsing:**
    *   The engine takes the raw JavaScript code as a string.
    *   The **Parser** reads the code token by token and checks it for correct syntax.
    *   If the syntax is valid, the parser produces an **Abstract Syntax Tree (AST)**. An AST is a tree-like structure that represents the grammatical structure of the code. Each node in the tree denotes a construct occurring in the code (e.g., a variable declaration, a function call).

2.  **Interpretation & Compilation:**
    *   The AST is passed to an **Interpreter**. The interpreter reads the AST and quickly generates unoptimized bytecode, which can be executed. This allows the code to start running almost immediately.
    *   While the interpreter is running, the engine's **Profiler** (also called a monitor) is watching the code. It identifies "hot" code—parts of the code that are run frequently, like a function inside a loop.

3.  **Just-In-Time (JIT) Compilation:**
    *   When a piece of code is marked as "hot," it is sent to the **Optimizing Compiler**.
    *   The compiler takes the bytecode and information from the profiler (e.g., what data types have been used in a function) and compiles it into highly optimized machine code. This machine code can be executed directly by the computer's CPU, making it much faster than interpreted bytecode.
    *   The engine may also perform **de-optimization**. If the assumptions made by the compiler turn out to be wrong (e.g., a function that was always called with numbers is suddenly called with a string), the engine will discard the optimized code and fall back to the interpreter.

**In summary, the pipeline is:**
**JS Code -> Parser -> AST -> Interpreter -> (Profiler finds hot spots) -> Optimizing Compiler -> Optimized Machine Code**

This combination of an interpreter (for fast startup) and a compiler (for optimizing frequently run code) is why this process is called **Just-In-Time (JIT) compilation**. It gives JavaScript performance that can rival more traditional compiled languages in many scenarios.
