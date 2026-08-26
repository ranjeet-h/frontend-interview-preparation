# Custom Validators in Mongoose

## 1. The Real-World Problem — When You Actually Hit This

You built a user registration form. The frontend checks that passwords are at least 8 characters. But someone bypasses your frontend and sends a request directly to your API with a 3-character password. Your schema has built-in validators like `required` and `minlength`, so you think you're safe. Then a product manager asks for a new rule: passwords must contain at least one number and one special character. The built-in validators can't do that. You add validation logic in your route handler, but now the same rule exists in three places — frontend, route handler, and you're thinking about adding it to the database layer too. Every time the rule changes, you have to update all three. One day you miss a spot, and invalid data slips into your database. This is when you realize you need custom validators.

## 2. The Analogy — Make the Mechanic Obvious

Think of built-in validators like the standard security checks at an airport entrance — they check your ticket, they make sure you're not carrying obvious weapons, they verify your ID matches. These are the same rules for everyone. Custom validators are like the specialized checks a airline might add for specific situations — checking that a passenger's visa is still valid for their destination, verifying that a pet carrier meets size requirements, or ensuring a musical instrument fits in the overhead bin. The basic checkpoint can't know about every airline's specific rules, so each airline adds its own validation logic that runs alongside the standard checks. In Mongoose, the built-in validators handle the common cases, and custom validators let you add your specific business rules right where the data enters your database.

## 3. The Full Explanation — How It Actually Works

Mongoose validators run whenever you try to save a document. Before the data reaches MongoDB, Mongoose checks each field against the validation rules you defined. Built-in validators handle the common stuff — checking if a string is a certain length, if a number is within a range, if a value matches an enum. But business rules are often more specific than that. Custom validators let you write a function that receives the value being set and returns `true` if it's valid or `false` if it's not. You can throw an error with a custom message to tell the user exactly what went wrong.

The validator function receives the value as its first argument. If you need access to the entire document being validated — for example, to check that two fields match each other — you can access it via `this`. This is crucial for cross-field validation like password confirmation or checking that an end date is after a start date. Custom validators run synchronously by default, which means they're fast but they can't do async operations like checking a database or calling an external API. For async validation, Mongoose has a separate mechanism using the `validate` middleware.

Custom validators fire as part of the validation pipeline. When you call `save()`, `validate()`, or `create()`, Mongoose runs all validators. If any validator fails, the save operation aborts and Mongoose populates an error object with details about which field failed and why. This happens before the data ever reaches MongoDB, which means you never write invalid data to your database. The validation happens in your application layer, not in the database itself, which is why it's important to also use database constraints like indexes and unique fields as a defense in depth.

The tradeoff is that custom validators add application-side logic. If you have multiple applications writing to the same database, each one needs to implement the same validators, or you need to put the validation logic in a shared library. The validators also run in your Node.js process, so very complex validation logic can slow down writes if you're doing heavy computation. For most cases, this isn't a problem, but it's something to be aware of at high write volumes.

## 4. See It In Practice — Real Code or Queries

Here's a custom validator that ensures a password contains at least one number and one special character:

```javascript
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    minlength: 3
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    // Custom validator function
    validate: {
      validator: function(value) {
        // Check for at least one number
        const hasNumber = /\d/.test(value);
        // Check for at least one special character
        const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(value);
        return hasNumber && hasSpecial;
      },
      message: 'Password must contain at least one number and one special character'
    }
  }
});

const User = mongoose.model('User', userSchema);

// This will fail validation
const badUser = new User({
  username: 'john',
  password: 'password' // No number, no special character
});

badUser.save((err) => {
  console.log(err.errors.password.message);
  // "Password must contain at least one number and one special character"
});
```

Here's an example of cross-field validation using `this` to ensure password confirmation matches:

```javascript
const userSchema = new mongoose.Schema({
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  confirmPassword: {
    type: String,
    required: true,
    validate: {
      validator: function(value) {
        // 'this' refers to the document being validated
        return value === this.password;
      },
      message: 'Password confirmation does not match'
    }
  }
});
```

For validating dates — ensuring an end date is after a start date:

```javascript
const bookingSchema = new mongoose.Schema({
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(value) {
        return value > this.startDate;
      },
      message: 'End date must be after start date'
    }
  }
});
```

You can also pass parameters to your validator using a factory function:

