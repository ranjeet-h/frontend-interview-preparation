# 10. Design Task Management System (Todoist/Asana)

[← Easy examples](index.md)

**Why interviewers ask:** Task apps combine CRUD, sharing permissions, notifications, and search — a realistic product backend without billion-user fanout. Interviewers look for normalized task model, project membership, and async side effects.

**Core insight:** Tasks belong to projects and users through membership; API serves fast reads for a user's task list; notifications and search indexing happen asynchronously off the write path.

**Architecture**

```txt
Client → API gateway
              ↓
    Task / Project / User services
              ↓
         Primary DB (tasks, projects, assignments, due dates)
              ↓ async events
         Queue → Notification worker (due reminders, assigns)
              → Search indexer (Elasticsearch)
              → Attachment service (S3)
```

- **Task service:** CRUD on tasks — title, status, assignee, due date, project id; validates user can access project.
- **Project service:** Projects, lists, sharing rules — membership table drives authorization checks.
- **User service:** Profiles, preferences, timezone for reminder scheduling.
- **Notification service:** Consumes events (assigned, due soon, comment) — email/push via queue; never blocks task save.
- **Search service:** Indexes task text and metadata for full-text filter across projects user can see.

**Key decisions**

- **Monolith vs services:** Modular monolith early — task + project tightly coupled; split notification/search when teams scale independently.
- **Optimistic UI sync:** Client can show pending edits; server is source of truth — version field or updated_at for conflict detection on concurrent edits.
- **Reminder scheduling:** Per-user timezone cron via job scheduler — fire reminders through notification queue, not polling DB every minute globally.

**Scale & failure:** Search index lag or notification queue backlog breaks perceived freshness first. Mitigation: prioritize near-due reminders, incremental search indexing, and read replicas for list views.

**Memory hook:** Tasks are rows with owners and deadlines — write fast to DB, fan out slow stuff (email, search) through a queue.
