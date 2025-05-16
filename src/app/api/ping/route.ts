
// src/app/api/ping/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  // This is a lightweight endpoint. 
  // It responds quickly to allow the client to measure round-trip time.
  return NextResponse.json({ status: 'ok' });
}
