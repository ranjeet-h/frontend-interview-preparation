# Backend Libraries & Ecosystem — Interview Question Bank

A curated set of **50 interview questions** covering the most commonly tested backend libraries and supporting technologies. Each answer is practical, specific, and ready to use in a real interview. Code examples use idiomatic patterns for the relevant stack.

---

## Question Index

| # | Question | Group |
|---|----------|-------|
| 1 | What is Express middleware and how does the middleware chain work? | Web Frameworks |
| 2 | How does Fastify differ from Express in terms of performance and design? | Web Frameworks |
| 3 | What are NestJS modules, providers, and dependency injection? | Web Frameworks |
| 4 | How do you handle global error handling in Express? | Web Frameworks |
| 5 | What is the difference between `app.use()` and `app.get()` in Express? | Web Frameworks |
| 6 | What is Prisma and how does it compare to TypeORM? | ORMs & Query Builders |
| 7 | How does SQLAlchemy's Session and Unit of Work pattern work? | ORMs & Query Builders |
| 8 | What is the N+1 query problem and how do ORMs solve it? | ORMs & Query Builders |
| 9 | How do database migrations work in Prisma vs TypeORM? | ORMs & Query Builders |
| 10 | What are TypeORM relations and when do you use eager vs lazy loading? | ORMs & Query Builders |
| 11 | How does Zod differ from Joi for schema validation? | Validation Libraries |
| 12 | What is Pydantic and how does it integrate with FastAPI? | Validation Libraries |
| 13 | How do you validate environment variables with Zod or Joi at startup? | Validation Libraries |
| 14 | What is `class-validator` and how is it used in NestJS DTOs? | Validation Libraries |
| 15 | How do you handle custom validation logic in Pydantic v2? | Validation Libraries |
| 16 | What is Passport.js and how does its strategy pattern work? | Auth Libraries |
| 17 | How do you implement JWT authentication with jsonwebtoken? | Auth Libraries |
| 18 | What is `bcrypt` and why should you use it over MD5/SHA for passwords? | Auth Libraries |
| 19 | How does OAuth2/OIDC work with libraries like `openid-client`? | Auth Libraries |
| 20 | How do you implement session-based auth in Express with `express-session`? | Auth Libraries |
| 21 | What is BullMQ and how does it compare to Bull? | Job Queues |
| 22 | How does Celery work as a distributed task queue in Python? | Job Queues |
| 23 | What are the retry and backoff strategies in BullMQ? | Job Queues |
| 24 | How do you handle job failures and dead-letter queues? | Job Queues |
| 25 | What is the difference between a queue worker and a scheduler in BullMQ? | Job Queues |
| 26 | How does `ioredis` differ from the `redis` npm package? | Caching Libraries |
| 27 | What is cache-aside pattern and how do you implement it? | Caching Libraries |
| 28 | How does `node-cache` differ from Redis for caching? | Caching Libraries |
| 29 | How do you implement distributed locking with Redis? | Caching Libraries |
| 30 | How does `redis-om` or `keyv` simplify cache abstraction? | Caching Libraries |
| 31 | How does `express-rate-limit` work and what are its limitations? | Rate Limiting |
| 32 | How do you implement sliding window rate limiting with Redis? | Rate Limiting |
| 33 | What is `bottleneck` and when would you use it? | Rate Limiting |
| 34 | How does NestJS ThrottlerModule work? | Rate Limiting |
| 35 | What are token bucket vs leaky bucket algorithms? | Rate Limiting |
| 36 | How do you set up structured logging with Winston? | Logging & Observability |
| 37 | What is Pino and why is it faster than Winston? | Logging & Observability |
| 38 | How does OpenTelemetry instrumentation work in Node.js? | Logging & Observability |
| 39 | What is the difference between metrics, logs, and traces? | Logging & Observability |
| 40 | How do you integrate Sentry for error tracking in a Node.js app? | Logging & Observability |
| 41 | How do you write unit tests with Jest for a service layer? | Testing Libraries |
| 42 | What is Supertest and how does it enable HTTP integration testing? | Testing Libraries |
| 43 | How does `pytest` with `httpx` work for FastAPI testing? | Testing Libraries |
| 44 | What is the difference between mocking and stubbing in Jest? | Testing Libraries |
| 45 | How do you test async code and timers in Jest? | Testing Libraries |
| 46 | What is Helmet.js and what HTTP headers does it set? | Security & Utility |
| 47 | How does `cors` middleware work and what are its important options? | Security & Utility |
| 48 | What is `dotenv` and what are its limitations compared to a secrets manager? | Security & Utility |
| 49 | How does `multer` handle multipart file uploads? | Security & Utility |
| 50 | What is `compression` middleware and when should you not use it? | Security & Utility |

---

## Group 1 — Web Frameworks

### Q1. What is Express middleware and how does the middleware chain work?

**Summary:** Middleware are functions with the signature `(req, res, next)` that are executed sequentially. Calling `next()` passes control to the next middleware; not calling it terminates the chain.

**Details:**  
Express uses a linear stack of middleware. Each registered handler is called in registration order. Error-handling middleware has four arguments `(err, req, res, next)` and is only invoked when `next(err)` is called.

```js
// Regular middleware
app.use((req, res, next) => {
  req.requestTime = Date.now();
  next(); // must call next or the request hangs
});

// Error middleware — must be last
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});
```

**Pitfall:** Forgetting to call `next()` in middleware silently hangs the request. Calling `next(err)` with a non-Error value skips to the error handler but loses the stack trace.

---

### Q2. How does Fastify differ from Express in terms of performance and design?

**Summary:** Fastify is schema-first, uses JSON Schema for input validation and serialization via `fast-json-stringify`, and is consistently 2–3× faster than Express on benchmarks.

**Details:**  
- **Validation:** Fastify validates request bodies against a JSON Schema before your handler runs, rejecting bad input early.  
- **Serialization:** Response serialization is compiled at startup, not at runtime.  
- **Plugin system:** Uses `fastify-plugin` with encapsulation — child plugins can't leak state upward without opting in.  
- **TypeScript:** First-class generics for request/reply types.

