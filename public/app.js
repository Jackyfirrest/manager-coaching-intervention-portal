let rosterData = [];
let selectedAgentId = null;
let selectedLockId = null;

const rosterEl = document.querySelector("#roster");
const notificationsEl = document.querySelector("#notifications");
const managerChip = document.querySelector("#managerChip");
const sortSelect = document.querySelector("#sortSelect");
const diagnostics = document.querySelector("#diagnostics");
const emptyState = document.querySelector("#emptyState");
const unlockForm = document.querySelector("#unlockForm");
const notes = document.querySelector("#notes");
const noteCount = document.querySelector("#noteCount");
const formMessage = document.querySelector("#formMessage");
const simAgent = document.querySelector("#simAgent");
const simModule = document.querySelector("#simModule");
const simScore = document.querySelector("#simScore");
const simMessage = document.querySelector("#simMessage");

const healthOrder = { Red: 1, Amber: 2, Green: 3 };
const statusLabels = {
  Green: "Healthy",
  Amber: "Warning",
  Red: "Locked"
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

function renderRoster() {
  const sortMode = sortSelect.value;
  const data = [...rosterData].sort((a, b) => {
    if (sortMode === "name") return a.agent_name.localeCompare(b.agent_name);
    if (sortMode === "score") return a.rolling_average - b.rolling_average;
    return healthOrder[a.health_state] - healthOrder[b.health_state] || a.rolling_average - b.rolling_average;
  });

  rosterEl.innerHTML = data.map((agent) => `
    <article class="agent-card ${agent.agent_id === selectedAgentId ? "active" : ""}" data-agent-id="${escapeHtml(agent.agent_id)}" role="button" tabindex="0">
      <i class="state-bar ${stateClass(agent.health_state)}"></i>
      <div>
        <h3>${escapeHtml(agent.agent_name)}</h3>
        <p>${escapeHtml(agent.role_title)}</p>
        <p>${statusLabels[agent.health_state] || agent.health_state}${agent.lock_count ? ` · ${agent.lock_count} active lock` : ""}</p>
      </div>
      <div class="score">${Number(agent.rolling_average).toFixed(1)}%</div>
    </article>
  `).join("");

  simAgent.innerHTML = rosterData.map((agent) => `
    <option value="${escapeHtml(agent.agent_id)}">${escapeHtml(agent.agent_name)}</option>
  `).join("");
}

function renderNotifications(notifications) {
  notificationsEl.innerHTML = notifications.length ? notifications.map((item) => `
    <article class="notification" data-status="${item.status}">
      <strong>${item.status === "urgent" ? "Urgent" : "Resolved"} · ${escapeHtml(item.agent_name)}</strong>
      <p>${escapeHtml(item.module_title)}</p>
      <p>${escapeHtml(item.created_at)}</p>
    </article>
  `).join("") : "<p class='form-message'>No routed notifications.</p>";
}

async function loadRoster() {
  const data = await api("/api/roster?manager_id=MGR001");
  rosterData = data.roster;
  managerChip.textContent = `${data.manager.manager_name} · ${data.manager.branch_code}`;
  renderRoster();
  renderNotifications(data.notifications);
}

function renderDiagnostics(data) {
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
  document.querySelector("#agentMeta").textContent = `${data.agent.role_title} · ${data.agent.branch_code}`;
  const hasLocks = data.locks.length > 0;
  const statePill = document.querySelector("#statePill");
  statePill.textContent = hasLocks ? "Locked: Requires Intervention" : "Active";
  statePill.style.color = hasLocks ? "var(--red)" : "var(--green)";

  selectedLockId = hasLocks ? data.locks[0].lock_id : null;

  document.querySelector("#locks").innerHTML = hasLocks ? data.locks.map((lock) => `
    <article class="lock-card">
      <strong>${escapeHtml(lock.module_title)}</strong>
      <p>Reason: ${escapeHtml(lock.lock_reason)}</p>
      <p>Locked at: ${escapeHtml(lock.locked_timestamp)}</p>
    </article>
  `).join("") : "<p class='form-message'>No active lock for this agent.</p>";

  document.querySelector("#feedback").textContent = data.feedback;

  document.querySelector("#questions").innerHTML = data.questions.length ? data.questions.map((question) => `
    <article class="question-card">
      <strong>${escapeHtml(question.question_text)}</strong>
      <p>Repeated misses: ${Number(question.failed_count)}</p>
      <p>Wrong answer pattern: ${escapeHtml(question.wrong_answer)}</p>
      <p>Coaching focus: ${escapeHtml(question.correct_focus)}</p>
    </article>
  `).join("") : "<p class='form-message'>No repeated failed questions.</p>";

  document.querySelector("#attempts").innerHTML = data.attempts.length ? data.attempts.map((attempt) => `
    <div class="attempt-row">
      <span>${escapeHtml(attempt.module_title)}</span>
      <strong>${attempt.score}%</strong>
      <span class="${attempt.passed ? "pass" : "fail"}">${attempt.passed ? "Passed" : "Failed"}</span>
    </div>
  `).join("") : "<p class='form-message'>No recent attempts.</p>";

  unlockForm.style.display = hasLocks ? "block" : "none";
  notes.value = "";
  updateNoteCount();
  formMessage.textContent = "";
}

async function selectAgent(agentId) {
  selectedAgentId = agentId;
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

sortSelect.addEventListener("change", renderRoster);
notes.addEventListener("input", updateNoteCount);

unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.textContent = "Submitting signed intervention...";
  try {
    await api("/api/unlock", {
      method: "POST",
      body: JSON.stringify({
        lockId: selectedLockId,
        managerId: "MGR001",
        notes: notes.value
      })
    });
    formMessage.textContent = "Module unlocked and audit trail recorded.";
    await loadRoster();
    await selectAgent(selectedAgentId);
  } catch (error) {
    formMessage.textContent = error.message;
  }
});

document.querySelector("#simulateBtn").addEventListener("click", async () => {
  simMessage.textContent = "Evaluating result...";
  try {
    await api("/api/simulate-quiz", {
      method: "POST",
      body: JSON.stringify({
        agentId: simAgent.value,
        moduleId: simModule.value,
        score: simScore.value
      })
    });
    simMessage.textContent = "Quiz result evaluated. Roster refreshed.";
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
