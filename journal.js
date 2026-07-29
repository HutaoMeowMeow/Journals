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
  deleteField,
  doc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Elements
const welcomeText = document.getElementById("welcome-text");
const entriesList = document.getElementById("entries-list");
const favoritesList = document.getElementById("favorites-list");
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
const currentPhotoPreview = document.getElementById("current-photo-preview");
const inkPicker = document.getElementById("ink-picker");
const paperSelect = document.getElementById("paper-select");
const waxSealStamp = document.getElementById("wax-seal-stamp");
const favoriteToggleBtn = document.getElementById("favorite-toggle-btn");
const favoriteToggleLabel = document.getElementById("favorite-toggle-label");

const moodStatsMonth = document.getElementById("mood-stats-month");
const moodStatsBody = document.getElementById("mood-stats-body");
const streakCountEl = document.getElementById("streak-count");
const streakStatsBody = document.getElementById("streak-stats-body");

const envelopeOverlay = document.getElementById("envelope-overlay");
const envelope = document.getElementById("envelope");
const letterDate = document.getElementById("letter-date");
const letterEntries = document.getElementById("letter-entries");

const photoLightboxOverlay = document.getElementById("photo-lightbox-overlay");
const photoLightboxImg = document.getElementById("photo-lightbox-img");

const toastContainer = document.getElementById("toast-container");

