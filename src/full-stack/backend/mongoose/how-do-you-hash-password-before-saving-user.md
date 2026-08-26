# How Do You Hash Password Before Saving User

## 1. The Real-World Problem — When You Actually Hit This

Your user registration endpoint is working perfectly. Users sign up, you save their email and password to MongoDB, and they can log in. Everything is fine until someone compromises your database. Suddenly, every user's password is exposed in plain text. You discover that "password123" was used by 400 different people across your platform. Attackers now have those credentials, and because people reuse passwords, they're trying them on Gmail, banking sites, and everywhere else. This is the exact moment you realize that storing passwords as plain text is not just "bad practice" — it's a catastrophic security failure that destroys user trust and may have legal consequences.

## 2. The Analogy — Make the Mechanic Obvious

Think of hashing like a one-way paper shredder. When you feed a document into the shredder, it turns into confetti. You can see the confetti, but you can never reconstruct the original document from it. However, if someone hands you another document and you shred it, you can compare the confetti — if the confetti matches, the documents were identical.

For passwords, the "document" is the user's password. The "shredder" is a hashing algorithm like bcrypt. The "confetti" is the hash stored in your database. When a user logs in, you hash their input and compare it to the stored hash. If they match, the password was correct. But even if someone steals your database of hashes, they can't reverse the shredder to get the original passwords.

The shredder analogy also explains why we add "salt" — a random value mixed in before shredding. Without salt, the same password always produces the same confetti, so attackers can pre-compute hashes for common passwords. With salt, "password123" shredded with salt A looks completely different from "password123" shredded with salt B.

## 3. The Full Explanation — How It Actually Works

Hashing passwords before saving is about irreversible transformation using a cryptographic hash function designed specifically for passwords. The key ideas are:

**One-way transformation:** A good password hash cannot be reversed. Given the hash, you cannot mathematically derive the original password. This is different from encryption, which is reversible if you have the key.

**Slow by design:** Password hashing algorithms like bcrypt, scrypt, and Argon2 are intentionally slow. They take tens or hundreds of milliseconds to compute. This makes brute-force attacks impractical — an attacker trying millions of password combinations per second would be slowed down dramatically. Regular hashes like SHA-256 are too fast for passwords.

**Salt for uniqueness:** A salt is a random string generated for each user. It's combined with the password before hashing. This prevents two users with the same password from having the same hash, and it defeats rainbow table attacks where attackers pre-compute hashes for common passwords.

**Work factor:** Algorithms like bcrypt have a "cost" parameter that controls how many rounds of hashing occur. As hardware gets faster, you can increase the cost to keep hashing slow enough to remain secure.

