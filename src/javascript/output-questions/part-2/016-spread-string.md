# Spreading a String into an Array

## The Code

```javascript
const result = [... 'John'];
console.log(result);
```

## The Answer

```text
[ 'J', 'o', 'h', 'n' ]
```

The spread syntax asks the value on its right for its iterator, then puts each value produced by that iterator into the surrounding array. Strings are iterable, and their iterator yields one character at a time, so the new array contains four strings: `"J"`, `"o"`, `"h"`, and `"n"`.

This does not split the string by a separator. It consumes the string's iteration behavior. That distinction matters for Unicode: the iterator works in Unicode code points, so it handles many characters more correctly than indexing the string by UTF-16 code units.

## Execution — Walk Through It Like the JS Engine

JavaScript first evaluates the string literal `"John"`. The spread element appears inside an array literal, so the engine needs to collect values for that array rather than store the string as one item.

The engine checks whether the string is iterable. Strings provide a built-in `Symbol.iterator` method. Calling that iterator creates an iterator state positioned before the first character.

The array literal repeatedly asks the iterator for its next value:

1. The first step produces `"J"`, which is appended to the new array.
2. The second step produces `"o"`, which is appended next.
3. The third step produces `"h"`.
4. The fourth step produces `"n"`.
5. The next step reports that iteration is complete, so array construction stops.

At this point `result` refers to a new array whose elements are the four yielded values. `console.log` then displays that array. The original string is not changed; strings are immutable, and spreading creates a separate container.

## The Concept This Question Tests

This question tests the relationship between spread syntax and iterables. Spread is not limited to arrays. It works with any value that implements the iterable protocol: the value must provide a method at `Symbol.iterator` that returns an iterator, and that iterator must return `{ value, done }` objects as it advances.

In an array literal, `...value` means “iterate over `value` and append every yielded value here.” Therefore these two expressions have different shapes:

```javascript
const oneItem = ["John"];
const fourItems = [..."John"];

console.log(oneItem); // ["John"]
console.log(fourItems); // ["J", "o", "h", "n"]
```

The string is one value in the first array, but it is consumed as an iterable in the second. The same protocol explains why spread works with arrays, sets, maps, and generator results. Plain objects are not iterable by default, so `{ ...object }` is object-spread syntax with different semantics; it copies enumerable own properties rather than consuming `Symbol.iterator`.

## The Trap — Why Most People Get It Wrong

The most common mistake is expecting the result to be `["John"]`. That would be true if the string were placed into an array as one ordinary element, like `["John"]`. The spread operator explicitly removes that outer container and inserts each iterated value instead.

Another mistake is treating spread as identical to `split("")` for every possible string. For ordinary ASCII text they appear equivalent, but JavaScript strings are stored as UTF-16 code units. String iteration understands surrogate pairs as one code point, while `split("")` can separate the two code units:

```javascript
console.log([..."😊"].length); // 1
console.log("😊".split("").length); // 2
```

Neither approach necessarily counts every human-perceived grapheme as one character. A visible grapheme can be made from multiple code points, such as a letter plus a combining mark or an emoji sequence. For user-facing character segmentation, use `Intl.Segmenter` when the runtime supports it.

It is also easy to forget that spread needs an iterable. This throws a `TypeError` because a plain object has no default iterator:

```javascript
// [...{ name: "John" }]; // TypeError: object is not iterable
```

Finally, spread creates a shallow new array. It does not recursively clone values yielded by the iterator, and it does not mutate the source string or any source array.

## 🧠 The Memory Hook

Spread means “open this value's iterator and pour its yielded values into the container.” A string's iterator pours out characters one by one, so `[..."John"]` becomes four array slots: `J`, `o`, `h`, `n`.
