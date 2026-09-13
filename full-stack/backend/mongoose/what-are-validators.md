# What are validators

## 1. The Real-World Problem — When You Actually Hit This

Your user registration form has been working fine for months. Then one morning, you wake up to a support ticket: "The app let me create an account with an invalid email address." You check the database and sure enough, there's a user with `email: "not-an-email"`. Worse, the marketing system tried to send a welcome email and crashed because it couldn't parse the address. This is the moment you realize that frontend validation alone isn't enough — you need database-level validation to stop bad data before it ever gets written to disk.

This happens all the time. A user bypasses your frontend form with curl or Postman. A bug in your API route forgets to validate. A backend refactor accidentally removes a validation check. Without validators defined in your schema layer, your database becomes a dumping ground for garbage data, and the bugs that result are incredibly hard to track down.

## 2. The Analogy — Make the Mechanic Obvious

Think of Mongoose validators like the security checkpoint at an airport. The check-in agent (your frontend) does an initial look at your boarding pass and ID. But the real security screening happens before you walk through the metal detector — that's your Mongoose validator. If you're carrying something prohibited, the security system stops you right there. You don't get on the plane. The plane (your database) never has to deal with you once you're past that point.

The key insight: the screening happens at the gate, not on the plane. If you wait until passengers are seated to check their bags, you've already got a mess on your hands. Mongoose validators are that gate — they check data before it enters MongoDB, so your database stays clean.

## 3. The Full Explanation — How It Actually Works

Mongoose validators are rules you define in your schema that run every time you try to save a document. Before Mongoose sends any data to MongoDB, it checks each field against the validation rules you set. If any field fails, the entire save operation aborts and Mongoose returns a validation error with details about what went wrong.

Validators run during two specific operations: when you call `.save()` on a document, and when you call `.create()` or `.insertMany()` on a model. They do NOT run by default when you use `.update()`, `.findOneAndUpdate()`, or `.updateOne()` — unless you explicitly set the `runValidators` option to true. This is a common gotcha that causes bad data to slip through.

Mongoose comes with several built-in validators that cover the most common validation needs:

- `required: true` — the field must be present and cannot be null or undefined
- `min` and `max` — for numbers, the value must be within this range
- `minlength` and `maxlength` — for strings, the length must be within this range
- `enum: [...]` — the value must be one of the specified values
- `match: /regex/` — the string must match the given regular expression
- `default: value` — if no value is provided, use this default (this isn't strictly a validator, but it's often used alongside them)

When validation fails, Mongoose populates an error object. The error has a `errors` property that contains one entry per failed field. Each entry has the field name, the kind of validation that failed, the message, and the actual value that caused the failure. This structured error data is what you send back to your frontend so users know exactly what to fix.

Validation happens in JavaScript, before any data goes to MongoDB. This means it adds a small amount of processing overhead, but it also means you get detailed, helpful error messages that database-level constraints can't provide. MongoDB has its own validation system too, but Mongoose validators are more expressive and give you better error handling in your application code.

## 4. See It In Practice — Real Code or Queries

Here's a user schema with common validators applied:

```javascript
const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
  // required: true — this field must exist
  name: {
    type: String,
    required: [true, 'Name is required'] // custom error message
  },

  // match: regex — must be a valid email format
  email: {
    type: String,
    required: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Please provide a valid email address'
    ],
    // enum isn't for email, but here's how it looks:
    // enum: ['allowed@example.com', 'other@example.com']
  },

  // minlength and maxlength — control string length
  password: {
    type: String,
    required: true,
    minlength: [8, 'Password must be at least 8 characters'],
    maxlength: [128, 'Password cannot exceed 128 characters']
  },

  // min and max — for numeric ranges
  age: {
    type: Number,
    min: [13, 'You must be at least 13 years old'],
    max: [120, 'Please enter a valid age']
  },

  // enum — value must be from this list
  role: {
    type: String,
    enum: {
      values: ['user', 'admin', 'moderator'],
      message: '{VALUE} is not a valid role'
    }
  }
});

const User = mongoose.model('User', userSchema);
```

Now let's see what happens when we try to save invalid data:

```javascript
// This will fail validation
const invalidUser = new User({
  name: '', // fails required
  email: 'not-an-email', // fails match regex
  password: 'short', // fails minlength
  age: 150, // fails max
  role: 'superuser' // fails enum
});

invalidUser.save((err) => {
  if (err) {
    console.log('Validation failed:');
    // err.errors is an object with one entry per failed field
    console.log(err.errors.name.message); // "Name is required"
    console.log(err.errors.email.message); // "Please provide a valid email address"
    console.log(err.errors.password.message); // "Password must be at least 8 characters"
    console.log(err.errors.age.message); // "Please enter a valid age"
    console.log(err.errors.role.message); // "superuser is not a valid role"
  }
});
```

For updates, remember that validators don't run by default:

```javascript
// This updates the age to 200, but validation does NOT run
User.findOneAndUpdate(
  { email: 'user@example.com' },
  { age: 200 },
  (err, doc) => {
    // This succeeds even though age > max
  }
);

// To run validators on updates, use runValidators: true
User.findOneAndUpdate(
  { email: 'user@example.com' },
  { age: 200 },
  { runValidators: true },
  (err, doc) => {
    // This fails with validation error: "Please enter a valid age"
  }
);
```

Async validators (using functions that return promises) are covered in the custom validators topic, but the built-in validators shown here handle most common validation needs without requiring async logic.

## 5. Interview Questions — All of Them, Done Properly

**Q: What's the difference between Mongoose validators and MongoDB validation?**

