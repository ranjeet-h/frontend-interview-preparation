# Lexical Environment

## 1. Why This Exists — The Problem First

You log a variable inside a nested function and it somehow "remembers" data from a function that already finished. Then you move a `let` declaration into a block and suddenly the same name is unavailable outside that block. Then a teammate says "scope chain," another says "closure," and a third says "execution context," but nobody explains what structure is actually holding those names together.

That missing structure is the lexical environment. If you think JavaScript keeps all variables in one flat list, shadowing, block scope, closures, and `ReferenceError` bugs feel random. They are not random. JavaScript is following a very specific lookup structure every time it resolves a name.

## 2. The Analogy — Make It Obvious

Think of a lexical environment like a stack of labeled office folders.

The folder on top belongs to the code currently running. Inside that folder is a sheet listing the names this piece of code owns: parameters, local variables, function declarations, and block-scoped bindings. If the code asks for `count`, the engine checks the top folder first.

If `count` is not in that folder, the engine does not search the whole building. It follows a note clipped to the folder that says, "If not here, ask this parent folder." That parent folder might belong to the surrounding function, then the module or global code above it.

That maps directly to JavaScript:

- The sheet of names is the environment record.
- The "ask this parent folder next" note is the outer reference.
- A new block like `if` or `for` can create a new folder for `let` and `const`.
- A function created inside another function keeps the folder chain from where it was defined, which is why closures work.

The important part of the analogy is that lookup is local first, then outward one link at a time. JavaScript does not scan every variable everywhere. It follows the folder chain.

## 3. How It Actually Works — The Full Explanation

A lexical environment is a specification-level runtime structure with two parts: an environment record and a reference to an outer lexical environment. The environment record stores bindings for names that exist in the current scope. The outer reference points to the next scope outside the current one.

When JavaScript starts running code, it creates environments as needed. At the top level, that is a global environment or a module environment. When a function runs, JavaScript creates a function environment for that call. When code enters a block that contains block-scoped declarations such as `let`, `const`, or `class`, JavaScript creates a block environment for that block.

That gives us the real lookup rule:

1. The code asks for a name such as `theme`.
2. JavaScript checks the current environment record.
3. If the binding exists there, lookup stops.
4. If not, JavaScript follows the outer reference.
5. It repeats this until it finds the name or reaches the outermost environment.
6. If the name is still missing, normal reads throw a `ReferenceError`.

That is why shadowing works. If an inner environment has `const theme = "dark"`, that binding is found before JavaScript ever reaches the outer `theme`. The outer variable still exists. It is just hidden for that lookup.

This is also why block scope feels different from `var`. `let` and `const` live in the block environment created for that block. `var` does not create block scope. It belongs to the nearest function environment, or the global environment if there is no enclosing function. So an `if` block can create a fresh lexical environment for `let`, but not for `var`.

There is one more important detail: bindings are not always immediately usable. A block environment can already exist before a `let` or `const` binding is initialized. During that window, the name exists in the environment record, but reading it is illegal. That is the temporal dead zone. The engine is not saying "I have never heard of this name." It is saying, "This binding belongs to this scope, but you touched it before initialization."

Closures build directly on lexical environments. When JavaScript creates a function, that function keeps a reference to the environment chain where it was defined, not where it will later be called. When the function runs later, name lookup starts in its own current environment and can keep walking outward through the saved chain. That is why a callback can still read `count` from an outer function that already returned. The outer call ended, but the needed lexical environment stayed reachable through the inner function.

So the relationship is:

- The lexical environment is the data structure for name storage plus the link outward.
- The scope chain is the path JavaScript walks through those linked environments.
- A closure is what you get when a function keeps access to outer environments after the outer code finished running.

If you separate those three ideas, scope questions become much easier. The lexical environment is the storage unit. The scope chain is the lookup path. The closure is the surviving access to that path.

## 4. Real Code — See It Working

This first example shows normal lookup and shadowing.

```js
const globalCurrency = "USD";

function formatPrice(amount) {
  const localCurrency = "INR";

  function buildLabel() {
    // JavaScript finds amount here, localCurrency in the nearest outer scope,
    // and globalCurrency in the outermost scope.
    return `${localCurrency} ${amount} (${globalCurrency} base)`;
  }

  return buildLabel();
}

console.log(formatPrice(250)); // "INR 250 (USD base)"
```

This next example shows block scope. The `innerMessage` inside the `if` block lives in a different lexical environment from the outer `outerMessage`.

```js
const outerMessage = "outside";

if (true) {
  const innerMessage = "inside";
  console.log(innerMessage); // "inside"
}

console.log(outerMessage); // "outside"
```

This example shows why `var` behaves differently. It does not stay inside the block.

```js
function track() {
  if (true) {
    var status = "sent";
    let retries = 3;
    console.log(retries); // 3
  }

  console.log(status); // "sent"

  // Uncommenting the next line throws because retries belonged to the block environment.
  // console.log(retries);
}

track();
```

This last example shows the lexical environment that makes closures possible.

```js
function createCounter(start) {
  let count = start;

  return function increment() {
    // The returned function keeps using the same count binding.
    count += 1;
    return count;
  };
}

const counter = createCounter(10);

console.log(counter()); // 11
console.log(counter()); // 12
```

