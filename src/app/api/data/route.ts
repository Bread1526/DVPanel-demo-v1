// src/app/api/data/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { firestoreAdmin } from '@/lib/firebase/admin';

export async function GET(request: NextRequest) {
  if (!firestoreAdmin) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 503 });
  }
  try {
    // Example: Fetch data from an 'items' collection
    const snapshot = await firestoreAdmin.collection('items').limit(10).get();
    if (snapshot.empty) {
      return NextResponse.json({ message: 'No items found' }, { status: 200 });
    }

    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    console.error('Error fetching data from Firestore:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!firestoreAdmin) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 503 });
  }
  try {
    const body = await request.json();
    const { name, value } = body;

    if (name === undefined || value === undefined) {
      return NextResponse.json({ error: 'Missing name or value in request body' }, { status: 400 });
    }

    // Example: Add a new document to 'items' collection
    const docRef = await firestoreAdmin.collection('items').add({ name, value, createdAt: new Date().toISOString() });
    return NextResponse.json({ message: 'Item added successfully', id: docRef.id }, { status: 201 });
  } catch (error) {
    console.error('Error adding data to Firestore:', error);
    return NextResponse.json({ error: 'Failed to add data' }, { status: 500 });
  }
}
