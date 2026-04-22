const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DB_PATH = path.resolve(__dirname, process.env.DB_PATH || "manager_coaching.sqlite");
const PUBLIC_DIR = path.join(__dirname, "public");
const SEED_DEMO_DATA = process.env.SEED_DEMO_DATA !== "false";
const SQLITE_PRAGMAS = "PRAGMA foreign_keys = ON;";

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

function sqlEscape(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runSql(sql, json = false) {
  const args = json ? [DB_PATH, "-json", `${SQLITE_PRAGMAS}\n${sql}`] : [DB_PATH, `${SQLITE_PRAGMAS}\n${sql}`];
  const output = execFileSync("sqlite3", args, { encoding: "utf8" }).trim();
  return json && output ? JSON.parse(output) : json ? [] : output;
}

function initDb() {
  runSql(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS Managers (
      manager_id TEXT PRIMARY KEY,
      manager_name TEXT NOT NULL,
      branch_code TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Agents (
      agent_id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL,
      role_title TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Modules (
      module_id TEXT PRIMARY KEY,
      module_title TEXT NOT NULL,
      learning_path TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS TeamStructures (
      mapping_id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      manager_id TEXT NOT NULL,
      branch_code TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES Agents(agent_id),
      FOREIGN KEY (manager_id) REFERENCES Managers(manager_id)
    );

    CREATE TABLE IF NOT EXISTS QuizAttempts (
      attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES Agents(agent_id),
      FOREIGN KEY (module_id) REFERENCES Modules(module_id)
    );

    CREATE TABLE IF NOT EXISTS FailedQuestions (
      question_id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      wrong_answer TEXT NOT NULL,
      correct_focus TEXT NOT NULL,
      failed_count INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (agent_id) REFERENCES Agents(agent_id),
      FOREIGN KEY (module_id) REFERENCES Modules(module_id)
    );

    CREATE TABLE IF NOT EXISTS ModuleStateLocks (
      lock_id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      lock_reason TEXT NOT NULL CHECK (lock_reason IN ('failed_3x', 'rolling_avg_below_70')),
      locked_timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_locked INTEGER NOT NULL DEFAULT 1 CHECK (is_locked IN (0, 1)),
      FOREIGN KEY (agent_id) REFERENCES Agents(agent_id),
      FOREIGN KEY (module_id) REFERENCES Modules(module_id)
    );

    CREATE TABLE IF NOT EXISTS CoachingInterventions (
      intervention_id INTEGER PRIMARY KEY AUTOINCREMENT,
      lock_id INTEGER NOT NULL,
      manager_id TEXT NOT NULL,
      manager_notes_text TEXT NOT NULL CHECK (length(trim(manager_notes_text)) >= 20),
      unlocked_timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lock_id) REFERENCES ModuleStateLocks(lock_id),
      FOREIGN KEY (manager_id) REFERENCES Managers(manager_id)
    );

    CREATE TABLE IF NOT EXISTS Notifications (
      notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
      lock_id INTEGER NOT NULL,
      manager_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'urgent',
      FOREIGN KEY (lock_id) REFERENCES ModuleStateLocks(lock_id),
      FOREIGN KEY (manager_id) REFERENCES Managers(manager_id)
    );

    CREATE INDEX IF NOT EXISTS idx_team_structures_agent_effective
      ON TeamStructures (agent_id, effective_date DESC, mapping_id DESC);

    CREATE INDEX IF NOT EXISTS idx_team_structures_manager
      ON TeamStructures (manager_id, branch_code);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_module_state_locks_one_active
      ON ModuleStateLocks (agent_id, module_id)
      WHERE is_locked = 1;

    CREATE INDEX IF NOT EXISTS idx_module_state_locks_agent
      ON ModuleStateLocks (agent_id, is_locked, locked_timestamp DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_coaching_interventions_one_per_lock
      ON CoachingInterventions (lock_id);

    CREATE INDEX IF NOT EXISTS idx_coaching_interventions_manager_time
      ON CoachingInterventions (manager_id, unlocked_timestamp DESC);
  `);

  if (!SEED_DEMO_DATA) return;

  seedDemoData();
  evaluateAllLocks();
  reconcileNotifications();
}

function seedDemoData() {
  runSql(`
    DELETE FROM CoachingInterventions;
    DELETE FROM Notifications;
    DELETE FROM ModuleStateLocks;
    DELETE FROM FailedQuestions;
    DELETE FROM QuizAttempts;
    DELETE FROM TeamStructures;
    DELETE FROM Agents;
    DELETE FROM Modules;
    DELETE FROM Managers;

    INSERT INTO Managers VALUES
      ('MGR001', 'Grace Chen', 'KGIFH Taipei HQ');

    INSERT INTO Agents VALUES
      ('A1001', 'Lin Po-Yu', 'Group Client RM'),
      ('A1002', 'Chen Ssu-Ying', 'Securities Associate'),
      ('A1003', 'Wu Mei-Ling', 'Insurance Specialist'),
      ('A1004', 'Huang Wan-Ju', 'Compliance Associate'),
      ('A1005', 'Chang Chia-Hao', 'Management Trainee'),
      ('A1006', 'Tsai Yi-Ting', 'Wealth Associate'),
      ('A1007', 'Liao Cheng-En', 'Operations Analyst'),
      ('A1008', 'Kao Min-Jie', 'Management Trainee');

    INSERT INTO Modules VALUES
      ('MOD-TRAVEL-DATA', 'Cross-Entity Customer Data', 'KGIFH Compliance'),
      ('MOD-ILP-RISK', 'Investment Risk Disclosure', 'Wealth Advisory'),
      ('MOD-KYC', 'Group KYC Review', 'Client Onboarding'),
      ('MOD-AML', 'AML Escalation', 'Regulatory Essentials');

    INSERT INTO TeamStructures (agent_id, manager_id, branch_code, effective_date) VALUES
      ('A1001', 'MGR001', 'KGIFH Taipei HQ', '2026-01-01'),
      ('A1002', 'MGR001', 'KGIFH Taipei HQ', '2026-01-01'),
      ('A1003', 'MGR001', 'KGIFH Taipei HQ', '2026-01-01'),
      ('A1004', 'MGR001', 'KGIFH Taipei HQ', '2026-01-01'),
      ('A1005', 'MGR001', 'KGIFH Taipei HQ', '2026-01-01'),
      ('A1006', 'MGR001', 'KGIFH Taipei HQ', '2026-01-01'),
      ('A1007', 'MGR001', 'KGIFH Taipei HQ', '2026-01-01'),
      ('A1008', 'MGR001', 'KGIFH Taipei HQ', '2026-01-01');

    INSERT INTO QuizAttempts (agent_id, module_id, score, passed, attempted_at) VALUES
      ('A1001', 'MOD-TRAVEL-DATA', 62, 0, datetime('now', '-4 days')),
      ('A1001', 'MOD-TRAVEL-DATA', 58, 0, datetime('now', '-2 days')),
      ('A1001', 'MOD-TRAVEL-DATA', 61, 0, datetime('now', '-1 days')),
      ('A1001', 'MOD-AML', 86, 1, datetime('now', '-6 hours')),
      ('A1002', 'MOD-ILP-RISK', 84, 1, datetime('now', '-5 days')),
      ('A1002', 'MOD-ILP-RISK', 76, 1, datetime('now', '-1 days')),
      ('A1003', 'MOD-KYC', 69, 0, datetime('now', '-3 days')),
      ('A1003', 'MOD-KYC', 68, 0, datetime('now', '-1 days')),
      ('A1004', 'MOD-AML', 88, 1, datetime('now', '-2 days')),
      ('A1005', 'MOD-TRAVEL-DATA', 92, 1, datetime('now', '-1 days')),
      ('A1006', 'MOD-ILP-RISK', 64, 0, datetime('now', '-5 days')),
      ('A1006', 'MOD-ILP-RISK', 66, 0, datetime('now', '-3 days')),
      ('A1006', 'MOD-ILP-RISK', 63, 0, datetime('now', '-1 days')),
      ('A1007', 'MOD-AML', 67, 0, datetime('now', '-4 days')),
      ('A1007', 'MOD-AML', 66, 0, datetime('now', '-1 days')),
      ('A1008', 'MOD-KYC', 89, 1, datetime('now', '-2 days'));

    INSERT INTO FailedQuestions (agent_id, module_id, question_text, wrong_answer, correct_focus, failed_count) VALUES
      ('A1001', 'MOD-TRAVEL-DATA', 'Before sharing client data with another KGI subsidiary, what must be confirmed?', 'Assumes group companies may share data automatically.', 'Confirm client consent and approved purpose before cross-entity use.', 3),
      ('A1001', 'MOD-TRAVEL-DATA', 'Which record proves cross-entity data sharing was allowed?', 'Keeps only the customer ID or case number.', 'Keep consent time, purpose, recipient company, and staff ID.', 2),
      ('A1003', 'MOD-KYC', 'When should a KYC profile be refreshed for a group client?', 'Waits until the next annual review even after risk changes.', 'Refresh KYC when risk profile, product type, or client information changes.', 2),
      ('A1006', 'MOD-ILP-RISK', 'What must be explained before recommending a high-risk fund?', 'Focuses only on expected return.', 'Explain suitability, downside risk, fees, and non-guaranteed returns.', 3),
      ('A1007', 'MOD-AML', 'When should an unusual transaction be escalated?', 'Waits for repeated transactions before reporting.', 'Escalate promptly when the transaction pattern is inconsistent with the client profile.', 2);
  `);
}

function reconcileNotifications() {
  const missing = runSql(`
    WITH latest_team AS (
      SELECT agent_id, manager_id
      FROM (
        SELECT
          agent_id,
          manager_id,
          ROW_NUMBER() OVER (
            PARTITION BY agent_id
            ORDER BY effective_date DESC, mapping_id DESC
          ) AS rank
        FROM TeamStructures
      )
      WHERE rank = 1
    )
    SELECT l.lock_id, l.agent_id, l.module_id, l.lock_reason, latest_team.manager_id
    FROM ModuleStateLocks l
    JOIN latest_team ON latest_team.agent_id = l.agent_id
    LEFT JOIN Notifications n ON n.lock_id = l.lock_id
    WHERE l.is_locked = 1 AND n.notification_id IS NULL;
  `, true);

  missing.forEach((row) => {
    runSql(`
      INSERT INTO Notifications (lock_id, manager_id, message)
      VALUES (
        ${row.lock_id},
        ${sqlEscape(row.manager_id)},
        ${sqlEscape(`Agent ${row.agent_id} requires coaching for module ${row.module_id}: ${row.lock_reason}`)}
      );
    `);
  });
}

function evaluateAllLocks() {
  const failures = runSql(`
    WITH last_unlock AS (
      SELECT l.agent_id, l.module_id, MAX(ci.unlocked_timestamp) AS unlocked_at
      FROM ModuleStateLocks l
      JOIN CoachingInterventions ci ON ci.lock_id = l.lock_id
      GROUP BY l.agent_id, l.module_id
    ),
    eligible_attempts AS (
      SELECT qa.*
      FROM QuizAttempts qa
      LEFT JOIN last_unlock lu
        ON lu.agent_id = qa.agent_id
       AND lu.module_id = qa.module_id
      WHERE lu.unlocked_at IS NULL OR datetime(qa.attempted_at) > datetime(lu.unlocked_at)
    ),
    failed_streaks AS (
      SELECT agent_id, module_id
      FROM eligible_attempts
      WHERE passed = 0
      GROUP BY agent_id, module_id
      HAVING COUNT(*) >= 3
    ),
    rolling AS (
      SELECT agent_id, module_id, ROUND(AVG(score), 1) AS avg_score
      FROM eligible_attempts
      WHERE attempted_at >= datetime('now', '-7 days')
      GROUP BY agent_id, module_id
      HAVING avg_score < 70
    )
    SELECT agent_id, module_id, 'failed_3x' AS reason FROM failed_streaks
    UNION
    SELECT agent_id, module_id, 'rolling_avg_below_70' AS reason FROM rolling;
  `, true);

  failures.forEach((row) => createLockIfNeeded(row.agent_id, row.module_id, row.reason));
}

function createLockIfNeeded(agentId, moduleId, reason) {
  const existing = runSql(`
    SELECT lock_id FROM ModuleStateLocks
    WHERE agent_id = ${sqlEscape(agentId)}
      AND module_id = ${sqlEscape(moduleId)}
      AND is_locked = 1
    LIMIT 1;
  `, true);
  if (existing.length) return existing[0].lock_id;

  const inserted = runSql(`
    INSERT INTO ModuleStateLocks (agent_id, module_id, lock_reason)
    VALUES (${sqlEscape(agentId)}, ${sqlEscape(moduleId)}, ${sqlEscape(reason)})
    RETURNING lock_id;
  `, true);
  const lock_id = inserted[0].lock_id;

  const manager = runSql(`
    SELECT manager_id FROM TeamStructures
    WHERE agent_id = ${sqlEscape(agentId)}
    ORDER BY effective_date DESC, mapping_id DESC
    LIMIT 1;
  `, true)[0];

  if (manager) {
    runSql(`
      INSERT INTO Notifications (lock_id, manager_id, message)
      VALUES (
        ${lock_id},
        ${sqlEscape(manager.manager_id)},
        ${sqlEscape(`Agent ${agentId} requires coaching for module ${moduleId}: ${reason}`)}
      );
    `);
  }
  return lock_id;
}

function getActiveLock(agentId, moduleId) {
  return runSql(`
    SELECT
      l.lock_id,
      l.agent_id,
      l.module_id,
      l.lock_reason,
      l.locked_timestamp,
      'Locked_Pending_Coaching' AS module_state
    FROM ModuleStateLocks l
    WHERE l.agent_id = ${sqlEscape(agentId)}
      AND l.module_id = ${sqlEscape(moduleId)}
      AND l.is_locked = 1
    ORDER BY l.locked_timestamp DESC, l.lock_id DESC
    LIMIT 1;
  `, true)[0] || null;
}

function getModuleAccess(agentId, moduleId) {
  if (!agentId || !moduleId) {
    return { ok: false, status: 422, error: "Agent and module are required." };
  }

  const activeLock = getActiveLock(agentId, moduleId);
  if (activeLock) {
    return {
      ok: true,
      can_progress: false,
      module_state: activeLock.module_state,
      lock: activeLock
    };
  }

  return {
    ok: true,
    can_progress: true,
    module_state: "Active",
    lock: null
  };
}

function getRoster(managerId) {
  return runSql(`
    WITH latest_team AS (
      SELECT mapping_id, agent_id, manager_id, branch_code, effective_date
      FROM (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY agent_id
            ORDER BY effective_date DESC, mapping_id DESC
          ) AS rank
        FROM TeamStructures
      )
      WHERE rank = 1
    ),
    recent AS (
      SELECT agent_id, ROUND(AVG(score), 1) AS avg_score
      FROM QuizAttempts
      WHERE attempted_at >= datetime('now', '-7 days')
      GROUP BY agent_id
    ),
    ranked_attempts AS (
      SELECT
        agent_id,
        score,
        ROW_NUMBER() OVER (
          PARTITION BY agent_id
          ORDER BY datetime(attempted_at) DESC, attempt_id DESC
        ) AS rank
      FROM QuizAttempts
      WHERE attempted_at >= datetime('now', '-7 days')
    ),
    latest_scores AS (
      SELECT
        agent_id,
        MAX(CASE WHEN rank = 1 THEN score END) AS latest_score,
        MAX(CASE WHEN rank = 2 THEN score END) AS previous_score
      FROM ranked_attempts
      WHERE rank <= 2
      GROUP BY agent_id
    ),
    active_locks AS (
      SELECT agent_id, COUNT(*) AS lock_count
      FROM ModuleStateLocks
      WHERE is_locked = 1
      GROUP BY agent_id
    )
    SELECT
      a.agent_id,
      a.agent_name,
      a.role_title,
      ts.branch_code,
      COALESCE(recent.avg_score, 0) AS rolling_average,
      COALESCE(active_locks.lock_count, 0) AS lock_count,
      latest_scores.latest_score,
      latest_scores.previous_score,
      CASE
        WHEN COALESCE(active_locks.lock_count, 0) > 0 THEN 'Red'
        WHEN latest_scores.latest_score < latest_scores.previous_score THEN 'Amber'
        ELSE 'Green'
      END AS health_state
    FROM latest_team ts
    JOIN Agents a ON a.agent_id = ts.agent_id
    LEFT JOIN recent ON recent.agent_id = a.agent_id
    LEFT JOIN latest_scores ON latest_scores.agent_id = a.agent_id
    LEFT JOIN active_locks ON active_locks.agent_id = a.agent_id
    WHERE ts.manager_id = ${sqlEscape(managerId)}
    ORDER BY
      CASE health_state WHEN 'Red' THEN 1 WHEN 'Amber' THEN 2 ELSE 3 END,
      rolling_average ASC;
  `, true);
}

function getDiagnostics(agentId) {
  const agent = runSql(`
    WITH latest_team AS (
      SELECT agent_id, manager_id, branch_code
      FROM (
        SELECT
          agent_id,
          manager_id,
          branch_code,
          ROW_NUMBER() OVER (
            PARTITION BY agent_id
            ORDER BY effective_date DESC, mapping_id DESC
          ) AS rank
        FROM TeamStructures
      )
      WHERE rank = 1
    )
    SELECT a.agent_id, a.agent_name, a.role_title, latest_team.manager_id, latest_team.branch_code
    FROM Agents a
    JOIN latest_team ON latest_team.agent_id = a.agent_id
    WHERE a.agent_id = ${sqlEscape(agentId)}
  `, true)[0];

  if (!agent) {
    return { agent: null, locks: [], questions: [], attempts: [], feedback: "Agent not found." };
  }

  const locks = runSql(`
    SELECT
      l.lock_id,
      l.lock_reason,
      l.locked_timestamp,
      'Locked_Pending_Coaching' AS module_state,
      m.module_id,
      m.module_title,
      m.learning_path
    FROM ModuleStateLocks l
    JOIN Modules m ON m.module_id = l.module_id
    WHERE l.agent_id = ${sqlEscape(agentId)} AND l.is_locked = 1
    ORDER BY l.locked_timestamp DESC;
  `, true);

  const questions = runSql(`
    WITH locked_modules AS (
      SELECT module_id
      FROM ModuleStateLocks
      WHERE agent_id = ${sqlEscape(agentId)} AND is_locked = 1
    )
    SELECT
      fq.module_id,
      m.module_title,
      fq.question_text,
      fq.wrong_answer,
      fq.correct_focus,
      SUM(fq.failed_count) AS failed_count
    FROM FailedQuestions fq
    JOIN Modules m ON m.module_id = fq.module_id
    WHERE fq.agent_id = ${sqlEscape(agentId)}
      AND (
        NOT EXISTS (SELECT 1 FROM locked_modules)
        OR fq.module_id IN (SELECT module_id FROM locked_modules)
      )
    GROUP BY fq.module_id, m.module_title, fq.question_text, fq.wrong_answer, fq.correct_focus
    ORDER BY failed_count DESC, m.module_title ASC, fq.question_text ASC
    LIMIT 5;
  `, true);

  const attempts = runSql(`
    SELECT qa.module_id, m.module_title, qa.score, qa.passed, qa.attempted_at
    FROM QuizAttempts qa
    JOIN Modules m ON m.module_id = qa.module_id
    WHERE qa.agent_id = ${sqlEscape(agentId)}
    ORDER BY qa.attempted_at DESC
    LIMIT 5;
  `, true);

  const coachingFocuses = [...new Set(questions.map((q) => q.correct_focus))];
  const feedback = coachingFocuses.length
    ? `Focus on ${coachingFocuses.slice(0, 2).join(" ")} Confirm the agent can explain the decision steps before unlocking.`
    : `No repeated failed-question pattern is currently available.`;

  return { agent, locks, questions, attempts, feedback };
}

function unlockModule({ lockId, managerId, notes }) {
  const numericLockId = Number(lockId);
  if (!Number.isInteger(numericLockId) || numericLockId <= 0) {
    return { ok: false, status: 422, error: "A valid active lock is required." };
  }

  if (!managerId) {
    return { ok: false, status: 422, error: "Manager ID is required." };
  }

  const cleanNotes = String(notes || "").trim();
  if (cleanNotes.length < 20) {
    return { ok: false, status: 422, error: "Coaching notes must contain at least 20 characters." };
  }

  const lock = runSql(`
    WITH latest_team AS (
      SELECT agent_id, manager_id
      FROM (
        SELECT
          agent_id,
          manager_id,
          ROW_NUMBER() OVER (
            PARTITION BY agent_id
            ORDER BY effective_date DESC, mapping_id DESC
          ) AS rank
        FROM TeamStructures
      )
      WHERE rank = 1
    )
    SELECT l.lock_id, latest_team.manager_id
    FROM ModuleStateLocks l
    JOIN latest_team ON latest_team.agent_id = l.agent_id
    WHERE l.lock_id = ${numericLockId} AND l.is_locked = 1;
  `, true)[0];
  if (!lock) return { ok: false, status: 404, error: "Active lock not found." };
  if (lock.manager_id !== managerId) {
    return { ok: false, status: 403, error: "Only the agent's direct manager can unlock this module." };
  }

  runSql(`
    INSERT INTO CoachingInterventions (lock_id, manager_id, manager_notes_text)
    VALUES (${numericLockId}, ${sqlEscape(managerId)}, ${sqlEscape(cleanNotes)});

    UPDATE ModuleStateLocks
    SET is_locked = 0
    WHERE lock_id = ${numericLockId};

    UPDATE Notifications
    SET status = 'resolved'
    WHERE lock_id = ${numericLockId};
  `);
  return { ok: true, module_state: "Active" };
}

function simulateQuiz({ agentId, moduleId, score }) {
  const numericScore = Number(score);
  if (!agentId || !moduleId || !Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
    return { ok: false, status: 422, error: "Agent, module, and a score from 0 to 100 are required." };
  }

  const activeLock = getActiveLock(agentId, moduleId);
  if (activeLock) {
    return {
      ok: false,
      status: 423,
      error: "This module is Locked_Pending_Coaching. The agent cannot continue this learning path until the manager records coaching and unlocks it.",
      module_state: activeLock.module_state,
      lock: activeLock
    };
  }

  const passed = numericScore >= 70 ? 1 : 0;
  runSql(`
    INSERT INTO QuizAttempts (agent_id, module_id, score, passed)
    VALUES (${sqlEscape(agentId)}, ${sqlEscape(moduleId)}, ${numericScore}, ${passed});
  `);

  if (!passed) {
    runSql(`
      UPDATE FailedQuestions
      SET
        wrong_answer = 'Internal product bundle approval is enough.',
        correct_focus = 'Documented customer consent, declared purpose, and permitted recipient scope.',
        failed_count = failed_count + 1
      WHERE agent_id = ${sqlEscape(agentId)}
        AND module_id = ${sqlEscape(moduleId)}
        AND question_text = 'Scenario check: what must happen before cross-entity customer-data sharing?';

      INSERT INTO FailedQuestions (agent_id, module_id, question_text, wrong_answer, correct_focus, failed_count)
      SELECT
        ${sqlEscape(agentId)},
        ${sqlEscape(moduleId)},
        'Scenario check: what must happen before cross-entity customer-data sharing?',
        'Internal product bundle approval is enough.',
        'Documented customer consent, declared purpose, and permitted recipient scope.',
        1
      WHERE changes() = 0;
    `);
  }
  evaluateAllLocks();
  return getModuleAccess(agentId, moduleId);
}

function send(res, status, payload, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": `${type}; charset=utf-8`,
    "X-Content-Type-Options": "nosniff"
  });
  res.end(type === "application/json" ? JSON.stringify(payload) : payload);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return send(res, 403, "Forbidden", "text/plain");
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return send(res, 404, "Not found", "text/plain");
  }

  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".svg": "image/svg+xml"
  };
  send(res, 200, fs.readFileSync(filePath), types[ext] || "application/octet-stream");
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { status: "ok" });
    }

    if (req.method === "GET" && url.pathname === "/api/roster") {
      evaluateAllLocks();
      return send(res, 200, {
        manager: runSql("SELECT * FROM Managers WHERE manager_id = 'MGR001';", true)[0],
        roster: getRoster(url.searchParams.get("manager_id") || "MGR001"),
        notifications: runSql(`
          SELECT n.*, a.agent_name, m.module_title, l.lock_reason, l.is_locked
          FROM Notifications n
          JOIN ModuleStateLocks l ON l.lock_id = n.lock_id
          JOIN Agents a ON a.agent_id = l.agent_id
          JOIN Modules m ON m.module_id = l.module_id
          WHERE n.manager_id = ${sqlEscape(url.searchParams.get("manager_id") || "MGR001")}
            AND n.status = 'urgent'
            AND l.is_locked = 1
          ORDER BY n.created_at DESC
          LIMIT 10;
        `, true)
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/agent/")) {
      return send(res, 200, getDiagnostics(url.pathname.split("/").pop()));
    }

    if (req.method === "GET" && url.pathname === "/api/module-access") {
      const result = getModuleAccess(url.searchParams.get("agent_id"), url.searchParams.get("module_id"));
      return send(res, result.ok ? 200 : result.status, result);
    }

    if (req.method === "POST" && url.pathname === "/api/unlock") {
      const result = unlockModule(await parseBody(req));
      return send(res, result.ok ? 200 : result.status, result);
    }

    if (req.method === "POST" && url.pathname === "/api/simulate-quiz") {
      const result = simulateQuiz(await parseBody(req));
      return send(res, result.ok ? 200 : result.status, result);
    }

    return serveStatic(req, res);
  } catch (error) {
    send(res, 500, { error: error.message });
  }
}

initDb();
http.createServer(handle).listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`Manager Coaching Intervention Portal running at http://${displayHost}:${PORT}`);
});