const ledgerTabs = document.getElementById("ledger-tabs");
const tabButtons = Array.from(document.querySelectorAll(".ledger-tab"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

// Album + Bin elements
const corkboard = document.getElementById("corkboard");
const binList = document.getElementById("bin-list");
const emptyBinBtn = document.getElementById("empty-bin-btn");

const BIN_RETENTION_DAYS = 7;
const BIN_RETENTION_MS = BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000;

let currentUserId = null;
let allEntries = [];
let selectedMood = null;
let selectedDateFilter = null;
let calendarViewDate = new Date();
let editingEntryId = null;
let selectedPhotoFile = null;
let selectedInk = "sepia";
let selectedPaper = "lined";
let selectedFavorite = false;
let activeTab = "write";
let isPurging = false;
let currentEntryPhotoURL = null; // photo already saved on the entry being edited
let removeExistingPhoto = false;  // true when the user removed that saved photo

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

function removePaperClasses(el) {
  Array.from(el.classList).forEach((cls) => {
    if (cls.startsWith("paper-")) el.classList.remove(cls);
  });
}

// Entries that are NOT sitting in the bin — used for everything except the Bin panel
function activeEntries() {
  return allEntries.filter((e) => !e.deleted);
}

function binnedEntries() {
  return allEntries.filter((e) => e.deleted);
}

// ---------- TAB NAVIGATION ----------
function switchTab(tabName) {
  activeTab = tabName;

  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.panel !== tabName);
  });

  if (tabName === "pages") renderEntries();
  if (tabName === "favorites") renderFavorites();
  if (tabName === "album") renderAlbum();
  if (tabName === "bin") renderBin();
  if (tabName === "almanac") {
    renderCalendar();
    renderMoodStats();
    renderStreakStats();
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

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

// ---------- PAPER PICKER ----------
paperSelect.addEventListener("change", () => {
  selectedPaper = paperSelect.value;
  removePaperClasses(entryText);
  entryText.classList.add(`paper-${selectedPaper}`);
});
// Set initial paper class to match default dropdown value
entryText.classList.add(`paper-${selectedPaper}`);

// ---------- FAVORITE TOGGLE (for the entry being written/edited) ----------
favoriteToggleBtn.addEventListener("click", () => {
  selectedFavorite = !selectedFavorite;
  updateFavoriteToggleUI();
});

function updateFavoriteToggleUI() {
  favoriteToggleBtn.classList.toggle("active", selectedFavorite);
  favoriteToggleBtn.setAttribute("aria-pressed", selectedFavorite ? "true" : "false");
  favoriteToggleLabel.textContent = selectedFavorite
    ? "Pinned as a favorite"
    : "Pin this entry as a favorite";
}

// ---------- PHOTO INPUT ----------
const MAX_PHOTO_BYTES = 700 * 1024; // stay safely under Firestore's 1MB doc limit

photoInput.addEventListener("change", () => {
  selectedPhotoFile = photoInput.files[0] || null;
  photoFilename.textContent = selectedPhotoFile ? `Clipped: ${selectedPhotoFile.name}` : "";
  // Picking a new file supersedes any "removed" state from the old photo
  if (selectedPhotoFile) removeExistingPhoto = false;
});

// Shows the photo already saved on the entry currently being edited, with a way to remove it
function renderCurrentPhotoPreview() {
  if (!currentEntryPhotoURL) {
    currentPhotoPreview.classList.add("hidden");
    currentPhotoPreview.innerHTML = "";
    return;
  }
  currentPhotoPreview.classList.remove("hidden");
  currentPhotoPreview.innerHTML = `
    <img src="${currentEntryPhotoURL}" alt="Current photo" />
    <button type="button" id="remove-current-photo-btn" class="remove-current-photo-btn">
      Remove this photo
    </button>
  `;
  document.getElementById("remove-current-photo-btn").addEventListener("click", () => {
    currentEntryPhotoURL = null;
    removeExistingPhoto = true;
    renderCurrentPhotoPreview();
  });
}

// Deletes just the photo from a saved entry (used from entry cards and the Album)
async function removePhotoFromEntry(entryId) {
  try {
    await updateDoc(doc(db, "entries", entryId), { photoURL: deleteField() });
    showToast("Photo removed", "success");
  } catch (error) {
    showToast("Could not remove photo: " + error.message, "error");
  }
}

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

  // Reset paper back to default
  selectedPaper = "lined";
  paperSelect.value = "lined";
  removePaperClasses(entryText);
  entryText.classList.add("paper-lined");

  // Reset favorite toggle
  selectedFavorite = false;
  updateFavoriteToggleUI();

  // Reset current-photo preview state
  currentEntryPhotoURL = null;
  removeExistingPhoto = false;
  renderCurrentPhotoPreview();
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
        favorite: selectedFavorite,
        updatedAt: serverTimestamp()
      };
      if (photoURL) {
        updateData.photoURL = photoURL;
      } else if (removeExistingPhoto) {
        updateData.photoURL = deleteField();
      }

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
        favorite: selectedFavorite,
        deleted: false,
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
    if (activeTab === "pages") renderEntries();
    if (activeTab === "favorites") renderFavorites();
    if (activeTab === "album") renderAlbum();
    if (activeTab === "bin") renderBin();
    renderMoodStats();
    renderStreakStats();
    updateStreakBadge();
    purgeExpiredBinEntries();
  }, (error) => {
    console.error("onSnapshot error:", error);
  });
}

