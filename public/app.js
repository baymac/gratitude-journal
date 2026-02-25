let entries = [];
let currentId = null;
let currentReflectionQuestion = "";
let currentReflectionPrompt = "";
let currentAnalytics = null;
let gratefulItems = [""];
const MAX_GRATEFUL_ITEMS = 25;
const STORAGE_KEYS = {
  entries: "gratitude.entries.cache.v1",
  analytics: "gratitude.analytics.cache.v2",
  questState: "gratitude.quest.state.v1",
};

// Views
const listView = document.getElementById("list-view");
const detailView = document.getElementById("detail-view");
const formView = document.getElementById("form-view");
const analyticsView = document.getElementById("analytics-view");

function showView(view) {
  [listView, detailView, formView, analyticsView].forEach((v) => {
    if (v) v.classList.remove("active");
  });
  view.classList.add("active");
  window.scrollTo(0, 0);
}

// Theme
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
}

(function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) {
    document.documentElement.setAttribute("data-theme", saved);
  }
})();

function looksLikePromptMeta(text) {
  return /^\s*Theme:/i.test(String(text || ""));
}

function readStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function levelFromXpLocal(xp) {
  const val = Number(xp || 0);
  if (val >= 3200) return "Diamond";
  if (val >= 1900) return "Gold";
  if (val >= 900) return "Silver";
  return "Bronze";
}

function mergeAnalyticsWithLocalState(analytics) {
  if (!analytics || !Array.isArray(analytics.quests)) return analytics;

  const questState = readStoredJson(STORAGE_KEYS.questState, {});
  const today = todayStr();
  const mergedQuests = analytics.quests.map((quest) => {
    const local = questState[quest.id] || {};
    const done = Boolean(quest.done || local.done);
    const completedOn = local.completedOn || (done ? today : "");
    if (done) {
      questState[quest.id] = { done: true, completedOn };
    }
    return {
      ...quest,
      done,
      completedOn,
    };
  });

  writeStoredJson(STORAGE_KEYS.questState, questState);

  const completed = mergedQuests.filter((quest) => quest.done);
  const questXp = completed.reduce((sum, quest) => sum + Number(quest.rewardXp || 0), 0);
  const baseXp = Number(analytics.gamification?.xp || 0);
  const totalXp = baseXp + questXp;

  return {
    ...analytics,
    quests: mergedQuests,
    gamification: {
      ...(analytics.gamification || {}),
      xp: totalXp,
      level: levelFromXpLocal(totalXp),
      completedQuests: completed.length,
      totalQuests: mergedQuests.length,
    },
  };
}

function gratefulItemsFromText(text) {
  if (!text) return [];
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_GRATEFUL_ITEMS);
}

function serializeGratefulItems(items) {
  return items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
}

function canAddAnotherGratefulItem() {
  if (gratefulItems.length >= MAX_GRATEFUL_ITEMS) return false;
  const last = gratefulItems[gratefulItems.length - 1];
  return Boolean(last && last.trim());
}

function isDeleteDisabled(index) {
  return (
    index === 0 &&
    gratefulItems.length === 1 &&
    !String(gratefulItems[0] || "").trim()
  );
}

function updateGratefulControls() {
  const addBtn = document.getElementById("grateful-add-btn");
  const note = document.getElementById("grateful-limit-note");
  if (!addBtn || !note) return;

  const filledCount = gratefulItems.filter((item) => String(item || "").trim()).length;
  addBtn.disabled = !canAddAnotherGratefulItem();
  note.textContent = `${filledCount}/${MAX_GRATEFUL_ITEMS} items`;
}

function removeGratefulItem(index) {
  gratefulItems.splice(index, 1);
  if (gratefulItems.length === 0) gratefulItems = [""];
  renderGratefulItemsEditor();
}

