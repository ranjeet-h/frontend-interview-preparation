# Output Questions – Part 3

> **Unique content.** Part 1 → [Output Questions – Part 1](output-questions.md). Part 2 → [Output Questions – Part 2](output-questions-2.md).
> Canonical theory → [Core Concepts](core-concepts.md).

This page adds a structured JavaScript output-based practice set with direct outputs and detailed explanations after every solution.

Each answer follows the same learning rhythm as the existing output-question chapters:

1. Read the code.
2. Predict the output before looking.
3. Check the expected output.
4. Read the explanation and interview takeaway.

---

## 1. Hoisting

**Question 1**

```javascript
console.log(a);
var a = 10;
```

**Output:**

```text
undefined
```

**Explanation:** `var` is hoisted and initialized with `undefined`; assignment happens later.

The key rule is that declarations are processed before execution, but initialization timing depends on `var`, `let`, `const`, function declarations, and function expressions.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 2**

```javascript
console.log(a);
let a = 10;
```

**Output:**

```text
ReferenceError
```

**Explanation:** `let` is hoisted but remains in the Temporal Dead Zone until declaration is evaluated.

The key rule is that declarations are processed before execution, but initialization timing depends on `var`, `let`, `const`, function declarations, and function expressions.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 3**

```javascript
console.log(a);
const a = 10;
```

**Output:**

```text
ReferenceError
```

**Explanation:** `const` also has TDZ, so it cannot be read before initialization.

The key rule is that declarations are processed before execution, but initialization timing depends on `var`, `let`, `const`, function declarations, and function expressions.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 4**

```javascript
foo();

function foo() {
  console.log("hello");
}
```

**Output:**

```text
hello
```

**Explanation:** Function declarations are hoisted with their body.

The key rule is that declarations are processed before execution, but initialization timing depends on `var`, `let`, `const`, function declarations, and function expressions.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 5**

```javascript
foo();

var foo = function () {
  console.log("hello");
};
```

**Output:**

```text
TypeError: foo is not a function
```

**Explanation:** Only the `var foo` declaration is hoisted as `undefined`; the function expression is assigned later.

The key rule is that declarations are processed before execution, but initialization timing depends on `var`, `let`, `const`, function declarations, and function expressions.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 6**

```javascript
console.log(foo);

function foo() {}

var foo = 10;
```

**Output:**

```text
[Function: foo]
```

**Explanation:** Function declaration is hoisted before execution; `var foo` does not overwrite it until assignment runs.

The key rule is that declarations are processed before execution, but initialization timing depends on `var`, `let`, `const`, function declarations, and function expressions.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 7**

```javascript
console.log(foo);

var foo = 10;

function foo() {}
```

**Output:**

```text
[Function: foo]
```

**Explanation:** Function declaration wins during creation phase; runtime assignment to `10` happens after the log.

The key rule is that declarations are processed before execution, but initialization timing depends on `var`, `let`, `const`, function declarations, and function expressions.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 8**

```javascript
var a = 1;

function test() {
  console.log(a);
  var a = 2;
}

test();
```

**Output:**

```text
undefined
```

**Explanation:** Local `var a` is hoisted inside `test`, shadowing global `a` before assignment.

The key rule is that declarations are processed before execution, but initialization timing depends on `var`, `let`, `const`, function declarations, and function expressions.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 9**

```javascript
let a = 1;

function test() {
  console.log(a);
  let a = 2;
}

test();
```

**Output:**

```text
ReferenceError
```

**Explanation:** Local `let a` shadows outer `a`, but it is in TDZ at the `console.log` line.

The key rule is that declarations are processed before execution, but initialization timing depends on `var`, `let`, `const`, function declarations, and function expressions.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 10**

```javascript
console.log(typeof a);
var a = 10;
```

**Output:**

```text
undefined
```

**Explanation:** `typeof` on a hoisted `var` sees initialized value `undefined`.

The key rule is that declarations are processed before execution, but initialization timing depends on `var`, `let`, `const`, function declarations, and function expressions.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 11**

```javascript
console.log(typeof a);
let a = 10;
```

**Output:**

```text
ReferenceError
```

**Explanation:** `typeof` does not bypass TDZ for `let`/`const` bindings.

The key rule is that declarations are processed before execution, but initialization timing depends on `var`, `let`, `const`, function declarations, and function expressions.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 2. Scope

**Question 12**

```javascript
var a = 10;

function test() {
  var a = 20;
  console.log(a);
}

test();
console.log(a);
```

**Output:**

```text
20
10
```

**Explanation:** Function-scoped `var a` inside `test` is separate from global `a`.

The key rule is that `var` is function-scoped while `let` and `const` are block-scoped, so the visible binding depends on where the code is executed.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 13**

```javascript
let a = 10;

{
  let a = 20;
  console.log(a);
}

console.log(a);
```

**Output:**

```text
20
10
```

**Explanation:** `let` is block-scoped, so inner and outer `a` are different bindings.

The key rule is that `var` is function-scoped while `let` and `const` are block-scoped, so the visible binding depends on where the code is executed.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 14**

```javascript
var a = 10;

{
  var a = 20;
  console.log(a);
}

console.log(a);
```

**Output:**

```text
20
20
```

**Explanation:** `var` is not block-scoped; the block assignment updates the same function/global binding.

The key rule is that `var` is function-scoped while `let` and `const` are block-scoped, so the visible binding depends on where the code is executed.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 15**

```javascript
function test() {
  if (true) {
    var a = 10;
  }

  console.log(a);
}

test();
```

**Output:**

```text
10
```

**Explanation:** `var` is function-scoped, so it is visible outside the `if` block.

The key rule is that `var` is function-scoped while `let` and `const` are block-scoped, so the visible binding depends on where the code is executed.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 16**

```javascript
function test() {
  if (true) {
    let a = 10;
  }

  console.log(a);
}

test();
```

**Output:**

```text
ReferenceError
```

**Explanation:** `let a` exists only inside the `if` block.

The key rule is that `var` is function-scoped while `let` and `const` are block-scoped, so the visible binding depends on where the code is executed.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 17**

```javascript
for (var i = 0; i < 3; i++) {}

console.log(i);
```

**Output:**

```text
3
```

**Explanation:** `var i` is function/global scoped and remains after the loop.

The key rule is that `var` is function-scoped while `let` and `const` are block-scoped, so the visible binding depends on where the code is executed.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 18**

```javascript
for (let i = 0; i < 3; i++) {}

console.log(i);
```

**Output:**

```text
ReferenceError
```

**Explanation:** `let i` is scoped to the loop.

The key rule is that `var` is function-scoped while `let` and `const` are block-scoped, so the visible binding depends on where the code is executed.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 3. Closures

**Question 19**

```javascript
function outer() {
  let count = 0;

  return function inner() {
    count++;
    console.log(count);
  };
}

const fn = outer();

fn();
fn();
fn();
```

**Output:**

```text
1
2
3
```

**Explanation:** `inner` closes over `count`, so the variable survives after `outer` returns.

The key rule is that functions remember the lexical environment where they were created, including variables that survive after the outer function returns.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 20**

```javascript
function createCounter() {
  let count = 0;

  return {
    increment() {
      count++;
      return count;
    },
    decrement() {
      count--;
      return count;
    },
  };
}

const counter = createCounter();

console.log(counter.increment());
console.log(counter.increment());
console.log(counter.decrement());
```

**Output:**

```text
1
2
1
```

**Explanation:** Both methods share the same closed-over `count` variable.

The key rule is that functions remember the lexical environment where they were created, including variables that survive after the outer function returns.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 21**

```javascript
for (var i = 0; i < 3; i++) {
  setTimeout(() => {
    console.log(i);
  }, 100);
}
```

**Output:**

```text
3
3
3
```

**Explanation:** All callbacks close over the same `var i`; after loop ends, `i` is `3`.

The key rule is that functions remember the lexical environment where they were created, including variables that survive after the outer function returns.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 22**

```javascript
for (let i = 0; i < 3; i++) {
  setTimeout(() => {
    console.log(i);
  }, 100);
}
```

**Output:**

```text
0
1
2
```

**Explanation:** `let` creates a new per-iteration binding for each callback.

The key rule is that functions remember the lexical environment where they were created, including variables that survive after the outer function returns.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 23**

