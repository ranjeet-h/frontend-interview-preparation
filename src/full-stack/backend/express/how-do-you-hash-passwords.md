# How do you hash passwords

## 1. The Real-World Problem — When You Actually Hit This

A startup launches with a simple signup form. Their senior dev reads an article years ago that said "never store plain-text passwords," so the database stores `SHA-256(password)`. Everyone feels safe. Two years later a backup bucket gets exposed publicly. Within hours, attackers have recovered most of the passwords in the table. Not because SHA-256 was "cracked" — because a modern GPU computes billions of SHA-256 hashes per second, and the fastest way to break a fast hash is to simply guess every common password until one matches. Every user whose password was `password123` is now burned, and since people reuse passwords, their email and other accounts burn with them. Your company's breach becomes everyone else's breach too.

The uncomfortable part is that the team *did* hash. They just didn't understand what actually makes password storage safe: a deliberately slow algorithm, a unique random salt per password, and a verification method that never leaks information. This page is about those three things, because interviewers love this topic precisely because so many candidates say "just hash it with SHA-256" and stop there.

You'll also hit a second wall early in your career: someone in a planning meeting says, "Can't we just decrypt the password to email it to them?" That question tells you they're thinking of encryption, not hashing — and understanding why those are fundamentally different tools is half of this interview topic.

## 2. The Analogy — Make the Mechanic Obvious

Imagine a locksmith who builds **time-lock safes** to protect secret phrases. Here's how he works, step by step:

When a customer hands him a secret phrase, he builds a custom safe. Inside the door, a mechanism physically reshapes a set of brass tumblers based on the phrase — a one-way manufacturing process. Once shaped, you cannot look at the tumblers and reconstruct the phrase, any more than you can un-carve a statue back into the sculptor's clay sketch. The original phrase is destroyed. The customer keeps it in their head; the locksmith keeps nothing.

On the outside of every safe door, the locksmith stamps a **random engraving** — different on every single safe, generated fresh at build time. The engraving isn't a secret and isn't hidden; it's stamped in plain sight. But the tumbler-shaping machine reads the engraving as part of its input, so two customers with the *identical* phrase end up with completely different tumbler patterns. Same phrase, different safes, no visible resemblance.

He also installs a **gear train that forces every test attempt to run a full timed cycle** — say four seconds per attempt. You can't crank faster; the gears won't let you. The owner turns the dial with their phrase, the mechanism runs its full slow cycle, and the door either opens or stays shut. Four seconds is nothing for one honest opening. But a thief with a stolen safe who wants to try a million phrases faces a million times four seconds. The slowness isn't a flaw — it was installed on purpose, and the buyer chooses how strong to set it.

Now the burglary: thieves steal the whole warehouse of safes. They have every safe, every engraving, every tumbler pattern — and they still have nothing usable except an expensive guessing problem. There's no master key, no back panel, no "open" instruction anywhere, because the safes were never designed to give the phrase *back* — only to *test* guesses against it.

One last detail. An old-fashioned lock *clicks* faintly when each pin lines up — that feedback is literally how lockpicking works. The locksmith knows this, so his tester gives **zero feedback until the entire cycle completes**. No partial clicks, no "you got the first five characters." Just silence, then a final yes or no.

Keep this picture. Every piece maps onto real machinery:

- Brass tumblers shaped irreversibly → the hash itself
- Random door engraving → the salt
- Gear-forced timed cycle → the cost factor
- Testing a guess through the full cycle → `bcrypt.compare()`
- Clickless testing → timing-safe comparison
- Pre-printed catalogs of tumbler patterns → rainbow tables (useless once every safe has its own engraving)

## 3. The Full Explanation — How It Actually Works

Start with what a hash function even is. It takes any input and produces a fixed-size fingerprint. Three properties matter: the same input always produces the same output; a one-character change scrambles the entire output; and you cannot go backwards — not because it's secret, but because information is thrown away. Infinite possible inputs collapse into a finite set of outputs, so there's no inverse operation waiting to be run. Asking "what was the password?" from a hash is like asking "what was the paragraph?" from its word count.

