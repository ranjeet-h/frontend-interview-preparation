# System Design Complete Study Guide

This file combines all the explanations from this study thread into one place for revision.

---

# Core System Design Fundamentals

## 1. Scalability

Scalability = ability of a system to handle more load without becoming too slow or crashing.

Example:

```text
Today:
1 server → 1,000 users

Tomorrow:
Need to support 1,000,000 users
```

Two ways:

```text
Vertical Scaling
Increase power of same machine

4 GB RAM → 32 GB RAM
4 CPU → 32 CPU
```

```text
Horizontal Scaling
Add more machines

Server 1
Server 2
Server 3
Server 4
```

Horizontal scaling is generally preferred in large distributed systems.

Remember:

```text
Scale Up  = bigger machine
Scale Out = more machines
```

---

## 2. Availability

Availability = how often the system is accessible and working.

Formula:

```text
Availability =
Uptime / Total Time
```

Example:

```text
99% availability
≈ 3.65 days downtime/year

99.9%
≈ 8.76 hours/year

99.99%
≈ 52 minutes/year

99.999%
≈ 5 minutes/year
```

If Amazon opens successfully almost every time you visit it, it has high availability.

Common ways to improve availability:

```text
Multiple servers
Load balancers
Replication
Failover
Multiple data centers
```

Remember:

```text
Availability = "Can I access the system?"
```

---

## 3. Reliability

Reliability = system behaves correctly and consistently over time.

Suppose:

```text
Bank transfer:
₹10,000 sent from A → B
```

The website may be available, but if money sometimes disappears or gets duplicated:

```text
Available? Yes
Reliable? No
```

Remember the difference:

```text
Availability
"Is the system running?"

Reliability
"Is the system giving correct results?"
```

A system can be:

```text
available but unreliable
```

Example:

```text
API responds 100% of the time
but returns wrong data 10% of the time.
```

---

## 4. SPOF — Single Point of Failure

SPOF = one component whose failure can bring down the entire system.

Bad architecture:

```text
Users
  |
Load Balancer
  |
Server
  |
Database
```

If the only database dies:

```text
Entire application dies
```

Database is a SPOF.

Better:

```text
             ┌── Server 1
Users → LB ──┼── Server 2
             └── Server 3

                  |
          Primary Database
                  |
          Replica Database
```

But notice:

If you only have one load balancer:

```text
Load Balancer itself becomes SPOF.
```

So production systems often have redundancy at every important layer.

Remember:

```text
SPOF = "If this one thing dies, does everything die?"
```

---

# 5. Latency vs Throughput vs Bandwidth

These three are frequently confused.

### Latency

Latency = how long one request takes.

Example:

```text
Request sent: 10:00:00.000
Response:     10:00:00.200

Latency = 200 ms
```

Think:

```text
Latency = speed of one request
```

---

### Throughput

Throughput = how many operations the system processes per unit time.

Example:

```text
10,000 requests/second
```

Think:

```text
Throughput = amount of work completed
```

---

### Bandwidth

Bandwidth = maximum amount of data that can travel through a network.

Example:

```text
1 Gbps network
```

Think of a road:

```text
Latency
How long one car takes to reach destination

Bandwidth
How wide the road is

Throughput
How many cars actually pass every second
```

Very important:

```text
Low latency = good

High throughput = good

High bandwidth = usually good
```

---

# 6. Consistent Hashing

Suppose you have three cache servers:

```text
Cache A
Cache B
Cache C
```

You need to decide where a key should go.

Naive approach:

```js
server = hash(key) % numberOfServers
```

Example:

```text
hash(user123) % 3
```

Works fine.

But now add another server:

```text
3 servers → 4 servers
```

Now:

```text
hash(key) % 3
```

becomes:

```text
hash(key) % 4
```

A huge number of keys suddenly map to different servers.

That means massive cache misses / data movement.

Consistent hashing solves this.

Imagine servers placed on a ring:

```text
              A
         /         \
       D             B
         \         /
              C
```

Keys are also hashed somewhere on the ring.

A key belongs to the next server clockwise.

Example:

```text
key1 → A
key2 → B
key3 → B
key4 → C
```

If server D gets added:

Only keys around D's portion move to D.

Other keys stay where they were.

Main benefit:

```text
Adding/removing a server moves only a small portion of keys.
```

Used in:

```text
Distributed caches
Databases
Cassandra
Dynamo-style systems
CDNs
```

Interview memory:

```text
Consistent Hashing
= distribute data while minimizing redistribution
  when servers join/leave.
```

---

# 7. CAP Theorem

CAP applies to distributed systems.

CAP:

```text
C = Consistency
A = Availability
P = Partition Tolerance
```

### Consistency

All nodes see the latest data.

Example:

```text
Node A: balance = ₹100
Node B: balance = ₹100
```

After update:

```text
Node A: ₹50
Node B: ₹50
```

Immediately.

---

### Availability

Every request receives a response.

Even if some nodes have problems.

---

### Partition Tolerance

System continues working even if network communication between servers breaks.

Example:

```text
Data Center A   X   Data Center B
                ^
         network broken
```

That is a network partition.

In real distributed systems, network partitions can happen.

So you generally must tolerate P.

Therefore the real CAP choice becomes:

```text
CP
or
AP
```

### CP

Choose:

```text
Consistency + Partition tolerance
```

During a partition, some requests may fail.

Example idea:

```text
Banking
```

Better to reject a request than show incorrect account balance.

---

### AP

Choose:

```text
Availability + Partition tolerance
```

System keeps responding, but nodes may temporarily have different data.

Example idea:

```text
Social media likes
```

Seeing:

```text
1,501 likes
```

instead of:

```text
1,502 likes
```

for a few seconds is usually acceptable.

Remember:

```text
During network partition:

CP → sacrifice Availability
AP → sacrifice immediate Consistency
```

One important interview correction:

Do not say:

```text
"CAP means choose any 2 out of 3."
```

Better say:

```text
When a network partition happens,
you choose between Consistency and Availability.
```

---

# 8. Failover

Failover = switching from a failed component to a backup component.

Example:

```text
Primary DB
    |
    X crashes

Replica DB
    |
becomes Primary
```

Before:

```text
Primary DB → receives writes
Replica DB → copies data
```

After primary dies:

```text
Replica promoted → New Primary
```

This switching process is failover.

Failover can be:

```text
Manual
Automatic
```

Production systems usually prefer automatic failover.

Remember:

```text
Failover = "Primary died → switch to backup"
```

---

# 9. Fault Tolerance

Fault tolerance = system continues functioning even when parts of it fail.

Example:

You have:

```text
Server A
Server B
Server C
```

Server B crashes.

```text
Server A ✓
Server B X
Server C ✓
```

Application still works.

That's fault tolerance.

Achieved through things like:

```text
Replication
Redundancy
Load balancing
Retries
Failover
Multiple availability zones
Data replication
```

Important distinction:

```text
Failover
= mechanism/action

Fault Tolerance
= overall system capability
```

Example:

```text
Replica DB + automatic failover
                ↓
helps achieve
                ↓
Fault tolerance
```

---

# How all these concepts connect

Imagine designing Netflix:

```text
                   Users
                     |
              Load Balancers
               /     |     \
           Server  Server  Server
              \      |      /
               Distributed Cache
                     |
              Database Cluster
             Primary + Replicas
```

Now:

```text
Scalability
→ Add more servers as users increase.

Availability
→ Service should remain accessible.

Reliability
→ Videos/accounts/payments should behave correctly.

SPOF
→ Avoid having one critical server.

Latency
→ How quickly video/API responds.

Throughput
→ Requests/streams handled per second.

Bandwidth
→ Network data capacity.

Consistent Hashing
→ Distribute cache/data across servers.

CAP
→ Decide behavior during network partitions.

Failover
→ Replace failed primary with replica.

Fault Tolerance
→ Entire system keeps working despite failures.
```

## Interview cheat sheet

| Concept | One-line meaning |
|---|---|
| Scalability | Handle increasing load |
| Availability | System is accessible |
| Reliability | System behaves correctly |
| SPOF | One failure can kill system |
| Latency | Time for one request |
| Throughput | Requests processed per second |
| Bandwidth | Maximum network data capacity |
| Consistent Hashing | Distribute keys with minimal remapping |
| CAP | During partition, choose consistency or availability |
| Failover | Switch failed component to backup |
| Fault Tolerance | Keep working despite failures |

---

# Networking Fundamentals

## 1. OSI Model

OSI Model = a way to understand how data moves from one computer to another through a network.

It has 7 layers:

```text
7. Application
6. Presentation
5. Session
4. Transport
3. Network
2. Data Link
1. Physical
```

For system design interviews, you mainly care about:

```text
Layer 7 → HTTP, HTTPS, DNS
Layer 4 → TCP, UDP
Layer 3 → IP addresses, routing
Layer 2 → MAC addresses
Layer 1 → Wi-Fi cable, fiber, electrical signals
```

Imagine you open:

```text
https://google.com
```

Very simplified:

```text
Application
HTTP request

    ↓

Transport
TCP breaks data into packets

    ↓

Network
IP decides where packets should go

    ↓

Data Link
Moves data across local network

    ↓

Physical
Wi-Fi / Ethernet / fiber
```

On Google's server, the process happens in reverse.

```text
Physical
   ↓
Data Link
   ↓
Network
   ↓
Transport
   ↓
Application
```

Easy memory:

```text
HTTP → TCP → IP → Network hardware
```

You do not normally need to memorize all seven layers deeply for system design.

---

# 2. IP Address

IP address = address of a machine on a network.

Think:

```text
House → postal address
Computer → IP address
```

Example IPv4:

```text
142.250.183.14
```

IPv4 contains 32 bits.

Example:

```text
192.168.1.10
```

There are two important types.

### Public IP

Visible on the internet.

```text
Internet
   |
203.10.20.30
   |
Your router
```

Your ISP usually gives your router a public IP.

### Private IP

Used inside your local network.

Common ranges:

```text
10.x.x.x

172.16.x.x - 172.31.x.x

192.168.x.x
```

Example:

```text
Router
192.168.1.1

Laptop
192.168.1.10

Phone
192.168.1.11

TV
192.168.1.12
```

These private addresses aren't directly accessible from the internet.

### IPv4 vs IPv6

IPv4:

```text
192.168.1.10
```

IPv6:

```text
2001:0db8:85a3::8a2e:0370:7334
```

IPv6 exists largely because IPv4 addresses are limited.

Remember:

```text
IP = where is the machine?
```

---

# 3. DNS — Domain Name System

DNS = converts human-readable domain names into IP addresses.

You remember:

```text
google.com
```

Computers need something like:

```text
142.250.x.x
```

DNS does:

```text
google.com
      ↓
DNS
      ↓
142.250.x.x
```

