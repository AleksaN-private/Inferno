// Inferno push — čuva pretplatu i „poslednji put viđen" u KV (Upstash preko REST-a).
// Bez npm zavisnosti — koristi globalni fetch. Ako KV nije podešen, tiho ne radi ništa štetno.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.REDIS_REST_TOKEN || '';
async function kv(cmd) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KV_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const j = await r.json();
    return j.result;
  } catch (_) { return null; }
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};
  const now = String(Date.now());

  if (!KV_URL || !KV_TOKEN) { res.status(200).json({ ok: false, nokv: true }); return; }

  if (body.action === 'subscribe' && body.sub) {
    await kv(['SET', 'inferno:sub', JSON.stringify(body.sub)]);
    await kv(['SET', 'inferno:seen', now]);
    res.status(200).json({ ok: true }); return;
  }
  if (body.action === 'seen') {
    await kv(['SET', 'inferno:seen', now]);
    if (body.mood) await kv(['SET', 'inferno:mood', String(body.mood).slice(0, 60)]);
    res.status(200).json({ ok: true }); return;
  }
  if (body.action === 'schedule' && Array.isArray(body.times)) {
    const times = body.times.filter(t => /^\d{2}:\d{2}$/.test(t)).slice(0, 20);
    let arr = []; try { arr = JSON.parse(await kv(['GET', 'inferno:schedule']) || '[]'); } catch (_) {}
    for (const t of times) if (!arr.find(x => x.t === t)) arr.push({ t, msg: '' });
    await kv(['SET', 'inferno:schedule', JSON.stringify(arr.slice(0, 20))]);
    res.status(200).json({ ok: true, schedule: arr }); return;
  }
  res.status(400).json({ error: 'bad' });
};