General-purpose hashes like SHA-256 are built to be **fast** — that's their whole job. When you're verifying a downloaded file or computing a checksum millions of times, speed is the feature. And that's exactly why they're catastrophic for passwords. If verifying a guess takes a microsecond, an attacker with a GPU rig verifies billions of guesses per second. The very property that makes SHA-256 great at integrity checks makes it useless for storage.

Password hashing flips the design goal. Algorithms like **bcrypt**, **scrypt**, **PBKDF2**, and **argon2** belong to a family sometimes called password-hashing functions or key derivation functions, and they share three traits:

First, they are **deliberately slow**, and the slowness is adjustable. In bcrypt, that dial is the cost factor: the algorithm runs `2^cost` internal rounds. Cost 10 is about a thousand rounds; cost 12 is about four thousand; every +1 doubles the work. The practical rule (OWASP publishes guidance along these lines) is to tune the dial until one hash takes roughly 200–500 milliseconds on your production hardware. Login feels instant to a human; brute force becomes economically absurd. The exact milliseconds depend entirely on your CPU, so measure rather than memorize — more on that in the code section.

Second, they are **salted automatically**. A salt is a chunk of cryptographically random data — bcrypt generates a fresh 128-bit one per hash — mixed into the hashing input. Its purpose is uniqueness: with per-password salts, two users choosing `password123` produce totally different stored strings, and an attacker can't precompute anything useful. Without a salt, identical passwords produce identical hashes, so an attacker can build or download a **rainbow table** — a giant precomputed dictionary of "common password → hash" pairs — and just look up your whole database column. Salting kills that attack because the lookup table would have to be rebuilt separately for every single user's salt, which costs more than guessing directly.

Here's the part people find surprising: **the salt is not stored in a separate column and doesn't need protecting**. It lives inside the hash string itself. A bcrypt output looks like this:

```txt
$2b  $  12  $  R9h/cIPz0gi.URNNX3kh2O  PST9/PgBkqquzi.Ss7KIUgO2t0jWMUW
 │      │        │                       │
 │      │        │                       └─ 31 chars: the checksum (the actual hash)
 │      │        └─ 22 chars: random salt generated for THIS hash
 │      └─ cost factor 12 → 2^12 = 4,096 internal rounds
 └─ bcrypt, version 2b
```

Sixty characters total, self-describing. The algorithm, the cost, and the salt all travel together inside the string. That self-containment is what powers verification.

Third, verification is **re-derivation, not decryption**. When you call `compare(candidatePassword, storedHash)`, the library parses the stored string, extracts the salt and cost factor, runs the exact same slow computation on the candidate password with those exact parameters, and checks whether the result matches the stored checksum. Nothing is "unlocked" — the library simply re-runs the safe-building process and sees whether the tumblers come out shaped identically. This is also why `compare()` takes the *whole stored hash* and not a bare salt: the string is the recipe.

