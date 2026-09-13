# How Do You Handle Unique Fields?

## 1. The Real-World Problem — When You Actually Hit This

Your signup endpoint has been working fine for months. One day, you get a support ticket: two users both registered with the same email address, and now they're both receiving each other's password reset emails. You check the code and see a `findOne` check before the insert — that should have prevented this. But under load, two requests hit the endpoint at the exact same millisecond. Both see no existing user, both insert, and both succeed because you never added a database-level unique constraint.

Even worse, when you finally add `unique: true` to the Mongoose schema, your API starts returning raw MongoDB error messages to users. The error log shows `E11000 duplicate key error collection: app.users index: email_1 dup key`, but your frontend is trying to parse this unstable string. Users see "internal server error" when the actual problem is just that their email is already taken.

## 2. The Analogy — Make the Mechanic Obvious

Think of a hotel front desk assigning room numbers. The receptionist can check the computer system and tell you that room 305 appears to be available. That's like your application doing a `findOne` before inserting — it's helpful, but it's not a guarantee. If two receptionists check at the same time and both see room 305 as free, they might both assign it to different guests.

The actual guarantee comes from the electronic lock system in the door. Once a key card is programmed for room 305, the door lock won't accept any other key card for that room. Even if three receptionists all try to assign room 305 simultaneously, the lock system physically prevents the second and third assignments from working.

In this analogy, the receptionist's computer check is your `findOne` availability check, and the electronic lock system is MongoDB's unique index. Mongoose's `unique: true` is just the instruction to install that lock — it's not the receptionist checking the computer, and it's not a validator that runs before the lock engages.

## 3. The Full Explanation — How It Actually Works

**What `unique: true` actually does**

When you add `unique: true` to a Mongoose schema field, Mongoose doesn't validate anything during the `validate()` phase. Instead, it tells MongoDB to create a unique index on that field. The index lives in the database, not in your application code. When you try to insert or update a document, MongoDB checks that index before accepting the write. If another document already has that indexed value, MongoDB rejects the write with error code `11000`.

This is fundamentally different from Mongoose validators like `required`, `min`, or `match`. Those validators run in your Node.js process before data is sent to MongoDB. They check whether a single document's data is shaped correctly. A unique index checks whether the entire collection already contains that value. The distinction matters because validators can't prevent race conditions — two requests can both pass validation and both try to insert the same value. Only the database index can stop the second one.

**The index must actually exist**

Adding `unique: true` to your schema doesn't immediately create the index. In development, Mongoose may build indexes automatically when your application starts. In production, most teams disable this with `autoIndex: false` because building indexes on large collections can be slow and resource-intensive. Instead, they deploy indexes through migration scripts or call `Model.syncIndexes()` during a controlled deployment window.

This means your schema file is not proof that the index exists. A failed migration, a configuration error, or a deployment race can leave production running without the unique constraint you thought you had. Always verify with `db.collection.getIndexes()` in the MongoDB shell or `Model.listIndexes()` in your code.

**Normalization matters**

Before you enforce uniqueness, decide what "the same" means. If you want emails to be case-insensitive, you need to normalize values to a consistent form before both reads and writes. Adding `trim: true` and `lowercase: true` to your schema helps for normal document saves, but it doesn't fix existing data and it doesn't handle update operations that bypass the schema's setters.

The unique index only cares about the exact value it receives. If you have `User@Example.com` in the database and try to insert `user@example.com`, a plain unique index will allow both because the strings are different. You need to either normalize at the application layer or use a case-insensitive collation on the index. The normalization approach is usually simpler and more predictable across different services.

**Compound uniqueness for scoped constraints**

Sometimes uniqueness isn't global — you might want one email per organization rather than one email across the entire system. A compound unique index handles this:

```js
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
```

This allows the same email to exist in different organizations, but prevents duplicates within the same organization. The order of fields in a compound index matters for queries, but for uniqueness, it's the combination that matters.

**Optional fields and partial indexes**

If a field is optional, a normal unique index can cause surprising behavior. MongoDB's default indexing rules treat missing values and `null` values in specific ways that can make multiple documents without that value collide. If you want uniqueness only when the field is present, use a partial index:

```js
userSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: { phone: { $type: "string", $gt: "" } }
  }
);
```

This index only includes documents where `phone` is a non-empty string. Documents without a phone number, with `null`, or with an empty string don't participate in the uniqueness constraint.

**The race condition you can't code around**

This pattern is not safe by itself:

```js
if (await User.exists({ email })) {
  return res.status(409).json({ code: "EMAIL_TAKEN" });
}
await User.create({ email });
```

Two concurrent requests can both pass the `exists` check before either one reaches the `create` call. The check is useful for user experience — it lets you return a friendly error message in the common case without hitting the database twice. But you must always wrap the write in error handling that catches code `11000`. The database index is the only thing that closes the race.

**Error mapping at the API boundary**

When MongoDB rejects a duplicate, it returns a `MongoServerError` with code `11000`. The error message includes the collection name, index name, and the conflicting value. Don't return this raw message to clients — it exposes internal schema details and creates an unstable contract that might break if you rename indexes or change your schema. Instead, map the error at your API boundary:

```js
if (error.code === 11000) {
  return res.status(409).json({
    code: "EMAIL_TAKEN",
    message: "That email is already in use."
  });
}
```

Log the full error details server-side for debugging, but return only a stable, business-level error code to the client. This also applies to update operations — changing a user's email can collide with another user's existing email.

## 4. See It In Practice — Real Code or Queries

Here's a complete Express endpoint that handles unique email correctly. It normalizes the value, waits for the index to exist, catches duplicate errors, and returns a stable API response:

```js
const express = require("express");
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    displayName: { type: String, required: true, trim: true },
  },
  { autoIndex: false }
);

const User = mongoose.model("User", userSchema);
const app = express();
app.use(express.json());

function isDuplicateKeyError(error) {
  return error && error.code === 11000;
}

app.post("/users", async (req, res, next) => {
  try {
    const user = await User.create({
      email: req.body.email,
      displayName: req.body.displayName,
    });
    return res.status(201).json({ id: user.id, email: user.email });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({
        code: "EMAIL_TAKEN",
        message: "That email is already in use.",
      });
    }
    return next(error);
  }
});

async function start() {
  await mongoose.connect("mongodb://127.0.0.1:27017/unique-fields-demo");
  // Explicitly create indexes before accepting traffic
  await User.createIndexes();
  app.listen(3000, () => console.log("Listening on port 3000"));
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

If two concurrent requests arrive with `Ada@Example.com` and `ada@example.com`, both normalize to `ada@example.com`. One insert succeeds. The other hits the unique index, receives error code `11000`, and the route returns HTTP `409 Conflict` with the stable `EMAIL_TAKEN` code. The client sees a predictable business error, not a database-internal message.

To verify the index exists in the MongoDB shell:

```javascript
use unique-fields-demo
db.users.getIndexes()
// Look for an index with key: { email: 1 } and unique: true
```

Before adding a unique index to an existing collection that already has data, you must find and resolve duplicates first. This aggregation identifies repeated normalized emails:

```javascript
db.users.aggregate([
  {
    $set: {
      normalizedEmail: { $toLower: { $trim: { input: "$email" } } }
    }
  },
  {
    $group: {
      _id: "$normalizedEmail",
      ids: { $push: "$_id" },
      count: { $sum: 1 }
    }
  },
  { $match: { count: { $gt: 1 } } }
])
```

Resolve the duplicates by merging accounts, renaming emails, or applying whatever business rule makes sense for your application. Only then create the unique index.

For a compound unique index scoped to an organization:

```js
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
```

This allows `user@example.com` to exist in organization A and organization B, but prevents it from appearing twice within the same organization.

## 5. Interview Questions — All of Them, Done Properly

**Q: Does `unique: true` in Mongoose validate the field?**

No. `unique: true` is not a validator. It tells Mongoose to ask MongoDB to create a unique index on that field. The actual enforcement happens at the database level when you try to insert or update. When a duplicate is detected, MongoDB returns error code `11000`, which is a database error, not a Mongoose validation error. Validators like `required`, `min`, and `match` run in your application code before data is sent to MongoDB. The unique index runs in MongoDB after the data arrives.

**Q: Why would you still do a pre-check with `findOne` if the unique index is required?**

The pre-check is an optimization for the common case. If the email is already taken, you can return a friendly error immediately without attempting the database write. This saves a round-trip and provides better user experience in the normal situation. But the pre-check cannot guarantee uniqueness because another request can insert a document with that value between your check and your insert. The unique index is the authoritative guarantee — you must always handle the duplicate error even if you do a pre-check.

**Q: How do you make email uniqueness case-insensitive?**

First, decide on your product rule and document it. The most common approach is to normalize emails to a canonical form — typically trimmed lowercase — before both querying and writing. Add `trim: true` and `lowercase: true` to your schema field, but also normalize existing data in a migration before enabling the unique index. An alternative is to use a case-insensitive collation on the index itself, but this requires that every query against that field uses the same collation, and you need to understand how locale and strength settings affect comparisons. Normalization at the application layer is usually simpler and more predictable.

**Q: What do you do when you need to add a unique index to a collection that already has duplicate data?**

First, write a query to identify the duplicates based on the exact key the index will enforce. Group the documents by that key and find any groups with more than one document. Then resolve the duplicates through a documented migration — you might merge the duplicate accounts, append a suffix to make them unique, or delete the older ones depending on your business logic. Only after the data is clean should you create the unique index. Monitor the index build separately from application startup, especially on large collections, because the build can fail or take significant time.

**Q: What HTTP status code should your API return for a duplicate key error?**

The standard choice is `409 Conflict`, which indicates that the request conflicts with the current state of the target resource. Return a stable application error code like `EMAIL_TAKEN` or `USERNAME_TAKEN` along with a user-friendly message. Log the full database error details server-side, including the index name and correlation ID, for debugging purposes. But don't expose the raw MongoDB error message to the client — it contains internal implementation details that might change and could leak information about your schema.

**Q: How do unique indexes behave on optional fields?**

It depends on the field type and MongoDB's indexing rules. For strings, a normal unique index treats missing values in specific ways that can cause multiple documents without that value to be considered duplicates. If you want uniqueness only when the field is present and non-empty, use a partial index with a filter expression. Test the three cases explicitly: documents without the field, documents with the field set to `null`, and documents with an empty string. A partial index with `{ $type: "string", $gt: "" }` ensures only actual non-empty string values participate in uniqueness.

**Q: Can you rely on client-side availability checks to prevent duplicates?**

No. A client-side check that shows "username available" in the UI can become stale by the time the user submits the form. Another user might claim that username in the milliseconds between the check and the submission. The server must always handle the duplicate error deterministically. The client-side check is purely for user experience — it reduces frustration by showing likely conflicts early — but it cannot be the source of truth.

## 6. The Traps — What Goes Wrong in Production

**Treating `unique: true` as a validator.** If you call `doc.validate()` and it passes, that doesn't mean the value is actually unique. Validation runs in your application before the data reaches MongoDB. The unique index is enforced by the database during the write. Two documents can both pass validation with the same value; only the database write will detect the collision.

**Assuming the index exists because the schema says so.** Your schema file is not proof that the index actually exists in the database. If `autoIndex` is disabled, if a migration failed, or if there was a deployment error, production might be running without the unique constraint. Verify indexes during deployment with `Model.listIndexes()` or the MongoDB shell, and alert on index creation failures.

**Returning duplicate errors as HTTP 500.** A duplicate key error is often an expected business outcome, not an unknown server failure. Mapping code `11000` to a generic 500 error makes debugging harder and provides a poor user experience. Return `409 Conflict` with a specific error code so clients can handle it appropriately. Let unrelated database errors reach your generic error handler.

**Relying only on schema setters for normalization.** Adding `lowercase: true` to your schema field helps for normal document saves, but update operations that use MongoDB operators like `$set` can bypass the setter. Existing data that was inserted before you added the setter won't be normalized. Imports or direct database operations from other services might not use your schema at all. Normalize at the application boundary, migrate existing data, and enforce the final canonical form with the unique index.

**Building a unique index over dirty data.** If your collection already contains duplicate values for the field you want to make unique, the index build will fail. MongoDB cannot create a unique index when conflicting keys exist. Resolve duplicates first with a migration, then create the index. Plan the migration's load on your database and have a rollback strategy in case something goes wrong.

**Making an optional field globally unique by accident.** If you add `unique: true` to an optional field without using a partial index, you might accidentally prevent multiple documents from having that field omitted. Missing values can collide in unexpected ways depending on the field type. Use a partial index when you want uniqueness only for documents that actually have a value.

**Assuming client-side checks are authoritative.** A username availability check in the UI is a snapshot in time. By the time the form is submitted, that username might be taken. Always handle the duplicate error on the server side. The client-side check is a UX enhancement, not a correctness guarantee.

**Exposing raw MongoDB errors to clients.** The error message for code `11000` includes the collection name, index name, and the conflicting value. Returning this to clients exposes your internal schema structure and creates an unstable contract — if you rename an index or change your schema, the error message changes. Log the full error server-side, but return only a stable, business-level error code to clients.

**Forgetting that updates can also trigger duplicates.** When you update a user's email, the new value might collide with another user's existing email. The same duplicate error handling you use for inserts must also apply to updates. Wrap your update operations in the same error-handling logic.

**Using `syncIndexes()` carelessly in production.** `Model.syncIndexes()` creates indexes that are in your schema and drops indexes that are not. If a DBA added an emergency index directly in production to fix a performance issue, `syncIndexes()` might drop it. Use `syncIndexes()` deliberately during controlled deployments, and understand what it will create and drop before running it.

## 7. Compare With Related Concepts

**Unique index vs Mongoose validator.** A validator runs in your Node.js application and checks whether a single document's data is shaped correctly — things like required fields, string length, regex patterns, or enum values. A unique index runs in MongoDB and checks whether any other document in the collection already has that value. Validators are for data shape; unique indexes are for data uniqueness across the collection. Use validators for format and business rules, and unique indexes for constraints that involve looking at other documents.

**Unique index vs `findOne` availability check.** A `findOne` check before an insert can improve user experience by quickly detecting a conflict without attempting the write. But it's inherently racy — another request can insert between the check and the write. The unique index is the only thing that can guarantee uniqueness under concurrent load. Use both when helpful — the check for fast feedback in the common case, the index for correctness in all cases.

**`unique: true` vs `required: true`.** `required: true` is a Mongoose validator that prevents a field from being missing or undefined when a document is saved. `unique: true` creates a database index that prevents two documents from having the same value for that field. A field can be required without being unique, or unique while optional. They serve different purposes — one ensures presence, the other ensures uniqueness.

**Single-field unique index vs compound unique index.** A single-field unique index like `{ email: 1 }` enforces that no two documents in the entire collection have the same email. A compound unique index like `{ organizationId: 1, email: 1 }` enforces that no two documents with the same `organizationId` have the same email. The same email can exist in different organizations. Choose the form that matches your business constraint — global uniqueness versus scoped uniqueness.

**Unique index vs case-insensitive collation.** A unique index enforces that the indexed values are different according to MongoDB's default comparison rules. Adding a collation to the index changes how strings are compared — for example, a case-insensitive collation would treat `Ada@x.com` and `ada@x.com` as the same. The collation approach can work, but every query that uses that index must also specify the same collation, or the index won't be used. Normalizing values to lowercase before storage is often simpler and works consistently across different services and query patterns.

**Unique index vs application-level uniqueness check.** An application-level check might query the database to see if a value exists before inserting. This has the same race condition problem as a `findOne` check — two requests can both see that the value is available and both try to insert. The database unique index is the only way to close the race completely. Application-level checks are useful for UX but not for correctness.

## 8. 🧠 The Memory Hook

The availability check is a sign on the theater seat saying "this seat appears free." The unique index is the actual ticket printer that only prints one ticket per seat. Two people can read the same sign, but only one gets the ticket. The other person gets a clear "seat taken" error, not a confusing machine malfunction.