```javascript
// Validator factory that accepts the allowed domains
const emailDomainValidator = (allowedDomains) => {
  return {
    validator: function(value) {
      const domain = value.split('@')[1];
      return allowedDomains.includes(domain);
    },
    message: `Email must be from one of these domains: ${allowedDomains.join(', ')}`
  };
};

const employeeSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    validate: emailDomainValidator(['company.com', 'partner.org'])
  }
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What are custom validators in Mongoose and when would you use them?**

Custom validators are functions you define on a schema field that run during Mongoose validation to check whether a value meets your specific business rules. You use them when the built-in validators like `required`, `minlength`, `enum`, or `match` aren't enough for your needs. Common use cases include cross-field validation like password confirmation, complex string patterns that regex can't cleanly express, conditional validation based on other field values, or any business rule that's specific to your application rather than a generic data constraint.

**Q: How do custom validators differ from middleware?**

Custom validators are synchronous functions that return a boolean to indicate validity. They run as part of the validation phase and are designed for checking field values. Middleware is more general — you can hook into `save`, `validate`, `updateOne`, and other lifecycle events. Middleware can be async, so it's suitable for operations like checking a database or calling an external service. Use validators for simple value checks, and use middleware when you need async operations or when you want to modify data before or after validation.

**Q: Can you access other fields in a custom validator?**

Yes, you can access the entire document being validated using `this` inside your validator function. This is how you do cross-field validation like checking that two passwords match or that an end date is after a start date. Just be aware that `this` only refers to the document during validation — if you're using the validator in other contexts, you might need to handle it differently.

**Q: What happens if a custom validator returns false?**

When a validator returns false, Mongoose marks that field as invalid. The `save` or `validate` operation fails, and Mongoose returns an error object. The error has a `errors` property that contains details about which fields failed and why. Your application can catch this error and send a meaningful response to the user. The invalid data never reaches MongoDB, so your database stays clean.

**Q: Are custom validators async?**

By default, custom validators are synchronous — they must return a boolean, not a promise. If you need async validation like checking whether a username already exists in the database, you should use the `validate` middleware instead of a field validator. The middleware can be async and has access to the document and the next callback, making it suitable for database lookups and external API calls.

## 6. The Traps — What Goes Wrong in Production

**Trap: Assuming validators protect against all invalid data**

Custom validators only run when you use Mongoose operations like `save()`, `create()`, or `validate()`. If someone connects directly to MongoDB using the native driver or a different application, Mongoose validators won't run. Your database can still receive invalid data through other pathways. Always use database-level constraints like unique indexes, field validation in MongoDB if available, and input validation at your API layer as defense in depth.

**Trap: Losing context when using arrow functions**

If you define your validator as an arrow function, `this` won't refer to the document — arrow functions don't have their own `this` binding. Use a regular function when you need to access other fields via `this`. This is a common mistake when doing cross-field validation.

**Trap: Expensive validation in the hot path**

If your custom validator does heavy computation — like iterating through large arrays, complex regex on long strings, or cryptographic operations — it will slow down every write operation. Put a profile on your validation logic if you're doing high-volume writes. Consider moving expensive checks to a background job or finding a simpler validation approach.

**Trap: Not handling optional fields**

If a field is not required, your custom validator still runs even when the value is `undefined` or `null`. If your validator tries to call methods on the value like `value.split()` or `value.length`, it will crash when the field is empty. Always check if the value exists before operating on it, or use the built-in `required` validator alongside your custom one.

**Trap: Generic error messages**

Using the same error message for every validation failure makes it hard for users to understand what they did wrong. Always provide specific, actionable error messages that tell the user exactly what the rule is and how to fix it. This is especially important for custom validators since the rules are often business-specific and not obvious.

## 7. Compare With Related Concepts

**Custom validators vs built-in validators**

Built-in validators like `required`, `min`, `max`, `enum`, `match`, and `minlength` handle common data constraints. They're declarative, well-tested, and cover most standard validation needs. Custom validators are for business-specific rules that built-in validators can't express. Use built-in validators whenever possible — they're clearer and require less code. Reach for custom validators when you need logic that's specific to your domain.

**Custom validators vs schema middleware**

Custom validators are focused on field-level validation and run synchronously. Middleware is more general and can run async. Middleware hooks into document lifecycle events like `save`, `validate`, `updateOne`, and can modify data, run async operations, or implement complex validation logic that depends on external systems. Use validators for simple field checks. Use middleware when you need async validation, when you want to modify data, or when you need to validate at the document level rather than the field level.

**Custom validators vs frontend validation**

Frontend validation improves user experience by giving immediate feedback, but it can be bypassed. Custom validators in Mongoose run on the backend and are the last line of defense before data hits your database. You need both — frontend for UX, backend for correctness. Never rely on frontend validation alone to protect your data integrity.

**Custom validators vs database constraints**

Mongoose validators run in your application before data reaches MongoDB. Database constraints like unique indexes, document validation rules in MongoDB, or foreign key constraints in SQL databases run in the database itself. Database constraints are more fundamental — they protect your data even if someone bypasses your application entirely. Use Mongoose validators for business logic and application-specific rules. Use database constraints for fundamental data integrity like uniqueness and required fields.

## 8. 🧠 The Memory Hook

Custom validators are your business logic bouncers standing at the database door — they know your specific house rules and stop any data that doesn't belong before it ever gets inside.
