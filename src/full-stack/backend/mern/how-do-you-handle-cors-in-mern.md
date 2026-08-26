# How do you handle CORS in MERN

## 1. The Real-World Problem — When You Actually Hit This

Your React app worked perfectly on your laptop. The frontend at `http://localhost:3000` called the Express API at `http://localhost:5000` and everything just worked. Then you deployed it. Now the frontend is at `https://app.example.com` and the API is at `https://api.example.com`. Suddenly login fails with a red CORS error in the console, even though the route never even logged anything.

What's frustrating is that `curl` or Postman to the same API returns the right answer. The server is fine. The browser is the one blocking the response because it doesn't trust your frontend origin anymore. This is the moment you realize CORS isn't about securing your API — it's about the browser deciding which pages get to read which responses.

## 2. The Analogy — Make the Mechanic Obvious

Think of the browser as a mailroom at an apartment building. The mailroom won't hand someone else's mail to just anyone who walks in. When your React page from one address asks for data from an API at another address, the mailroom checks whether the API gave permission for that specific address to read the response.

Express acts like the sender writing a permission slip on the envelope. That slip says exactly which building address is allowed to open this letter. Most requests just get delivered and checked at the door. But some requests — like sending a package with special handling — need to be cleared first. The browser sends an `OPTIONS` preflight like asking the mailroom, "If I send a package with these specific methods and headers from this address, will you accept it?" Only if the mailroom says yes does the real package go out.

## 3. The Full Explanation — How It Actually Works

An origin is three things together: the scheme (http vs https), the host (domain), and the port. So `http://localhost:3000` and `http://localhost:5000` are different origins because the port is different. `https://app.example.com` and `https://api.example.com` are different because the host is different. The browser has a rule called same-origin policy that says a page can only read responses from its own origin. CORS is how a server tells the browser, "I'll make an exception for this specific origin."

When Express wants to allow a request, it sends back an `Access-Control-Allow-Origin` header with the exact origin that made the request. If you're using cookies or other browser-managed credentials, Express also sends `Access-Control-Allow-Credentials: true`. Here's the thing: when credentials are involved, you can't use `Access-Control-Allow-Origin: *`. The browser refuses that combination. You have to send back the specific origin, not a wildcard.

The `credentials: true` setting is about cookies and other browser-managed stuff. It's not about bearer tokens in `Authorization` headers. Those headers just need to be listed in `Access-Control-Allow-Headers` when the request is preflighted.

Most simple requests just go through. But if you're doing a `PUT` or `DELETE`, or sending JSON, or using custom headers like `Authorization`, the browser first sends an `OPTIONS` request called a preflight. This preflight tells the server, "I'm about to send a request with this method and these headers from this origin — is that okay?" The server responds with allow-origin, allow-methods, and allow-headers. Only if those match does the browser send the real request. The `cors` middleware in Express handles all this automatically if you register it before your routes.

Here's something important: CORS doesn't actually secure your API. Another server can call your endpoint directly and CORS won't stop it. `curl` doesn't care about CORS. CORS is purely a browser rule that stops a malicious page from reading a user's private data from another site. Your API still needs real authentication and authorization.

When you're using cookies for authentication, more rules come into play. The frontend has to explicitly opt in with `credentials: 'include'` or `withCredentials: true` in Axios. Express has to allow credentials and send back the specific origin. And the cookie itself needs the right attributes. If your frontend and API are on different subdomains like `app.example.com` and `api.example.com`, they're cross-origin but still same-site if they share the same domain. In that case, `SameSite=Lax` usually works. If they're truly different sites, you need `SameSite=None; Secure` and that requires HTTPS. Also, `HttpOnly` stops JavaScript from reading the cookie, but it doesn't stop CSRF attacks — you still need CSRF tokens or a smart same-site strategy for cookie-authenticated requests that change data.

## 4. See It In Practice — Real Code or Queries

Here's a CommonJS Express setup using the `cors` and `cookie-parser` packages. The environment variable `FRONTEND_ORIGINS` is a comma-separated list — `http://localhost:5173,https://app.example.com` — so you can have different origins for dev and production.