```javascript
function test() {
  for (var i = 0; i < 3; i++) {
    function inner() {
      console.log(i);
    }

    inner();
  }
}

test();
```

**Output:**

```text
0
1
2
```

**Explanation:** `inner` is called immediately during each iteration before `i` changes again.

The key rule is that functions remember the lexical environment where they were created, including variables that survive after the outer function returns.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 24**

```javascript
function test() {
  let value = 10;

  return function () {
    console.log(value);
  };
}

const fn = test();
let value = 20;

fn();
```

**Output:**

```text
10
```

**Explanation:** The returned function closes over `test` function’s `value`, not the later outer `value`.

The key rule is that functions remember the lexical environment where they were created, including variables that survive after the outer function returns.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 25**

```javascript
function outer(x) {
  return function inner(y) {
    return x + y;
  };
}

const add5 = outer(5);

console.log(add5(10));
```

**Output:**

```text
15
```

**Explanation:** `add5` remembers `x = 5` and adds it to `y`.

The key rule is that functions remember the lexical environment where they were created, including variables that survive after the outer function returns.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 4. this Binding

**Question 26**

```javascript
const user = {
  name: "Ranjeet",
  printName() {
    console.log(this.name);
  },
};

user.printName();
```

**Output:**

```text
Ranjeet
```

**Explanation:** Method call sets `this` to the object before the dot.

The key rule is that regular function `this` is decided by the call site, while arrow functions capture lexical `this`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 27**

```javascript
const user = {
  name: "Ranjeet",
  printName() {
    console.log(this.name);
  },
};

const fn = user.printName;

fn();
```

**Output:**

```text
undefined
```

**Explanation:** The method is detached; in non-strict mode `this` becomes global object, where `name` is usually `undefined`.

The key rule is that regular function `this` is decided by the call site, while arrow functions capture lexical `this`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 28**

```javascript
"use strict";

const user = {
  name: "Ranjeet",
  printName() {
    console.log(this.name);
  },
};

const fn = user.printName;

fn();
```

**Output:**

```text
TypeError
```

**Explanation:** In strict mode, detached function call has `this === undefined`, so reading `this.name` fails.

The key rule is that regular function `this` is decided by the call site, while arrow functions capture lexical `this`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 29**

```javascript
const user = {
  name: "Ranjeet",
  printName: () => {
    console.log(this.name);
  },
};

user.printName();
```

**Output:**

```text
undefined
```

**Explanation:** Arrow functions do not bind `this`; they capture lexical `this`, not `user`.

The key rule is that regular function `this` is decided by the call site, while arrow functions capture lexical `this`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 30**

```javascript
const user = {
  name: "Ranjeet",
  printName() {
    const inner = () => {
      console.log(this.name);
    };

    inner();
  },
};

user.printName();
```

**Output:**

```text
Ranjeet
```

**Explanation:** Arrow `inner` captures `this` from `printName`, where `this` is `user`.

The key rule is that regular function `this` is decided by the call site, while arrow functions capture lexical `this`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 31**

```javascript
const user = {
  name: "Ranjeet",
  printName() {
    function inner() {
      console.log(this.name);
    }

    inner();
  },
};

user.printName();
```

**Output:**

```text
undefined
```

**Explanation:** Regular `inner()` is called as a plain function, so it does not inherit method `this`.

The key rule is that regular function `this` is decided by the call site, while arrow functions capture lexical `this`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 32**

```javascript
const user = {
  name: "Ranjeet",
};

function printName() {
  console.log(this.name);
}

printName.call(user);
```

**Output:**

```text
Ranjeet
```

**Explanation:** `call` invokes the function with explicit `this`.

The key rule is that regular function `this` is decided by the call site, while arrow functions capture lexical `this`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 33**

```javascript
const user = {
  name: "Ranjeet",
};

function printName(city, country) {
  console.log(this.name, city, country);
}

printName.apply(user, ["Pune", "India"]);
```

**Output:**

```text
Ranjeet Pune India
```

**Explanation:** `apply` sets `this` and passes arguments as an array.

The key rule is that regular function `this` is decided by the call site, while arrow functions capture lexical `this`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 34**

```javascript
const user = {
  name: "Ranjeet",
};

function printName() {
  console.log(this.name);
}

const fn = printName.bind(user);

fn();
```

**Output:**

```text
Ranjeet
```

**Explanation:** `bind` returns a new function permanently bound to `user`.

The key rule is that regular function `this` is decided by the call site, while arrow functions capture lexical `this`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 35**

```javascript
const obj = {
  name: "A",
  getName() {
    return this.name;
  },
};

const obj2 = {
  name: "B",
  getName: obj.getName,
};

console.log(obj2.getName());
```

**Output:**

```text
B
```

**Explanation:** The call site is `obj2.getName()`, so `this` is `obj2`.

The key rule is that regular function `this` is decided by the call site, while arrow functions capture lexical `this`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 5. Object References

**Question 36**

```javascript
const a = {};
const b = {};

console.log(a === b);
```

**Output:**

```text
false
```

**Explanation:** Two object literals create two different references.

The key rule is that objects and arrays are compared and assigned by reference; spread creates only a shallow copy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 37**

```javascript
const a = {};
const b = a;

console.log(a === b);
```

**Output:**

```text
true
```

**Explanation:** Both variables point to the same object.

The key rule is that objects and arrays are compared and assigned by reference; spread creates only a shallow copy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 38**

```javascript
const a = { name: "A" };
const b = a;

b.name = "B";

console.log(a.name);
```

**Output:**

```text
B
```

**Explanation:** Mutating through `b` changes the shared object referenced by `a`.

The key rule is that objects and arrays are compared and assigned by reference; spread creates only a shallow copy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 39**

```javascript
const a = { user: { name: "A" } };
const b = { ...a };

b.user.name = "B";

console.log(a.user.name);
```

**Output:**

```text
B
```

**Explanation:** Spread makes a shallow copy; nested `user` object is still shared.

The key rule is that objects and arrays are compared and assigned by reference; spread creates only a shallow copy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 40**

```javascript
const a = { name: "A" };
const b = { ...a };

b.name = "B";

console.log(a.name);
```

**Output:**

```text
A
```

**Explanation:** Top-level primitive property was copied, so changing `b.name` does not affect `a.name`.

The key rule is that objects and arrays are compared and assigned by reference; spread creates only a shallow copy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 41**

```javascript
const a = [1, 2, 3];
const b = a;

b.push(4);

console.log(a);
```

**Output:**

```text
[1, 2, 3, 4]
```

**Explanation:** Arrays are objects; both variables reference the same array.

The key rule is that objects and arrays are compared and assigned by reference; spread creates only a shallow copy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 42**

```javascript
const a = [1, 2, 3];
const b = [...a];

b.push(4);

console.log(a);
console.log(b);
```

**Output:**

```text
[1, 2, 3]
[1, 2, 3, 4]
```

**Explanation:** Array spread creates a new shallow array.

The key rule is that objects and arrays are compared and assigned by reference; spread creates only a shallow copy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 43**

```javascript
console.log({} == {});
console.log({} === {});
```

**Output:**

```text
false
false
```

**Explanation:** Object equality compares references, and these are different objects.

The key rule is that objects and arrays are compared and assigned by reference; spread creates only a shallow copy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 44**

```javascript
console.log([] == []);
console.log([] === []);
```

**Output:**

```text
false
false
```

**Explanation:** Array equality also compares references.

The key rule is that objects and arrays are compared and assigned by reference; spread creates only a shallow copy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 45**

```javascript
const obj = {
  a: 1,
  b: undefined,
};

console.log(JSON.stringify(obj));
```

**Output:**

```text
{"a":1}
```

**Explanation:** `JSON.stringify` omits object properties whose value is `undefined`.

The key rule is that objects and arrays are compared and assigned by reference; spread creates only a shallow copy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 6. Type Coercion

**Question 46**

```javascript
console.log(1 + "2");
```

**Output:**

```text
12
```

**Explanation:** `+` with a string performs string concatenation.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 47**

```javascript
console.log(1 - "2");
```

**Output:**

```text
-1
```

**Explanation:** `-` converts operands to numbers.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 48**

```javascript
console.log("5" * "2");
```

**Output:**

```text
10
```

**Explanation:** `*` converts strings to numbers.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 49**

```javascript
console.log("5" / "2");
```

**Output:**

```text
2.5
```

