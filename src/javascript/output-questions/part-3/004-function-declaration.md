# Function Declaration: The Function Is Ready Before the Call

This one-puzzle page traces one small program through the JavaScript engine. Predict the output before reading the explanation.

## 1. The Code

```javascript
foo();

function foo() { console.log("hello"); }
```

## 2. The Answer

```text
hello
```

The call succeeds and prints `hello`. Before ordinary statements execute, JavaScript creates the `foo` binding and initializes it with the function from the declaration. When execution reaches `foo()`, the function is already callable, so its body runs and `console.log` prints `hello`.

## 3. Execution — Walk Through It Like the JS Engine

This puzzle has two important phases: declaration setup and normal execution. “Hoisting” is a useful shorthand for the setup, but JavaScript does not literally move the function call or run the function body early.

1. JavaScript creates the execution context for the surrounding code. During setup, it examines the declarations in that scope.

2. It finds the function declaration:

   ```javascript
   function foo() { console.log("hello"); }
   ```

   JavaScript creates a binding named `foo` and initializes that binding with a callable function object. The function body is available before normal statement execution begins.

3. Setup does not call `foo` and does not run `console.log`. It only prepares the function value and stores it in the `foo` binding.

4. Synchronous execution then starts at the first source statement:

   ```javascript
   foo();
   ```

5. JavaScript resolves `foo`, finds the initialized function binding, and calls it.

6. The function body runs:

   ```javascript
   console.log("hello");
   ```

   `console.log` receives the string `hello`, so the program prints:

   ```text
   hello
   ```

The order is therefore:

```text
create and initialize foo → execute foo() → run the body → log "hello"
```

There is no asynchronous work in this puzzle. The call and the log happen synchronously on the current call stack.

## 4. The Concept This Question Tests

This question tests how a function declaration is bound and initialized before execution reaches its source position.

- **Binding creation:** JavaScript creates the name `foo` while setting up the execution context.
- **Function initialization:** The binding receives a callable function value during that setup.
- **Execution order:** Statements still execute from top to bottom, so the first statement is still `foo()`.
- **Body execution:** Preparing the function does not execute its body. The body runs only when the call expression is evaluated.

A function expression follows a different timing rule. For example:

```javascript
foo();

const foo = function () { console.log("hello"); };
```

Here, `foo` is a `const` binding. It exists during setup but remains uninitialized until execution reaches the assignment, so the earlier call throws a `ReferenceError`. The function value is created when the expression is evaluated, not during function-declaration setup. With `var foo = function () { ... }`, the earlier call instead finds `foo` as `undefined` and throws a `TypeError` because `undefined` is not callable.

## 5. The Trap — Why Most People Get It Wrong

The common wrong answer is `ReferenceError`, based on the incomplete rule “you cannot call a function before declaring it.” A normal function declaration in the same scope is initialized before the first statement executes, so this call succeeds.

Another mistake is saying that `hello` is printed during hoisting. Hoisting prepares the callable function value; it does not run the function body. The output appears only after execution evaluates `foo()` and enters the body.

Do not generalize this result to function expressions. Their values are produced at runtime, and the variable's declaration rules determine what an earlier call observes. In this puzzle, the declaration has already supplied a callable value when `foo()` runs.

## 6. 🧠 The Memory Hook

**A function declaration brings its callable value during setup; the body waits for the call.**

Trace this puzzle as: **function ready early → `foo()` runs → `hello` prints.**
