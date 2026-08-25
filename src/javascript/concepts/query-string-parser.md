# Query String Parser

## 1. Why This Exists — The Problem First

A product-list page often stores its state in a URL: `/products?query=wireless+keyboard&tag=office&tag=quiet&page=2`. That makes a filtered view bookmarkable, shareable, and restorable after a refresh. The bug starts when code treats this text like a simple object: a repeated filter disappears, `+` stays visible in the search box, or `page=abc` reaches a database query as if it were a valid number.

Query parsing is the boundary between untrusted URL text and application state. The parser must preserve the wire format's meaning first; application code can then validate and convert those strings into the types its feature needs.

## 2. The Analogy — Make It Obvious

Think of a parcel manifest attached to a shipment. The `?` marks where the manifest begins. Each `&` separates one line item. On each line, the first `=` separates the label from its contents. Percent-encoding is the packing tape used to transport characters that would otherwise look like separators, and repeated labels mean the manifest contains several items of the same kind.

The receiving desk must not throw away a second item just because the first item used the same label. It also must not decide that a label reading `"42"` is automatically a number: the manifest only carried text. `URLSearchParams` is the standards-aware receiving desk; a manual parser is a desk you build yourself, including its duplicate-key, decoding, malformed-input, and output-shape policies.

## 3. How It Actually Works — The Full Explanation

The query component is the text after `?` and before `#`. For example, in `/products?tag=office&tag=quiet#reviews`, the query is `tag=office&tag=quiet`; the fragment is not part of it. `location.search` includes the leading `?`, while `new URL(location.href).searchParams` gives a parser for the URL's query.

`URLSearchParams` parses the query as an ordered list of name/value pairs, not as a one-value-per-name object. The important operations are:

- `get(name)` returns the first matching value, or `null` if the name is absent.
- `getAll(name)` returns every matching value in input order.
- `has(name)` checks whether a name exists, even when its value is empty.
- `entries()`, `keys()`, and `values()` preserve the pair sequence, including duplicates.
- `set(name, value)` replaces all existing pairs for that name with one pair; `append(name, value)` adds another pair.
- `toString()` serializes the current list using URL form encoding.

Values are strings. A URL has no type metadata, so `page=2` is not the number `2`, and `enabled=false` is not the boolean `false`. Convert only after validating the feature's allowed range and vocabulary. In particular, `Boolean("false")` is `true` because every non-empty string is truthy.

The form-encoding rules explain a common surprise: `URLSearchParams` reads `+` as a space, while `decodeURIComponent("+")` leaves it as `+`. Percent escapes such as `%26` decode to `&` after the pair boundaries have already been found. That ordering matters; decoding the whole query before splitting could turn encoded data into separators.

Manual parsing therefore has a deliberate sequence: remove one leading `?`, split pairs on `&`, split each pair at its first `=`, translate `+` to a space, decode each component, and apply a duplicate-key policy. A value such as `redirect=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1` must remain one value even though its decoded form contains `=`. `URLSearchParams` also handles a flag such as `?debug` as the pair `debug` with an empty value and ignores empty pair segments such as the one between `a=1&&b=2`.

The parser does not make input safe or meaningful. A query value can still be an open redirect, an invalid page number, an oversized limit, or a string containing markup. Parsing gives structure; validation, authorization, output encoding, and business rules remain separate steps.

## 4. Real Code — See It Working

For ordinary browser code, use the built-in API and keep repeated values as repeated values until the feature chooses a shape:

```js
// This fixture makes the example runnable in Node as well as understandable in a browser.
const requestUrl = new URL(
  "https://shop.example/products?query=wireless+keyboard&tag=office&tag=quiet&page=2",
);

const params = requestUrl.searchParams;
const pageText = params.get("page");
const page = Number(pageText);

if (!Number.isInteger(page) || page < 1 || page > 100) {
  throw new Error("page must be an integer from 1 to 100");
}

const filters = {
  query: params.get("query") ?? "",
  tags: params.getAll("tag"),
  page,
};

console.log(filters);
// { query: "wireless keyboard", tags: ["office", "quiet"], page: 2 }
```