**Explanation:** `/` converts strings to numbers.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 50**

```javascript
console.log("5" + 2 + 3);
```

**Output:**

```text
523
```

**Explanation:** Evaluation is left-to-right; string concatenation starts at first `+`.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 51**

```javascript
console.log(2 + 3 + "5");
```

**Output:**

```text
55
```

**Explanation:** `2 + 3` is numeric `5`, then string concatenation gives `"55"`.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 52**

```javascript
console.log(true + true);
```

**Output:**

```text
2
```

**Explanation:** Booleans convert to numbers: `true` is `1`.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 53**

```javascript
console.log(true + false);
```

**Output:**

```text
1
```

**Explanation:** `true` is `1`, `false` is `0`.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 54**

```javascript
console.log(false + false);
```

**Output:**

```text
0
```

**Explanation:** Both `false` values become `0`.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 55**

```javascript
console.log(null + 1);
```

**Output:**

```text
1
```

**Explanation:** `null` converts to `0` in numeric addition.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 56**

```javascript
console.log(undefined + 1);
```

**Output:**

```text
NaN
```

**Explanation:** `undefined` converts to `NaN` in numeric contexts.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 57**

```javascript
console.log([] + []);
```

**Output:**

```text

```

**Explanation:** Both arrays become empty strings, then concatenate.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 58**

```javascript
console.log([] + {});
```

**Output:**

```text
[object Object]
```

**Explanation:** `[]` becomes `""`; `{}` becomes `"[object Object]"` in expression context.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 59**

```javascript
console.log({} + []);
```

**Output:**

```text
[object Object]
```

**Explanation:** Inside `console.log`, `{}` is an object expression, so object plus array becomes string coercion.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 60**

```javascript
console.log([1, 2] + [3, 4]);
```

**Output:**

```text
1,23,4
```

**Explanation:** Arrays stringify to comma-joined strings before `+` concatenation.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 61**

```javascript
console.log("10" - - "5");
```

**Output:**

```text
15
```

**Explanation:** Unary minus converts `"5"` to `-5`; `10 - (-5)` is `15`.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 62**

```javascript
console.log("10" + - "5");
```

**Output:**

```text
10-5
```

**Explanation:** Unary minus creates number `-5`; string `+` concatenates.

The key rule is that JavaScript operators trigger different coercion paths: `+` may concatenate strings, while arithmetic operators usually coerce to numbers.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 7. Equality

**Question 63**

```javascript
console.log(0 == false);
console.log(0 === false);
```

**Output:**

```text
true
false
```

**Explanation:** Loose equality coerces `false` to `0`; strict equality checks type too.

The key rule is that `==` performs coercion, `===` avoids coercion, and `Object.is` handles special cases like `NaN` and signed zero differently.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 64**

```javascript
console.log("" == false);
console.log("" === false);
```

**Output:**

```text
true
false
```

**Explanation:** Loose equality converts both to `0`; strict equality does not coerce.

The key rule is that `==` performs coercion, `===` avoids coercion, and `Object.is` handles special cases like `NaN` and signed zero differently.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 65**

```javascript
console.log(null == undefined);
console.log(null === undefined);
```

**Output:**

```text
true
false
```

**Explanation:** `null` and `undefined` are only loosely equal to each other.

The key rule is that `==` performs coercion, `===` avoids coercion, and `Object.is` handles special cases like `NaN` and signed zero differently.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 66**

```javascript
console.log([] == false);
```

**Output:**

```text
true
```

**Explanation:** `[]` becomes `""`, then `0`; `false` becomes `0`.

The key rule is that `==` performs coercion, `===` avoids coercion, and `Object.is` handles special cases like `NaN` and signed zero differently.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 67**

```javascript
console.log([] == ![]);
```

**Output:**

```text
true
```

**Explanation:** `![]` is `false`; then `[] == false` is `true`.

The key rule is that `==` performs coercion, `===` avoids coercion, and `Object.is` handles special cases like `NaN` and signed zero differently.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 68**

```javascript
console.log([1] == 1);
```

**Output:**

```text
true
```

**Explanation:** `[1]` becomes `"1"`, then number `1`.

The key rule is that `==` performs coercion, `===` avoids coercion, and `Object.is` handles special cases like `NaN` and signed zero differently.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 69**

```javascript
console.log(["1"] == 1);
```

**Output:**

```text
true
```

**Explanation:** `["1"]` stringifies to `"1"`, then numeric comparison.

The key rule is that `==` performs coercion, `===` avoids coercion, and `Object.is` handles special cases like `NaN` and signed zero differently.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 70**

```javascript
console.log([1, 2] == "1,2");
```

**Output:**

```text
true
```

**Explanation:** Array stringifies to `"1,2"`.

The key rule is that `==` performs coercion, `===` avoids coercion, and `Object.is` handles special cases like `NaN` and signed zero differently.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 71**

```javascript
console.log(NaN == NaN);
console.log(NaN === NaN);
console.log(Object.is(NaN, NaN));
```

**Output:**

```text
false
false
true
```

**Explanation:** `NaN` is not equal to itself with `==` or `===`; `Object.is` handles it.

The key rule is that `==` performs coercion, `===` avoids coercion, and `Object.is` handles special cases like `NaN` and signed zero differently.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 72**

```javascript
console.log(+0 === -0);
console.log(Object.is(+0, -0));
```

**Output:**

```text
true
false
```

**Explanation:** Strict equality treats signed zero as equal; `Object.is` distinguishes them.

The key rule is that `==` performs coercion, `===` avoids coercion, and `Object.is` handles special cases like `NaN` and signed zero differently.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 73**

```javascript
console.log(false == "0");
```

**Output:**

```text
true
```

**Explanation:** Both convert to number `0`.

The key rule is that `==` performs coercion, `===` avoids coercion, and `Object.is` handles special cases like `NaN` and signed zero differently.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 74**

```javascript
console.log(false == []);
```

**Output:**

```text
true
```

**Explanation:** `[]` becomes `0`; `false` becomes `0`.

The key rule is that `==` performs coercion, `===` avoids coercion, and `Object.is` handles special cases like `NaN` and signed zero differently.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 75**

```javascript
console.log(false == {});
```

**Output:**

```text
false
```

**Explanation:** `{}` becomes `NaN` when compared numerically with `false`.

The key rule is that `==` performs coercion, `===` avoids coercion, and `Object.is` handles special cases like `NaN` and signed zero differently.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 8. Truthy/Falsy

**Question 76**

```javascript
if ("false") {
  console.log("yes");
} else {
  console.log("no");
}
```

**Output:**

```text
yes
```

**Explanation:** Any non-empty string is truthy, even `"false"`.

The key rule is that conditionals use truthiness, where only a small fixed set of values are falsy and all objects are truthy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 77**

```javascript
if ("") {
  console.log("yes");
} else {
  console.log("no");
}
```

**Output:**

```text
no
```

**Explanation:** Empty string is falsy.

The key rule is that conditionals use truthiness, where only a small fixed set of values are falsy and all objects are truthy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 78**

```javascript
if ([]) {
  console.log("yes");
} else {
  console.log("no");
}
```

**Output:**

```text
yes
```

**Explanation:** Arrays are objects, and all objects are truthy.

The key rule is that conditionals use truthiness, where only a small fixed set of values are falsy and all objects are truthy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 79**

```javascript
if ({}) {
  console.log("yes");
} else {
  console.log("no");
}
```

**Output:**

```text
yes
```

**Explanation:** Objects are truthy, even when empty.

The key rule is that conditionals use truthiness, where only a small fixed set of values are falsy and all objects are truthy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 80**

```javascript
console.log(Boolean("0"));
```

**Output:**

```text
true
```

**Explanation:** Non-empty strings are truthy.

The key rule is that conditionals use truthiness, where only a small fixed set of values are falsy and all objects are truthy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 81**

```javascript
console.log(Boolean("false"));
```

**Output:**

```text
true
```

**Explanation:** `"false"` is still a non-empty string.

The key rule is that conditionals use truthiness, where only a small fixed set of values are falsy and all objects are truthy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 82**

```javascript
console.log(Boolean([]));
```

**Output:**

```text
true
```

**Explanation:** Arrays are truthy objects.

The key rule is that conditionals use truthiness, where only a small fixed set of values are falsy and all objects are truthy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 83**

