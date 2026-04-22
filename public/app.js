let rosterData = [];
let selectedAgentId = null;
let selectedLockId = null;
let selectedModuleId = null;
let currentDiagnostics = null;
let selectedDetailTab = "summary";
let rosterExpanded = false;
let alertsExpanded = false;

const rosterEl = document.querySelector("#roster");
const notificationsEl = document.querySelector("#notifications");
const managerChip = document.querySelector("#managerChip");
const teamSummary = document.querySelector("#teamSummary");
const sortSelect = document.querySelector("#sortSelect");
const statusFilter = document.querySelector("#statusFilter");
const rosterToggle = document.querySelector("#rosterToggle");
const alertsToggle = document.querySelector("#alertsToggle");
const diagnostics = document.querySelector("#diagnostics");
const emptyState = document.querySelector("#emptyState");
const moduleFilter = document.querySelector("#moduleFilter");
const unlockForm = document.querySelector("#unlockForm");
const notes = document.querySelector("#notes");
const noteCount = document.querySelector("#noteCount");
const formMessage = document.querySelector("#formMessage");
const simAgent = document.querySelector("#simAgent");
const simModule = document.querySelector("#simModule");
const simScore = document.querySelector("#simScore");
const simMessage = document.querySelector("#simMessage");
const detailTabs = document.querySelector(".detail-tabs");

const healthOrder = { Red: 1, Amber: 2, Green: 3 };
const statusLabels = {
  Green: "Healthy",
  Amber: "Warning",
  Red: "Locked"
};

