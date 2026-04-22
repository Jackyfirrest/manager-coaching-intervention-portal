# Manager Coaching Intervention Portal

A manager-facing coaching workflow application for monitoring learning risk, reviewing diagnostic evidence, recording intervention notes, and unlocking restricted training modules with an audit trail.

This project was built as a lightweight full-stack prototype using Node.js, SQLite, HTML, CSS, and vanilla JavaScript. It intentionally avoids framework overhead so the core business rules, data model, and deployment path are easy to inspect.

## Project Overview

Organizations often need a reliable way to intervene when employees repeatedly fail required training or show declining quiz performance. This portal models that workflow from the manager's point of view:

1. Detect learning risk from quiz attempts.
2. Lock the affected learning module.
3. Route an alert to the responsible manager.
4. Show diagnostic context for the coaching conversation.
5. Require intervention notes before unlocking the module.
6. Preserve the unlock decision in an audit table.

## Core Capabilities

- **Team health dashboard**: Direct reports are grouped into `Locked`, `Warning`, and `Healthy` states.
- **Diagnostic view**: Managers can review module lock state, missed-question patterns, recent scores, and recommended coaching focus.
- **Manager notification routing**: Active locks create urgent manager-facing alerts.
- **Controlled unlock flow**: Locked modules cannot be unlocked until the manager records coaching notes.
- **Quiz result simulator**: Demo quiz submissions can trigger the same lock rules used by the application.
- **SQLite persistence**: Coaching interventions, lock states, quiz attempts, and notifications are stored relationally.
- **Docker and Render deployment**: The app can run locally, in Docker, or on Render as a small web service.

## Business Rules

A module is locked when either condition is met:

- The same agent fails the same module 3 times.
- The agent's 7-day average score for a module falls below 70%.

Team health states are derived from current learning risk:

- `Locked`: the agent has at least one active module lock.
- `Warning`: the agent has no active lock, but their latest score dropped from the previous score.
- `Healthy`: the agent has no active lock and no recent score-drop signal.

Unlocking requires manager notes with at least 20 characters. When the manager submits the intervention log, the app records the action in `CoachingInterventions`, marks the lock inactive, and resolves the notification.

## Demo Dataset

The seeded dataset is intentionally small and presentation-friendly:

- 5 direct reports
- 4 learning modules
- 2 active locked modules
- 1 warning case
- 2 healthy cases

This keeps the interface readable while still demonstrating filtering, diagnostics, alerts, unlocking, and simulated quiz submissions.

## Tech Stack

- **Runtime**: Node.js 20
- **Server**: Node built-in HTTP module
- **Database**: SQLite via the `sqlite3` CLI
- **Frontend**: HTML, CSS, vanilla JavaScript
- **Deployment**: Docker, Render Blueprint

No third-party npm packages are required.

## Architecture

```text
Browser UI
  |
  | fetch()
  v
Node HTTP server
  |
  | sqlite3 CLI
  v
SQLite database
```

The backend owns schema creation, demo seeding, trigger evaluation, module access checks, notification reconciliation, and unlock validation. The frontend renders the dashboard and calls the API endpoints exposed by the server.

## Data Model

Core tables:

- `TeamStructures`: maps agents to their current manager and branch.
- `ModuleStateLocks`: stores active and historical module locks.
- `CoachingInterventions`: stores manager notes and unlock timestamps.

Supporting tables:

- `Managers`, `Agents`, `Modules`: lookup records for the demo workflow.
- `QuizAttempts`: stores quiz scores used by the trigger engine.
- `FailedQuestions`: stores missed-question patterns and coaching focus.
- `Notifications`: stores manager-facing routed alerts.
- `AppSettings`: stores the seeded demo data version.

## API Summary

Representative endpoints:

- `GET /health`: health check endpoint.
- `GET /api/roster?manager_id=MGR001`: manager dashboard data.
- `GET /api/diagnostics?agent_id=A1001`: diagnostic details for one agent.
- `GET /api/module-access?agent_id=A1001&module_id=MOD-TRAVEL-DATA`: module access state.
- `POST /api/interventions`: records coaching notes and unlocks a module.
- `POST /api/simulate-quiz`: inserts a quiz attempt and evaluates lock rules.

## Local Setup

Requirements:

- Node.js 20 or newer
- SQLite CLI, `sqlite3`, available in PATH

Run the app:

```cmd
npm start
```

Open:

```text
http://localhost:3000
```

Run syntax checks:

```cmd
npm run check
```

Check server health while the app is running:

```cmd
npm run health
```

Expected response:

```json
{ "status": "ok" }
```

## Configuration

Optional environment variables can be placed in `.env`:

```env
PORT=3000
HOST=0.0.0.0
DB_PATH=manager_coaching.sqlite
SEED_DEMO_DATA=true
RESET_DEMO_DATA=false
```

- `PORT`: web server port.
- `HOST`: server bind address.
- `DB_PATH`: SQLite database path.
- `SEED_DEMO_DATA`: set to `false` to disable automatic demo seed creation.
- `RESET_DEMO_DATA`: set to `true` only when intentionally rebuilding the demo dataset.

The database does not reset on every startup. Demo data is inserted only when the database is empty, when the bundled demo dataset version changes, or when `RESET_DEMO_DATA=true`.

## Docker Deployment

Build the image:

```cmd
docker build -t manager-coaching-intervention-portal .
```

Run with persistent SQLite storage:

```cmd
docker volume create manager-coaching-data
docker run --rm -p 3000:3000 -v manager-coaching-data:/data manager-coaching-intervention-portal
```

The Docker image uses `/data/manager_coaching.sqlite` as the database path.

## Render Deployment

The repository includes `render.yaml` for Render Blueprint deployment.

Deployment flow:

1. Push this repository to GitHub.
2. In Render, create a new Blueprint.
3. Connect the GitHub repository.
4. Render builds the Docker image from `Dockerfile`.
5. The service starts with `npm start`.
6. Render checks `/health` for service health.

The included `render.yaml` is configured for Render Free tier:

```yaml
services:
  - type: web
    name: manager-coaching-intervention-portal
    env: docker
    plan: free
    autoDeploy: true
    healthCheckPath: /health
```

On Render Free tier, the SQLite file is created inside the service filesystem:

```text
/data/manager_coaching.sqlite
```

Render Free tier does not support persistent disks for this Blueprint configuration. That means the deployed demo can run successfully, but SQLite data may be recreated after redeploys or service restarts. For a production deployment that must preserve coaching records permanently, use one of these options:

- Upgrade the Render service and attach a persistent disk at `/data`.
- Move persistence to an external database such as Render Postgres.

Because `autoDeploy: true` is enabled in `render.yaml`, Render can redeploy automatically when new commits are pushed to the connected branch.

## CI/CD Consideration

This prototype already has basic continuous deployment through Render auto-deploy. For a production team workflow, the recommended next step would be a small CI check that runs before deployment:

```cmd
npm run check
```

That can be added with GitHub Actions if the project needs pull request validation. A larger CI pipeline is not necessary for the current prototype because there are no third-party dependencies or automated test suites yet.

## Repository Structure

```text
app.js              HTTP server, API routes, SQLite schema, seed data, lock rules
public/index.html   Main page layout
public/app.js       Frontend rendering, API calls, tabs, simulator, unlock form
public/styles.css   Responsive layout and visual design
Dockerfile          Container image definition
render.yaml         Render Blueprint deployment configuration
.env.example        Optional local configuration template
```
