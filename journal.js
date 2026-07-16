import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Elements
const welcomeText = document.getElementById("welcome-text");
const entriesList = document.getElementById("entries-list");
const entryTitle = document.getElementById("entry-title");
const entryText = document.getElementById("entry-text");
const addEntryBtn = document.getElementById("add-entry-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const logoutBtn = document.getElementById("logout-btn");
const moodPicker = document.getElementById("mood-picker");
const searchInput = document.getElementById("search-input");
const filterLabel = document.getElementById("filter-label");
const clearDateFilterBtn = document.getElementById("clear-date-filter");
const calendarGrid = document.getElementById("calendar-grid");
const calendarMonthLabel = document.getElementById("calendar-month-label");
const prevMonthBtn = document.getElementById("prev-month");
const nextMonthBtn = document.getElementById("next-month");
const photoInput = document.getElementById("photo-input");
const photoFilename = document.getElementById("photo-filename");
const inkPicker = document.getElementById("ink-picker");
const waxSealStamp = document.getElementById("wax-seal-stamp");

const moodStatsMonth = document.getElementById("mood-stats-month");
const moodStatsBody = document.getElementById("mood-stats-body");

const envelopeOverlay = document.getElementById("envelope-overlay");
const envelope = document.getElementById("envelope");
const letterDate = document.getElementById("letter-date");
const letterEntries = document.getElementById("letter-entries");

const photoLightboxOverlay = document.getElementById("photo-lightbox-overlay");
const photoLightboxImg = document.getElementById("photo-lightbox-img");

const toastContainer = document.getElementById("toast-container");

let currentUserId = null;
let allEntries = [];
let selectedMood = null;
let selectedDateFilter = null;
let calendarViewDate = new Date();
let editingEntryId = null;
let selectedPhotoFile = null;
let selectedInk = "sepia";
let selectedPaper = "lined";

// Expanded vintage/nude ink palette
const INK_LABELS = {
  sepia: "Sepia",
  ivory: "Ivory",
  dustyrose: "Dusty Rose",
  toffee: "Toffee Taupe",
  stone: "Stone",
  nude: "Nude",
  darkrose: "Dark Rose",
  blue: "Prussian Blue",
  charcoal: "Charcoal",
  olive: "Olive"
};

const PAPER_LABELS = { lined: "Lined", ledger: "Ledger", kraft: "Kraft", music: "Music Sheet" };

// Removes any existing "ink-*" class from an element (used before applying a new ink color)
function removeInkClasses(el) {
  Array.from(el.classList).forEach((cls) => {
    if (cls.startsWith("ink-")) el.classList.remove(cls);
  });
}

// ---------- AUTH GUARD ----------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserId = user.uid;

    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        welcomeText.textContent = `Welcome, ${data.fullName || data.username || "friend"}`;
      }
    } catch (err) {
      console.error("Could not load profile:", err);
    }

    loadEntries();
  } else {
    window.location.href = "index.html";
  }
});

// ---------- MOOD PICKER ----------
moodPicker.querySelectorAll(".mood-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    moodPicker.querySelectorAll(".mood-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedMood = btn.dataset.mood;
  });
});

// ---------- INK PICKER ----------
inkPicker.querySelectorAll(".ink-dot").forEach((btn) => {
  btn.addEventListener("click", () => {
    inkPicker.querySelectorAll(".ink-dot").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedInk = btn.dataset.ink;
    removeInkClasses(entryText);
    entryText.classList.add(`ink-${selectedInk}`);
  });
});

// ---------- PHOTO INPUT ----------
const MAX_PHOTO_BYTES = 700 * 1024; // stay safely under Firestore's 1MB doc limit

photoInput.addEventListener("change", () => {
  selectedPhotoFile = photoInput.files[0] || null;
  photoFilename.textContent = selectedPhotoFile ? `Clipped: ${selectedPhotoFile.name}` : "";
});

