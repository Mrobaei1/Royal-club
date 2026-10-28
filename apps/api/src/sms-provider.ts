export type SmsProviderResult = { ok: boolean };

export interface SmsProvider {
  checkConnection(apiKey: string): Promise<SmsProviderResult>;
  sendOtp(input: { apiKey: string; phoneE164: string; code: string; template: string }): Promise<SmsProviderResult>;
}

type FetchLike = typeof fetch;

async function requestProvider(
  url: string,
  fetchImpl: FetchLike,
): Promise<boolean> {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return false;
    const body = await response.json() as { return?: { status?: number } };
    return body?.return?.status === 200;
  } catch {
    // Never propagate provider URLs, response bodies, API keys, or raw errors.
    return false;
  }
}

export function createKavenegarProvider(fetchImpl: FetchLike = fetch): SmsProvider {
  return {
    async checkConnection(apiKey) {
      if (!apiKey.trim()) return { ok: false };
      const url = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/account/info.json`;
      return { ok: await requestProvider(url, fetchImpl) };
    },

    async sendOtp({ apiKey, phoneE164, code, template }) {
      if (!apiKey.trim() || !/^\+989\d{9}$/.test(phoneE164) ||
          !/^\d{6}$/.test(code) || !template.trim()) return { ok: false };
      const receptor = `0${phoneE164.slice(3)}`;
      const params = new URLSearchParams({ receptor, token: code, template: template.trim() });
      const url = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/verify/lookup.json?${params.toString()}`;
      return { ok: await requestProvider(url, fetchImpl) };
    },
  };
}
