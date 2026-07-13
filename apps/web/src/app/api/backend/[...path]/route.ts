import { NextRequest, NextResponse } from 'next/server';
import { apiBase, mintDevToken, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Same-origin proxy to the OneStack API. The browser calls /api/backend/<path>; this handler forwards to
 * <API_BASE>/<path> with the auth token attached server-side. If the user has signed in (real Supabase
 * Auth session cookie) we forward THAT token — so the API sees their real tenant + role. Otherwise we fall
 * back to a freshly-minted dev OWNER token (skeleton default). Keeps tokens out of the browser + no CORS.
 */
async function forward(req: NextRequest, path: string[]): Promise<NextResponse> {
  const search = req.nextUrl.search;
  const url = `${apiBase()}/${path.join('/')}${search}`;
  const method = req.method;

  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const token = session || mintDevToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const contentType = req.headers.get('content-type');
  if (contentType) headers['content-type'] = contentType;

  const hasBody = method !== 'GET' && method !== 'HEAD' && method !== 'DELETE';
  const body = hasBody ? await req.text() : undefined;

  const res = await fetch(url, { method, headers, body, cache: 'no-store' });

  // Pass binary payloads (images) straight through.
  const resType = res.headers.get('content-type') ?? '';
  if (!resType.includes('application/json') && !resType.includes('text/')) {
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: res.status,
      headers: { 'content-type': resType || 'application/octet-stream' },
    });
  }
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': resType || 'application/json' },
  });
}

type Ctx = { params: { path: string[] } };
export const GET = (req: NextRequest, { params }: Ctx) => forward(req, params.path);
export const POST = (req: NextRequest, { params }: Ctx) => forward(req, params.path);
export const PATCH = (req: NextRequest, { params }: Ctx) => forward(req, params.path);
export const PUT = (req: NextRequest, { params }: Ctx) => forward(req, params.path);
export const DELETE = (req: NextRequest, { params }: Ctx) => forward(req, params.path);
