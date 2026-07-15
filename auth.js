import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Grab elements
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const showSignup = document.getElementById("show-signup");
const showLogin = document.getElementById("show-login");

// Flag to prevent auto-redirect while the signup process is running
let isSigningUp = false;

// Toggle between login/signup views
showSignup.addEventListener("click", (e) => {
  e.preventDefault();
  loginForm.classList.add("hidden");
  signupForm.classList.remove("hidden");
});

showLogin.addEventListener("click", (e) => {
  e.preventDefault();
  signupForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
});

// SIGN UP
document.getElementById("signup-btn").addEventListener("click", async () => {
  const fullName = document.getElementById("signup-fullname").value.trim();
  const username = document.getElementById("signup-username").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirmPassword = document.getElementById("signup-confirm-password").value;
  const errorEl = document.getElementById("signup-error");
  errorEl.textContent = "";

  if (!fullName || !username || !email || !password) {
    errorEl.textContent = "Please fill in all fields.";
    return;
  }
  if (password !== confirmPassword) {
    errorEl.textContent = "Passwords do not match.";
    return;
  }
  if (password.length < 8) {
    errorEl.textContent = "Password must be at least 8 characters.";
    return;
  }

  isSigningUp = true; // block the redirect listener from firing

  try {
    // Check if username is already taken
    const usernameQuery = query(collection(db, "users"), where("username", "==", username));
    const usernameSnap = await getDocs(usernameQuery);
    if (!usernameSnap.empty) {
      errorEl.textContent = "Username already taken.";
      isSigningUp = false;
      return;
    }

    // Create the account in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Save extra profile info in Firestore, in a "users" collection
    await setDoc(doc(db, "users", user.uid), {
      fullName: fullName,
      username: username,
      email: email
    });

    // Sign out immediately so they have to log in manually
    await signOut(auth);

    // Clear the signup form
    document.getElementById("signup-fullname").value = "";
    document.getElementById("signup-username").value = "";
    document.getElementById("signup-email").value = "";
    document.getElementById("signup-password").value = "";
    document.getElementById("signup-confirm-password").value = "";

    // Switch to login form and show a success message
    signupForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
    const loginError = document.getElementById("login-error");
    loginError.textContent = "Account created! Please log in.";
    loginError.style.color = "#2d5a3d"; // green, since it's a success message

  } catch (error) {
    errorEl.textContent = error.message;
  } finally {
    isSigningUp = false; // re-enable redirect behavior for normal logins
  }
});

// LOG IN (supports email OR username)
document.getElementById("login-btn").addEventListener("click", async () => {
  const identifier = document.getElementById("login-identifier").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.style.color = "#a13d2b"; // reset to error-red in case it was green from a success message
  errorEl.textContent = "";

  if (!identifier || !password) {
    errorEl.textContent = "Please fill in all fields.";
    return;
  }

  try {
    let email = identifier;

    // If it doesn't look like an email, treat it as a username and look up the real email
    if (!identifier.includes("@")) {
      const usernameQuery = query(collection(db, "users"), where("username", "==", identifier));
      const usernameSnap = await getDocs(usernameQuery);

      if (usernameSnap.empty) {
        errorEl.textContent = "No account found with that username.";
        return;
      }
      email = usernameSnap.docs[0].data().email;
    }

    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged below will redirect to journal.html
  } catch (error) {
    errorEl.textContent = error.message;
  }
});

// If already logged in, redirect straight to journal page
// (but not if we're in the middle of the signup flow)
onAuthStateChanged(auth, (user) => {
  if (user && !isSigningUp) {
    window.location.href = "journal.html";
  }
});