const API_ORIGIN = 'https://br-misty-flower-bavs47dm-royalclubapi.compute.c-8.eu-central-1.aws.neon.tech';
const FUNCTION_PREFIX = '/.netlify/functions/api-proxy/';

export default async (request, context) => {
  const incoming = new URL(request.url);
  // Netlify's plain function handler does not populate wildcard params unless
  // a custom config.path is declared. The redirect preserves the remaining
  // path in the function URL, so derive it from the request pathname.
  const routedPath = incoming.pathname.startsWith(FUNCTION_PREFIX)
    ? incoming.pathname.slice(FUNCTION_PREFIX.length)
    : '';
  const parameterPath = typeof context.params?.splat === 'string'
    ? context.params.splat
    : '';
  const path = (routedPath || parameterPath).replace(/^\\/+/, '');

  if (!path) {
    return Response.json({ error: 'Missing API route' }, { status: 400 });
  }

  const target = new URL('/' + path + incoming.search, API_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('origin');
  headers.delete('connection');
  headers.delete('content-length');

  const method = request.method.toUpperCase();
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
  } catch (_) {
    return Response.json({ error: 'API upstream unavailable' }, { status: 502 });
  }
};