// ---------- BUILD A SINGLE ENTRY CARD ----------
function buildEntryCard(entry, { catalogStyle = false } = {}) {
  const date = entry.createdAt
    ? entry.createdAt.toDate().toLocaleString()
    : "Just now";

  const ink = entry.inkColor || "sepia";
  const isFavorite = !!entry.favorite;

  const photoHtml = entry.photoURL
    ? `
      <div class="photo-frame">
        <div class="washi-tape tape-left"></div>
        <div class="washi-tape tape-right"></div>
        <button type="button" class="remove-photo-btn" data-id="${entry.id}" title="Remove this photo">×</button>
        <img class="attached-photo" src="${entry.photoURL}" alt="Journal photo" />
        <div class="photo-caption">${entry.title || "Untitled Entry"}</div>
      </div>
    `
    : "";

  const entryEl = document.createElement("div");
  entryEl.className = `entry${catalogStyle ? " catalog-style" : ""}${isFavorite ? " favorited" : ""}`;
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
      <button class="pin-btn${isFavorite ? " active" : ""}" data-id="${entry.id}" title="${isFavorite ? "Remove from favorites" : "Pin as favorite"}">
        <span class="ribbon-icon" aria-hidden="true"></span>${isFavorite ? "Pinned" : "Pin"}
      </button>
      <button class="edit-btn" data-id="${entry.id}">Edit</button>
      <button class="delete-btn" data-id="${entry.id}" title="Move to bin">Bin</button>
    </div>
  `;

  entryEl.querySelector(".attached-photo")?.addEventListener("click", (e) => {
    openPhotoLightbox(e.target.src);
  });

  entryEl.querySelector(".remove-photo-btn")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (confirm("Remove this photo? The entry text will stay.")) {
      await removePhotoFromEntry(entry.id);
      // Keep the write form's preview in sync if this is the entry being edited
      if (editingEntryId === entry.id) {
        currentEntryPhotoURL = null;
        removeExistingPhoto = false;
        renderCurrentPhotoPreview();
      }
    }
  });

  entryEl.querySelector(".pin-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "entries", entry.id), { favorite: !isFavorite });
      showToast(!isFavorite ? "Pinned to favorites!" : "Unpinned", "success");
    } catch (error) {
      showToast("Could not update: " + error.message, "error");
      btn.disabled = false;
    }
  });

  entryEl.querySelector(".edit-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    startEditingEntry(entry);
  });

  // "Delete" now moves the entry to the Bin instead of destroying it right away
  entryEl.querySelector(".delete-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (confirm("Move this entry to the bin? You can restore it within 7 days.")) {
      try {
        await updateDoc(doc(db, "entries", entry.id), {
          deleted: true,
          deletedAt: serverTimestamp()
        });
        showToast("Entry moved to bin", "success");
        if (editingEntryId === entry.id) resetForm();
      } catch (error) {
        showToast("Could not move to bin: " + error.message, "error");
      }
    }
  });

  return entryEl;
}

function startEditingEntry(entry) {
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
  paperSelect.value = selectedPaper;
  removeInkClasses(entryText);
  removePaperClasses(entryText);
  entryText.classList.add(`ink-${selectedInk}`, `paper-${selectedPaper}`);

  // Restore favorite state
  selectedFavorite = !!entry.favorite;
  updateFavoriteToggleUI();

  // Show the entry's existing photo (if any) with a remove option
  currentEntryPhotoURL = entry.photoURL || null;
  removeExistingPhoto = false;
  renderCurrentPhotoPreview();

  editingEntryId = entry.id;
  addEntryBtn.textContent = "Save Changes";
  cancelEditBtn.classList.remove("hidden");

  switchTab("write");
  requestAnimationFrame(() => {
    document.querySelector(".entry-form").scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

// ---------- BUILD A BIN CARD (restore / delete forever) ----------
function buildBinCard(entry) {
  const date = entry.createdAt
    ? entry.createdAt.toDate().toLocaleString()
    : "Just now";

  const ink = entry.inkColor || "sepia";

  let daysLeftText = "";
  if (entry.deletedAt && typeof entry.deletedAt.toDate === "function") {
    const deletedTime = entry.deletedAt.toDate().getTime();
    const msLeft = BIN_RETENTION_MS - (Date.now() - deletedTime);
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
    daysLeftText = daysLeft > 0
      ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
      : "Purging soon";
  }

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
  entryEl.className = "entry catalog-style bin-entry";
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
      <p class="bin-days-left">${daysLeftText}</p>
    </div>
    <div class="entry-actions">
      <button class="restore-btn" data-id="${entry.id}">Restore</button>
      <button class="delete-btn" data-id="${entry.id}" title="Delete forever">Delete Forever</button>
    </div>
  `;

  entryEl.querySelector(".attached-photo")?.addEventListener("click", (e) => {
    openPhotoLightbox(e.target.src);
  });

  entryEl.querySelector(".restore-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "entries", entry.id), { deleted: false, deletedAt: null });
      showToast("Entry restored", "success");
    } catch (error) {
      showToast("Could not restore: " + error.message, "error");
      btn.disabled = false;
    }
  });

  entryEl.querySelector(".delete-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (confirm("Permanently delete this entry? This cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "entries", entry.id));
        showToast("Entry permanently deleted", "success");
      } catch (error) {
        showToast("Could not delete: " + error.message, "error");
      }
    }
  });

  return entryEl;
}