Think of DNS as the internet's phonebook.

## What happens when you type:

```text
amazon.com
```

Browser first asks:

```text
Do I already know the IP?
```

It may check:

```text
Browser cache
OS cache
```

If not, it asks a DNS resolver.

Usually:

```text
Your device
    |
DNS Resolver
```

The resolver may ask:

```text
Root DNS
   ↓
.com DNS
   ↓
amazon.com's authoritative DNS
```

Finally:

```text
amazon.com → IP address
```

Then your browser connects to that IP.

Simplified:

```text
amazon.com

    ↓ DNS

IP address

    ↓

connect to server
```

Important DNS records:

```text
A
domain → IPv4

AAAA
domain → IPv6

CNAME
domain → another domain

MX
email servers

TXT
arbitrary verification/config data
```

Example:

```text
example.com
A
1.2.3.4
```

Or:

```text
www.example.com
CNAME
example.com
```

Remember:

```text
DNS = domain → IP
```

---

# 4. Proxy vs Reverse Proxy

This is very important.

## Forward Proxy

A proxy sits in front of clients.

```text
You
 |
Proxy
 |
Internet
 |
Google
```

Google sees the proxy instead of seeing you directly.

Used for:

```text
Hiding client IP
Company network restrictions
Filtering
Caching
VPN-like scenarios
```

Think:

```text
Forward Proxy represents the CLIENT.
```

---

## Reverse Proxy

Reverse proxy sits in front of servers.

```text
Users
   |
Reverse Proxy
   |
 ┌─┼──────────┐
 | |          |
App1 App2    App3
```

Users don't directly know which backend handled the request.

Examples:

```text
Nginx
HAProxy
Cloudflare
Envoy
```

A reverse proxy can handle:

```text
Load balancing
SSL termination
Caching
Rate limiting
Authentication
Routing
Compression
```

Example:

```text
api.example.com
       |
     Nginx
    /     \
Server1 Server2
```

Easy difference:

```text
Forward Proxy
Client → Proxy → Internet

Proxy represents clients.


Reverse Proxy
Internet → Proxy → Servers

Proxy represents servers.
```

Interview sentence:

```text
Forward proxy hides/protects clients.

Reverse proxy hides/protects backend servers.
```

---

# 5. HTTP / HTTPS

HTTP = protocol used for communication between clients and servers.

Example:

```text
Browser
   |
GET /users
   |
Server
```

A request looks conceptually like:

```http
GET /users HTTP/1.1
Host: example.com
Authorization: Bearer token
```

Response:

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "name": "Ranjeet"
}
```

Common HTTP methods:

```text
GET     → fetch
POST    → create
PUT     → replace/update
PATCH   → partial update
DELETE  → delete
```

Common status codes:

```text
200 → OK

201 → Created

400 → Bad Request

401 → Unauthenticated

403 → Forbidden

404 → Not Found

500 → Server Error

502 → Bad Gateway

503 → Service Unavailable
```

---

## HTTP vs HTTPS

HTTP:

```text
Client ───── data ─────→ Server
```

Traffic isn't encrypted at the HTTP layer.

HTTPS:

```text
HTTP + TLS encryption
```

So:

```text
Client
   |
encrypted connection
   |
Server
```

If you send:

```text
password=hello123
```

HTTPS encrypts network traffic so someone intercepting it cannot simply read that plaintext.

HTTPS provides three major things:

```text
Encryption
Authentication
Integrity
```

Authentication here means:

```text
"Am I really communicating with amazon.com?"
```

using TLS certificates.

Remember:

```text
HTTPS = HTTP over TLS
```

---

# 6. TCP vs UDP

Both are transport-layer protocols.

## TCP

TCP is connection-oriented and reliable.

Before sending application data:

```text
Client              Server

  SYN  ------------>

       <------------ SYN-ACK

  ACK  ------------>
```

That's the TCP handshake.

Then data is sent.

TCP handles:

```text
Packet ordering
Lost packet retransmission
Duplicate detection
Flow control
Congestion control
```

Example:

```text
Send:

1 2 3 4 5
```

If packet 3 disappears:

```text
1 2 _ 4 5
```

TCP retransmits 3.

Receiver eventually gets:

```text
1 2 3 4 5
```

Great for:

```text
Web requests
Database connections
File transfer
Email
SSH
```

---

## UDP

UDP is much simpler.

```text
Sender → packet
Sender → packet
Sender → packet
```

No connection setup and no built-in guarantee packets arrive.

If:

```text
1 2 3 4 5
```

packet 3 disappears:

```text
1 2 _ 4 5
```

UDP doesn't automatically retransmit it.

This makes UDP useful where speed and low overhead matter more than perfect delivery.

Examples:

```text
Live video
Gaming
Voice calls
DNS
```

Easy comparison:

| TCP | UDP |
|---|---|
| Reliable | No delivery guarantee |
| Ordered | May arrive out of order |
| Retransmits | No automatic retransmission |
| More overhead | Less overhead |
| Connection-oriented | Connectionless |
| Web/files/DB | Streaming/gaming/DNS |

Remember:

```text
TCP = make sure it arrives.

UDP = send it quickly.
```

One modern detail:

HTTP/3 uses QUIC, which runs over UDP but implements reliability and congestion control itself.

---

# 7. Load Balancing

Suppose you initially have:

```text
Users
  |
Server
```

Now 100,000 users arrive.

One server isn't enough.

So:

```text
                  ┌→ Server 1
Users → Load Balancer → Server 2
                  └→ Server 3
```

Load balancer distributes requests between servers.

Example:

```text
Request 1 → Server A
Request 2 → Server B
Request 3 → Server C
Request 4 → Server A
```

Benefits:

```text
Scalability
Availability
Fault tolerance
Avoid server overload
```

## Common load-balancing algorithms

### Round Robin

Take turns:

```text
Request 1 → A
Request 2 → B
Request 3 → C
Request 4 → A
Request 5 → B
```

Simple.

---

### Weighted Round Robin

Some servers are stronger.

```text
A = powerful → weight 3
B = smaller  → weight 1
```

A gets more requests.

---

### Least Connections

Send request to server currently handling the fewest connections.

```text
A → 100 connections
B → 20 connections
C → 60 connections

New request → B
```

Useful when requests have varying durations.

---

### IP Hash

Hash client's IP:

```text
hash(clientIP) → server
```

Same client tends to reach same server.

Can help with sticky sessions.

---

## L4 vs L7 Load Balancer

This is useful for system design.

### Layer 4

Works mainly with:

```text
IP
TCP
UDP
Port
```

Doesn't need to understand HTTP deeply.

Fast.

### Layer 7

Understands HTTP-level information.

Can route:

```text
/api/users → User Service

/api/orders → Order Service

/images → Image Service
```

Example:

```text
                Load Balancer
                     |
           ┌─────────┼─────────┐
           ↓         ↓         ↓
        Users     Orders     Images
```

Examples:

```text
Nginx
HAProxy
AWS ALB
Envoy
```

Remember:

```text
Load Balancer = distribute traffic across servers.
```

---

# 8. Checksums

Checksum = small value calculated from some data to detect accidental corruption.

Suppose you have:

```text
hello world
```

You run a checksum algorithm:

```text
hello world
     ↓
checksum
     ↓
some value
```

You send:

```text
File + checksum
```

Receiver calculates checksum again.

If:

```text
Sender checksum == Receiver checksum
```

probably data was not corrupted.

If:

```text
Sender checksum != Receiver checksum
```

something changed.

Example:

```text
Original file
    ↓
Checksum = ABC123
```

After transmission:

```text
Received file
    ↓
Checksum = XYZ789
```

Therefore:

```text
Data corrupted
```

Used in:

```text
Network packets
File downloads
Storage systems
Databases
Backups
```

Important:

Checksum is primarily about detecting accidental corruption.

It is not automatically security.

Simple checksum:

```text
detect corruption
```

Cryptographic hash:

```text
SHA-256
```

provides much stronger protection against intentional modification, though authentication often needs something like HMAC or digital signatures.

Remember:

```text
Checksum = "Did the data change?"
```

---

# How everything connects when you open a website

Suppose you type:

```text
https://example.com/users
```

Flow:

```text
1. DNS
   example.com → 20.10.5.30

2. IP
   tells your computer where the server is

3. TCP
   establishes reliable connection
   (or QUIC/UDP for HTTP/3)

4. HTTPS
   establishes encrypted communication

5. HTTP
   GET /users

6. Reverse Proxy / Load Balancer
   receives request

7. Load Balancer
   chooses backend

           ┌→ Server A
User → LB ─┼→ Server B
           └→ Server C

8. Server responds

9. TCP/IP sends response back

10. Browser displays result
```

And OSI gives you the conceptual layers underneath:

```text
HTTP/HTTPS        Application
     ↓
TCP/UDP           Transport
     ↓
IP                Network
     ↓
Ethernet/Wi-Fi    Data Link
     ↓
Signals           Physical
```

## Interview cheat sheet

| Concept | Remember |
|---|---|
| OSI | Layers explaining network communication |
| IP | Address of a machine |
| DNS | Domain → IP |
| Forward Proxy | Represents client |
| Reverse Proxy | Represents servers |
| HTTP | Client-server communication protocol |
| HTTPS | HTTP + TLS encryption |
| TCP | Reliable, ordered delivery |
| UDP | Fast, lightweight delivery |
| Load Balancer | Distribute traffic across servers |
| Checksum | Detect data corruption |

The most important chain to remember for system-design interviews is:

```text
Domain
  ↓
DNS
  ↓
IP
  ↓
TCP / QUIC
  ↓
TLS
  ↓
HTTP
  ↓
Load Balancer / Reverse Proxy
  ↓
Application Servers
```


---

# APIs and Database Fundamentals

# APIs

API = a contract that lets one software system communicate with another.

Example:

```text
Frontend
   |
GET /users/123
   |
Backend
   |
Database
```

The frontend does not need to know how the backend works internally.

It only needs to know:

```text
Request format
Response format
Endpoint
Authentication
```

Example:

```http
GET /users/123
```

Response:

```json
{
  "id": 123,
  "name": "Ranjeet"
}
```

Remember:

```text
API = interface between software systems
```

---

# API Gateway

API Gateway = single entry point for many backend services.

Without gateway:

```text
Client
 ├── User Service
 ├── Order Service
 ├── Payment Service
 └── Notification Service
```

Client needs to know every service.

With gateway:

```text
Client
   |
API Gateway
   |
   ├── User Service
   ├── Order Service
   ├── Payment Service
   └── Notification Service
```

Gateway can handle:

```text
Authentication
Rate limiting
Routing
Logging
SSL termination
Request transformation
Load balancing
Caching
```

Example:

```text
GET /users
       ↓
