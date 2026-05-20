# Query String Parser

## Detailed explanation
Query string parser converts URL query text into usable key/value data. Built-in `URLSearchParams` handles most production needs. Implementing parser tests string parsing, decoding, repeated keys, empty values, and edge cases.

Frontend use: filters, pagination, search params, shareable state.

## 1. One-line mental model
Query parser turns `?page=2&q=react` into structured data.

## 2. Problem it solves
Apps need read URL state for routing and filters.

## 3. Core idea
- Remove leading `?`.
- Split pairs by `&`.
- Split key/value by `=`.
- Decode components.
- Decide repeated key behavior.

## 4. Visual / analogy
Query string is compact form data in URL.

```txt
?q=react&page=2 -> { q: "react", page: "2" }
```

## 5. Minimal example

```js
Object.fromEntries(new URLSearchParams("?q=react&page=2"));
```

## 6. Real-world example

```js
const params = new URLSearchParams(location.search);
const page = Number(params.get("page") ?? 1);
```

## 7. Common interview questions

#### How parse query string?
- **The Engine Mechanism (Why it behaves this way):** A query string is a raw string of ASCII-compatible characters appended to a URL. To parse it manually, the engine must:
  1. Strip the leading question mark `?` (if present) to prevent it from being parsed as part of the first key.
  2. Split the remaining string into key-value pair strings using the `&` delimiter.
  3. Iterate over each pair, splitting it into a key and value by the first occurrence of the `=` delimiter (to handle cases where the value itself contains nested `=` characters).
  4. Pass each key and value through `decodeURIComponent()` to resolve percent-encoded strings (like `%20` to spaces or `%40` to `@`).
  5. Assemble the result into a JavaScript object, handling edge cases such as missing values (`?flag` yielding `flag: ""` or `flag: true` depending on spec), and accumulating duplicate keys into array values.
- **The Unforgettable Mental Model:** A cargo train carrying coupled cars. First, you unhook the engine (`?`). Next, you split the train at every coupling joint (`&`). Then, for each car, you separate the cargo box from its serial label (`=`), unload the cargo, unpack the shrink-wrapped boxes (decode percentages), and file them into catalog drawers (the output object).
- **The Trap:** Splitting on `=` blindly using `pair.split('=')`. If a query parameter value is itself a URL (e.g. `?redirect=https://site.com/callback?code=123`), splitting blindly will split the redirect URL value into separate array elements, destroying the query state. Always locate the index of the first `=` using `indexOf('=')` and split the string manually at that exact index.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: To parse a query string manually, we must first strip the leading `?` character, then split the segment by `&` to isolate individual key-value pairs. Each pair must be carefully split by the first `=` occurrence—using `indexOf` to avoid corrupting nested URL values—and decoded using `decodeURIComponent`. Finally, we reduce these pairs into a structured object, implementing accumulator logic to collect duplicate keys into arrays."

#### Why use URLSearchParams?
- **The Engine Mechanism (Why it behaves this way):** `URLSearchParams` is a built-in browser host utility conforming to the Living Standard URL specification. Written in highly optimized C++ in browser engines, it handles all raw query string parsing natively. It provides highly reliable, standard-compliant algorithms for complex edge cases—such as parsing percent-encoded strings, handling leading/trailing whitespace, normalizing special characters, resolving legacy `+` symbols as spaces, and supporting iteration interfaces (like `keys()`, `values()`, and `entries()`).
- **The Unforgettable Mental Model:** A Swiss Army knife vs a rusty pocketknife you found in a drawer. While you can manually try to cut a branch with the pocketknife (custom parser), the Swiss Army knife (`URLSearchParams`) has a perfectly engineered, sharp saw, scissors, and file designed specifically to handle all wood types (edge cases) without breaking.
- **The Trap:** Assuming `URLSearchParams` parses nested arrays or objects (like `?filters[0]=active` or `?user.age=25`) automatically. It treats these complex structures strictly as flat string keys (`"filters[0]"` and `"user.age"`), so you must still write custom parser logic to de-serialize structured, deeply nested query states.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `URLSearchParams` is the standard, browser-native API designed for query string operations. It runs on highly optimized, spec-compliant C++ engines, automatically resolving percent-encodings, correctly converting `+` symbols to spaces, and natively offering clean iterator interfaces. For production code, relying on `URLSearchParams` is mandatory as it eliminates the dozens of edge-case bugs associated with manual regex-based parsers."

#### How handle repeated keys?
- **The Engine Mechanism (Why it behaves this way):** URL specifications allow the same key to appear multiple times in a query string (e.g. `?color=red&color=blue`). There are three approaches to handling these duplicates:
  1. **Last-Write-Wins:** The last value overrides all previous ones (e.g., yielding `{ color: 'blue' }`). This is the default behavior of `Object.fromEntries(new URLSearchParams(...))`.
  2. **Array Accumulation:** Detecting if a key already exists in the accumulator object. If it does, convert the value into an array (if not already) and push the new value (yielding `{ color: ['red', 'blue'] }`).
  3. **MultiMap Interface:** The browser's native `URLSearchParams` utilizes a MultiMap internally. Calling `.get('color')` returns the *first* matching value (`'red'`), while calling `.getAll('color')` returns a complete array of all matching values (`['red', 'blue']`).
