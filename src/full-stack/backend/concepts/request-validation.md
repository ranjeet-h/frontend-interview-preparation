# Request Validation

## Detailed explanation

Request validation checks incoming params, query strings, headers, and bodies before business logic runs.

## 1. One-line mental model

Reject bad input at the boundary.

## 2. Problem it solves

Without validation, invalid data reaches services and databases, causing bugs, security issues, and unclear frontend errors.

## 3. Core idea

- Validate type, required fields, format, ranges, enums, and nested objects.
- Use schemas like Zod, Pydantic, Joi, Yup, or JSON Schema.
- Return field-level errors for frontend forms.
- Validate server-side even if frontend validates.
- Do not trust client-controlled fields like role or ownerId.

## 4. Visual / analogy

```txt
Security gate before business logic.
```

## 5. Minimal example

```txt
const body = createUserSchema.parse(req.body);
```

## 6. Real-world example

Registration API validates email, password length, accepted terms, and optional profile fields.

## 7. Common interview questions

1. What is Request Validation?
2. Why does Request Validation matter in backend systems?
3. How would you explain Request Validation in an interview?
4. What bugs happen when Request Validation is handled poorly?
5. How does Request Validation affect frontend clients?
6. How would you test Request Validation?

## 8. Active recall test

1. Explain Request Validation without looking at notes.
2. Give one production bug related to Request Validation.
3. Give one API or backend example where Request Validation matters.
4. Explain how a frontend client should react to Request Validation.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Request Validation is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Request Validation in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Request Validation in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
