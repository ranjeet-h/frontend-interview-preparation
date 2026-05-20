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
- How parse query string?
- Why use URLSearchParams?
- How handle repeated keys?
- How decode spaces?
- How parse numbers/booleans?

## 8. Active recall test
1. What built-in API exists?
2. What does `get` return if missing?
3. How get repeated keys?
4. Why decode?
5. What type are values?

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

