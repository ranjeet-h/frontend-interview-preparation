# How do you handle socket authentication

## 1. The Real-World Problem — When You Actually Hit This

You built a real-time chat app with Socket.io. Users can send messages, see who's online, and get notifications. In development with five users, everything works great. Then you launch. A week later, you notice something odd in your logs — users are receiving messages meant for other people. Someone who logged out five minutes ago is still showing as online. Another user reports they could join an admin-only room without admin privileges.

The problem: you set up Socket.io connections but never properly authenticated them. Anyone who knew the socket URL could connect, emit events, and join rooms. The WebSocket connection bypassed all the HTTP middleware you carefully set up for your REST endpoints. Your authentication gate was wide open.

This is exactly why socket authentication matters. WebSockets are persistent connections, not one-off requests. If you don't lock the door during the handshake, someone walks in and stays for hours.

## 2. The Analogy — Make the Mechanic Obvious

Think of a nightclub. The front door is the WebSocket handshake. Inside, there are different rooms — VIP, general floor, staff areas. To enter the club, you show your ID to the bouncer. The bouncer checks it, stamps your hand, and lets you in. Once inside, you can move between rooms, but each room has its own security guard who checks your clearance level before letting you in.

Socket authentication works the same way:

- The bouncer at the front door is your `io.use()` middleware — it runs during the initial handshake before the connection is established
- The ID card is your JWT token — it proves who you are
- The hand stamp is `socket.user` — once authenticated, we attach your user info to the socket object so every event handler knows who you are
- The room guards are your event-level authorization — they check your role before letting you trigger sensitive actions

If the bouncer doesn't check IDs, anyone walks in. If the room guards don't check clearances, anyone enters VIP. You need both.

## 3. The Full Explanation — How It Actually Works

Socket.io authentication happens in two layers: connection-level and event-level.

**Connection-level authentication** runs during the handshake. This is when the client first tries to connect. You use `io.use()` middleware to intercept this handshake. The middleware receives the socket object and a `next()` callback. You extract the token from either `socket.handshake.auth.token` (the modern way) or `socket.handshake.query.token` (the older query-param way). You verify the token using your JWT library. If it's valid, you attach the decoded user to `socket.user` and call `next()` to let the connection proceed. If it's invalid, you call `next(new Error())` to reject the connection entirely.

The key insight: rejected connections never get established. The client receives a connection error and no event handlers run. This is the right place for authentication because it prevents unauthenticated sockets from even entering your system.

