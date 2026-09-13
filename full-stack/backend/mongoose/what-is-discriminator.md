# What is a Discriminator in Mongoose

## 1. Why This Exists — The Problem First

Your app stores `events` in one collection — `ConferenceEvent`, `WebinarEvent`, and `MeetupEvent` share `title`, `startDate`, and `organizer`, but each type has different fields. A junior dev creates three separate collections and three models. Reporting now needs three queries and a manual merge. Another dev puts everything in one schema with twenty optional fields — half the documents carry dead keys, validation is a mess, and `event.venue` exists on webinars where it should not.

Mongoose **discriminators** solve this: one base collection, multiple schemas that inherit the base, with a hidden `__t` field telling Mongoose which subtype each document is. You query the base model for everything, or a subtype model for type-specific operations — single collection, correct validation per type.

## 2. The Analogy — Make It Obvious

Think of a hospital patient record system.

- **One filing cabinet** (collection) holds every patient chart.
- **Every chart has a cover sheet** (base schema): name, date of birth, insurance ID.
- **A colored tab on the spine** (`__t` discriminator key) says "Inpatient," "Outpatient," or "Emergency."
- **Inside the folder**, extra pages differ by type — inpatients have a bed assignment form; emergency visits have triage notes.
- The clerk can pull **all patients** from one cabinet, or only **inpatients** by filtering on the tab color.

You do not need three separate filing cabinets, and you do not stuff every possible form into every folder.

## 3. How It Actually Works — The Full Explanation

A discriminator is a **schema inheritance mechanism** built on a single MongoDB collection.

**Setup:**

1. Define a **base schema** and model (e.g., `Event`).
2. Call `Event.discriminator('ConferenceEvent', conferenceSchema)` to register a subtype.
3. Mongoose adds a `__t` field (or a custom `discriminatorKey`) storing the discriminator name.
4. Each subtype schema inherits base fields and adds its own.

**Writes:**

- `ConferenceEvent.create({ title, venue, ... })` sets `__t: 'ConferenceEvent'` automatically.
- Base model `Event.create(...)` sets `__t` to the base model name unless overridden.

**Reads:**

- `Event.find()` returns all subtypes as the correct hydrated class (when using subtype models for queries).
- `ConferenceEvent.find()` adds `{ __t: 'ConferenceEvent' }` to the filter automatically.

**Validation:**

Each subtype schema validates only its own paths plus inherited base paths. A webinar document cannot pass validation with a required `venue` field that belongs only to conferences.

**Indexes:**

Defined on the base schema apply to the whole collection. Subtype-specific indexes are possible but less common — remember one physical collection backs all types.

**Middleware:**

`pre('save')` on the base schema runs for all subtypes. Hooks on a subtype run in addition for that type.

## 4. Real Code — See It Working

**Base schema and discriminators**

```js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const eventSchema = new Schema(
  {
    title: { type: String, required: true },
    startDate: { type: Date, required: true },
    organizer: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { discriminatorKey: "kind" } // WHY: custom key instead of default __t
);

const Event = mongoose.model("Event", eventSchema);

const conferenceSchema = new Schema({
  venue: { type: String, required: true },
  capacity: Number,
});

const webinarSchema = new Schema({
  streamUrl: { type: String, required: true },
  maxAttendees: Number,
});

// WHY: each subtype is its own model, same underlying collection
const ConferenceEvent = Event.discriminator("ConferenceEvent", conferenceSchema);
const WebinarEvent = Event.discriminator("WebinarEvent", webinarSchema);
```

**Creating subtype documents**

```js
await ConferenceEvent.create({
  title: "JSConf",
  startDate: new Date("2026-09-01"),
  venue: "Berlin",
  capacity: 500,
});
// stored with kind: "ConferenceEvent"
```

**Querying across and within types**

```js
// all events regardless of type
const all = await Event.find({ startDate: { $gte: new Date() } });

// only webinars — Mongoose adds { kind: "WebinarEvent" }
const webinars = await WebinarEvent.find({ maxAttendees: { $gte: 100 } });
```

**Nested discriminators (advanced)**

```js
const ClickedLink = eventSchema.discriminator(
  "ClickedLink",
  new Schema({ elementId: String })
);
// sub-discriminators inherit from an intermediate schema in some setups
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a Mongoose discriminator?**

A way to store multiple related document shapes in one MongoDB collection using schema inheritance. A base model owns the collection; subtype models add fields and validation. A discriminator key field (default `__t`) identifies which schema applies to each document.

**Q: Why use discriminators instead of separate collections?**

When subtypes share most fields and you often query across all types. One collection simplifies reporting, pagination, and indexing on common fields. Separate collections make sense when subtypes are truly independent with little overlap.

**Q: What is the `__t` field?**

The discriminator key Mongoose writes on each document. Defaults to the model name. You can rename it with `{ discriminatorKey: 'kind' }` on the base schema options.

**Q: Can you query the base model and get subtype-specific fields?**

Yes. `Event.find()` returns documents with all fields stored in MongoDB, including subtype-specific ones. Hydration uses the discriminator value to instantiate the correct subtype class when possible.

**Q: How do discriminators compare to embedding?**

Discriminators are for **variant documents in one collection** (is-a relationship). Embedding is for **contained subdocuments** (has-a). A `ConferenceEvent` *is an* `Event`; an `address` *belongs to* a `User`.

## 6. The Traps — What Goes Wrong

**Redefining discriminators on hot reload.** In development, calling `discriminator()` twice on the same base throws. Guard with `mongoose.models.ConferenceEvent` checks or delete models between reloads.

**Optional-field soup instead of discriminators.** Twenty optional fields on one schema loses per-type validation and clutters documents. If types have different required fields, discriminators or separate collections are cleaner.

**Wrong discriminator key in raw inserts.** Inserting via the MongoDB shell without the discriminator field means Mongoose cannot pick the right class on read and validation may not run as expected.

**Assuming separate indexes per subtype.** It is one collection — index design must account for all document shapes. Sparse indexes help for subtype-only fields.

**Deep inheritance trees without planning.** More than two levels of discriminators gets hard to reason about. Often embedding or separate services per domain is simpler.

## 7. Compare With Related Concepts

**Discriminators vs separate collections**

| Discriminators | Separate collections |
|---|---|
| Shared queries across types | Type-isolated queries |
| One index on shared fields | Per-collection indexes |
| Subtype-specific validation | Fully independent schemas |
| Single collection growth | Operational separation |

**Discriminators vs single schema with `type` enum**

A manual `type` field with conditional validation works for two simple variants. Discriminators give you separate models, cleaner validation, and automatic query filtering.

**Discriminators vs MongoDB schema validation**

MongoDB `$jsonSchema` validation is server-side and separate from Mongoose. Discriminators are an ODM pattern — use both in production for defense in depth.

## 8. 🧠 The Memory Hook — What Sticks

Discriminators are **colored tabs on one filing cabinet** — same collection, shared cover sheet, different inner forms per tab (`__t` / `kind`). Query the cabinet for everyone, or one tab's model for a single subtype.
