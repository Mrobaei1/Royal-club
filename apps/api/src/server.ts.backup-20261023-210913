import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Pool } from 'pg';

const app = Fastify({ logger: true, trustProxy: false });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

await app.register(helmet);
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

app.get('/api/v1/health', async () => ({
  status: 'ok',
  service: 'royal-club-api',
  timestamp: new Date().toISOString(),
}));

app.get('/api/v1/health/db', async (_request, reply) => {
  try {
    const result = await pool.query('SELECT 1 AS ok');
    return { status: 'ok', database: result.rows[0]?.ok === 1 ? 'connected' : 'unknown' };
  } catch (error) {
    app.log.error({ err: error }, 'Database health check failed');
    return reply.code(503).send({ status: 'error', database: 'unavailable' });
  }
});

app.addHook('onClose', async () => { await pool.end(); });

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
