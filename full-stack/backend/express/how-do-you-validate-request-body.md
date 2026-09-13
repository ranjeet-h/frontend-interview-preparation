# How do you validate request body

## 1. The Real-World Problem — When You Actually Hit This

Your signup endpoint has been in production for months. One morning support forwards a ticket: a user account exists with no email address. While digging through the logs you find a burst of 500s — Mongoose throwing cast errors — traced back to a single `curl` command somebody ran straight at `/api/signup` with `{}` as the body. No form, no browser, no HTML validation. Just raw JSON hitting your server, and your handler happily doing exactly what it was told: creating a user from garbage.

Here is the uncomfortable truth it exposes: `express.json()` does not validate anything. It only *parses* — it converts the bytes on the wire into a JavaScript object and puts that object on `req.body`, verbatim. If the JSON is syntactically valid, it goes through, whatever it contains. Missing fields, negative prices, `"age": "banana"`, an extra `"isAdmin": true` smuggled in by an attacker — all of it lands in your handler untouched. The handler then feeds that junk into your database, your billing code, your emails. Some of it fails loudly as a 500 that pages you at 3am for a bug that is entirely the client's fault. Worse is the junk that doesn't fail — it inserts silently, and you find out from support tickets weeks later.

This is the moment every backend developer eventually hits: the realization that nobody checked the shipment before it reached the workshop. That check is request-body validation, and doing it well is what this page teaches.

## 2. The Analogy — Make the Mechanic Obvious

Think of a city building-permit office.

A construction crew (your route handler) is excellent at building, but it never looks at an application until the plans have cleared the permit window. The submitted plans (the request body) go to an examiner (the validation library), who compares them line by line against the building code book (the schema). Three things about this office matter, and each one maps to a real mechanic.

First, the window sits at a fixed spot in the hallway — *before* the crew's queue. Plans that never pass the window never reach the crew. If the office accidentally put the window behind the crew room, crews would start pouring concrete on unapproved plans. Middleware placement works exactly the same way.

Second, when plans are rejected, the examiner doesn't just shout "denied!" and slam the window shut. He fills out one correction sheet listing *every* violation and which code section each one breaks: "second exit missing (section 12.3), stairway width below minimum (section 8.1)." The architect fixes everything in one sitting and resubmits once. Compare that to an examiner who stops reading at the first violation — you'd fix one thing, resubmit, get rejected again, fix the next thing, over and over. Both examiners exist in the validation-library world, and choosing between them is a real design decision.

Third, when the plans pass, they come back *stamped*. The crew builds from the stamped set — the corrected, official version — not from whatever rough sketches the applicant first slid under the door. Validated data works the same way: the version your handler reads is the parsed, cleaned copy the validator produced, not the raw payload the client sent.

Keep this office in your head. Every piece of the technical explanation ahead is just giving names to things in that building.

## 3. The Full Explanation — How It Actually Works

Start with the pipeline. In our analogy, requests walk down a hallway past several windows before reaching any crew. In Express, that hallway is the middleware chain, described fully in [how does Express middleware work](how-does-express-middleware-work.md). A typical app looks like this:

```txt
request → helmet/CORS → express.json() → cookies → auth middleware → validate(schema) → handler
                                                                              ↑ the permit window
```

Order carries meaning here. Validation must come *after* the body parser, because until `express.json()` runs there is no `req.body` at all — the validator would inspect `undefined` and reject everything, or worse, crash. And it must come *before* the handler, because a checkpoint behind the workshop is decoration. Authentication sits wherever your rules need it — validation itself usually doesn't depend on who the caller is, but it must run before any code that *uses* the body. Each endpoint gets its own schema, just like each project brings its own relevant code book to the permit window, so validation is usually attached per-route rather than globally. The one middleware that always comes last is error handling — that contract lives in [what is error handling middleware](what-is-error-handling-middleware.md).

