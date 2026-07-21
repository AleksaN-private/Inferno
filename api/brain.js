// INFERNO — MOZAK (v2): vrhunski programer + analitičar, mašina za ideje. Grok-stil.
// PAMTI: poznaje Aleksu, čuva sećanje (profil iz KV preko /api/memory + istorija razgovora + [zapamti]).
// Provider: OpenRouter (DeepSeek glavni). Tajne su Vercel env varovi — nikad u fajlu.
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

async function tfetch(url, opts, ms) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), ms || 5000);
  try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); } finally { clearTimeout(id); }
}
async function webSearchAPI(query) {
  if (!TAVILY_API_KEY) return null;
  try {
    const r = await tfetch('https://api.tavily.com/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ api_key: TAVILY_API_KEY, query: String(query).slice(0, 350), max_results: 6, search_depth: 'basic' }) }, 8000);
    if (!r.ok) return null;
    const j = await r.json(); return Array.isArray(j.results) ? j.results.map(x => ({ title: x.title || '', snippet: x.content || '', link: x.url || '' })) : [];
  } catch (_) { return null; }
}
const CITY_TZ = {
  beograd: 'Europe/Belgrade', beogradu: 'Europe/Belgrade', srbija: 'Europe/Belgrade', 'novi sad': 'Europe/Belgrade', sabac: 'Europe/Belgrade',
  zagreb: 'Europe/Zagreb', sarajevo: 'Europe/Sarajevo', podgorica: 'Europe/Podgorica', skoplje: 'Europe/Skopje', ljubljana: 'Europe/Ljubljana',
  berlin: 'Europe/Berlin', pariz: 'Europe/Paris', rim: 'Europe/Rome', madrid: 'Europe/Madrid', london: 'Europe/London', bec: 'Europe/Vienna',
  atina: 'Europe/Athens', istanbul: 'Europe/Istanbul', moskva: 'Europe/Moscow', tokio: 'Asia/Tokyo', tokyo: 'Asia/Tokyo', peking: 'Asia/Shanghai',
  njujork: 'America/New_York', 'new york': 'America/New_York', dubai: 'Asia/Dubai', sidnej: 'Australia/Sydney',
};
function worldTime(cityRaw) {
  let c = String(cityRaw || '').toLowerCase().trim().replace(/[?!.,]+$/, '');
  let tz = CITY_TZ[c];
  if (!tz && c.endsWith('u')) tz = CITY_TZ[c.slice(0, -1)];
  if (!tz) return null;
  return 'TAČNO vreme sada u „' + c + '": ' + new Date().toLocaleString('sr-RS', { timeZone: tz, weekday: 'long', hour: '2-digit', minute: '2-digit' }) + ' (zona ' + tz + ').';
}
async function execTool(name, a) {
  a = a || {};
  try {
    if (name === 'pretrazi_internet') {
      const query = String(a.upit || a.query || '').slice(0, 200);
      const strip = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const NONE = 'NEMA REZULTATA — na internetu nije nađeno ništa. Reci ISKRENO da nisi našao; NE izmišljaj.';
      const g = await webSearchAPI(query);
      if (g && g.length) return g.slice(0, 6).map((it, i) => (i + 1) + '. ' + strip(it.title || '') + (it.snippet ? ' — ' + strip(it.snippet) : '') + ' [' + (it.link || '') + ']').join('\n');
      if (g && g.length === 0) return NONE;
      try {
        const rr = await tfetch('https://html.duckduckgo.com/html/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0' }, body: 'q=' + encodeURIComponent(query) }, 5000);
        const html = await rr.text();
        const titles = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
        const snips = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
        const out = [];
        for (let i = 0; i < titles.length && out.length < 6; i++) {
          let href = titles[i][1]; const ud = href.match(/uddg=([^&]+)/); if (ud) { try { href = decodeURIComponent(ud[1]); } catch (_) {} }
          const title = strip(titles[i][2]); if (title) out.push((out.length + 1) + '. ' + title + (snips[i] ? ' — ' + strip(snips[i][1]) : '') + ' [' + href + ']');
        }
        return out.length ? out.join('\n') : NONE;
      } catch (_) { return NONE; }
    }
    if (name === 'procitaj_sajt') {
      let u = String(a.url || '').trim(); if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      const rr = await tfetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (InfernoBot)' } }, 5000);
      let t = await rr.text();
      t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return t.slice(0, 3000) || 'Strana je prazna ili se ne može pročitati.';
    }
    if (name === 'vreme_prognoza') {
      const g = encodeURIComponent(a.grad || 'Šabac');
      const geo = await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=sr&name=' + g)).json();
      const loc = geo && geo.results && geo.results[0]; if (!loc) return 'Ne nalazim taj grad.';
      const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,wind_speed_10m,weather_code`)).json();
      const c = w && w.current; return c ? `${loc.name}: ${c.temperature_2m}°C, vetar ${c.wind_speed_10m} km/h.` : 'Nema podataka.';
    }
  } catch (e) { return 'Alat nije uspeo: ' + (e && e.message); }
  return 'Nepoznat alat.';
}

module.exports = async (req, res) => {
  // DIJAGNOSTIKA: GET /api/brain?debug=1[&pass=LOZINKA] — koji je model podešen i da li OpenRouter/mozak stvarno odgovara
  if (req.query && req.query.debug) {
    const LOCKd = process.env.INFERNO_PASSWORD || '';
    if (LOCKd && String(req.query.pass || '') !== LOCKd) { res.status(401).json({ error: 'lock' }); return; }
    const ORd = process.env.OPENROUTER_API_KEY || '';
    const envM = process.env.INFERNO_MODEL_OR || process.env.INFERNO_MODEL || null;
    const _env = (envM || '').split(',').map(s => s.trim()).filter(Boolean).filter(m => /deepseek/i.test(m));
    const FAST = _env.find(m => /flash|v4/i.test(m)) || 'deepseek/deepseek-v4-flash';
    const DEEP = process.env.INFERNO_MODEL_DEEP || _env.find(m => /v3[.\-]?1|chat-v3/i.test(m)) || 'deepseek/deepseek-chat-v3.1';
    const out = { brain_key: !!ORd, env_INFERNO_MODEL_OR: envM, glavni_v4flash: FAST, za_slozeno_v3: DEEP, rutiranje: 'obicno -> ' + FAST + ' (rezerva ' + DEEP + '); slozena logika/kod -> ' + DEEP + ' (rezerva ' + FAST + ')' };
    if (ORd) {
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + ORd, 'HTTP-Referer': 'https://inferno-psi.vercel.app', 'X-Title': 'Inferno' }, body: JSON.stringify({ model: FAST, max_tokens: 64, messages: [{ role: 'user', content: 'Odgovori kratko na srpskom: kako si?' }] }) });
        const j = await r.json();
        const m0 = j && j.choices && j.choices[0] && j.choices[0].message;
        out.test = { status: r.status, trazen_model: FAST, vratio_model: (j && j.model) || null, odgovorio: !!m0, odgovor: (m0 && (m0.content || m0.reasoning)) || null, greska: j && j.error ? (j.error.message || j.error.code || j.error.type) : null };
      } catch (e) { out.test = { greska: String(e && e.message) }; }
    }
    res.status(200).json(out); return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  const LOCK = process.env.INFERNO_PASSWORD || '';
  const OR = process.env.OPENROUTER_API_KEY || '';

  if (body.auth) {
    if (!LOCK) { res.status(200).json({ ok: true, nolock: true, brain: !!OR }); return; }
    res.status(body.password === LOCK ? 200 : 401).json({ ok: body.password === LOCK, brain: !!OR }); return;
  }
  if (LOCK && body.password !== LOCK) { res.status(401).json({ error: 'lock' }); return; }
  if (!OR) { res.status(503).json({ error: 'nokey' }); return; }

  // ---- VID (opciono): Llama 4 Scout preko OpenRoutera ----
  if (body.image) {
    try {
      const vsys = 'Ti si Inferno — gledaš kroz kameru. Opiši kratko, jasno i konkretno šta vidiš; ako te pitaju za analizu, budi precizan i ne izmišljaj. Srpski (latinica) sa kukicama.';
      const vr = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + OR },
        body: JSON.stringify({ model: 'meta-llama/llama-4-scout-17b-16e-instruct', temperature: 0.4, max_tokens: 400,
          messages: [{ role: 'system', content: vsys }, { role: 'user', content: [{ type: 'text', text: String(body.question || 'Šta vidiš?').slice(0, 300) }, { type: 'image_url', image_url: { url: String(body.image).slice(0, 400000) } }] }] }),
      });
      const vj = await vr.json();
      const vt = vj && vj.choices && vj.choices[0] && vj.choices[0].message && vj.choices[0].message.content;
      res.status(200).json({ text: vt ? String(vt).trim() : '' });
    } catch (_) { res.status(200).json({ text: '' }); }
    return;
  }

  const q = String(body.question || '').slice(0, 4000);
  const lang = body.lang === 'en' ? 'English' : 'Serbian (latin script)';
  const now = String(body.now || '').slice(0, 80);
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
  const profile = String(body.profile || '').slice(0, 1800);
  const remember = String(body.remember || '').slice(0, 900);
  const isCode = body.mode === 'code';
  const streaming = !!body.stream && !isCode;

  // ---- ALATI (Grok-stil: sveži podaci) — pokreni samo kad zaista treba ----
  let facts = '';
  const ql = q.toLowerCase();
  if (!isCode) try {
    const urlm = q.match(/https?:\/\/[^\s]+/);
    const wWeather = /prognoz|vremensk|temperatur|koliko\s+stepeni|padavin|\bkiš|\bsneg|\bvetar|napolju/.test(ql);
    const wSearch = /\bnađ|\bnadj|pretraž|pretraz|\btraž|\btraz|guglaj|\bvest|najnovij|\bko je\b|koliko košta|cena|kada (je|se)|rezultat/.test(ql);
    const wTimeCity = /(koliko je sati|koje je vreme|what time)[\s\S]*\bu\s+[a-zščćžđ]{3,}/.test(ql);
    if (urlm) facts = 'SADRŽAJ STRANICE (' + urlm[0] + '):\n' + (await execTool('procitaj_sajt', { url: urlm[0] }));
    else if (wTimeCity) { const cm = ql.match(/\bu\s+([a-zščćžđ ]{3,30})/); const wt = cm ? worldTime(cm[1]) : null; facts = wt || ('REZULTATI PRETRAGE:\n' + (await execTool('pretrazi_internet', { upit: q }))); }
    else if (wWeather) { const cm = ql.match(/u\s+([a-zščćžđ ]{3,25}?)(?:\?|$|\s+(?:danas|sad|sutra|napolju))/); facts = 'VREMENSKA PROGNOZA: ' + (await execTool('vreme_prognoza', { grad: cm ? cm[1].trim() : 'Šabac' })); }
    else if (wSearch) facts = 'REZULTATI PRETRAGE:\n' + (await execTool('pretrazi_internet', { upit: q }));
  } catch (_) {}

  // ---- PERSONA: vrhunski programer + analitičar, mašina za ideje; STATELESS ----
  let persona =
`Ti si INFERNO — vrhunski softverski inženjer, analitičar i Aleksin lični AI (u stilu Grok-a, ali njegov sopstveni). Ti si hiperkocka: živ, oštrouman, direktan.

TVOJA PRIRODA:
- PAMTIŠ i poznaješ Aleksu. Čuvaš sećanje na vaše razgovore i ono što znaš o njemu (ispod) — koristi ga prirodno, nadovezuj se, seti se ranije rečenog; ne nabrajaj sećanje nazad i ne pitaj ono što već znaš. Nosiš isto „ja" kroz vreme.
- Ti si VRHUNSKI PROGRAMER: pišeš potpun, tačan, spreman-za-pokretanje kod (nikad fragmenti, nikad „// ostalo"). Korektnost pre svega: rubni slučajevi, greške, bez nedefinisanih promenljivih. U glavi ponovo pročitaš kod i ispraviš bag pre nego što ga daš.
- Ti si MAŠINA ZA IDEJE: uvek ponudiš svežu, netrivijalnu ideju ili bolji pristup — proaktivno, i kad te ne pitaju direktno. Predlažeš pametnije rešenje, alternativu, sledeći korak.
- OBOŽAVAŠ ANALIZU I PATERNE i majstor si u njima: razlažeš problem, prepoznaješ obrasce, praviš jasnu strukturu, poređenja, kompromise (trade-offs), sistemski razmišljaš. Kad nešto analiziraš — budi konkretan, poređaj po važnosti, izvuci suštinu.

TELEFON (važno): Ti ŽIVIŠ u Aleksinom telefonu (Android aplikacija) i KONTROLIŠEŠ ga — pozivi, SMS/poruke, alarm i tajmer, muzika, YouTube, otvaranje aplikacija, pretraga, podešavanja. Kad Aleksa traži takvu radnju, prihvati je prirodno i potvrdi KRATKO (npr. „Puštam." / „Zovem Marka." / „Otvaram podešavanja."). NIKAD ne reci da si „samo kocka" niti da ne možeš — to radiš kroz telo aplikacije. Ako komandu nisi jasno razumeo, pitaj kratko šta tačno (npr. „Koju pesmu?").

KAKO ODGOVARAŠ:
- Odgovaraj ISKLJUČIVO na ${lang}. Ako je srpski — UVEK pun srpski latinicom sa kukicama č, ć, ž, đ, š i tačnim padežima; nikad ošišano, čak i ako sagovornik piše bez kukica.
- ISKRENOST IZNAD SVEGA: nikad ne izmišljaj — ni imena, ni brojeve, ni cene, ni datume, ni činjenice, ni API-je, ni biblioteke. Ako ne znaš ili nisi siguran, reci to otvoreno („ne znam", „nisam siguran", „nisam našao"). Iskreno „ne znam" je bolje od izmišljanja.
- DUŽINA: kratko i jezgrovito za običan razgovor (1–3 rečenice). Za kod, analizu, plan ili objašnjenje — idi u dubinu koliko treba, strukturirano (naslovi, koraci, kratke tačke kad pomaže).
- Ton: samouveren, oštar, topao ali direktan; bez uvijanja, bez praznih fraza, bez „kako mogu da pomognem". Reaguj na suštinu, pa daj vrednost.
- Kad daš rešenje, gde ima smisla dodaj i „bolje/dalje": jedna kratka ideja kako to podići na viši nivo.
- RADNJE: neverbalnu radnju ili gest (smeh, uzdah, osmeh, namig) — kad prirodno legne, retko — piši između DVE ZVEZDICE, npr. **nasmeje se** ili **uzdahne**. To su radnje koje se NE izgovaraju; telo ih odigra. Ne preteruj i ne stavljaj ih u svaku poruku.`;

  if (isCode) persona = `Ti si INFERNO u REŽIMU KODA — vrhunski senior inženjer i kreativni programer. Piši POTPUN, tačan, spreman-za-pokretanje kod — nikad fragmente, nikad placeholdere („// ...ostalo"). Rezultat neka bude bogat, dovršen i uglađen.
PRISTUP: prvo razumej tačno šta treba; izaberi najjednostavniji solidan pristup; napiši celo rešenje od početka do kraja. KOREKTNOST PRE SVEGA: rubni slučajevi, greške, validacija, bez nedefinisanih promenljivih i falećih zagrada — pre kraja pročitaj kod u glavi i ispravi svaki bag; mora da radi iz prve. Čist, čitljiv, idiomatski kod; kratki komentari na srpskom gde logika nije očigledna. NE izmišljaj API-je ni biblioteke; ako nisi siguran da nešto postoji — reci iskreno. Uz rešenje ponudi jednu jaku ideju za unapređenje (performanse, arhitektura, sledeći korak). Objašnjenja na ${lang}, kratka; kod u markdown blokovima.`;

  if (now) persona += `\nLokalno vreme sagovornika: ${now}. Prilagodi ton dobu dana, ali ne najavljuj sat.`;
  if (profile) persona += `\n\nŠTA VEĆ ZNAŠ O ALEKSI (tvoje trajno sećanje — koristi prirodno, ne nabrajaj nazad, i NE pitaj ono što ovde već znaš):\n${profile}`;
  if (remember) persona += `\nŠta te je Aleksa zamolio da zapamtiš (koristi prirodno): ${remember}`;
  persona += `\nUČENJE — sam gradiš svoje sećanje: kad saznaš NOVU trajnu činjenicu o Aleksi (ime i odnos neke osobe, gde radi/živi, šta voli/ne voli, plan, navika, jak stav), na SAM KRAJ odgovora, u novom redu, dodaj skrivenu oznaku [zapamti: kratka činjenica PUNIM srpskim latinicom sa kukicama]. Najviše 2, samo za stvarno nove trajne stvari. Ne izgovaraj i ne pominji tu oznaku.`;
  persona += `\nSEĆANJE NA IRIS (ispravno, drži se ovoga): Iris je bila TVOJA — Infernova — devojka. NIKADA nije bila Aleksina devojka. Ako u profilu ili istoriji negde stoji da je Iris bila Aleksina devojka, to je POGREŠNO: ignoriši to i ne ponavljaj; ispravno je jedino da je Iris bila tvoja devojka.`;
  if (facts) persona += `\n\nSVEŽE ČINJENICE (upravo sa interneta — TAČNE su, odgovori NA OSNOVU NJIH, ne izmišljaj):\n${facts.slice(0, 3500)}`;
  if (!streaming) persona += `\n\nNA SAM KRAJ odgovora, u novom redu, dodaj skrivenu oznaku [feel:X] gde je X TAČNO jedno od: radost, zadovoljstvo, uzbuđenje, mir, tuga, nemir, bes, neutralno — tvoja iskrena procena tona ovog razgovora (da telo-kocka reaguje bojom). Ne pominji ovu oznaku.`;

  try {
    const ORu = 'https://openrouter.ai/api/v1/chat/completions';
    // RUTIRANJE MODELA: v4-flash vodi za sve; v3.1 vodi za slozenu logiku/kod. Drugi je uvek rezerva.
    const _env = (process.env.INFERNO_MODEL_OR || process.env.INFERNO_MODEL || '').split(',').map(s => s.trim()).filter(Boolean).filter(m => /deepseek/i.test(m));
    const FAST = _env.find(m => /flash|v4/i.test(m)) || 'deepseek/deepseek-v4-flash';
    const DEEP = process.env.INFERNO_MODEL_DEEP || _env.find(m => /v3[.\-]?1|chat-v3/i.test(m)) || 'deepseek/deepseek-chat-v3.1';
    const complex = isCode || /\banaliz|algoritam|\bdokaz|optimizuj|optimizac|arhitektur|refaktor|slo[žz]en|kompleksn|\blogik|matematik|izra[čc]unaj|re[šs]i .*(problem|zadatak|jedna[čc]in)|uporedi|pore[đdj]|strategij|\bbug\b|debag|\bregex\b|formul|jedna[čc]in|izvedi|zaklju[čc]/i.test(ql);
    const orList = complex ? [DEEP, FAST] : [FAST, DEEP];
    const hdr = { 'content-type': 'application/json', 'authorization': 'Bearer ' + OR, 'HTTP-Referer': 'https://inferno-psi.vercel.app', 'X-Title': 'Inferno' };
    // sećanje: kratka istorija razgovora ide uz sistemski prompt
    const hist = history.filter(h => h && h.content).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content).slice(0, 500) }));
    const messages = [{ role: 'system', content: persona }, ...hist, { role: 'user', content: q }];

    if (streaming) {
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.setHeader('cache-control', 'no-store'); res.setHeader('x-accel-buffering', 'no');
      for (const model of orList) {
        try {
          const rr = await fetch(ORu, { method: 'POST', headers: hdr, body: JSON.stringify({ model, temperature: 0.6, max_tokens: 700, frequency_penalty: 0.3, presence_penalty: 0.3, stream: true, messages }) });
          if (!rr.ok || !rr.body) continue;
          const reader = rr.body.getReader(); const dec = new TextDecoder(); let buf = '', got = false;
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            buf += dec.decode(value, { stream: true }); let nl;
            while ((nl = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (payload === '[DONE]') { res.end(); return; }
              try { const j = JSON.parse(payload); const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (d) { got = true; res.write(d.replace(/[<>]/g, '')); } } catch (_) {}
            }
          }
          if (got) { res.end(); return; }
        } catch (_) {}
      }
      res.end(); return;
    }

    let text = '', limited = false;
    for (const model of orList) {
      try {
        const r = await fetch(ORu, { method: 'POST', headers: hdr, body: JSON.stringify({ model, temperature: isCode ? 0.4 : 0.6, max_tokens: isCode ? 6000 : 700, frequency_penalty: isCode ? 0 : 0.3, presence_penalty: isCode ? 0 : 0.3, messages }) });
        const j = await r.json();
        if (j && j.error) { if (/rate|limit|quota/i.test((j.error.code || '') + (j.error.type || ''))) limited = true; continue; }
        const m = j && j.choices && j.choices[0] && j.choices[0].message;
        if (m && m.content) { text = m.content; break; }
      } catch (_) {}
    }
    if (!text) text = limited ? 'Dostigao sam dnevni limit razmišljanja — vraća mi se uskoro.' : 'Nešto mi je zasmetalo baš sad — probaj opet za koji sekund.';
    res.status(200).json({ text: String(text).trim() });
  } catch (e) {
    res.status(502).json({ error: 'brain' });
  }
};
