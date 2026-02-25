let entries = [];
let currentId = null;
let currentReflectionQuestion = "";
let currentReflectionPrompt = "";
let gratefulItems = [""];
const MAX_GRATEFUL_ITEMS = 25;

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
