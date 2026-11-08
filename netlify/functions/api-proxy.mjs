const FUNCTION_PREFIX = '/.netlify/functions/api-proxy/';

function configuredApiOrigin() {
  const configured = typeof Netlify !== 'undefined' && typeof Netlify.env?.get === 'function'
    ? Netlify.env.get('ROYAL_CLUB_API_ORIGIN')
    : process.env.ROYAL_CLUB_API_ORIGIN;
  const raw = configured?.trim();
  if (!raw) return null;
  try {
    const origin = new URL(raw);
    if (origin.protocol !== 'https:' || origin.username || origin.password ||
        origin.pathname !== '/' || origin.search || origin.hash) {
      return null;
    }
    return origin;
  } catch {
    return null;
  }
}

export default async (request, context) => {
  const apiOrigin = configuredApiOrigin();
  // Fail closed: preview deployments must be explicitly pointed at an isolated
  // staging API. Never silently route a PR preview to the production database.
  if (!apiOrigin) {
    return Response.json(
      { error: 'API proxy is not configured for this deployment context.' },
      { status: 503 },
    );
  }

  const incoming = new URL(request.url);
  const routedPath = incoming.pathname.startsWith(FUNCTION_PREFIX)
    ? incoming.pathname.slice(FUNCTION_PREFIX.length)
    : '';
  const parameterPath = typeof context.params?.splat === 'string'
    ? context.params.splat
    : '';
  const path = (routedPath || parameterPath).replace(/^\/+/, '');

  if (!path || path.split('/').some(segment => segment === '.' || segment === '..')) {
    return Response.json({ error: 'Invalid API route' }, { status: 400 });
  }

  const target = new URL('/' + path, apiOrigin);
  target.search = incoming.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  const method = request.method.toUpperCase();
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method)) {
    return Response.json({ error: 'Unsupported API method' }, { status: 405 });
  }
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body,
      redirect: 'manual',
    });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');
    return new Response(method === 'HEAD' ? null : await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: 'API upstream unavailable' }, { status: 502 });
  }
};