`createCounter` finished after returning `increment`, but the `count` binding stayed reachable because the returned function still needs that lexical environment.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a lexical environment in JavaScript?**

It is the runtime structure JavaScript uses for variable lookup. It contains an environment record, which stores bindings for names in the current scope, plus a reference to the next outer lexical environment. In plain words, it is the current scope's name table plus a link to the parent scope.

**Q: Is a lexical environment the same thing as the scope chain?**

No. A lexical environment is one node in the structure. The scope chain is the path created by linking many lexical environments together. If you ask for `userId`, JavaScript walks the chain of lexical environments until it finds a matching binding or runs out of outer scopes.

**Q: What does the environment record store?**

It stores the bindings owned by that scope: parameters, local variables, function declarations, and other names that belong there. The useful mental model is "this scope's official list of names." The exact internal shape is engine-specific, but the behavior is fixed by the language rules.

**Q: How are block scope and function scope related to lexical environments?**

They come from different kinds of lexical environments. A function call creates a function environment. A block with `let`, `const`, `class`, or `catch` bindings creates a block environment. That is why `let` and `const` can disappear after the block ends, while `var` ignores block boundaries and belongs to the function or global scope instead.

**Q: How does JavaScript resolve a variable name?**

It starts in the current lexical environment. If the binding is there, lookup stops immediately. If not, JavaScript follows the outer reference and checks the parent environment. It keeps going outward until it finds the name or reaches the top. If the name never exists in the chain, reading it throws a `ReferenceError`.

**Q: What is the temporal dead zone in terms of lexical environments?**

It means the binding belongs to the current lexical environment, but it has not been initialized yet. So the name is part of the scope, but accessing it before the declaration line is illegal. This is different from "not found." The environment exists. The binding just is not ready yet.

**Q: How do lexical environments support closures?**

When a function is created, JavaScript links it to the lexical environment where it was defined. Later, if that function runs after the outer function has returned, it can still resolve names through that saved outer chain. That preserved access is what makes closures work.

**Q: Is scope decided by where a function is called or where it is defined?**

For variable lookup, it is decided by where the function is defined. JavaScript uses lexical scoping, not dynamic scoping. The call site changes runtime values like arguments and, for normal functions, possibly `this`, but it does not rewrite the function's outer lexical environment chain.

## 6. The Traps — What Goes Wrong

One common mistake is thinking scope is one flat bag of variables. That mental model breaks as soon as inner and outer scopes use the same name.

```js
const outerRole = "viewer";

function render() {
  const innerRole = "admin";
  return innerRole;
}

console.log(outerRole); // "viewer"
console.log(render()); // "admin"
```

The wrong assumption is "JavaScript should somehow merge both values." What actually happens is simpler: the current lexical environment has the binding JavaScript needs, so lookup stops there.

Another trap is confusing "not found" with "in the temporal dead zone."

```js
{
  // console.log(token); // ReferenceError
  const token = "abc123";
}
```

This is not the same as reading a completely missing variable. The block environment already exists, and `token` belongs to it, but the binding is uninitialized until the declaration runs.

Another frequent bug is expecting `var` to behave like `let` inside loops or blocks. It does not get a fresh block lexical environment.

```js
for (var i = 0; i < 3; i += 1) {
  setTimeout(() => console.log(i), 0);
}

// Logs 3, 3, 3 because every callback shares the same function/global binding.
```

The fix is usually `let`, because each iteration gets its own block-scoped binding.

```js
for (let j = 0; j < 3; j += 1) {
  setTimeout(() => console.log(j), 0);
}

// Logs 0, 1, 2
```

One more trap is mixing up lexical environment lookup with object property lookup. Variable lookup walks outer environments. Property lookup walks an object's prototype chain. Both are "look outward until found" stories, but they are different systems solving different problems.

## 7. Compare With Related Concepts

**Lexical environment vs scope**

Scope is the rule about where a name is available. A lexical environment is the runtime structure that makes that rule work. Use "scope" for the concept and "lexical environment" for the actual lookup storage-and-link model.

**Lexical environment vs scope chain**

One lexical environment is one scope record plus its outer pointer. The scope chain is the whole linked path through many such environments. Use "lexical environment" when explaining a single level, and "scope chain" when explaining the search across levels.

**Lexical environment vs execution context**

An execution context is the broader runtime package for currently executing code. It includes things like the current lexical environment, variable environment, and `this` binding. The lexical environment is one part inside that bigger runtime picture.

**Lexical environment vs closure**

A lexical environment is the scope storage itself. A closure is a function that keeps using outer lexical environments after the outer code has finished. Use "lexical environment" to explain the mechanism and "closure" to explain the surviving behavior built on top of that mechanism.

**Lexical lookup vs prototype lookup**

Lexical lookup answers, "Where is this variable name declared?" Prototype lookup answers, "Where is this object property defined?" Use lexical environments for variable resolution and the prototype chain for property resolution.

## 8. 🧠 The Memory Hook — What Sticks

A lexical environment is JavaScript's labeled folder for the current scope plus a note pointing to the next outer folder. Variable lookup is just the engine opening the nearest folder first, then following the parent note outward until it finds the name. Closures work because some functions keep carrying that folder chain with them.
