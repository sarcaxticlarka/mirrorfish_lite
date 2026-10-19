// Stateless proxy to any OpenAI-compatible /chat/completions endpoint.
// The user's API key arrives per request and is never stored or logged.
const net = require('net');

const PRIVATE = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

function isPrivateIp(host) {
  if (!net.isIP(host)) return false;
  if (host.includes(':')) return /^(::1|fc|fd|fe80)/i.test(host);
  const [a, b] = host.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function validateBase(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('Invalid base URL'); }
  const local = process.env.ALLOW_LOCAL === '1';
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) throw new Error('Base URL must be https');
  if (!local && (PRIVATE.test(u.hostname) || isPrivateIp(u.hostname.replace(/^\[|\]$/g, '')))) {
    throw new Error('Private or local hosts are not allowed');
  }
  return u.toString().replace(/\/+$/, '');
}

async function callUpstream(url, key, body, signal) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON upstream error */ }
  return { r, json, text };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { baseUrl, apiKey, model, messages, json, max_tokens, temperature } = b;
  if (!apiKey || !model || !Array.isArray(messages) || !baseUrl) {
    return res.status(400).json({ error: 'baseUrl, apiKey, model and messages are required' });
  }

  let base;
  try { base = validateBase(baseUrl); } catch (e) { return res.status(400).json({ error: e.message }); }

  const payload = { model, messages };
  if (typeof temperature === 'number') payload.temperature = temperature;
  if (max_tokens) payload.max_tokens = Math.min(Number(max_tokens) || 1500, 6000);
  if (json) payload.response_format = { type: 'json_object' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55000);
  try {
    let { r, json: data, text } = await callUpstream(`${base}/chat/completions`, apiKey, payload, ctrl.signal);

    // Some providers reject response_format, or fail strict JSON validation; retry once without it (the prompt already demands JSON).
    if (!r.ok && payload.response_format && r.status === 400 && /response_format|json/i.test(text)) {
      delete payload.response_format;
      ({ r, json: data, text } = await callUpstream(`${base}/chat/completions`, apiKey, payload, ctrl.signal));
    }
    // Newer models want max_completion_tokens instead of max_tokens.
    if (!r.ok && payload.max_tokens && /max_completion_tokens/i.test(text)) {
      payload.max_completion_tokens = payload.max_tokens;
      delete payload.max_tokens;
      ({ r, json: data, text } = await callUpstream(`${base}/chat/completions`, apiKey, payload, ctrl.signal));
    }

    if (!r.ok) {
      const msg = data?.error?.message || data?.message || text.slice(0, 300) || `Upstream ${r.status}`;
      let retryAfter = Number(r.headers.get('retry-after')) || null;
      if (!retryAfter) {
        // Providers like Groq put the wait in the message: "try again in 1m5.2s" / "in 850ms".
        const m = /try again in (?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?(?:([\d.]+)ms)?/i.exec(msg);
        if (m) retryAfter = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) + (+m[4] || 0) / 1000 || null;
      }
      const daily = /per day|\bTPD\b|daily|insufficient_quota|exceeded your current quota/i.test(msg);
      return res.status(r.status === 401 || r.status === 403 ? 401 : r.status).json({ error: msg, retryAfter, quota: daily });
    }
    const choice = data?.choices?.[0];
    return res.status(200).json({
      content: choice?.message?.content ?? '',
      finish_reason: choice?.finish_reason ?? null,
      usage: data?.usage ?? null,
    });
  } catch (e) {
    const timeout = e.name === 'AbortError';
    return res.status(timeout ? 504 : 502).json({ error: timeout ? 'Model took too long (55s)' : `Upstream unreachable: ${e.message}` });
  } finally {
    clearTimeout(timer);
  }
};