function renderGratefulItemsEditor() {
  const container = document.getElementById("grateful-items");
  if (!container) return;
  if (gratefulItems.length === 0) gratefulItems = [""];

  container.innerHTML = gratefulItems
    .map(
      (item, index) => `
      <div class="grateful-item-row">
        <input
          type="text"
          class="grateful-item-input"
          data-index="${index}"
          value="${escapeHtml(item)}"
          placeholder="Add grateful item ${index + 1}"
          maxlength="220"
        />
        <button
          type="button"
          class="grateful-delete-btn"
          data-index="${index}"
          aria-label="Delete item ${index + 1}"
          ${isDeleteDisabled(index) ? "disabled" : ""}
        >
          Delete
        </button>
      </div>
    `
    )
    .join("");

  container.querySelectorAll(".grateful-item-input").forEach((input) => {
    input.addEventListener("input", (event) => {
      const idx = Number(event.target.dataset.index);
      gratefulItems[idx] = event.target.value;
      updateGratefulControls();
    });
  });

  container.querySelectorAll(".grateful-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      const idx = Number(event.currentTarget.dataset.index);
      removeGratefulItem(idx);
    });
  });

  updateGratefulControls();
}

function setGratefulItems(items) {
  gratefulItems =
    items && items.length
      ? items.slice(0, MAX_GRATEFUL_ITEMS).map((item) => String(item || ""))
      : [""];
  renderGratefulItemsEditor();
}

function addGratefulItem() {
  if (gratefulItems.length >= MAX_GRATEFUL_ITEMS) {
    alert("You can add up to 25 gratitude items.");
    return;
  }

  if (!canAddAnotherGratefulItem()) {
    alert("Add text to the current item before adding another.");
    return;
  }

  gratefulItems.push("");
  renderGratefulItemsEditor();

  const inputs = document.querySelectorAll(".grateful-item-input");
  const lastInput = inputs[inputs.length - 1];
  if (lastInput) lastInput.focus();
}

// Format date for display: DD/MM/YYYY
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}`;
}

// Format date for detail view: long form
function formatDateLong(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Fetch a reflection question from the API
async function fetchReflectionPrompt() {
  try {
    const res = await fetch("/api/prompt");
    const data = await res.json();
    const question = data.reflectionQuestion || data.question || data.prompt || "";
    return {
      question: String(question || "").trim(),
      prompt: String(data.reflectionPrompt || "").trim(),
    };
  } catch {
    return {
      question: "",
      prompt: "",
    };
  }
}

// Load entries
async function loadEntries() {
  const list = document.getElementById("entries-list");
  list.innerHTML = '<div class="loading">Loading<span class="loading-dots"></span></div>';

  const cachedEntries = readStoredJson(STORAGE_KEYS.entries, []);
  const cachedAnalyticsRaw = readStoredJson(STORAGE_KEYS.analytics, null);
  const cachedAnalytics = mergeAnalyticsWithLocalState(cachedAnalyticsRaw);
  if (Array.isArray(cachedEntries) && cachedEntries.length) {
    entries = cachedEntries;
    renderEntriesList();
  }
  currentAnalytics = cachedAnalytics;
  updateAnalyticsButton(cachedAnalytics, entries.length);

  try {
    const [entriesRes, analyticsRes] = await Promise.all([
      fetch("/api/entries"),
      fetch("/api/analytics").catch(() => null),
    ]);

    entries = await entriesRes.json();

    let analyticsRaw = null;
    if (analyticsRes && analyticsRes.ok) {
      analyticsRaw = await analyticsRes.json();
    }
    const analytics = mergeAnalyticsWithLocalState(analyticsRaw);
    currentAnalytics = analytics;
    updateAnalyticsButton(analytics, entries.length);

    writeStoredJson(STORAGE_KEYS.entries, entries);
    if (analyticsRaw) {
      writeStoredJson(STORAGE_KEYS.analytics, analyticsRaw);
    }

    renderEntriesList();
  } catch (err) {
    if (!entries.length) {
      currentAnalytics = null;
      updateAnalyticsButton(null, 0);
      list.innerHTML = `<div class="empty-state"><p>Could not load entries.</p><p>${escapeHtml(err.message)}</p></div>`;
    }
  }
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "\u2026" : str;
}

function scoreTone(value, lowIsGood = false) {
  const score = Number(value || 0);
  if (lowIsGood) {
    if (score <= 35) return "tone-good";
    if (score <= 65) return "tone-mid";
    return "tone-risk";
  }
  if (score >= 70) return "tone-good";
  if (score >= 45) return "tone-mid";
  return "tone-risk";
}

function levelClass(level) {
  const key = String(level || "").toLowerCase();
  if (!key) return "level-empty";
  return `level-${key}`;
}

function updateAnalyticsButton(analytics, entryCount) {
  const btn = document.getElementById("analytics-btn");
  const levelEl = document.getElementById("analytics-pill-level");
  if (!btn || !levelEl) return;

  btn.classList.remove("level-empty", "level-bronze", "level-silver", "level-gold", "level-diamond");

  if (!entryCount || !analytics) {
    btn.disabled = true;
    levelEl.textContent = "--";
    btn.classList.add("level-empty");
    btn.title = "Add entries to unlock analytics";
    return;
  }

  const level = analytics.gamification?.level || "Bronze";
  btn.disabled = false;
  levelEl.textContent = level;
  btn.classList.add(levelClass(level));
  btn.title = `Open analytics • ${level} level`;
}

function renderEntriesList() {
  const list = document.getElementById("entries-list");
  if (!list) return;

  if (!entries.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&mdash;</div>
        <p>No entries yet.<br/>Begin your gratitude journey.</p>
      </div>`;
    return;
  }

  list.innerHTML = entries
    .map(
      (e) => `
    <div class="entry-card" onclick="showDetail('${e.id}')">
      <div class="entry-day">Day ${e.day}</div>
      <div class="entry-body">
        <div class="entry-feeling">${escapeHtml(e.feeling) || "No feeling recorded"}</div>
        ${
          e.gratefulFor
            ? `<div class="entry-grateful-preview">${escapeHtml(
                truncate(gratefulItemsFromText(e.gratefulFor).join(" • "), 70)
              )}</div>`
            : ""
        }
      </div>
      <div class="entry-date">${formatDate(e.date)}</div>
    </div>`
    )
    .join("");
}

