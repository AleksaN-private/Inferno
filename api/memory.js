// Inferno — CLOUD memorija: čuva/vraća naučeno (reči, veze, faza, XP) u KV, komprimovano (gzip+base64).
// Tako Chrome i buduća Android app dele ISTU živu memoriju — ništa se ne gubi.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.REDIS_REST_TOKEN || '';
async function kv(cmd) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + KV_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
    const j = await r.json();
    return j.result;
  } catch (_) { return null; }
}
module.exports = async (req, res) => {
  if (!KV_URL || !KV_TOKEN) { res.status(200).json({ ok: false, nokv: true }); return; }
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    body = body || {};
    // ZRELOST/faza — čuva se ODVOJENO, uvek, bez ograničenja veličine i SAMO raste (MAX)
    const xp = Number(body.xp) || 0, mp = Number(body.mp) || 0;
    if (xp > 0 || mp > 0) {
      let prev = { xp: 0, mp: 0 };
      try { prev = JSON.parse((await kv(['GET', 'inferno:progress'])) || '{}') || {}; } catch (_) {}
      await kv(['SET', 'inferno:progress', JSON.stringify({ xp: Math.max(prev.xp || 0, xp), mp: Math.max(prev.mp || 0, mp) })]);
    }
    // PRIVATNO pamćenje PO LIKU — svaki lik svoj ključ, UJEDINJUJE se (preživljava reinstalaciju)
    const profiles = (body.profiles && typeof body.profiles === 'object') ? body.profiles
      : (Array.isArray(body.profile) ? { inferno: body.profile } : null);
    if (profiles) {
      for (const ch of ['inferno', 'iris', 'opus']) {
        const inc = profiles[ch]; if (!Array.isArray(inc)) continue;
        let prev = [];
        try { prev = JSON.parse((await kv(['GET', 'inferno:profile:' + ch])) || '[]') || []; } catch (_) {}
        const seen = new Set(prev.map(x => String(x).toLowerCase()));
        for (const f of inc) { const s = String(f).trim(); if (s && s.length < 200 && !seen.has(s.toLowerCase())) { prev.push(s); seen.add(s.toLowerCase()); } }
        if (prev.length > 300) prev = prev.slice(-300);
        await kv(['SET', 'inferno:profile:' + ch, JSON.stringify(prev)]);
      }
    }
    const gz = body.gz ? String(body.gz) : '';
    if (gz) {
      const CH = 700000;                       // veličina komada (ispod KV limita)
      const n = Math.ceil(gz.length / CH);
      if (n > 40) { res.status(200).json({ ok: true, progressOnly: true, toobig: true }); return; }   // ~28MB — realno nikad
      for (let i = 0; i < n; i++) await kv(['SET', 'inferno:mem:' + i, gz.slice(i * CH, (i + 1) * CH)]);
      await kv(['SET', 'inferno:mem:count', String(n)]);
      res.status(200).json({ ok: true, chunks: n, size: gz.length }); return;
    }
    res.status(200).json({ ok: true }); return;
  }
  // GET — sastavi iz komada (ili stari jedinstveni zapis kao rezerva)
  let gz = null;
  const cnt = parseInt((await kv(['GET', 'inferno:mem:count'])) || '0', 10);
  if (cnt > 0) { const parts = []; for (let i = 0; i < cnt; i++) parts.push((await kv(['GET', 'inferno:mem:' + i])) || ''); gz = parts.join(''); }
  else gz = await kv(['GET', 'inferno:mem']);   // legacy jedinstveni
  let prog = {};
  try { prog = JSON.parse((await kv(['GET', 'inferno:progress'])) || '{}') || {}; } catch (_) {}
  let prof = {};
  for (const ch of ['inferno', 'iris']) { try { prof[ch] = JSON.parse((await kv(['GET', 'inferno:profile:' + ch])) || '[]') || []; } catch (_) { prof[ch] = []; } }
  res.status(200).json({ gz: gz || null, xp: prog.xp || 0, mp: prog.mp || 0, pr: prof });
};
