# How Do You Handle Unique Fields?

## 1. The Real-World Problem — When You Actually Hit This

Your signup endpoint checks whether an email is available, sees no match, and starts creating the user. At the same moment, another request does the same thing. Without a database-enforced rule, both requests can succeed and two accounts can claim the same email. Even worse, a developer may add `unique: true`, assume Mongoose now validates the value, and ship an API that still returns an unhandled MongoDB error.

The reliable approach is to normalize the value, enforce uniqueness with a MongoDB unique index, and translate duplicate-key failures into a stable API response. The availability check is useful for a friendly message, but it is not the correctness boundary.

## 2. The Analogy — Make the Mechanic Obvious

Think of a venue assigning numbered seats. The booking clerk can look at the seating chart first and tell you whether seat 12 appears free. That lookup improves the experience, but two clerks can inspect the chart before either records the booking. The box office's official reservation system must still reject the second booking when both clerks race.

In this analogy, the lookup is an application-level `findOne`, while the official reservation rule is MongoDB's unique index. Mongoose's `unique` schema option is the instruction to create that index; it is not the clerk checking the chart and it is not a validator that runs during `validate()`.

## 3. The Full Explanation — How It Actually Works

**Unique index versus validation.** `unique: true` tells Mongoose to declare a unique index for that path. MongoDB then rejects an insert or update that would create a second indexed key. The rejection is normally a `MongoServerError` with code `11000` (duplicate key), not a Mongoose `ValidationError`.

Validators answer, "Is this value shaped or formatted correctly?" A unique index answers, "Does any other stored document already own this key?" A validator can check the database, but that check is still vulnerable to a race unless the database index enforces the final write.

```js
const userSchema = new mongoose.Schema({
	email: {
		type: String,
		required: true,
		trim: true,
		lowercase: true,
		unique: true,
	},
});
```

The index is created in the database, so it must actually exist. In development, Mongoose may create indexes automatically. In production, teams commonly set `autoIndex: false` and deploy indexes deliberately, because building an index can consume resources and a unique index cannot be built while conflicting data remains. Check the database with `db.users.getIndexes()` or `User.listIndexes()` rather than trusting the schema file. `Model.syncIndexes()` can reconcile indexes, but dropping indexes it considers obsolete is an operational decision, not something to run casually at application startup.

**Normalize before enforcing uniqueness.** Decide what "the same" means before creating the index. For an email policy that treats case as insignificant, convert it to a canonical form such as trimmed lowercase before both lookup and write. Schema setters help for normal document saves, but update paths and existing data still need deliberate handling. A unique index is only as consistent as the keys it receives.

If uniqueness is tenant-scoped, use a compound index rather than making the value globally unique:

```js
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
```

For an optional unique field, be careful with missing values. A normal single-field unique index can treat missing or `null` values as the same indexed key, so multiple documents may fail unexpectedly. A partial index makes the policy explicit:

```js
userSchema.index(
	{ phone: 1 },
	{
		unique: true,
		partialFilterExpression: { phone: { $type: "string", $gt: "" } },
	},
);
```

**Race conditions and error mapping.** This sequence is not safe by itself:

```js
if (await User.exists({ email })) {
	return res.status(409).json({ code: "EMAIL_TAKEN" });
}
await User.create({ email });
```

Two requests can both pass `exists` before either insert. Keep the pre-check if it improves latency or lets the API return a predictable message in the common case, but always catch code `11000` around the write. The database index closes the race.

Map the database error at the API boundary. Do not return the raw index name, query, or MongoDB message to a client because it can expose internal schema details and creates an unstable contract. For updates, apply the same mapping: changing an existing user's email can also collide with another user's indexed value.

## 4. See It In Practice — Real Code or Queries

The following example assumes `npm install mongoose express` and a reachable MongoDB instance at `mongodb://127.0.0.1:27017/unique-fields-demo`. It deliberately waits for the index before writing, so the example does not depend on background index creation finishing by luck.

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
	{ autoIndex: false },
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
	await User.createIndexes();
	app.listen(3000, () => console.log("Listening on port 3000"));
}

start().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
```

With two concurrent requests for `Ada@Example.com` and `ada@example.com`, both documents normalize to `ada@example.com`. One insert succeeds; the other receives `E11000`, and the route returns HTTP `409 Conflict`. A client can treat `EMAIL_TAKEN` as an expected business outcome instead of trying to parse a MongoDB string.

To inspect the database-side rule in `mongosh`:

```javascript
use unique-fields-demo
db.users.getIndexes()
// Look for a unique index whose key is { email: 1 }.
```

Before enabling a unique index on an existing collection, find and resolve duplicates. For example, this aggregation identifies repeated normalized emails:

```javascript
db.users.aggregate([
	{
		$set: {
			normalizedEmail: { $toLower: { $trim: { input: "$email" } } },
		},
	},
	{
		$group: {
			_id: "$normalizedEmail",
			ids: { $push: "$_id" },
			count: { $sum: 1 },
		},
	},
	{ $match: { count: { $gt: 1 } } },
])
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Does `unique: true` validate a Mongoose field?**

