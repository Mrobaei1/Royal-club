import { app } from './server.js';

await app.ready();

/**
 * Adapt Fastify's tested route handlers to Neon's Fetch-compatible Node.js runtime.
 * The normal HTTP listener remains enabled on traditional hosts.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headersIn = Object.fromEntries(request.headers.entries());
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null;
    const payload = hasBody ? Buffer.from(await request.arrayBuffer()) : undefined;

    const result = await app.inject({
      method: request.method as any,
      url: `${url.pathname}${url.search}`,
      headers: headersIn,
      payload,
    });

    const headersOut = new Headers();
    const hopByHop = new Set([
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
      'content-length',
    ]);

    for (const [name, raw] of Object.entries(result.headers)) {
      if (raw === undefined || hopByHop.has(name.toLowerCase())) continue;
      for (const value of Array.isArray(raw) ? raw : [raw]) {
        headersOut.append(name, String(value));
      }
    }

    const body = result.statusCode === 204 || result.statusCode === 304
      ? null
      : result.body;

    return new Response(body, {
      status: result.statusCode,
      headers: headersOut,
    });
  },
};
