# Hoisting

## 1. Why This Exists — The Problem First

An innocent-looking refactor can change a working program into one that crashes—or, worse, one that quietly uses `undefined`. A teammate moves an assignment below a log, calls a helper before its definition, or changes a `var` function expression to `const` and suddenly the failure is different. If you explain all of those cases as “JavaScript moves declarations to the top,” you will predict some results incorrectly and give unsafe advice in an interview.

Hoisting is useful as shorthand for the setup that happens before statements execute. The important question is not whether a line moved. It is what binding the runtime created, whether that binding already has a value, and whether the current scope allows access to it.

## 2. The Analogy — Make It Obvious

Think of a theater preparing for a performance. Before the audience sees the first scene, the stage manager reads the cast list and prepares named places backstage. That preparation is like creating bindings for declarations in an execution context.

The cast members do not all arrive in the same state. A function declaration arrives with its complete role and can perform when called. A `var` name has a prepared place containing an empty placeholder, which maps to `undefined`, until the assignment runs. A `let` or `const` name has a reserved place with a locked door: the runtime knows the name exists, but code cannot use it until execution reaches its declaration. That locked interval is the temporal dead zone (TDZ).

The script is still performed in source order. Preparing the backstage does not move a scene to the beginning, and it does not execute an assignment early. It only explains why some names are available, empty, or deliberately inaccessible when the first scene starts.

## 3. How It Actually Works — The Full Explanation

When JavaScript starts a script, function, or block, it creates an execution context for that piece of code. Part of that setup is an environment: a record that maps identifiers such as `count` or `sayHi` to their bindings. The source text remains where it is; the runtime prepares the names before it executes statements in source order.

The word “hoisting” groups several different setup rules:

- A function declaration is initialized with a callable function value during context setup. The call can appear before the declaration in the same scope.
- A `var` binding is created and initialized to `undefined`. Its later initializer is an assignment that runs only when execution reaches that statement.
- A `let` or `const` binding is created but left uninitialized. From setup until its declaration is evaluated, reading it or assigning to it is blocked by the TDZ and throws a `ReferenceError`.
- A class declaration creates its lexical binding during setup but leaves that binding uninitialized in the TDZ until class evaluation runs. The constructor value is not available before the `class` declaration is evaluated.
- A function expression or arrow function is a value assigned to a variable. The variable follows the rule of its declaration keyword; the function value does not exist in that binding until the assignment executes.

The distinction between declaration and initialization is the key. In `var count = 1`, setup creates `count` and gives it `undefined`; execution later evaluates `1` and stores it in `count`. In `const count = 1`, setup creates `count` without a readable value; execution evaluates the declaration, initializes it to `1`, and only then makes it usable. `const` also prevents rebinding after initialization, but it does not make the stored object immutable.

Scope changes the result. A block can create its own lexical environment for `let`, `const`, and block-scoped function declarations. A name inside that block can shadow an outer name. A `var` declaration is function-scoped (or script-scoped when it is top-level), so it does not behave like a block-local `let`. In an ES module, top-level declarations are module-local. In a classic browser script, top-level `var` and function declarations have additional global-object behavior; top-level `let` and `const` are global lexical bindings instead. That environment distinction is one reason global declarations should be avoided in application code.

Function declarations are not a license to ignore ordering. Their availability is scoped: a declaration inside a function is prepared for that function call, and a block-scoped declaration is not a reliable outer-scope helper. Even when hoisting makes an order legal, placing dependent declarations before their use usually makes reviews and refactors safer.

Class declarations follow the lexical/TDZ side of this model, not the early-call behavior of function declarations. During module or script setup, the runtime records the class name, but it does not initialize that binding with a constructor. Evaluation of the class definition creates the constructor, methods, and prototype, then initializes the binding. A class expression is an expression that produces a class value; its outer variable follows `var`, `let`, or `const` as usual, while a named class expression also has an inner class name usable inside the class body. The outer assignment still happens only when execution reaches it.