```js
fastify.post('/user', {
  schema: {
    body: {
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string', format: 'email' } }
    }
  }
}, async (request, reply) => {
  return { id: 1, email: request.body.email };
});
```

**Pitfall:** Express ecosystem plugins (e.g., Passport.js) don't work directly in Fastify. You need Fastify-specific alternatives or `@fastify/passport`.

---

### Q3. What are NestJS modules, providers, and dependency injection?

**Summary:** NestJS uses an Angular-style IoC container. Modules group related providers; providers (services, repositories) are injected into controllers or other services via constructor injection.

**Details:**  
- **Module:** Declares `providers`, `controllers`, `imports`, `exports`. Acts as the DI scope boundary.  
- **Provider:** Any class decorated with `@Injectable()`. Can be scoped as `DEFAULT` (singleton), `REQUEST`, or `TRANSIENT`.  
- **Injection:** NestJS reflects constructor parameter types (via TypeScript metadata) to resolve the dependency graph at startup.

```ts
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany();
  }
}

@Module({
  providers: [UserService, PrismaService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
```

**Pitfall:** Circular dependencies between modules cause startup crashes. Use `forwardRef()` to break cycles, but treat it as a design smell.

---

### Q4. How do you handle global error handling in Express?

**Summary:** Register a four-argument error middleware after all routes. Optionally use `express-async-errors` or wrap async handlers to forward promise rejections automatically.

**Details:**  
By default, unhandled promise rejections in async route handlers don't reach the error middleware. You must either wrap handlers or use `express-async-errors`.

```js
// Option A: manual wrapper
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/users', asyncHandler(async (req, res) => {
  const users = await db.getUsers();
  res.json(users);
}));

// Option B: require at app entry (patches Express internally)
require('express-async-errors');

// Global error handler (always last)
app.use((err, req, res, next) => {
  const status = err.statusCode ?? 500;
  res.status(status).json({ error: err.message });
});
```

**Pitfall:** Express 5 (stable 2024) handles async errors natively, so the wrapper is no longer needed. Know which version you're targeting.

---

### Q5. What is the difference between `app.use()` and `app.get()` in Express?

**Summary:** `app.use()` matches any HTTP method and performs prefix matching on the path. `app.get()` matches only GET requests with exact segment matching.

**Details:**  

| Feature | `app.use('/api')` | `app.get('/api')` |
|---|---|---|
| Methods | ALL | GET only |
| Path matching | Prefix (`/api/users` matches) | Exact (`/api/users` does NOT match) |
| Typical use | Middleware, routers | Route handlers |

```js
app.use('/api', router);        // mounts router at /api — all methods, prefix match
app.get('/api/health', handler); // only GET /api/health exactly
```

**Pitfall:** Using `app.use()` for a route handler instead of `app.get()` will accidentally handle POST/PUT/DELETE to the same path.

---

## Group 2 — ORMs & Query Builders

### Q6. What is Prisma and how does it compare to TypeORM?

**Summary:** Prisma is a type-safe query builder generated from a declarative schema file. TypeORM uses decorators on entity classes and supports the Active Record pattern. Prisma's generated client is more predictable; TypeORM offers more flexibility with raw ORM patterns.

**Details:**  

| Aspect | Prisma | TypeORM |
|---|---|---|
| Schema definition | `schema.prisma` file | Decorator-based entity classes |
| Type safety | Auto-generated client types | Manual typing via generics |
| Migration | `prisma migrate dev` | `typeorm migration:generate` |
| Relations | Defined in schema, selected explicitly | Eager/lazy via decorators |
| Raw queries | `prisma.$queryRaw` | `queryRunner.query()` |

```ts
// Prisma
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: { posts: true },
});

// TypeORM
const user = await userRepository.findOne({
  where: { id: 1 },
  relations: ['posts'],
});
```

**Pitfall:** Prisma doesn't support database views or stored procedures as first-class citizens. Use `$queryRaw` for those cases.

---

### Q7. How does SQLAlchemy's Session and Unit of Work pattern work?

**Summary:** The `Session` acts as a staging area. All objects added to it are tracked. On `session.commit()`, SQLAlchemy flushes all pending changes in a single transaction (Unit of Work).

**Details:**  
- `session.add(obj)` marks the object as pending.  
- `session.flush()` sends SQL to the DB but doesn't commit the transaction.  
- `session.commit()` commits and expires all tracked objects (next access re-fetches from DB).  
- `session.rollback()` discards all pending changes.

```python
from sqlalchemy.orm import Session

with Session(engine) as session:
    user = User(name="Alice", email="alice@example.com")
    session.add(user)
    session.flush()      # INSERT sent, user.id is now populated
    session.commit()     # transaction committed

# SQLAlchemy 2.x style
with Session(engine) as session:
    result = session.execute(select(User).where(User.id == 1))
    user = result.scalar_one()
```

**Pitfall:** Accessing a relationship attribute after the session is closed raises `DetachedInstanceError`. Use `expire_on_commit=False` or eager-load relationships before the session closes.

---

### Q8. What is the N+1 query problem and how do ORMs solve it?

**Summary:** N+1 occurs when fetching N parent records and then issuing one additional query per record to load a relationship — total N+1 queries instead of 2.

**Details:**  
```ts
// N+1 in TypeORM (bad)
const users = await userRepo.find(); // 1 query
for (const user of users) {
  console.log(user.posts); // N lazy queries — DO NOT DO THIS
}

// Fix: eager join
const users = await userRepo.find({ relations: ['posts'] }); // 2 queries (JOIN)

// Prisma avoids it by requiring explicit includes
const users = await prisma.user.findMany({ include: { posts: true } });
```

In SQLAlchemy, use `joinedload` or `selectinload`:
```python
stmt = select(User).options(selectinload(User.posts))
users = session.execute(stmt).scalars().all()
```

**Pitfall:** Even with `include`/`relations`, deeply nested includes can still generate many queries. Use `DataLoader` in GraphQL contexts or custom joins for complex access patterns.

---

### Q9. How do database migrations work in Prisma vs TypeORM?

