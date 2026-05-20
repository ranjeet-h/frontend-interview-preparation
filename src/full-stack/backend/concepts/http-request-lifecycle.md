# HTTP Request Lifecycle

## Detailed explanation

An HTTP request lifecycle is the path a client request follows from browser or app, through the network, into the backend server, through middleware and route logic, then back as an HTTP response. Senior backend interviews expect you to explain not only the handler function, but also DNS, TLS, reverse proxy, routing, validation, database calls, error handling, logging, and response serialization.

## 1. One-line mental model

A backend request lifecycle is a pipeline that receives a request, applies cross-cutting rules, runs business logic, and returns a structured response.

## 2. Problem it solves

Without a clear lifecycle model, backend code becomes random handler logic with inconsistent auth, validation, errors, logs, and response shapes.

## 3. Core idea

- The client creates an HTTP request with method, URL, headers, body, and cookies.
- DNS, TCP, and TLS get the request to the right server securely.
- A reverse proxy or load balancer may terminate TLS and route the request.
- Backend middleware handles logging, CORS, auth, parsing, validation, and rate limiting.
- The route/controller runs business logic, calls services/databases, then serializes the response.

## 4. Visual / analogy

```txt
Client
  -> DNS/TCP/TLS
  -> CDN / reverse proxy / load balancer
  -> backend server
  -> middleware
  -> route/controller
  -> service layer
  -> database/cache/queue
  -> response serializer
  -> client
```

It is like a factory assembly line: each station does one job before the final package leaves.

## 5. Minimal example

```js
app.get("/users/:id", auth, async (req, res, next) => {
  try {
    const user = await userService.getById(req.params.id);
    res.json({ data: user });
  } catch (error) {
    next(error);
  }
});
```

## 6. Real-world example

```txt
GET /api/orders/123
Auth middleware validates cookie/JWT.
Validation middleware checks order id.
Controller calls order service.
Service checks permissions.
Repository queries database.
Response serializer hides internal fields.
Logger records status code and latency.
```

## 7. Common interview questions

1. What happens after a browser sends an HTTP request?
2. Where does authentication happen in the lifecycle?
3. Why use middleware?
4. Where should request validation live?
5. Where should business logic live?
6. How do errors move through the backend pipeline?
7. What does a reverse proxy do before the app receives the request?
8. How do you trace one request across services?

## 8. Active recall test

1. Name each step from client to database and back.
2. Where do CORS, auth, validation, and rate limiting usually run?
3. What should a controller do and not do?
4. Why should response serialization be explicit?

## 9. Mistakes / traps

- Thinking the route handler is the whole lifecycle.
- Putting all logic inside controllers.
- Returning raw database models directly.
- Handling errors differently in every endpoint.
- Logging sensitive request bodies.

## 10. Compare with related concepts

It is not the same as REST. REST is an API design style; request lifecycle is how any backend processes a request. It is not the same as middleware either; middleware is only one stage in the lifecycle.

## 11. Summary from memory

Explain the full journey of one authenticated API request from browser to backend to database and back.

## 12. Spaced revision prompts

- Day 1: Draw the lifecycle from memory.
- Day 3: Explain where auth and validation happen.
- Day 7: Explain how an error becomes a JSON response.
- Day 14: Explain how tracing follows one request across services.