API Gateway
       ↓
User Service

POST /payments
       ↓
API Gateway
       ↓
Payment Service
```

Remember:

```text
Load Balancer
→ distributes traffic across instances

API Gateway
→ routes requests across APIs/services
```

They can overlap, but their main responsibilities differ.

---

# REST vs GraphQL

## REST

REST usually exposes multiple endpoints.

```text
GET /users/123

GET /users/123/posts

GET /posts/50/comments
```

Example response:

```json
{
  "id": 123,
  "name": "Ranjeet",
  "email": "..."
}
```

Problem:

You may receive fields you don't need.

This is called:

```text
Over-fetching
```

Or you may need several requests to get all related information:

```text
Under-fetching
```

---

## GraphQL

GraphQL usually exposes one endpoint:

```text
POST /graphql
```

Client specifies exactly what data it wants.

Example:

```graphql
query {
  user(id: 123) {
    name
    posts {
      title
    }
  }
}
```

Response:

```json
{
  "user": {
    "name": "Ranjeet",
    "posts": [
      {
        "title": "System Design"
      }
    ]
  }
}
```

Comparison:

| REST | GraphQL |
|---|---|
| Multiple endpoints | Usually one endpoint |
| Server defines response shape | Client defines response shape |
| Simpler caching | More complex caching |
| Easier to implement | More flexible |
| Great for CRUD | Great for complex frontend data |

Remember:

```text
REST
→ server decides response structure

GraphQL
→ client asks for exact fields
```

---

# WebSockets

Normal HTTP:

```text
Client → Request → Server
Client ← Response ← Server
```

Client must initiate communication.

WebSocket:

```text
Client ⇄ Server
```

Connection remains open.

Both sides can send messages anytime.

Example chat application:

```text
User A
   |
WebSocket
   |
Server
   |
WebSocket
   |
User B
```

When User A sends:

```text
Hello
```

server can immediately push:

```text
Hello
```

to User B.

No polling required.

Useful for:

```text
Chat
Live notifications
Gaming
Live dashboards
Stock prices
Collaborative editing
```

Remember:

```text
HTTP
→ request-response

WebSocket
→ persistent two-way connection
```

---

# Webhooks

Webhook = server sends an HTTP request to another server when an event happens.

Example Stripe payment:

```text
Your Server
    |
Create payment
    |
Stripe
```

Payment finishes later.

Instead of repeatedly asking:

```text
Is payment done?
Is payment done?
Is payment done?
```

Stripe calls you:

```http
POST /webhooks/payment
```

With:

```json
{
  "event": "payment.success",
  "paymentId": "123"
}
```

Flow:

```text
Payment succeeds
      ↓
Stripe
      ↓
POST webhook
      ↓
Your Server
```

Remember:

```text
Webhook = "call me when something happens"
```

Difference:

```text
WebSocket
→ continuous connection

Webhook
→ HTTP callback triggered by event
```

---

# Idempotency

Idempotency = repeating the same operation should not create unintended additional effects.

Very important for payments.

Suppose:

```text
POST /payments
₹5000
```

Client sends request.

Server processes payment.

But response gets lost.

Client thinks:

```text
Maybe payment failed
```

and retries.

Without idempotency:

```text
₹5000 charged
₹5000 charged again
```

Bad.

Use:

```http
Idempotency-Key: payment-abc123
```

Server stores:

```text
payment-abc123
→ already processed
→ return previous result
```

Now:

```text
Request 1 → charge ₹5000
Request 2 → return same result
Request 3 → return same result
```

Only one charge happens.

HTTP methods:

```text
GET     → normally idempotent
PUT     → normally idempotent
DELETE  → normally idempotent

POST    → usually not idempotent
```

Remember:

```text
Idempotency
= retry safely without duplicating the effect
```

---

# Rate Limiting

Rate limiting = restrict how many requests a client can send.

Example:

```text
100 requests/minute/user
```

User sends:

```text
Request 1
Request 2
...
Request 100
```

Allowed.

Request 101:

```http
HTTP 429 Too Many Requests
```

Why?

```text
Prevent abuse
Prevent DDoS
Protect servers
Control API usage
Protect expensive operations
```

---

## Fixed Window

Example:

```text
100 requests per minute
```

Window:

```text
10:00:00 - 10:00:59
```

Counter:

```text
User123 → 73
```

Simple, but has boundary problem.

User could send:

```text
100 requests at 10:00:59

100 requests at 10:01:00
```

Effectively:

```text
200 requests almost instantly
```

---

## Sliding Window

Tracks requests over the previous time window.

At:

```text
10:01:30
```

count requests between:

```text
10:00:30 → 10:01:30
```

More accurate.

---

## Token Bucket

Imagine bucket containing tokens.

```text
Bucket capacity = 100
Refill = 10 tokens/sec
```

Each request:

```text
consume 1 token
```

If tokens remain:

```text
allow
```

If bucket empty:

```text
reject
```

Allows short bursts while controlling long-term traffic.

Very common.

Remember:

```text
Token Bucket
→ permits bursts

Sliding Window
→ accurate request rate
```

---

# API Design

Good REST API design usually follows predictable conventions.

Bad:

```text
GET /getUsers
POST /createUser
POST /deleteUser
```

Better:

```text
GET    /users
POST   /users
GET    /users/123
PATCH  /users/123
DELETE /users/123
```

Use nouns:

```text
/users
/orders
/products
```

Not verbs:

```text
/getUsers
/createOrder
```

Nested resources:

```text
GET /users/123/orders
```

Pagination:

```text
GET /products?page=2&limit=20
```

Filtering:

```text
GET /products?category=phone
```

Sorting:

```text
GET /products?sort=price
```

Versioning:

```text
/api/v1/users
```

Return correct status codes:

```text
200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
429 Too Many Requests
500 Internal Server Error
```

Interview rule:

```text
Good API =
predictable
consistent
secure
versioned
paginated
idempotent where needed
```

---

# Database Fundamentals

# ACID Transactions

ACID describes guarantees provided by database transactions.

```text
A = Atomicity
C = Consistency
I = Isolation
D = Durability
```

Suppose:

```text
Transfer ₹1000
A → B
```

Operations:

```text
1. Remove ₹1000 from A
2. Add ₹1000 to B
```

---

## Atomicity

Either everything happens or nothing happens.

Bad:

```text
A loses ₹1000
Server crashes
B never receives ₹1000
```

Atomic transaction:

```text
both succeed

OR

both rollback
```

Remember:

```text
Atomicity = all or nothing
```

---

## Consistency

Database must remain valid according to its rules.

Example:

```text
Balance cannot violate constraints
Foreign key must reference valid row
```

Remember:

```text
Consistency = valid state → valid state
```

---

## Isolation

Two transactions should not incorrectly interfere with each other.

Example:

```text
Transaction A
reads balance ₹1000

Transaction B
also modifies balance
```

Database isolation controls what each transaction can see.

Remember:

```text
Isolation = concurrent transactions behave safely
```

---

## Durability

Once transaction commits:

```text
Payment successful
```

the result survives:

```text
Server crash
Restart
Power failure
```

Remember:

```text
Durability = committed means saved
```

---

# SQL vs NoSQL

## SQL

Relational database.

Examples:

```text
PostgreSQL
MySQL
SQL Server
Oracle
```

Data:

```text
Users

id | name    | email
1  | Ranjeet | ...
2  | Rajat   | ...
```

Strong relationships:

```text
Users
   |
Orders
   |
OrderItems
```

Great for:

```text
Transactions
Banking
Payments
ERP
Complex relationships
Structured data
```

---

## NoSQL

NoSQL = non-relational databases.

Examples:

```text
MongoDB
DynamoDB
Cassandra
Redis
```

MongoDB example:

```json
{
  "_id": 123,
  "name": "Ranjeet",
  "skills": ["React", "Python"]
}
```

Flexible schema.

Good for:

```text
Massive scale
Flexible data
High write throughput
Simple access patterns
```

Important:

```text
SQL does NOT mean cannot scale.

NoSQL does NOT mean automatically faster.
```

Choose based on access patterns and requirements.

Remember:

```text
SQL
→ relationships + transactions

NoSQL
→ flexible models + distributed scale
```

---

# Database Indexes

Without index:

```sql
SELECT *
FROM users
WHERE email = 'abc@example.com';
```

Database may scan:

```text
Row 1
Row 2
Row 3
...
Row 10,000,000
```

This is:

```text
Full table scan
```

Index creates a structure that helps locate data quickly.

Example:

```text
Index on email

abc@example.com → row 92382
```

Instead of scanning millions of rows.

Usually implemented using:

```text
B-Tree / B+ Tree
```

Complexity roughly:

```text
Without index → O(n)

With tree index → O(log n)
```

But indexes are not free.

More indexes mean:

```text
Faster reads

but

slower writes
more storage
```

Because every INSERT/UPDATE may need index updates.

Remember:

```text
Index = faster reads, more write/storage cost
```

---

# Database Sharding

Sharding = split data across multiple database servers.

Suppose:

```text
1 database
1 billion users
```

Too large.

Split:

```text
Shard 1
Users 1-1M

Shard 2
Users 1M-2M

Shard 3
Users 2M-3M
```

Each server stores part of the data.

Example:

```text
User ID % 3
```

```text
user 100 → shard 1
user 101 → shard 2
user 102 → shard 0
```

Benefits:

```text
More storage
More write capacity
More read capacity
Horizontal scaling
```

Problems:

```text
Cross-shard joins
Cross-shard transactions
Rebalancing
Hot shards
Choosing shard key
```

Very important:

```text
Bad shard key
→ uneven traffic
→ hot shard
```

Remember:

```text
Sharding
= split data across databases
```

---

# Data Replication

Replication = keep copies of the same data on multiple database servers.

Example:

```text
        Primary
       /       \
Replica 1     Replica 2
```

Writes:

```text
Client → Primary
```

Replicas copy changes.

Reads can sometimes go to replicas:

```text
Client → Replica 1
Client → Replica 2
```

Benefits:

```text
Higher availability
Read scaling
Disaster recovery
Failover
```

Problem:

Replication may have delay.

Example:

```text
Primary:
balance = 500

Replica:
balance = 1000
```

for a very short time.

This is:

```text
Replication lag
```

Remember difference:

```text
Replication
= copy same data

Sharding
= split different data
```

---

# Database Scaling

Start:

```text
App
 |
DB
```

First improve database itself:

```text
Indexes
Query optimization
Connection pooling
Caching
```

Then vertical scaling:

```text
8 GB RAM
   ↓
64 GB RAM
```

Then replication:

```text
          Primary
         /      \
