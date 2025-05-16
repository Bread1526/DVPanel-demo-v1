
// src/lib/firebase/admin.ts
import * as admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin';

// These will be potentially undefined if initialization fails.
// Code using these should handle that possibility.
let firestoreAdmin: admin.firestore.Firestore | undefined;
let authAdmin: admin.auth.Auth | undefined;
// let databaseAdmin: admin.database.Database | undefined; // Uncomment if using Realtime Database

console.log('Firebase Admin SDK: admin.ts script started.');

const serviceAccountJson = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;

if (serviceAccountJson && serviceAccountJson.trim().length > 10) {
  console.log('Firebase Admin SDK: FIREBASE_ADMIN_SERVICE_ACCOUNT environment variable IS SET and seems to have content.');
  console.log('Firebase Admin SDK: First 50 chars of serviceAccountJson:', serviceAccountJson.substring(0, 50));
  console.log('Firebase Admin SDK: Last 50 chars of serviceAccountJson:', serviceAccountJson.substring(Math.max(0, serviceAccountJson.length - 50)));
} else {
  console.warn(
    'Firebase Admin SDK NOT CONFIGURED: FIREBASE_ADMIN_SERVICE_ACCOUNT environment variable is NOT SET, is empty, or is too short. Firebase Admin features will not be available.'
  );
}

if (!serviceAccountJson || serviceAccountJson.trim().length === 0) {
  console.error('Firebase Admin SDK: Initialization SKIPPED because serviceAccountJson is missing or empty.');
} else {
  if (!admin.apps.length) {
    try {
      console.log('Firebase Admin SDK: Attempting to parse serviceAccountJson...');
      const serviceAccount: ServiceAccount = JSON.parse(serviceAccountJson);
      console.log('Firebase Admin SDK: serviceAccountJson parsed successfully.');
      if (serviceAccount.project_id) {
        console.log('Firebase Admin SDK: Project ID from parsed JSON:', serviceAccount.project_id);
      } else {
        console.warn('Firebase Admin SDK: project_id not found in parsed service account JSON.');
      }
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL, // Optional: for Realtime Database
      });
      console.log('Firebase Admin SDK initialized successfully.');
      firestoreAdmin = admin.firestore();
      authAdmin = admin.auth();
      // databaseAdmin = admin.database(); // Uncomment if using Realtime Database
    } catch (error: any) {
      console.error('Firebase Admin SDK: FATAL ERROR DURING PARSING OR INITIALIZATION.');
      console.error('Error Message:', error.message);
      console.error('Error Stack:', error.stack); // Log the full stack trace for more details
      console.error(
        'Ensure FIREBASE_ADMIN_SERVICE_ACCOUNT in your .env.local (at project root) is a VALID JSON string (ideally single-line) from your service account key.'
      );
      console.error('--- Problematic serviceAccountJson content (first 100 and last 100 chars) ---');
      console.error('Start:', serviceAccountJson.substring(0, 100));
      console.error('End:', serviceAccountJson.substring(Math.max(0, serviceAccountJson.length - 100)));
      console.error('--- End of problematic serviceAccountJson content ---');
    }
  } else {
    // App already initialized, re-assign local variables
    if (admin.apps[0]) {
        firestoreAdmin = admin.apps[0]!.firestore();
        authAdmin = admin.apps[0]!.auth();
        // databaseAdmin = admin.apps[0]!.database(); // Uncomment if using Realtime Database
        console.log('Firebase Admin SDK: Re-using existing initialized app.');
    } else {
        console.error('Firebase Admin SDK: admin.apps array exists but is empty. This is unexpected.');
    }
  }
}

if (!firestoreAdmin) {
    console.warn('Firebase Admin SDK: firestoreAdmin is UNDEFINED after initialization attempt. Firestore functionality will be impacted.');
}
if (!authAdmin) {
    console.warn('Firebase Admin SDK: authAdmin is UNDEFINED after initialization attempt. Auth functionality will be impacted.');
}


export { admin, firestoreAdmin, authAdmin /*, databaseAdmin */ };
