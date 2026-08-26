# What are getters and setters

## 1. The Real-World Problem — When You Actually Hit This

You're building a user profile system. The database stores dates as ISO strings like `"2024-03-15T10:30:00.000Z"`, but your frontend expects formatted dates like `"March 15, 2024"`. You could format it in every API endpoint, but now you have formatting logic scattered across ten different routes. Worse, when you save data back from the frontend, you need to parse that formatted string back to an ISO date before storing it. One developer forgets the parsing step, and suddenly your database has invalid date formats that break your scheduled email jobs.

Or you're storing prices as numbers in cents (integer), but your API needs to return them as dollars with two decimal places. You keep doing the divide-by-100 conversion in each controller, but inevitably someone forgets it and sends raw cents to the frontend. Users see products priced at `$5000` instead of `$50.00`.

This is the moment you realize you need a single place to handle data transformation as it enters and leaves your database — not scattered across your entire codebase.

## 2. The Analogy — Make the Mechanic Obvious

Think of getters and setters like the customs booth at a border crossing.

When goods enter a country, customs officers inspect them, apply tariffs, convert currencies, and maybe repackage things before they're allowed into the domestic market. That's a setter — it transforms incoming data before it gets stored.

When goods leave the country, they go through customs again: export paperwork, currency conversion back to the buyer's format, proper labeling for international shipping. That's a getter — it transforms outgoing data before it reaches the consumer.

Without customs, you'd have every individual business handling their own currency conversion, import paperwork, and packaging rules. Some would get it right, most wouldn't, and chaos would ensue. With customs, the transformation happens at a single controlled checkpoint. The domestic market stores goods in a standard format, and foreign buyers receive them in the format they expect.

In Mongoose, your schema is the border, getters are export customs, and setters are import customs.

## 3. The Full Explanation — How It Actually Works

Mongoose getters and setters are functions that run automatically when you read from or write to a document field. They let you transform data without scattering that logic throughout your application.

**Getters** run when you access a field value. They take the stored value and return a transformed version for your application code. The original value in the database stays unchanged — the getter only affects what you see when you read it.

**Setters** run when you assign a value to a field. They take the incoming value and transform it before it's saved to the database. This is where you do validation, formatting, or normalization.

The key insight: these transformations happen at the schema level, so every part of your application gets consistent behavior. Whether you're in a controller, a background job, or a test script, reading `user.price` always returns dollars, and assigning `user.price = "50"` always stores cents.

**How they actually execute:**

When you do `doc.fieldName = value`, Mongoose checks if that field has a setter defined. If it does, it passes the value through the setter function, gets back the transformed value, and stores that transformed value in the underlying document.

When you do `doc.fieldName`, Mongoose checks if that field has a getter defined. If it does, it takes the stored value, passes it through the getter function, and returns the result to your code.

This works whether you're using the field in JavaScript, serializing it to JSON with `toJSON()`, or sending it in an API response (if you use virtuals or `toObject` with getters enabled).

**The tradeoff:**

Getters and setters add a small performance overhead because every field access and assignment triggers a function call. For most applications, this is negligible. But if you're doing bulk operations on millions of documents in a tight loop, that overhead adds up. You can disable getters on a per-query basis if you need raw performance.

**When to use them:**

- Data format conversion (cents to dollars, ISO dates to formatted strings)
- Computed values that look like real fields but derive from other data
- Normalization (trimming strings, lowercasing emails, sanitizing input)
- Validation that should happen on every assignment, not just at save time

**When not to use them:**

- Heavy computations that should only run when explicitly requested (use a method instead)
- Transformations that depend on external state or async operations (getters/setters must be synchronous)
- Performance-critical bulk operations where the function call overhead matters

## 4. See It In Practice — Real Code or Queries

Here's a practical example using getters and setters for price handling:

```javascript
const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
  name: { type: String, required: true },
  // Store price in cents as an integer
  price: {
    type: Number,
    required: true,
    // Getter: convert cents to dollars when reading
    get: function(value) {
      // value is in cents (e.g., 5000)
      return value / 100; // returns 50.0
    },
    // Setter: convert dollars to cents when writing
    set: function(value) {
      // value could be a number or string like "50" or 50
      const numericValue = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(numericValue)) {
        throw new Error('Price must be a valid number');
      }
      // Store as cents (e.g., 50 becomes 5000)
      return Math.round(numericValue * 100);
    }
  }
});

const Product = mongoose.model('Product', productSchema);

// Using the setter
const product = new Product({
  name: 'Coffee Mug',
  price: 15.99 // Setter converts to 1599 cents before storing
});

console.log(product.get('price', null, { getters: false })); // 1599 (raw stored value)
console.log(product.price); // 15.99 (getter converts back to dollars)

// You can also assign strings
product.price = "20.50"; // Setter parses string and stores 2050 cents
console.log(product.price); // 20.50

// Invalid input throws an error
try {
  product.price = "not a number";
} catch (err) {
  console.log(err.message); // "Price must be a valid number"
}
```

Here's an example with date formatting:

```javascript
const userSchema = new Schema({
  username: String,
  createdAt: {
    type: Date,
    default: Date.now,
    // Getter: format date for display
    get: function(value) {
      if (!value) return null;
      return value.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }
});

const User = mongoose.model('User', userSchema);

const user = new User({ username: 'alice' });
await user.save();

console.log(user.createdAt); // "March 15, 2024" (formatted string)
console.log(user.get('createdAt', null, { getters: false })); // Actual Date object
```