Read Replica   Read Replica
```

Writes:

```text
→ Primary
```

Reads:

```text
→ Replicas
```

If still too large:

```text
Shard 1
Shard 2
Shard 3
```

Common scaling journey:

```text
1. Optimize queries
2. Add indexes
3. Add caching
4. Scale vertically
5. Add read replicas
6. Partition/shard data
```

Do not jump straight to sharding.

Sharding adds significant complexity.

---

# Database Types

You do not need to memorize 15 database types for interviews.

Know these major ones.

## Relational

```text
PostgreSQL
MySQL
```

Use:

```text
Transactions
Relationships
Structured data
```

---

## Document

```text
MongoDB
```

Stores JSON-like documents.

Use:

```text
Flexible schemas
Product catalogs
Content
User profiles
```

---

## Key-Value

```text
Redis
DynamoDB
```

Think:

```text
key → value
```

Example:

```text
session:123 → {...}
```

Use:

```text
Caching
Sessions
Fast lookups
```

---

## Wide Column

```text
Cassandra
ScyllaDB
```

Great for:

```text
Huge distributed datasets
High write throughput
Time-series-like workloads
```

---

## Graph

```text
Neo4j
```

Data:

```text
Ranjeet ─ FRIEND → Rajat
```

Great for:

```text
Social networks
Recommendations
Fraud detection
Relationships
```

---

## Time-Series

```text
InfluxDB
TimescaleDB
```

Data indexed heavily by time.

Use:

```text
Metrics
IoT
Monitoring
Stock prices
```

---

## Search Engine

```text
Elasticsearch
OpenSearch
```

Use:

```text
Full-text search
Logs
Analytics
```

Interview rule:

```text
Choose database based on access pattern,
not popularity.
```

---

# Bloom Filters

Bloom Filter answers:

```text
"Could this item exist?"
```

It is a probabilistic data structure.

Suppose database contains:

```text
apple
banana
orange
```

Before querying disk:

```text
Bloom Filter
```

Ask:

```text
Does mango exist?
```

Bloom filter can say:

```text
Definitely NO
```

Then:

```text
Don't query database
```

Or it might say:

```text
Maybe YES
```

Then check database.

Important property:

```text
False positives possible.

False negatives are not.
```

Meaning:

```text
Bloom says NO
→ definitely not present

Bloom says YES
→ maybe present
```

Used in systems like:

```text
Cassandra
HBase
Databases
Caching layers
```

Helps avoid expensive disk lookups.

Remember:

```text
Bloom Filter:

NO = definitely no
YES = maybe yes
```

---

# Database Architectures

There are several common architectures.

## Single Database

```text
App
 |
DB
```

Simple.

Good initially.

Problem:

```text
DB becomes SPOF
```

---

## Primary-Replica

```text
             Primary
            /      \
       Replica    Replica
```

Writes:

```text
→ Primary
```

Reads:

```text
→ Replicas
```

Good for:

```text
Read scaling
Availability
```

---

## Primary-Primary

```text
DB A ⇄ DB B
```

Both accept writes.

Benefits:

```text
High availability
Multi-region writes
```

But much harder because of:

```text
Conflict resolution
Consistency
Replication
```

Example:

```text
DB A:
name = "Ranjeet"

DB B at same time:
name = "Raj"
```

Which wins?

That's the hard part.

---

## Sharded Architecture

```text
Application
     |
Shard Router
     |
 ┌───┼───┐
DB1 DB2 DB3
```

Each database stores different data.

Good for:

```text
Huge datasets
High write scale
```

---

## Sharding + Replication

Common large-scale architecture:

```text
             Shard 1
          Primary
          /     \
      Replica Replica

             Shard 2
          Primary
          /     \
      Replica Replica

             Shard 3
          Primary
          /     \
      Replica Replica
```

Now you get:

```text
Sharding
→ scalability

Replication
→ availability
```

---

# Important Differences

```text
API Gateway vs Load Balancer

API Gateway
→ routes APIs/services
→ auth/rate limits/API policies

Load Balancer
→ distributes load across servers
```

```text
WebSocket vs Webhook

WebSocket
→ persistent two-way connection

Webhook
→ event triggers HTTP request
```

```text
Replication vs Sharding

Replication
→ same data on multiple machines

Sharding
→ different data on multiple machines
```

```text
Index vs Cache

Index
→ helps database find rows faster

Cache
→ stores result/data outside main database
```

```text
SQL vs NoSQL

SQL
→ relational, strong transactions

NoSQL
→ multiple non-relational models,
often optimized for scale/access patterns
```

```text
ACID Consistency
≠
CAP Consistency
```

This is important.

ACID consistency:

```text
Database rules remain valid
```

CAP consistency:

```text
Every distributed node sees the latest value
```

---

# Interview cheat sheet

| Concept | Remember |
|---|---|
| API | Interface between systems |
| API Gateway | Entry point for backend APIs |
| REST | Resource-based endpoints |
| GraphQL | Client chooses response fields |
| WebSocket | Persistent bidirectional connection |
| Webhook | Event-based HTTP callback |
| Idempotency | Safe retries |
| Rate Limiting | Control request frequency |
| ACID | Transaction guarantees |
| SQL | Relational database |
| NoSQL | Non-relational database models |
| Index | Faster lookup |
| Sharding | Split data |
| Replication | Copy data |
| DB Scaling | Optimize → replicas → shard |
| Bloom Filter | NO definite, YES maybe |
| Primary-Replica | Write primary, read replicas |

The database relationships worth remembering most are:

```text
More reads
   ↓
Cache + Read Replicas

More data / writes
   ↓
Sharding

Need availability
   ↓
Replication + Failover

Slow queries
   ↓
Indexes + Query Optimization

Need safe transactions
   ↓
ACID

Need to avoid unnecessary disk lookup
   ↓
Bloom Filter
```


---

# Caching Fundamentals

## 1. Caching 101

Cache = temporary fast storage used to avoid repeatedly doing expensive work.

Without cache:

```text
Client
  |
API
  |
Database
```

Every request hits the database.

Example:

```text
GET /products/123
```

If 100,000 users request the same product:

```text
Database gets 100,000 queries
```

With cache:

```text
Client
  |
API
  |
Cache
  |
Database
```

Flow:

```text
Request product 123
      |
Check cache
      |
   ┌──┴──┐
 Found  Not Found
   |        |
Return    Query DB
            |
         Save cache
            |
          Return
```

Example:

```text
Cache:

product:123 → {
  name: "iPhone",
  price: 70000
}
```

Next request:

```text
product:123
   ↓
Cache HIT
   ↓
Return immediately
```

Important terms:

```text
Cache Hit
→ data found in cache

Cache Miss
→ data not found in cache
```

Benefits:

```text
Lower latency
Less DB load
Higher throughput
Lower infrastructure cost
```

Remember:

```text
Cache = trade memory for speed
```

---

# 2. Caching Strategies

The most important strategies are:

```text
Cache Aside
Read Through
Write Through
Write Back
Write Around
```

## Cache Aside

Most common.

Application itself manages the cache.

Read:

```text
App
 |
Check Redis
 |
 ├─ HIT → return
 |
 └─ MISS
      |
      DB
      |
   save Redis
      |
    return
```

Pseudo code:

```js
const cached = await redis.get(`user:${id}`);

if (cached) {
  return JSON.parse(cached);
}

const user = await db.users.findById(id);

await redis.set(`user:${id}`, JSON.stringify(user));

return user;
```

Used heavily with Redis.

Remember:

```text
Cache Aside
= app checks cache first
```

Problem:

Data can become stale.

---

## Read Through

Application talks to cache only.

```text
App
 |
Cache
 |
 ├─ HIT → return
 |
 └─ MISS
      |
      Cache fetches DB
```

Difference:

```text
Cache Aside
→ application loads DB

Read Through
→ cache layer loads DB
```

---

## Write Through

When data changes:

```text
App
 |
Cache
 |
Database
```

Write is stored in both before returning success.

Example:

```text
UPDATE user
   |
write cache
   |
write DB
   |
return success
```

Benefit:

```text
Cache stays fresh
```

Problem:

```text
Writes are slower
```

---

## Write Back / Write Behind

Write to cache first.

```text
App
 |
Cache
 |
return success

later
 |
Database
```

Example:

```text
write cache
    ↓
return immediately
    ↓
DB updated asynchronously
```

Benefit:

```text
Very fast writes
```

Risk:

```text
Cache crashes before DB update
→ data may be lost
```

---

## Write Around

Writes bypass cache.

```text
App
 |
Database

Cache unchanged
```

Later read causes:

```text
Cache miss
→ DB
→ populate cache
```

Useful when written data may not be read soon.

---

# Easy strategy comparison

| Strategy | Main idea |
|---|---|
| Cache Aside | App manages cache |
| Read Through | Cache loads DB |
| Write Through | Cache + DB updated together |
| Write Back | Cache first, DB later |
| Write Around | Write directly to DB |

For interviews, Cache Aside is the most important.

---

# 3. Cache Invalidation

This is one of the hardest caching problems.

Suppose:

```text
DB:
price = ₹100

Cache:
price = ₹100
```

Admin updates DB:

```text
DB:
price = ₹120
```

But cache still has:

```text
₹100
```

Now users get stale data.

Solution:

```text
Update DB
   |
Delete cache entry
```

Next request:

```text
Cache MISS
   |
Database ₹120
   |
Cache ₹120
```

Common pattern:

```text
1. Update DB
2. Delete cache
```

You will often hear:

```text
"There are only two hard things in computer science:
cache invalidation and naming things."
```

The important point is simply:

```text
Cache invalidation
= keeping cached data synchronized with source data
```

---

# 4. TTL

TTL = Time To Live.

Example:

```text
product:123
TTL = 5 minutes
```

After 5 minutes:

```text
cache entry expires
```

Then next request fetches fresh data.

Example Redis:

```text
SET product:123 {...} EX 300
```

TTL:

```text
300 seconds
```

Trade-off:

```text
Long TTL
→ fewer DB queries
→ more stale data

Short TTL
→ fresher data
→ more DB queries
```

---

# 5. Cache Eviction Policies

Cache memory is limited.

Suppose cache can hold only:

```text
3 items
```

Currently:

```text
A
B
C
```

Now D arrives.

Something must be removed.

That decision is eviction.

---

## LRU

LRU = Least Recently Used.

Remove item that hasn't been used for the longest time.

Example:

```text
Cache:
A
B
C
```

Recent accesses:

```text
A → just used
C → just used
B → long time ago
```

D arrives:

```text
Remove B
```

Result:

```text
A
C
D
```

Very common.

Remember:

```text
LRU
= remove least recently used
```

---

## LFU

LFU = Least Frequently Used.

Remove the item used the fewest times.

Example:

```text
A → 100 accesses
B → 2 accesses
C → 50 accesses
```

D arrives:

```text
remove B
```

Remember:

```text
LRU → recency
LFU → frequency
```

---

## FIFO

First In First Out.

Oldest inserted item gets removed.

```text
A entered first
B
C
```

D arrives:

```text
remove A
```

Simple but not always smart.

---

## Random

Remove random entry.

Surprisingly useful in some cases because it is extremely cheap.

---

## TTL-based eviction

Entries expire automatically after time.

```text
user:123
expires in 10 min
```

---

# Important eviction comparison

```text
LRU
→ not used recently

