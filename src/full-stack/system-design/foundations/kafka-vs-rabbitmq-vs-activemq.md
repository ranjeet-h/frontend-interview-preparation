# Kafka vs RabbitMQ vs ActiveMQ

## 1. Why This Exists — The Problem First

Your team needs async messaging. Someone says "use Kafka." Another says "we already have RabbitMQ." A legacy vendor contract includes ActiveMQ. You pick the wrong one and either over-engineer a log pipeline for simple task queues, or cram high-throughput event streaming through a broker that deletes messages on ack and can't replay last Tuesday.

These three tools all move messages between systems, but they were built for different jobs. Confusing them in an interview — or in architecture — signals you haven't internalized the trade-off between **durable event logs** and **traditional message brokers**.

## 2. The Analogy — Make It Obvious

Think of three ways to move packages:

**Kafka = the postal service's permanent tracking ledger.** Every package gets a serial number, scanned in order, stored in a warehouse for months. Multiple departments can look up the same shipment history anytime. Delivery is "here's everything since scan #4000" — you keep your own bookmark.

**RabbitMQ = a courier with a clipboard.** Package arrives, courier delivers to the right desk, recipient signs, package is gone. Great for "get this task to exactly one worker right now" with smart routing (priority lanes, dead-letter desks, topic-based sorting).

**ActiveMQ = the enterprise mailroom.** Handles many envelope formats (protocols), integrates with older corporate systems, reliable but heavier. Jack of several trades, not the throughput champion.

Same industry (messaging), different contracts about **retention, routing, and scale**.

## 3. How It Actually Works — The Full Explanation

### Apache Kafka

**Model:** Distributed commit **log**. Producers append records to partitioned topics. Brokers persist to disk with replication. Consumers pull and track offsets.

**Strengths:**

- Very high throughput (millions of msgs/sec with tuning)
- Durable, replayable message history
- Partition-based parallelism
- Multiple independent consumer groups on the same stream
- Built for event streaming and data pipelines

**Weaknesses:**

- Operational complexity (brokers, partitions, consumer groups, KRaft/ZooKeeper history)
- No rich per-message routing like AMQP exchanges
- Overkill for simple job queues
- Ordering only within a partition

**Best for:** event sourcing, log aggregation, real-time analytics pipelines, CDC feeds, microservice event buses where replay matters.

### RabbitMQ

**Model:** Traditional **message broker** implementing AMQP (and others). Producers publish to **exchanges**; exchanges route to **queues** via bindings; consumers consume from queues and **acknowledge** messages.

**Strengths:**

- Flexible routing (direct, topic, fanout, headers exchanges)
- Per-message acknowledgments and dead-letter queues
- Low-latency task distribution
- Mature ecosystem, easier for simple queue patterns
- Good at "work queue" semantics — message deleted after successful processing

**Weaknesses:**

- Not designed as a long-term event log — messages are consumed and removed
- Replay is awkward (not a first-class feature)
- Throughput lower than Kafka at extreme scale
- Queue-centric model doesn't naturally support "10 teams read the same firehose independently" the way Kafka consumer groups do

**Best for:** background jobs, order processing workers, RPC-style async tasks, complex routing rules, moderate throughput with strong delivery guarantees.

### Apache ActiveMQ

**Model:** Java-centric **enterprise message broker** supporting multiple protocols (OpenWire, AMQP, MQTT, STOMP). Exists in classic and Artemis flavors (Artemis is the modern redesign).

**Strengths:**

- Multi-protocol support — bridge old and new systems
- Enterprise features: clustering, failover, JMS standard compliance
- Familiar in Java/Spring legacy stacks
- Supports both queues (point-to-point) and topics (pub/sub)

**Weaknesses:**

- Generally lower throughput than Kafka for streaming workloads
- Less trendy in greenfield cloud-native stacks
- Operational model feels heavier than managed RabbitMQ or Kafka
- Not the default answer for new high-scale event platforms

**Best for:** enterprise integration, JMS-based Java applications, environments needing multiple messaging protocols in one broker.

### Side-by-side mechanics

| Dimension | Kafka | RabbitMQ | ActiveMQ |
|---|---|---|---|
| Core abstraction | Partitioned log | Exchange → queue | Queue / topic (JMS) |
| Message lifecycle | Retained by policy | Deleted after ack | Deleted after consumption (typical) |
| Replay | Native (reset offset) | Not native | Limited |
| Throughput | Very high | Moderate–high | Moderate |
| Routing flexibility | Topic + key only | Rich (AMQP) | Moderate |
| Consumer model | Pull, consumer groups | Push/pull, competing consumers | JMS listeners |
| Protocol | Binary Kafka protocol | AMQP, MQTT, etc. | OpenWire, AMQP, MQTT, STOMP |

## 4. Real Code — See It Working

### Kafka — fan-out via consumer groups

```javascript
// Producer writes once
await producer.send({ topic: 'payments', messages: [{ value: '{"id":1}' }] });

// Group A: fraud detection
const fraudConsumer = kafka.consumer({ groupId: 'fraud' });

// Group B: analytics — reads the SAME topic independently
const analyticsConsumer = kafka.consumer({ groupId: 'analytics' });
// Both groups keep separate offsets; message stays in the log
```

### RabbitMQ — route to one worker

```javascript
import amqp from 'amqplib';

const conn = await amqp.connect('amqp://localhost');
const ch = await conn.createChannel();
await ch.assertQueue('order-jobs', { durable: true });

// Publish to default exchange with routing key = queue name
ch.sendToQueue('order-jobs', Buffer.from(JSON.stringify({ orderId: 42 })), {
  persistent: true,
});

// Worker consumes, processes, acks — message is gone from queue
ch.consume('order-jobs', (msg) => {
  processOrder(JSON.parse(msg.content.toString()));
  ch.ack(msg); // remove from queue
});
```