const statusDescriptions = {
  Green: "No active risk",
  Amber: "Score decline",
  Red: "Coaching required"
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function stateClass(state) {
  return state.toLowerCase();
}

function formatDateTime(value) {
  if (!value) return "";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderTeamSummary() {
  const counts = rosterData.reduce((summary, agent) => {
    summary[agent.health_state] = (summary[agent.health_state] || 0) + 1;
    return summary;
  }, { Green: 0, Amber: 0, Red: 0 });

  teamSummary.innerHTML = ["Red", "Amber", "Green"].map((state) => `
    <div class="summary-tile ${stateClass(state)}">
      <span>${statusLabels[state]}</span>
      <strong>${counts[state] || 0}</strong>
      <small>${statusDescriptions[state]}</small>
    </div>
  `).join("");
}

function renderRoster() {
  const sortMode = sortSelect.value;
  const filtered = rosterData.filter((agent) => statusFilter.value === "All" || agent.health_state === statusFilter.value);
  const data = [...filtered].sort((a, b) => {
    if (sortMode === "name") return a.agent_name.localeCompare(b.agent_name);
    if (sortMode === "score") return a.rolling_average - b.rolling_average;
    return healthOrder[a.health_state] - healthOrder[b.health_state] || a.rolling_average - b.rolling_average;
  });
  const visibleData = rosterExpanded ? data : data.slice(0, 5);

  rosterEl.innerHTML = visibleData.length ? visibleData.map((agent) => `
    <article class="agent-card ${agent.agent_id === selectedAgentId ? "active" : ""}" data-agent-id="${escapeHtml(agent.agent_id)}" role="button" tabindex="0">
      <i class="state-bar ${stateClass(agent.health_state)}"></i>
      <div class="agent-card-body">
        <div class="agent-main-row">
          <div class="agent-name-block">
            <h3>${escapeHtml(agent.agent_name)}</h3>
            <p>${escapeHtml(agent.role_title)}</p>
          </div>
          <div class="score">${Number(agent.rolling_average).toFixed(1)}%</div>
        </div>
        <div class="agent-status-row">
          <span class="status-badge ${stateClass(agent.health_state)}">${statusLabels[agent.health_state] || agent.health_state}</span>
          <div class="risk-detail">
            <span>${statusDescriptions[agent.health_state] || agent.health_state}</span>
            ${agent.lock_count ? `<span class="metric">${agent.lock_count} locked ${agent.lock_count === 1 ? "module" : "modules"}</span>` : scoreTrend(agent)}
          </div>
        </div>
      </div>
    </article>
  `).join("") : "<p class='form-message'>No reports match this filter.</p>";

  rosterToggle.classList.toggle("hidden", data.length <= 5);
  rosterToggle.textContent = rosterExpanded ? "Show first 5 reports" : `Show all ${data.length} reports`;

  simAgent.innerHTML = rosterData.map((agent) => `
    <option value="${escapeHtml(agent.agent_id)}">${escapeHtml(agent.agent_name)}</option>
  `).join("");
}

function scoreTrend(agent) {
  if (agent.previous_score == null || agent.latest_score == null) return "";
  const latest = Number(agent.latest_score);
  const previous = Number(agent.previous_score);
  const direction = latest < previous ? "down" : latest > previous ? "up" : "stable";
  return `<span class="metric">Score ${agent.previous_score} -> ${agent.latest_score} ${direction}</span>`;
}

function renderNotifications(notifications) {
  const visibleNotifications = alertsExpanded ? notifications : notifications.slice(0, 3);
  notificationsEl.innerHTML = visibleNotifications.length ? visibleNotifications.map((item) => `
    <article class="notification" data-status="${item.status}" data-agent-id="${escapeHtml(item.agent_id)}" role="button" tabindex="0">
      <strong>${escapeHtml(item.agent_name)}<span>${item.status === "urgent" ? "Urgent" : "Resolved"}</span></strong>
      <p>${escapeHtml(item.module_title)}</p>
      <p>${lockReasonLabel(item.lock_reason || "coaching_required")}</p>
    </article>
  `).join("") : "<p class='form-message'>No active urgent alerts. Resolved alerts stay in the database audit trail.</p>";
  alertsToggle.classList.toggle("hidden", notifications.length <= 3);
  alertsToggle.textContent = alertsExpanded ? "Show first 3 alerts" : `Show all ${notifications.length} alerts`;
}

function setDetailTab(tabName) {
  selectedDetailTab = tabName;
  document.querySelectorAll(".detail-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === selectedDetailTab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === selectedDetailTab);
  });
}

function lockReasonLabel(reason) {
  const labels = {
    failed_3x: "Failed same module 3 times",
    rolling_avg_below_70: "7-day average below 70%",
    coaching_required: "Coaching required"
  };
  return labels[reason] || reason;
}

function diagnosticModules(data) {
  const seen = new Map();
  [...data.locks, ...data.attempts, ...data.questions].forEach((item) => {
    if (!seen.has(item.module_id)) seen.set(item.module_id, item.module_title);
  });
  return [...seen].map(([module_id, module_title]) => ({ module_id, module_title }));
}

function renderDiagnosticDetails() {
  const data = currentDiagnostics;
  if (!data) return;

  const modules = diagnosticModules(data);
  if (!selectedModuleId || !modules.some((module) => module.module_id === selectedModuleId)) {
    selectedModuleId = modules[0]?.module_id || "";
  }

  moduleFilter.innerHTML = modules.map((module) => `
    <option value="${escapeHtml(module.module_id)}" ${module.module_id === selectedModuleId ? "selected" : ""}>${escapeHtml(module.module_title)}</option>
  `).join("");
  moduleFilter.disabled = false;

  const locks = data.locks.filter((lock) => lock.module_id === selectedModuleId);
  const questions = data.questions.filter((question) => question.module_id === selectedModuleId);
  const attempts = data.attempts.filter((attempt) => attempt.module_id === selectedModuleId);

  selectedLockId = locks.length ? locks[0].lock_id : null;
  document.querySelector("#gapCount").textContent = questions.length;
  document.querySelector("#attemptCount").textContent = attempts.length;
  document.querySelector('[data-tab="unlock"]').disabled = !locks.length;
  if (!locks.length && selectedDetailTab === "unlock") selectedDetailTab = "summary";

  document.querySelector("#locks").innerHTML = locks.length ? locks.map((lock) => `
    <article class="lock-card">
      <span class="module-label">${escapeHtml(lock.module_title)}</span>
      <strong>Module locked</strong>
      <p>${lockReasonLabel(lock.lock_reason)}</p>
      <small>Next step: coach offline, record the intervention note, then unlock. Locked ${escapeHtml(formatDateTime(lock.locked_timestamp))}</small>
    </article>
  `).join("") : `
    <article class="soft-card">
      <strong>Monitoring only</strong>
      <p>No active lock for this module.</p>
    </article>
  `;

  const focuses = [...new Set(questions.map((question) => question.correct_focus))];
  document.querySelector("#feedback").innerHTML = focuses.length
    ? `
      <strong>Coach these points</strong>
      <ul>
        ${focuses.slice(0, 3).map((focus) => `<li>${escapeHtml(focus)}</li>`).join("")}
      </ul>
    `
    : `
      <strong>No coaching focus</strong>
      <p>No repeated misconception pattern is available for this module.</p>
    `;

  document.querySelector("#questions").innerHTML = questions.length ? questions.map((question) => `
    <article class="question-card">
      <span class="module-label">${Number(question.failed_count)} misses</span>
      <strong>${escapeHtml(question.question_text)}</strong>
      <p><b>Pattern:</b> ${escapeHtml(question.wrong_answer)}</p>
      <p><b>Coach:</b> ${escapeHtml(question.correct_focus)}</p>
    </article>
  `).join("") : `
    <article class="soft-card">
      <strong>No coaching gaps</strong>
      <p>No repeated misconception pattern is available for this module.</p>
    </article>
  `;

  document.querySelector("#attempts").innerHTML = attempts.length ? attempts.map((attempt) => `
    <div class="attempt-row">
      <span>${escapeHtml(attempt.module_title)}<small>${escapeHtml(formatDateTime(attempt.attempted_at))}</small></span>
      <strong>${attempt.score}%</strong>
      <span class="attempt-state ${attempt.passed ? "pass" : "fail"}">${attempt.passed ? "Passed" : "Failed"}</span>
    </div>
  `).join("") : "<p class='form-message'>No recent attempts for this module.</p>";

  unlockForm.style.display = locks.length ? "block" : "none";
  setDetailTab(selectedDetailTab);
  formMessage.textContent = "";
}

async function loadRoster() {
  const data = await api("/api/roster?manager_id=MGR001");
  rosterData = data.roster;
  managerChip.textContent = `${data.manager.manager_name} - ${data.manager.branch_code}`;
  renderTeamSummary();
  renderRoster();
  renderNotifications(data.notifications);
}

function renderDiagnostics(data) {
  currentDiagnostics = data;
  if (!data.agent) {
    diagnostics.classList.add("hidden");
    emptyState.classList.remove("hidden");
    emptyState.querySelector("h2").textContent = "Agent not found";
    emptyState.querySelector("p:last-child").textContent = data.feedback || "Please select another team member.";
    return;
  }

  diagnostics.classList.remove("hidden");
  emptyState.classList.add("hidden");

  document.querySelector("#agentName").textContent = data.agent.agent_name;
  document.querySelector("#agentMeta").textContent = `${data.agent.role_title} - ${data.agent.branch_code}`;
  const hasLocks = data.locks.length > 0;
  const statePill = document.querySelector("#statePill");
  statePill.textContent = hasLocks ? "Needs coaching" : "Active";
  statePill.style.color = hasLocks ? "var(--red)" : "var(--green)";

  notes.value = "";
  updateNoteCount();
  renderDiagnosticDetails();
}

async function selectAgent(agentId) {
  selectedAgentId = agentId;
  selectedModuleId = null;
  selectedDetailTab = "summary";
  renderRoster();
  const data = await api(`/api/agent/${agentId}`);
  renderDiagnostics(data);
}

function updateNoteCount() {
  noteCount.textContent = `${notes.value.trim().length} / 20 minimum`;
}

rosterEl.addEventListener("click", (event) => {
  const card = event.target.closest(".agent-card");
  if (card) selectAgent(card.dataset.agentId);
});

rosterEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".agent-card");
  if (!card) return;
  event.preventDefault();
  selectAgent(card.dataset.agentId);
});