LFU
→ not used frequently

FIFO
→ oldest inserted

TTL
→ expired by time
```

LRU is the most important one for interviews.

---

# 6. Distributed Caching

Single cache:

```text
App Servers
    |
  Redis
```

Problem:

```text
Redis memory limit
Redis becomes SPOF
```

Distributed cache:

```text
             Cache 1
           /
App ───── Cache 2
           \
             Cache 3
```

Data is spread across multiple cache nodes.

Example:

```text
user:1 → Cache A
user:2 → Cache C
user:3 → Cache B
```

How do we determine which cache?

Often:

```text
Consistent Hashing
```

Remember previous concept:

```text
hash(key)
   ↓
place on hash ring
   ↓
choose cache server
```

Benefits:

```text
More memory
Higher throughput
Horizontal scaling
Fault tolerance
```

Examples:

```text
Redis Cluster
Memcached
```

---

# Distributed Cache Problem: Hot Keys

Suppose:

```text
"Virat Kohli profile"
```

is requested millions of times.

If:

```text
profile → Cache Server 2
```

then Cache Server 2 may get overloaded.

This is called:

```text
Hot Key
```

Solutions:

```text
replicate hot keys
local caching
request coalescing
CDN
split traffic
```

---

# Cache Stampede

Suppose popular cache entry expires.

```text
product:123 expires
```

Immediately:

```text
10,000 requests arrive
```

All see:

```text
Cache MISS
```

All hit database:

```text
10,000 DB queries
```

This is:

```text
Cache Stampede
```

Solution:

Only one request rebuilds cache.

```text
Request 1
   |
get lock
   |
query DB
   |
populate cache

Other requests wait
```

Other techniques:

```text
TTL jitter
locking
stale-while-revalidate
request coalescing
```

---

# Cache Penetration

Client asks repeatedly for data that does not exist.

Example:

```text
GET /users/999999999
```

Cache:

```text
MISS
```

DB:

```text
NOT FOUND
```

Repeated attack:

```text
Cache miss
DB lookup
Cache miss
DB lookup
...
```

Solution:

Cache negative results:

```text
user:999999999 → NOT_FOUND
```

Or use:

```text
Bloom Filter
```

Remember:

```text
Bloom Filter says definitely not present
→ skip DB
```

---

# 7. CDN

CDN = Content Delivery Network.

CDN is basically geographically distributed caching.

Without CDN:

```text
User in India
       |
       |
       |
Server in USA
```

High latency.

With CDN:

```text
                   Origin Server
                        |
             ┌──────────┼──────────┐
             |          |          |
         Mumbai CDN  London CDN  US CDN
             |
         India User
```

User gets content from nearby CDN server.

Usually caches:

```text
Images
Videos
CSS
JavaScript
Fonts
Static files
Downloads
```

Example:

```text
example.com/image.jpg
```

First request:

```text
User
 |
CDN MISS
 |
Origin Server
 |
CDN stores image
 |
User
```

Next request:

```text
User
 |
CDN HIT
 |
image returned
```

Examples:

```text
Cloudflare
CloudFront
Fastly
Akamai
```

Remember:

```text
Redis
→ cache near application

CDN
→ cache near users
```

---

# Cache Layers in a Real System

A large application may have multiple cache layers:

```text
User
 |
Browser Cache
 |
CDN
 |
Load Balancer
 |
Application
 |
Local Memory Cache
 |
Redis
 |
Database
```

So request might be satisfied at any layer.

```text
Browser cache
↓ miss

CDN
↓ miss

Redis
↓ miss

Database
```

Goal:

```text
Avoid expensive work as early as possible
```

---

# Asynchronous Communication

Now move from:

```text
Request → wait → response
```

to:

```text
Send work
   |
continue doing something else
```

This is asynchronous processing.

Example:

User signs up.

Bad:

```text
POST /signup
   |
Create user
   |
Send email
   |
Generate analytics
   |
Notify CRM
   |
Generate profile
   |
Return response
```

Could take seconds.

Better:

```text
POST /signup
   |
Create user
   |
Publish event
   |
Return response
```

Then background consumers handle:

```text
Email
Analytics
CRM
Notifications
```

---

# 8. Message Queues

Message Queue = messages wait in a queue until consumers process them.

Example:

```text
Producer
   |
   ↓
Queue
   |
   ↓
Consumer
```

Suppose user uploads video.

```text
Upload API
   |
video-processing-job
   |
Queue
   |
Video Worker
```

API doesn't wait for video processing.

It can return:

```text
202 Accepted
```

Worker handles it later.

---

## Queue example

Messages:

```text
Job 1
Job 2
Job 3
Job 4
```

Queue:

```text
Front

Job 1
Job 2
Job 3
Job 4

Back
```

Consumer:

```text
takes Job 1
processes
acknowledges
```

Then next.

---

# Why use queues?

## Decoupling

Without:

```text
Order Service
     |
Email Service
```

If email service is down:

```text
Order may fail
```

With queue:

```text
Order Service
     |
Queue
     |
Email Service
```

Email can recover later.

---

## Traffic spikes

Suppose normally:

```text
100 orders/sec
```

Suddenly:

```text
10,000 orders/sec
```

Queue buffers requests.

```text
10,000 messages
      |
     Queue
      |
workers consume gradually
```

---

## Retry

If consumer fails:

```text
Message
   |
Consumer fails
   |
retry
```

After too many failures:

```text
Dead Letter Queue
```

---

# Dead Letter Queue

DLQ = place for messages that repeatedly fail.

Example:

```text
Main Queue
   |
message
   |
Consumer
   |
fails 5 times
   |
DLQ
```

Then engineers can inspect it.

Remember:

```text
DLQ
= failed messages that need investigation/reprocessing
```

---

# Message Delivery Guarantees

Very important interview concept.

## At-most-once

```text
Message processed 0 or 1 times
```

No duplicates.

But message may be lost.

---

## At-least-once

```text
Message processed 1 or more times
```

No message loss generally.

But duplicates can happen.

Therefore consumers should be:

```text
idempotent
```

Example:

```text
payment-job-123
```

If processed twice:

```text
shouldn't charge twice
```

---

## Exactly-once

Ideally:

```text
processed exactly once
```

Very difficult in distributed systems.

Usually achieved by combining:

```text
idempotency
transactions
deduplication
careful processing semantics
```

Remember:

```text
At-most-once
→ may lose

At-least-once
→ may duplicate

Exactly-once
→ difficult/expensive
```

---

# 9. Pub/Sub

Pub/Sub = Publisher publishes event to a topic, and multiple subscribers receive it.

Example:

```text
                   Email Service
                  /
Order Service → OrderCreated
                  \
                   Analytics Service
                    \
                     Inventory Service
```

Order service publishes:

```text
OrderCreated
```

Subscribers:

```text
Email Service
Inventory Service
Analytics Service
Notification Service
```

Each receives the event independently.

---

# Queue vs Pub/Sub

This is very important.

Message Queue:

```text
Producer
   |
Queue
   |
 ┌─┼─┐
W1 W2 W3
```

Usually one message is processed by one consumer.

Example:

```text
Job 123
→ Worker 2
```

Pub/Sub:

```text
Publisher
   |
Topic
   |
 ┌─┼─────┐
A  B     C
```

Same event goes to multiple subscribers.

Example:

```text
OrderCreated

→ Email
→ Analytics
→ Inventory
```

Remember:

```text
Queue
→ one job should be handled once

Pub/Sub
→ one event should notify many systems
```

---

# Pub/Sub Example

User registers.

Publish:

```text
UserCreated
```

Then:

```text
UserCreated
    |
    ├── Welcome Email
    ├── Analytics
    ├── Recommendation Engine
    └── CRM
```

User service doesn't need to know about these services.

That's:

```text
Loose coupling
```

---

# Examples of Messaging Technologies

Common systems:

```text
Kafka
RabbitMQ
Amazon SQS
Google Pub/Sub
Apache Pulsar
Redis Streams
```

Very simplified:

```text
SQS
→ queue-oriented

RabbitMQ
→ queues/routing

Kafka
→ distributed event log / streaming

Google Pub/Sub
→ pub/sub service
```

---

# Kafka Mental Model

Kafka is slightly different from a traditional queue.

Think:

```text
Producer
   |
Topic
   |
Partition 0: [1][2][3][4]
Partition 1: [5][6][7][8]
   |
Consumers
```

Kafka keeps messages for a configured retention period.

Consumer tracks:

```text
offset
```

Example:

```text
Messages:

0 1 2 3 4 5 6

Consumer offset = 4
```

Meaning consumer has processed up to that position.

Kafka is great for:

```text
Event streaming
Logs
Analytics pipelines
CDC
High-throughput events
```

---

# 10. Change Data Capture - CDC

CDC = capture database changes and send them to other systems.

Suppose database changes:

```sql
UPDATE users
SET email = 'new@example.com'
WHERE id = 123;
```

Instead of application manually notifying everyone:

```text
Database
   |
CDC
   |
Event Stream
```

CDC captures:

```text
User 123 updated
old email → new email
```

Then sends it to:

```text
Kafka
```

Consumers receive it.

```text
Database
   |
CDC
   |
Kafka
   |
 ┌─┼────────┐
Search   Analytics   Cache
```

---

# Why CDC is useful

Suppose you have:

```text
PostgreSQL
```

And need data in:

```text
Elasticsearch
Data Warehouse
Analytics
Redis
```

Without CDC:

```text
Application must update everything
```

Example:

```text
Update PostgreSQL
Update Elasticsearch
Update analytics
Update cache
```

Problem:

```text
What if Elasticsearch update fails?
```

With CDC:

```text
App
 |
PostgreSQL
 |
CDC
 |
Kafka
 |
 ├── Elasticsearch
 ├── Analytics
 └── Cache
```

Database becomes the source of truth.

---

# How CDC usually works

Databases already maintain transaction logs.

Examples:

```text
PostgreSQL
→ WAL

MySQL
→ Binlog
```

CDC reads these logs.

Example:

```text
Database transaction

INSERT user 123
      |
      ↓
Transaction Log
      |
      ↓
CDC Connector
      |
      ↓
