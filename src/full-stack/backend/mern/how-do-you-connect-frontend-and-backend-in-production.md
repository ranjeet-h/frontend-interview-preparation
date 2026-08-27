# How do you connect frontend and backend in production

## 1. The Real-World Problem — When You Actually Hit This

You spent months building your MERN app. Everything works perfectly on localhost — React talks to Express on port 5000, authentication flows work, file uploads succeed. You deploy to production and suddenly nothing works. The browser blocks API requests with CORS errors. WebSocket connections drop immediately. Users can't log in because cookies aren't being sent. The API URL you hardcoded in your React app points to localhost, so every request fails. Your SPA routing breaks when someone refreshes the page on a non-root URL, showing a 404 from Nginx. This is the moment you realize that connecting frontend and backend in production is not just "putting them on a server" — it's about coordinating domains, CORS, cookies, routing, and environment configuration so the browser actually lets your frontend talk to your backend.

## 2. The Analogy — Make the Mechanic Obvious

Think of it like two office buildings. If your reception desk (frontend) and your back office (backend) are in the same building, you just walk down the hall — no security checks, no paperwork. That's same-domain deployment. Nginx serves both, and API requests are just internal hallway walks.

If they're in different buildings, you need a formal agreement at the border security. Your reception desk can't just walk over — it needs permission papers (CORS headers), a special ID badge (credentials flag), and the right address in the contact book (environment variables). The border guard (the browser) checks every request: "Is this visitor allowed? Do they have the right papers? Is the destination on the approved list?" Same building is simpler and more secure. Different buildings work, but you have to handle the border crossing properly.

## 3. The Full Explanation — How It Actually Works

In production, you have two fundamental choices for how your frontend and backend live together: same domain or different domains.