`Object.fromEntries(params)` is convenient only when the application intentionally wants one value per name. With duplicate names, the later entry overwrites the earlier one:

```js
const params = new URLSearchParams("tag=office&tag=quiet");

console.log(Object.fromEntries(params));
// { tag: "quiet" }

console.log(params.getAll("tag"));
// ["office", "quiet"]
```

Here is a complete manual parser for a flat object whose repeated keys become arrays. It uses the first `=` only, handles form-style `+` spaces, and treats a missing value as an empty string. The output policy is explicit rather than pretending that every query should become a JSON object:

```js
function decodeQueryComponent(component) {
  // WHY: application/x-www-form-urlencoded uses + for a space.
  return decodeURIComponent(component.replace(/\+/g, " "));
}

function parseQueryString(input) {
  const query = input.startsWith("?") ? input.slice(1) : input;
  const result = Object.create(null);

  if (query === "") return result;

  for (const pair of query.split("&")) {
    if (pair === "") continue;

    const separator = pair.indexOf("=");
    const rawName = separator === -1 ? pair : pair.slice(0, separator);
    const rawValue = separator === -1 ? "" : pair.slice(separator + 1);
    const name = decodeQueryComponent(rawName);
    const value = decodeQueryComponent(rawValue);

    if (name in result) {
      result[name] = Array.isArray(result[name])
        ? [...result[name], value]
        : [result[name], value];
    } else {
      result[name] = value;
    }
  }

  return result;
}

console.log(parseQueryString("?tag=office&tag=quiet&redirect=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1&debug"));
// {
//   tag: ["office", "quiet"],
//   redirect: "https://example.com/a?x=1",
//   debug: ""
// }
```

This manual function is useful for understanding an interview exercise, but production code should normally use `URLSearchParams`. The native API has well-defined behavior for malformed percent escapes and serialization details that a small custom function can easily get wrong. If a custom grammar is required, define and test that grammar instead of quietly assuming it matches the platform API.

Serialization is the reverse boundary. Pass values as strings and let the API encode separators and spaces:

```js
const params = new URLSearchParams();
params.set("query", "wireless keyboard");
params.append("tag", "office");
params.append("tag", "quiet");

const url = new URL("https://shop.example/products");
url.search = params;

console.log(url.href);
// https://shop.example/products?query=wireless+keyboard&tag=office&tag=quiet
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between `URLSearchParams` and `Object.fromEntries(new URLSearchParams(...))`?**

`URLSearchParams` retains an ordered list of pairs and can retrieve all values with `getAll`. `Object.fromEntries` collapses that list into ordinary object properties, so duplicate names become last-write-wins. Use the object conversion only when that loss is intentional.

**Q: Why does `URLSearchParams("q=hello+world").get("q")` return `"hello world"` but `decodeURIComponent("hello+world")` return `"hello+world"`?**

`URLSearchParams` follows form-style query decoding, where `+` represents a space. `decodeURIComponent` only decodes percent escapes; it does not assign special meaning to `+`. A manual form parser must replace `+` before calling it.

**Q: Why split a pair at the first `=` instead of calling `pair.split("=")`?**

The value may contain an encoded or literal `=`. `redirect=https://example.com/a?x=1` has one key and a value containing another equals sign. Splitting at the first separator preserves the entire remainder as the value.

**Q: What do missing, empty, and repeated parameters look like?**

For `?flag&empty=&tag=a&tag=b`, `get("flag")` and `get("empty")` both return `""`; `has("flag")` is still true; and `getAll("tag")` returns `["a", "b"]`. A completely absent name makes `get` return `null`, not an empty string.

**Q: Are query values automatically numbers or booleans?**

No. They are strings. Parse a number with a deliberate rule such as `Number(value)` followed by `Number.isInteger` and range checks. For booleans, compare an allowed string such as `value === "true"`; never use `Boolean(value)` to interpret the text `"false"`.

