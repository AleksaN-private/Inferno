// INFERNO — TTS proxy. BESPLATAN glas: Google translate_tts (bez naloga, bez ključa, bez para).
// Robotski ali radi svuda (i u Android WebView-u — pušta se <audio>). Nema više ElevenLabs (plaćeno) ni 502-tišine.
// Razliku po liku (Inferno dublji / Iris viši / bića) pravi KLIJENT preko playbackRate (visina) — Google ima jedan sr glas.

async function tfetch(url, opts, ms) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), ms || 7000);
  try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); } finally { clearTimeout(id); }
}

// Google translate_tts — nezvaničan besplatan endpoint; traži browser User-Agent inače 403.
function gUrl(text, tl) {
  return 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' + tl +
    '&total=1&idx=0&textlen=' + text.length + '&q=' + encodeURIComponent(text);
}
const G_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'referer': 'https://translate.google.com/',
  'accept': 'audio/mpeg,*/*',
};

module.exports = async (req, res) => {
  // provera: da li Google glas prolazi sa ovog servera (Vercel data-centar IP)
  if (req.query && req.query.debug) {
    const tl = String(req.query.lang || 'sr').toLowerCase() === 'en' ? 'en' : 'sr';
    try {
      const r = await tfetch(gUrl('проба', tl), { headers: G_HEADERS }, 9000);
      const info = { provider: 'google', status: r.status, ok: r.ok, ctype: r.headers.get('content-type') || '' };
      if (!r.ok) { try { info.body = (await r.text()).slice(0, 300); } catch (_) {} }
      res.status(200).json(info); return;
    } catch (e) { res.status(200).json({ provider: 'google', err: String(e && e.message) }); return; }
  }

  let q = String((req.query && req.query.q) || '').slice(0, 900);
  q = q.replace(/\.{2,}/g, '…').replace(/…{2,}/g, '…').replace(/\s{2,}/g, ' ').trim();   // skrati predugačke pauze (nizovi tačaka)
  if (!q) { res.status(400).end(); return; }
  let tl = String((req.query && req.query.lang) || 'sr').toLowerCase();
  if (tl !== 'en') tl = 'sr';
  if (q.length > 200) { const cut = q.slice(0, 200); const m = cut.match(/[\s\S]*[.!?…,\s]/); q = (m ? m[0] : cut).trim(); }   // Google prima ~200 znakova; ne seci reč na pola

  try {
    let gr = await tfetch(gUrl(q, tl), { headers: G_HEADERS }, 9000);
    for (let k = 0; k < 2 && !gr.ok && (gr.status === 429 || gr.status === 503); k++) {   // rate-limit → sačekaj i probaj opet
      await new Promise(r => setTimeout(r, 400 + k * 400));
      gr = await tfetch(gUrl(q, tl), { headers: G_HEADERS }, 9000);
    }
    if (gr.ok) {
      const buf = Buffer.from(await gr.arrayBuffer());
      if (buf.length > 200) {   // pravi audio (ne prazna/HTML greška)
        res.setHeader('content-type', 'audio/mpeg'); res.setHeader('cache-control', 'public, max-age=86400');
        res.status(200).end(buf); return;
      }
    }
  } catch (_) { /* padne li Google → tišina ispod (klijent može pasti na browser glas) */ }

  // Google nedostupan (blok/rate-limit) → nema zvuka; tekst i dalje stoji na ekranu. Klijent hvata grešku.
  res.status(502).end();
};
