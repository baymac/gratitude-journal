let entries = [];
let currentId = null;
let currentReflectionQuestion = "";
let currentReflectionPrompt = "";

// Views
const listView = document.getElementById("list-view");
const detailView = document.getElementById("detail-view");
const formView = document.getElementById("form-view");

function showView(view) {
  [listView, detailView, formView].forEach((v) => v.classList.remove("active"));
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

  try {
    const res = await fetch("/api/entries");
    entries = await res.json();

    if (entries.length === 0) {
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
          ${e.gratefulFor ? `<div class="entry-grateful-preview">${escapeHtml(truncate(e.gratefulFor, 70))}</div>` : ""}
        </div>
        <div class="entry-date">${formatDate(e.date)}</div>
      </div>`
      )
      .join("");
  } catch (err) {
    list.innerHTML = `<div class="empty-state"><p>Could not load entries.</p><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "\u2026" : str;
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

  const sections = [
    { label: "Feeling", body: entry.feeling },
    { label: reflectionLabel, body: entry.reflection },
    { label: "Grateful For", body: entry.gratefulFor },
  ];

  content.innerHTML = `
    <div class="detail-hero">
      <div class="detail-day-num">Day ${escapeHtml(entry.day)}</div>
      <div class="detail-date-display">${formatDateLong(entry.date)}</div>
    </div>
    ${sections
      .map(
        (s) => `
      <div class="detail-section">
        <div class="section-label">${escapeHtml(s.label)}</div>
        <div class="section-body ${!s.body ? "section-body-empty" : ""}">${
          s.body ? escapeHtml(s.body) : "Nothing recorded"
        }</div>
      </div>`
      )
      .join("")}
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
  document.getElementById("f-grateful").value = "";

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
  document.getElementById("f-grateful").value = entry.gratefulFor;

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
  const gratefulFor = document.getElementById("f-grateful").value;
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
loadEntries();
