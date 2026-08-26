# How do you validate nested schemas

## 1. The Real-World Problem — When You Actually Hit This

You have a user registration endpoint that accepts an address object with street, city, and zip code. In development, everything works because you're sending clean test data. Then your app launches, and a user submits a request with a zip code that's a string instead of a number, or a missing city field. Mongoose saves the document to MongoDB anyway because you only added validation to the top-level fields. Days later, your address lookup service crashes when it tries to parse that malformed zip code. You realize the nested object inside your user document was never validated — the parent document passed validation, but the nested address sailed through with invalid data.

This is the exact moment you understand why nested schema validation matters: validation on the parent schema doesn't automatically cascade to nested objects unless you explicitly tell Mongoose to do it.

## 2. The Analogy — Make the Mechanic Obvious

Think of nested schema validation like airport security with checked luggage. When you check a bag, the airline checks your boarding pass (top-level validation). But they don't automatically open your suitcase to inspect what's inside unless you declare it as a special item. If you pack something dangerous in your checked bag and don't declare it, it gets on the plane anyway — the security check at the counter didn't cascade into your luggage.

In Mongoose, a nested object is like that suitcase. By default, Mongoose checks the top-level fields (the boarding pass) but doesn't inspect nested objects (the suitcase contents) unless you explicitly define those nested objects as subdocuments with their own schema. A subdocument is like declaring "this suitcase contains fragile items" — now the system knows to inspect what's inside.

## 3. The Full Explanation — How It Actually Works

Mongoose has two ways to store nested data: as plain objects and as subdocuments. This distinction is everything.

**Plain nested objects** are just regular JavaScript objects stored inside a document. When you define a field as `{ address: { street: String, city: String } }`, Mongoose treats the entire address object as a single value. It doesn't run validation on the nested fields individually. If the address is null or missing, that's fine. If address exists but has the wrong field types, Mongoose might not catch it depending on the context.

**Subdocuments** are nested objects with their own schema. When you create a separate schema for the nested object and use it as the type — like `{ address: AddressSchema }` — Mongoose knows "this is not just any object, it's an Address with specific rules." Now validation runs on that nested schema every time you save or validate the parent document. Each field in the address gets checked: required fields must exist, strings must match patterns, numbers must be in range, enums must be valid values.

The key mechanic is that validation cascades down through subdocument schemas but not through plain object schemas. When you call `doc.validate()` or `doc.save()`, Mongoose walks the schema tree. It validates the top-level fields, then for each subdocument field, it recursively validates that subdocument's schema. Plain nested objects are treated as a single leaf node — they get validated as "is this an object?" not "does this object's internal structure match rules?"

There's also an important distinction between **arrays of subdocuments** and **arrays of plain objects**. An array defined as `[String]` or `[Number]` validates each element's type. An array defined as `[AddressSchema]` validates each element as a full subdocument with all the address rules. An array defined as `[{ street: String }]` is an array of plain objects — Mongoose checks that each element is an object, but doesn't deeply validate the nested fields unless you use specific validation mechanisms.

## 4. See It In Practice — Real Code or Queries

Here's the wrong way — plain nested object without proper validation:

```javascript
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // This is a plain nested object - validation doesn't cascade
  address: {
    street: String,
    city: { type: String, required: true },
    zip: { type: Number, min: 10000, max: 99999 }
  }
});

const User = mongoose.model('User', userSchema);

// This saves successfully even though zip is a string
const user = new User({
  name: 'Alice',
  address: {
    street: '123 Main St',
    city: 'Springfield',
    zip: '12345' // Should be a number, but it's a string
  }
});

await user.save(); // No error! The nested validation didn't run
```

Here's the right way — using a subdocument schema:

```javascript
// Define the nested schema separately
const addressSchema = new mongoose.Schema({
  street: { type: String, required: true },
  city: { type: String, required: true },
  zip: { type: Number, required: true, min: 10000, max: 99999 }
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // Use the subdocument schema - validation cascades
  address: { type: addressSchema, required: true }
});

const User = mongoose.model('User', userSchema);

// Now this fails with a validation error
const user = new User({
  name: 'Alice',
  address: {
    street: '123 Main St',
    city: 'Springfield',
    zip: '12345' // Wrong type - should be number
  }
});

try {
  await user.save();
} catch (err) {
  // ValidationError: address.zip is not a number
  console.log(err.errors.address.zip.message);
}
```

Here's an array of subdocuments — common for things like order items:

```javascript
const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 }
});

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  // Array of subdocuments - each item validated independently
  items: [orderItemSchema]
});

const Order = mongoose.model('Order', orderSchema);

// This fails because quantity is negative
const order = new Order({
  userId: new mongoose.Types.ObjectId(),
  items: [
    { productId: new mongoose.Types.ObjectId(), quantity: -5, price: 99.99 }
  ]
});

try {
  await order.save();
} catch (err) {
  // ValidationError: items.0.quantity is less than minimum allowed value
  console.log(err.errors['items.0.quantity'].message);
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What's the difference between a plain nested object and a subdocument in Mongoose?**

A plain nested object is defined inline with an object literal like `{ address: { street: String } }`. Mongoose treats it as a single value and doesn't deeply validate its fields. A subdocument uses a separate schema instance as the type, like `{ address: addressSchema }`. Mongoose recursively validates the subdocument's schema, checking each nested field against its rules. The distinction matters because plain objects can silently accept invalid data in their nested fields, while subdocuments enforce the full validation cascade.

**Q: Why doesn't validation run on plain nested objects by default?**

Mongoose treats plain nested objects as "schema-less" for flexibility. MongoDB itself allows any structure within documents, and Mongoose defaults to permissive behavior for nested objects to match MongoDB's flexible model. Subdocuments are the explicit opt-in mechanism when you want strict validation on nested structures. This design choice lets you have some nested fields that are flexible while others are strictly validated.

**Q: How do you validate an array of objects in Mongoose?**

Use an array of subdocuments: `items: [itemSchema]`. This validates each element in the array against the subdocument schema. If you instead use `items: [{ name: String }]`, Mongoose only checks that each element is an object, not that the nested fields match their types. The array-of-subdocuments approach gives you full validation on every array element with proper error paths like `items.2.price` to pinpoint which element failed.

**Q: Can you have nested subdocuments within subdocuments?**

Yes, subdocuments can nest arbitrarily deep. If you have a user with an address, and the address has a location object with coordinates, you can define schemas for each level: `locationSchema` inside `addressSchema` inside `userSchema`. Validation cascades through the entire tree. Each level gets its own validation rules, and error paths reflect the full nesting like `address.location.coordinates.lat`.

**Q: How do you handle optional nested objects with validation?**

Use `required: false` on the subdocument field. If the subdocument is missing or null, validation passes. If the subdocument is present, its internal schema validation runs. This is different from making the subdocument's individual fields optional — with `required: false` on the parent, the entire nested object can be omitted, but if provided, it must satisfy the subdocument schema.

**Q: What happens when you update a nested field directly?**

If you use `doc.address.city = 'New York'` and then call `doc.save()`, Mongoose runs validation on the entire document including subdocuments. If you use `findOneAndUpdate` with `{ runValidators: true }`, Mongoose validates only the fields being updated, including nested fields in the update path. Without `runValidators: true`, updates bypass validation entirely for both top-level and nested fields.

## 6. The Traps — What Goes Wrong in Production

**The silent invalid nested data trap:** You define nested fields inline without a subdocument schema. Tests pass because you send valid data. In production, users send malformed nested objects, and Mongoose saves them. Later, downstream code that expects specific types crashes when it encounters the invalid data. The fix is always to use subdocument schemas for any nested object that needs validation.

**The array-of-objects trap:** You define an array field as `tags: [{ name: String }]` thinking this validates each tag's name field. It doesn't — it only checks that each element is an object. Invalid names get saved. Use `tags: [tagSchema]` with a proper subdocument schema instead.

**The update bypass trap:** You have excellent validation on saves, but your update endpoints use `findOneAndUpdate` without `runValidators: true`. Users can update nested fields to invalid values through the update API. Always set `runValidators: true` on updates when validation matters.

**The partial validation trap:** You think that because the parent document validates, everything inside it is safe. But if you mix subdocuments with plain nested objects, the plain ones aren't validated. Be explicit — use subdocument schemas consistently for any structured data that needs enforcement.

**The error path confusion trap:** When validation fails on a nested subdocument, the error path is a string like `'address.zip'` or `'items.0.price'`. If you're expecting a flat error structure and don't parse these paths correctly, your error handler might show the wrong field name to the user. Parse the dot-notation paths to display accurate validation errors.

## 7. Compare With Related Concepts

**Nested schema validation vs embedded documents:** Embedded documents are the MongoDB storage pattern — data stored inside another document. Nested schema validation is the Mongoose mechanism for enforcing rules on those embedded documents. You can have embedded documents without validation (plain objects) or with validation (subdocuments). The concepts are related but not the same — one is about storage, the other about enforcement.

**Subdocuments vs references:** Subdocuments store data inside the parent document. References store an `ObjectId` that points to a separate document. Subdocuments with validation ensure the nested data is correct at save time. References rely on the target document's own schema for validation. Use subdocuments when the nested data belongs to the parent and should always be loaded together. Use references when the nested data is independent or shared across multiple parents.

**Nested validation vs middleware:** Mongoose middleware (pre/post hooks) can also validate data, but it's not the same as schema validation. Schema validation is declarative and runs automatically based on type definitions. Middleware is imperative code you write to check conditions. Schema validation is preferred for structural rules like types and required fields. Middleware is better for business logic like "user cannot have more than 5 active orders."

**Mongoose validation vs application-level validation:** Mongoose validation is the last line of defense at the database layer. Application-level validation (like Joi, Zod, or Express middleware) runs earlier in the request pipeline. You should validate at both layers — application validation gives fast, user-friendly errors before hitting the database. Mongoose validation protects against bugs that bypass application validation or direct database writes.

## 8. 🧠 The Memory Hook — What Sticks

Plain objects are suitcases Mongoose doesn't open. Subdocuments are declared luggage that gets inspected.