**Event-level authorization** happens after the connection is established. Now you know who the user is (it's in `socket.user`), but you still need to check what they're allowed to do. For each sensitive event, you check the user's role before processing. You can do this inline in each event handler, or you can create reusable middleware that checks roles per event type.

**Token expiration** is a special problem for WebSockets. HTTP requests are short-lived — the token is verified, the request runs, and it's done. But a WebSocket connection might stay open for hours. Your access token might expire while the socket is still connected. You have two options: disconnect and reconnect with a fresh token, or send a refresh-token event that updates `socket.user` in place.

**Disconnection cleanup** matters for presence tracking. When a user disconnects, you need to remove them from online lists, leave rooms, and clean up temporary data. The tricky part is multi-device users — someone might have your app open on their phone, laptop, and tablet all at once. You need to track multiple socket IDs per user and only mark them offline when all their sockets disconnect.

## 4. See It In Practice — Real Code or Queries

Here's a complete Socket.io authentication setup in a MERN stack:

```javascript
// server.js - Backend authentication middleware
const io = require('socket.io')(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true
  }
});

// Connection-level authentication - runs during handshake
io.use((socket, next) => {
  // Get token from auth object (modern Socket.io way)
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    // Verify JWT and attach user to socket
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

// Role requirements for each event
const eventRoles = {
  'delete-user': ['admin'],
  'edit-post': ['admin', 'editor'],
  'create-post': ['admin', 'editor', 'user'],
  'join-admin-room': ['admin']
};

// Event-level authorization middleware
const authorizeEvent = (socket, packet, next) => {
  const [eventName] = packet;
  const requiredRoles = eventRoles[eventName];

  if (requiredRoles && !requiredRoles.includes(socket.user.role)) {
    return socket.emit('error', { message: 'Unauthorized for this event' });
  }

  next();
};

io.on('connection', (socket) => {
  console.log(`User ${socket.user.id} connected`);

  // Apply authorization middleware to all events
  socket.use(authorizeEvent);

  // Track multiple sockets per user for multi-device support
  const userId = socket.user.id;
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socket.id);

  // Emit online status
  io.emit('user-online', { userId, socketId: socket.id });

  // Handle token refresh for long-lived connections
  socket.on('refresh-token', ({ token }) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      socket.emit('token-refreshed', { success: true });
    } catch (err) {
      socket.emit('token-refreshed', { success: false, error: 'Invalid token' });
    }
  });

  // Example event with role-based access
  socket.on('delete-user', (data) => {
    // This only runs if authorization middleware passed
    deleteUser(data.userId);
    io.emit('user-deleted', data.userId);
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    const sockets = userSockets.get(userId);
    sockets.delete(socket.id);

    // Only mark offline if all sockets for this user are gone
    if (sockets.size === 0) {
      userSockets.delete(userId);
      io.emit('user-offline', { userId });
    }

    // Leave all rooms
    socket.rooms.forEach(room => {
      socket.leave(room);
    });
  });
});
```

Frontend connection with token:

```javascript
// client.js - Frontend connection
import { io } from 'socket.io-client';

const socket = io(process.env.REACT_APP_SERVER_URL, {
  auth: {
    token: localStorage.getItem('accessToken')
  },
  withCredentials: true
});

// Handle connection errors
socket.on('connect_error', (err) => {
  if (err.message === 'Authentication required') {
    // Redirect to login
    window.location.href = '/login';
  } else if (err.message === 'Invalid token') {
    // Token expired, refresh and reconnect
    refreshTokenAndReconnect();
  }
});

// Handle token expiration during connection
socket.on('connect', () => {
  console.log('Connected as', socket.id);
});

// Refresh token when access token expires
const refreshTokenAndReconnect = async () => {
  const newToken = await fetchRefreshToken();
  socket.emit('refresh-token', { token: newToken });
};

socket.on('token-refreshed', ({ success }) => {
  if (!success) {
    // Refresh failed, need to log in again
    window.location.href = '/login';
  }
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you authenticate Socket.io connections?**

Authenticate during the handshake using `io.use()` middleware. The frontend passes the JWT token in the `auth` option when connecting. The middleware extracts the token, verifies it with your JWT secret, and if valid, attaches the decoded user to `socket.user`. Then it calls `next()` to allow the connection. If the token is missing or invalid, call `next(new Error())` to reject the connection before any event handlers run. This ensures unauthenticated sockets never enter your system.

**Q: How do you handle token expiration for long-lived socket connections?**

Access tokens expire, but WebSocket connections can stay open for hours. I handle this in two ways. The simpler approach: when the access token expires, the frontend uses the refresh token to get a new access token, disconnects the old socket, and reconnects with the fresh token. The more seamless approach: the frontend emits a `refresh-token` event with the new token, the backend verifies it and updates `socket.user` in place without disconnecting. I also set reasonable socket timeouts and require re-authentication for sensitive operations if the connection has been open too long.

**Q: How do you authorize socket events by role?**

Authentication proves who you are; authorization proves what you can do. After the connection is authenticated and `socket.user` is set, I check the user's role before processing sensitive events. I can do this inline in each handler with a simple if-statement, or I can create reusable socket middleware that checks a map of event names to required roles. The middleware intercepts every event, looks up the required roles for that event, and checks if `socket.user.role` is in the allowed list. If not, it emits an error and the event handler never runs. This is the same pattern as REST API authorization — authenticate once at the door, authorize per action inside.

**Q: How do you handle disconnect for multi-device users?**

Users often have multiple devices or tabs open simultaneously. If I track online status as a simple boolean per user, closing one tab incorrectly marks them offline. Instead, I track a Set of socket IDs per user in a Map. When a user connects, I add their socket ID to their Set. When they disconnect, I remove that socket ID from their Set. I only emit `user-offline` when the Set becomes empty — meaning all their sockets are gone. This prevents flickering online/offline status and correctly handles real multi-device scenarios.

**Q: How do you test socket authentication?**

I test the rejection paths heavily because that's where auth bugs live. Using `socket.io-client`, I test five scenarios: no token (should reject), invalid token (should reject), valid token (should accept with `socket.user` set), expired token (should reject), and token refresh (should update `socket.user`). I also test role-based authorization by connecting with different user roles and verifying that admin-only events reject non-admin users. Auth tests are critical — a bug here means unauthorized access to your entire real-time system.

## 6. The Traps — What Goes Wrong in Production

**Authenticating after connection instead of during handshake.** Some developers authenticate inside the `connection` event handler after the socket is already connected. This is wrong because unauthenticated sockets can emit events before your auth check runs. Always authenticate in `io.use()` middleware during the handshake — rejected connections never establish.

**Passing tokens in query parameters instead of the auth object.** Query params get logged in server access logs, proxies, and browser history. Your JWT tokens end up exposed. Use `socket.handshake.auth.token` instead — it's not logged and is the recommended Socket.io approach.

**Forgetting event-level authorization.** Just because a socket is authenticated doesn't mean the user can do everything. A regular authenticated user shouldn't be able to delete other users or join admin rooms. Always check roles for sensitive events, not just at connection time.

**Not handling multi-device disconnect properly.** If you track online status as a single boolean per user, closing one tab marks the user offline even when they're still active on another device. Track multiple socket IDs per user and only emit offline when all sockets disconnect.

**Only testing the happy path.** Testing with a valid token tells you almost nothing. Test rejection paths — no token, invalid token, expired token, wrong role. Those are where the security bugs live.

**Letting sockets linger after logout.** When a user logs out on the frontend, the backend socket might still be connected. Either disconnect the socket from the backend when you invalidate the token, or have the frontend explicitly disconnect before redirecting to login.

## 7. Compare With Related Concepts

**Socket authentication vs HTTP authentication.** HTTP authentication happens per-request — each API call verifies the token. Socket authentication happens once per connection — the token is verified during the handshake and then the socket stays authenticated for its lifetime. HTTP auth doesn't need to handle token expiration during a single request, but sockets must handle expiration for long-lived connections.

**Socket middleware vs Express middleware.** Express middleware runs per HTTP request. Socket middleware runs per connection event or per packet. Express middleware is in the request-response cycle. Socket middleware is in the event-driven cycle. The pattern is similar — intercept, check, pass or reject — but the lifecycle is different.

**Connection-level vs event-level authorization.** Connection-level auth checks identity once during the handshake. Event-level auth checks permissions per action. You need both — connection-level to keep strangers out, event-level to restrict what authenticated users can do inside.

**Socket.io rooms vs role-based access.** Rooms are for grouping sockets — all users in a chat room receive messages sent to that room. Role-based access is for permissions — only admins can delete users. They serve different purposes. A user can be in a room but still lack permission to perform certain actions within that room.

## 8. 🧠 The Memory Hook

Authenticate at the door, authorize at the room.