```javascript
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
// Parse the allowlist from environment, defaulting to the common Vite port
const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  // Callback lets us check the origin dynamically. If there's no Origin header
  // (like from curl or a server-to-server call), we allow it — API auth still applies.
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true, // Required for cookies to work across origins
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'], // Only what we actually use
  optionsSuccessStatus: 204 // Some browsers expect 204 for preflight success
};

// Register CORS BEFORE routes so OPTIONS requests get handled
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.get('/api/profile', (req, res) => {
  res.json({ userId: 'user-123' });
});

app.listen(5000, () => console.log('API listening on port 5000'));
```

When you're setting cookies for something like a refresh token, the cookie attributes have to match your CORS setup. Here's a login endpoint that sets a refresh cookie:

```javascript
// In production, this would be a signed JWT with proper persistence
function issueRefreshToken(email) {
  return `demo-refresh-token:${email}`;
}

app.post('/api/login', (req, res) => {
  const refreshToken = issueRefreshToken(req.body.email);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true, // JavaScript can't read this — protects against XSS
    // Secure is required in production, and for cross-site cookies
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_CROSS_SITE === 'true',
    // 'none' for truly cross-site, 'lax' for subdomains on the same site
    sameSite: process.env.COOKIE_CROSS_SITE === 'true' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.json({ ok: true });
});
```

On the React side, you have to explicitly tell the browser to send cookies. This is required for cookie-based auth but NOT for bearer tokens in headers:

```javascript
const response = await fetch('https://api.example.com/api/profile', {
  credentials: 'include', // This tells the browser to send cookies
  headers: { Accept: 'application/json' }
});

if (!response.ok) throw new Error(`Request failed: ${response.status}`);
const profile = await response.json();
```

One way to avoid CORS entirely is to use a reverse proxy. If nginx serves your React files and forwards `/api` requests to Express on the same public origin, the browser sees everything as one origin and never triggers CORS. This can simplify things, but it doesn't remove the need for authentication, authorization, or CSRF protection — it just moves the CORS work into the proxy configuration.

## 5. Interview Questions — All of Them, Done Properly

**Q: What exactly does CORS protect?**

CORS controls whether JavaScript running in a browser on one origin can read a response from a different origin. The browser enforces this, not your Express server or MongoDB. CORS doesn't stop another server from calling your API directly, and tools like `curl` ignore it completely. Real security still comes from authentication, authorization, validation, rate limits, and proper network controls. CORS is about protecting the user's browser from malicious sites, not about locking down your API.

**Q: How do you choose allowed origins in development vs production?**

Use an explicit allowlist that varies by environment. In development, you might include `http://localhost:3000` and `http://localhost:5173` because different tools use different ports. In production, list only the actual HTTPS origins your team controls — like `https://app.example.com`. Never blindly reflect whatever `Origin` header comes in, and never use `*` for an API that uses cookies or other credentials. Remember that origin matching includes the scheme, host, and port — all three have to match exactly.

**Q: What is a preflight and how do you support it?**

A preflight is an `OPTIONS` request the browser sends before certain cross-origin requests. It happens when you're using methods like `PUT` or `DELETE`, sending JSON, or using custom headers like `Authorization`. The preflight tells the server, "I'm about to send this kind of request from this origin — is that okay?" Your CORS middleware needs to run before your routes and respond with matching allow-origin, allow-methods, and allow-headers headers. If the preflight succeeds, the browser then sends the real request. But the preflight doesn't replace authentication — your route still needs to check who's calling and what they're allowed to do.

**Q: What has to align for cross-origin cookies to work?**

Three things need to be in sync. First, the frontend must opt in by sending `credentials: 'include'` or `withCredentials: true`. Second, Express must send back the specific origin (not `*`) plus `Access-Control-Allow-Credentials: true`. Third, the cookie itself needs the right attributes — `SameSite`, `Secure`, domain, and path all have to match your deployment. If your frontend and API are on different subdomains like `app.example.com` and `api.example.com`, they're cross-origin but same-site, so `SameSite=Lax` usually works. If they're truly different sites, you need `SameSite=None; Secure` and that requires HTTPS. These settings just make the cookie travel — they don't replace CSRF protection for state-changing requests.