```javascript
console.log(Boolean({}));
```

**Output:**

```text
true
```

**Explanation:** Objects are truthy.

The key rule is that conditionals use truthiness, where only a small fixed set of values are falsy and all objects are truthy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 84**

```javascript
console.log(Boolean(null));
```

**Output:**

```text
false
```

**Explanation:** `null` is falsy.

The key rule is that conditionals use truthiness, where only a small fixed set of values are falsy and all objects are truthy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 85**

```javascript
console.log(Boolean(undefined));
```

**Output:**

```text
false
```

**Explanation:** `undefined` is falsy.

The key rule is that conditionals use truthiness, where only a small fixed set of values are falsy and all objects are truthy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 86**

```javascript
console.log(Boolean(NaN));
```

**Output:**

```text
false
```

**Explanation:** `NaN` is falsy.

The key rule is that conditionals use truthiness, where only a small fixed set of values are falsy and all objects are truthy.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 9. || vs ??

**Question 87**

```javascript
console.log(0 || 10);
console.log(0 ?? 10);
```

**Output:**

```text
10
0
```

**Explanation:** `||` falls back on any falsy value; `??` falls back only on `null` or `undefined`.

The key rule is that `||` falls back for any falsy value, while `??` falls back only for `null` or `undefined`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 88**

```javascript
console.log("" || "default");
console.log("" ?? "default");
```

**Output:**

```text
default
```

**Explanation:** Empty string is falsy for `||`, but not nullish for `??`.

The key rule is that `||` falls back for any falsy value, while `??` falls back only for `null` or `undefined`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 89**

```javascript
console.log(null || "default");
console.log(null ?? "default");
```

**Output:**

```text
default
default
```

**Explanation:** Both operators fall back for `null`.

The key rule is that `||` falls back for any falsy value, while `??` falls back only for `null` or `undefined`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 90**

```javascript
console.log(undefined || "default");
console.log(undefined ?? "default");
```

**Output:**

```text
default
default
```

**Explanation:** Both operators fall back for `undefined`.

The key rule is that `||` falls back for any falsy value, while `??` falls back only for `null` or `undefined`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 91**

```javascript
console.log(false || true);
console.log(false ?? true);
```

**Output:**

```text
true
false
```

**Explanation:** `false` is falsy but not nullish.

The key rule is that `||` falls back for any falsy value, while `??` falls back only for `null` or `undefined`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 92**

```javascript
const value = NaN;

console.log(value || 100);
console.log(value ?? 100);
```

**Output:**

```text
100
NaN
```

**Explanation:** `NaN` is falsy but not `null` or `undefined`.

The key rule is that `||` falls back for any falsy value, while `??` falls back only for `null` or `undefined`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 10. Optional Chaining

**Question 93**

```javascript
const user = {
  profile: {
    name: "Ranjeet",
  },
};

console.log(user.profile.name);
```

**Output:**

```text
Ranjeet
```

**Explanation:** All properties exist.

The key rule is that optional chaining stops only when the value immediately before `?.` is `null` or `undefined`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 94**

```javascript
const user = {};

console.log(user.profile.name);
```

**Output:**

```text
TypeError
```

**Explanation:** `user.profile` is `undefined`; reading `.name` from it throws.

The key rule is that optional chaining stops only when the value immediately before `?.` is `null` or `undefined`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 95**

```javascript
const user = {};

console.log(user.profile?.name);
```

**Output:**

```text
undefined
```

**Explanation:** Optional chaining stops when the left side is `null` or `undefined`.

The key rule is that optional chaining stops only when the value immediately before `?.` is `null` or `undefined`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 96**

```javascript
const user = {
  getName() {
    return "Ranjeet";
  },
};

console.log(user.getName?.());
```

**Output:**

```text
Ranjeet
```

**Explanation:** Function exists, so optional call invokes it.

The key rule is that optional chaining stops only when the value immediately before `?.` is `null` or `undefined`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 97**

```javascript
const user = {};

console.log(user.getName?.());
```

**Output:**

```text
undefined
```

**Explanation:** Optional call returns `undefined` when function is missing.

The key rule is that optional chaining stops only when the value immediately before `?.` is `null` or `undefined`.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 11. Arrays

**Question 98**

```javascript
const arr = [1, 2, 3];

arr.push(4);

console.log(arr);
```

**Output:**

```text
[1, 2, 3, 4]
```

**Explanation:** `push` mutates the original array.

The key rule is to know which array methods mutate and which return new values, because this affects React state and frontend bugs.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 99**

```javascript
const arr = [1, 2, 3];

const result = arr.map((x) => x * 2);

console.log(arr);
console.log(result);
```

**Output:**

```text
[1, 2, 3]
[2, 4, 6]
```

**Explanation:** `map` returns a new array and does not mutate the original.

The key rule is to know which array methods mutate and which return new values, because this affects React state and frontend bugs.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 100**

```javascript
const arr = [1, 2, 3];

const result = arr.forEach((x) => x * 2);

console.log(result);
```

**Output:**

```text
undefined
```

**Explanation:** `forEach` returns `undefined`; it is for side effects.

The key rule is to know which array methods mutate and which return new values, because this affects React state and frontend bugs.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 101**

```javascript
const arr = [1, 2, 3, 4];

const result = arr.filter((x) => x > 2);

console.log(result);
```

**Output:**

```text
[3, 4]
```

**Explanation:** `filter` returns elements where callback is truthy.

The key rule is to know which array methods mutate and which return new values, because this affects React state and frontend bugs.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 102**

```javascript
const arr = [1, 2, 3, 4];

const result = arr.reduce((acc, curr) => acc + curr, 0);

console.log(result);
```

**Output:**

```text
10
```

**Explanation:** `reduce` accumulates values into one result.

The key rule is to know which array methods mutate and which return new values, because this affects React state and frontend bugs.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 103**

```javascript
const arr = [10, 20, 30];

console.log(arr[5]);
```

**Output:**

```text
undefined
```

**Explanation:** Out-of-range array access returns `undefined`.

The key rule is to know which array methods mutate and which return new values, because this affects React state and frontend bugs.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 104**

```javascript
const arr = [1, 2, 3];

arr.length = 1;

console.log(arr);
```

**Output:**

```text
[1]
```

**Explanation:** Reducing `length` truncates the array.

The key rule is to know which array methods mutate and which return new values, because this affects React state and frontend bugs.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 105**

```javascript
const arr = [1, 2, 3];

delete arr[1];

console.log(arr);
console.log(arr.length);
```

**Output:**

```text
[1, empty, 3]
3
```

**Explanation:** `delete` creates a hole and does not change length.

The key rule is to know which array methods mutate and which return new values, because this affects React state and frontend bugs.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 106**

```javascript
const arr = [1, 2, 3];

console.log(arr.slice(1));
console.log(arr);
```

**Output:**

```text
[2, 3]
[1, 2, 3]
```

**Explanation:** `slice` returns a copy and does not mutate.

The key rule is to know which array methods mutate and which return new values, because this affects React state and frontend bugs.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 107**

```javascript
const arr = [1, 2, 3];

console.log(arr.splice(1, 1));
console.log(arr);
```

**Output:**

```text
[2]
[1, 3]
```

**Explanation:** `splice` mutates and returns removed items.

The key rule is to know which array methods mutate and which return new values, because this affects React state and frontend bugs.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 108**

```javascript
const arr = [10, 5, 20, 1];

arr.sort();

console.log(arr);
```

**Output:**

```text
[1, 10, 20, 5]
```

**Explanation:** Default `sort` compares strings, not numbers.

The key rule is to know which array methods mutate and which return new values, because this affects React state and frontend bugs.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 109**

```javascript
const arr = [10, 5, 20, 1];

arr.sort((a, b) => a - b);

console.log(arr);
```

**Output:**

```text
[1, 5, 10, 20]
```

**Explanation:** Numeric comparator sorts ascending.

The key rule is to know which array methods mutate and which return new values, because this affects React state and frontend bugs.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 110**

```javascript
const arr = [1, 2, 3];

const result = arr.reverse();

console.log(arr);
console.log(result);
```

**Output:**

```text
[3, 2, 1]
[3, 2, 1]
```

**Explanation:** `reverse` mutates the array and returns the same array reference.

The key rule is to know which array methods mutate and which return new values, because this affects React state and frontend bugs.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 12. Strings