In Mongoose, you implement this using a "pre-save hook" — middleware that runs before a document is saved to the database. The hook checks if the password field has been modified (so it doesn't re-hash an already-hashed password), then hashes it using bcrypt. This makes the hashing automatic and impossible to forget — any time you create or update a user with a password, it gets hashed before it hits MongoDB.

The login flow works in reverse: you receive a password from the user, hash it using the same algorithm and the stored salt, then compare the result with the stored hash. Bcrypt handles the salt internally via a combined string format, so you just use a compare function.

## 4. See It In Practice — Real Code or Queries

Here's a complete Mongoose user schema with password hashing using a pre-save hook:

```javascript
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 12; // Higher = slower but more secure

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  name: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Pre-save hook: hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Generate salt and hash the password
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to compare password for login
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

// Usage example
async function registerUser(email, plainPassword, name) {
  const user = new User({
    email,
    password: plainPassword, // Plain text here — hook will hash it
    name
  });
  await user.save();
  console.log('User saved with hashed password');
  // In DB: password looks like "$2b$12$..."
}

async function loginUser(email, plainPassword) {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error('User not found');
  }

  const isMatch = await user.comparePassword(plainPassword);
  if (!isMatch) {
    throw new Error('Invalid password');
  }

  return user;
}
```

Key implementation details:

- **`isModified('password')` check:** This prevents re-hashing when you update other fields like `name` or `email`. Without this, every save would hash an already-hashed password, corrupting it.
- **`SALT_ROUNDS = 12`:** This is the work factor. Each increment doubles the hashing time. 12 is a common default (takes ~250ms on modern hardware). Adjust based on your security requirements and server capacity.
- **Async/await:** Bcrypt operations are async and CPU-intensive. They should run on the event loop properly without blocking.
- **Compare method:** Adding this as an instance method keeps the comparison logic encapsulated in the model. Never write comparison logic in your route handlers.

Here's how to use it in an Express route:

```javascript
const express = require('express');
const router = express.Router();

// Register endpoint
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    // Validation happens here, before creating the user
    if (!email || !password || password.length < 8) {
      return res.status(400).json({
        error: 'Email and password (min 8 chars) required'
      });
    }

    const user = await User.create({ email, password, name });

    // Never send the hashed password in the response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json(userResponse);
  } catch (error) {
    // Handle duplicate email error
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    next(error);
  }
});

// Login endpoint
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT or session here
    res.json({ message: 'Login successful' });
  } catch (error) {
    next(error);
  }
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Why not just use SHA-256 or MD5 for password hashing?**

SHA-256 and MD5 are general-purpose hash functions designed to be fast. They're great for checksums and data integrity, but terrible for passwords. Because they're fast, an attacker with a GPU can compute billions of hashes per second and brute-force passwords quickly. bcrypt, scrypt, and Argon2 are specifically designed to be slow and memory-hard, making brute-force attacks impractical. Also, MD5 is cryptographically broken and should never be used for security purposes.

**Q: What happens if you forget to hash a password in development?**

You store plain text passwords. Anyone with database access can read them. If your development database gets leaked or synced to production by mistake, you've exposed real user passwords. This is why using a pre-save hook is better than manually hashing in your route handler — the hook makes hashing automatic and impossible to forget.

**Q: Why do you check `isModified('password')` in the pre-save hook?**

Without this check, every time you update any field on a user document, Mongoose would re-hash the already-hashed password. Hashing a hash produces garbage that can never be verified. The check ensures we only hash when the password field is actually being set or changed.

**Q: What if two users have the same password?**

With proper salting, their stored hashes will be completely different. bcrypt generates a random salt for each hash and includes it in the final hash string. When comparing, bcrypt extracts the salt from the stored hash and uses it to hash the candidate password. This means even if 100 users choose "password123", each has a unique hash in the database.

**Q: How do you choose the bcrypt cost factor?**

Start with a value that takes about 200-500ms on your production hardware. This is slow enough to slow attackers but fast enough not to make user registration/login painfully slow. Test this on your actual server, not your laptop — server hardware may differ. Re-evaluate every year or two as hardware improves. The cost should be configurable via environment variable so you can adjust it without redeploying code.

**Q: Should you hash passwords on the client side before sending them?**

No. Client-side hashing doesn't improve security because the client still sends something that authenticates them — if an attacker intercepts the hash, they can replay it. Client-side hashing can actually be harmful because it may give you a false sense of security. Hash on the server where you control the environment and can protect the hashing logic.

**Q: How do you handle password resets?**

You don't retrieve or reset the hashed password — that's impossible. Instead, you generate a random reset token, hash it, and store it with an expiration timestamp. When the user clicks the reset link, you verify the token and allow them to set a new password. The new password gets hashed through the same pre-save hook. Never send passwords or password reset links via email — send a token that expires.

## 6. The Traps — What Goes Wrong in Production

**Storing plain text passwords:** This happens when developers forget to implement hashing or disable it during testing and forget to re-enable it. The fix is to use a pre-save hook so hashing is automatic. Also, write a test that verifies stored passwords are not equal to their plain text form.

**Using fast hash functions:** Using SHA-1, SHA-256, or MD5 for passwords because they're available in the standard library. These are too fast for password hashing. Always use bcrypt, scrypt, or Argon2. Most Node.js projects use bcrypt via the `bcrypt` or `bcryptjs` package.

**Re-hashing on every save:** Forgetting the `isModified('password')` check causes already-hashed passwords to be hashed again, corrupting them. Users can't log in after this happens. Always include the modification check.

**Hashing without salt:** Using a simple hash without salt means identical passwords produce identical hashes. Attackers can use rainbow tables to crack them. bcrypt handles salting automatically — never disable it.

**Synchronous bcrypt in a route:** Using `bcrypt.hashSync()` blocks the event loop and makes your server unresponsive during the hashing operation. Always use the async versions — `bcrypt.hash()` and `bcrypt.compare()`.

**Sending hashed password in API responses:** Including the password field (even hashed) in JSON responses is unnecessary and increases attack surface. Always exclude it from responses using `toObject()` with `transform` or by manually deleting the field.

**Low cost factor:** Setting the bcrypt cost too low (like 4 or 6) makes hashing fast, which also makes brute-force attacks fast. Start at 10-12 and adjust based on your security requirements.

**Not handling hashing errors:** If bcrypt fails (out of memory, invalid input), and you don't catch the error, your app may crash or save unhashed passwords. Always wrap hashing in try/catch and pass errors to Mongoose's `next()` callback.

**Assuming hash comparison is safe from timing attacks:** bcrypt's comparison function is designed to be constant-time to prevent timing attacks. Never write your own string comparison for hashes — always use `bcrypt.compare()`.

## 7. Compare With Related Concepts

**Hashing vs Encryption:** Hashing is one-way and irreversible. Encryption is two-way and reversible with a key. Passwords must be hashed, not encrypted. If you encrypt passwords, you need the decryption key somewhere — and if an attacker gets that key, they get all passwords. With hashing, there's no key to steal.

**Session vs Token Authentication:** Password hashing is about storing credentials securely. Session and token authentication are about identifying users after they've logged in. Hashing happens once during registration and login. Session/token management happens on every authenticated request. They solve different problems.

**Bcrypt vs Scrypt vs Argon2:** All three are secure password hashing algorithms. Bcrypt is the most widely supported and battle-tested. Scrypt adds memory-hardness, making GPU/ASIC attacks more expensive. Argon2 is the winner of the Password Hashing Competition and offers the best security, but has less library support. For most applications, bcrypt is sufficient and the safest choice due to its maturity.

**Pre-save hooks vs Validation in Routes:** You could hash passwords in your route handler before calling `User.create()`. But pre-save hooks are better because the hashing logic lives in the model where it belongs. This means any code path that creates or updates a user will automatically hash the password — you can't forget it, and API changes don't break the security behavior.

**Salting vs Peppering:** Salt is stored with the hash in the database. Pepper is a secret value stored separately (in environment variables or a secrets manager). Pepper adds an extra layer of security because even if the database is compromised, attackers need the pepper to attempt cracking. However, pepper adds complexity and can cause issues if lost. Salt is essential; pepper is optional and should only be added if you have a specific threat model that justifies it.

## 8. 🧠 The Memory Hook — What Sticks

Hash passwords with a pre-save hook so hashing is automatic, use bcrypt because it's slow and salted, and never store plain text — the database should only ever contain unreadable confetti.
