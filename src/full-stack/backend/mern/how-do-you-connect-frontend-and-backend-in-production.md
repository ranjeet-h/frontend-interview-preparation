# How do you connect frontend and backend in production

## Detailed explanation

How do you connect frontend and backend in production is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Make frontend and backend agree on auth, data contracts, errors, retries, and state.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define frontend-backend contract.
- Handle auth, cookies/tokens, CORS, and errors.
- Prevent duplicate or stale requests.
- Map backend validation to frontend UX.
- Keep contracts versioned and testable.

## 4. Visual / analogy

```txt
React UI -> API client -> backend endpoint -> response/error contract -> UI state
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply MERN backend rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you connect frontend and backend in production affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you connect frontend and backend in production?
- **The Engine Mechanism (Why it behaves this way):** Two approaches: (1) **Same domain** — serve frontend and backend from the same domain. Nginx serves React's static files and proxies /api/* to Express: `location /api/ { proxy_pass http://localhost:5000; }`. No CORS needed since both are on the same origin. (2) **Different domains** — frontend on example.com, backend on api.example.com. Configure CORS on Express: `cors({ origin: 'https://example.com', credentials: true })`. Frontend sets API base URL via env var: `VITE_API_URL=https://api.example.com`. For httpOnly cookies with cross-origin, set `sameSite: 'none'` and `secure: true`. Same domain is simpler and more secure.
- **The Unforgettable Mental Model:** The **Same Building vs. Different Buildings**. Same domain is like having the reception (frontend) and offices (backend) in the same building — no border check needed. Different domains is like having them in separate buildings — you need a border agreement (CORS) to allow communication.
- **The Trap:** Hardcoding the API URL in the frontend — it changes between development and production. Always use environment variables for the API base URL.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prefer serving frontend and backend from the same domain using Nginx — it serves React's static files and proxies /api/* to Express. This eliminates CORS complexity. For separate domains, I configure CORS with the specific frontend origin and credentials: true. The frontend API URL comes from environment variables. For httpOnly cookies with cross-origin, I set sameSite: 'none' and secure: true. Same domain is always the simpler and more secure choice."

#### How do you configure Nginx for a MERN app?
- **The Engine Mechanism (Why it behaves this way):** Nginx configuration: `server { listen 80; server_name example.com; location / { root /var/www/frontend/dist; try_files $uri $uri/ /index.html; } location /api/ { proxy_pass http://localhost:5000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; } location /socket.io/ { proxy_pass http://localhost:5000; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; } }`. The frontend is served as static files with SPA fallback (try_files). API requests are proxied to Express. Socket.io connections are proxied with WebSocket upgrade headers.
- **The Unforgettable Mental Model:** The **Traffic Director**. Nginx directs traffic: regular visitors go to the showroom (static files), business inquiries go to the office (API proxy), and live conversations go to the conference room (WebSocket proxy).
- **The Trap:** Not configuring WebSocket proxy headers for Socket.io — without Upgrade and Connection headers, WebSocket connections fail and fall back to HTTP polling.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Nginx serves React's static files with try_files for SPA routing, proxies /api/* to Express, and proxies /socket.io/* with WebSocket upgrade headers. I set proxy headers (X-Real-IP, X-Forwarded-For, X-Forwarded-Proto) so Express gets the correct client info. I also configure HTTPS with Let's Encrypt, gzip compression, and caching headers for static assets. The key is the try_files directive for SPA routing and the WebSocket upgrade headers for Socket.io."

#### How do you handle API base URLs across environments?
- **The Engine Mechanism (Why it behaves this way):** Use environment variables: development: `VITE_API_URL=http://localhost:5000`, staging: `VITE_API_URL=https://staging-api.example.com`, production: `VITE_API_URL=https://api.example.com`. Create an API client that reads the base URL: `const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });`. For same-domain production, use a relative URL: `VITE_API_URL=/api`. The API client interceptor attaches auth tokens and handles errors. For SSR apps (Next.js), use server-side env vars for backend-to-backend calls and client-side env vars for browser-to-backend calls.
- **The Unforgettable Mental Model:** The **Address Book**. Each environment has its own address (API URL). The app looks up the right address from its address book (env vars) depending on where it's running.
- **The Trap:** Using absolute URLs for same-domain production — this breaks when the domain changes. Use relative URLs (/api) for same-domain deployments.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use environment variables for API base URLs — different values for development, staging, and production. For same-domain production, I use a relative URL (/api) so it works regardless of the domain. The API client reads the base URL from env vars and creates an axios instance. For SSR apps, I distinguish between server-side env vars (backend-to-backend) and client-side env vars (browser-to-backend). The key is never hardcoding URLs — always use env vars."

#### How do you handle WebSocket connections in production?
- **The Engine Mechanism (Why it behaves this way):** Socket.io in production requires: (1) **Sticky sessions** — if running multiple backend instances, use sticky sessions so a user's socket connections always go to the same instance. Nginx: `ip_hash;` or Railway's sticky sessions. (2) **WebSocket proxy** — Nginx must proxy WebSocket upgrade headers. (3) **CORS** — configure Socket.io CORS for the frontend origin. (4) **Reconnection** — Socket.io auto-reconnects, but configure max attempts and delay. (5) **Scaling** — use Socket.io with Redis adapter for multi-instance communication: `const { createAdapter } = require('@socket.io/redis-adapter'); io.adapter(createAdapter(redisClient, redisClient.duplicate()));`.
- **The Unforgettable Mental Model:** The **Phone Line**. WebSocket is a direct phone line between client and server. Sticky sessions ensure the line always connects to the same operator. The Redis adapter is the intercom system that lets operators talk to each other.
- **The Trap:** Not using sticky sessions with multiple backend instances — Socket.io connections bounce between instances, breaking real-time communication.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For production WebSockets, I configure sticky sessions so socket connections always go to the same backend instance. Nginx proxies WebSocket upgrade headers. For multi-instance setups, I use the Socket.io Redis adapter so instances can communicate with each other. I configure CORS for the frontend origin and set reconnection options. The key challenge with WebSockets in production is statefulness — unlike HTTP, WebSocket connections maintain state on the server, so sticky sessions are essential."

#### How do you handle frontend build and deployment?
- **The Engine Mechanism (Why it behaves this way):** Build React: `npm run build` produces optimized static files in dist/. Deploy to Vercel/Netlify: connect the Git repo, set build command (`npm run build`) and output directory (`dist`). Vercel automatically handles HTTPS, CDN, and preview deployments for PRs. For self-hosted: copy dist/ to Nginx's root directory. Configure caching: hashed filenames get `Cache-Control: public, max-age=31536000, immutable`, index.html gets `Cache-Control: no-cache`. Set up a /api proxy in Nginx or use relative URLs. Configure SPA routing with try_files.
- **The Unforgettable Mental Model:** The **Package and Ship**. The build process packages the app (optimizes, minifies, hashes). The deployment ships it to the distribution center (CDN). The CDN delivers it to customers worldwide from the nearest location.
- **The Trap:** Not configuring cache headers correctly — hashed files should be cached forever (immutable), but index.html must never be cached (no-cache) so users always get the latest version.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I build React with npm run build, which produces optimized static files with hashed filenames. I deploy to Vercel for automatic HTTPS, CDN, and preview deployments. For caching, hashed files get immutable cache headers (cached forever), while index.html gets no-cache (always fresh). I configure SPA routing with try_files in Nginx. For same-domain setups, I proxy /api to the backend. The key is proper cache configuration — immutable for assets, no-cache for the entry point."

## 8. Active recall test

1. **What are the two approaches to connecting frontend and backend in production?**
   - **Explanation:** Same domain (Nginx serves frontend and proxies /api to backend — no CORS needed) or different domains (CORS configured with specific origin and credentials).

2. **How does Nginx handle SPA routing?**
   - **Explanation:** `try_files $uri $uri/ /index.html;` — serves static files if they exist, otherwise falls back to index.html for client-side routing.

3. **How do you handle API base URLs across environments?**
   - **Explanation:** Use environment variables (VITE_API_URL). Different values for dev/staging/prod. For same-domain production, use relative URL (/api).

4. **Why do you need sticky sessions for WebSockets?**
   - **Explanation:** WebSocket connections maintain state on the server. Without sticky sessions, connections bounce between backend instances, breaking real-time communication.

5. **How should you cache frontend assets?**
   - **Explanation:** Hashed files (JS, CSS, images) get immutable cache headers (max-age=31536000). index.html gets no-cache so users always get the latest version.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you connect frontend and backend in production in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you connect frontend and backend in production in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
