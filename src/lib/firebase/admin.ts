// src/lib/firebase/admin.ts
import * as admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin';

// These will be potentially undefined if initialization fails.
// Code using these should handle that possibility.
let firestoreAdmin: admin.firestore.Firestore | undefined;
let authAdmin: admin.auth.Auth | undefined;
// let databaseAdmin: admin.database.Database | undefined; // Uncomment if using Realtime Database

const serviceAccountJson = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;

if (serviceAccountJson && serviceAccountJson.length > 10) { // Basic check if it seems to have a value
  console.log('Firebase Admin SDK: FIREBASE_ADMIN_SERVICE_ACCOUNT environment variable IS SET.');
} else {
  console.warn(
    'Firebase Admin SDK not configured: FIREBASE_ADMIN_SERVICE_ACCOUNT environment variable is NOT SET or is too short. Firebase Admin features will not be available.'
  );
}

if (!serviceAccountJson) {
  // Already warned above, but keeping this condition explicit
} else {
  if (!admin.apps.length) {
    try {
      const serviceAccount: ServiceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL, // Optional: for Realtime Database
      });
      console.log('Firebase Admin SDK initialized successfully.');
      firestoreAdmin = admin.firestore();
      authAdmin = admin.auth();
      // databaseAdmin = admin.database(); // Uncomment if using Realtime Database
    } catch (error: any) {
      console.error('Firebase Admin SDK PARSING OR INITIALIZATION ERROR:', error.message);
      console.error(
        'Ensure FIREBASE_ADMIN_SERVICE_ACCOUNT in your .env.local (at project root) is a VALID JSON string (ideally single-line) from your service account key.'
      );
      // For debugging, you might want to log a snippet of the variable, but be careful with credentials:
      // console.error('First 50 chars of FIREBASE_ADMIN_SERVICE_ACCOUNT:', serviceAccountJson.substring(0, 50));
    }
  } else {
    // App already initialized, re-assign local variables
    if (admin.apps[0]) {
        firestoreAdmin = admin.apps[0]!.firestore();
        authAdmin = admin.apps[0]!.auth();
        // databaseAdmin = admin.apps[0]!.database(); // Uncomment if using Realtime Database
        console.log('Firebase Admin SDK: Re-using existing initialized app.');
    }
  }
}

export { admin, firestoreAdmin, authAdmin /*, databaseAdmin */ };