One subtlety inside `compare()` deserves attention: the final match check is done in a way that takes the **same amount of time whether zero bytes matched or all-but-one did**. Why care? Because ordinary string comparison (`===`) exits at the first mismatching character. Compare `"aaaa..."` versus `"baaa..."` and versus `"aaaab"` — the second mismatch is found later, so the response comes back slightly slower. Given enough requests, an attacker can measure those microsecond differences and reconstruct a secret byte by byte, like the clicking pins in an old lock telling the picker how close they are. For high-entropy secrets compared directly — session tokens, reset tokens, API keys — that timing side channel is real and exploitable. So the rule is: never compare secrets with `===`. Use `crypto.timingSafeEqual()` in Node for raw values, and use `bcrypt.compare()` / `argon2.verify()` for passwords, both of which handle this internally. (Comparing two already-hashed values with `===` leaks far less than comparing passwords, but there's no reason to accept any leak when safe primitives exist.)

Where does **argon2** fit? It won the Password Hashing Competition in 2015 and adds a weapon bcrypt doesn't have: **memory hardness**. Argon2 forces every guess to fill a configurable block of RAM (its `memoryCost` parameter). CPUs have gotten fast at repeating math quickly, which is what GPU and ASIC cracking rigs do well — but giving every parallel guess its own big slab of memory is expensive on specialized chips. That makes large-scale parallel cracking much pricier. The `argon2id` variant is the usual recommendation today, configured roughly along OWASP's published minimums (for example around 19 MiB of memory and 2 passes — treat current OWASP guidance as the source of truth, not any hardcoded number). Both bcrypt and argon2 are acceptable answers in interviews; saying "argon2id for new systems, bcrypt everywhere it's already deployed, and both beat SHA-256 by design" is the strongest position.

Now the emphasis question that trips up smart people: **why is hashing not encryption?** Encryption is a two-way transform. You encrypt with a key, and — crucially — you decrypt with a key when you need the data back. That's the right tool for data you must read again: TLS traffic, files at rest, a stored card holder's name. Hashing has no key and no reverse operation, ever. You cannot decrypt a hash because there is nothing to decrypt — the input was mangled beyond recovery, on purpose. For passwords this is exactly what you want, because your system should never need to *know* a password again, only to *check* one. Think back to the analogy: encryption is a locked box with a key taped somewhere nearby — steal both and you own the contents. The time-lock safe has no key at all, only an endless slow guessing game. And the moment someone in your company asks to "decrypt the passwords," the correct engineering answer is: that feature must not exist; whatever they're trying to solve (password recovery, migration) gets solved with a reset flow instead. Storing passwords reversibly means one key leak converts your whole user table into plain text.

Two operational realities round out the mechanic. First, **Node.js threading**: bcrypt's slowness is CPU work. The popular native `bcrypt` package runs that work on Node's libuv threadpool (four slots by default), so the event loop keeps serving other requests — but four simultaneous logins saturate the pool, and heavier costs mean longer waits behind them. The pure-JavaScript `bcryptjs` package is worse: it blocks the main thread outright, freezing your *entire* server during every hash. Size your threadpool (`UV_THREADPOOL_SIZE`) and load-test logins rather than discovering this during a traffic spike. Second, **upgrading over time**: because the cost travels inside the hash string, you can raise it later — on each successful login, peek at the stored prefix, and if it was hashed at an old cost, quietly re-hash with the new one and save. Security improves one returning user at a time, with no forced logout.

## 4. See It In Practice — Real Code or Queries

First, signup and login as you'd actually write them in an Express service. Environment assumptions: Node with `express` and the native `bcrypt` package installed; the in-memory `Map` stands in for your database, which stores the same shape — a hash column, never a password column.

```js
const express = require("express");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());

// Stand-in for your users table. Notice the field name:
// passwordHash. There is no plaintext password to store.
const users = new Map();

// Tuned per deployment — see the benchmark below. Cost 12 lands in
// the 200-500ms window on typical modern server hardware.
const BCRYPT_COST = 12;

app.post("/signup", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Every call to hash() generates a brand-new random salt,
    // applies 2^12 rounds, and embeds version + cost + salt in the
    // returned string. We never generate or manage salts ourselves.
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    users.set(email, { email, passwordHash });
    res.status(201).json({ message: "Account created" });
  } catch (err) {
    next(err);
  }
});

app.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = users.get(email);

    // One generic message for "no such user" and "wrong password",
    // so responses never confirm which emails are registered.
    // (Hardened setups also run a dummy compare here so the missing-user
    // path takes the same time as the real one — timing reveals less.)
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // compare() extracts salt + cost FROM the stored string, re-runs
    // the slow hash on the candidate, and finishes with a
    // constant-time comparison. Never fetch-and-compare manually.
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // From here: issue your session or JWT — see the JWT auth page.
    res.json({ message: "Logged in" });
  } catch (err) {
    next(err);
  }
});
```

The `try/catch` + `next(err)` pairing matters here because `bcrypt.hash` returns a promise — an unhandled rejection inside an async handler takes down the whole Node process. The mechanics of why live on the [async errors](./how-do-you-handle-async-errors-in-express.md) page, and where those errors end up lives on the [error-handling middleware](./what-is-error-handling-middleware.md) page.

Next, picking your cost factor with evidence instead of folklore. Run this where the app will actually run — your laptop lies to you about server performance:

```js
const bcrypt = require("bcrypt");

async function timeHashAtCost(cost) {
  const start = process.hrtime.bigint();
  await bcrypt.hash("some-sample-password", cost);
  return Number(process.hrtime.bigint() - start) / 1e6; // ns -> ms
}

(async () => {
  // Each step up doubles the work, so watch the numbers double too.
  // Pick the cost that lands near 250ms on PRODUCTION-like hardware.
  for (const cost of [10, 11, 12, 13]) {
    const ms = await timeHashAtCost(cost);
    console.log(`cost ${cost}: ${ms.toFixed(0)} ms per hash`);
  }
})();
```

Reading a stored hash is a skill interviewers probe, so practice decoding it on sight:

```txt
$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW

$2b     → bcrypt, version 2b
12      → cost factor: 2^12 = 4,096 rounds
R9h/cIPz0gi.URNNX3kh2O          → 22-char random salt (generated per hash)
PST9/PgBkqquzi.Ss7KIUgO2t0jWMUW → 31-char checksum (the hash proper)
```

Total length is always 60 characters. If a "bcrypt hash" in your database isn't 60 characters or doesn't start with `$2`, something corrupted it — validate before passing it to `compare()`.

For raw token comparisons — reset tokens, webhook secrets — reach for the primitive directly:

```js
const crypto = require("crypto");

// Generate at reset-request time: 256 bits of randomness.
const resetToken = crypto.randomBytes(32).toString("base64url");
// Store ONLY its SHA-256 digest + expiry in the database, and email
// the raw token — the DB copy can't be replayed if the DB leaks.

function tokensMatch(received, expected) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  // timingSafeEqual throws on length mismatch, so screen length first.
  // Revealing only the length of a random fixed-size token is harmless;
  // revealing WHERE it first differs (=== behavior) is not.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

And the argon2 equivalent for new projects, showing which knobs exist and why:

```js
const argon2 = require("argon2");

async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id, // hybrid variant; OWASP's default recommendation
    memoryCost: 19456,     // KiB ≈ 19 MiB of RAM burned per guess
    timeCost: 2,           // passes over that memory
    parallelism: 1,        // lanes/threads
  });                      // → "$argon2id$v=19$m=19456,t=2,p=1$..." self-describing
}