Now the mechanic itself. Strip away the libraries and a validator is a pure function: it takes data and a schema and returns either a cleaned version of the data or a structured list of problems. The schema is declarative — you describe what a valid body looks like (which fields exist, their types, their constraints) instead of writing `if` statements for each rule. The library walks the incoming object against that description and reports mismatches as *issues*, each carrying a path (where the problem is, including nested locations like `address.zip`), a message, and usually a machine-readable code.

Three libraries dominate Express work, and the choice between them is a genuine interview question.

**Zod** is the TypeScript-era favorite. Its signature trick is that one schema gives you both runtime checking and a compile-time type via `z.infer<typeof schema>` — the code book and the blueprint language are the same document. It offers two entry points: `schema.parse(data)` throws a `ZodError` on failure, while `schema.safeParse(data)` returns `{ success, data }` or `{ success, error }` without throwing. For middleware, `safeParse` is the natural fit because a rejection is an expected outcome, not an exceptional one. By default Zod *collects every issue it finds* in one pass, and it *strips keys you didn't declare* from the output — the stamped plans omit anything that wasn't in the code book.

**Joi** is the mature standalone option, around far longer than most of its users. Its one famous knob is `abortEarly`: by default Joi stops at the *first* error (`abortEarly: true`), which surprises people who expect the full correction sheet. Passing `abortEarly: false` turns on collect-all behavior. Knowing this default is a small detail that signals real experience.

**express-validator** takes a structurally different approach: instead of one object schema, each field check is itself a tiny middleware function you place inline in the route (`body('email').isEmail()`). It's built on `validator.js`, accumulates results on the request, and you collect them at the end with `validationResult(req)`. Checks accumulate by default; adding `.bail()` makes a field short-circuit. It fits teams who want per-field checks scattered visibly through the route, but it doesn't give you types and the checks live in a different place than the rest of your schemas.

Next: fail-fast versus collect-all-errors, the trade-off our two examiners embody. Collect-all sends the client one complete correction sheet — the user fixes everything and resubmits once. That is clearly better UX for forms humans fill in, and it costs almost nothing because schema checks are cheap, synchronous comparisons. Fail-fast stops at the first problem, which wins when later checks are expensive or meaningless without earlier ones — no point querying the database to check email uniqueness if the email isn't a valid string yet. The senior move is hybrid: run all the cheap structural checks together, then run expensive business checks only on data that survived. Match the policy to the caller too — human-facing endpoints lean collect-all, machine-to-machine endpoints often prefer fail-fast since there's no person filling out a form, just another service that wants a quick no.