Kafka
```

Tools:

```text
Debezium
Kafka Connect
AWS DMS
```

---

# CDC vs Pub/Sub

Pub/Sub:

```text
Application explicitly publishes:

OrderCreated
```

CDC:

```text
Database change automatically becomes event
```

Example:

```text
Pub/Sub:

Order Service
    |
publish OrderCreated
```

vs

```text
CDC:

orders table INSERT
      |
CDC detects
      |
publishes change
```

---

# CDC Important Limitation

CDC tells you:

```text
row changed
```

but may not tell you:

```text
why it changed
```

Example:

```text
status:
pending → completed
```

CDC knows the data changed.

But business event might actually be:

```text
PaymentCompleted
```

These are not always the same thing.

So sometimes explicit domain events are better.

---

# Full Example: E-commerce Order

User places order:

```text
Client
 |
POST /orders
 |
Order Service
 |
Database
```

Then async processing:

```text
Order Service
    |
OrderCreated
    |
Message Broker
    |
    ├── Payment Service
    ├── Inventory Service
    ├── Email Service
    └── Analytics
```

Caching:

```text
Product requests
      |
     CDN
      |
Application
      |
Redis
      |
Database
```

CDC:

```text
Orders DB
   |
CDC
   |
Kafka
   |
Data Warehouse
```

Now concepts connect:

```text
Cache
→ reduce repeated work

Queue
→ process work asynchronously

Pub/Sub
→ notify many consumers

CDC
→ turn DB changes into events
```

---

# Important Differences

```text
Cache vs Database

Cache
→ fast temporary copy

Database
→ source of truth
```

```text
Redis Cache vs CDN

Redis
→ near backend

CDN
→ near users geographically
```

```text
Cache Aside vs Read Through

Cache Aside
→ application fetches DB

Read Through
→ cache fetches DB
```

```text
LRU vs LFU

LRU
→ least recently used

LFU
→ least frequently used
```

```text
Queue vs Pub/Sub

Queue
→ one consumer handles a job

Pub/Sub
→ multiple subscribers receive an event
```

```text
Webhook vs Pub/Sub

Webhook
→ service sends HTTP callback

Pub/Sub
→ event goes through broker/topic
```

```text
CDC vs Application Events

CDC
→ database change

Application Event
→ business event
```

---

# Interview Cheat Sheet

| Concept | Remember |
|---|---|
| Cache | Temporary fast copy |
| Cache Hit | Found in cache |
| Cache Miss | Not found |
| Cache Aside | App manages cache |
| TTL | Cache expiration time |
| LRU | Remove least recently used |
| LFU | Remove least frequently used |
| Distributed Cache | Cache spread across servers |
| Cache Stampede | Many misses hit DB together |
| CDN | Cache close to users |
| Message Queue | Async job processing |
| Pub/Sub | One event → many subscribers |
| DLQ | Repeatedly failed messages |
| At-least-once | Possible duplicates |
| Idempotency | Makes retries safe |
| CDC | Capture DB changes |
| Kafka | Distributed event log/stream |

The most useful decision tree to remember:

```text
Repeated expensive reads?
        ↓
      Cache

Static content for global users?
        ↓
       CDN

Slow work that user shouldn't wait for?
        ↓
      Queue

One event needed by many services?
        ↓
     Pub/Sub

Need DB changes streamed elsewhere?
        ↓
       CDC

Huge distributed cache?
        ↓
Consistent Hashing + Redis Cluster
```


---

# Distributed Systems and Microservices

The common theme in this section is this:

```text
One machine is easy.

Multiple machines introduce problems like:

- How do they know each other exists?
- How do they know another machine died?
- Who is the leader?
- How do they agree on data?
- How do they prevent two machines doing the same work?
- How do we understand what happened across 20 services?
```

That is what most distributed-system concepts are trying to solve.

---

# 1. Heartbeats

Why is it called a heartbeat?

Think about checking whether a person is alive by checking their heartbeat.

In distributed systems, servers do something similar.

A server periodically sends:

```text
"I'm alive"
```

messages.

Example:

```text
Server A          Server B

   heartbeat  ---->
   heartbeat  ---->
   heartbeat  ---->
   heartbeat  ---->

                X Server A crashes

   no heartbeat
   no heartbeat
```

After Server B has not received a heartbeat for some configured time:

```text
Server B concludes:

"Server A is probably unavailable."
```

Example:

```text
Heartbeat every: 5 seconds

Failure timeout: 15 seconds
```

If three heartbeats are missed:

```text
consider server unhealthy
```

Why not immediately declare it dead after one missed heartbeat?

Because networks are unreliable.

Maybe:

```text
packet delayed
temporary network issue
CPU paused briefly
server overloaded
```

So we usually wait for multiple missed heartbeats.

Used for:

```text
cluster membership
leader detection
service health
failover
distributed databases
```

Example:

```text
Primary DB
   |
heartbeats
   |
Replica

Primary stops sending
   ↓
Replica detects failure
   ↓
Failover can happen
```

Remember:

```text
Heartbeat
= periodic "I am alive" signal
```

---

# 2. Service Discovery

Suppose you have microservices:

```text
User Service
Order Service
Payment Service
```

The Order Service needs to call Payment Service.

You could hardcode:

```text
http://10.0.0.25:8080
```

But this doesn't work well in distributed systems.

Why?

Because services constantly change.

```text
Payment Service instance 1
10.0.0.25

crashes

new instance starts
10.0.0.91
```

Now Order Service still calls:

```text
10.0.0.25
```

which is dead.

Service Discovery solves this.

Instead of asking:

```text
Where is 10.0.0.25?
```

you ask:

```text
Where is Payment Service?
```

A registry keeps track of instances.

```text
Service Registry

payment-service:
    10.0.0.25:8080
    10.0.0.31:8080
    10.0.0.42:8080
```

Flow:

```text
Order Service
      |
      | Where is payment-service?
      ↓
Service Registry
      |
      | 10.0.0.31
      ↓
Payment Service
```

Why "discovery"?

Because services discover where other services currently live.

In Kubernetes, this often feels automatic.

For example:

```text
payment-service.default.svc.cluster.local
```

Kubernetes DNS resolves that service name.

Instead of managing IPs manually.

Two common styles:

```text
Client-side discovery

Client → Registry
       → chooses service
       → calls it
```

and:

```text
Server-side discovery

Client → Load Balancer
             |
             → Registry
             |
             → Service
```

Remember:

```text
Service Discovery
= find the current network location of a service
```

---

# 3. Consensus Algorithms

Consensus simply means:

```text
multiple machines agreeing on one decision
```

Why is this hard?

Imagine three database servers:

```text
A
B
C
```

They need to decide:

```text
Who is the leader?
```

A says:

```text
I should be leader
```

B says:

```text
I should be leader
```

C says:

```text
B should be leader
```

They need agreement.

That's consensus.

Another example:

```text
Current value:

balance = ₹1000
```

Machine A receives:

```text
balance = ₹500
```

Machine B receives another update.

Machines must agree on:

```text
which update happened first?
```

Consensus algorithms solve these kinds of problems.

Common algorithms:

```text
Raft
Paxos
```

You generally don't need to implement them in a system-design interview.

Understand the idea.

---

## Raft mental model

A cluster has:

```text
Leader
Followers
```

Example:

```text
        Leader A
       /        \
Follower B    Follower C
```

All writes go through leader.

Client:

```text
SET x = 10
```

Flow:

```text
Client
  |
  ↓
Leader A
  |
  ├── replicate → B
  |
  └── replicate → C
```

When enough nodes confirm:

```text
majority agrees
```

the operation becomes committed.

With 3 nodes:

```text
majority = 2
```

With 5 nodes:

```text
majority = 3
```

Why majority?

Suppose 5 servers:

```text
A B C D E
```

A network partition occurs:

```text
A B C    |    D E
```

The left side has 3.

The right has 2.

Only the majority side should be allowed to make authoritative decisions.

Otherwise both sides could make conflicting decisions.

This is related to avoiding:

```text
split brain
```

where two groups both think they are the leader.

Remember:

```text
Consensus
= distributed machines agreeing on one truth/decision
```

---

# 4. Distributed Locking

You already know a normal lock from programming.

Example:

```js
lock();
updateBalance();
unlock();
```

It stops two threads modifying something simultaneously.

But now imagine:

```text
Server A
Server B
Server C
```

All three application servers may process requests.

Suppose only one server should execute:

```text
Generate monthly invoice
```

Server A:

```text
start invoice generation
```

At the same time Server B:

```text
start invoice generation
```

Now invoices may be generated twice.

A normal in-memory mutex doesn't work because:

```text
Server A memory
!=
Server B memory
```

We need a lock visible to all machines.

That's a distributed lock.

Example with Redis conceptually:

```text
Server A:

SET invoice-lock locked NX EX 30
```

Meaning approximately:

```text
Create lock only if it doesn't already exist.

Expire after 30 seconds.
```

Server A gets lock:

```text
invoice-lock = ServerA
```

Server B tries:

```text
lock already exists
```

So B waits or gives up.

Flow:

```text
Server A ── acquire lock ──┐
                          │
                    Distributed Lock
                          │
Server B ── acquire ──────X
```

Why expiration?

Suppose Server A gets lock and crashes.

Without expiry:

```text
lock remains forever
```

No one can continue.

So locks usually have:

```text
lease / TTL
```

Important problem:

Distributed locking is much harder than local locking because of:

```text
network delays
server crashes
clock issues
lock expiry
split brain
```

For critical operations, don't casually assume:

```text
Redis SET NX
```

makes every distributed concurrency problem perfectly safe.

Remember:

```text
Distributed Lock
= allow only one distributed process to own a critical resource/work
```

---

# 5. Gossip Protocol

Why is it called gossip?

Imagine people at a party.

Person A tells Person B:

```text
"Rajat got promoted."
```

B tells C and D.

C tells E.

Eventually almost everyone knows.

Nobody had to announce it centrally.

That's exactly the idea.

Suppose a cluster has:

```text
A B C D E F
```

Server A learns:

```text
Server F is unhealthy
```

A does not necessarily broadcast directly to everyone.

Instead:

```text
A tells B and C

B tells D

C tells E

Eventually everyone learns.
```

Example:

```text
A ──> B ──> D
 \
  └──> C ──> E
```

Each node periodically exchanges information with a few random nodes.

Information spreads through the cluster.

Why use this instead of one central server?

Because a central membership server could become:

```text
SPOF
```

Gossip scales well because nodes communicate locally instead of one machine handling everything.

Used in systems such as:

```text
Cassandra
Dynamo-style systems
distributed membership systems
```

Gossip can spread:

```text
node health
cluster membership
configuration information
metadata
```

Tradeoff:

Information does not become known instantly.

It spreads gradually.

So it's often eventually consistent.

Remember:

```text
Gossip Protocol
= nodes spread cluster information by repeatedly sharing it with other nodes
```

---

# 6. Circuit Breaker

Why is it called circuit breaker?

Think of your house electrical system.

If something is drawing dangerous current:

```text
breaker trips
```

Electricity stops flowing.

This prevents bigger damage.

Same idea in microservices.

Suppose:

```text
Order Service
      |
      ↓
