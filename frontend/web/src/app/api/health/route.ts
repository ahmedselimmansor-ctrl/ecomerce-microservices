import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** فحص حيوية للـ pod — لا يفحص أي تبعية خارجية عمدًا. */
export function GET() {
  return NextResponse.json({ status: 'UP', service: 'web' });
}