async function isPasswordValid(password, storedHash) {
  // Argument order trips people up: hash first, candidate SECOND.
  return argon2.verify(storedHash, password); // constant-time internally
}
```

Finally, the silent-upgrade pattern for raising an old cost factor without forcing anyone to reset:

```js
async function loginWithUpgrade(email, password) {
  const user = await getUserByEmail(email); // your DB call
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return false;

  // Hashes carry their own cost, so we can see who predates an increase.
  // (Check the actual cost segment rather than hardcoding one prefix in
  // real code — $2a$, $2b$, $2y$ are all legitimate bcrypt tags.)
  const costIsCurrent = /^\$2[aby]\$12\$/.test(user.passwordHash);
  if (!costIsCurrent) {
    user.passwordHash = await bcrypt.hash(password, 12);
    await saveUser(user);
  }
  return true;
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you hash passwords in an Express application?**

Walk the full lifecycle, because naming the library alone earns a junior answer. On signup, take the plaintext from the request body and immediately convert it with `await bcrypt.hash(password, 12)` — the promise-based form so the CPU-heavy work runs on the threadpool instead of blocking the event loop. Store only the returned string, in a column honestly named `password_hash`; bcrypt generated a unique random salt and embedded it in that string, so there's nothing else to manage. On login, load the user, call `await bcrypt.compare(candidatePassword, user.passwordHash)`, and branch on the boolean — never select the hash yourself and diff strings, because `compare()` handles parameter extraction and timing safety. Respond identically to "unknown email" and "wrong password," wrap awaits in try/catch routed to your error middleware, and rate-limit the endpoint since hashing gives attackers no shortcut but you also don't want to fund their guessing with free CPU time. Mentioning argon2id as the alternative for greenfield projects, plus "I benchmark the cost on production hardware," signals seniority.

**Q: Why can't you just use SHA-256 for passwords — it's a secure hash, isn't it?**

Secure for its purpose, which is speed: integrity checks, signatures, Merkle trees. The problem is arithmetic economics. SHA-256 on a modern GPU costs a fraction of a microsecond per attempt, so an attacker trying common passwords racks up billions of guesses per second per card. Password security is a race between the defender's cost per guess at rest and the attacker's throughput, and fast algorithms hand the attacker unlimited throughput. Password-specific functions invert the requirement: hundreds of milliseconds per guess, tuned upward over time as hardware improves. Add the salting angle: unsalted SHA-256 falls to precomputed rainbow tables instantly, and even hand-rolled "salted SHA-256" keeps the fatal property — the attacker's guesses stay free-fast. As a bonus point, MD5 isn't just too fast, it's cryptographically broken with practical collision attacks; it shouldn't appear in any new design for any purpose.

**Q: What exactly is a salt, and why does it matter?**

A salt is fresh random data mixed into each individual hash so identical passwords stop looking identical. Its whole job is defeating precomputation. Unsalted, an attacker buys one rainbow table covering the million most common passwords and looks up your entire column. Per-password salted, that table would need rebuilding once per user — at which point just guessing directly is cheaper. Two details elevate the answer. First, salts aren't secrets: bcrypt stamps the salt into the hash string in plain sight, because uniqueness, not secrecy, is the defense. Second, you don't manage salts at all — calling `bcrypt.hash()` handles generation, embedding, and extraction during compare. Worth distinguishing from a **pepper**: an application-wide secret added to every password before hashing, stored outside the database (env var or secrets manager) so a SQL-level leak alone can't produce crackable hashes. Pepper is defense-in-depth, optional, and rotates painfully — salt first, always.

**Q: What cost factor should you use with bcrypt, and how do you decide?**

The honest framing: cost is a tuning decision measured in milliseconds, not a magic number. Each increment doubles the work (`2^cost` internal rounds). Target the ballpark where one hash takes roughly 200–500ms on the machines that will serve logins — long enough that GPU farming becomes absurdly uneconomical, short enough that a burst of logins doesn't pile up. Find it empirically: `console.time` around `bcrypt.hash("x", n)` for costs 10–14, run on production-equivalent hardware (containers and shared cloud instances often benchmark slower than laptops), and pick the winner. Cost 12 sits near 250ms on typical modern servers, but quote it as "typically, measure anyway." Then revisit annually — the beauty of embedded parameters is that `rehash-on-login` lets the fleet upgrade invisibly as hardware speeds up. If asked about limits: bcrypt tops out practically around cost 31, and its 72-byte input cap is a separate consideration covered in the traps below.

**Q: How does `bcrypt.compare()` verify a password if the salt is random?**

This is the question that separates people who've used bcrypt from people who understand it. The salt never needed to stay secret — it needed to stay *attached*. The stored hash is self-describing: version, cost, salt, checksum, in that order. `compare()` splits the string, pulls out cost and salt, feeds the candidate password plus that extracted salt through the identical round schedule, and produces a fresh checksum. Right password → identical checksum. Wrong password → avalanche scattering guarantees a different one. Then it compares the two checksums in constant time. So "randomness" and "verifiability" coexist because verification *re-derives* using recorded inputs instead of reversing anything. Same mental model explains why changing the cost later works: the new cost rides along in newly written hashes, and old ones keep declaring their own history.

**Q: Is hashing the same as encryption?**

No, and confusing them is the root of the worst production mistakes in this area. Encryption transforms data using a key and is designed to be reversed with that key — it's for data you must read again, like TLS traffic or encrypted columns you display. Hashing is a one-way fingerprint with no key: reversal isn't hard, it's *undefined* — the information to reconstruct the input was discarded. Passwords want the second contract: the server should only ever *check* claims, never *know* secrets. That's why "just encrypt the password column" is a weaker answer than it sounds — it implies a key exists somewhere, and keys get leaked alongside databases far more often than anyone hopes, converting the whole column to plaintext in one step. It's also why features like "email me my password" are impossible-by-design: if your system can retrieve a password, it stored it reversibly, which means it stored it wrong. The fix for forgotten passwords is a reset flow, not retrieval.

**Q: How do you implement password reset securely?**

The flow has seven steps and each exists for a reason. User requests a reset with their email. Server generates high-quality randomness: `crypto.randomBytes(32).toString("base64url")` — never timestamps or sequential IDs, which are guessable. It stores the **SHA-256 hash of the token** plus a short expiry (an hour is plenty) against the user record, and emails the *raw* token as a one-time link. Hashing the stored copy means a database leak doesn't yield working reset links — the same verify-only philosophy as passwords themselves. When the user submits a new password, the server hashes the presented token, finds a matching unexpired row, and — critically — deletes or marks it used so reuse is impossible. Then it hashes the new password with bcrypt/argon2 and updates the record. Two production details finish the senior answer: respond with the same neutral message whether or not the email exists, so the endpoint can't enumerate registered users (and consider a dummy hash to equalize timing), and rate-limit requests because each one costs an outbound email.

**Q: bcrypt or argon2 — which would you choose and why?**

Both are correct answers; the reasoning is what's graded. Argon2 won the dedicated Password Hashing Competition (2015) and its memory-hardness is the headline: every guess must allocate a configurable block of RAM, which hurts GPU/ASIC crackers far more than extra CPU rounds do, since those devices win by doing cheap math in massive parallel. It exposes three dials — memory, time passes, parallelism — and `argon2id` is the recommended variant. OWASP's current guidance leans argon2id (or scrypt) first for new systems, with bcrypt explicitly still acceptable. Bcrypt's counterpoints: decades of battle-testing, dead-simple configuration (one integer), universal availability, and hashes that are short and stable. My actual practice: argon2id with OWASP-referenced parameters for new services, bcrypt untouched where it's already deployed and tuned, and never a home-grown combination of fast primitives. Migrations between them ride the same rehash-on-login pattern as cost bumps.

**Q: Why do people insist on timing-safe comparison? Isn't a string comparison just comparing strings?**

Because comparison time is observable. Naive comparison stops at the first differing byte, so `"AAAA…"` fails almost instantly while `"AAAA…AAAB"` fails after nearly the whole scan. Over many requests, an attacker measuring response microseconds learns how many leading bytes were correct — turning authentication into a byte-at-a-time oracle, the digital version of a lock that clicks as pins align. Whether that's exploitable depends on noise, network jitter, and volume, but the defense costs nothing, so there's no excuse. `crypto.timingSafeEqual(a, b)` scans the entire buffer regardless of where differences sit; it demands equal lengths, so screen length first (leaking a random token's *length* reveals nothing useful). For passwords you rarely write this by hand — `bcrypt.compare()` and `argon2.verify()` already end in constant-time comparisons — which is exactly why rolling your own "fetch hash and `===` it" logic is worse than just calling the library.

**Q: Does heavy hashing hurt my Node.js server?**

It can, and quantifying that trade-off is a genuinely senior observation. Native `bcrypt` executes C code asynchronously on libuv's threadpool, defaulting to four slots — the event loop keeps flowing, but four concurrent logins occupy every slot, and other threadpool users (fs operations, DNS) queue behind multi-hundred-millisecond hashes. Pure-JS `bcryptjs` is worse: it runs on the main thread, so every hash freezes *all* request handling for its full duration. Practical mitigations: size `UV_THREADPOOL_SIZE` to your core count, load-test realistic concurrent-login bursts at your chosen cost, consider a small queue or limiter so a login storm can't monopolize the pool, and remember argon2 shifts pressure toward memory rather than escaping the constraint. The takeaway isn't "avoid slow hashes" — it's that login endpoints are intentionally CPU-expensive and deserve capacity planning like any other expensive operation.

## 6. The Traps — What Goes Wrong in Production

**Salting SHA-256 and calling it done.** People learn "add a salt" and apply it to the wrong algorithm. Salting fixes *precomputation* (rainbow tables) but changes nothing about guess *speed* — the attacker just includes the known salt in each of their billions of fast guesses. The defense against speed is deliberate slowness, which only bcrypt/scrypt/argon2/PBKDF2 provide. Salt and slow are two separate requirements, and SHA-256 satisfies neither.

**One shared "salt" for the whole database.** A global constant mixed into every password is barely better than none: identical passwords still produce identical hashes across users, so one rebuilt rainbow table cracks everyone again. It also tends to live in source control, forever. The requirement is *per-password* randomness, freshly generated on every hash call — which bcrypt does automatically, which is why "let the library handle it" is the correct amount of involvement.

**bcrypt silently truncates at 72 bytes.** Pass a 100-character passphrase to bcrypt and only the first 72 bytes influence the hash — the tail is ignored, which surprises people whose "long passwords are stronger" advice quietly stops applying. The related footgun: some teams pre-hash long input with raw `sha256(binary)` before bcrypt, and binary digests can contain null bytes, which bcrypt treats as terminators, collapsing distinct inputs onto the same hash. If you must support arbitrarily long passphrases on bcrypt, pre-hash with SHA-256 and encode as base64 (or hex) so the input is null-free — or sidestep the entire class of problem with argon2, which has no such cap.

**Rolling your own verification.** Fetching the stored hash and comparing it to something you computed yourself breaks in slow ways: you re-implement salt extraction, you skip constant-time comparison, and you couple your code to one algorithm's internals so a future migration touches business logic. `bcrypt.compare()` and `argon2.verify()` exist precisely to own all of that. Similarly, storing salt in its own column "to be safe" usually means someone eventually regenerates it or strips it during a migration, orphaning every hash. The string is self-contained by design — trust it.

**Treating password hashing as free CPU.** At 250ms per hash, a script hammering `/login` consumes serious server time even though every guess fails — and with `bcryptjs`, it stalls your whole event loop while doing it. Production consequences show up as cascading latency during credential-stuffing campaigns. Pair hashing with rate limiting and monitoring on auth endpoints, keep hashing off the main thread (native packages, adequate threadpool), and budget for the fact that login is one of your most expensive endpoints by design.

**Building the "recover password" capability.** It starts reasonably — support asks for a way to tell users their passwords. Any implementation of that feature requires reversible storage (encryption, or worse, plaintext), and reversible storage means the next full database leak ships every user's password to the internet, hitting every other site where those users repeated the password. The invariant to hold in design reviews: the system must remain unable to produce a password, ever. Forgotten-password flows issue a *new* credential via reset tokens; they never surface old ones.

## 7. Compare With Related Concepts

**Password hashing (bcrypt/argon2) vs general hashing (SHA-256).** Same word, opposite design goals. General hashes optimize throughput for integrity, signing, deduplication, and content addressing; password hashes optimize *expensive, tunable, salted* verification for storage. Rule: hashing data the attacker already knows (files, blocks) → fast hash; hashing data the attacker wants to guess (passwords, tokens at rest) → password hash.

**Hashing vs encryption.** Hashing is irreversible, keyless verification — use it when you'll only ever check a value. Encryption is keyed and reversible — use it when you must read the data again (transport, files at rest, displayable sensitive fields). The presence of a "recover the original" requirement decides it. And a password, specifically, should never fall under that requirement.

**Hashing vs encoding.** Base64 and friends are transport formatting, not security — trivially reversible, no key, no protection, yet code reviews constantly find "encoded" passwords and tokens treated as hidden. Rule: if the concern is making data unreadable to attackers, encoding is never the answer; if the concern is making bytes survive JSON, URLs, or email, encoding is exactly right.

**Salt vs pepper.** A salt is per-password public randomness stored inside the hash string; it defeats precomputed tables. A pepper is an application-wide secret applied to every password and kept outside the database (env var/secrets manager); it adds a layer when the database leaks alone, but rotation is painful and it helps nothing if the app server is compromised too. Rule: salt is mandatory and automatic; pepper is optional defense-in-depth you add knowingly.

**bcrypt vs argon2id vs PBKDF2 vs scrypt.** All four are accepted password-hashing functions. PBKDF2 is everywhere (FIPS-friendly, in platform keystores) but only CPU-hard, so GPU rigs fare best against it; bcrypt adds tunable CPU cost and thirty years of trust; scrypt introduced memory-hardness; argon2id refines it and is the modern default recommendation. Rule: new systems → argon2id at current OWASP parameters; existing bcrypt → leave it tuned and upgrade via rehash-on-login; constrained to FIPS environments → PBKDF2 with high iteration counts.

## 8. 🧠 The Memory Hook

You never store the password — you store a **slow yes/no machine**. Its door engraving (the salt) shows anyone *how* to test a guess but never *what* the phrase is, and its gears are deliberately tuned so a single test burns a quarter second: invisible to one honest login, ruinous across a billion guesses — and there is no key anywhere, because the machine only answers questions, it never gives the phrase back.
