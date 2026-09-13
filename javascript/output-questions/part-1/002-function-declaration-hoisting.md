# Function Declaration Hoisting: The Function Is Ready Before Execution

## 1. The Code

```javascript
foo(); function foo() { console.log("Hello"); }
```

## 2. The Answer

```text
Hello
```

The call succeeds and prints `Hello`. The function declaration creates the `foo` binding and initializes it with a callable function value before the first statement is executed. When execution reaches `foo()`, the function is already available, so its body runs and `console.log` prints `Hello`.

## 3. Execution — Walk Through It Like the JS Engine

This puzzle has two important parts: declaration instantiation before execution, and ordinary synchronous execution afterward. “Hoisting” is a useful name for the early setup, but JavaScript does not literally move the function's source text above the call and execute the moved text.

1. JavaScript begins by creating the execution context for the surrounding code. As part of setting up that context, it examines the declarations in the scope.

2. JavaScript finds the function declaration named `foo`:

   ```javascript
   function foo() { console.log("Hello"); }
   ```

   It creates a binding named `foo` and initializes that binding with the complete function object. The function body is available as part of that function value before normal statement execution begins.

3. The setup phase does not call `foo`. It only makes the binding available. The function body is still dormant; its `console.log` has not run, and nothing has been printed yet.

4. Synchronous execution then starts at the first source statement, which is the call expression:

   ```javascript
   foo();
   ```

5. JavaScript resolves the identifier `foo` through the current scope's environment. The lookup finds the initialized function binding, so it does not throw a `ReferenceError`.

6. JavaScript calls the function. It creates a function execution context for `foo` and begins evaluating the function body:

   ```javascript
   console.log("Hello");
   ```

7. The string literal is evaluated as `"Hello"`. JavaScript calls `console.log` synchronously with that string, and the console receives one line:

   ```text
   Hello
   ```

8. The function reaches the end of its body and returns `undefined` to its caller. The return value is not logged because the call expression does not pass it to another `console.log` call.

There is no asynchronous scheduling in this puzzle. No Web API, promise reaction, microtask, timer, or macrotask is involved. The call and the log happen on the current call stack during one synchronous turn. The important order is:

```text
create and initialize foo → execute foo() → log "Hello" → return
```

A function declaration differs from a function expression in the setup rule that matters here. A declaration initializes its binding with a callable function during scope setup. A function expression produces a function value only when the expression is evaluated and assigned to its variable; that variable therefore follows its declaration keyword's rules. This distinction is why the declaration in this one puzzle is callable before its source position while an equivalent expression assigned to a lexical binding would not be ready at that point.

The availability is still limited to the declaration's scope. Hoisting does not make `foo` global everywhere, and it does not allow code in an unrelated scope to find the name. It makes the declared function available early within the relevant scope.

## 4. The Concept This Question Tests

This tests function declaration hoisting, more precisely the early creation and initialization of a function binding during execution-context setup.

JavaScript declarations do not all receive the same initialization treatment:

- A function declaration normally gets a callable function value during declaration instantiation. Its body can therefore be called before the declaration's source position is reached.
- A `var` declaration gets a binding initialized to `undefined`; an initializer assignment runs later when execution reaches it.
- A `let` or `const` declaration gets a binding that exists but remains uninitialized until execution evaluates the declaration. Reading it earlier is blocked by the temporal dead zone and throws a `ReferenceError`.
- A function expression is an expression that creates a function value when evaluated. If that value is assigned to a variable, the variable's `var`, `let`, or `const` rules determine whether the value is available at an earlier point.

For this code, the declaration itself supplies the callable value during setup. The call is still executed in source order; it succeeds because the earlier setup has already initialized `foo`. The engine did not execute `console.log("Hello")` during hoisting. It only prepared the function so that the later call could execute its body.

The function's body is also not run merely because the declaration was processed. Declaration instantiation prepares a function object and stores it in the `foo` binding. Only evaluating `foo()` creates the function call and causes the log.

## 5. The Trap — Why Most People Get It Wrong

The common wrong answer is `ReferenceError`, based on the incomplete rule “you cannot use a function before declaring it.” That rule describes some lexical bindings and function-expression arrangements, not a normal function declaration in the same scope. This declaration has already initialized `foo` when the call executes.

Another mistake is to answer that `Hello` is printed during hoisting. Hoisting does not execute the function body. The setup phase prepares the callable value; the `foo()` call later enters the body and performs the log.

Candidates also sometimes say that JavaScript moves the entire function line to the top. That mental shortcut predicts this example correctly but obscures the mechanism. The accurate explanation is that declaration instantiation creates and initializes the `foo` binding before statement execution, then execution proceeds from the first source statement and calls the prepared function.

Do not generalize this result to every function-looking form. A function expression is assigned as a value at runtime, so its availability depends on the variable declaration holding it. The safe tracing question is: “What kind of declaration created this binding, and was its function value initialized before this call executed?” Here, the answer is a function declaration, so the value was ready.

## 6. 🧠 The Memory Hook

`function foo() { ... }` brings the callable with the name: the binding is initialized during setup, but the body waits for the call.

So trace this puzzle as:

> Function ready early; execution still starts at `foo()`; `Hello` prints only when the call enters the body.
