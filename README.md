# Manager Coaching Intervention Portal

A manager-facing coaching workflow prototype for monitoring learning risk, reviewing diagnostic evidence, recording intervention notes, and unlocking restricted training modules with an audit trail.

The project is intentionally lightweight: Node.js, SQLite, HTML, CSS, and vanilla JavaScript. There are no third-party npm packages, so the business rules, data model, and deployment path are easy to inspect.

## What This Solves

Managers need a reliable way to intervene when required learning modules show repeated failure or declining performance. This portal models that process end to end:

1. Quiz attempts create learning risk signals.
2. Risk rules lock the affected module.
3. The responsible manager receives an urgent alert.
4. The manager reviews missed-question patterns and recent scores.
5. The manager records offline coaching notes.
6. The app unlocks the module and stores the intervention record.

## Core Capabilities

- **Team health dashboard**: Direct reports are grouped into `Locked`, `Warning`, and `Healthy` states.
- **Diagnostic workspace**: The center panel shows module lock state, coaching gaps, score history, and unlock actions.
- **Manager alerts**: Active module locks generate manager-facing notifications.
- **Controlled unlock flow**: Unlocking requires manager notes and creates an audit record.
- **Quiz simulator**: Demo quiz results can trigger the same risk rules used by the application.
- **SQLite data model**: Locks, attempts, failed questions, notifications, and interventions are stored relationally.
- **Public demo protection**: Write actions remain interactive but are rate-limited and capped to protect the demo database.
- **CI/CD-ready deployment**: GitHub Actions runs checks; Render deploys after checks pass.

## Project Structure

```text
.
|-- .github/workflows/ci.yml   GitHub Actions workflow for CI checks
|-- public/
|   |-- index.html             Main application layout
|   |-- app.js                 Browser-side rendering and API calls
|   `-- styles.css             Responsive dashboard styling
|-- app.js                     HTTP server, API routes, schema, seed data, lock rules
|-- Dockerfile                 Production container image
|-- render.yaml                Render Blueprint deployment config
|-- package.json               npm scripts and Node engine metadata
|-- .env.example               Optional local environment template
`-- README.md                  Project documentation
```

Generated runtime files such as `.env`, SQLite databases, logs, and `node_modules/` are intentionally ignored by Git.

## Runtime Flow

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

The backend owns schema creation, seed data, trigger evaluation, module access checks, notification reconciliation, and unlock validation. The frontend renders the dashboard, manages tabs and forms, and calls the API.

## Business Rules

A module is locked when either condition is met:

- The same agent fails the same module 3 times.
- The agent's 7-day average score for a module falls below 70%.

Team health states:

- `Locked`: the agent has at least one active module lock.
- `Warning`: the agent has no active lock, but the latest score dropped from the previous score.
- `Healthy`: the agent has no active lock and no recent score-drop signal.

Unlocking requires manager notes with at least 20 characters. A successful unlock records the action in `CoachingInterventions`, marks the lock inactive, and resolves the related notification.

## Demo Dataset

The seeded dataset is small enough for a clean demo while still exercising the major workflows:

- KGIFH Taipei HQ manager context
- 6 direct reports
- 4 learning modules
- 4 active locked modules
- 1 warning case
- 1 healthy case

The seed data is defined in `app.js` inside `seedDemoData()`. The same seed logic is used locally, in Docker, and on Render.

## Data Model

Core workflow tables:

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
- `GET /api/agent/A1001`: diagnostic details for one agent.
- `GET /api/module-access?agent_id=A1001&module_id=MOD-TRAVEL-DATA`: module access state.
- `POST /api/unlock`: records coaching notes and unlocks a module.
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

The app works without a local `.env` file. Create `.env` only when overriding defaults:

```env
PORT=3000
HOST=0.0.0.0
DB_PATH=manager_coaching.sqlite
SEED_DEMO_DATA=true
RESET_DEMO_DATA=false
ENABLE_DEMO_WRITES=true
DEMO_WRITE_LIMIT=24
MAX_QUIZ_ATTEMPTS=300
```

- `PORT`: web server port.
- `HOST`: server bind address.
- `DB_PATH`: SQLite database path.
- `SEED_DEMO_DATA`: set to `false` to disable automatic demo seed creation.
- `RESET_DEMO_DATA`: set to `true` only when intentionally rebuilding the demo dataset.
- `ENABLE_DEMO_WRITES`: set to `false` to make public write actions read-only.
- `DEMO_WRITE_LIMIT`: maximum write actions per client/path per hour.
- `MAX_QUIZ_ATTEMPTS`: hard cap for quiz-attempt rows in a public demo.

By default, local data is stored in `manager_coaching.sqlite`. The database is not reset on every startup. Demo data is inserted only when the database is empty, when the bundled demo data version changes, or when `RESET_DEMO_DATA=true`.

Public demo deployments keep unlock and quiz simulation features available for reviewers. To prevent abuse, the server limits repeated write actions and caps quiz-attempt growth. Render Free tier storage is still ephemeral, so public demo data may reset after redeploys or service restarts.

## Docker Deployment

Build the image:

```cmd
docker build -t manager-coaching-intervention-portal .
```

Run with persistent local Docker storage:

```cmd
docker volume create manager-coaching-data
docker run --rm -p 3000:3000 -v manager-coaching-data:/data manager-coaching-intervention-portal
```

The Docker image uses `/data/manager_coaching.sqlite` as the database path.

## Render Deployment

The repository includes `render.yaml` for Render Blueprint deployment.

Deployment flow:

1. Push the repository to GitHub.
2. Create a new Blueprint in Render.
3. Connect the GitHub repository.
4. Render builds the Docker image from `Dockerfile`.
5. GitHub Actions runs CI checks.
6. Render deploys after checks pass.
7. Render checks `/health` for service health.

Current Blueprint configuration:

```yaml
services:
  - type: web
    name: manager-coaching-intervention-portal
    env: docker
    plan: free
    autoDeployTrigger: checksPass
    healthCheckPath: /health
```

Render Free tier does not support persistent disks for this Blueprint configuration. The deployed demo can run successfully, but SQLite data may be recreated after redeploys or service restarts. For production persistence, use a paid Render disk or move persistence to an external database such as Render Postgres.

## CI/CD

CI is defined in `.github/workflows/ci.yml`.

On pushes to `main` and on pull requests, GitHub Actions:

1. Checks out the repository.
2. Sets up Node.js 20.
3. Installs the SQLite CLI.
4. Runs `npm run check`.

CD is handled by Render. Because `autoDeployTrigger: checksPass` is set in `render.yaml`, Render deploys only after the GitHub Actions checks pass for the pushed commit.

## Tech Stack

- **Runtime**: Node.js 20
- **Server**: Node built-in HTTP module
- **Database**: SQLite via the `sqlite3` CLI
- **Frontend**: HTML, CSS, vanilla JavaScript
- **CI**: GitHub Actions
- **Deployment**: Docker, Render Blueprint