// Resizes + compresses an image file, returns a base64 data URL string
function fileToCompressedBase64(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Try decreasing quality until it fits comfortably in Firestore
        let q = quality;
        let dataUrl = canvas.toDataURL("image/jpeg", q);
        while (dataUrl.length > MAX_PHOTO_BYTES && q > 0.2) {
          q -= 0.1;
          dataUrl = canvas.toDataURL("image/jpeg", q);
        }

        if (dataUrl.length > MAX_PHOTO_BYTES) {
          reject(new Error("Photo is too large even after compression. Try a smaller image."));
          return;
        }

        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("Could not read that image file."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

// ---------- HELPERS ----------
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateKeyToNiceString(dateKey) {
  const [y, m, d] = dateKey.split("-");
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}

function resetForm() {
  entryTitle.value = "";
  entryText.value = "";
  moodPicker.querySelectorAll(".mood-btn").forEach((b) => b.classList.remove("selected"));
  selectedMood = null;
  editingEntryId = null;
  selectedPhotoFile = null;
  photoInput.value = "";
  photoFilename.textContent = "";
  addEntryBtn.textContent = "Add Entry";
  cancelEditBtn.classList.add("hidden");

  // Reset ink back to default
  selectedInk = "sepia";
  inkPicker.querySelectorAll(".ink-dot").forEach((b) => b.classList.toggle("selected", b.dataset.ink === "sepia"));
  removeInkClasses(entryText);
  entryText.classList.add("ink-sepia");
}

// ---------- TOAST ----------
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ---------- WAX SEAL SAVE ANIMATION ----------
function playSealAnimation() {
  waxSealStamp.classList.remove("stamping");
  // force reflow so the animation can be replayed back-to-back
  void waxSealStamp.offsetWidth;
  waxSealStamp.classList.add("stamping");
  setTimeout(() => waxSealStamp.classList.remove("stamping"), 900);
}

// ---------- ADD OR UPDATE ENTRY ----------
addEntryBtn.addEventListener("click", async () => {
  const title = entryTitle.value.trim();
  const text = entryText.value.trim();
  if (!text) return;

  addEntryBtn.disabled = true;
  const originalBtnText = addEntryBtn.textContent;
  addEntryBtn.textContent = "Saving...";

  try {
    // Convert photo to a compressed base64 string, if one was selected
    let photoURL = null;
    if (selectedPhotoFile) {
      addEntryBtn.textContent = "Processing photo...";
      photoURL = await fileToCompressedBase64(selectedPhotoFile);
      addEntryBtn.textContent = "Saving...";
    }

    if (editingEntryId) {
      const updateData = {
        title: title || "Untitled Entry",
        text: text,
        mood: selectedMood || "😐",
        inkColor: selectedInk,
        paper: selectedPaper,
        updatedAt: serverTimestamp()
      };
      if (photoURL) updateData.photoURL = photoURL;

      await updateDoc(doc(db, "entries", editingEntryId), updateData);
      showToast("Entry updated!", "success");
    } else {
      const now = new Date();

      const newEntry = {
        title: title || "Untitled Entry",
        text: text,
        mood: selectedMood || "😐",
        inkColor: selectedInk,
        paper: selectedPaper,
        userId: currentUserId,
        dateKey: toDateKey(now),
        createdAt: serverTimestamp()
      };
      if (photoURL) newEntry.photoURL = photoURL;

      await addDoc(collection(db, "entries"), newEntry);
      showToast("Entry sealed!", "success");
    }

    playSealAnimation();
    resetForm();
  } catch (error) {
    showToast("Something went wrong: " + error.message, "error");
  } finally {
    addEntryBtn.disabled = false;
    if (addEntryBtn.textContent === "Saving..." || addEntryBtn.textContent === "Processing photo...") {
      addEntryBtn.textContent = originalBtnText;
    }
  }
});

cancelEditBtn.addEventListener("click", () => {
  resetForm();
});

// ---------- LOAD ENTRIES (live) ----------
function loadEntries() {
  const q = query(
    collection(db, "entries"),
    where("userId", "==", currentUserId),
    orderBy("createdAt", "desc")
  );

  onSnapshot(q, (snapshot) => {
    allEntries = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    renderCalendar();
    renderEntries();
    renderMoodStats();
  }, (error) => {
    console.error("onSnapshot error:", error);
  });
}

// ---------- RENDER ENTRIES ----------
function renderEntries() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const isSearching = searchTerm.length > 0;

  // Don't show anything until the user picks a date on the calendar (or searches)
  if (!selectedDateFilter && !isSearching) {
    entriesList.innerHTML = `<p class="no-entries">Select a date on the calendar to view your entries.</p>`;
    filterLabel.classList.add("hidden");
    clearDateFilterBtn.classList.add("hidden");
    return;
  }

  let filtered = allEntries;

  if (selectedDateFilter) {
    filtered = filtered.filter((e) => e.dateKey === selectedDateFilter);
  }

  if (isSearching) {
    filtered = filtered.filter((e) =>
      (e.title || "").toLowerCase().includes(searchTerm) ||
      (e.text || "").toLowerCase().includes(searchTerm)
    );
  }

  if (selectedDateFilter) {
    const niceDate = dateKeyToNiceString(selectedDateFilter);
    filterLabel.textContent = `Showing entries from ${niceDate}`;
    filterLabel.classList.remove("hidden");
    clearDateFilterBtn.classList.remove("hidden");
  } else {
    filterLabel.classList.add("hidden");
    clearDateFilterBtn.classList.add("hidden");
  }

  entriesList.innerHTML = "";

  if (filtered.length === 0) {
    entriesList.innerHTML = `<p class="no-entries">No entries found.</p>`;
    return;
  }

  filtered.forEach((entry) => {
    const date = entry.createdAt
      ? entry.createdAt.toDate().toLocaleString()
      : "Just now";

    const ink = entry.inkColor || "sepia";

    const photoHtml = entry.photoURL
      ? `
        <div class="photo-frame">
          <div class="washi-tape tape-left"></div>
          <div class="washi-tape tape-right"></div>
          <img class="attached-photo" src="${entry.photoURL}" alt="Journal photo" />
          <div class="photo-caption">${entry.title || "Untitled Entry"}</div>
        </div>
      `
      : "";

    const entryEl = document.createElement("div");
    entryEl.className = `entry${isSearching ? " catalog-style" : ""}`;
    entryEl.innerHTML = `
      <div class="entry-top">
        <div class="entry-title-row">
          <span class="entry-mood">${entry.mood || "😐"}</span>
          <span class="entry-title">${entry.title || "Untitled Entry"}</span>
        </div>
      </div>
      ${photoHtml}
      <p class="entry-text ink-${ink}">${entry.text}</p>
      <div class="entry-meta-row">
        <p class="entry-date">${date}</p>
      </div>
      <div class="entry-actions">
        <button class="edit-btn" data-id="${entry.id}">Edit</button>
        <button class="delete-btn" data-id="${entry.id}">Delete</button>
      </div>
    `;
    entriesList.appendChild(entryEl);
  });

  document.querySelectorAll(".attached-photo").forEach((img) => {
    img.addEventListener("click", () => {
      openPhotoLightbox(img.src);
    });
  });

  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const entry = allEntries.find((en) => en.id === btn.dataset.id);
      if (!entry) return;

      entryTitle.value = entry.title === "Untitled Entry" ? "" : entry.title;
      entryText.value = entry.text;
      moodPicker.querySelectorAll(".mood-btn").forEach((b) => {
        b.classList.toggle("selected", b.dataset.mood === entry.mood);
      });
      selectedMood = entry.mood;

      // Restore ink + paper style used for this entry
      selectedInk = entry.inkColor || "sepia";
      selectedPaper = entry.paper || "lined";
      inkPicker.querySelectorAll(".ink-dot").forEach((b) => {
        b.classList.toggle("selected", b.dataset.ink === selectedInk);
      });
      removeInkClasses(entryText);
      entryText.classList.remove("paper-lined", "paper-ledger", "paper-kraft", "paper-music");
      entryText.classList.add(`ink-${selectedInk}`, `paper-${selectedPaper}`);

      editingEntryId = entry.id;
      addEntryBtn.textContent = "Save Changes";
      cancelEditBtn.classList.remove("hidden");

      document.querySelector(".entry-form").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("Delete this entry?")) {
        try {
          await deleteDoc(doc(db, "entries", btn.dataset.id));
          showToast("Entry deleted", "success");
          if (editingEntryId === btn.dataset.id) resetForm();
        } catch (error) {
          showToast("Could not delete: " + error.message, "error");
        }
      }
    });
  });
}