// ---------- RENDER ENTRIES (Pages tab) ----------
function renderEntries() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const isSearching = searchTerm.length > 0;

  // Don't show anything until the user picks a date on the calendar (or searches)
  if (!selectedDateFilter && !isSearching) {
    entriesList.innerHTML = `<p class="no-entries">Select a date from the Almanac, or search, to view your pages.</p>`;
    filterLabel.classList.add("hidden");
    clearDateFilterBtn.classList.add("hidden");
    return;
  }

  let filtered = activeEntries();

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
    entriesList.appendChild(buildEntryCard(entry, { catalogStyle: isSearching }));
  });
}

// ---------- RENDER FAVORITES (Favorites tab) ----------
function renderFavorites() {
  const favorites = activeEntries().filter((e) => e.favorite);

  favoritesList.innerHTML = "";

  if (favorites.length === 0) {
    favoritesList.innerHTML = `<p class="no-entries">No favorites yet. Pin an entry to keep it close at hand.</p>`;
    return;
  }

  favorites.forEach((entry) => {
    favoritesList.appendChild(buildEntryCard(entry));
  });
}

// ---------- RENDER ALBUM (Album tab) ----------
function renderAlbum() {
  const photoEntries = activeEntries()
    .filter((e) => !!e.photoURL)
    .sort((a, b) => {
      const at = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const bt = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return bt - at;
    });

  corkboard.innerHTML = "";

  if (photoEntries.length === 0) {
    corkboard.innerHTML = `<p class="no-entries">No photos clipped yet. Attach one from the Write tab.</p>`;
    return;
  }

  photoEntries.forEach((entry) => {
    const dateStr = entry.createdAt?.toDate
      ? entry.createdAt.toDate().toLocaleDateString()
      : "";

    const card = document.createElement("div");
    card.className = "cork-photo";
    card.innerHTML = `
      <span class="cork-pin" aria-hidden="true"></span>
      <button type="button" class="cork-remove-btn" data-id="${entry.id}" title="Remove this photo">×</button>
      <img src="${entry.photoURL}" alt="${entry.title || "Journal photo"}" />
      <p class="cork-caption">${entry.title || "Untitled Entry"}${dateStr ? ` · ${dateStr}` : ""}</p>
    `;
    card.querySelector("img").addEventListener("click", () => openPhotoLightbox(entry.photoURL));
    card.querySelector(".cork-remove-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("Remove this photo from its journal entry?")) {
        await removePhotoFromEntry(entry.id);
        if (editingEntryId === entry.id) {
          currentEntryPhotoURL = null;
          removeExistingPhoto = false;
          renderCurrentPhotoPreview();
        }
      }
    });
    corkboard.appendChild(card);
  });
}

// ---------- RENDER BIN (Bin tab) ----------
function renderBin() {
  const binned = binnedEntries();

  binList.innerHTML = "";

  if (binned.length === 0) {
    binList.innerHTML = `<p class="no-entries">The bin is empty.</p>`;
    return;
  }

  binned.forEach((entry) => {
    binList.appendChild(buildBinCard(entry));
  });
}

// Permanently removes entries that have been sitting in the bin longer than the retention window
async function purgeExpiredBinEntries() {
  if (isPurging) return;

  const expired = allEntries.filter((e) => {
    if (!e.deleted || !e.deletedAt || typeof e.deletedAt.toDate !== "function") return false;
    return (Date.now() - e.deletedAt.toDate().getTime()) > BIN_RETENTION_MS;
  });

  if (expired.length === 0) return;

  isPurging = true;
  try {
    await Promise.all(expired.map((entry) => deleteDoc(doc(db, "entries", entry.id))));
  } catch (error) {
    console.error("Could not auto-purge expired bin entries:", error);
  } finally {
    isPurging = false;
  }
}