Modules add a separate linking step. Before module bodies execute, module instantiation connects each `export` binding to matching `import` bindings. Those imports are live, read-only views of the exporting module's bindings; they are not copied ordinary values and the `import` declaration does not execute the exported expression early. The dependency module is evaluated before the dependent module body, so an imported binding can be available when the dependent body runs, while a cycle can still expose an exported lexical binding before its initialization and produce a TDZ `ReferenceError`.

## 4. Real Code — See It Working

A function declaration is initialized before synchronous execution reaches the call:

```js
console.log(formatUser({ name: "Ada" })); // "ADA"

// WHY: a function declaration is initialized during context setup,
// so this call can resolve the complete function before this line.
function formatUser(user) {
  return user.name.toUpperCase();
}
```

`var` is readable early, but only with its setup value:

```js
console.log(requestCount); // undefined

// WHY: setup created requestCount and initialized it to undefined;
// this assignment happens only when execution reaches the statement.
var requestCount = 1;

console.log(requestCount); // 1
```

`let` and `const` are known to the runtime but protected by the TDZ:

```js
function readConfiguredPort() {
  // console.log(port); // ReferenceError: Cannot access 'port' before initialization

  const port = 3000;
  return port;
}

console.log(readConfiguredPort()); // 3000
```

The commented line is intentionally not executed so the complete example can run. Uncommenting it demonstrates the TDZ. An undeclared name is a different failure: `console.log(missingPort)` throws because no binding exists at all, while the `port` binding exists but is uninitialized.

Function expressions follow the variable binding, not the function-declaration rule:

```js
console.log(typeof loadData); // "undefined"

// WHY: the var binding exists early, but the function value is assigned later.
var loadData = function loadData() {
  return "loaded";
};

console.log(loadData()); // "loaded"
```

Calling `loadData()` before the assignment would throw `TypeError: loadData is not a function`, because the existing value is `undefined`. With `const`, the early call would throw a `ReferenceError` instead because the binding is still in the TDZ:

```js
// console.log(saveData()); // ReferenceError: Cannot access 'saveData' before initialization

// WHY: the arrow function is assigned only when this declaration executes.
const saveData = () => "saved";

console.log(saveData()); // "saved"
```

Block scope shows why “all declarations go to the top” is too vague:

```js
const label = "outside";

{
  // WHY: this block creates a new lexical binding for label; it shadows the outer one.
  const label = "inside";
  console.log(label); // "inside"
}

console.log(label); // "outside"
```

Class declarations stay in the TDZ until their definition is evaluated, while a class expression is assigned like any other expression:

```js
try {
  console.log(Invoice); // ReferenceError before the class declaration is evaluated
} catch (error) {
  console.log(error.name); // "ReferenceError"
}

class Invoice {
  total() {
    return 42;
  }
}

console.log(new Invoice().total()); // 42

const createBadge = class Badge {
  static label() {
    return "ready";
  }

  name() {
    return Badge.label(); // the class-expression name is available inside its body
  }
};

console.log(createBadge.label()); // "ready"
console.log(new createBadge().name()); // "ready"
```

Module linking prepares bindings before module evaluation, but it does not run imported values like ordinary statements. These two source files are the shape of that relationship:

`config.mjs` exports a live binding:

```js
export let mode = "development";
export function switchToProduction() {
  mode = "production";
}
```

`app.mjs` receives the binding through linking; it cannot assign to `mode`, but it observes later changes made by the exporter:

```js
import { mode, switchToProduction } from "./config.mjs";

console.log(mode); // "development"
switchToProduction();
console.log(mode); // "production"
```

The examples are separate module files, so run them as `config.mjs` and `app.mjs` in the same directory with `node app.mjs`.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is hoisting?**

Hoisting is interview shorthand for declaration setup before execution begins in a scope. The runtime creates bindings before it runs the statements, but it does not physically move source code. Different declarations receive different setup states, so “hoisted” alone is incomplete: function declarations are callable, `var` is initialized to `undefined`, and `let`/`const` are uninitialized until their declaration executes.