function renderAnalyticsContent(analytics, entryCount) {
  const content = document.getElementById("analytics-content");
  if (!content) return;

  if (!entryCount || !analytics) {
    content.innerHTML = "";
    return;
  }

  const scores = analytics.scores || {};
  const streaks = analytics.streaks || {};
  const writing = analytics.writing || {};
  const gamification = analytics.gamification || {};
  const quests = Array.isArray(analytics.quests) ? analytics.quests : [];
  const completedQuests = Number(
    gamification.completedQuests || quests.filter((quest) => quest.done).length,
  );
  const totalQuests = Number(gamification.totalQuests || quests.length);
  const topThemes = Array.isArray(analytics.themes?.top) ? analytics.themes.top : [];
  const topThemeText = topThemes.length
    ? topThemes.map((item) => `${item.theme} (${item.count})`).join(" • ")
    : "No clear theme distribution yet";

  const tooltip = (text) =>
    ` <span class="score-tip" tabindex="0" role="note" aria-label="${escapeHtml(text)}" data-tip="${escapeHtml(text)}" title="${escapeHtml(text)}">i</span>`;

  content.innerHTML = `
    <article class="analytics-card">
      <div class="analytics-head">
        <div class="analytics-kicker">Analytics</div>
        <div class="analytics-level">Level ${escapeHtml(gamification.level || "Bronze")} • ${escapeHtml(String(gamification.xp || 0))} XP</div>
      </div>

      <div class="analytics-grid">
        <div class="analytics-metric">
          <div class="analytics-label">Cooperation Score${tooltip("Higher is better. Measures consistency, streak strength, reflection depth, gratitude breadth, and social support mentions.")}</div>
          <div class="analytics-value ${scoreTone(scores.cooperation)}">${escapeHtml(String(scores.cooperation || 0))}</div>
        </div>
        <div class="analytics-metric">
          <div class="analytics-label">Defection Risk${tooltip("Lower is better. Estimates risk of losing journaling momentum from weak consistency, shallow reflections, or declining trend.")}</div>
          <div class="analytics-value ${scoreTone(scores.defectionRisk, true)}">${escapeHtml(String(scores.defectionRisk || 0))}</div>
        </div>
        <div class="analytics-metric">
          <div class="analytics-label">Current Streak${tooltip("Consecutive day run. Longer streaks improve cooperation score and reduce defection risk.")}</div>
          <div class="analytics-value">${escapeHtml(String(streaks.current || 0))} days</div>
        </div>
        <div class="analytics-metric">
          <div class="analytics-label">Reflection Depth${tooltip("Average reflection word count. More detail usually means better self-processing and better long-term outcomes.")}</div>
          <div class="analytics-value">${escapeHtml(String(writing.reflectionAvgWords || 0))} words</div>
        </div>
        <div class="analytics-metric">
          <div class="analytics-label">Nash Balance${tooltip("Higher is better. Balance of consistency (cooperation), variety (exploration), and low defection risk.")}</div>
          <div class="analytics-value ${scoreTone(scores.nashBalance)}">${escapeHtml(String(scores.nashBalance || 0))}</div>
        </div>
        <div class="analytics-metric">
          <div class="analytics-label">Exploration${tooltip("Higher is better. Measures how many different life themes appear across your entries.")}</div>
          <div class="analytics-value ${scoreTone(scores.exploration)}">${escapeHtml(String(scores.exploration || 0))}</div>
        </div>
      </div>

      <div class="analytics-focus">
        <div class="analytics-focus-label">Theme Spread${tooltip("Shows your top recurring focus themes. A broader spread usually increases exploration score.")}</div>
        <div class="analytics-focus-value">${escapeHtml(topThemeText)}</div>
      </div>

      <div class="quest-board">
        <div class="quest-board-head">
          <div class="quest-board-title">Quest Board</div>
          <div class="quest-board-progress">${escapeHtml(String(completedQuests))}/${escapeHtml(String(totalQuests))} done</div>
        </div>
        <ul class="quest-list">
          ${quests
            .map((quest) => {
              const progress = Number(quest.progress || 0);
              const target = Number(quest.target || 0);
              const done = Boolean(quest.done);
              const progressText = Number.isInteger(progress)
                ? `${progress}/${target}`
                : `${progress.toFixed(1)}/${target}`;
              return `
                <li class="quest-item ${done ? "quest-item-done" : ""}">
                  <span class="quest-mark">${done ? "✓" : "○"}</span>
                  <div class="quest-main">
                    <div class="quest-title">${escapeHtml(quest.title || "")}</div>
                    <div class="quest-meta">${escapeHtml(quest.category || "")} • ${escapeHtml(progressText)}</div>
                  </div>
                  <span class="quest-xp">+${escapeHtml(String(quest.rewardXp || 0))}xp</span>
                </li>
              `;
            })
            .join("")}
        </ul>
      </div>
    </article>
  `;
}

