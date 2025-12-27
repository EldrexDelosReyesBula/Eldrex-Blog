// Firebase configuration using environment variables
const firebaseConfig = {
    apiKey: window.FIREBASE_API_KEY,
    authDomain: window.FIREBASE_AUTH_DOMAIN,
    projectId: window.FIREBASE_PROJECT_ID,
    storageBucket: window.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID,
    appId: window.FIREBASE_APP_ID,
    measurementId: window.FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const realtimeDb = firebase.database();
const auth = firebase.auth();

// Firebase services
const firebaseServices = {
    db,
    realtimeDb,
    auth,
    firestore: db,
    FieldValue: firebase.firestore.FieldValue,
    Timestamp: firebase.firestore.Timestamp
};

// Make services globally available
window.firebaseServices = firebaseServices;

// Helper function to initialize Firebase in admin panel
function initializeFirebaseServices() {
    return firebaseServices;
}

// Database references
const postsCollection = db.collection('posts');
const commentsCollection = db.collection('comments');
const likesCollection = db.collection('likes');
const categoriesCollection = db.collection('categories');

// Real-time references
const realtimePostsRef = realtimeDb.ref('posts');
const realtimeCommentsRef = realtimeDb.ref('comments');
const realtimeLikesRef = realtimeDb.ref('likes');
