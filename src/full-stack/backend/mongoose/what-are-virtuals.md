# What are virtuals

## 1. The Real-World Problem — When You Actually Hit This

You're building a user profile API. The database stores `firstName` and `lastName` as separate fields because that's how your signup form works. But every frontend request expects `fullName` to display in the UI and in emails. You start adding `fullName` to the database too, but now you have a synchronization problem: when someone updates their first name, you have to remember to update the full name in the same transaction. If you forget, the data gets out of sync. You've got duplicate data, extra storage costs, and bugs when the two values diverge.

This is the moment you realize you need virtuals — computed properties that exist on your Mongoose documents but never touch the database.

## 2. The Analogy — Make the Mechanic Obvious

Think of virtuals like a spreadsheet formula. In Excel, you might have cells A1 and A2 with numbers, and cell A3 with a formula `=A1+A2`. Cell A3 shows you the sum, but that sum isn't stored anywhere — it's calculated on the fly whenever you look at the cell. If you change A1, A3 updates automatically. You don't need to manually update A3 because it's not real data — it's a computed view of the real data.

Mongoose virtuals work the same way. Your real fields are like A1 and A2 — they're stored in MongoDB. The virtual is like A3 — it's calculated from the real fields whenever you access it, but it's never saved to the database.

## 3. The Full Explanation — How It Actually Works

A virtual in Mongoose is a property that you define on your schema that doesn't map to a field in MongoDB. It exists only in your Node.js application code. When you access a virtual on a document, Mongoose runs a getter function that computes the value from other fields on that document. When you set a virtual, Mongoose runs a setter function that can parse the value and store it in the real fields.

The key thing is that virtuals are never included in MongoDB queries or documents. If you do `User.find()`, the response from MongoDB won't contain the virtual. Mongoose adds the virtual after it receives the document from the database, by running your getter function. This means virtuals don't cost storage space and they can't get out of sync with the underlying data — they're always computed fresh.

Virtuals can have just a getter, just a setter, or both. A getter-only virtual is read-only from the application's perspective — it's computed but you can't assign to it. A virtual with both lets you assign to it like a real field, and the setter handles breaking that value down into the actual stored fields.

One important limitation: virtuals don't work in MongoDB queries by default. If you try `User.find({ fullName: 'John Doe' })`, MongoDB won't find anything because `fullName` doesn't exist in the database. To query on virtuals, you have to use Mongoose's lean options or explicitly transform the query criteria. This is a trade-off — you get clean computed properties, but you can't directly query them.

## 4. See It In Practice — Real Code or Queries

Here's a user schema with a virtual for full name:

```javascript
const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true }
});

// Virtual for full name - getter only
userSchema.virtual('fullName').get(function() {
  // 'this' refers to the document instance
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for full name with both getter and setter
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
}).set(function(value) {
  // Split "John Doe" into firstName="John", lastName="Doe"
  const parts = value.split(' ');
  this.firstName = parts[0];
  this.lastName = parts.slice(1).join(' ');
});

const User = mongoose.model('User', userSchema);

// Using the virtual getter
const user = new User({ firstName: 'John', lastName: 'Doe', email: 'john@example.com' });
console.log(user.fullName); // "John Doe" - computed on the fly

// Using the virtual setter
user.fullName = 'Jane Smith';
console.log(user.firstName); // "Jane"
console.log(user.lastName); // "Smith"

// Virtuals are not saved to MongoDB
await user.save();
const doc = await User.findById(user._id).lean(); // lean returns plain object
console.log(doc.fullName); // undefined - not in the database

// But they work with Mongoose documents
const userDoc = await User.findById(user._id);
console.log(userDoc.fullName); // "Jane Smith" - computed by Mongoose
```

Virtuals are especially useful for formatting data for API responses:

```javascript
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  priceInCents: { type: Number, required: true },
  taxRate: { type: Number, required: true, default: 0.08 }
});

productSchema.virtual('priceInDollars').get(function() {
  return (this.priceInCents / 100).toFixed(2);
});

productSchema.virtual('totalPrice').get(function() {
  const total = this.priceInCents * (1 + this.taxRate);
  return (total / 100).toFixed(2);
});

productSchema.virtual('displayPrice').get(function() {
  return `$${this.priceInDollars}`;
});

const Product = mongoose.model('Product', productSchema);

const product = new Product({
  name: 'Coffee Mug',
  priceInCents: 1499,
  taxRate: 0.08
});

console.log(product.displayPrice); // "$14.99"
console.log(product.totalPrice); // "$16.19"
```

Virtuals also work well for related data references:

```javascript
const authorSchema = new mongoose.Schema({
  name: { type: String, required: true }
});

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Author' }
});

// Virtual to get the author document
bookSchema.virtual('author', {
  ref: 'Author',
  localField: 'authorId',
  foreignField: '_id',
  justOne: true
});

const Book = mongoose.model('Book', bookSchema);

// You need to populate the virtual to get the author
const books = await Book.find().populate('author');
console.log(books[0].author.name); // Author name, fetched via population
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What are virtuals in Mongoose and when would you use them?**

Virtuals are computed properties on Mongoose documents that don't persist to the database. They're defined on the schema but don't have corresponding fields in MongoDB. Use them when you need derived data that can be calculated from existing fields — like combining first and last name, formatting prices, or computing totals. They keep your database schema clean and avoid data duplication, which eliminates synchronization bugs.

**Q: Do virtuals get saved to MongoDB?**

No, virtuals are never saved to MongoDB. They exist only in your application code. When you call `save()` on a document, Mongoose only sends the real schema fields to MongoDB. The virtuals are computed on-demand when you access them on a Mongoose document in your Node.js code.

**Q: Can you query on virtuals?**

Not directly with MongoDB queries. Since virtuals don't exist in the database, a query like `User.find({ fullName: 'John Doe' })` won't work because MongoDB doesn't know what `fullName` is. To query on computed values, you either need to use MongoDB aggregation with computed fields, or query on the underlying real fields and let the application compute the virtual after retrieval.

**Q: What's the difference between a virtual and an instance method?**

A virtual is accessed like a property — `user.fullName` — and can have both getters and setters. An instance method is a function you call — `user.getFullName()`. Virtuals are better for data that feels like a field, while methods are better for actions or computations that take parameters. Both can access `this` to work with the document data.

**Q: When would you use a virtual setter instead of just a getter?**

Use a setter when you want to accept data in one format but store it in another. For example, accepting a full name string and splitting it into first and last name, or accepting a price in dollars and storing it in cents. The setter makes your API cleaner because consumers can work with the natural format while your database stores the optimized format.

**Q: How do virtuals affect JSON serialization?**

By default, virtuals are not included when you call `JSON.stringify()` on a Mongoose document or when you send the document in an API response. To include virtuals in JSON, you need to set the `toJSON` schema option to `{ virtuals: true }`. This is a common gotcha — developers define a virtual, test it in console.log, and then wonder why it's missing from their API response.

## 6. The Traps — What Goes Wrong in Production

**Trap: Forgetting to enable virtuals in JSON output**

You define a virtual, it works in your console logs, but your API responses don't include it. This happens because `JSON.stringify()` and many framework serializers ignore virtuals by default. The fix is to add `toJSON: { virtuals: true }` to your schema options. Without this, your frontend won't see the virtual data even though it exists on the document.

**Trap: Trying to query on virtuals directly**

You write `User.find({ fullName: 'John Doe' })` expecting it to work, but it returns no results. Since virtuals don't exist in MongoDB, the query fails silently. You need to either store the computed value as a real field if you need to query on it, or use aggregation to compute it during the query. Don't use virtuals for data you need to filter or sort by.

**Trap: Assuming virtuals work with lean()**

When you use `.lean()` to get plain JavaScript objects instead of Mongoose documents (for performance), virtuals disappear. Lean objects are raw database documents without the Mongoose document layer, so virtual getters never run. If you need virtuals, don't use lean, or manually compute the values after the query.

**Trap: Virtuals in arrays and nested objects**

Virtuals on array elements or nested schemas can be confusing. If you define a virtual on a subdocument schema, it works on those subdocuments, but you have to access it through the path. Virtuals don't automatically propagate through arrays in the way you might expect — you often need to iterate or use schema-level middleware to compute array-based virtuals.

**Trap: Performance with complex virtuals**

A virtual that runs complex calculations or makes async calls can slow down your application if accessed in a loop. Every access to the virtual runs the getter function. If you have a virtual that fetches related data or does heavy computation, consider caching the result or computing it once explicitly rather than accessing it repeatedly.

## 7. Compare With Related Concepts

**Virtuals vs Instance Methods**

Virtuals are accessed as properties and can have setters. Methods are called as functions and can take parameters. Use virtuals for data that should feel like a field on the document. Use methods for actions or computations that need input parameters.

**Virtuals vs Stored Computed Fields**

Virtuals are computed on access and never stored. Stored computed fields are saved to the database, usually via middleware or triggers. Virtuals save storage but cost CPU on every access. Stored fields cost storage but are faster to read and can be indexed. Choose virtuals for simple derivations, stored fields for expensive computations or data you need to query on.

**Virtuals vs Defaults**

Schema defaults set the initial value of a real field when a document is created. Virtuals compute a value from existing fields every time you access them. Defaults are for initialization. Virtuals are for ongoing derivation. Don't use a virtual to set an initial value — use a default.

**Virtuals vs Middleware**

Middleware (pre/post hooks) runs on save, find, update, and other operations. Virtuals run on property access. Middleware is for side effects and validation. Virtuals are for computed data. If you need to ensure something happens when data changes, use middleware. If you just need to format or compute data on read, use virtuals.

## 8. 🧠 The Memory Hook

Virtuals are spreadsheet formulas for your database — computed on access, never stored, always in sync.