function showAnalytics() {
  if (!entries.length || !currentAnalytics) {
    alert("Add entries to unlock analytics.");
    return;
  }
  renderAnalyticsContent(currentAnalytics, entries.length);
  showView(analyticsView);
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function entryReflectionQuestion(entry) {
  if (entry.reflectionQuestion) return entry.reflectionQuestion;
  if (entry.reflectionPrompt && !looksLikePromptMeta(entry.reflectionPrompt)) {
    return entry.reflectionPrompt;
  }
  return "";
}

function isTodayEntry(entry) {
  return Boolean(entry && entry.date === todayStr());
}

function updateDetailActionState(entry) {
  const canMutate = isTodayEntry(entry);
  const editBtn = document.getElementById("edit-btn");
  const deleteBtn = document.getElementById("delete-btn");
  if (!editBtn || !deleteBtn) return;

  editBtn.disabled = !canMutate;
  deleteBtn.disabled = !canMutate;
  editBtn.title = canMutate ? "Edit" : "Only today's journal can be edited";
  deleteBtn.title = canMutate ? "Delete" : "Only today's journal can be deleted";
}

// Show detail
function showDetail(id) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  currentId = id;

  const content = document.getElementById("detail-content");
  const reflectionLabel = entryReflectionQuestion(entry) || "Reflection";
  const gratefulList = gratefulItemsFromText(entry.gratefulFor);

  content.innerHTML = `
    <div class="detail-hero">
      <div class="detail-day-num">Day ${escapeHtml(entry.day)}</div>
      <div class="detail-date-display">${formatDateLong(entry.date)}</div>
    </div>
    <div class="detail-section">
      <div class="section-label">Feeling</div>
      <div class="section-body ${!entry.feeling ? "section-body-empty" : ""}">${
        entry.feeling ? escapeHtml(entry.feeling) : "Nothing recorded"
      }</div>
    </div>
    <div class="detail-section">
      <div class="section-label">${escapeHtml(reflectionLabel)}</div>
      <div class="section-body ${!entry.reflection ? "section-body-empty" : ""}">${
        entry.reflection ? escapeHtml(entry.reflection) : "Nothing recorded"
      }</div>
    </div>
    <div class="detail-section">
      <div class="section-label">Grateful For</div>
      ${
        gratefulList.length
          ? `<ul class="grateful-detail-list">${gratefulList
              .map((item) => `<li>${escapeHtml(item)}</li>`)
              .join("")}</ul>`
          : '<div class="section-body section-body-empty">Nothing recorded</div>'
      }
    </div>
  `;

  updateDetailActionState(entry);
  showView(detailView);
}

