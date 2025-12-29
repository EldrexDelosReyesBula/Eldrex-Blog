// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js";
import { 
    getAuth, 
    signInAnonymously, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    getFirestore,
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    arrayUnion,
    arrayRemove,
    onSnapshot,
    addDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyChd3wKk1KXZNZQs8fDZRiUFbelciQnT1w",
    authDomain: "eldrex-blog.firebaseapp.com",
    databaseURL: "https://eldrex-blog-default-rtdb.firebaseio.com",
    projectId: "eldrex-blog",
    storageBucket: "eldrex-blog.firebasestorage.app",
    messagingSenderId: "1016235801394",
    appId: "1:1016235801394:web:c1f8d532843db7bfd1b52b",
    measurementId: "G-DHTY1BBPFP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// Export Firebase services
export {
    app,
    analytics,
    auth,
    db,
    signInAnonymously,
    signOut,
    onAuthStateChanged,
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    arrayUnion,
    arrayRemove,
    onSnapshot,
    addDoc,
    deleteDoc,
    serverTimestamp
};