**Same domain** means both are served from one origin — example.com serves your React static files and also handles /api requests. Nginx acts as the gatekeeper. It serves the React build as static files. When a request comes in for /api/*, Nginx doesn't look for a file — it proxies the request to your Express server running on localhost:5000. The browser sees everything coming from example.com, so no CORS checks are triggered. Cookies flow naturally. This is the simpler and more secure approach.

**Different domains** means your frontend is on example.com and your backend is on api.example.com. Now the browser treats these as different origins. Every API request from your React app triggers a CORS preflight check — the browser sends an OPTIONS request first, asking "Is example.com allowed to talk to api.example.com?" Your Express server must respond with the right CORS headers saying yes. If you're using httpOnly cookies for authentication, you need to set the cookie with `sameSite: 'none'` and `secure: true` to allow cross-origin cookie sending. Your React app needs to know the backend URL — you can't hardcode it because it changes between environments. You use environment variables instead.

Environment variables are how your app knows where to find the backend. In development, `VITE_API_URL=http://localhost:5000`. In staging, `VITE_API_URL=https://staging-api.example.com`. In production with same domain, you can use a relative URL: `VITE_API_URL=/api`. This works because the browser resolves relative URLs against the current page's origin. Your API client reads this value and creates an axios instance with the correct base URL. Never hardcode the API URL — it will break when you change domains or environments.

Nginx configuration is the glue that makes same-domain deployment work. It needs to handle three things: serving static files, proxying API requests, and handling SPA routing. For static files, Nginx looks in your React build directory. For API requests, it forwards to Express. For SPA routing, it uses `try_files $uri $uri/ /index.html` — this tells Nginx to serve the file if it exists, but if it doesn't (like /dashboard/profile), serve index.html instead so React's client-side router can take over. Without this, refreshing a non-root URL shows a 404.

WebSocket connections add complexity because they're stateful. Unlike HTTP, a WebSocket connection stays open and maintains server-side state. If you're running multiple backend instances behind a load balancer, a WebSocket connection might bounce between instances on different requests, breaking the connection. You need sticky sessions — configure Nginx with `ip_hash` or use your cloud provider's sticky session feature so a user's WebSocket connections always go to the same backend instance. Nginx also needs to proxy WebSocket upgrade headers (`Upgrade: websocket` and `Connection: upgrade`) or the connection falls back to HTTP polling. For multi-instance scaling, Socket.io needs a Redis adapter so all instances can broadcast messages to each other.

Frontend build and deployment is the final piece. Running `npm run build` creates optimized static files with hashed filenames — `main.a1b2c3d4.js` instead of `main.js`. The hash changes when the content changes, which is perfect for caching. You configure Nginx to cache hashed files forever with `Cache-Control: public, max-age=31536000, immutable` — the hash guarantees that if the filename is the same, the content is identical. But index.html must never be cached — set `Cache-Control: no-cache` so users always get the latest entry point and therefore the latest hashed asset references. If you cache index.html, users might load old JavaScript references and break the app.

## 4. See It In Practice — Real Code or Queries

Here's a complete Nginx configuration for a same-domain MERN deployment:

```nginx
server {
    listen 80;
    server_name example.com;

    # Serve React static files with SPA routing fallback
    location / {
        root /var/www/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache hashed assets forever, but never cache index.html
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
        location = /index.html {
            add_header Cache-Control "no-cache";
        }
    }

    # Proxy API requests to Express
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy WebSocket connections for Socket.io
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

For Express CORS configuration with different domains:

```javascript
const cors = require('cors');

// Configure CORS for specific frontend origin
app.use(cors({
    origin: 'https://example.com',
    credentials: true, // Allow cookies to be sent
}));

// For httpOnly cookies with cross-origin
app.use(session({
    secret: 'your-secret',
    cookie: {
        httpOnly: true,
        secure: true,       // Required for cross-origin
        sameSite: 'none',  // Required for cross-origin
    },
}));
```

React API client with environment variable configuration:

```javascript
import axios from 'axios';

// Base URL comes from environment variable
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    withCredentials: true, // Send cookies
});

// Request interceptor to attach auth token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Redirect to login on unauthorized
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default api;
```

Socket.io with Redis adapter for multi-instance scaling:

```javascript
const { createClient } = require('redis');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');

const io = new Server(3000);

const redisClient = createClient({ url: 'redis://localhost:6379' });
const subClient = redisClient.duplicate();

Promise.all([redisClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(redisClient, subClient));
    io.listen();
});
```

Nginx upstream configuration with sticky sessions for WebSockets:

```nginx
upstream backend {
    ip_hash;  # Sticky sessions - same client always goes to same server
    server localhost:5000;
    server localhost:5001;
    server localhost:5002;
}

server {
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you decide between same-domain and different-domain deployment?**

Same domain is simpler and more secure when you control both frontend and backend. Nginx serves static files and proxies API requests, so no CORS is needed and cookies work naturally. Different domain makes sense when your backend is a shared API used by multiple frontends, or when you have separate teams managing each. The tradeoff is CORS complexity, cookie configuration, and environment management. I prefer same domain for a typical MERN app because it eliminates a whole class of cross-origin issues.

**Q: Why does SPA routing break on refresh without Nginx configuration?**

Client-side routing works when you navigate within the app — React intercepts the link click and renders the right component. But when you refresh or directly visit /dashboard/profile, the browser asks Nginx for that specific path. Nginx looks for a file at /dashboard/profile and doesn't find one, so it returns 404. The `try_files $uri $uri/ /index.html` directive tells Nginx to serve index.html for any non-file path, which loads React and lets the client-side router handle the URL. Without this, every deep link breaks on refresh.

**Q: How do you handle authentication cookies across different domains?**

You need three things: CORS configured with `credentials: true` on the server, cookies set with `secure: true` and `sameSite: 'none'`, and the frontend making requests with `withCredentials: true`. The `secure` flag ensures cookies only travel over HTTPS. The `sameSite: 'none'` flag allows cookies to be sent in cross-origin requests. Without these, the browser blocks the cookie, and every request appears unauthenticated even if the user is logged in.

**Q: Why do WebSockets need sticky sessions?**

WebSocket connections maintain state on the server — the server knows which socket belongs to which user and what rooms they're in. If a load balancer sends a WebSocket message to a different backend instance than where the connection was established, that instance has no record of the socket and can't deliver the message. Sticky sessions ensure all messages from a specific client always go to the same backend instance. For multi-instance scaling, you also need a Redis adapter so instances can coordinate broadcasts — when one instance emits a message to a room, Redis propagates it to all other instances.

**Q: How should you cache frontend assets in production?**

Hashed filenames (main.a1b2c3d4.js) should be cached forever with `Cache-Control: public, max-age=31536000, immutable`. The hash guarantees content integrity — if the filename is the same, the file hasn't changed. The entry point (index.html) must never be cached — use `Cache-Control: no-cache` so users always fetch the latest index.html, which references the latest hashed asset filenames. If you cache index.html, users might load old JavaScript references and the app breaks. This pattern gives you the best of both worlds: instant loading for unchanged assets, instant updates for new deployments.

## 6. The Traps — What Goes Wrong in Production

Hardcoding the API URL in your React code is the most common mistake. You write `axios.create({ baseURL: 'http://localhost:5000' })` and it works in development. When you deploy, every request fails because localhost doesn't exist on the production server. Always use environment variables for the API base URL. For same-domain production, use a relative URL like `/api` so it works regardless of the actual domain.

Forgetting WebSocket proxy headers causes silent failures. Nginx proxies the initial HTTP request, but without the `Upgrade` and `Connection` headers, it doesn't upgrade the connection to WebSocket. Socket.io falls back to HTTP polling, which is slower and less efficient. Your app might seem to work, but it's not using real WebSockets. Always include the WebSocket upgrade headers in your Nginx location block for /socket.io/.

Caching index.html breaks deployments. You deploy a new version with new hashed JavaScript files, but users still have the old index.html cached in their browser. They load the old index.html, which references the old JavaScript filenames, and the app breaks or loads outdated code. Never cache index.html — it's the manifest that tells the browser which assets to load.

Misconfiguring CORS with credentials causes silent auth failures. You set `credentials: true` in your CORS config but forget `withCredentials: true` in your axios requests. The browser doesn't send cookies, so every request appears unauthenticated. Or you forget `sameSite: 'none'` on the cookie, and the browser blocks it in cross-origin requests. Test auth end-to-end in production — a working localhost setup doesn't guarantee cross-origin cookies work.

Not using sticky sessions with multiple backend instances breaks real-time features. You scale your backend to three instances behind a load balancer. A user connects via WebSocket to instance A, but a message gets routed to instance B. Instance B has no record of that socket, so the message never arrives. The user sees inconsistent behavior — some messages arrive, others don't. Always configure sticky sessions for WebSocket routes when running multiple instances.

## 7. Compare With Related Concepts

**CORS vs authentication:** CORS is about whether the browser allows a request to leave. Authentication is about whether the server accepts the request. You can have a perfectly configured CORS setup that allows requests, but if the auth token is missing or invalid, the server still returns 401. Both are required — CORS gets the request to the server, auth gets the request accepted.

**Same domain vs reverse proxy:** Same domain deployment uses Nginx as a reverse proxy to serve both static files and API requests from one origin. A reverse proxy can also route to different backends based on paths, subdomains, or headers. Same domain is a specific reverse proxy pattern that eliminates CORS. Reverse proxy is the general technique; same domain is one application of it.

**Sticky sessions vs session affinity:** They're the same thing — different names for the same concept. "Sticky sessions" is the common term in load balancer configuration. "Session affinity" is the more formal term. Both mean that a client's requests always go to the same backend server for the duration of their session.

**Hash-based caching vs query parameter caching:** Hash-based caching changes the filename when content changes (main.a1b2c3d4.js). Query parameter caching keeps the same filename and adds a version query string (main.js?v=1.2.3). Hash-based caching is better because some CDNs and proxies ignore query strings for caching, meaning the old file might still be served. Hash-based caching is foolproof — different filename means different file.

**WebSocket vs Server-Sent Events (SSE):** WebSocket is bidirectional — both client and server can send messages anytime. SSE is unidirectional — only the server can send to the client. WebSocket needs sticky sessions for scaling. SSE doesn't because it's stateless HTTP. Use WebSocket for real-time chat or collaboration. Use SSE for notifications or live updates where the client doesn't need to send back.

## 8. 🧠 The Memory Hook

Same building, no border check. Different buildings, bring your papers.
