export function isValidNeonTriggerInvocation(headerValue: unknown, body: unknown): boolean {
  if (typeof headerValue !== 'string' || headerValue.length === 0) return false;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const invocationId = (body as { invocation_id?: unknown }).invocation_id;
  return typeof invocationId === 'string' && invocationId.length > 0 && invocationId === headerValue;
}
