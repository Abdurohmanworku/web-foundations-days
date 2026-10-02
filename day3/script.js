// ---------- Starting data ----------
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const VALID_CATEGORIES = ["personal", "work", "study"];

// Trim the ends and collapse repeated spaces into one.
function cleanText(text) {
  return text.trim().replace(/\s+/g, " ");
}

// ---------- 1. searchNotes ----------
// Returns every note whose text contains `word`, ignoring case.
function searchNotes(word) {
  const target = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(target));
}

// ---------- 2. longestNote ----------
// Returns the note with the most characters, or null if there are none.
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// ---------- 3. countByCategory ----------
// Returns an object such as { personal: 2, study: 2, work: 1 }.
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category] === undefined) {
      counts[note.category] = 1;
    } else {
      counts[note.category]++;
    }
  }
  return counts;
}

// ---------- 4. getSummary ----------
// Returns a sentence such as "5 notes: 2 personal, 1 work, 2 study."
function getSummary() {
  const total = notes.length;
  const word = total === 1 ? "note" : "notes";
  if (total === 0) {
    return `${total} ${word}.`;
  }
  const counts = countByCategory();
  const parts = [];
  for (const category of VALID_CATEGORIES) {
    if (counts[category] > 0) {
      parts.push(`${counts[category]} ${category}`);
    }
  }
  return `${total} ${word}: ${parts.join(", ")}.`;
}

// ---------- 5. isDuplicate ----------
// True if a note with the same text exists (ignoring case and extra spaces).
function isDuplicate(text) {
  const target = cleanText(text).toLowerCase();
  return notes.some((note) => cleanText(note.text).toLowerCase() === target);
}

// ---------- 6. addNote ----------
// Adds a note if valid. Returns true when added, false otherwise (and logs why).
function addNote(text, category) {
  const cleaned = typeof text === "string" ? cleanText(text) : "";

  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("Not added: text must be 1-200 characters.");
    return false;
  }
  if (!VALID_CATEGORIES.includes(category)) {
    console.log("Not added: category must be personal, work or study.");
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log("Not added: a note with this text already exists.");
    return false;
  }

  const nextId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  notes.push({ id: nextId, text: cleaned, category: category });
  return true;
}

// =====================================================
// TESTS (expected output is written next to each call)
// =====================================================

// --- searchNotes ---
console.log("searchNotes('the'):", searchNotes("the"));
// Expected: array with 2 notes: id 2 "Finish the Day 3 assignment" and id 3 "Email the project report to Grace"
console.log("searchNotes('JAVASCRIPT'):", searchNotes("JAVASCRIPT"));
// Expected: array with 1 note: id 4 "Revise JavaScript arrays" (case ignored)
console.log("searchNotes('zebra'):", searchNotes("zebra"));
// Expected: [] (edge case: no results)

// --- longestNote ---
console.log("longestNote():", longestNote());
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }
const savedNotes = notes; // keep the real array safe
notes = [];
console.log("longestNote() with no notes:", longestNote());
// Expected: null (edge case: empty array)
notes = savedNotes;

// --- countByCategory ---
console.log("countByCategory():", countByCategory());
// Expected: { personal: 2, study: 2, work: 1 }  (same counts as the brief; key order follows the notes)
notes = [];
console.log("countByCategory() with no notes:", countByCategory());
// Expected: {} (edge case: empty array)
notes = savedNotes;

// --- getSummary ---
console.log("getSummary():", getSummary());
// Expected: "5 notes: 2 personal, 1 work, 2 study."
notes = [savedNotes[2]];
console.log("getSummary() with one note:", getSummary());
// Expected: "1 note: 1 work." (edge case: singular "note")
notes = [];
console.log("getSummary() with no notes:", getSummary());
// Expected: "0 notes." (edge case: empty array)
notes = savedNotes;

// --- isDuplicate ---
console.log("isDuplicate('Call mum'):", isDuplicate("Call mum"));
// Expected: true
console.log("isDuplicate('  CALL   MUM  '):", isDuplicate("  CALL   MUM  "));
// Expected: true (edge case: different case and extra spaces)
console.log("isDuplicate('Call dad'):", isDuplicate("Call dad"));
// Expected: false

// --- addNote (these change the notes array, so they come last) ---
console.log("addNote('Pay electricity bill', 'personal'):", addNote("Pay electricity bill", "personal"));
// Expected: true (nothing logged before it)
console.log("addNote('  pay   ELECTRICITY bill ', 'work'):", addNote("  pay   ELECTRICITY bill ", "work"));
// Expected: logs "Not added: a note with this text already exists." then false
console.log("addNote('', 'work'):", addNote("", "work"));
// Expected: logs "Not added: text must be 1-200 characters." then false
console.log("addNote('   ', 'work'):", addNote("   ", "work"));
// Expected: logs "Not added: text must be 1-200 characters." then false (only spaces)
console.log("addNote(201 characters, 'work'):", addNote("a".repeat(201), "work"));
// Expected: logs "Not added: text must be 1-200 characters." then false
console.log("addNote(200 characters, 'work'):", addNote("a".repeat(200), "work"));
// Expected: true (edge case: exactly 200 characters is allowed)
console.log("addNote('Go running', 'hobby'):", addNote("Go running", "hobby"));
// Expected: logs "Not added: category must be personal, work or study." then false

// Final check after the successful additions
console.log("getSummary() at the end:", getSummary());
// Expected: "7 notes: 3 personal, 2 work, 2 study."