**Summary:** Prisma generates SQL migration files automatically from schema diffs and maintains a migration history table. TypeORM can auto-sync or generate migration files; auto-sync is dangerous in production.

**Details:**  

**Prisma:**
```bash
# Dev: generates and applies a new migration file
prisma migrate dev --name add_user_table

# Prod: applies pending migrations
prisma migrate deploy
```

**TypeORM:**
```bash
# Generate a migration from entity changes
typeorm migration:generate -n AddUserTable

# Run pending migrations
typeorm migration:run
```

**Pitfall:** Never use `synchronize: true` in TypeORM for production — it auto-alters tables on startup and can drop columns. Always use migration files in production.

---

### Q10. What are TypeORM relations and when do you use eager vs lazy loading?

**Summary:** TypeORM supports `@OneToOne`, `@OneToMany`, `@ManyToOne`, and `@ManyToMany`. Eager loading fetches the relation in the same query; lazy loading defers until the property is accessed (returns a Promise).

**Details:**  
```ts
@Entity()
export class User {
  @OneToMany(() => Post, post => post.author, { eager: false })
  posts: Post[]; // loaded only when explicitly requested
}

// Eager on query level (preferred over entity-level eager):
const user = await userRepo.findOne({ where: { id: 1 }, relations: ['posts'] });

// Lazy loading (requires async getter)
const user = await userRepo.findOne({ where: { id: 1 } });
const posts = await user.posts; // fires a SELECT at this point
```

**Pitfall:** Entity-level `eager: true` fires a JOIN on every single query for that entity, even when you don't need the relation. Prefer query-level loading for control.

---

## Group 3 — Validation Libraries

### Q11. How does Zod differ from Joi for schema validation?

**Summary:** Zod is TypeScript-first and infers static types from schemas. Joi is JavaScript-native with no built-in TypeScript inference. Zod has a smaller bundle and integrates directly with tRPC and React Hook Form.

**Details:**  

| Feature | Zod | Joi |
|---|---|---|
| TypeScript inference | Native (`z.infer<typeof schema>`) | Requires manual typing |
| Bundle size | ~12 KB | ~28 KB |
| Async validation | `z.string().refine(async () => …)` | `schema.validateAsync()` |
| Coercion | Opt-in (`z.coerce.number()`) | Opt-in (`Joi.number()`) |

```ts
// Zod
const UserSchema = z.object({
  email: z.string().email(),
  age: z.number().min(18),
});
type User = z.infer<typeof UserSchema>; // inferred automatically

const result = UserSchema.safeParse(req.body);
if (!result.success) return res.status(400).json(result.error.flatten());
```

**Pitfall:** Zod's default behavior is **strip** (extra keys removed). Use `.strict()` to reject unknown keys. Joi's default is to allow unknown keys — use `{ allowUnknown: false }` to change this.

---

### Q12. What is Pydantic and how does it integrate with FastAPI?

**Summary:** Pydantic is a data validation library that uses Python type annotations to define schemas. FastAPI uses Pydantic models for automatic request body parsing, validation, and OpenAPI schema generation.

**Details:**  
```python
from pydantic import BaseModel, EmailStr, field_validator

class UserCreate(BaseModel):
    email: EmailStr
    age: int

    @field_validator('age')
    @classmethod
    def age_must_be_adult(cls, v):
        if v < 18:
            raise ValueError('must be 18 or older')
        return v

# FastAPI automatically:
# 1. Parses the JSON body into UserCreate
# 2. Returns 422 with details if validation fails
# 3. Generates OpenAPI docs
@app.post('/users')
async def create_user(user: UserCreate):
    return user
```

**Pitfall:** Pydantic v1 and v2 have breaking API differences. FastAPI 0.100+ uses Pydantic v2 by default. `@validator` (v1) is replaced by `@field_validator` (v2).

---

### Q13. How do you validate environment variables with Zod or Joi at startup?

**Summary:** Parse `process.env` (or `os.environ`) against a schema at app startup. If validation fails, throw immediately rather than letting the app start with bad config.

**Details:**  
```ts
// Zod — validate at module load time
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  JWT_SECRET: z.string().min(32),
});

const env = EnvSchema.parse(process.env); // throws ZodError on failure
export { env };
```

```python
# Pydantic v2 settings
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    port: int = 3000
    jwt_secret: str

    model_config = {"env_file": ".env"}

settings = Settings()  # raises ValidationError on bad env
```

**Pitfall:** Don't log the parsed env object — it may contain secrets. Log only the keys that were found/missing.

---

### Q14. What is `class-validator` and how is it used in NestJS DTOs?

**Summary:** `class-validator` uses decorators to validate class instances. NestJS's `ValidationPipe` automatically validates incoming request bodies by transforming plain objects into DTO class instances and running decorator checks.

**Details:**  
```ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

// main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,      // strip unknown fields
  forbidNonWhitelisted: true, // throw on unknown fields
  transform: true,      // auto-transform to DTO class
}));
```

**Pitfall:** `class-validator` requires `reflect-metadata` and TypeScript's `experimentalDecorators` + `emitDecoratorMetadata` flags. Without `transform: true`, the body is a plain object and decorators won't fire.

---

### Q15. How do you handle custom validation logic in Pydantic v2?

**Summary:** Use `@field_validator` for single-field logic and `@model_validator` for cross-field logic. Both replace the deprecated `@validator` and `@root_validator` from v1.

**Details:**  
```python
from pydantic import BaseModel, field_validator, model_validator

class PasswordReset(BaseModel):
    password: str
    confirm_password: str

    @field_validator('password')
    @classmethod
    def strong_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('password must be at least 8 characters')
        return v

    @model_validator(mode='after')
    def passwords_match(self) -> 'PasswordReset':
        if self.password != self.confirm_password:
            raise ValueError('passwords do not match')
        return self
```

**Pitfall:** In Pydantic v2, `@field_validator` must be a `@classmethod` and must return the (possibly transformed) value. Forgetting the return statement results in `None` silently replacing the field value.

---

## Group 4 — Auth Libraries

