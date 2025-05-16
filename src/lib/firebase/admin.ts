# === Firebase Admin SDK (Backend Only) ===
# This variable is no longer used by default for panel settings storage.
# If you re-introduce Firebase Admin for other backend features, you'll need this.
# FIREBASE_ADMIN_SERVICE_ACCOUNT='{"type": "service_account", ...}'

# === Firebase Frontend (Next.js Exposed) ===
# These are for client-side Firebase SDK (e.g., auth, firestore access from client)
# Ensure these are prefixed with NEXT_PUBLIC_ to be exposed to the browser.
NEXT_PUBLIC_FIREBASE_API_KEY="YOUR_API_KEY"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="YOUR_AUTH_DOMAIN"
NEXT_PUBLIC_FIREBASE_DATABASE_URL="YOUR_DATABASE_URL"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="YOUR_PROJECT_ID"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="YOUR_STORAGE_BUCKET"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="YOUR_MESSAGING_SENDER_ID"
NEXT_PUBLIC_FIREBASE_APP_ID="YOUR_APP_ID"
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="YOUR_MEASUREMENT_ID"

# Other environment variables for your Next.js application can go here.