// Format today for display
function formatTodayLong() {
  return formatDateLong(todayStr());
}

// Show form (new)
async function showForm() {
  const todayEntry = entries.find((entry) => entry.date === todayStr());
  if (todayEntry) {
    alert("Today's journal is done.");
    showDetail(todayEntry.id);
    return;
  }

  currentId = null;
  currentReflectionQuestion = "";
  currentReflectionPrompt = "";

  document.getElementById("form-title").textContent = "New Entry";
  document.getElementById("f-id").value = "";

  document.getElementById("f-day-display").textContent = entries.length + 1;
  document.getElementById("f-date-display").textContent = formatTodayLong();
  document.getElementById("f-feeling").value = "";
  document.getElementById("f-reflection").value = "";
  setGratefulItems([""]);

  const label = document.getElementById("f-reflection-label");
  label.textContent = "Reflection";
  showView(formView);

  const generated = await fetchReflectionPrompt();
  currentReflectionQuestion = generated.question;
  currentReflectionPrompt = generated.prompt;
  label.textContent = currentReflectionQuestion || "Reflection";
}

// Edit current
function editCurrent() {
  const entry = entries.find((e) => e.id === currentId);
  if (!entry) return;
  if (!isTodayEntry(entry)) {
    alert("Only today's journal can be edited.");
    return;
  }

  document.getElementById("form-title").textContent = "Edit Entry";
  document.getElementById("f-id").value = entry.id;
  document.getElementById("f-day-display").textContent = entry.day;
  document.getElementById("f-date-display").textContent = formatDateLong(entry.date);
  document.getElementById("f-feeling").value = entry.feeling;
  document.getElementById("f-reflection").value = entry.reflection;
  setGratefulItems(gratefulItemsFromText(entry.gratefulFor));

  currentReflectionQuestion = entryReflectionQuestion(entry);
  currentReflectionPrompt = entry.reflectionPrompt || "";
  document.getElementById("f-reflection-label").textContent =
    currentReflectionQuestion || "Reflection";

  showView(formView);
}

// Save entry
async function saveEntry(e) {
  e.preventDefault();
  const btn = document.querySelector(".save-btn");
  btn.disabled = true;
  btn.textContent = "Saving\u2026";

  const feeling = document.getElementById("f-feeling").value;
  const reflection = document.getElementById("f-reflection").value;
  const gratefulFor = serializeGratefulItems(gratefulItems);
  const editId = document.getElementById("f-id").value;

  try {
    const payload = {
      feeling,
      reflection,
      reflectionPrompt: currentReflectionPrompt,
      reflectionQuestion: currentReflectionQuestion,
      gratefulFor,
    };

    if (editId) {
      const res = await fetch(`/api/entries/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let message = "Failed to update entry";
        try {
          const data = await res.json();
          message = data.error || message;
        } catch {}
        throw new Error(message);
      }
    } else {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let message = "Failed to create entry";
        try {
          const data = await res.json();
          message = data.error || message;
        } catch {}
        throw new Error(message);
      }
    }

    await loadEntries();
    showList();
  } catch (err) {
    alert("Failed to save: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Entry";
  }
}

// Delete current
async function deleteCurrent() {
  if (!currentId) return;
  const entry = entries.find((e) => e.id === currentId);
  if (!isTodayEntry(entry)) {
    alert("Only today's journal can be deleted.");
    return;
  }
  if (!confirm("Delete this entry?")) return;

  try {
    await fetch(`/api/entries/${currentId}`, { method: "DELETE" });
    await loadEntries();
    showList();
  } catch (err) {
    alert("Failed to delete: " + err.message);
  }
}

// Show list
function showList() {
  currentId = null;
  showView(listView);
}

// Today as YYYY-MM-DD
function todayStr() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

// Init
const gratefulAddBtn = document.getElementById("grateful-add-btn");
if (gratefulAddBtn) {
  gratefulAddBtn.addEventListener("click", addGratefulItem);
}
setGratefulItems([""]);
loadEntries();