### Q16. What is Passport.js and how does its strategy pattern work?

**Summary:** Passport.js is authentication middleware for Node.js. It abstracts authentication mechanisms (local, JWT, OAuth) into interchangeable "strategies". Each strategy defines a `verify` callback that receives credentials and calls `done(err, user)`.

**Details:**  
```js
const LocalStrategy = require('passport-local').Strategy;

passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const user = await User.findOne({ username });
      if (!user || !await bcrypt.compare(password, user.hash)) {
        return done(null, false, { message: 'Invalid credentials' });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Route usage
app.post('/login', passport.authenticate('local', { session: false }), (req, res) => {
  res.json({ token: signJwt(req.user) });
});
```

**Pitfall:** Calling `done(null, false)` rejects the user without an error (results in 401). Calling `done(err)` triggers a 500. Always distinguish between auth failure and system error.

---

### Q17. How do you implement JWT authentication with jsonwebtoken?

**Summary:** Use `jwt.sign()` to issue tokens and `jwt.verify()` to validate them. Store secrets in environment variables and always set an expiry. Build a middleware that extracts the Bearer token from the Authorization header.

**Details:**  
```ts
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET!;

// Issue
export function signToken(payload: object) {
  return jwt.sign(payload, SECRET, { expiresIn: '15m', algorithm: 'HS256' });
}

// Verify middleware
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, SECRET) as JwtPayload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

**Pitfall:** JWT tokens cannot be revoked before expiry. Use short expiry + refresh tokens, or maintain a token blocklist in Redis for logout scenarios.

---

### Q18. What is `bcrypt` and why should you use it over MD5/SHA for passwords?

**Summary:** bcrypt is a password-hashing function with a built-in work factor (cost). It's intentionally slow, includes a salt, and makes brute-force and rainbow table attacks computationally expensive. MD5/SHA are fast hashes designed for data integrity, not password storage.

**Details:**  
```ts
import bcrypt from 'bcryptjs';

// Hash (at registration)
const SALT_ROUNDS = 12; // higher = slower (2^12 iterations)
const hash = await bcrypt.hash(plainPassword, SALT_ROUNDS);

// Verify (at login) — timing-safe comparison
const isValid = await bcrypt.compare(plainPassword, hash);
```

**Pitfall:** `bcrypt` has a 72-byte input limit — passwords longer than 72 bytes are silently truncated. For very long passwords, pre-hash with SHA-256 before passing to bcrypt (but this has its own tradeoffs). Consider `argon2` (via `argon2` npm) as a modern alternative.

---

### Q19. How does OAuth2/OIDC work with libraries like `openid-client`?

**Summary:** `openid-client` (Node.js) implements the OAuth2/OIDC client flow. You create an `Issuer`, get a `Client`, redirect the user to the authorization endpoint, then exchange the code for tokens.

**Details:**  
```ts
import { Issuer } from 'openid-client';

const issuer = await Issuer.discover('https://accounts.google.com');
const client = new issuer.Client({
  client_id: process.env.GOOGLE_CLIENT_ID!,
  client_secret: process.env.GOOGLE_CLIENT_SECRET!,
  redirect_uris: ['https://myapp.com/callback'],
  response_types: ['code'],
});

// Step 1: redirect user
const authUrl = client.authorizationUrl({ scope: 'openid email profile' });

// Step 2: handle callback
const params = client.callbackParams(req);
const tokenSet = await client.callback('https://myapp.com/callback', params);
const claims = tokenSet.claims(); // { sub, email, name, ... }
```

**Pitfall:** Always validate the `state` parameter and `nonce` in the callback to prevent CSRF and replay attacks. `openid-client` handles this if you pass the state/nonce through the session.

---

### Q20. How do you implement session-based auth in Express with `express-session`?

**Summary:** `express-session` stores a session ID in a signed cookie. Session data is stored server-side in a store (memory by default, Redis in production). On each request, the session is re-hydrated from the store.

**Details:**  
```js
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

const redisClient = createClient();
await redisClient.connect();

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, httpOnly: true, maxAge: 86400000 }
}));

// Login
app.post('/login', async (req, res) => {
  const user = await authenticate(req.body);
  req.session.userId = user.id; // persisted to Redis
  res.json({ ok: true });
});
```

**Pitfall:** In-memory session store (default) is not shared across processes and leaks memory. Always use a persistent store (Redis, PostgreSQL) in production.

---

## Group 5 — Job Queues

### Q21. What is BullMQ and how does it compare to Bull?

**Summary:** BullMQ is the rewritten successor to Bull with TypeScript support, worker concurrency control, flow producers (parent/child jobs), and better Redis Streams support. Bull is effectively in maintenance mode.

**Details:**  

| Feature | Bull | BullMQ |
|---|---|---|
| TypeScript | Community types | Native |
| Flow/pipelines | No | Yes (`FlowProducer`) |
| Worker isolation | Per-queue | Named worker concurrency |
| Redis Streams | No | Yes |

```ts
import { Queue, Worker } from 'bullmq';

const emailQueue = new Queue('email', { connection: { host: 'localhost', port: 6379 } });

// Producer
await emailQueue.add('welcome', { to: 'user@example.com' }, { attempts: 3 });

// Consumer
const worker = new Worker('email', async (job) => {
  await sendEmail(job.data.to);
}, { connection: { host: 'localhost', port: 6379 }, concurrency: 5 });
```

**Pitfall:** BullMQ workers process jobs in a separate event loop tick, not in the same thread as the main app. Don't share in-process state (like DB connection objects) without care.

---

### Q22. How does Celery work as a distributed task queue in Python?

**Summary:** Celery workers listen on a message broker (Redis or RabbitMQ), execute tasks defined as decorated functions, and optionally store results in a result backend.

**Details:**  
```python
from celery import Celery

app = Celery('tasks', broker='redis://localhost:6379/0', backend='redis://localhost:6379/1')

@app.task(bind=True, max_retries=3)
def send_email(self, to: str):
    try:
        do_send(to)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)  # retry after 60s