**Q: Can `new URLSearchParams` parse a full URL?**

Not in the way many people expect. `new URLSearchParams("https://example.com/?q=react")` treats that entire string as query text, rather than first extracting the URL's search component. Use `new URL(fullUrl).searchParams`, or pass only `url.search` when you already have a URL string.

**Q: Does parsing make a query parameter safe to use?**

No. It only turns transport text into structured strings. A redirect target still needs an origin/path policy, a page number still needs bounds, and text inserted into HTML still needs context-appropriate output encoding. Treat every URL parameter as user-controlled input.

## 6. The Traps — What Goes Wrong

**Blindly using `Object.fromEntries`.** A multi-select UI serialized as `tag=office&tag=quiet` loses `office` when converted to an object. Read repeated fields with `getAll`, or intentionally accumulate them while parsing.

**Decoding before finding separators.** `%26` represents data containing an ampersand. If the whole query is decoded before splitting, that data can be mistaken for a second pair. Find the raw pair boundaries first, then decode each name and value.

**Using `split("=")` without a limit.** A URL, token, or expression can contain `=`. Use the first separator and keep the remainder intact.

**Assuming missing and empty mean the same thing.** `get("page")` returning `null` means no `page` pair was present. Returning `""` means the pair existed without a value, such as `?page=`. Defaults and validation may choose to treat them alike, but the parser does not.

**Calling `decodeURIComponent` without handling malformed input.** The global decoder can throw a `URIError` for malformed percent escapes. `URLSearchParams` has its own forgiving decoding behavior. If a custom parser uses the global decoder, decide whether malformed input should be rejected or converted to a controlled error; do not let an unexpected exception become a 500 response or a broken page.

**Converting types too early or too loosely.** `Number("")` is `0`, and `Boolean("false")` is `true`. Validate presence, syntax, range, and allowed strings before constructing application state.

**Confusing query strings with fragments.** The server receives the query component in an HTTP request, but the `#fragment` is handled by the browser and is not sent as part of that request. If a client feature stores state after `#`, `location.search` will not contain it.

**Putting secrets in query parameters.** Query strings can appear in browser history, copied links, referrer data, access logs, and analytics. Parsing a value correctly does not make it appropriate for credentials, session tokens, or other sensitive data.

## 7. Compare With Related Concepts

**`URLSearchParams` vs a manual parser.** The built-in API supplies platform-defined parsing, repeated-value operations, and serialization. A manual parser exposes the algorithm and can support a deliberately different output shape, but it owns every edge case and must be tested. Use `URLSearchParams` for normal URL query work; implement manually when the exercise or a non-standard grammar specifically requires it.

**`get` vs `getAll`.** `get` is for a field whose feature contract uses one value and returns the first occurrence. `getAll` is for repeated filters, checkboxes, and other multi-value fields. Choose based on the data contract, not whichever method is shorter.

**Query parameters vs route parameters.** `/products/42` uses the path to identify the resource; `/products?sort=price&page=2` uses the query to modify the representation or view. Route parameters are usually required identity components, while query parameters are optional input—but both are untrusted strings that require validation.

**Parsing vs validation.** Parsing answers “what pairs did the URL contain?” Validation answers “is this value allowed for this operation?” Keep them separate so a syntactically valid `page=999999` or `redirect=https://other.example` cannot slip through as trusted state.

**Query strings vs request bodies.** A query string is useful for safe-to-share, cache-visible selection state such as search, filters, and pagination. A request body is generally a better place for larger or sensitive input, but it still requires validation and does not automatically become safe merely because it is not in the URL.

## 8. 🧠 The Memory Hook — What Sticks

Treat the query as an ordered manifest, not a one-value object: split the raw lines first, decode each item second, preserve duplicate labels when the feature needs them, and type-check only at the application boundary. `URLSearchParams` is the receiving desk; validation is the security guard who decides whether the received value may enter.