Here's an example with string normalization:

```javascript
const emailSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    // Setter: normalize email on every assignment
    set: function(value) {
      return value.toLowerCase().trim();
    }
  }
});

const EmailSubscriber = mongoose.model('EmailSubscriber', emailSchema);

const sub = new EmailSubscriber();
sub.email = '  ALICE@EXAMPLE.COM  '; // Spaces and uppercase
console.log(sub.email); // "alice@example.com" (normalized)
```

**Important note:** When you use `toJSON()` or `toObject()` to serialize documents for API responses, getters run by default. If you want to disable this, pass `{ getters: false }`:

```javascript
const json = product.toJSON({ getters: false }); // Raw values, no getters
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What's the difference between a getter/setter and a virtual field in Mongoose?**

A virtual field is a computed property that doesn't exist in the database at all — it's derived from other fields every time you access it. Getters and setters work on fields that are actually stored in the database; they transform the value as it enters or leaves.

Use virtuals when you need a computed value like `fullName` that combines `firstName` and `lastName`. Use getters/setters when you need to transform how a real field is stored versus how it's used in your application, like storing cents but working with dollars.

**Q: Can getters and setters be async?**

No, getters and setters must be synchronous functions. They run during field access and assignment, which happens synchronously in JavaScript. If you need async transformation (like fetching data from another service or doing a database lookup), you need to use a method or middleware instead.

**Q: Do getters and setters run on validation?**

Setters run before validation. When you assign a value, the setter transforms it first, then Mongoose validates the transformed value. This means you can use setters to normalize data before validation runs — for example, trimming whitespace or lowercasing an email so that validation rules work consistently.

**Q: How do getters affect query performance?**

Getters add a small overhead because every field access triggers a function call. For typical application code, this is negligible. But if you're doing bulk processing or aggregation on large datasets, you might want to disable getters for those specific operations using `{ getters: false }` in your query options or when calling `toObject()`/`toJSON()`.

**Q: Can I use getters and setters with embedded documents and arrays?**

Yes, you can define getters and setters on fields within embedded documents and on array elements. The transformation applies at whatever level you define it. For example, you could have a setter on an array element that normalizes each item as it's added to the array.

## 6. The Traps — What Goes Wrong in Production

**Trap: Assuming getters change what's stored in the database**

A common mistake is thinking that a getter modifies the actual database value. It doesn't — it only transforms what you see when you read the field. If you have a getter that divides by 100 and you look at the raw database with MongoDB Compass or the shell, you'll still see the original value. This confuses developers who debug data issues by looking directly at the database and expect to see the transformed values.

**Trap: Forgetting that setters affect validation**

Since setters run before validation, a buggy setter can cause valid-looking input to fail validation, or invalid input to pass validation after transformation. For example, if your setter converts a string to a number but the conversion fails silently and returns `NaN`, your number validation might pass unexpectedly or fail confusingly.

**Trap: Creating circular dependencies with virtuals**

If you define a virtual that depends on a field with a getter, and that getter references the virtual, you create an infinite loop. Mongoose will throw a maximum call stack size exceeded error. Always be clear about which fields are stored and which are computed, and never have them reference each other.

**Trap: Using setters for async operations**

Because setters must be synchronous, developers sometimes try to work around this by storing a promise or doing async work in a setter. This breaks because the setter returns immediately, and the async work completes later. Use pre-save middleware or instance methods for async transformations instead.

**Trap: Performance issues in bulk operations**

If you're processing thousands of documents in a loop and each field access triggers a getter, the overhead adds up. I've seen background jobs that were slow because they were iterating over documents and accessing fields with heavy getter logic. Use `{ getters: false }` or access the raw value with `doc.get('field', null, { getters: false })` when you need bulk performance.

## 7. Compare With Related Concepts

**Getters/Setters vs. Virtuals**

Getters and setters transform actual stored fields. Virtuals are computed fields that don't exist in the database at all. Use getters/setters when you need to change how a real field is stored versus used. Use virtuals when you need a derived value that combines or computes from other fields.

**Getters/Setters vs. Middleware**

Middleware (hooks like `pre('save')`) runs at specific lifecycle events like saving, updating, or removing. Getters and setters run on every field access or assignment. Use middleware for async operations, multi-field validation, or operations that should only happen during save. Use getters/setters for immediate transformation that should happen every time the field is touched.

**Getters/Setters vs. Instance Methods**

Instance methods are functions you call explicitly, like `user.getFormattedDate()`. Getters and setters run implicitly when you access or assign a field. Use methods when the transformation is expensive, async, or not always needed. Use getters/setters when the transformation should be transparent and automatic.

**Getters/Setters vs. Default Values**

Default values set the initial value when a document is created. Setters transform values whenever they're assigned, including updates. Use defaults for initial state. Use setters for ongoing normalization and transformation.

## 8. 🧠 The Memory Hook

Getters are export customs — they transform data leaving the database. Setters are import customs — they transform data entering the database. Both happen at the schema border, so your application code always works with the format it expects, while the database stores the format it needs.