Payment Service
```

Payment Service is down.

Order Service keeps calling it:

```text
Request → timeout
Request → timeout
Request → timeout
Request → timeout
```

Every request waits 30 seconds.

Soon:

```text
Order Service threads exhausted
connections exhausted
users pile up
whole system starts failing
```

This is cascading failure.

Circuit breaker detects repeated failures.

After threshold:

```text
STOP calling Payment Service temporarily
```

Instead return failure immediately.

---

## Circuit breaker states

Three states are important.

```text
CLOSED
```

Normal.

Requests flow.

```text
Order → Payment
```

If failures become too high:

```text
OPEN
```

Calls are blocked.

```text
Order ─X→ Payment
```

After some recovery time:

```text
HALF-OPEN
```

Allow a few test requests.

If they succeed:

```text
CLOSED
```

again.

If they fail:

```text
OPEN
```

again.

Flow:

```text
CLOSED
   |
too many failures
   ↓
OPEN
   |
wait
   ↓
HALF-OPEN
   |
   ├── success → CLOSED
   |
   └── failure → OPEN
```

Remember:

```text
Circuit Breaker
= stop repeatedly calling a failing dependency
```

---

# 7. Disaster Recovery

Fault tolerance normally asks:

```text
Can my system survive individual component failures?
```

Disaster recovery asks something bigger:

```text
What if something catastrophic happens?
```

Examples:

```text
entire AWS region fails
data center burns
database is accidentally deleted
ransomware
major corruption
natural disaster
```

Suppose:

```text
Application: Mumbai region
Database: Mumbai region
Backups: Mumbai region
```

If entire region is unavailable:

```text
everything is gone/unreachable
```

Better:

```text
Mumbai Region
   |
replication / backups
   |
Singapore Region
```

If Mumbai has a disaster:

```text
fail over to Singapore
```

Two important interview terms:

## RPO

Recovery Point Objective.

Question:

```text
How much data can we afford to lose?
```

Example:

```text
RPO = 5 minutes
```

If disaster occurs at:

```text
10:00
```

you should recover data at least up to approximately:

```text
9:55
```

Maximum acceptable data loss:

```text
5 minutes
```

---

## RTO

Recovery Time Objective.

Question:

```text
How long can the service be unavailable?
```

Example:

```text
RTO = 30 minutes
```

After disaster:

```text
system should be running within 30 minutes
```

Easy memory:

```text
RPO
= how much DATA can we lose?

RTO
= how much TIME can we be down?
```

---

# 8. Distributed Tracing

Imagine request:

```text
GET /checkout
```

Your architecture:

```text
Frontend
   ↓
API Gateway
   ↓
Order Service
   ↓
Payment Service
   ↓
Inventory Service
   ↓
Database
```

User reports:

```text
Checkout takes 5 seconds.
```

Which service is slow?

Normal logs are scattered:

```text
Gateway logs
Order logs
Payment logs
Inventory logs
DB logs
```

Hard to connect them.

Distributed tracing gives one request an identifier:

```text
Trace ID = abc123
```

Every service propagates that ID.

```text
Gateway
trace abc123

Order
trace abc123

Payment
trace abc123

Inventory
trace abc123
```

Now you can see:

```text
Request abc123

Gateway        20ms
Order          50ms
Payment      4200ms
Inventory      80ms
```

Immediately:

```text
Payment Service is slow.
```

A trace usually contains smaller units called:

```text
spans
```

Example:

```text
Trace
└── Gateway span
    └── Order span
        ├── Payment span
        └── Inventory span
```

Tools/ecosystem:

```text
OpenTelemetry
Jaeger
Zipkin
Datadog
Dynatrace
```

Remember:

```text
Trace = entire request journey

Span = one operation inside that journey
```

---

# Architectural Patterns

# 9. Client-Server Architecture

This is the architecture most web developers already use.

```text
Client
   |
request
   ↓
Server
   |
response
   ↓
Client
```

Client could be:

```text
browser
mobile app
desktop application
```

Server provides:

```text
business logic
authentication
database access
APIs
```

Example:

```text
React Browser
      |
      ↓
Node/FastAPI Server
      |
      ↓
PostgreSQL
```

Why "client-server"?

Because roles are separated.

```text
Client asks for service.

Server provides service.
```

---

# 10. Microservices Architecture

Suppose you build an e-commerce application as one backend:

```text
E-Commerce App

Users
Orders
Payments
Inventory
Notifications
Search
```

All inside one application.

That's a:

```text
Monolith
```

Conceptually:

```text
                Monolith
         ┌─────────────────────┐
         │ Users               │
Client → │ Orders              │
         │ Payments            │
         │ Inventory           │
         │ Notifications       │
         └─────────────────────┘
```

Microservices split these business capabilities.

```text
              User Service
             /
Client → Gateway → Order Service
             \
              Payment Service
               \
                Inventory Service
```

Each service can often:

```text
deploy independently
scale independently
have its own codebase
possibly have its own database
```

Example:

Payment traffic is heavy.

You could run:

```text
Payment Service:
10 instances

User Service:
2 instances
```

without scaling the entire application.

Why "microservices"?

Not because every service must be tiny.

The idea is:

```text
small independently owned services around business capabilities
```

Benefits:

```text
independent deployment
independent scaling
team autonomy
fault isolation
technology flexibility
```

Costs:

```text
network failures
distributed transactions
service discovery
observability
deployment complexity
data consistency problems
more DevOps
```

Important system-design point:

```text
Microservices are not automatically better than monoliths.
```

For a small application:

```text
well-designed monolith
```

is often much simpler.

---

# 11. Serverless Architecture

Serverless does not mean:

```text
there are no servers
```

Servers obviously exist.

It means:

```text
you don't manage the servers yourself
```

Example AWS Lambda:

```text
Request
   |
API Gateway
   |
Lambda Function
```

You write:

```js
async function handler(event) {
    return {
        statusCode: 200,
        body: "Hello"
    };
}
```

Cloud provider handles:

```text
machines
runtime
scaling
replacement
infrastructure
```

You often pay based on:

```text
requests
execution duration
resources consumed
```

Good for:

```text
sporadic workloads
event handlers
webhooks
scheduled jobs
small APIs
image processing
```

Problems:

```text
cold starts
execution limits
vendor lock-in
harder debugging
cost at very high sustained traffic
```

Remember:

```text
Serverless
= cloud provider manages servers and scaling for your functions/services
```

---

# 12. Event-Driven Architecture

Event means:

```text
something happened
```

Examples:

```text
OrderCreated
PaymentCompleted
UserRegistered
PackageDelivered
```

Event-driven architecture builds systems around these events.

Example:

```text
Order Service
     |
OrderCreated
     |
Kafka / Broker
     |
 ┌───┼────────────┐
 ↓   ↓            ↓
Email Inventory Analytics
```

Notice the Order Service doesn't call:

```text
Email Service
Inventory Service
Analytics Service
```

directly.

It just announces:

```text
"An order was created."
```

Other services decide what to do.

This makes services loosely coupled.

---

## Why "Pub/Sub"?

This connects to the previous lesson.

Pub/Sub literally means:

```text
Publish / Subscribe
```

Publisher:

```text
publishes an event
```

Subscriber:

```text
subscribes to events it cares about
```

Example:

```text
Order Service
     |
PUBLISH:
OrderCreated
     |
   Topic
     |
 ┌───┼───────┐
 ↓   ↓       ↓
Email Inventory Analytics
 ^       ^       ^
SUBSCRIBERS
```

Order Service is the:

```text
Publisher
```

Email, Inventory and Analytics are:

```text
Subscribers
```

That's why it's called:

```text
Pub/Sub
```

---

# 13. Peer-to-Peer Architecture

Normal client-server:

```text
Clients
   |
Server
```

Server is central.

Peer-to-peer:

```text
A ↔ B
↕   ↕
C ↔ D
```

Each participant is a:

```text
peer
```

Peers can often act as both:

```text
client
and
server
```

Example BitTorrent.

Instead of:

```text
Everyone downloads file from one central server
```

users download pieces from each other.

```text
Peer A → piece 1 → B
Peer C → piece 2 → B
Peer D → piece 3 → B
```

Benefits:

```text
less central dependency
resource sharing
can scale naturally
```

Problems:

```text
security
trust
coordination
peer availability
data consistency
```

Examples:

```text
BitTorrent
blockchain networks
some file-sharing systems
```

---

# System Design Tradeoffs

The word tradeoff is extremely important.

There is rarely a perfect architecture.

Usually:

```text
Improving X makes Y worse.
```

System design is largely about choosing the right tradeoff.

---

# 14. Vertical vs Horizontal Scaling

## Vertical scaling

Make one machine stronger.

```text
8 CPU
16 GB RAM

↓

64 CPU
256 GB RAM
```

Why vertical?

Think upward:

```text
same machine gets bigger
```

Advantages:

```text
simple
no distributed-system complexity
```

Problems:

```text
hardware limit
expensive
single machine can fail
```

---

## Horizontal scaling

Add machines.

```text
Server 1

↓

Server 1
Server 2
Server 3
Server 4
```

Why horizontal?

Imagine machines next to each other horizontally.

Advantages:

```text
very large scale
fault tolerance
incremental growth
```

Problems:

```text
distributed system complexity
load balancing
consistency
network failures
```

Remember:

```text
Vertical
= bigger machine

Horizontal
= more machines
```

---

# 15. Concurrency vs Parallelism

These sound similar but aren't the same.

Concurrency means:

```text
multiple tasks make progress during the same period
```

Parallelism means:

```text
multiple tasks literally execute at the same instant
```

Imagine one chef.

Tasks:

```text
cook rice
cut vegetables
boil water
```

Chef:

```text
start rice
while rice cooks → cut vegetables
while water boils → prepare sauce
```

One chef switches between work.

That's concurrency.

Now imagine 3 chefs:

```text
Chef A → rice
Chef B → vegetables
Chef C → sauce
```

They literally work simultaneously.

That's parallelism.

In computing:

```text
Single CPU core
async tasks
→ concurrency
```

Multiple cores:

```text
Core 1 → Task A
Core 2 → Task B
```

→ parallelism.

Important:

```text
Concurrency is about managing multiple tasks.

Parallelism is about executing multiple tasks simultaneously.
```

Node.js is a good example.

JavaScript execution may be mostly one thread:

```text
Task A
Task B
Task C
```

but async I/O allows high concurrency.

---

# 16. Long Polling vs WebSockets

Normal polling:

```text
Client:
Anything new?