**Question 111**

```javascript
const str = "hello";

str[0] = "H";

console.log(str);
```

**Output:**

```text
hello
```

**Explanation:** Strings are immutable; character assignment has no effect.

The key rule is that strings are immutable; string methods return new values instead of changing the original string.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 112**

```javascript
console.log("hello".charAt(1));
```

**Output:**

```text
e
```

**Explanation:** Index `1` is the second character.

The key rule is that strings are immutable; string methods return new values instead of changing the original string.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 113**

```javascript
console.log("hello".slice(1, 4));
```

**Output:**

```text
ell
```

**Explanation:** `slice(1,4)` returns characters at indexes 1,2,3.

The key rule is that strings are immutable; string methods return new values instead of changing the original string.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 114**

```javascript
console.log("hello".substring(1, 4));
```

**Output:**

```text
ell
```

**Explanation:** For positive indexes here, `substring` behaves like `slice`.

The key rule is that strings are immutable; string methods return new values instead of changing the original string.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 115**

```javascript
console.log("hello".includes("ll"));
```

**Output:**

```text
true
```

**Explanation:** `includes` checks substring presence.

The key rule is that strings are immutable; string methods return new values instead of changing the original string.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 116**

```javascript
console.log("hello".split(""));
```

**Output:**

```text
["h", "e", "l", "l", "o"]
```

**Explanation:** Splitting on empty string returns characters.

The key rule is that strings are immutable; string methods return new values instead of changing the original string.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 117**

```javascript
console.log(" hello ".trim());
```

**Output:**

```text
hello
```

**Explanation:** `trim` removes leading and trailing whitespace.

The key rule is that strings are immutable; string methods return new values instead of changing the original string.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 13. Numbers

**Question 118**

```javascript
console.log(0.1 + 0.2);
```

**Output:**

```text
0.30000000000000004
```

**Explanation:** Floating-point binary representation cannot store some decimals exactly.

The key rule is that JavaScript uses IEEE-754 floating-point numbers, so numeric parsing and decimal precision have edge cases.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 119**

```javascript
console.log(0.1 + 0.2 === 0.3);
```

**Output:**

```text
false
```

**Explanation:** The actual sum is not exactly `0.3`.

The key rule is that JavaScript uses IEEE-754 floating-point numbers, so numeric parsing and decimal precision have edge cases.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 120**

```javascript
console.log(Number("10"));
```

**Output:**

```text
10
```

**Explanation:** Valid numeric string converts to number.

The key rule is that JavaScript uses IEEE-754 floating-point numbers, so numeric parsing and decimal precision have edge cases.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 121**

```javascript
console.log(Number(""));
```

**Output:**

```text
0
```

**Explanation:** Empty string converts to `0`.

The key rule is that JavaScript uses IEEE-754 floating-point numbers, so numeric parsing and decimal precision have edge cases.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 122**

```javascript
console.log(Number(null));
```

**Output:**

```text
0
```

**Explanation:** `null` converts to `0`.

The key rule is that JavaScript uses IEEE-754 floating-point numbers, so numeric parsing and decimal precision have edge cases.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 123**

```javascript
console.log(Number(undefined));
```

**Output:**

```text
NaN
```

**Explanation:** `undefined` converts to `NaN`.

The key rule is that JavaScript uses IEEE-754 floating-point numbers, so numeric parsing and decimal precision have edge cases.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 124**

```javascript
console.log(parseInt("10px"));
```

**Output:**

```text
10
```

**Explanation:** `parseInt` reads leading integer characters.

The key rule is that JavaScript uses IEEE-754 floating-point numbers, so numeric parsing and decimal precision have edge cases.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 125**

```javascript
console.log(Number("10px"));
```

**Output:**

```text
NaN
```

**Explanation:** `Number` requires the whole string to be numeric.

The key rule is that JavaScript uses IEEE-754 floating-point numbers, so numeric parsing and decimal precision have edge cases.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 126**

```javascript
console.log(parseInt("08"));
```

**Output:**

```text
8
```

**Explanation:** Modern JS parses this as decimal 8.

The key rule is that JavaScript uses IEEE-754 floating-point numbers, so numeric parsing and decimal precision have edge cases.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 127**

```javascript
console.log(Math.max());
```

**Output:**

```text
-Infinity
```

**Explanation:** No arguments means max starts from `-Infinity`.

The key rule is that JavaScript uses IEEE-754 floating-point numbers, so numeric parsing and decimal precision have edge cases.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 128**

```javascript
console.log(Math.min());
```

**Output:**

```text
Infinity
```

**Explanation:** No arguments means min starts from `Infinity`.

The key rule is that JavaScript uses IEEE-754 floating-point numbers, so numeric parsing and decimal precision have edge cases.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 14. Functions

**Question 129**

```javascript
function test(a, b) {
  console.log(a, b);
}

test(1);
```

**Output:**

```text
1 undefined
```

**Explanation:** Missing arguments become `undefined`.

The key rule is that parameters, rest arguments, `arguments`, arrow functions, and `return` syntax all have separate runtime behavior.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 130**

```javascript
function test(a = 10) {
  console.log(a);
}

test();
test(undefined);
test(null);
```

**Output:**

```text
10
10
null
```

**Explanation:** Default parameters apply only when the argument is `undefined`, not `null`.

The key rule is that parameters, rest arguments, `arguments`, arrow functions, and `return` syntax all have separate runtime behavior.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 131**

```javascript
function test(...args) {
  console.log(args);
}

test(1, 2, 3);
```

**Output:**

```text
[1, 2, 3]
```

**Explanation:** Rest parameters collect arguments into a real array.

The key rule is that parameters, rest arguments, `arguments`, arrow functions, and `return` syntax all have separate runtime behavior.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 132**

```javascript
function test(a, ...rest) {
  console.log(a);
  console.log(rest);
}

test(1, 2, 3);
```

**Output:**

```text
1
[2, 3]
```

**Explanation:** First argument goes to `a`; remaining arguments go into `rest`.

The key rule is that parameters, rest arguments, `arguments`, arrow functions, and `return` syntax all have separate runtime behavior.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 133**

```javascript
function test() {
  console.log(arguments);
}

test(1, 2, 3);
```

**Output:**

```text
Arguments(3) [1, 2, 3]
```

**Explanation:** Regular functions have an `arguments` object.

The key rule is that parameters, rest arguments, `arguments`, arrow functions, and `return` syntax all have separate runtime behavior.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 134**

```javascript
const test = () => {
  console.log(arguments);
};

test(1, 2, 3);
```

**Output:**

```text
ReferenceError
```

**Explanation:** Arrow functions do not have their own `arguments`; in browser/module scope this is not defined.

The key rule is that parameters, rest arguments, `arguments`, arrow functions, and `return` syntax all have separate runtime behavior.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 135**

```javascript
function test() {
  return;
  {
    name: "Ranjeet";
  }
}

console.log(test());
```

**Output:**

```text
undefined
```

**Explanation:** Automatic semicolon insertion ends `return` before the object-like block.

The key rule is that parameters, rest arguments, `arguments`, arrow functions, and `return` syntax all have separate runtime behavior.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 136**

```javascript
function test() {
  return {
    name: "Ranjeet",
  };
}

console.log(test());
```

**Output:**

```text
{ name: "Ranjeet" }
```

**Explanation:** Object is on the same return statement, so it is returned.

The key rule is that parameters, rest arguments, `arguments`, arrow functions, and `return` syntax all have separate runtime behavior.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 15. Event Loop

**Question 137**

```javascript
console.log("A");

setTimeout(() => console.log("B"), 0);

console.log("C");
```

**Output:**

```text
A
C
B
```

**Explanation:** Synchronous code runs first; timer callback runs later as a macrotask.

The key rule is execution order: synchronous code runs first, microtasks run next, and macrotasks such as timers run after microtasks drain.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 138**

```javascript
console.log("A");

Promise.resolve().then(() => console.log("B"));

console.log("C");
```

**Output:**

```text
A
C
B
```

**Explanation:** Promise callbacks run as microtasks after sync code.

The key rule is execution order: synchronous code runs first, microtasks run next, and macrotasks such as timers run after microtasks drain.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 139**

```javascript
console.log("A");

setTimeout(() => console.log("B"), 0);

Promise.resolve().then(() => console.log("C"));

console.log("D");
```

**Output:**