Mongoose validators run in your Node.js application before data is sent to MongoDB. They give you detailed error messages and support complex validation logic using JavaScript. MongoDB validation runs on the database server itself and is enforced even if someone connects directly to MongoDB bypassing your application. In practice, you use both: Mongoose validators for application-level validation with good error messages, and MongoDB validation as a last line of defense to ensure data integrity at the database level.

**Q: Do validators run on update operations by default?**

No, and this is a common source of bugs. Validators only run by default on `.save()`, `.create()`, and `.insertMany()`. For update operations like `.findOneAndUpdate()`, `.updateOne()`, and `.update()`, you must explicitly set `runValidators: true` in the options object. If you forget this, bad data can slip into your database through update operations even though your schema has validators defined.

**Q: How do you customize validation error messages?**

Every built-in validator accepts an array instead of a plain value. The first element is the validator value, and the second element is your custom error message. For example: `required: [true, 'Name is required']` or `minlength: [8, 'Password must be at least 8 characters']`. For enum validators, you can use an object with `values` and `message` properties: `enum: { values: ['a', 'b'], message: '{VALUE} is not valid' }`. The `{VALUE}` placeholder gets replaced with the actual invalid value that was provided.

**Q: When would you use enum validation?**

Use enum when a field can only take one of a specific set of values. Common examples: user roles (user, admin, moderator), order status (pending, shipped, delivered, cancelled), or categories (electronics, clothing, books). Enum ensures that you never end up with unexpected values in your database, which prevents bugs in your application logic that depend on specific values.

**Q: What's the difference between required: true and default: value?**

`required: true` means the field must be provided when creating a document. If it's missing, validation fails. `default: value` means if the field is not provided, Mongoose will automatically use the specified value. You can use both together: `required: true` with `default: value` means the field must exist, but if the caller doesn't provide it, the default is used. You can also use `default` without `required` to make a field optional but give it a default when not provided.

**Q: How do you validate that a string matches a specific pattern?**

Use the `match` validator with a regular expression. For email validation: `match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/`. For phone numbers: `match: /^\d{3}-\d{3}-\d{4}$/`. The regex pattern depends on your specific requirements, but the key is that `match` ensures the string conforms to your expected format. Remember that regex validation in JavaScript is only as good as your regex — test it thoroughly to make sure it accepts valid inputs and rejects invalid ones.

## 6. The Traps — What Goes Wrong in Production

**Forgetting runValidators on updates.** This is the most common trap. Your schema has validators, they work on create, but updates bypass them entirely. Suddenly you have users with age 200, emails without @ symbols, and roles that don't exist. Always set `runValidators: true` on update operations unless you have a specific reason not to.

**Relying only on frontend validation.** Frontend validation is great for user experience, but it's bypassable. Users can disable JavaScript, use curl, or modify requests in flight. If you don't have backend validators, your database will eventually contain garbage. The frontend is for UX; the backend validators are for data integrity.

**Not handling validation errors properly in your API.** When validation fails, Mongoose gives you a structured error object. If you just send a generic "bad request" response, your frontend can't tell the user which field is wrong. Extract the specific field errors from `err.errors` and send them back so the user knows exactly what to fix.

**Using regex that's too permissive or too strict.** An email regex that allows `@@@` passes invalid data. An email regex that rejects `user+tag@example.com` blocks valid data. Test your validation patterns against real-world data, not just the examples you think of while writing the code.

**Assuming required: true prevents null.** In Mongoose, `required: true` prevents `undefined` but not `null` unless you also handle it. If you want to reject null, use `required: true` and be careful about how your data comes in — some clients might send `null` explicitly instead of omitting the field.

**Validating business logic in validators when it should be elsewhere.** Validators are for data shape and format, not complex business rules. Checking that a user's email is unique, that a password is strong enough, or that a reference to another document exists — these are better handled in custom validators, middleware, or separate validation logic. Keep built-in validators focused on simple format checks.

## 7. Compare With Related Concepts

**Validators vs Middleware Hooks.** Validators check the shape and format of individual fields. Middleware hooks (like pre-save) let you run arbitrary code before or after operations. Use validators for simple format checks (email regex, string length, required fields). Use middleware for complex logic that involves multiple fields, external API calls, or data transformation. They can work together — you might validate the email format with a validator, then use a pre-save hook to check if that email is unique.

**Validators vs MongoDB Schema Validation.** Mongoose validators run in your application code. MongoDB schema validation runs on the database server. Mongoose gives you better error messages and more flexible validation logic. MongoDB validation protects your data even if someone connects directly to the database or uses a different application. Use both for defense in depth.

**Built-in Validators vs Custom Validators.** Built-in validators (required, min, max, enum, match) handle common format checks with simple configuration. Custom validators let you write your own validation functions for complex logic that built-in validators can't express. Start with built-in validators — they're simpler and cover most cases. Only move to custom validators when you need logic that built-ins can't handle.

**Validators vs Joi/Yup/Zod.** Joi, Yup, and Zod are standalone validation libraries that you typically use at the API boundary to validate incoming request bodies. Mongoose validators live at the model layer and validate data before it's saved to the database. Both are useful: validate at the API layer for fast feedback and to reject bad requests early, then validate again at the model layer to ensure data integrity even if the API layer is bypassed or has bugs.

## 8. 🧠 The Memory Hook — What Sticks

Validators are your database's bouncer at the door — they check IDs before anyone gets inside, so the party inside stays clean. Frontend validation is just a flyer; validators at the schema layer are the actual security checkpoint.
