// Firebase configuration - will be replaced at build time
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyChd3wKk1KXZNZQs8fDZRiUFbelciQnT1w",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "eldrex-blog.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "eldrex-blog",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "eldrex-blog.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1016235801394",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1016235801394:web:c1f8d532843db7bfd1b52b",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-DHTY1BBPFP"
};

let app, db, auth, rtdb, analytics;

export function initializeFirebase() {
    try {
        // Check if Firebase is already initialized
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK not loaded');
            return null;
        }
        
        if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("YOUR_")) {
            console.warn('Firebase configuration is incomplete or using placeholder values');
            return null;
        }
        
        // Initialize Firebase
        app = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        auth = firebase.auth();
        rtdb = firebase.database();
        analytics = firebase.analytics();
        
        console.log('Firebase initialized successfully');
        
        // Enable offline persistence
        db.enablePersistence().catch((err) => {
            console.warn('Firestore offline persistence not supported:', err.code);
        });
        
        return { app, db, auth, rtdb, analytics };
        
    } catch (error) {
        console.error('Firebase initialization error:', error);
        
        // Try to use existing app if already initialized
        try {
            app = firebase.app();
            db = firebase.firestore();
            auth = firebase.auth();
            rtdb = firebase.database();
            analytics = firebase.analytics();
            
            console.log('Using existing Firebase app');
            return { app, db, auth, rtdb, analytics };
        } catch (e) {
            console.error('Failed to use existing Firebase app:', e);
            return null;
        }
    }
}

export function getFirebase() {
    return { app, db, auth, rtdb, analytics };
}

export { db, auth, rtdb, analytics };