// ---------- SEARCH ----------
searchInput.addEventListener("input", renderEntries);

// ---------- CALENDAR ----------
function renderCalendar() {
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();

  calendarMonthLabel.textContent = calendarViewDate.toLocaleDateString(undefined, {
    month: "long", year: "numeric"
  });

  const firstDayOfMonth = new Date(year, month, 1);
  const startWeekday = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const datesWithEntries = new Set(allEntries.map((e) => e.dateKey));
  const todayKey = toDateKey(new Date());

  calendarGrid.innerHTML = "";

  for (let i = 0; i < startWeekday; i++) {
    const blank = document.createElement("div");
    blank.className = "calendar-day empty";
    calendarGrid.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const dateKey = toDateKey(cellDate);

    const cell = document.createElement("div");
    cell.className = "calendar-day";
    cell.textContent = day;

    const hasEntry = datesWithEntries.has(dateKey);
    if (hasEntry) cell.classList.add("has-entry");
    if (dateKey === todayKey) cell.classList.add("today");
    if (dateKey === selectedDateFilter) cell.classList.add("selected");

    cell.addEventListener("click", () => {
      selectedDateFilter = selectedDateFilter === dateKey ? null : dateKey;
      renderCalendar();
      renderEntries();

      if (hasEntry && selectedDateFilter === dateKey) {
        openEnvelope(dateKey);
      }
    });

    calendarGrid.appendChild(cell);
  }
}