No. It is an index declaration. Mongoose asks MongoDB to create a unique index, and MongoDB rejects conflicting writes. That failure is a duplicate-key error, usually code `11000`, rather than a normal Mongoose validation error.

**Q: Why keep a pre-check if the unique index is required?**

A pre-check can avoid an insert and produce a friendly response when the value is already taken. It cannot guarantee uniqueness because another request can write between the check and the insert. The index is the authority; the pre-check is only an optimization and user-experience aid.

**Q: How would you make email uniqueness case-insensitive?**

Choose and document the product rule, then canonicalize before querying and writing, commonly with `trim` and lowercase. Normalize existing records before adding the index. A collation-based index is another option, but the query must use a compatible collation and the team must understand its locale and strength rules; it is not a substitute for deciding the policy.

**Q: How do you handle duplicates when adding the index to old data?**

First group records by the exact key the future index will enforce. Resolve duplicates through a documented migration, such as merging accounts or assigning a reviewed suffix. Only then create the unique index, and monitor the index build separately from application startup.

**Q: What status should the API return for a duplicate?**

Usually `409 Conflict`, with a stable application error code such as `EMAIL_TAKEN`. The server should log the index and request correlation ID, while the client receives only the safe business-level message it needs.

**Q: How do optional unique fields behave?**

The index still sees missing or `null` values according to MongoDB's indexing rules, so an ordinary unique index may reject multiple documents without a value. Use a partial index when "unique only when non-empty" is the intended rule, and test missing, explicit `null`, and empty-string cases.

## 6. The Traps — What Goes Wrong in Production

- **Treating `unique` as a validator:** `validate()` can pass for two documents with the same value. Only the database write can prove that the unique index accepted the key.
- **Assuming the index exists because the schema says so:** Disabled `autoIndex`, a failed build, or a deployment race can leave production without the intended constraint. Verify indexes during deployment and alert on failed migrations.
- **Returning every duplicate as HTTP 500:** A duplicate is often an expected conflict, not an unknown server failure. Map code `11000` to the documented response, but let unrelated database errors reach the generic error handler.
- **Relying on a case-changing setter alone:** Existing records, update operators, imports, and differently configured models can bypass the intended normalization path. Normalize at the boundary, migrate old data, and enforce the final key with an index.
- **Building a unique index over dirty data:** The build fails when conflicting keys already exist. Resolve duplicates first and plan the migration's load and rollback behavior.
- **Making an optional field globally unique by accident:** Missing values can collide. Use `partialFilterExpression` when missing, `null`, and empty-string values should not participate in uniqueness.
- **Assuming client-side availability checks are authoritative:** A username can become unavailable after the UI check and before submission. The write endpoint must handle the conflict deterministically.
- **Logging raw MongoDB errors to clients:** Error messages can expose collection and index names and may change between driver versions. Keep detailed diagnostics in protected logs and return a stable error schema.

## 7. Compare With Related Concepts

**Unique index vs Mongoose validator:** A validator runs application logic before a write; a unique index is enforced by MongoDB and closes concurrent-write races. Use a validator for shape or business rules, and a unique index for a uniqueness invariant.

**Unique index vs `findOne` availability check:** The check improves a common response but is inherently racy. Use both when helpful, but rely on the index and catch its duplicate-key error.

**`unique: true` vs `required: true`:** `required` rejects a missing value during Mongoose validation; `unique` prevents two indexed values from colliding. A field can be required without being unique, or unique while optional with a carefully designed partial index.

**Single-field vs compound unique index:** A single-field index enforces global uniqueness. A compound index enforces uniqueness for a combination, such as one email per organization. Choose the key that matches the business scope.

**Unique index vs case-insensitive collation:** The index supplies uniqueness; collation changes how strings compare. Use canonical storage when the rule is simple and cross-service consistency matters; use collation when locale-aware comparison is a deliberate requirement and every relevant query uses it correctly.

## 8. 🧠 The Memory Hook

The availability check is a sign on the seat; the unique index is the locked ticket printer. Two requests can read the same sign, but only one can receive the ticket, and the other must be handled as a normal `409` conflict.
