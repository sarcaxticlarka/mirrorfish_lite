// Lists the models an API key can actually use (GET {base}/models). Stateless; the key is never stored.
const net = require('net');
const PRIVATE = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;
const priv = (h) => {
  if (!net.isIP(h)) return false;
  if (h.includes(':')) return /^(::1|fc|fd|fe80)/i.test(h);
  const [a, b] = h.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!b.baseUrl || !b.apiKey) return res.status(400).json({ error: 'baseUrl and apiKey are required' });
  let u;
  try { u = new URL(b.baseUrl); } catch { return res.status(400).json({ error: 'Invalid base URL' }); }
  const local = process.env.ALLOW_LOCAL === '1';
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return res.status(400).json({ error: 'Base URL must be https' });
  if (!local && (PRIVATE.test(u.hostname) || priv(u.hostname.replace(/^\[|\]$/g, '')))) return res.status(400).json({ error: 'Private or local hosts are not allowed' });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${u.toString().replace(/\/+$/, '')}/models`, { headers: { Authorization: `Bearer ${b.apiKey}` }, signal: ctrl.signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status === 401 || r.status === 403 ? 401 : r.status).json({ error: data?.error?.message || `Upstream ${r.status}` });
    const skip = /whisper|tts|orpheus|guard|embed|moderation|dall-e|image|audio|realtime|transcribe|safeguard/i;
    const models = (data.data || []).map((m) => m.id).filter((id) => id && !skip.test(id)).sort();
    return res.status(200).json({ models });
  } catch (e) {
    return res.status(502).json({ error: e.name === 'AbortError' ? 'Provider timed out' : `Upstream unreachable: ${e.message}` });
  } finally { clearTimeout(timer); }
};
