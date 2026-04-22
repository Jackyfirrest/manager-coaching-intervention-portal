# Manager Coaching Intervention Portal

A web application for a manager-facing coaching workflow. The portal identifies micro-learning risk signals, routes notifications to the direct manager, and records coaching interventions before a locked training module can be unlocked.

The application follows a simple workflow: detect learning risk, show diagnostic context, record the coaching action, and keep an audit trail for unlock decisions.

The demo data is set for KGI Financial Holding's Taipei headquarters context (`KGIFH Taipei HQ`), with cross-entity customer data, investment risk disclosure, group KYC review, and AML escalation modules.

## Features

- A manager dashboard for monitoring team learning health.
- Risk detection based on repeated quiz failures and low rolling average scores.
- A diagnostic view showing locked modules, missed questions, coaching focus, and recent attempts.
- A required intervention log before unlocking a module.
- SQLite-backed relational data with audit-friendly intervention records.
- A lightweight Node.js web server.
- Docker and Render deployment configuration.

## Tech Stack

- **Backend**: Node.js 20, built-in HTTP server
- **Frontend**: HTML, CSS, vanilla JavaScript
- **Database**: SQLite
- **Deployment**: Docker, Render Blueprint

No npm packages are required.

## Project Structure

```text
app.js              # HTTP server, API routes, SQLite schema, seed data, business rules
public/index.html   # Main application layout
public/app.js       # Frontend rendering, API calls, form handling
public/styles.css   # Responsive UI styling
Dockerfile          # Container image definition
render.yaml         # Render deployment blueprint
.env.example        # Local environment variable template
```

## Core Workflow

1. The manager opens the dashboard and reviews direct reports.
2. Each team member is shown as Green, Amber, or Red based on learning health.
3. A Red state means a module lock requires manager intervention.
4. The manager reviews the diagnostic details and coaching feedback.
5. The manager records offline coaching notes.
6. The module is unlocked and the intervention is saved in the audit table.

## Requirement Coverage

### User Interface

- `Team Health` roster: shows the manager's direct reports, supports risk/name/score sorting, and color-codes Green, Amber, and Red states.
- `Diagnostic View`: opens from a roster selection and shows active lock state, locked module, lock reason, repeated failed questions, recent attempts, and generated coaching feedback.
- `Intervention Log`: requires coaching notes with a minimum character count before the manager can sign and unlock the agent's module.

### Backend Behavior

- Trigger Engine: evaluates quiz submissions immediately through `POST /api/simulate-quiz`.
- Lock State: locked modules are represented as `Locked_Pending_Coaching` and stored in `ModuleStateLocks` with `is_locked = 1`.
- Access Control: `GET /api/module-access` reports whether an agent can continue a module. `POST /api/simulate-quiz` rejects attempts for locked modules so the agent cannot continue that learning path.
- Notification Routing: new locks are routed to the latest direct manager from `TeamStructures` and recorded as urgent `Notifications`.
- Unlock Protocol: only the current direct manager can unlock a module, and only after entering sufficient coaching notes. Unlocking records a `CoachingInterventions` audit row, marks the lock inactive, resolves the notification, and returns the module to `Active`.

## Business Rules

A module can be locked when either of these conditions is met:

- The agent fails the same module 3 times.
- The agent's 7-day rolling average score for a module falls below 70%.

Team Health colors are based on the current risk state:

- `Red`: the agent has at least one active module lock.
- `Amber`: the agent has no active lock, but the latest quiz score is lower than the previous score.
- `Green`: the agent has no active lock and no latest-score drop.

Unlocking requires direct-manager notes with at least 20 characters, and the action is stored in `CoachingInterventions`. After an unlock, the trigger engine evaluates only new quiz attempts for that agent and module, so old failures do not immediately recreate the same lock.

## Demo Dataset

The seeded demo is intentionally small, but includes enough rows to show filters, "show all" controls, lock routing, and unlock behavior.

