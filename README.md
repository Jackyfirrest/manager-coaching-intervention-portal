# Manager Coaching Intervention Portal

A web application for a manager-facing coaching workflow. The portal identifies micro-learning risk signals, routes notifications to the direct manager, and records coaching interventions before a locked training module can be unlocked.

The application follows a simple workflow: detect learning risk, show diagnostic context, record the coaching action, and keep an audit trail for unlock decisions.

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

## Business Rules

A module can be locked when either of these conditions is met:

- The agent fails the same module 3 times.
- The agent's 7-day rolling average score for a module falls below 70%.

Unlocking requires manager notes with at least 20 characters, and the action is stored in `CoachingInterventions`.

## Main Database Tables

- `Managers`
- `Agents`
- `Modules`
- `TeamStructures`
- `QuizAttempts`
- `FailedQuestions`
- `ModuleStateLocks`
- `Notifications`
- `CoachingInterventions`

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

## GitHub Setup

After creating an empty GitHub repository, connect this local project and push:

```powershell
git remote add origin https://github.com/<your-account>/<your-repo>.git
git branch -M main
git push -u origin main
```

## Notes

The project keeps the application flow, database schema, business rules, and deployment configuration small enough to inspect quickly. It uses plain Node.js and SQLite to avoid unnecessary framework or infrastructure overhead.