### RabbitMQ — topic exchange routing

```javascript
await ch.assertExchange('events', 'topic', { durable: true });
await ch.assertQueue('email-alerts', { durable: true });
await ch.bindQueue('email-alerts', 'events', 'order.*');

// Only routing keys matching 'order.*' land in email-alerts
ch.publish('events', 'order.created', Buffer.from('...'));
```

### ActiveMQ (JMS-style, Java)

```java
Connection connection = factory.createConnection();
Session session = connection.createSession(false, Session.AUTO_ACKNOWLEDGE);
Queue queue = session.createQueue("ORDERS");
MessageProducer producer = session.createProducer(queue);
producer.send(session.createTextMessage("order-42"));
// Consumer on ORDERS queue receives and acknowledges
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: When would you choose Kafka over RabbitMQ?**

When you need high-throughput event streaming, durable retention, and replay. Multiple downstream systems must read the same event history at different speeds. Examples: activity feeds, audit logs, CDC pipelines, analytics. Kafka treats messages as a log, not disposable tasks.

**Q: When would you choose RabbitMQ over Kafka?**

When you need traditional message queuing: deliver a task to one worker, ack it, route with complex rules, use dead-letter queues for failures. Lower operational overhead for moderate scale. Examples: email sending workers, image processing jobs, order fulfillment tasks where replay is rare.

**Q: What is ActiveMQ and where does it fit?**

An enterprise Java message broker supporting JMS and multiple wire protocols. Fits legacy enterprise integration, especially Java/Spring shops already on JMS. For new cloud-native streaming, Kafka or RabbitMQ are more common choices — but ActiveMQ remains valid where protocol bridging and JMS compliance are requirements.

**Q: Can Kafka do what RabbitMQ does?**

Partially. You can build work-queue patterns with consumer groups, but you lack AMQP-style routing exchanges, per-message TTL nuances, and the "delete on ack" simplicity. Kafka compensates with log retention and replay — different contract.

**Q: Can RabbitMQ do what Kafka does?**

Poorly. RabbitMQ isn't designed for long-term log retention and replay at Kafka scale. Pub/sub exists (exchanges), but once messages are consumed and acked, they're gone. Replaying history requires a separate persistence layer.

**Q: How do delivery guarantees compare?**

All three can achieve at-least-once with proper ack configuration. Kafka adds exactly-once semantics with transactions (heavier). RabbitMQ has publisher confirms and consumer acks. ActiveMQ has JMS ack modes. The difference is less about "can they guarantee" and more about **what happens after delivery** — retained in log vs removed from queue.

**Q: What about ordering?**

Kafka: ordered within a partition. RabbitMQ: ordered in a single queue with one consumer; competing consumers break strict order. ActiveMQ: similar queue semantics. None give global ordering at massive parallel scale without careful design.

**Q: What would you use for a notification system?**

Depends. High-volume event fan-out ("every login event → analytics + security + email") → Kafka. "Send this one email now" task queue → RabbitMQ. Mixed enterprise Java stack with MQTT devices → possibly ActiveMQ.

**Q: How do you explain the choice in one sentence?**

Kafka for streaming and replay; RabbitMQ for task queues and routing; ActiveMQ for enterprise JMS and multi-protocol integration.

## 6. The Traps — What Goes Wrong

**Trap: "Kafka is always better because it's faster."**

Faster at streaming throughput. Slower to operate, wrong tool for simple job dispatch. A team running Kafka for 50 emails/hour is over-engineering.

**Trap: "RabbitMQ can't scale."**

It scales fine for most business workloads. It doesn't match Kafka's multi-million/sec log ingestion — but most products never need that.

**Trap: Treating ActiveMQ as obsolete.**

It's unfashionable in startup blogs, but banks and Java enterprises still run it. Dismissing it entirely sounds junior.

**Trap: Using message brokers as a database.**

Kafka's retention can tempt teams to skip proper storage. The log is for event transport and replay, not your source of truth for queryable state.

**Trap: Ignoring operational cost.**

Kafka clusters need partition planning, disk monitoring, consumer lag alerts. RabbitMQ is simpler but still needs HA and memory tuning. Pick the ops burden you can sustain.

**Trap: Assuming pub/sub is the same everywhere.**

Kafka pub/sub = independent consumer groups reading a retained log. RabbitMQ pub/sub = exchange fanout to queues, messages consumed and removed. Semantics differ.

## 7. Compare With Related Concepts

Beyond the three-way comparison:

| Tool | Positioning |
|---|---|
| **AWS SQS/SNS** | Managed, simpler, less throughput than self-hosted Kafka |
| **Redis Streams** | Lightweight stream log if already on Redis; not Kafka-scale |
| **NATS / JetStream** | Low-latency messaging; JetStream adds persistence |
| **Pulsar** | Kafka-like log + queue features; multi-tenancy native |

**Decision flow:**

1. Need replay + massive event history + multiple slow consumers? → **Kafka**
2. Need task queue + routing + ack-per-job? → **RabbitMQ**
3. Need JMS + legacy protocol bridge? → **ActiveMQ**
4. Need managed and simple on AWS? → **SQS/SNS**

## 8. 🧠 The Memory Hook — What Sticks

**Kafka** = permanent ledger, high throughput, replay by offset. **RabbitMQ** = smart courier, deliver task, sign, done. **ActiveMQ** = enterprise mailroom, many protocols, Java heritage. Streaming and history → Kafka. Work queues and routing → RabbitMQ. Legacy JMS integration → ActiveMQ. Don't use a ledger when you need a clipboard, or a clipboard when you need a warehouse.
