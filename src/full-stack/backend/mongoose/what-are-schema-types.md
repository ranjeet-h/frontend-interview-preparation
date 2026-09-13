# What are schema types

## 1. The Real-World Problem — When You Actually Hit This

Your payment service crashes when a user sends `amount: "100.50"` as a string instead of a number. The aggregation pipeline that sums daily revenue returns `NaN` because half the documents have `amount` stored as strings from an old API version. A user's age field stores `-5` because nobody added validation. A timestamp is stored as a string `"2024-01-15"` in some documents and as a Date object in others, breaking your `$dateFromString` aggregation.

MongoDB itself is schemaless — it accepts whatever BSON you send. Without declaring what each field **should** be, your database becomes a messy collection of whatever happened to be written by whatever code version was running at the time. Schema types are Mongoose's way of saying "this field is a Number, this is a Date, this is an ObjectId" — and enforcing those rules before data ever reaches MongoDB.

## 2. The Analogy — Make the Mechanic Obvious

Schema types are like **ingredient labels on a recipe**.

When you bake, the recipe says "2 cups flour" not "some white powder." If you accidentally grab powdered sugar instead of flour, the result is a disaster. The recipe type system prevents that mistake before you even start mixing.

In Mongoose, the schema type is the label on each field:
- `type: String` means "this field stores text"
- `type: Number` means "this field stores numeric values"
- `type: Date` means "this field stores a datetime"

When your API sends data, Mongoose checks the labels against what you actually sent. If the recipe says "2 cups flour" and you hand it powdered sugar, Mongoose casts it if possible ( `"5"` → `5` for Number) or rejects it if the conversion is impossible.

## 3. The Full Explanation — How It Actually Works

**What schema types are.** Schema types are the allowed data types for each path (field) in a Mongoose schema. They define what kind of BSON data can be stored, how incoming values are cast, and what validators apply.

**The core types and what they do:**

| Schema Type | BSON Stored | What It Accepts | Common Validators |
|---|---|---|---|
| `String` | UTF-8 string | strings, numbers (cast to string), objects with `toString()` | `minlength`, `maxlength`, `match` (regex), `enum`, `trim` |
| `Number` | 64-bit float | numbers, numeric strings (cast), decimal strings | `min`, `max`, `enum` |
| `Boolean` | boolean | booleans, truthy/falsy values (cast) | none built-in |
| `Date` | 64-bit int (ms since epoch) | Date objects, date strings, numbers (as ms) | `min`, `max` |
| `Buffer` | binary buffer | Buffer objects, hex/base64 strings | none built-in |
| `ObjectId` | 12-byte ObjectId | ObjectId strings, ObjectId objects, 24-byte hex strings | none built-in |
| `Array` | array | arrays of the declared subtype | each element validated against subtype |
| `Schema.Types.Mixed` | any BSON | anything | none (danger zone) |
| `Schema.Types.Decimal128` | 128-bit decimal | Decimal128 strings, numbers | `min`, `max` |
| `Schema.Types.Map` | BSON object | Map-like key-value pairs | values validated against declared type |

**Type casting in action.** When you save a document through Mongoose, it attempts to cast incoming values to the declared schema type:

```js
const userSchema = new Schema({
  age: Number,        // "25" → 25, "twenty-five" → NaN (fails validation)
  email: String,      // 123 → "123"
  isActive: Boolean,  // "yes" → true, 0 → false
  createdAt: Date,    // "2024-01-15" → Date object, 1705334400000 → Date object
});
```

**Strings have special powers.** The String type supports built-in transformations and validation that are extremely useful in production:

```js
email: {
  type: String,
  trim: true,        // remove leading/trailing whitespace before save
  lowercase: true,   // convert to lowercase before save
  match: /.+@.+\..+/, // regex validation
  enum: ['user', 'admin'], // restrict to allowed values
}
```

**Numbers and floating-point precision.** JavaScript numbers are 64-bit floats, which means they cannot precisely represent decimal values like `0.1`. For money or anything requiring exact decimal math, use `Schema.Types.Decimal128` or store values as integers (cents instead of dollars).

