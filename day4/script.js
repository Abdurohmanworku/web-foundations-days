// ---------- Select elements ----------
const noteText = document.querySelector("#note-text");
const charCount = document.querySelector("#char-count");
const wordCount = document.querySelector("#word-count");
const clearBtn = document.querySelector("#clear-btn");
const themeToggle = document.querySelector("#theme-toggle");

const MAX_CHARS = 200;
const WARNING_AT = 180;

// ---------- Counters ----------
function updateCounts() {
  const text = noteText.value;
  const chars = text.length;
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  charCount.textContent = `${chars} / ${MAX_CHARS} characters`;
  wordCount.textContent = `${words} words`;

  charCount.classList.remove("warning", "over");
  if (chars > MAX_CHARS) {
    charCount.classList.add("over");
  } else if (chars > WARNING_AT) {
    charCount.classList.add("warning");
  }
}

// ---------- Draft ----------
function saveDraft() {
  localStorage.setItem("draft", noteText.value);
}

function clearAll() {
  noteText.value = "";
  localStorage.removeItem("draft");
  updateCounts();
  noteText.focus();
}

noteText.addEventListener("input", function () {
  updateCounts();
  saveDraft();
});

clearBtn.addEventListener("click", clearAll);

noteText.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    clearAll();
  }
});

// ---------- Theme ----------
function applyTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
}

themeToggle.addEventListener("click", function () {
  const isDark = !document.body.classList.contains("dark");
  applyTheme(isDark);
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

// ---------- On page load: restore draft and theme ----------
const savedDraft = localStorage.getItem("draft");
if (savedDraft !== null) {
  noteText.value = savedDraft;
}

applyTheme(localStorage.getItem("theme") === "dark");
updateCounts();
