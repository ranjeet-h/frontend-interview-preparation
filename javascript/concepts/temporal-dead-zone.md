# Temporal Dead Zone

## 1. Why This Exists — The Problem First

Imagine a refactor that moves a configuration read above the line that creates the configuration. With `var`, that mistake can quietly read `undefined`, travel through several functions, and fail much later with an unrelated error. With `let` and `const`, JavaScript stops at the first invalid read and tells you that the local binding has not been initialized.

That short blocked interval is the Temporal Dead Zone (TDZ). Understanding it matters because it explains why `let` and `const` can be known to the engine before their declaration line, yet still cannot be used before that line executes.

## 2. The Analogy — Make It Obvious

Think of a meeting room with a reserved seat. When the room opens, the seat is already reserved for a particular person: the name is known, and nobody else can claim it. But the person has not checked in yet, so the seat cannot be used. When that person checks in, the seat becomes usable and can hold their belongings.

The room is the block scope. The reserved seat is the binding for a `let`, `const`, or class declaration. Entering the room creates the binding, but JavaScript marks it as uninitialized. Executing the declaration is the check-in; after that moment, reading the binding is allowed. Trying to use the seat before check-in throws a `ReferenceError` instead of handing you a misleading empty value.

The analogy is about time, not just source-code position. A callback written above the declaration can run safely if it is called after the declaration has executed. Conversely, code written below a declaration can still fail if it runs before a different binding has been initialized.

## 3. How It Actually Works — The Full Explanation

When JavaScript starts evaluating a scope, it creates bindings for declarations that belong to that scope. A `let` or `const` binding is therefore present before execution reaches its line, but its value is the special internal state **uninitialized**. That state is the TDZ for that binding.

Execution then proceeds in order. The binding remains inaccessible while the program is before the declaration's initialization point. When execution reaches `let count = 3`, the binding is initialized with `3`. When it reaches `let count;`, the binding is initialized with `undefined` at that declaration statement. For `const`, the initializer is required, so `const count = 3` initializes the binding as part of evaluating that statement.

The same rule applies to each binding independently. In this example, `first` has been initialized by the time `second` is read, but `second` is still in its TDZ:

```js
{
  const first = 1;
  console.log(first); // 1: this binding has already been initialized.
  try {
    console.log(second); // WHY: second's binding exists but is still uninitialized.
  } catch (error) {
    console.log(error instanceof ReferenceError); // true
  }
  const second = 2;
}
```

This is also why saying “`let` and `const` are not hoisted” is incomplete. The engine has created their bindings early enough to know that the name belongs to the current scope. What is delayed is usability, not the binding's existence. `var` follows a different initialization rule: its binding is initialized to `undefined` when the variable environment is created, so an early read is allowed.

Shadowing makes the binding choice especially important. JavaScript resolves the nearest matching name first; it does not fall back to the outer binding just because the inner one is still uninitialized:

```js
function readSetting() {
  const setting = "outer";

  try {
    {
      console.log(setting); // WHY: the inner binding shadows the outer one immediately.
      let setting = "inner";
    }
  } catch (error) {
    console.log(error instanceof ReferenceError); // true
  }

  return setting;
}

console.log(readSetting()); // outer
```

When execution enters the nested block, its `let setting` binding already exists but is in the TDZ. The reference therefore resolves to that inner, uninitialized binding and throws; it never reads the initialized outer `setting`. The outer binding remains unaffected, so the return after the block is `"outer"`.

TDZ is lexical and execution-dependent. A function body can contain a reference before a declaration without immediately failing, because defining the function does not execute its body:

```js
{
  function readLater() {
    return message;
  }

  const message = "ready";
  console.log(readLater()); // ready: the call happens after initialization.
}
```

The closure keeps access to the binding, not a frozen copy of its value. If the function is called while the binding is still uninitialized, the call fails; if it is called after initialization, it works.

Class declarations also have a TDZ. A class is not available before its declaration is evaluated, unlike a function declaration, which can normally be called before its source line. A named class expression has an additional inner class name that is available only inside the class body, while the outer `const` holding the class is still subject to the normal TDZ.

The `typeof` operator has one important boundary. `typeof completelyUndeclaredName` returns the string `"undefined"` for a missing global binding, but `typeof localName` still throws when `localName` is a known local binding in its TDZ. The identifier resolution step encounters the uninitialized binding before `typeof` can produce a result.

## 4. Real Code — See It Working

**A declaration is usable only after its initialization point:**

```js
function buildReceipt() {
  // The declaration is intentionally above the use so the value is ready.
  const currency = "USD";
  return `${currency} 42.00`;
}

console.log(buildReceipt()); // USD 42.00
```

**A `let` declaration without an initializer still initializes to `undefined`:**

```js
function createRequestState() {
  let error;

  // The declaration has executed, so this is a normal undefined value,
  // not a TDZ access.
  return { error };
}

console.log(createRequestState()); // { error: undefined }
```

**The runtime error is caused by execution order:**

```js
function readBeforeSetup() {
  try {
    console.log(apiBaseUrl); // WHY: this read runs before the initializer.
  } catch (error) {
    console.log(error instanceof ReferenceError); // true
  }

  const apiBaseUrl = "https://api.example.com";
  return apiBaseUrl;
}

console.log(readBeforeSetup()); // https://api.example.com
```

**`typeof` distinguishes a missing binding from a blocked local binding:**