```js
// Bad for money — floating point errors
price: { type: Number }  // 0.1 + 0.2 !== 0.3

// Good for money — exact decimal
price: { type: Schema.Types.Decimal128 }

// Alternative — store as cents
priceCents: { type: Number }  // $10.50 stored as 1050
```

**ObjectId for references.** When you need to link documents, use `ObjectId` with a `ref` option:

```js
userId: {
  type: Schema.Types.ObjectId,
  ref: 'User',  // tells Mongoose which collection to query for populate
  required: true
}
```

**Arrays and subdocuments.** Arrays can hold primitive types or full subdocuments:

```js
// Array of strings
tags: [String]

// Array of subdocuments
items: [{
  sku: { type: String, required: true },
  qty: { type: Number, min: 1 }
}]
```

**Mixed — the escape hatch.** `Schema.Types.Mixed` accepts any data. This is useful for truly dynamic metadata, but it disables all type safety and validation on that field:

```js
metadata: Schema.Types.Mixed  // anything goes — use sparingly
```

**Why casting matters.** Casting happens before validation and before the document reaches MongoDB. This means:
- Your database stays clean because bad types are rejected or converted
- Your aggregation queries work because fields have consistent types
- Your frontend gets predictable response shapes

**When casting fails.** If a value cannot be cast to the declared type, Mongoose sets the field to `null` and a validation error is thrown on `save()`. For example, passing `"not a number"` to a Number field results in a cast error.

## 4. See It In Practice — Real Code or Queries

