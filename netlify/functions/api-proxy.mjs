const API_ORIGIN = 'https://br-misty-flower-bavs47dm-royalclubapi.compute.c-8.eu-central-1.aws.neon.tech';

export default async (request, context) => {
  const path = context.params?.splat ?? '';
  const incoming = new URL(request.url);
  const target = new URL('/' + path.replace(/^\/+/, '') + incoming.search, API_ORIGIN);
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
