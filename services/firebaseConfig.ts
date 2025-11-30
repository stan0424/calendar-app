
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';

const firebaseConfig = {
  apiKey: "AIzaSyA9omplhxQEJXb3u-ty-3hQzj7TnA3XTXY",
  authDomain: "calender-5e145.firebaseapp.com",
  projectId: "calender-5e145",
  storageBucket: "calender-5e145.firebasestorage.app",
  messagingSenderId: "720456130428",
  appId: "1:720456130428:web:839a5e522a687c76988ef9",
  measurementId: "G-RYMMDJBBVL"
};

// Initialize Firebase
// Check if already initialized to avoid "already exists" error
const app = !firebase.apps.length ? firebase.initializeApp(firebaseConfig) : firebase.app();

export const db = app.firestore();
export const auth = app.auth();

// Enable offline persistence
db.enablePersistence().catch((err) => {
    if (err.code == 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled in one tab at a a time.
        console.warn("Persistence failed: Multiple tabs open");
    } else if (err.code == 'unimplemented') {
        // The current browser does not support all of the features required to enable persistence
        console.warn("Persistence not supported by browser");
    }
});