**Q: Are `let` and `const` hoisted?**

Yes, in the useful sense that their bindings are created during scope setup. They are not initialized to a value that code may read immediately. The period before the declaration is evaluated is the TDZ, and an access during that period throws a `ReferenceError`. Their error does not prove that the name was absent; it shows that the name exists but is not initialized yet.

**Q: Why does `var` produce `undefined` before its line?**

Setup creates the `var` binding and initializes it to the primitive value `undefined`. The initializer in `var total = 10` is separate runtime work: when execution reaches that statement, it stores `10`. Reading before then succeeds because the binding is already initialized, but it reads the placeholder value.

**Q: Why can a function declaration be called before its definition?**

The function declaration is initialized with its function value while the execution context is being prepared. The later source line does not create the function for the first time; it is where the declaration appears in the script. The rule is still limited by scope, and duplicate declarations or block-specific behavior can make ordering confusing, so normal top-down ordering remains clearer.

**Q: How does a function expression differ from a function declaration?**

A function declaration gets its callable value during setup. A function expression is an expression whose result is assigned to a variable when execution reaches that assignment. Therefore `var run = function () {}` has an early `undefined` binding and an early call causes a `TypeError`, while `const run = function () {}` has an early uninitialized binding and an early call causes a `ReferenceError`.

**Q: What happens with arrow functions?**

An arrow function is also a function expression, so its variable keyword controls early access. `const add = () => 1` is blocked by the TDZ before the declaration, and `var add = () => 1` is readable as `undefined` before assignment but is not callable. Arrow functions have other differences, such as lexical `this`, but those are separate from hoisting.

**Q: Are class declarations hoisted?**

Their bindings are created during setup, but the bindings remain uninitialized in the TDZ until class declaration evaluation. That is why `new Invoice()` or even `console.log(Invoice)` before the declaration throws a `ReferenceError`, unlike a function declaration that already has a callable value. After evaluation, the binding refers to the constructor and its prototype is ready for instances.

**Q: How do class expressions behave before their assignment?**

A class expression produces a class value only when the expression runs. `const Invoice = class {}` therefore follows `const`: before the assignment, `Invoice` is in the TDZ; with `var Invoice = class {}`, the early value is `undefined`. If the expression is named, such as `const Invoice = class Invoice {}`, the inner `Invoice` name is available inside the class body, while the outer variable is still initialized only by the assignment.

**Q: How are imports and exports hoisted?**

Module instantiation creates the module's import/export links before module evaluation. An imported name is a live, read-only binding connected to the exporter, not a copied value and not an instruction to execute the export expression in the importer. Dependencies are evaluated before the dependent module body, but cyclic dependencies can read an exported lexical binding while it is still uninitialized and hit the TDZ. The safe explanation is “module bindings are linked before evaluation,” not “imports execute like ordinary values.”

**Q: Does hoisting move assignments too?**

No. In `var score = 7`, only the name setup occurs early. The value `7` is produced and stored when execution reaches the assignment. The same principle explains why a function expression’s body is not available through its variable before the assignment.

**Q: Is hoisting the same in every scope?**

No. Function scope, block scope, modules, and classic scripts have different environment rules. `let` and `const` are block-scoped; `var` is not block-scoped. Module top-level names do not become ordinary global-object properties, while classic script top-level `var` has special global behavior. Always identify the scope and declaration form before predicting a result.

## 6. The Traps — What Goes Wrong

**Trap: saying JavaScript moves declarations to the top.**

That wording predicts the wrong thing because it suggests assignments move too. The source remains in place, and execution remains top-to-bottom. Say that the runtime creates bindings before execution, then describe each binding’s initialization state.

**Trap: saying `let` and `const` are not hoisted.**

They are created during setup, but they remain uninitialized. Calling the result “not hoisted” hides the reason for the specific TDZ error and makes it harder to distinguish a declared-but-uninitialized name from an entirely undeclared name.