```text
A
D
C
B
```

**Explanation:** Microtasks run before timers.

The key rule is execution order: synchronous code runs first, microtasks run next, and macrotasks such as timers run after microtasks drain.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 140**

```javascript
setTimeout(() => console.log("timeout"), 0);

Promise.resolve().then(() => console.log("promise"));

console.log("sync");
```

**Output:**

```text
sync
promise
timeout
```

**Explanation:** Sync first, microtask second, macrotask third.

The key rule is execution order: synchronous code runs first, microtasks run next, and macrotasks such as timers run after microtasks drain.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 141**

```javascript
console.log("start");

setTimeout(() => {
  console.log("timeout");
}, 0);

Promise.resolve()
  .then(() => {
    console.log("promise 1");
  })
  .then(() => {
    console.log("promise 2");
  });

console.log("end");
```

**Output:**

```text
start
end
promise 1
promise 2
timeout
```

**Explanation:** Promise chain microtasks drain before timer callback.

The key rule is execution order: synchronous code runs first, microtasks run next, and macrotasks such as timers run after microtasks drain.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 142**

```javascript
console.log("start");

setTimeout(() => {
  console.log("timeout 1");
}, 0);

setTimeout(() => {
  console.log("timeout 2");
}, 0);

Promise.resolve().then(() => {
  console.log("promise 1");
});

Promise.resolve().then(() => {
  console.log("promise 2");
});

console.log("end");
```

**Output:**

```text
start
end
promise 1
promise 2
timeout 1
timeout 2
```

**Explanation:** Timers are queued in order, but all microtasks run before timers.

The key rule is execution order: synchronous code runs first, microtasks run next, and macrotasks such as timers run after microtasks drain.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 143**

```javascript
console.log("start");

setTimeout(() => {
  console.log("timeout");
}, 0);

Promise.resolve().then(() => {
  console.log("promise");

  setTimeout(() => {
    console.log("nested timeout");
  }, 0);
});

console.log("end");
```

**Output:**

```text
start
end
promise
timeout
nested timeout
```

**Explanation:** Nested timer is scheduled during microtask, after the first timer was already queued.

The key rule is execution order: synchronous code runs first, microtasks run next, and macrotasks such as timers run after microtasks drain.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 16. Async/Await

**Question 144**

```javascript
async function test() {
  return "hello";
}

console.log(test());
```

**Output:**

```text
Promise { "hello" }
```

**Explanation:** Async functions always return a Promise.

The key rule is that `async` always returns a Promise and code after `await` resumes later in the microtask queue.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 145**

```javascript
async function test() {
  return "hello";
}

test().then(console.log);
```

**Output:**

```text
hello
```

**Explanation:** Resolved async return value is received in `.then`.

The key rule is that `async` always returns a Promise and code after `await` resumes later in the microtask queue.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 146**

```javascript
async function test() {
  console.log("A");
  await Promise.resolve();
  console.log("B");
}

console.log("C");
test();
console.log("D");
```

**Output:**

```text
C
A
D
B
```

**Explanation:** Code before `await` is sync; after `await` resumes in a microtask.

The key rule is that `async` always returns a Promise and code after `await` resumes later in the microtask queue.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 147**

```javascript
async function test() {
  console.log("A");
  await null;
  console.log("B");
}

console.log("C");
test();
console.log("D");
```

**Output:**

```text
C
A
D
B
```

**Explanation:** `await` wraps non-Promise values and still yields to microtask queue.

The key rule is that `async` always returns a Promise and code after `await` resumes later in the microtask queue.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 148**

```javascript
console.log("start");

async function test() {
  console.log("inside");
  await Promise.resolve();
  console.log("after await");
}

test();

console.log("end");
```

**Output:**

```text
start
inside
end
after await
```

**Explanation:** After `await` runs asynchronously after sync code completes.

The key rule is that `async` always returns a Promise and code after `await` resumes later in the microtask queue.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 149**

```javascript
async function test() {
  throw new Error("failed");
}

test()
  .then(() => console.log("success"))
  .catch(() => console.log("error"));
```

**Output:**

```text
error
```

**Explanation:** Throwing inside async function rejects its returned Promise.

The key rule is that `async` always returns a Promise and code after `await` resumes later in the microtask queue.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 150**

```javascript
async function test() {
  return Promise.resolve("done");
}

test().then(console.log);
```

**Output:**

```text
done
```

**Explanation:** Async function adopts the returned Promise result.

The key rule is that `async` always returns a Promise and code after `await` resumes later in the microtask queue.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 151**

```javascript
async function test() {
  return Promise.reject("failed");
}

test()
  .then(console.log)
  .catch(console.log);
```

**Output:**

```text
failed
```

**Explanation:** Returning a rejected Promise makes the async function reject.

The key rule is that `async` always returns a Promise and code after `await` resumes later in the microtask queue.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 17. Promises

**Question 152**

```javascript
const promise = new Promise((resolve, reject) => {
  console.log("A");
  resolve("B");
});

promise.then(console.log);

console.log("C");
```

**Output:**

```text
A
C
B
```

**Explanation:** Promise executor runs synchronously; `.then` callback runs as microtask.

The key rule is that Promise executors run synchronously, while `.then`, `.catch`, and `.finally` callbacks run as microtasks.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 153**

```javascript
Promise.resolve()
  .then(() => {
    console.log("A");
  })
  .then(() => {
    console.log("B");
  });

console.log("C");
```

**Output:**

```text
C
A
B
```

**Explanation:** Synchronous log first, then chained microtasks in order.

The key rule is that Promise executors run synchronously, while `.then`, `.catch`, and `.finally` callbacks run as microtasks.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 154**

```javascript
Promise.resolve()
  .then(() => {
    console.log("A");
    throw new Error("failed");
  })
  .then(() => {
    console.log("B");
  })
  .catch(() => {
    console.log("C");
  });
```

**Output:**

```text
A
C
```

**Explanation:** Throw rejects the chain, skips next `.then`, and jumps to `.catch`.

The key rule is that Promise executors run synchronously, while `.then`, `.catch`, and `.finally` callbacks run as microtasks.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 155**

```javascript
Promise.resolve()
  .then(() => {
    throw new Error("failed");
  })
  .catch(() => {
    console.log("catch");
  })
  .then(() => {
    console.log("then");
  });
```

**Output:**

```text
catch
then
```

**Explanation:** A `.catch` that does not throw returns a fulfilled Promise, so next `.then` runs.

The key rule is that Promise executors run synchronously, while `.then`, `.catch`, and `.finally` callbacks run as microtasks.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 156**

```javascript
Promise.reject("error")
  .then(() => {
    console.log("then");
  })
  .catch((err) => {
    console.log(err);
  });
```

**Output:**

```text
error
```

**Explanation:** Rejected Promise skips `.then` and goes to `.catch`.

The key rule is that Promise executors run synchronously, while `.then`, `.catch`, and `.finally` callbacks run as microtasks.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 157**

```javascript
Promise.resolve("A")
  .finally(() => {
    console.log("finally");
  })
  .then((value) => {
    console.log(value);
  });
```

**Output:**

```text
finally
A
```

**Explanation:** `finally` runs but passes through the original fulfillment value.

The key rule is that Promise executors run synchronously, while `.then`, `.catch`, and `.finally` callbacks run as microtasks.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 158**

```javascript
Promise.resolve("A")
  .finally(() => {
    return "B";
  })
  .then((value) => {
    console.log(value);
  });
```

**Output:**

```text
A
```

**Explanation:** Returning a normal value from `finally` does not replace original value.

The key rule is that Promise executors run synchronously, while `.then`, `.catch`, and `.finally` callbacks run as microtasks.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 159**

```javascript
Promise.resolve("A")
  .then((value) => {
    console.log(value);
    return "B";
  })
  .then((value) => {
    console.log(value);
  });
```

**Output:**

```text
A
B
```

**Explanation:** Returned value from a `.then` becomes next `.then` value.

The key rule is that Promise executors run synchronously, while `.then`, `.catch`, and `.finally` callbacks run as microtasks.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 160**

```javascript
Promise.resolve("A")
  .then((value) => {
    console.log(value);
    return Promise.resolve("B");
  })
  .then((value) => {
    console.log(value);
  });
```

**Output:**

```text
A
B
```

**Explanation:** Returning a Promise makes the chain wait for it.