notificationsEl.addEventListener("click", (event) => {
  const card = event.target.closest(".notification");
  if (card) selectAgent(card.dataset.agentId);
});

notificationsEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".notification");
  if (!card) return;
  event.preventDefault();
  selectAgent(card.dataset.agentId);
});

sortSelect.addEventListener("change", renderRoster);
statusFilter.addEventListener("change", () => {
  rosterExpanded = false;
  renderRoster();
});
rosterToggle.addEventListener("click", () => {
  rosterExpanded = !rosterExpanded;
  renderRoster();
  rosterEl.scrollTop = 0;
});
alertsToggle.addEventListener("click", async () => {
  alertsExpanded = !alertsExpanded;
  await loadRoster();
  notificationsEl.scrollTop = 0;
});
moduleFilter.addEventListener("change", () => {
  selectedModuleId = moduleFilter.value;
  selectedDetailTab = "summary";
  renderDiagnosticDetails();
});
detailTabs.addEventListener("click", (event) => {
  const button = event.target.closest(".detail-tab");
  if (!button || button.disabled) return;
  setDetailTab(button.dataset.tab);
});
notes.addEventListener("input", updateNoteCount);

unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.textContent = "Saving intervention note...";
  try {
    await api("/api/unlock", {
      method: "POST",
      body: JSON.stringify({
        lockId: selectedLockId,
        managerId: "MGR001",
        notes: notes.value
      })
    });
    formMessage.textContent = "Module unlocked. Audit trail recorded.";
    await loadRoster();
    await selectAgent(selectedAgentId);
  } catch (error) {
    formMessage.textContent = error.message;
  }
});

document.querySelector("#simulateBtn").addEventListener("click", async () => {
  simMessage.textContent = "Evaluating quiz result...";
  try {
    await api("/api/simulate-quiz", {
      method: "POST",
      body: JSON.stringify({
        agentId: simAgent.value,
        moduleId: simModule.value,
        score: simScore.value
      })
    });
    simMessage.textContent = "Quiz result saved. Dashboard refreshed.";
    await loadRoster();
    await selectAgent(simAgent.value);
  } catch (error) {
    simMessage.textContent = error.message;
  }
});

loadRoster().then(() => {
  const firstLocked = rosterData.find((agent) => agent.health_state === "Red") || rosterData[0];
  if (firstLocked) selectAgent(firstLocked.agent_id);
});