- **The Unforgettable Mental Model:** A filing cabinet. When a folder already exists for a label (e.g. "Color"), instead of throwing out the old document and replacing it with the new one (Last-Write-Wins), you open the folder, put both papers inside, and write an index list on the cover (Array Accumulation).
- **The Trap:** Standardizing on Last-Write-Wins when parsing multi-select filters. If your UI has a checkbox group (like select categories) and you use `Object.fromEntries`, refreshing the page will strip out all categories except the last one, breaking the user's active filter state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Repeated keys can be handled in a few ways depending on requirements. Standard serialization via `Object.fromEntries` uses a last-write-wins strategy, which discards historical values. For multi-value fields like checkbox arrays, we must accumulate duplicates into client-side arrays. Natively, `URLSearchParams` resolves this by exposing a `.getAll()` method, returning all collected values for a given key as a clean array."

#### How decode spaces?
- **The Engine Mechanism (Why it behaves this way):** The query component of a URL has historical encoding rules. Spaces can be represented as `%20` or as a literal plus sign `+` (derived from application/x-www-form-urlencoded media type standards). The global function `decodeURIComponent()` converts `%20` back into a space, but leaves `+` characters completely untouched. To parse a query string fully and accurately, the parser must preemptively replace all `+` characters with literal space characters `" "` *before* passing the string to `decodeURIComponent()`. Natively, `URLSearchParams` handles this replacement internally.
- **The Unforgettable Mental Model:** A strict foreign translator who knows how to translate formal encoding syntax (%20) but doesn't understand street slang (the plus sign `+` meaning space). To help the translator understand, you must manually run through the text and swap out the slang symbols with standardized text before handing it to them.
- **The Trap:** Blindly using `decodeURIComponent(location.search)` without replacing `+` signs first. If the search query contains `?q=react+router`, it will render in your UI as `"react+router"`, which is highly unprofessional and breaks exact matches in search filters.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Decoding query strings requires careful handling of spaces. While standard URL encoding translates spaces to `%20`, forms often encode them as `+` symbols. Because the native `decodeURIComponent` utility does not convert `+` signs into spaces, a manual parser must replace all `+` characters with a literal space character before decoding, whereas `URLSearchParams` handles this translation natively."

#### How parse numbers/booleans?
- **The Engine Mechanism (Why it behaves this way):** Out of the box, URL strings contain no type metadata; every query parameter value parsed by `URLSearchParams` or manual parsers is strictly returned as a primitive `string`. To convert these into true JavaScript booleans or numbers, you must apply explicit type coercion or schema parsing. For booleans, you cannot simply cast `Boolean("false")` as it evaluates to `true` (non-empty strings are truthy). Instead, check for exact equality: `value === 'true'`. For numbers, use `Number(value)` or `parseFloat()`, verifying if the output is `NaN` before saving it to your application state.
- **The Unforgettable Mental Model:** A customs inspector receiving boxes of goods. Even if a box is labeled "123" or "true", it is still a cardboard container (a String). The inspector must physically open the box, verify the items inside, and transfer them into designated metal slots (Numbers) or boolean switches to ensure the factory machines can read the values correctly.
- **The Trap:** Relying on implicit numeric coercion for state. For example, if a page query parameter is missing and evaluates to `undefined`, calling `Number(undefined)` yields `NaN`, which can crash chart components or offset parameters. Always define robust fallback values.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: URL query values are inherently strings. To normalize them into boolean or numeric types, we must perform explicit verification. For booleans, we compare the string value directly to the literal string `'true'`. For numbers, we cast via `Number()` or `parseFloat` while validating that the result is not `NaN`. In large production applications, this parsing is best done using schema validation libraries like Zod to ensure type-safe parameters."

## 8. Active recall test

#### 1. What modern, built-in browser API handles query string parsing and serialization natively?
`URLSearchParams`.

#### 2. What value does URLSearchParams.prototype.get() return if the queried parameter is completely missing from the query string?
It returns `null`.

#### 3. How do you retrieve all duplicate values associated with a single repeated key in a query string using URLSearchParams?
By calling the `.getAll(key)` method, which returns a complete array of all corresponding value strings.

#### 4. Why must raw query strings undergo decoding during the parsing phase?
Because URLs are legally restricted to standard ASCII characters. Any special characters, symbols, or spaces are percent-encoded during URL transport, and must be translated back via decoding to prevent UI data corruption.

#### 5. What are the primitive data types of all values parsed directly from location.search?
They are strictly primitive strings. Any numeric or boolean representations must be parsed explicitly.

## 9. Mistakes / traps
- Forgetting URL decoding.
- Losing repeated keys with Object conversion.
- Treating all values as numbers.
- Not handling empty query.

## 10. Compare with related concepts
- **URLSearchParams vs manual parser:** built-in robust API vs interview implementation.
- **Query params vs route params:** optional view state vs path identity.
- **Parse vs serialize:** read URL vs create URL.

## 11. Summary from memory
Explain how to parse pagination/filter params safely.

## 12. Spaced revision prompts
- 1 day: Use URLSearchParams.
- 3 days: Handle repeated keys.
- 7 days: Implement basic parser.
- 14 days: Parse typed filter state.