The key rule is that Promise executors run synchronously, while `.then`, `.catch`, and `.finally` callbacks run as microtasks.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 18. Promise Combinators

**Question 161**

```javascript
Promise.all([
  Promise.resolve(1),
  Promise.resolve(2),
  Promise.resolve(3),
]).then(console.log);
```

**Output:**

```text
[1, 2, 3]
```

**Explanation:** `Promise.all` fulfills with values in input order when all fulfill.

The key rule is that each combinator has different success/failure semantics: all, allSettled, race, and any solve different async coordination problems.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 162**

```javascript
Promise.all([
  Promise.resolve(1),
  Promise.reject("error"),
  Promise.resolve(3),
])
  .then(console.log)
  .catch(console.log);
```

**Output:**

```text
error
```

**Explanation:** `Promise.all` rejects immediately on first rejection.

The key rule is that each combinator has different success/failure semantics: all, allSettled, race, and any solve different async coordination problems.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 163**

```javascript
Promise.allSettled([
  Promise.resolve(1),
  Promise.reject("error"),
]).then(console.log);
```

**Output:**

```text
[{ status: "fulfilled", value: 1 }, { status: "rejected", reason: "error" }]
```

**Explanation:** `allSettled` waits for every Promise and reports each status.

The key rule is that each combinator has different success/failure semantics: all, allSettled, race, and any solve different async coordination problems.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 164**

```javascript
Promise.race([
  new Promise((resolve) => setTimeout(() => resolve("A"), 100)),
  new Promise((resolve) => setTimeout(() => resolve("B"), 50)),
]).then(console.log);
```

**Output:**

```text
B
```

**Explanation:** `race` settles with the first Promise to settle.

The key rule is that each combinator has different success/failure semantics: all, allSettled, race, and any solve different async coordination problems.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 165**

```javascript
Promise.any([
  Promise.reject("A"),
  Promise.resolve("B"),
  Promise.resolve("C"),
]).then(console.log);
```

**Output:**

```text
B
```

**Explanation:** `any` fulfills with first fulfilled Promise and ignores earlier rejections.

The key rule is that each combinator has different success/failure semantics: all, allSettled, race, and any solve different async coordination problems.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 166**

```javascript
Promise.any([
  Promise.reject("A"),
  Promise.reject("B"),
])
  .then(console.log)
  .catch((error) => console.log(error.errors));
```

**Output:**

```text
["A", "B"]
```

**Explanation:** If all reject, `Promise.any` rejects with `AggregateError` containing `errors`.

The key rule is that each combinator has different success/failure semantics: all, allSettled, race, and any solve different async coordination problems.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 19. Classes

**Question 167**

```javascript
class User {
  constructor(name) {
    this.name = name;
  }

  printName() {
    console.log(this.name);
  }
}

const user = new User("Ranjeet");

user.printName();
```

**Output:**

```text
Ranjeet
```

**Explanation:** `new` creates an instance and method call sets `this` to that instance.

The key rule is that classes are syntax over prototypes, class methods are strict-mode functions, and private fields are enforced by syntax/runtime rules.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 168**

```javascript
class User {
  constructor(name) {
    this.name = name;
  }

  printName() {
    console.log(this.name);
  }
}

const user = new User("Ranjeet");
const fn = user.printName;

fn();
```

**Output:**

```text
TypeError
```

**Explanation:** Class methods run in strict mode; detached method call has `this === undefined`.

The key rule is that classes are syntax over prototypes, class methods are strict-mode functions, and private fields are enforced by syntax/runtime rules.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 169**

```javascript
class User {
  static role = "admin";

  static printRole() {
    console.log(this.role);
  }
}

User.printRole();
```

**Output:**

```text
admin
```

**Explanation:** Static method is called on the class, so `this` is `User`.

The key rule is that classes are syntax over prototypes, class methods are strict-mode functions, and private fields are enforced by syntax/runtime rules.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 170**

```javascript
class Parent {
  constructor() {
    this.name = "Parent";
  }
}

class Child extends Parent {
  constructor() {
    super();
    this.age = 10;
  }
}

const child = new Child();

console.log(child.name);
console.log(child.age);
```

**Output:**

```text
Parent
10
```

**Explanation:** `super()` runs parent constructor before child initializes its own fields.

The key rule is that classes are syntax over prototypes, class methods are strict-mode functions, and private fields are enforced by syntax/runtime rules.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 171**

```javascript
class User {
  #password = "secret";

  getPassword() {
    return this.#password;
  }
}

const user = new User();

console.log(user.getPassword());
console.log(user.#password);
```

**Output:**

```text
SyntaxError
```

**Explanation:** Private fields can only be accessed inside the class body; external `user.#password` is a syntax error.

The key rule is that classes are syntax over prototypes, class methods are strict-mode functions, and private fields are enforced by syntax/runtime rules.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 20. Prototypes

**Question 172**

```javascript
function User(name) {
  this.name = name;
}

User.prototype.printName = function () {
  console.log(this.name);
};

const user = new User("Ranjeet");

user.printName();
```

**Output:**

```text
Ranjeet
```

**Explanation:** `user` finds `printName` on `User.prototype` through prototype chain.

The key rule is that property lookup walks the prototype chain, and `instanceof` checks that chain.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 173**

```javascript
function User(name) {
  this.name = name;
}

const user = new User("Ranjeet");

console.log(user.__proto__ === User.prototype);
```

**Output:**

```text
true
```

**Explanation:** Objects created with `new User` link to `User.prototype`.

The key rule is that property lookup walks the prototype chain, and `instanceof` checks that chain.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 174**

```javascript
function User(name) {
  this.name = name;
}

const user = new User("Ranjeet");

console.log(user.constructor === User);
```

**Output:**

```text
true
```

**Explanation:** `constructor` is found through `User.prototype.constructor`.

The key rule is that property lookup walks the prototype chain, and `instanceof` checks that chain.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 175**

```javascript
const obj = {};

console.log(obj.__proto__ === Object.prototype);
```

**Output:**

```text
true
```

**Explanation:** Plain object prototype is `Object.prototype`.

The key rule is that property lookup walks the prototype chain, and `instanceof` checks that chain.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 176**

```javascript
const arr = [];

console.log(arr.__proto__ === Array.prototype);
console.log(arr.__proto__.__proto__ === Object.prototype);
```

**Output:**

```text
true
true
```

**Explanation:** Arrays inherit from `Array.prototype`, which inherits from `Object.prototype`.

The key rule is that property lookup walks the prototype chain, and `instanceof` checks that chain.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 177**

```javascript
function User() {}

const user = new User();

console.log(user instanceof User);
console.log(user instanceof Object);
```

**Output:**

```text
true
true
```

**Explanation:** `instanceof` checks whether prototype appears in object prototype chain.

The key rule is that property lookup walks the prototype chain, and `instanceof` checks that chain.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 21. Destructuring

**Question 178**

```javascript
const user = {
  name: "Ranjeet",
  age: 30,
};

const { name } = user;

console.log(name);
```

**Output:**

```text
Ranjeet
```

**Explanation:** Object destructuring extracts `name` property.

The key rule is that destructuring reads from objects/arrays immediately, so missing nested objects can throw unless defaults are used.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 179**

```javascript
const user = {
  name: "Ranjeet",
};

const { age = 25 } = user;

console.log(age);
```

**Output:**

```text
25
```

**Explanation:** Default value is used when property is `undefined`.

The key rule is that destructuring reads from objects/arrays immediately, so missing nested objects can throw unless defaults are used.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 180**

```javascript
const user = {
  name: "Ranjeet",
  address: {
    city: "Pune",
  },
};

const {
  address: { city },
} = user;

console.log(city);
```

**Output:**

```text
Pune
```

**Explanation:** Nested destructuring extracts `address.city`.

The key rule is that destructuring reads from objects/arrays immediately, so missing nested objects can throw unless defaults are used.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 181**

```javascript
const user = {};

const {
  address: { city },
} = user;

console.log(city);
```

**Output:**

```text
TypeError
```

**Explanation:** Cannot destructure `city` from `undefined` address.

The key rule is that destructuring reads from objects/arrays immediately, so missing nested objects can throw unless defaults are used.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 182**

```javascript
const arr = [1, 2, 3];

const [a, b] = arr;

console.log(a, b);
```

**Output:**

```text
1 2
```