# Producer (anywhere in the app)
result = send_email.delay('user@example.com')
print(result.get(timeout=10))  # blocks until done
```

**Pitfall:** `result.get()` blocks the caller. In a web request, always fire-and-forget with `.delay()` and don't wait. Use Celery Beat for periodic tasks instead of cron jobs.

---

### Q23. What are the retry and backoff strategies in BullMQ?

**Summary:** BullMQ supports fixed delay, exponential backoff, and custom backoff functions via job options. Retries are configured per-job or at the queue level as default options.

**Details:**  
```ts
await queue.add('process', data, {
  attempts: 5,
  backoff: {
    type: 'exponential', // delay = 2^attempt * 1000ms
    delay: 1000,
  },
});

// Custom backoff via Worker event
worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed: ${err.message}`);
});
```

**Backoff types:**
- `fixed`: retries after a constant delay
- `exponential`: delay doubles each attempt (1s, 2s, 4s, 8s…)
- Custom: `(attemptsMade) => delay_ms` function

**Pitfall:** Without `removeOnFail: true`, failed jobs accumulate in Redis indefinitely. Set a `removeOnFail: { count: 1000 }` policy to cap the history.

---

### Q24. How do you handle job failures and dead-letter queues?

**Summary:** In BullMQ, exhausted-retry jobs move to the "failed" set. A dead-letter queue pattern requires a separate queue where you explicitly move failed jobs for manual inspection or reprocessing.

**Details:**  
```ts
worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= job.opts.attempts!) {
    // Move to DLQ
    await dlqQueue.add('dead', {
      originalJob: job.name,
      data: job.data,
      error: err.message,
    });
  }
});

// Celery equivalent
@app.task(bind=True, max_retries=3)
def my_task(self, data):
    try:
        process(data)
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            dead_letter_task.delay(data, str(exc))
        raise self.retry(exc=exc)
```

**Pitfall:** DLQs are a monitoring pattern, not a replacement for fixing bugs. Alert on DLQ depth and review failure reasons regularly.

---

### Q25. What is the difference between a queue worker and a scheduler in BullMQ?

**Summary:** A **worker** processes jobs that have been added to a queue. A **scheduler** (QueueScheduler in Bull v4, built into BullMQ v2+) is responsible for moving delayed and stalled jobs back into the active state.

**Details:**  
In BullMQ v2+, the scheduler functionality is built into the Worker itself — you no longer need a separate `QueueScheduler`. Delayed jobs and stall detection are handled automatically.

```ts
// Repeatable (cron) job
await queue.add('daily-report', {}, {
  repeat: { pattern: '0 9 * * *' }, // every day at 9 AM (cron)
});

// Worker handles both regular and repeatable jobs
const worker = new Worker('report', async (job) => {
  await generateReport();
});
```

**Pitfall:** In BullMQ v1, forgetting to instantiate `QueueScheduler` meant delayed and repeatable jobs never ran. This was a common footgun fixed in v2.

---

## Group 6 — Caching Libraries

### Q26. How does `ioredis` differ from the `redis` npm package?

**Summary:** `ioredis` has built-in cluster support, Sentinel support, automatic pipelining, Lua scripting helpers, and TypeScript types. The official `redis` v4+ package (`node-redis`) is now also well-maintained with similar features, but `ioredis` is still preferred in older/large codebases.

**Details:**  
```ts
// ioredis
import Redis from 'ioredis';
const redis = new Redis({ host: 'localhost', port: 6379 });

// Cluster
const cluster = new Redis.Cluster([
  { host: '127.0.0.1', port: 7000 },
  { host: '127.0.0.1', port: 7001 },
]);

// node-redis v4
import { createClient } from 'redis';
const client = createClient();
await client.connect();
await client.set('key', 'value', { EX: 60 });
```

**Pitfall:** `ioredis` automatically buffers commands during reconnection. `node-redis` v4 throws on disconnected state by default. Choose based on your error tolerance model.

---

### Q27. What is the cache-aside pattern and how do you implement it?

**Summary:** Cache-aside (lazy loading) means the application checks the cache first; on a miss, it fetches from the database, writes to the cache, then returns the result. The cache is never proactively populated.

**Details:**  
```ts
async function getUser(id: number): Promise<User> {
  const cacheKey = `user:${id}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached); // cache hit
  }

  const user = await db.user.findUnique({ where: { id } }); // cache miss
  if (user) {
    await redis.set(cacheKey, JSON.stringify(user), 'EX', 300); // TTL 5 min
  }
  return user;
}
```

**Pitfall:** Cache stampede: if many requests miss the cache simultaneously, all hit the DB at once. Mitigate with a mutex lock (Redlock) or probabilistic early expiry.

---

### Q28. How does `node-cache` differ from Redis for caching?

**Summary:** `node-cache` is an in-process, in-memory cache. It requires no external infrastructure, has zero latency, but is not shared across processes or server instances. Redis is an external store shared across all instances.

**Details:**  

| Aspect | node-cache | Redis |
|---|---|---|
| Setup | npm install, zero config | External server required |
| Shared across instances | No | Yes |
| Latency | Sub-millisecond (in-process) | ~1ms network |
| Persistence | No | Optional (RDB/AOF) |
| Max size | Limited by Node.js heap | Configurable |

```ts
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 300 });

cache.set('user:1', userObject);
const user = cache.get<User>('user:1');
```

**Pitfall:** Use `node-cache` only for single-process deployments or non-critical data (e.g., config). Never use it for session data or anything that must be consistent across replicas.

---

### Q29. How do you implement distributed locking with Redis?

**Summary:** Use the Redlock algorithm (via the `redlock` npm package) to acquire a lock across multiple Redis instances. A lock is a key with a TTL set atomically using `SET key value NX PX ttl`.

**Details:**  
```ts
import Redlock from 'redlock';
import Redis from 'ioredis';

const redis = new Redis();
const redlock = new Redlock([redis], { retryCount: 3, retryDelay: 200 });