- `Lin Po-Yu`: Red, locked on `Cross-Entity Customer Data` because he failed the same module 3 times.
- `Wu Mei-Ling`: Red, locked on `Group KYC Review` because her 7-day module average is below 70%.
- `Chen Ssu-Ying`: Amber, not locked, but her latest investment-risk score dropped from the previous attempt.
- `Huang Wan-Ju`: Green, no active lock and no score-drop signal.
- `Chang Chia-Hao`: Green, no active lock and no score-drop signal.
- `Tsai Yi-Ting`: Red, locked on `Investment Risk Disclosure` because she failed the same module 3 times.
- `Liao Cheng-En`: Red, locked on `AML Escalation` because his 7-day module average is below 70%.
- `Kao Min-Jie`: Green, no active lock and no score-drop signal.

With 8 direct reports and 4 urgent alerts, the UI can demonstrate status filtering, "show all reports", and "show all alerts" without needing a large dataset.

This uses a financial-holding-company perspective rather than a single-bank perspective: the training topics cover group customer-data use, wealth/investment risk disclosure, KYC refresh, and AML escalation.

## Database Design

### Spec-Required Core Tables

These are the three tables required by the project brief.

- `TeamStructures`: org-chart mapping with `mapping_id`, `agent_id`, `manager_id`, `branch_code`, and `effective_date`.
- `ModuleStateLocks`: module-level access control with `lock_id`, `agent_id`, `module_id`, `lock_reason`, `locked_timestamp`, and `is_locked`.
- `CoachingInterventions`: audit trail with `intervention_id`, `lock_id`, `manager_id`, `manager_notes_text`, and `unlocked_timestamp`.

### Supporting Application Tables

These tables support the working demo UI and trigger engine, but they are not replacements for the three required core tables.

- `Managers`, `Agents`, and `Modules`: lookup data used by the roster and diagnostic screens.
- `QuizAttempts`: stores quiz scores so the trigger engine can detect `failed_3x` and `rolling_avg_below_70`.
- `FailedQuestions`: stores the diagnostic question text and coaching focus shown in `Top Coaching Gaps`.
- `Notifications`: stores routed manager alerts for Project 8 integration.

### Database Integrity Rules

- `TeamStructures` keeps historical branch/manager mappings; application queries use the latest `effective_date` for direct-manager routing.
- `ModuleStateLocks` allows only one active lock per `agent_id` and `module_id`, preventing duplicate unresolved locks for the same learning path.
- `ModuleStateLocks.is_locked` is constrained to boolean values for newly created databases.
- `CoachingInterventions.lock_id` is unique, so each lock can be unlocked by one recorded coaching intervention.
- `CoachingInterventions.manager_notes_text` is validated by the backend and constrained to meaningful notes for newly created databases.
- Foreign keys link locks to agents/modules and interventions to locks/managers, preserving the audit chain.

## Run Locally

### Requirements

- Node.js 20 or newer
- SQLite CLI (`sqlite3`) available in PATH

### Start the App

```powershell
npm start
```

Open the app in a browser:

```text
http://localhost:3000
```

The app creates and seeds `manager_coaching.sqlite` automatically on first run.

### Optional Environment File

Copy the example file if local overrides are needed:

```powershell
Copy-Item .env.example .env
```

Supported variables:

- `PORT`: web server port, default `3000`
- `HOST`: bind address, default `0.0.0.0`
- `DB_PATH`: SQLite database path, default `manager_coaching.sqlite`
- `SEED_DEMO_DATA`: set to `false` to disable demo data creation

## Checks

Run the syntax check:

```powershell
npm run check
```

With the server running, check the health endpoint:

```powershell
npm run health
```

Expected health response:

```json
{ "status": "ok" }
```

## Run with Docker

Build the image:

```powershell
docker build -t manager-coaching-intervention-portal .
```

Run the container:

```powershell
docker run --rm -p 3000:3000 -v manager-coaching-data:/data manager-coaching-intervention-portal
```

Open:

```text
http://localhost:3000
```

## Deploy to Render

This repository includes `render.yaml` for Render Blueprint deployment.

1. Push this repository to GitHub.
2. In Render, create a new Blueprint.
3. Connect the GitHub repository.
4. Render will build the Docker image, mount persistent storage at `/data`, and use `/health` for health checks.

The SQLite database path in Docker is configured as:

```text
/data/manager_coaching.sqlite
```

## Notes

The project keeps the application flow, database schema, business rules, and deployment configuration small enough to inspect quickly. It uses plain Node.js and SQLite to avoid unnecessary framework or infrastructure overhead.