```js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  priceCents: {
    type: Number,
    required: true,
    min: 0  // prevents negative prices
  },
  // Decimal128 for exact financial calculations
  taxRate: {
    type: mongoose.Schema.Types.Decimal128,
    required: true
  },
  inStock: {
    type: Boolean,
    default: true
  },
  firstAvailable: {
    type: Date,
    default: Date.now
  },
  // Array of strings with enum validation
  categories: [{
    type: String,
    enum: ['electronics', 'clothing', 'home', 'books']
  }],
  // ObjectId reference to another collection
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Subdocument array
  variants: [{
    sku: { type: String, required: true },
    size: { type: String, enum: ['S', 'M', 'L', 'XL'] },
    stock: { type: Number, min: 0 }
  }],
  // Mixed type for arbitrary metadata
  attributes: mongoose.Schema.Types.Mixed
});

const Product = mongoose.model('Product', productSchema);

async function demo() {
  await mongoose.connect('mongodb://127.0.0.1:27017/shop');

  const product = new Product({
    name: '  Wireless Headphones  ',  // trim removes spaces
    priceCents: '9999',  // string cast to number: 9999
    taxRate: '0.0875',  // string cast to Decimal128
    inStock: 'yes',  // truthy string cast to true
    categories: ['electronics', 'gadgets'],  // 'gadgets' fails enum validation
    sellerId: '507f1f77bcf86cd799439011',  // hex string cast to ObjectId
    variants: [{ sku: 'WH-001', size: 'M', stock: '50' }],  // stock cast to number
    attributes: { color: 'black', weight: '250g' }  // Mixed accepts anything
  });

  try {
    await product.save();
  } catch (err) {
    // Validation error: 'gadgets' is not a valid enum value for categories
    console.error('Validation failed:', err.message);
  }

  // Fix the enum error
  product.categories = ['electronics'];
  await product.save();
  console.log('Saved:', product.name);  // "Wireless Headphones" (trimmed)

  await mongoose.disconnect();
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What are the available schema types in Mongoose?**

The core types are String, Number, Boolean, Date, Buffer, ObjectId, Array, Mixed, Decimal128, and Map. You can also define subdocuments (embedded schemas) and arrays of subdocuments. Each type determines what BSON is stored in MongoDB and how incoming values are cast.

**Q: What is type casting in Mongoose?**

Type casting is the process Mongoose uses to convert incoming values to the declared schema type before saving. For example, passing `"25"` to a Number field casts it to `25`. Passing a date string to a Date field casts it to a Date object. If casting fails (like passing `"abc"` to Number), the field becomes `null` and validation fails.

**Q: When should you use Decimal128 instead of Number?**

Use Decimal128 for financial calculations or any situation where floating-point precision matters. JavaScript numbers are 64-bit floats and cannot exactly represent decimals like `0.1`. Decimal128 provides exact decimal arithmetic. Alternatively, store monetary values as integers (cents) and convert on the frontend.

**Q: What is the Mixed schema type and when is it appropriate?**

Mixed accepts any data type — it's essentially "no type constraint." Use it only for truly dynamic, unpredictable data like user-generated metadata or feature flags. Avoid it as a default because it disables type safety, validation, and the benefits of having a schema.

**Q: How do you create a reference to another document using schema types?**

Use `Schema.Types.ObjectId` with a `ref` option pointing to the model name:

```js
userId: { type: Schema.Types.ObjectId, ref: 'User' }
```

This enables the `populate()` method to fetch the related document from the User collection.

**Q: What happens if you pass the wrong type to a schema field?**

Mongoose attempts to cast it. If casting succeeds (like `"5"` to Number), the converted value is saved. If casting fails (like `"abc"` to Number), the field is set to `null` and a validation error is thrown on `save()`. The document is not saved to MongoDB.

**Q: How do you validate strings in Mongoose schema types?**

String types support `minlength`, `maxlength`, `match` (regex pattern), `enum` (allowed values), `trim` (remove whitespace), and `lowercase`/`uppercase` transformations. These run during validation before save.

## 6. The Traps — What Goes Wrong in Production

**Storing money as Number.** Floating-point arithmetic causes precision errors. `0.1 + 0.2` equals `0.30000000000000004` in JavaScript. This causes accounting discrepancies. Use Decimal128 or store integers (cents) and convert to dollars on the frontend.

**Using Mixed everywhere.** Mixed types become unmaintainable because anything can be stored. Queries become unpredictable. Validation is impossible. Use Mixed only for truly dynamic data, and consider whether a subdocument with known fields would work instead.

**Forgetting trim on strings.** User input often has accidental leading/trailing spaces. Without `trim: true`, `" email@example.com "` and `"email@example.com"` are treated as different values for uniqueness checks and lookups.

**Storing dates as strings.** If you store `"2024-01-15"` as a String instead of Date, you cannot use MongoDB's date operators like `$gt`, `$lt`, or date aggregation functions. Always use the Date type for timestamps.

**Assuming ObjectId strings are automatically validated.** Mongoose casts any 24-character hex string to ObjectId. If a user passes a fake 24-char hex string that doesn't exist in the database, Mongoose accepts it but `populate()` returns null. Validate that referenced documents actually exist before saving.

**Enum values that change over time.** If you add a new value to an enum, old documents with previous values still exist. Queries for the new enum value won't return old documents. This is usually desired behavior, but be aware that enum changes are not automatically applied to existing data.

**Not handling cast errors gracefully.** When the frontend sends invalid data, Mongoose throws a cast error. If your API doesn't catch and format these errors, the user sees a generic 500 error. Always validate Mongoose errors and return user-friendly messages.

## 7. Compare With Related Concepts

**Schema types vs TypeScript types**

- Schema types: runtime validation in Node.js, enforced before MongoDB write
- TypeScript types: compile-time checking in your IDE, no runtime enforcement
- Rule: use both — TypeScript for IDE safety, Mongoose schema types for runtime data integrity

**Schema types vs MongoDB BSON types**

- Schema types: Mongoose layer, define what you accept and how to cast
- BSON types: what MongoDB actually stores on disk
- Rule: schema types map to BSON types, but Mongoose adds casting and validation on top

**String vs ObjectId for references**

- String: stores reference as plain string, no automatic populate, must manually query
- ObjectId with ref: enables populate, validates hex format, ties collections together
- Rule: always use ObjectId with ref for document references; String only for external IDs

**Array of primitives vs subdocument array**

- Array of primitives: `[String]`, `[Number]` — simple lists
- Subdocument array: `[{ sku: String, qty: Number }]` — structured objects with their own validation
- Rule: use subdocument arrays when items have multiple fields; primitive arrays for simple tags/lists

## 8. 🧠 The Memory Hook

Schema types are **the data type contract** for each field — they tell Mongoose what to accept, how to cast it, and what validators to run before anything reaches MongoDB. Think of them as the ingredient labels on your recipe: they prevent you from accidentally baking with sugar when the recipe calls for flour.