async function processPayment(orderId: string) {
  const lock = await redlock.acquire([`lock:order:${orderId}`], 5000); // 5s TTL
  try {
    await chargeCard(orderId);
  } finally {
    await lock.release();
  }
}
```

**Pitfall:** If the operation takes longer than the lock TTL, the lock expires and another process can acquire it. Always set a TTL longer than your expected operation time plus network overhead.

---

### Q30. How does `redis-om` or `keyv` simplify cache abstraction?

**Summary:** `keyv` provides a unified key-value cache API with pluggable storage adapters (Redis, SQLite, Postgres, in-memory). You write cache code once and swap the backend via configuration.

**Details:**  
```ts
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyv = new Keyv(new KeyvRedis('redis://localhost:6379'));

await keyv.set('user:1', { name: 'Alice' }, 60000); // 60s TTL
const user = await keyv.get('user:1');
await keyv.delete('user:1');
```

`redis-om` is different — it's an object mapper for Redis with support for JSON, hashes, and full-text search via RediSearch.

**Pitfall:** `keyv` serializes/deserializes with JSON, so Date objects become strings. Store timestamps as epoch numbers or handle deserialization explicitly.

---

## Group 7 — Rate Limiting

### Q31. How does `express-rate-limit` work and what are its limitations?

**Summary:** `express-rate-limit` counts requests per IP (or custom key) in a sliding or fixed window and returns 429 when the limit is exceeded. By default it uses in-memory storage, which doesn't work across multiple instances.

**Details:**  
```ts
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // 100 requests per window
  standardHeaders: true,     // Return RateLimit-* headers
  legacyHeaders: false,
  store: new RedisStore({ ... }), // use rate-limit-redis for multi-instance
});

app.use('/api/', limiter);
```

**Pitfall:** In-memory store means each Node process has its own counter. Behind a load balancer with 4 instances, a client can make 4× the limit. Always use a shared Redis store in production.

---

### Q32. How do you implement sliding window rate limiting with Redis?

**Summary:** Use a Redis sorted set where each request is scored by timestamp. Count members in the window `[now - windowMs, now]` and reject if over the limit. This is more accurate than fixed windows.

**Details:**  
```lua
-- Lua script for atomic sliding window (executed via EVAL)
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count < limit then
  redis.call('ZADD', key, now, now)
  redis.call('PEXPIRE', key, window)
  return 1  -- allowed
end
return 0  -- rejected
```

```ts
const allowed = await redis.eval(script, 1, `rl:${userId}`, Date.now(), 60000, 100);
```

**Pitfall:** Each request adds an entry to the sorted set. Under high traffic, the set can grow large. `ZREMRANGEBYSCORE` prunes it, but ensure the TTL is set to avoid orphaned keys.

---

### Q33. What is `bottleneck` and when would you use it?

**Summary:** `bottleneck` is a rate limiter for outbound requests (not inbound). Use it to throttle calls to external APIs to stay within their rate limits.

**Details:**  
```ts
import Bottleneck from 'bottleneck';

const limiter = new Bottleneck({
  maxConcurrent: 5,    // max 5 in-flight at once
  minTime: 200,        // at least 200ms between each job
  reservoir: 100,      // token bucket: 100 requests
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60 * 1000, // refill every 60s
});

const result = await limiter.schedule(() => callExternalApi(data));
```

**Pitfall:** `bottleneck` queues excess requests in memory. If the queue grows unbounded, it will exhaust memory. Set `maxQueueSize` to cap it and handle `Bottleneck.BottleneckError` for dropped requests.

---

### Q34. How does NestJS ThrottlerModule work?

**Summary:** `@nestjs/throttler` provides rate limiting via a `ThrottlerGuard` that can be applied globally, per-controller, or per-route. It supports multiple named throttles (e.g., short burst + long quota).

**Details:**  
```ts
// app.module.ts
ThrottlerModule.forRoot([
  { name: 'short', ttl: 1000, limit: 5 },   // 5 req/sec
  { name: 'long',  ttl: 60000, limit: 100 }, // 100 req/min
]),

// Controller
@UseGuards(ThrottlerGuard)
@Throttle({ short: { ttl: 1000, limit: 3 } }) // override for this route
@Get('/search')
search() { ... }
```

**Pitfall:** The default storage is in-memory. For multi-instance deployments, switch to `ThrottlerStorageRedisService` from `@nestjs-throttler-storage-redis`.

---

### Q35. What are token bucket vs leaky bucket algorithms?

**Summary:** Token bucket allows bursting — tokens accumulate up to a maximum, and each request consumes one. Leaky bucket smooths traffic at a constant rate regardless of burst, like water draining from a bucket.

**Details:**  

| Algorithm | Burst allowed | Use case |
|---|---|---|
| Token Bucket | Yes | APIs that allow short bursts (e.g., `bottleneck`) |
| Leaky Bucket | No | Smooth outbound traffic, streaming |
| Fixed Window | N/A | Simple, slightly inaccurate at window boundary |
| Sliding Window | N/A | Most accurate, higher Redis cost |

```
Token Bucket: tokens = min(capacity, tokens + rate * elapsed)
              allow if tokens >= 1, then tokens -= 1

Leaky Bucket:  queue requests, process at constant rate (1/rate per tick)
```

**Pitfall:** Fixed window allows 2× the limit at window boundaries (end of window 1 + start of window 2). Sliding window and token bucket avoid this.

---

## Group 8 — Logging & Observability

### Q36. How do you set up structured logging with Winston?

**Summary:** Winston logs JSON objects instead of plain strings. Configure transports (console, file, external), set a log level, and always include context fields (requestId, userId) using `child` loggers.

**Details:**  
```ts
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),   // structured JSON output
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
  ],
});

// Child logger with context
const reqLogger = logger.child({ requestId: req.id, userId: req.user?.id });
reqLogger.info('Processing payment', { orderId: '123' });
// Output: { "level":"info", "requestId":"abc", "userId":5, "orderId":"123", ... }
```

**Pitfall:** Logging sensitive data (passwords, tokens, PII) is a compliance violation. Use a `format` transform to redact known keys before they hit the transport.

---

### Q37. What is Pino and why is it faster than Winston?

**Summary:** Pino writes logs as newline-delimited JSON to stdout and defers formatting to a separate worker process (`pino-pretty`). Its synchronous JSON serialization via `sonic-boom` is ~5–10× faster than Winston for high-throughput apps.

**Details:**  
```ts
import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }  // human-readable in dev
    : undefined,                 // raw JSON in prod
});