// ---------- EMPTY BIN ----------
emptyBinBtn.addEventListener("click", async () => {
  const binned = binnedEntries();
  if (binned.length === 0) {
    showToast("The bin is already empty", "success");
    return;
  }

  if (!confirm(`Permanently delete all ${binned.length} entr${binned.length === 1 ? "y" : "ies"} in the bin? This cannot be undone.`)) {
    return;
  }

  emptyBinBtn.disabled = true;
  try {
    await Promise.all(binned.map((entry) => deleteDoc(doc(db, "entries", entry.id))));
    showToast("Bin emptied", "success");
  } catch (error) {
    showToast("Could not empty bin: " + error.message, "error");
  } finally {
    emptyBinBtn.disabled = false;
  }
});

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

  const datesWithEntries = new Set(activeEntries().map((e) => e.dateKey));
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

      if (hasEntry && selectedDateFilter === dateKey) {
        openEnvelope(dateKey);
      }

      if (selectedDateFilter) {
        switchTab("pages");
      } else {
        renderEntries();
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

  const monthEntries = activeEntries().filter((entry) => {
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

// ---------- STREAK TRACKER ----------
function computeCurrentStreak(dateKeySet) {
  const cursor = new Date();
  let key = toDateKey(cursor);

  if (!dateKeySet.has(key)) {
    cursor.setDate(cursor.getDate() - 1);
    key = toDateKey(cursor);
    if (!dateKeySet.has(key)) return 0;
  }

  let streak = 0;
  while (dateKeySet.has(toDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function computeLongestStreak(dateKeySet) {
  if (dateKeySet.size === 0) return 0;

  const sortedDates = Array.from(dateKeySet)
    .map((key) => {
      const [y, m, d] = key.split("-").map(Number);
      return new Date(y, m - 1, d);
    })
    .sort((a, b) => a - b);

  let longest = 1;
  let current = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const diffDays = Math.round((sortedDates[i] - sortedDates[i - 1]) / 86400000);
    if (diffDays === 1) {
      current++;
    } else if (diffDays > 1) {
      current = 1;
    }
    longest = Math.max(longest, current);
  }

  return longest;
}

function updateStreakBadge() {
  const dateKeySet = new Set(activeEntries().map((e) => e.dateKey).filter(Boolean));
  const streak = computeCurrentStreak(dateKeySet);
  streakCountEl.textContent = streak;
}

function renderStreakStats() {
  const active = activeEntries();
  const dateKeySet = new Set(active.map((e) => e.dateKey).filter(Boolean));
  const currentStreak = computeCurrentStreak(dateKeySet);
  const longestStreak = computeLongestStreak(dateKeySet);
  const totalEntries = active.length;
  const totalFavorites = active.filter((e) => e.favorite).length;
  const totalDaysWritten = dateKeySet.size;

  streakStatsBody.innerHTML = `
    <div class="streak-stat-row"><span>Current streak</span><span>${currentStreak} day${currentStreak === 1 ? "" : "s"}</span></div>
    <div class="streak-stat-row"><span>Longest streak</span><span>${longestStreak} day${longestStreak === 1 ? "" : "s"}</span></div>
    <div class="streak-stat-row"><span>Days written</span><span>${totalDaysWritten}</span></div>
    <div class="streak-stat-row"><span>Total pages</span><span>${totalEntries}</span></div>
    <div class="streak-stat-row"><span>Favorites pinned</span><span>${totalFavorites}</span></div>
  `;
}

// ---------- ENVELOPE ----------
function openEnvelope(dateKey) {
  const entriesForDay = activeEntries().filter((e) => e.dateKey === dateKey);
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
