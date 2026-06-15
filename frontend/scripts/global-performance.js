const GLOBAL_ACTION_LABELS = {
  attack: "ataque",
  dodgeLeft: "esquiva esquerda",
  dodgeRight: "esquiva direita",
  duck: "agachar",
  jump: "pular"
};

let globalPerformanceLoading = false;

function setGlobalPerformanceMessage(message, type = "info") {
  const element = document.getElementById("globalPerformanceMessage");
  if (!element) return;
  element.textContent = message || "";
  element.dataset.type = type;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatGlobalPercent(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? `${numberValue.toFixed(1)}%` : "--";
}

function formatGlobalSeconds(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? `${numberValue.toFixed(2)}s` : "--";
}

function sexGlobalLabel(value) {
  if (value === "female") return "Feminino";
  if (value === "male") return "Masculino";
  return "--";
}

function actionGlobalLabel(value) {
  return GLOBAL_ACTION_LABELS[value] || String(value || "--");
}

function buildFilterQuery() {
  const form = document.getElementById("globalPerformanceFilters");
  const params = new URLSearchParams();
  if (!form) return params;

  new FormData(form).forEach((value, key) => {
    const text = String(value || "").trim();
    if (text) params.set(key, text);
  });

  return params;
}

async function fetchGlobalPerformance() {
  const params = buildFilterQuery();
  const query = params.toString();
  const response = await fetch(`/api/admin/performance/global${query ? `?${query}` : ""}`, {
    headers: getAuthHeaders(),
    cache: "no-store"
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parsed.error || "Não foi possível carregar o desempenho global.");
  }
  return parsed;
}

function renderSummary(payload = {}) {
  const summary = payload.summary || {};
  const summaryEl = document.getElementById("globalPerformanceSummary");
  const actionsEl = document.getElementById("globalActionSummary");
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="admin-performance-stat"><span>Usuários</span><strong>${summary.users || 0}</strong></div>
      <div class="admin-performance-stat"><span>Sessões</span><strong>${summary.sessions || 0}</strong></div>
      <div class="admin-performance-stat"><span>Ações</span><strong>${summary.actions || 0}</strong></div>
      <div class="admin-performance-stat"><span>Precisão média</span><strong>${formatGlobalPercent(summary.averageAccuracy)}</strong></div>
      <div class="admin-performance-stat"><span>Reação média</span><strong>${formatGlobalSeconds(summary.averageReaction)}</strong></div>
    `;
  }

  if (!actionsEl) return;
  const entries = Object.entries(payload.byAction || {});
  actionsEl.innerHTML = entries.length
    ? entries.map(([action, stats]) => `
      <div>
        <strong>${escapeHtml(actionGlobalLabel(action))}</strong>
        <span>${stats.attempts || 0} ações | ${formatGlobalPercent(stats.accuracy)} | reação ${formatGlobalSeconds(stats.avgReaction)}</span>
      </div>
    `).join("")
    : '<div class="admin-empty">Sem ações registradas.</div>';
}

function renderUserDetails(row = {}) {
  const entries = Object.entries(row.byAction || {});
  if (!entries.length) return '<div class="performance-details-grid"><span>Sem detalhes por ação.</span></div>';

  return `
    <div class="performance-details-grid">
      ${entries.map(([action, stats]) => `
        <div class="performance-detail-card">
          <strong>${escapeHtml(actionGlobalLabel(action))}</strong>
          <span>Ações: ${stats.attempts || 0}</span>
          <span>Acertos: ${stats.hits || 0}</span>
          <span>Precisão: ${formatGlobalPercent(stats.accuracy)}</span>
          <span>Reação: ${formatGlobalSeconds(stats.avgReaction)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderUsers(payload = {}) {
  const tbody = document.getElementById("globalPerformanceTable");
  if (!tbody) return;

  const rows = Array.isArray(payload.users) ? payload.users : [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8">Nenhum usuário com desempenho corresponde aos filtros.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row, index) => {
    const user = row.user || {};
    const totals = row.totals || {};
    const name = user.displayName || user.email || user.username || "Usuário";
    return `
      <tr>
        <td>${escapeHtml(name)}</td>
        <td>${sexGlobalLabel(user.sex || user.gender)}</td>
        <td>${user.age || "--"}</td>
        <td>${row.sessions || 0}</td>
        <td>${totals.attempts || 0}</td>
        <td>${formatGlobalPercent(totals.overallAccuracy)}</td>
        <td>${formatGlobalSeconds(totals.overallAvgReaction)}</td>
        <td><button class="landing-mini-button" type="button" data-performance-detail="${index}">Detalhes</button></td>
      </tr>
      <tr class="performance-detail-row" data-performance-detail-row="${index}" hidden>
        <td colspan="8">${renderUserDetails(row)}</td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-performance-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      const detailRow = tbody.querySelector(`[data-performance-detail-row="${button.dataset.performanceDetail}"]`);
      if (!detailRow) return;
      detailRow.hidden = !detailRow.hidden;
      button.textContent = detailRow.hidden ? "Detalhes" : "Ocultar";
    });
  });
}

function renderGlobalPerformance(payload = {}) {
  renderSummary(payload);
  renderUsers(payload);
}

async function loadGlobalPerformance() {
  if (!isLoggedIn()) {
    setGlobalPerformanceMessage("Entre com uma conta de administrador para acessar esta página.", "error");
    return;
  }
  if (!isAdmin()) {
    setGlobalPerformanceMessage("Esta página é exclusiva para administradores.", "error");
    return;
  }
  if (globalPerformanceLoading) return;

  globalPerformanceLoading = true;
  setGlobalPerformanceMessage("Carregando desempenho global...", "info");
  try {
    const payload = await fetchGlobalPerformance();
    renderGlobalPerformance(payload);
    setGlobalPerformanceMessage("Desempenho global carregado.", "success");
  } catch (error) {
    setGlobalPerformanceMessage(error.message, "error");
  } finally {
    globalPerformanceLoading = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("globalPerformanceFilters")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadGlobalPerformance();
  });

  document.getElementById("refreshPerformanceButton")?.addEventListener("click", () => {
    void loadGlobalPerformance();
  });

  document.getElementById("clearPerformanceFilters")?.addEventListener("click", () => {
    const form = document.getElementById("globalPerformanceFilters");
    if (form) form.reset();
    void loadGlobalPerformance();
  });
});

window.addEventListener("auth-state-change", () => {
  void loadGlobalPerformance();
});