logger.info({ orderId: '123' }, 'Payment processed');
```

Performance: Pino uses a `fast-json-stringify` compiled serializer per shape and a low-overhead buffer flush. Winston creates new format objects per log line.

**Pitfall:** `pino-pretty` is a dev-only formatter. Using it in production adds overhead and defeats the purpose. Always ship raw JSON logs in production and pipe to a log aggregator.

---

### Q38. How does OpenTelemetry instrumentation work in Node.js?

**Summary:** OpenTelemetry (OTel) auto-instruments common libraries (Express, HTTP, Redis, Postgres) via monkey-patching at startup. It exports spans to a collector (Jaeger, Tempo, Datadog) using OTLP.

**Details:**  
```ts
// instrumentation.ts — must be loaded before any other imports
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: 'http://collector:4318/v1/traces' }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

```bash
node -r ./instrumentation.js app.js
```

**Pitfall:** The SDK must be required/imported **before** any instrumented library. Load order matters. Using ESM (`import`) instead of `require` can break instrumentation — use `--require` with the CJS version.

---

### Q39. What is the difference between metrics, logs, and traces?

**Summary:** These are the three pillars of observability. Logs record discrete events, metrics measure aggregated numeric values over time, and traces show the end-to-end path of a single request across services.

**Details:**  

| Pillar | What it records | Example | Tool |
|---|---|---|---|
| **Logs** | Discrete events with context | `"Payment failed: card declined"` | Pino, Winston, CloudWatch |
| **Metrics** | Aggregated numbers over time | `http_requests_total{status=200}` | Prometheus, StatsD |
| **Traces** | Distributed request journey | Span: `POST /order → DB query → Redis` | Jaeger, Zipkin, OTel |

```ts
// Prometheus counter via prom-client
import { Counter } from 'prom-client';
const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'status'],
});
httpRequests.inc({ method: 'GET', status: '200' });
```

**Pitfall:** High-cardinality label values (e.g., `userId` as a Prometheus label) create millions of time series and crash Prometheus. Use traces for per-request context, metrics for aggregates.

---

### Q40. How do you integrate Sentry for error tracking in a Node.js app?

**Summary:** Initialize Sentry once at app startup with `Sentry.init()`. Use the Express/Fastify integration to automatically capture unhandled errors. Attach user context and custom tags to enrich events.

**Details:**  
```ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% of requests traced
});

// Express integration
app.use(Sentry.Handlers.requestHandler()); // must be first
app.use(Sentry.Handlers.tracingHandler());
// ... routes ...
app.use(Sentry.Handlers.errorHandler()); // must be before custom error handler

// Manual capture with context
Sentry.withScope(scope => {
  scope.setUser({ id: req.user.id, email: req.user.email });
  scope.setTag('orderId', orderId);
  Sentry.captureException(err);
});
```

**Pitfall:** The Sentry error handler must be registered before your custom error handler middleware, or Sentry won't capture errors from your routes.

---

## Group 9 — Testing Libraries

### Q41. How do you write unit tests with Jest for a service layer?

**Summary:** Mock external dependencies (DB, external APIs) using `jest.mock()` or manual mocks. Test each service method in isolation by controlling what the mocked dependencies return.

**Details:**  
```ts
// userService.test.ts
import { UserService } from './userService';
import { PrismaClient } from '@prisma/client';

jest.mock('@prisma/client');

const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    service = new UserService(mockPrisma);
    jest.clearAllMocks();
  });

  it('returns user by id', async () => {
    const fakeUser = { id: 1, email: 'alice@example.com' };
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser);

    const result = await service.findById(1);
    expect(result).toEqual(fakeUser);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});
```

**Pitfall:** Over-mocking leads to tests that pass even when the real integration is broken. Balance unit tests with integration tests against a real (test) database.

---

### Q42. What is Supertest and how does it enable HTTP integration testing?

**Summary:** Supertest wraps an Express/Fastify app and makes real HTTP requests in-process without binding to a port. It enables end-to-end route testing without starting a server.

**Details:**  
```ts
import request from 'supertest';
import app from '../src/app'; // Express app, not started

describe('POST /users', () => {
  it('creates a user', async () => {
    const res = await request(app)
      .post('/users')
      .send({ email: 'test@example.com', password: 'password123' })
      .set('Accept', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'test@example.com' });
  });
});
```

**Pitfall:** Integration tests with Supertest run the real middleware stack. If your app connects to a real database, use a dedicated test database and clean up between tests with `beforeEach`/`afterEach` transactions.

---

### Q43. How does `pytest` with `httpx` work for FastAPI testing?

**Summary:** FastAPI's `TestClient` wraps `httpx.Client` in a synchronous interface. For async tests, use `httpx.AsyncClient` with `ASGITransport` and `pytest-anyio`.

**Details:**  
```python
# Sync testing with TestClient
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_create_user():
    response = client.post('/users', json={'email': 'test@example.com', 'age': 25})
    assert response.status_code == 201
    assert response.json()['email'] == 'test@example.com'

# Async testing
import pytest
import httpx

@pytest.mark.anyio
async def test_create_user_async():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url='http://test'
    ) as client:
        response = await client.post('/users', json={'email': 'x@x.com', 'age': 20})
        assert response.status_code == 201
```

**Pitfall:** `TestClient` uses a thread to run the ASGI app synchronously. If your app has async startup events (`lifespan`), use the async client with `anyio` to properly trigger them.

---

### Q44. What is the difference between mocking and stubbing in Jest?

**Summary:** A **stub** replaces a function with a controlled return value (no behavior verification). A **mock** also records calls and lets you assert on how it was called (behavior verification).