**Explanation:** Array destructuring uses positions.

The key rule is that destructuring reads from objects/arrays immediately, so missing nested objects can throw unless defaults are used.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 183**

```javascript
const arr = [1, 2, 3];

const [a, ...rest] = arr;

console.log(a);
console.log(rest);
```

**Output:**

```text
1
[2, 3]
```

**Explanation:** Rest collects remaining array elements.

The key rule is that destructuring reads from objects/arrays immediately, so missing nested objects can throw unless defaults are used.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 22. Spread And Rest

**Question 184**

```javascript
const arr1 = [1, 2];
const arr2 = [3, 4];

console.log([...arr1, ...arr2]);
```

**Output:**

```text
[1, 2, 3, 4]
```

**Explanation:** Spread expands arrays into a new array.

The key rule is that spread expands values, while rest gathers values; object spread overwrites keys from left to right.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 185**

```javascript
const obj1 = { a: 1 };
const obj2 = { b: 2 };

console.log({ ...obj1, ...obj2 });
```

**Output:**

```text
{ a: 1, b: 2 }
```

**Explanation:** Object spread copies enumerable own properties.

The key rule is that spread expands values, while rest gathers values; object spread overwrites keys from left to right.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 186**

```javascript
const obj1 = { a: 1, b: 2 };
const obj2 = { b: 3, c: 4 };

console.log({ ...obj1, ...obj2 });
```

**Output:**

```text
{ a: 1, b: 3, c: 4 }
```

**Explanation:** Later spreads overwrite earlier properties with same key.

The key rule is that spread expands values, while rest gathers values; object spread overwrites keys from left to right.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 187**

```javascript
const arr = [1, 2, 3];

console.log(Math.max(...arr));
```

**Output:**

```text
3
```

**Explanation:** Spread passes array elements as function arguments.

The key rule is that spread expands values, while rest gathers values; object spread overwrites keys from left to right.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 188**

```javascript
function test(a, b, ...rest) {
  console.log(a, b, rest);
}

test(1, 2, 3, 4, 5);
```

**Output:**

```text
1 2 [3, 4, 5]
```

**Explanation:** Rest parameter gathers remaining arguments.

The key rule is that spread expands values, while rest gathers values; object spread overwrites keys from left to right.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 23. Map And Set

**Question 189**

```javascript
const set = new Set([1, 2, 2, 3]);

console.log(set);
```

**Output:**

```text
Set { 1, 2, 3 }
```

**Explanation:** Set stores unique values.

The key rule is that `Map` and `Set` use value identity for objects, so two identical object literals are still different keys/values.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 190**

```javascript
const set = new Set();

set.add({});
set.add({});

console.log(set.size);
```

**Output:**

```text
2
```

**Explanation:** Two object literals are different references.

The key rule is that `Map` and `Set` use value identity for objects, so two identical object literals are still different keys/values.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 191**

```javascript
const obj = {};
const set = new Set();

set.add(obj);
set.add(obj);

console.log(set.size);
```

**Output:**

```text
1
```

**Explanation:** Same object reference added twice counts once.

The key rule is that `Map` and `Set` use value identity for objects, so two identical object literals are still different keys/values.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 192**

```javascript
const map = new Map();

map.set({}, "A");
map.set({}, "B");

console.log(map.size);
```

**Output:**

```text
2
```

**Explanation:** Object keys are compared by reference, so two literals are two keys.

The key rule is that `Map` and `Set` use value identity for objects, so two identical object literals are still different keys/values.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 193**

```javascript
const key = {};
const map = new Map();

map.set(key, "A");
map.set(key, "B");

console.log(map.size);
console.log(map.get(key));
```

**Output:**

```text
1
B
```

**Explanation:** Same key reference is overwritten with value `B`.

The key rule is that `Map` and `Set` use value identity for objects, so two identical object literals are still different keys/values.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 24. JSON

**Question 194**

```javascript
const obj = {
  name: "Ranjeet",
  age: undefined,
};

console.log(JSON.stringify(obj));
```

**Output:**

```text
{"name":"Ranjeet"}
```

**Explanation:** `undefined` object properties are omitted.

The key rule is that JSON supports only JSON-safe values; `undefined`, functions, Dates, and BigInt have special serialization behavior.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 195**

```javascript
const arr = [1, undefined, 3];

console.log(JSON.stringify(arr));
```

**Output:**

```text
[1,null,3]
```

**Explanation:** `undefined` array elements become `null` in JSON.

The key rule is that JSON supports only JSON-safe values; `undefined`, functions, Dates, and BigInt have special serialization behavior.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 196**

```javascript
const obj = {
  date: new Date("2025-01-01"),
};

console.log(JSON.stringify(obj));
```

**Output:**

```text
{"date":"2025-01-01T00:00:00.000Z"}
```

**Explanation:** Date objects serialize using `toJSON`, producing ISO string.

The key rule is that JSON supports only JSON-safe values; `undefined`, functions, Dates, and BigInt have special serialization behavior.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 197**

```javascript
const obj = {
  a: 1,
  fn: function () {},
};

console.log(JSON.stringify(obj));
```

**Output:**

```text
{"a":1}
```

**Explanation:** Functions in objects are omitted.

The key rule is that JSON supports only JSON-safe values; `undefined`, functions, Dates, and BigInt have special serialization behavior.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 198**

```javascript
const obj = {
  a: BigInt(10),
};

console.log(JSON.stringify(obj));
```

**Output:**

```text
TypeError
```

**Explanation:** `JSON.stringify` cannot serialize BigInt by default.

The key rule is that JSON supports only JSON-safe values; `undefined`, functions, Dates, and BigInt have special serialization behavior.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 25. Error Handling

**Question 199**

```javascript
try {
  throw new Error("failed");
} catch (error) {
  console.log("caught");
}
```

**Output:**

```text
caught
```

**Explanation:** Thrown error is caught by the nearest synchronous `catch`.

The key rule is that `try/catch` catches synchronous errors only, and `finally` can override returns.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 200**

```javascript
try {
  console.log("try");
} catch (error) {
  console.log("catch");
} finally {
  console.log("finally");
}
```

**Output:**

```text
try
finally
```

**Explanation:** `finally` always runs after `try`/`catch`.

The key rule is that `try/catch` catches synchronous errors only, and `finally` can override returns.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 201**

```javascript
function test() {
  try {
    return "try";
  } finally {
    return "finally";
  }
}

console.log(test());
```

**Output:**

```text
finally
```

**Explanation:** A return in `finally` overrides return from `try`.

The key rule is that `try/catch` catches synchronous errors only, and `finally` can override returns.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 202**

```javascript
function test() {
  try {
    throw new Error("failed");
  } catch {
    return "catch";
  } finally {
    return "finally";
  }
}

console.log(test());
```

**Output:**

```text
finally
```

**Explanation:** A return in `finally` overrides catch return too.

The key rule is that `try/catch` catches synchronous errors only, and `finally` can override returns.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.

**Question 203**

```javascript
try {
  setTimeout(() => {
    throw new Error("failed");
  }, 0);
} catch {
  console.log("caught");
}
```

**Output:**

```text
Uncaught Error: failed
```

**Explanation:** `try/catch` only catches synchronous errors in the current call stack, not later timer callbacks.

The key rule is that `try/catch` catches synchronous errors only, and `finally` can override returns.

**Interview takeaway:** When answering this in an interview, state the output first, then explain the runtime rule that produces it. The interviewer is checking whether you can reason from execution order and language semantics, not whether you memorized one puzzle.


---

## 26. Interview Coding Output Patterns

Practice these categories deeply:

```txt
Hoisting
Temporal Dead Zone
Scope
Closure
var vs let
this binding
Arrow function this
Object reference
Shallow copy
Array mutation
Type coercion
Truthy/falsy
== vs ===
|| vs ??
Optional chaining
Event loop
Promise ordering
Async/await ordering
Promise error handling
Class method this
Prototype chain
Destructuring errors
JSON.stringify behavior
try/catch/finally return behavior
```

## Highest Priority Output Questions

```txt
1. Event loop output
2. Promise output
3. Async/await output
4. Closure output
5. var vs let output
6. this binding output
7. Hoisting output
8. Object reference output
9. Type coercion output
10. Array mutation output
```

These 10 categories cover most JavaScript output-based interview questions for frontend roles.