**Q: Why bother configuring allowed methods and headers explicitly?**

These headers tell the browser what it's allowed to send after a preflight. If your frontend sends a `PATCH` request with an `Authorization` header, but your server only allows `GET` and `Content-Type`, the browser blocks the request before it even reaches your route. By listing only the methods and headers your API actually uses — especially `Authorization` and `Content-Type` — you catch frontend/backend mismatches early and avoid granting broader permissions than necessary.

## 6. The Traps — What Goes Wrong in Production

Using `origin: '*'` with `credentials: true` is a guaranteed failure. The browser simply rejects this combination — if credentials are involved, you must send back the specific origin, not a wildcard. Build a proper allowlist check and return only the origin that actually matched.

Don't add `credentials: true` just because your request has a bearer token in the `Authorization` header. That setting is for browser-managed credentials like cookies. Bearer tokens are just a header, and they only need to be listed in `Access-Control-Allow-Headers` when the request is preflighted. These are two different things.

Don't set `allowedMethods` or `allowedHeaders` to `*` just to avoid the work of listing them. This hides frontend/backend mismatches and gives the browser broader permission than it needs. List exactly what your contract uses — especially `Authorization` and `Content-Type`. If something's missing, you want to know about it during development, not discover it silently in production.

If you register the CORS middleware after your routes, preflight `OPTIONS` requests will hit your routes before CORS can handle them. Those routes probably don't respond with the right CORS headers, so the browser blocks the real request. Always register CORS before your other middleware and routes.

When you see a CORS error, don't assume your API is down. Open the browser Network panel and look at the actual `Origin` header in the request, the `OPTIONS` response, and the response headers coming back. Then test the endpoint with `curl` or Postman to confirm authentication works separately from CORS. The error is usually a configuration mismatch, not a server failure.

Don't treat `localhost` as a single origin. The port and scheme both matter, so `http://localhost:3000` is not the same as `http://localhost:5173`, and neither is the same as `https://localhost:3000`. If your development setup uses different ports, list them all explicitly in your allowlist.

## 7. Compare With Related Concepts

**CORS vs same-origin policy:** Same-origin policy is the browser's default rule that says a page can only read responses from its own origin. CORS is how a server tells the browser to make an exception for specific origins. Think of same-origin policy as the locked door and CORS as the key that opens it for certain visitors. Use CORS when you genuinely need separate browser origins to talk to each other. If you can avoid the complexity by using a reverse proxy to serve everything from one origin, that's often simpler.

**CORS vs CSRF:** These are completely different problems. CORS controls whether a page can read a cross-origin response. CSRF is about tricking a browser that already has valid cookies into making a state-changing request without the user's intent. CORS doesn't stop CSRF — a malicious site can still send a POST request that carries cookies, it just can't read the response. For cookie-authenticated requests that change data, you still need CSRF tokens or a strict same-site cookie strategy. Never rely on CORS as CSRF protection.

**CORS vs authentication and authorization:** They answer different questions. CORS asks "which browser origins may read this response?" Authentication asks "who is making this request?" Authorization asks "what is this caller allowed to do?" You need all three. CORS doesn't authenticate anyone, and authentication doesn't make a cross-origin request safe. They operate at different layers.

**CORS vs a reverse proxy:** A reverse proxy can serve your React app and Express API from the same public origin, which means the browser never triggers CORS at all. This can simplify your setup significantly. But it doesn't magically secure your API — you still need authentication, authorization, and CSRF protection. Use a reverse proxy when unified routing makes your operations simpler. Use explicit CORS when separate origins are intentional or when you can't change the deployment architecture.

## 8. 🧠 The Memory Hook

CORS is a permission slip from the browser, not a lock on your API door. The browser asks "can this page read this response?" and Express says "yes, if it's from this exact origin using these methods and headers." Your API still needs to check who's calling and what they're allowed to do — CORS just controls whether the browser shows the answer.