**Details:**  
```ts
// Stub — just controls return value
jest.spyOn(emailService, 'send').mockResolvedValue(undefined);

// Mock — also verify call behavior
const mockSend = jest.fn().mockResolvedValue({ messageId: 'abc' });
emailService.send = mockSend;

await userService.register({ email: 'test@example.com' });

// Verification (mock-specific)
expect(mockSend).toHaveBeenCalledTimes(1);
expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
  to: 'test@example.com',
}));
```

In Jest, `jest.fn()` and `jest.spyOn()` both create mocks (they record calls). The distinction is more conceptual: stubs focus on state verification, mocks on interaction verification.

**Pitfall:** Mocks that are too specific about call order or exact argument shapes make tests brittle. Use `expect.objectContaining()` and `expect.any()` for flexibility.

---

### Q45. How do you test async code and timers in Jest?

**Summary:** Use `async/await` with `resolves`/`rejects` matchers for promise-based code. Use `jest.useFakeTimers()` to control `setTimeout`/`setInterval` without waiting real time.

**Details:**  
```ts
// Async assertions
it('resolves with user', async () => {
  await expect(userService.findById(1)).resolves.toMatchObject({ id: 1 });
});

it('rejects on missing user', async () => {
  await expect(userService.findById(999)).rejects.toThrow('User not found');
});

// Fake timers
jest.useFakeTimers();

it('calls cleanup after 5 seconds', () => {
  const cleanup = jest.fn();
  scheduleCleanup(cleanup, 5000);

  jest.advanceTimersByTime(5000);

  expect(cleanup).toHaveBeenCalledTimes(1);
});

afterEach(() => jest.useRealTimers());
```

**Pitfall:** `jest.useFakeTimers()` also fakes `Date.now()` by default (since Jest 27). If your code uses `Date.now()` for timestamps, be aware it's frozen at the fake timer's current time.

---

## Group 10 — Security & Utility

### Q46. What is Helmet.js and what HTTP headers does it set?

**Summary:** Helmet.js is an Express middleware collection that sets security-related HTTP headers to protect against common web vulnerabilities like XSS, clickjacking, and MIME sniffing.

**Details:**  

| Header | Protection |
|---|---|
| `Content-Security-Policy` | XSS / injection |
| `X-Frame-Options` | Clickjacking |
| `X-Content-Type-Options: nosniff` | MIME sniffing |
| `Strict-Transport-Security` | Forces HTTPS |
| `Referrer-Policy` | Referrer leakage |
| `Permissions-Policy` | Browser feature access |

```ts
import helmet from 'helmet';

app.use(helmet()); // applies all defaults

// Custom CSP
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'cdn.example.com'],
    imgSrc: ["'self'", 'data:'],
  },
}));
```

**Pitfall:** Helmet's default CSP is very restrictive and will break apps that load scripts/styles from CDNs or use inline scripts. Always test CSP in report-only mode before enforcing it.

---

### Q47. How does `cors` middleware work and what are its important options?

**Summary:** The `cors` package sets `Access-Control-Allow-*` response headers based on configuration. It handles both simple and preflight (`OPTIONS`) requests.

**Details:**  
```ts
import cors from 'cors';

app.use(cors({
  origin: ['https://app.example.com', 'https://admin.example.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,  // allows cookies to be sent cross-origin
  maxAge: 86400,      // preflight cache duration in seconds
}));
```

**Key options:**
- `origin: '*'` — allows all origins (never use with `credentials: true`)
- `credentials: true` — required for cross-origin cookies/auth headers
- `preflightContinue: false` — respond to OPTIONS with 204 (default)

**Pitfall:** `credentials: true` with `origin: '*'` is rejected by browsers (spec violation). You must specify explicit origins when using credentials.

---

### Q48. What is `dotenv` and what are its limitations compared to a secrets manager?

**Summary:** `dotenv` loads variables from a `.env` file into `process.env` at runtime. It's a development convenience tool, not a secrets manager — `.env` files can be accidentally committed, logged, or copied insecurely.

**Details:**  
```ts
// Load at app entry point before anything else
import 'dotenv/config';

// Or explicitly:
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
```

**Limitations vs. a secrets manager (AWS Secrets Manager, Vault, Doppler):**

| Aspect | dotenv | Secrets Manager |
|---|---|---|
| Rotation | Manual, redeploy required | Automatic |
| Audit trail | None | Full access log |
| Encryption at rest | No | Yes |
| Version history | No | Yes |
| Access control | Filesystem | IAM/policy |

**Pitfall:** Never commit `.env` files containing real secrets. Add `.env` to `.gitignore`. Use `.env.example` with placeholder values as documentation.

---

### Q49. How does `multer` handle multipart file uploads?

**Summary:** Multer is an Express middleware for `multipart/form-data`. It parses the request body and attaches files to `req.file` (single) or `req.files` (multiple). Storage is configurable: memory buffer or disk.

**Details:**  
```ts
import multer from 'multer';

// Disk storage with custom filename
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png'];
    cb(null, allowed.includes(file.mimetype));
  },
});

app.post('/avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ path: req.file.path });
});
```

**Pitfall:** Never use `memoryStorage` for large files in production — files are held in RAM and can exhaust memory under concurrent uploads. Use disk storage or stream directly to S3 with `multer-s3`.

---

### Q50. What is `compression` middleware and when should you not use it?

**Summary:** The `compression` package applies gzip/deflate compression to HTTP responses. It significantly reduces payload size for text-based content (JSON, HTML) but adds CPU overhead and should not be used for already-compressed content.

**Details:**  
```ts
import compression from 'compression';

app.use(compression({
  level: 6,           // 0-9, default 6 (balance of speed vs size)
  threshold: 1024,    // only compress responses > 1 KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res); // default: skip binary content
  },
}));
```

**When NOT to use it:**
- Behind a reverse proxy (nginx, Caddy) that handles compression — double compression wastes CPU
- For already-compressed formats: JPEG, PNG, MP4, ZIP, WebP
- For small responses (< 1 KB) — compression overhead exceeds savings
- For real-time streaming where latency matters more than size

**Pitfall:** Adding compression in Node.js when nginx is already compressing leads to wasted CPU on both sides with no benefit. Check your infrastructure before enabling it.