prevMonthBtn.addEventListener("click", () => {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
  renderCalendar();
  renderMoodStats();
});

nextMonthBtn.addEventListener("click", () => {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
  renderCalendar();
  renderMoodStats();
});

clearDateFilterBtn.addEventListener("click", () => {
  selectedDateFilter = null;
  renderCalendar();
  renderEntries();
});

// ---------- MOOD STATS ----------
function renderMoodStats() {
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();

  moodStatsMonth.textContent = calendarViewDate.toLocaleDateString(undefined, {
    month: "long", year: "numeric"
  });

  const monthEntries = allEntries.filter((entry) => {
    if (!entry.dateKey) return false;
    const [entryYear, entryMonth] = entry.dateKey.split("-").map(Number);
    return entryYear === year && (entryMonth - 1) === month;
  });

  if (monthEntries.length === 0) {
    moodStatsBody.innerHTML = `<p class="no-entries" style="padding: 10px 0;">No entries yet this month.</p>`;
    return;
  }

  const moodCounts = {};
  monthEntries.forEach((entry) => {
    const mood = entry.mood || "😐";
    moodCounts[mood] = (moodCounts[mood] || 0) + 1;
  });

  const total = monthEntries.length;

  const stats = Object.entries(moodCounts)
    .map(([mood, count]) => ({
      mood,
      count,
      percent: Math.round((count / total) * 100)
    }))
    .sort((a, b) => b.count - a.count);

  const dominant = stats[0];

  let html = `<p class="mood-headline">Mostly feeling ${dominant.mood} this month (${dominant.percent}%)</p>`;
  html += `<div class="mood-stamp-grid">`;

  stats.forEach((stat) => {
    const isDominant = stat.mood === dominant.mood;
    html += `
      <div class="mood-stamp${isDominant ? " dominant" : ""}">
        <span class="stamp-emoji">${stat.mood}</span>
        <span class="stamp-percent">${stat.percent}%</span>
      </div>
    `;
  });

  html += `</div>`;
  moodStatsBody.innerHTML = html;
}

// ---------- ENVELOPE ----------
function openEnvelope(dateKey) {
  const entriesForDay = allEntries.filter((e) => e.dateKey === dateKey);
  if (entriesForDay.length === 0) return;

  letterDate.textContent = dateKeyToNiceString(dateKey);
  letterEntries.innerHTML = entriesForDay.map((entry) => {
    const time = entry.createdAt
      ? entry.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
    return `
      <div class="letter-entry">
        <div class="letter-entry-head">
          <span>${entry.mood || "😐"}</span>
          <span>${entry.title || "Untitled Entry"}</span>
        </div>
        <div class="ink-${entry.inkColor || "sepia"}">${entry.text}</div>
        <div class="letter-entry-time">${time}</div>
      </div>
    `;
  }).join("");

  envelopeOverlay.classList.remove("hidden");
  envelope.classList.remove("open");
}

function closeEnvelope() {
  const wasOpen = envelope.classList.contains("open");
  envelope.classList.remove("open");
  setTimeout(() => {
    envelopeOverlay.classList.add("hidden");
  }, wasOpen ? 400 : 0);
}

envelopeOverlay.addEventListener("click", (e) => {
  const letter = document.getElementById("letter");
  if (letter.contains(e.target)) return;

  if (envelope.classList.contains("open")) {
    closeEnvelope();
  } else if (envelope.contains(e.target)) {
    envelope.classList.add("open");
  } else {
    closeEnvelope();
  }
});

// ---------- PHOTO LIGHTBOX ----------
function openPhotoLightbox(src) {
  photoLightboxImg.src = src;
  photoLightboxOverlay.classList.remove("hidden");
}

function closePhotoLightbox() {
  photoLightboxOverlay.classList.add("hidden");
  photoLightboxImg.src = "";
}

photoLightboxOverlay.addEventListener("click", (e) => {
  if (e.target !== photoLightboxImg) {
    closePhotoLightbox();
  }
});

// ---------- LOG OUT ----------
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});
