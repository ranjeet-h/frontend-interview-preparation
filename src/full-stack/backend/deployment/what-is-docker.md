# What is Docker

## Detailed explanation

What is Docker is a core backend deployment topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is docker by linking what it is, why it exists, and how it fails in production.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define the concept in backend terms.
- Explain the problem it solves.
- Show where it appears in real services.
- Call out security, performance, or reliability impact.
- Compare it with nearby concepts.

## 4. Visual / analogy

```txt
Request/API/service -> concept applied -> safer production behavior
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend deployment rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, what is docker affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is Docker?
- **The Engine Mechanism (Why it behaves this way):** Docker is a containerization platform that packages applications and their dependencies into isolated, portable containers. Containers share the host OS kernel but have isolated filesystems, networks, and processes. Docker uses images (read-only templates) to create containers (running instances). The Docker Engine manages the container lifecycle: build, run, stop, and remove. Docker Compose orchestrates multi-container applications.
- **The Unforgettable Mental Model:** The **Shipping Container**. Before shipping containers, cargo was loaded piece by piece, incompatible between ships and ports. Containers standardized everything — any ship, any port, same container. Docker does the same for applications.
- **The Trap:** Confusing Docker containers with virtual machines. Containers share the host OS kernel (lightweight), while VMs run a full guest OS (heavy). Containers start in seconds; VMs take minutes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Docker is a containerization platform that packages apps and dependencies into isolated, portable containers. Containers share the host OS kernel but have isolated filesystems, networks, and processes. Unlike VMs that run a full guest OS, containers are lightweight and start in seconds. Docker images are the templates; containers are the running instances. Docker Compose orchestrates multi-container apps."

#### Why does Docker matter in backend deployment?
- **The Engine Mechanism (Why it behaves this way):** Docker solves the "works on my machine" problem by ensuring the same environment across development, testing, and production. It eliminates dependency conflicts, simplifies deployment, enables microservice architectures, and provides isolation between services. Docker also enables reproducible builds, easy scaling, and consistent CI/CD pipelines.
- **The Unforgettable Mental Model:** The **Frozen Meal**. The meal (app) is prepared, sealed, and frozen (Docker image). Heat it in any microwave (any server) and it tastes the same. No cooking skills (server setup) required.
- **The Trap:** Putting everything in one container. Docker encourages one process per container. A container running the app, database, and Redis defeats the purpose of isolation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Docker solves the 'works on my machine' problem by ensuring identical environments across dev, test, and production. It eliminates dependency conflicts, simplifies deployment, and enables microservices. Each service runs in its own container with isolated dependencies. Docker also enables reproducible builds, easy scaling, and consistent CI/CD pipelines."

#### What is a simple Docker workflow?
- **The Engine Mechanism (Why it behaves this way):** The Docker workflow: (1) Write a Dockerfile defining the image (base image, dependencies, copy code, expose port, run command). (2) Build the image: `docker build -t myapp .`. (3) Run the container: `docker run -p 8000:8000 myapp`. (4) Push to a registry: `docker push myregistry/myapp`. (5) Deploy by pulling the image on the target server. Docker Compose simplifies multi-container setups with a docker-compose.yml file.
- **The Unforgettable Mental Model:** The **Bakery Recipe**. Write the recipe (Dockerfile), bake the cake (build image), serve it (run container), share the recipe (push to registry), and anyone can bake the same cake anywhere.
- **The Trap:** Not using .dockerignore. Without it, node_modules, .git, and other unnecessary files are copied into the image, bloating it.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The Docker workflow is: write a Dockerfile, build the image, run the container, push to a registry, and deploy. I use .dockerignore to exclude unnecessary files, multi-stage builds to reduce image size, and Docker Compose for multi-container local development. The image is the artifact that moves through dev, test, and production."

#### What edge cases can break Docker deployments?
- **The Engine Mechanism (Why it behaves this way):** Common edge cases include: image bloat (including unnecessary files), layer caching issues (COPY . before installing dependencies invalidates cache), permission issues (running as root in container), network configuration (containers can't reach each other), volume mounting differences (Linux vs. macOS file sharing), and signal handling (container not gracefully shutting down).
- **The Unforgettable Mental Model:** The **Packing for a Trip**. Pack everything (image bloat) and your suitcase is too heavy. Pack in the wrong order (layer caching) and you can't find anything. Pack without checking the weather (network config) and you're unprepared.
- **The Trap:** Running containers as root. If a container is compromised, the attacker has root access to the container. Use non-root users for security.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle edge cases like image bloat (use .dockerignore, multi-stage builds), layer caching (COPY package.json before COPY .), running as non-root user, network configuration between containers, and graceful shutdown (handle SIGTERM). Security is critical — containers should never run as root. I also test Docker images locally before deploying to catch configuration issues."

#### How does Docker affect frontend-backend coordination?
- **The Engine Mechanism (Why it behaves this way):** Docker enables frontend and backend teams to run the full stack locally with Docker Compose. The backend team provides a docker-compose.yml that includes the API, database, and any dependencies. The frontend team can start the entire backend stack with `docker-compose up` and develop against it. Docker also ensures the production environment matches local, reducing "works on my machine" issues.
- **The Unforgettable Mental Model:** The **LEGO Baseplate**. Docker Compose is the baseplate that both teams build on. The backend team provides the baseplate with the right studs (services), and both teams build their pieces on top.
- **The Trap:** Not providing a docker-compose.yml for local development. Without it, frontend developers must manually set up the backend environment.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Docker enables full-stack local development with Docker Compose. The backend team provides a docker-compose.yml with the API, database, and dependencies. The frontend team runs `docker-compose up` and has the entire backend stack ready. This eliminates environment setup friction and ensures local matches production. I always include a docker-compose.yml in backend repos for this reason."

#### What would you monitor for Docker health?
- **The Engine Mechanism (Why it behaves this way):** Key metrics include: container CPU and memory usage, container restart count, image size, layer cache hit rate, container uptime, and disk usage (dangling images, unused volumes). You should also monitor container logs for errors, network connectivity between containers, and the health check status of each container.
- **The Unforgettable Mental Model:** The **Fleet Management Dashboard**. You monitor each vehicle's (container) fuel (CPU), engine temperature (memory), mileage (uptime), maintenance needs (restarts), and cargo space (disk usage).
- **The Trap**: Not cleaning up unused Docker resources. Dangling images, stopped containers, and unused volumes consume disk space over time.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor container CPU/memory usage, restart count, image size, disk usage (dangling images, unused volumes), and health check status. I regularly clean up unused resources with `docker system prune`. Container restart count is a key indicator — frequent restarts suggest application crashes. I also monitor inter-container network connectivity and container logs for errors."

## 8. Active recall test

1. **What is Docker?**
   - **Explanation:** A containerization platform that packages apps and dependencies into isolated, portable containers. Containers share the host OS kernel but have isolated filesystems, networks, and processes.

2. **How do Docker containers differ from VMs?**
   - **Explanation:** Containers share the host OS kernel (lightweight, seconds to start). VMs run a full guest OS (heavy, minutes to start). Containers are process-level isolation; VMs are hardware-level isolation.

3. **What is the Docker workflow?**
   - **Explanation:** Write Dockerfile → build image (`docker build`) → run container (`docker run`) → push to registry (`docker push`) → deploy. Use .dockerignore and multi-stage builds.

4. **What edge cases break Docker deployments?**
   - **Explanation:** Image bloat, layer caching issues, running as root, network misconfiguration, volume mounting differences, and missing graceful shutdown handling.

5. **Why use multi-stage Docker builds?**
   - **Explanation:** Multi-stage builds separate build dependencies from runtime dependencies, producing smaller production images. The build stage compiles/installs; the runtime stage copies only what's needed.

6. **How does Docker help frontend-backend coordination?**
   - **Explanation:** Docker Compose lets frontend developers run the full backend stack locally with `docker-compose up`. Eliminates environment setup friction and ensures local matches production.

7. **What Docker metrics indicate health?**
   - **Explanation:** Container CPU/memory usage, restart count (frequent = crashes), image size, disk usage (dangling images, unused volumes), health check status, and inter-container network connectivity.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is Docker in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is Docker in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