```js
console.log(typeof nameThatDoesNotExist); // "undefined"

{
  try {
    console.log(typeof featureFlag); // WHY: resolution finds a TDZ binding first.
  } catch (error) {
    console.log(error instanceof ReferenceError); // true
  }

  const featureFlag = true;
}
```

**A callback can be declared before a binding and called after it is initialized:**

```js
function makeReporter() {
  const report = () => status;

  const status = "complete";
  return report(); // WHY: the closure is called only after status is initialized.
}

console.log(makeReporter()); // complete
```

**Classes follow the same blocked-before-declaration rule:**

```js
try {
  new Invoice(); // WHY: the class binding exists but is still uninitialized.
} catch (error) {
  console.log(error instanceof ReferenceError); // true
}

class Invoice {
  total() {
    return 0;
  }
}

console.log(new Invoice().total()); // 0
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the Temporal Dead Zone?**

It is the execution interval between entering a scope that contains a lexical declaration and the moment that declaration initializes its binding. The binding is already known to the scope, but it is marked uninitialized. Reading it during that interval throws a `ReferenceError`.

**Q: Are `let` and `const` hoisted?**

Yes, if hoisting means that the engine creates their bindings before normal line-by-line execution reaches the declaration. They differ from `var` because they are not initialized to `undefined` during scope setup. They stay uninitialized until their declaration executes, which is why early access fails.

**Q: When does the TDZ start and end?**

It starts when the relevant scope is created and execution enters that scope. It ends separately for each binding when execution evaluates that binding's declaration. For `const value = expression`, the binding becomes initialized only as that declaration, including its initializer, is evaluated.

**Q: Why does `typeof` throw for a TDZ variable but not for an undeclared variable?**

For an undeclared name, resolution finds no binding and `typeof` applies its special safe behavior, returning `"undefined"`. For a TDZ name, resolution finds a real local binding whose state is uninitialized. That invalid access throws before `typeof` can return a string.

**Q: Do class declarations have a TDZ?**

Yes. A class declaration is a lexical declaration, so its binding is blocked until the class declaration executes. This is different from a function declaration, whose function value is normally initialized during scope setup and can be called earlier.

**Q: Is TDZ based only on whether the reference is above the declaration in the file?**

No. It depends on when the reference executes. A function or event handler may be written above the declaration and work when called later. A reference below a declaration can still fail if it runs in another scope whose binding has not yet been initialized.

**Q: Why is TDZ useful instead of returning `undefined`?**

It turns an accidental ordering problem into an immediate, local failure. That makes refactoring and debugging safer: the program cannot silently continue with a value that looks valid enough to pass through other code.

## 6. The Traps — What Goes Wrong

**Trap: “`let` and `const` do not exist before their declaration.”**

The binding does exist in the current lexical environment; it is just uninitialized. That distinction explains why the engine reports “Cannot access … before initialization” rather than treating the name as a missing global variable.

**Trap: Treating TDZ as a text rule.**

JavaScript does not reject every reference that appears earlier in the source. It rejects a reference that actually runs while the binding is uninitialized. Delayed callbacks often make the difference between a source-order surprise and a valid read.

**Trap: Assuming `typeof` is always safe.**

`typeof` is safe for a completely undeclared name, not for a declared lexical name in its TDZ. Do not use it as a general way to probe whether a local `let` or `const` is ready.

**Trap: Forgetting that `const` must be initialized immediately.**

`const value;` is a syntax error, not a declaration that waits in the TDZ. `let value;` is valid and becomes `undefined` when execution reaches that statement. Both forms are inaccessible before their declaration, but only `let` can be declared without an initializer.

**Trap: Confusing TDZ with `undefined`.**

`undefined` is a value that can be read. The TDZ is a state in which the binding cannot be read at all. The difference is visible in control flow: an early read throws, while a post-declaration `let value;` can be returned normally as `undefined`.

**Trap: Calling a closure while its captured binding is still blocked.**

A closure does not bypass TDZ. It stores access to the lexical binding, so calling it before that binding initializes still throws. Calling the same function after initialization succeeds because the binding has transitioned to a usable state.

## 7. Compare With Related Concepts

**TDZ vs hoisting:** Hoisting is the shorthand for creating declarations before ordinary execution reaches their source lines; TDZ is the blocked state of a hoisted lexical binding before initialization. Use the hoisting explanation to discuss setup, and use TDZ to explain why an early lexical read throws.

**`let`/`const` vs `var`:** `var` is initialized to `undefined` during function or global environment setup, while `let` and `const` remain uninitialized until their declarations execute. Use `let` or `const` for block-scoped application code; use `var` only when maintaining legacy behavior requires it.

**TDZ vs an undeclared variable:** An undeclared variable has no binding in the relevant environment; a TDZ variable has a binding that is known but not initialized. Use explicit declarations and do not rely on `typeof` as a substitute for correct scope management.

**TDZ vs a closure:** TDZ is a timing rule for accessing a binding; a closure is a function retaining access to its surrounding bindings. Use closures when delayed work needs surrounding state, but ensure the callback runs after required bindings have been initialized.

**Class declaration vs function declaration:** Both create named declarations, but class bindings remain in the TDZ until their declaration runs, while function declarations are normally initialized with callable function values during setup. Use a class only after its declaration; a function declaration can be called earlier, although declaring dependencies before use is usually clearer.

## 8. 🧠 The Memory Hook — What Sticks

`let`, `const`, and classes reserve their seat when the scope opens, but they do not check in until execution reaches the declaration. The seat is real, yet unusable: before check-in JavaScript throws a `ReferenceError`; after check-in it holds a normal value, including `undefined` for an uninitialized `let`.
