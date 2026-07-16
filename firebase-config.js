import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDf63WBb_Eho1LO4E6QYYO6rjNESrGAGvI",
  authDomain: "journal-96fc3.firebaseapp.com",
  projectId: "journal-96fc3",
  storageBucket: "journal-96fc3.firebasestorage.app",
  messagingSenderId: "82648709349",
  appId: "1:82648709349:web:778e0a9d3ccc196db7bc0c"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