Whatever policy you pick, the rejection has to be *shaped*. A good 400 response body has four properties. It is consistent — identical structure from every endpoint, so the frontend writes one error-handling routine, not twenty. It is field-addressed — each issue names its location (`address.zip`, not just "bad input"), so the UI can put the message next to the right input. It is bilingual — a machine-readable code plus a human-readable message. And it leaks nothing — no stack traces, no internals, and definitely not the submitted values echoed back (imagine reflecting someone's password in an error). It also uses the right status: 400, never 500. A 400 says "your request was broken," which is true; a 500 says "our server broke," which is false — and it pollutes your alerting, because now client bugs page on-call engineers. You'll occasionally see 422 Unprocessable Content argued for semantically-invalid-but-well-formed bodies; that's a defensible convention, but 400 is the common REST default. Pick one, write it down, and never mix them.

Last stop: what happens on success. The middleware attaches the *parsed* copy — `req.body = result.data` in Zod terms — and calls `next()`. This quiet line does three jobs at once. It guarantees correct types (strings that should be numbers become numbers, defaults get applied). It enforces shape discipline (unknown keys stripped, so a client cannot inject `role: "admin"` into an object you're about to store — the mass-assignment attack). And it hands the handler something trustworthy, so the handler contains zero defensive `if`s about shape. Cross-field rules that a flat schema can't express — "password must equal confirmPassword" — ride on refinements, which we'll show in the code. When something *does* slip past and blows up deeper in the stack, that's the error-middleware story in [what is error handling middleware](what-is-error-handling-middleware.md); validation's job is to make sure well-formed nonsense never gets that far.

## 4. See It In Practice — Real Code or Queries

A complete, production-shaped setup with Zod. Environment assumption: Node 18+, `"type": "module"` in package.json, dependencies installed with `npm i express zod`.

```js
// validators/signup.js — the code book and the window, together.
import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  password: z.string().min(8, "Password needs at least 8 characters"),
  age: z.number().int().min(18, "Must be 18 or older").optional(),
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    zip: z.string().regex(/^\d{5}$/, "Zip must be 5 digits"),
  }),
  tags: z.array(z.string()).max(10).default([]), // missing key gets a default
});

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // Rejection is expected, not exceptional — answer directly and
      // completely. The handler below will never see this request.
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body failed validation",
          details: result.error.issues.map((issue) => ({
            field: issue.path.join(".") || "body",
            message: issue.message,
          })),
        },
      });
    }

    // Swap raw input for the parsed copy: coerced types, applied
    // defaults, undeclared keys dropped. Downstream code trusts this.
    req.body = result.data;
    next();
  };
}
```

```js
// app.js — the parser runs before any router mounts. Always.
import express from "express";
import authRouter from "./routes/auth.js";

const app = express();
app.use(express.json()); // no req.body exists until this runs
app.use("/api/auth", authRouter);

export default app;
```

```js
// routes/auth.js — each route brings its own schema to the window.
import { Router } from "express";
import { signupSchema, validateBody } from "../validators/signup.js";
import { createUser } from "../services/users.js";

const router = Router();

router.post(
  "/signup",
  validateBody(signupSchema),
  async (req, res, next) => {
    try {
      // req.body is the stamped copy. No shape-checking ifs needed here.
      const user = await createUser(req.body);
      res.status(201).json({ id: user.id });
    } catch (err) {
      next(err); // non-validation failures belong to the error middleware
    }
  }
);

export default router;
```

Watch the same request from the client's seat — note the injected `admin` key vanishing and three problems reported at once:

```txt
POST /api/auth/signup
{ "email": "nope", "password": "short",
  "address": { "street": "1 Main St", "city": "Pune" },
  "admin": true }

HTTP/1.1 400 Bad Request
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body failed validation",
    "details": [
      { "field": "email",       "message": "Must be a valid email address" },
      { "field": "password",    "message": "Password needs at least 8 characters" },
      { "field": "address.zip", "message": "Zip must be 5 digits" }
    ]
  }
}
```

The same window in Joi — the entire point of this snippet is the flag:

```js
import Joi from "joi";

const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  address: Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    zip: Joi.string().pattern(/^\d{5}$/).required(),
  }).required(),
});

function validateBody(schema) {
  return (req, res, next) => {
    // abortEarly: false flips Joi from fail-fast (its default!) to
    // collect-all. Forget this flag and clients see one error at a time.
    const { value, error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          details: error.details.map((d) => ({
            field: d.path.join("."),
            message: d.message,
          })),
        },
      });
    }
    req.body = value; // Joi's cleaned copy, same idea as Zod's result.data
    next();
  };
}

export { validateBody };
```

And express-validator, where the checks *are* the middleware:

```js
import { body, validationResult } from "express-validator";

router.post(
  "/signup",
  body("email").isEmail().withMessage("Must be a valid email address"),
  body("password").isLength({ min: 8 }).withMessage("Needs at least 8 characters"),
  body("address.zip").matches(/^\d{5}$/).withMessage("Zip must be 5 digits"),
  (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          details: result.array().map((e) => ({ field: e.path, message: e.msg })),
        },
      });
    }
    // every check passed — proceed with req.body
  }
);
```

One more pattern worth memorizing — cross-field rules, which no flat field list can express. In Zod, refinements on the parent object see the whole parsed value:

```js
const changePasswordSchema = z
  .object({ password: z.string().min(8), confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"], // attach the complaint to the right field
  });
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Does Express have built-in request body validation?**

No, and being precise about this is the first credibility test. Express ships *parsing*: `express.json()` reads the stream and produces a plain JavaScript object on `req.body`. That is a format conversion, not a judgment. Once the object exists, Express has no opinion about it — any syntactically valid JSON reaches your handler untouched. Checking that the object means something is entirely your job, done with middleware and a schema library like Zod, Joi, or express-validator. People conflate the two because both happen near the start of the request, but they are different stages: parsing answers "can I read this?", validation answers "is this acceptable?"

**Q: Where does validation middleware go in the chain, and what breaks if you misplace it?**

After the body parser, before the handler — and the reasons are mechanical, not stylistic. Placed before `express.json()`, there is no `req.body` yet, so the validator inspects `undefined` and every request bounces with baffling "expected object" errors, or crashes outright. Placed after the handler, it's dead code: the handler already consumed whatever arrived, unvetted. Within those bounds you order it relative to auth deliberately — usually after authentication, since logged-in traffic is what carries meaningful bodies, and some validations (like checking a role field) only make sense knowing who's calling. Because schemas differ per endpoint, validation attaches per-route rather than globally; the things you validate identically everywhere (headers, auth) are the ones worth mounting globally. The full chain-ordering picture is in [how does Express middleware work](how-does-express-middleware-work.md).

**Q: Zod, Joi, or express-validator — how do you choose?**

Lead with the deciding factor, not the feature list. On a TypeScript project, Zod usually wins because one schema yields both the runtime check and the compile-time type (`z.infer`), so the code book and the blueprint can't drift apart. On a plain-JavaScript service, that advantage evaporates and Joi's maturity, rich rule set, and battle-testing carry the day. express-validator suits teams who want checks visible inline in the route and fine-grained per-field control, but it doesn't produce types and scatters the schema across the route file. Two practical tiebreakers: keep exactly one library per codebase (mixing two means two error formats and two mental models), and whichever you pick, wrap it in one `validateBody(schema)` middleware factory so every endpoint emits the same 400 shape and swapping libraries later touches one file.

**Q: What's the difference between `parse` and `safeParse` in Zod?**

Both run the same validation; they differ in how failure is delivered. `parse` throws a `ZodError` — appropriate when invalid data means a programmer bug, like validating your own internal config. `safeParse` returns a result object: `{ success: true, data }` or `{ success: false, error }`. Request bodies are *client* input, where rejection is an everyday outcome, not an exception — so `safeParse` fits middleware naturally: check the flag, send the 400, move on. If you do use `parse` and let the `ZodError` fly, you must catch it in your central error middleware and translate it to a 400 — otherwise every typo from a client surfaces as a 500. Either route works; the unforgivable version is throwing and *not* catching.

**Q: Fail-fast or collect-all-errors — which do you use and why?**

Say the trade-off out loud, then give the defaults, then give the hybrid. Collect-all runs every check and returns the complete correction sheet, which is what human users want — they fix everything in one round trip instead of discovering errors one submit at a time. Fail-fast returns the first problem, which wins when subsequent checks are expensive or dependent — don't hit the database for email uniqueness if the email isn't a valid string. Know the library defaults cold: Zod collects all issues in one pass; Joi *fails fast by default* (`abortEarly: true`) and needs the flag flipped; express-validator accumulates unless you add `.bail()`. The senior answer is layered: collect all the cheap structural failures synchronously, and only then run expensive business checks — possibly fail-fast — on survivors. Policy follows the audience: forms for humans collect, service-to-service calls often fail fast.

**Q: What does a good validation error response look like?**

Consistent, field-addressed, bilingual, and leak-free. Consistent: one shape from every endpoint — something like `{ error: { code, message, details: [{ field, message }] } } }` — so the frontend builds a single interceptor and can render messages beside inputs automatically. Field-addressed: paths use dot notation for nesting (`address.zip`) so the client maps each issue to a form element without guessing. Bilingual: a stable machine-readable `code` for programmatic branching, a human message for display. Leak-free: no stack traces, no internal details, and never echo the submitted values — reflecting someone's password back in an error is a real bug people really ship. Status code 400, decided once, documented, uniform. Teams arguing 400-versus-422 should just pick one convention and enforce it; mixing them across endpoints is worse than either choice.

**Q: Why must validation errors return 400 and not 500?**

Because status codes are a contract about *whose fault it is*, and monitoring acts on that contract. A 400 tells the client "your request was malformed — fix the request"; retrying unchanged is futile. A 500 tells the world "our server broke" — it triggers alerts, on-call pages, error-rate dashboards, and possibly automated retries. Return 500 for a client's bad payload and you've misclassified the incident twice: you page an engineer about a curl command, and your error-rate metric now hides real server failures inside noise. Validation failure is definitionally a client error — that's the 4xx family's whole purpose.

**Q: Should you validate on the frontend, backend, or both?**

Both, for opposite reasons. Frontend validation is UX: instant feedback, fewer doomed requests, no page reload. Backend validation is security: it is the only check an attacker cannot bypass, because curl doesn't run your React form. Anyone can post directly to your API with arbitrary JSON, so the backend must behave as if the frontend validated nothing — because from a trust standpoint, it did. The elegant bonus is sharing schemas: with Zod, the same schema object can drive form validation in the browser and middleware on the server, so both layers enforce literally the same rules. The one-liner for interviews: frontend validation is a courtesy, backend validation is the law.

**Q: How do you validate nested objects, arrays, and cross-field rules?**

Schemas compose — you nest descriptions inside descriptions, mirroring the data's shape exactly: an `address` field whose value must satisfy an inner object schema, a `tags` field defined as `array(string)` with max length. Arrays validate *every element*, not just the first — a schema library walking `[{ qty: 1 }, { qty: "many" }]` reports the second element's path explicitly (`items.1.qty`). Rules spanning multiple fields — password equals confirmPassword, end date after start date — don't fit any single field, so they attach to the parent as refinements: a function receiving the whole parsed object, returning violations with a chosen `path` so the error lands on the right field in the UI. The principle underneath: the schema should mirror the exact shape the handler consumes — every level, every element — because attackers don't confine malice to top-level keys.

**Q: How does schema validation protect against mass assignment and injection?**

Two mechanisms working together. First, allowlisting: a schema declares what *may* exist, and Zod strips everything else by default — so an attacker appending `"role": "admin"` or `"verified": true` to a signup body finds those keys simply gone from the parsed output, never reaching `Model.create(req.body)`. Hand-rolled checks tend to ask "are the required fields okay?" and ignore extras; a schema asks "does this object contain *only* what I declared?" Second, typing and coercion: values arrive as declared types, so a string where a number belongs is rejected rather than passed along to a driver that might interpret it structurally — the MongoDB `$gt: ""` login-bypass trick dies the moment `password` must be a string, a subject covered in [how do you prevent NoSQL injection](how-do-you-prevent-nosql-injection.md). Validation isn't the *only* defense — parameterized queries and ORM guards stay mandatory — but it kills whole attack classes at the door, before hostile data meets any query builder.

## 6. The Traps — What Goes Wrong in Production

**Validating before the body parser runs.** Someone adds `app.use(validateBody(anySchema))` above `app.use(express.json())` and suddenly every request fails with "expected object, received undefined" — including perfectly formed ones. The bug is invisible in the validator's code because the validator is fine; it's the hallway order that's wrong. The fix is remembering that `req.body` does not exist until `express.json()` executes, and placing every body-dependent middleware strictly below it.

**Throwing raw library errors into a 500.** With `schema.parse(req.body)` and no catch, a `ZodError` propagates up, Express's default handler responds 500 — misclassifying a client mistake as a server outage, paging on-call, and in dev mode leaking a stack trace to the caller. Fix it one of two ways: use `safeParse` and answer inline, or keep `parse` but add a branch in your central error middleware that recognizes validation errors and formats them as 400s — the pattern explained in [what is error handling middleware](what-is-error-handling-middleware.md). Either way, one formatter owns the shape.

**Spreading `req.body` into the database.** `Model.create(req.body)` feels harmless until a request arrives with `"isAdmin": true` attached, and now your own code wrote the attacker's field to disk. The vulnerability is called mass assignment, and it survives every per-field check you wrote for required keys — because the danger was the *extra* key. Schema-parsed data fixes it structurally: undeclared keys are gone before the handler runs, and `.strict()` mode can reject them loudly instead of silently dropping.

**Shallow validation.** Checking that `items` is an array but never inspecting its elements, or that `address` exists but never opening it, leaves the deep interior unguarded — which is precisely where payloads get poisoned, since `"items": [{"qty": -999}]` passes an isArray check with a smile. Schemas compose for a reason: mirror the full shape the handler consumes, arrays included, every level.

**Generic error bodies.** Responding `400 { "message": "Invalid input" }` is technically honest and practically useless — the user knows *something* is wrong, resubmits unchanged, fails again, and opens a support ticket. Field-addressed details turn one round trip into a fix. The frontend cannot render inline errors it can't locate.

**Echoing submitted values back in errors.** Reflecting the offending input feels helpful — until the reflected value is a password, a token, or a card number, now sitting in a log aggregator, an APM tool, and the client's screen. Validate shapes, report paths and messages, and never parrot secret values.

**Hand-rolling per-handler if-chains.** Each route grows its own pile of `if (!body.email) return res.status(400)...`, slightly differently worded, drifting apart over months until the same bad payload gets three different error shapes from three endpoints. Beyond the inconsistency, hand-rolled checks rarely coerce types or strip extra keys at all. One middleware factory plus one schema per route eliminates the drift class entirely.

## 7. Compare With Related Concepts

**Parsing versus validating.** Parsing converts bytes into a usable structure and fails only on malformed input; validating judges whether the structure is acceptable and fails on meaning. `express.json()` parses; your schema validates. A body of `{"email": 42}` parses perfectly and validates terribly. One sentence rule: parsing answers "can I read it?", validation answers "may I use it?"

**Validation versus sanitization.** Validation rejects — it decides pass or fail and explains why. Sanitization transforms — it scrubs dangerous content out of otherwise accepted values, like escaping HTML to neutralize script tags (see [how do you prevent XSS](how-do-you-prevent-xss.md)). They compose: validate that `bio` is a string under 500 chars, then sanitize its HTML. One sentence rule: validate to refuse bad input, sanitize to make trusted-enough input safe for its destination.

**API validation versus database constraints.** Schema validation at the boundary gives instant, friendly, field-level feedback and protects business logic; database constraints (`NOT NULL`, unique indexes, Mongoose validators) are the last line that holds even when a script, seed file, or buggy deploy bypasses your API entirely. They are not competitors — defense in depth is the design. One sentence rule: validate richly at the edge, constrain absolutely at the storage layer, and never believe the edge alone.

**express-validator versus object-schema libraries.** express-validator distributes checks across the route as per-field middleware; Zod and Joi centralize one composable object schema that can also generate types (Zod) or serve non-HTTP validation of any data. One sentence rule: per-field checks inline for small route-scoped needs, one central schema when you want reuse, consistency, and type inference.

**Frontend versus backend validation.** Frontend is experience optimization the user sees instantly; backend is the security boundary nobody can skip. Identical rules ideally, shared schemas possibly, but only one of them defends the database. One sentence rule: duplicate the rules deliberately, trust only the server copy.

## 8. 🧠 The Memory Hook

Your handler is a construction crew, and it builds only from **stamped plans**: every request body passes the permit window *before* the workshop, the examiner checks it against one code book, and rejections come back as a single correction sheet naming every violated section — never as a shrug, and never as a fire alarm (that's what 400 means, versus 500). If you woke up at 3am to answer "how do you validate request body?", start there: right place in the chain, one schema, complete correction sheet, stamped copy only.