**Trap: treating `undefined` as proof that a variable is missing.**

`undefined` can be an intentional value, a `var` setup value, or a property value that was not found. For `var`, the binding exists and is initialized. For an undeclared identifier, the identifier lookup throws a `ReferenceError`; it does not evaluate to `undefined`.

**Trap: expecting all early function calls to work.**

Only a function declaration gets the early callable value. A function expression and an arrow function are assigned later. Check the keyword and the expression form before predicting the error: early `var` calls commonly produce a `TypeError`, while early `let`/`const` calls produce a `ReferenceError`.

**Trap: using hoisting as a style strategy.**

Code that relies on early calls or early `var` reads can be legal but fragile. A reorder can change a harmless `undefined` into a crash, or can make a helper depend on a hidden declaration. Declare values close to their use, prefer `let`/`const`, and use function declarations early only when the module’s structure genuinely benefits from it.

**Trap: confusing TDZ with temporal behavior across closures.**

A closure can remember a lexical binding and read it later, after initialization. The TDZ applies to an access before initialization, not forever. For example, a function declared before `const value = 4` may safely read `value` if it is called after that declaration has executed.

**Trap: saying classes are callable before their declaration like functions.**

Class declarations are lexical bindings left uninitialized during setup. The runtime must evaluate the class definition before the constructor can be read, so early access throws a `ReferenceError`; do not explain this as “classes are not hoisted” without mentioning the binding and TDZ.

**Trap: treating imports as copied constants or early execution.**

Imports are live read-only links established during module instantiation. The imported module's code is evaluated according to module dependency order, not because an import line executes a value like an ordinary assignment. This distinction matters in cycles, where an imported binding can exist but still be uninitialized when read.

## 7. Compare With Related Concepts

**Hoisting vs declaration and initialization:** declaration setup creates a name; initialization gives that name its first usable state. Use this distinction whenever an example mixes `var`, `let`, `const`, or a function declaration.

**`var` vs `let`/`const`:** `var` is initialized to `undefined` and is function-scoped; `let` and `const` are block-scoped and stay in the TDZ until initialized. Use `let` when a binding must be reassigned, `const` when it must not be rebound, and avoid `var` in modern application code unless legacy behavior is intentional.

**Function declaration vs function expression:** a declaration receives its callable value during setup; an expression receives its function value through a later assignment. Use a declaration when a named module-level helper can be read naturally before or after its definition; use an expression when the function is a value being passed, conditionally selected, or kept behind a variable’s normal initialization point.

**Class declaration vs class expression:** both create class constructors when evaluated, but a class declaration's lexical binding is established during setup and remains in the TDZ until its declaration is evaluated, while a class expression is a value produced by an expression and assigned to an outer variable. Use a class declaration for a directly named binding in a scope; use a class expression when the class is itself a value to assign, pass, or select, and remember that a named expression's inner name is only for the class body.

**Module binding linking vs ordinary value assignment:** module instantiation connects live import/export bindings before module evaluation; an ordinary assignment evaluates its right-hand side at the assignment statement and stores that result. Use the module-binding model for `import`/`export`, especially in cycles; use the assignment model for `const value = makeValue()` and other local initializers.

**TDZ vs undeclared identifier:** the TDZ is an access to an existing lexical binding before initialization; an undeclared identifier has no binding in the current lookup chain. Use the error distinction while debugging: `Cannot access 'x' before initialization` points to ordering/shadowing, while `x is not defined` points to a missing declaration or import.

**Hoisting vs the call stack:** hoisting describes binding setup for an execution context; the call stack describes which execution contexts are currently running. Use hoisting to explain name availability before a statement, and the call stack to explain nested function execution and return order.

## 8. 🧠 The Memory Hook — What Sticks

Before the play starts, JavaScript labels the backstage—but the labels do not all hold the same thing: functions arrive ready, `var` gets an `undefined` placeholder, and `let`/`const` stay behind a locked door until their scene begins. Hoisting is about prepared bindings, never about moving the script.