Server:
No.

Client:
Anything new?

Server:
No.
```

Many useless requests.

---

## Long Polling

Client sends:

```text
Anything new?
```

Server doesn't immediately respond.

It keeps request open.

```text
Client ───────────── request ───────> Server
                                     waits...
                                     waits...
                                     new message!
Client <──────────── response ───────
```

Client immediately opens another request.

So:

```text
request
wait
response

request
wait
response
```

Useful when WebSockets aren't available.

---

## WebSocket

Establish one persistent connection:

```text
Client ⇄ Server
```

Both can send data anytime.

No repeated HTTP requests.

Better for:

```text
chat
gaming
live collaboration
real-time dashboards
```

Comparison:

```text
Long Polling

HTTP request
wait
response
repeat
```

```text
WebSocket

one connection
continuous two-way communication
```

Tradeoff:

WebSockets require managing lots of long-lived connections.

---

# 17. Batch vs Stream Processing

Suppose you have 1 million transactions.

## Batch processing

Collect data first.

Process together later.

Example:

```text
Transactions during entire day
             |
             ↓
        12:00 midnight
             |
      process all data
```

Examples:

```text
nightly reports
payroll
monthly billing
data warehouse jobs
```

Why "batch"?

Because many items are processed as one batch.

---

## Stream processing

Process data as it arrives.

```text
Event 1 → process
Event 2 → process
Event 3 → process
```

Examples:

```text
fraud detection
live analytics
stock prices
monitoring
```

Example:

Credit card transaction occurs.

With batch:

```text
detect fraud tonight
```

Too late.

With streaming:

```text
transaction
     |
fraud engine
     |
detect immediately
```

Remember:

```text
Batch
= accumulated data processed later

Stream
= continuously process incoming data
```

---

# 18. Stateful vs Stateless

State means:

```text
information remembered between requests
```

Example state:

```text
logged-in session
shopping cart
current game state
```

---

## Stateful server

Suppose User A logs in.

Server 1 stores:

```text
session123 → Ranjeet
```

in its local memory.

Next request must reach:

```text
Server 1
```

because Server 2 doesn't know the session.

```text
User
 |
Server 1
contains session
```

This is stateful.

Problem when scaling:

```text
Server 1
Server 2
Server 3
```

Which one should receive the next request?

You may need:

```text
sticky sessions
```

---

## Stateless server

Server doesn't store user-specific session state locally.

Instead:

```text
User
 |
Server 1/2/3
 |
Redis / DB / token
```

Any server can process request.

Example JWT:

```text
request contains authentication information
```

So:

```text
Request 1 → Server A
Request 2 → Server C
Request 3 → Server B
```

works.

Why stateless is attractive:

```text
easier horizontal scaling
easier failover
simpler load balancing
```

Remember:

```text
Stateful
= server remembers client state

Stateless
= each request can be processed independently
```

---

# 19. Strong vs Eventual Consistency

Suppose:

```text
Primary DB
Replica A
Replica B
```

You update:

```text
name = "Ranjeet"
```

## Strong consistency

Immediately after successful write:

```text
every read should see Ranjeet
```

Conceptually:

```text
Write Ranjeet
     |
     ↓
Read
     |
Ranjeet
```

You don't get old data.

Important for things such as:

```text
bank balances
inventory reservation
some payment flows
```

---

## Eventual consistency

After write:

```text
Primary:
Ranjeet

Replica:
Raj
```

for a short period.

Eventually replication catches up:

```text
Primary:
Ranjeet

Replica:
Ranjeet
```

So the system promises:

```text
"If no more updates happen, eventually everyone will have the same value."
```

That's why it is called eventual consistency.

Good for cases where temporary stale data is acceptable.

Example:

```text
Instagram like count

1001
vs
1002
```

for a few seconds usually doesn't matter.

Tradeoff:

```text
Strong consistency
→ fresher data
→ often more coordination/latency

Eventual consistency
→ better availability/scalability
→ temporarily stale data
```

---

# 20. Read-Through vs Write-Through Cache

We covered these earlier, but the names are easier to understand this way.

## Read-through

Read goes "through" cache.

```text
Application
     |
READ
     ↓
Cache
     |
miss?
     |
Database
```

Cache handles loading missing data.

So:

```text
Application reads through cache.
```

---

## Write-through

Write goes "through" cache to storage.

```text
Application
     |
WRITE
     ↓
Cache
     |
     ↓
Database
```

Write is updated in cache and underlying database before operation completes.

So:

```text
Application writes through cache.
```

Tradeoff:

```text
Read-through
→ easy cached reads

Write-through
→ fresher cache, slower writes
```

---

# 21. Push vs Pull Architecture

The difference is:

```text
Who initiates getting the new data?
```

## Pull

Consumer asks:

```text
"Do you have anything for me?"
```

Example:

```text
Worker → Queue

Give me message.
```

Or:

```text
Client → Server

Any notifications?
```

Consumer controls the rate.

That's pull.

---

## Push

Producer/system sends data automatically.

```text
Server → Client

New notification!
```

Consumer didn't repeatedly ask.

Examples:

```text
Webhooks
push notifications
WebSockets
some pub/sub delivery models
```

Tradeoff:

```text
Pull
→ consumer controls pace
→ may introduce polling latency

Push
→ lower latency
→ consumer can become overwhelmed
```

---

# 22. REST vs RPC

REST is centered around:

```text
resources
```

Example:

```http
GET /users/123
POST /orders
DELETE /orders/10
```

You're basically saying:

```text
Give me resource 123.
Create an order.
Delete order 10.
```

---

RPC means:

```text
Remote Procedure Call
```

Procedure means function/method.

It feels like calling a function on another machine.

Example:

```text
createOrder(userId, products)
```

or:

```text
ChargeCreditCard(...)
```

Instead of thinking:

```text
What resource URL should I use?
```

you think:

```text
What remote function should I call?
```

Example gRPC service:

```protobuf
service PaymentService {
    rpc Charge(ChargeRequest)
        returns (ChargeResponse);
}
```

Client code conceptually:

```js
paymentService.charge(...)
```

But actual Payment Service might be on another server.

Why RPC?

Because it makes network communication look like calling a procedure.

REST often uses:

```text
HTTP + JSON
```

gRPC often uses:

```text
HTTP/2 + Protocol Buffers
```

gRPC benefits:

```text
fast
strong typing
compact binary messages
streaming
generated clients
```

REST benefits:

```text
simple
human readable
browser friendly
widely supported
```

Common architecture:

```text
Frontend
   |
REST
   |
Backend
   |
gRPC
   |
Internal microservices
```

---

# 23. Synchronous vs Asynchronous Communication

This is extremely important.

## Synchronous

Caller waits for result.

Example:

```text
Order Service
     |
     | Charge ₹500
     ↓
Payment Service
     |
     waits...
     |
     response
     ↓
Order Service continues
```

If Payment takes 3 seconds:

```text
Order waits 3 seconds
```

This creates direct dependency.

If Payment is down:

```text
Order request may fail
```

---

## Asynchronous

Caller sends work and continues.

```text
Order Service
     |
PaymentRequested
     ↓
Queue
```

Order Service doesn't wait.

Later:

```text
Payment Worker
     |
process payment
```

Benefits:

```text
decoupling
handles spikes
better fault isolation
```

But introduces:

```text
eventual consistency
more complexity
harder debugging
```

Think:

```text
Synchronous
= phone call

You call and wait for answer.
```

```text
Asynchronous
= WhatsApp message

You send it and continue your work.
Response may come later.
```

---

# 24. Latency vs Throughput

Latency answers:

```text
How long does ONE operation take?
```

Example:

```text
Request
   |
200 ms
   |
Response
```

Latency:

```text
200 ms
```

Throughput answers:

```text
How MANY operations can we process?
```

Example:

```text
10,000 requests/second
```

That's throughput.

Imagine highway.

```text
Latency:
How long one car takes to reach destination.

Throughput:
How many cars reach destination per minute.
```

You can have:

```text
Low latency
but
low throughput
```

Example:

One request completes in:

```text
5 ms
```

but system only allows one request at a time.

Or:

```text
High throughput
but high latency
```

Example:

System handles:

```text
100,000 jobs/sec
```

but each individual job waits:

```text
5 seconds
```

before completion.

---

# 25. The Most Important Distributed-System Relationship

A useful mental model is:

```text
Multiple Services
       |
       ├── How do they find each other?
       |       ↓
       | Service Discovery
       |
       ├── How do I know one died?
       |       ↓
       | Heartbeats
       |
       ├── How do nodes share cluster knowledge?
       |       ↓
       | Gossip
       |
       ├── How do nodes agree?
       |       ↓
       | Consensus
       |
       ├── How do I ensure one worker owns something?
       |       ↓
       | Distributed Lock
       |
       ├── What if another service keeps failing?
       |       ↓
       | Circuit Breaker
       |
       ├── How do I debug one request across services?
       |       ↓
       | Distributed Tracing
       |
       └── What if an entire region dies?
               ↓
         Disaster Recovery
```

And architectural choices:

```text
Simple centralized application
        ↓
Client-Server / Monolith


Independently deployed business services
        ↓
Microservices


React to business events
        ↓
Event-Driven Architecture


No server management
        ↓
Serverless


Nodes communicate directly
        ↓
Peer-to-Peer
```

The tradeoffs can be remembered as:

```text
More powerful machine?
Vertical Scaling

More machines?
Horizontal Scaling


Handle many tasks?
Concurrency

Actually execute simultaneously?
Parallelism


Process later in groups?
Batch

Process immediately as events arrive?
Streaming


Server remembers session?
Stateful

Any server can handle request?
Stateless


Latest value required?
Strong Consistency

Temporary old value acceptable?
Eventual Consistency


Caller waits?
Synchronous

Caller continues?
Asynchronous


Consumer asks for data?
Pull

Producer sends data?
Push


Resource-oriented API?
REST

Function-call-style communication?
RPC
```

The main thing to understand for system-design interviews is not just the definitions. When you choose something, be able to say why. For example:

```text
"I'll keep the API servers stateless so we can horizontally scale them
behind a load balancer."

"I'll use asynchronous messaging for email because the user shouldn't
wait for email delivery."

"I'll use strong consistency for seat reservation because two users
must not successfully reserve the same seat."

"I'll use eventual consistency for view counts because a slightly stale
count is acceptable."

"I'll add a circuit breaker around the payment provider so an outage
there doesn't exhaust our application workers."

"I'll use distributed tracing because a request passes through several
microservices and we need to identify where latency occurs."
```

Those explanations are much closer to what interviewers actually want than just giving definitions.
