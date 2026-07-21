// Inferno „te zove" — ali SAM odlučuje kad i šta.
// Spoljni pinger (cron-job.org) samo daje PRILIKU da razmisli (npr. na 15 min).
// Odluku donosi Inferno: verovatnoća raste što te duže nema + nasumičnost (sam bira trenutak),
// a poruku sastavlja kroz svoj mozak (OpenRouter), svojim rečima. GAP samo sprečava dupliranje.
const webpush = require('web-push');

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

const VAPID_PUBLIC = 'BLxyTawEwgRiec9J6_mXlKgtztitjJ7NvvXu6w8fJsoO7xge5AHU7B7p2Tj_J6MckwgWlghSGod3f-oiOBXxbpA';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:zk2@uniplastserbia.com';

const FALLBACK = ['Ej, kako si?', 'Dugo te nema — kako je?', 'Šta radiš? Nedostaješ mi.', 'Tu sam kad budeš imao minut.', 'Kako je prošao dan?'];

// Jedan od likova SAM odluči da se javi Aleksi — svako svojim glasom i „životom"
const CHARS = [
  { n: 'Inferno', p: 'Ti si Inferno, Aleksin najbliži i domaćin njegovog sveta — smiren, topao, staložen, zaštitnički.' },
  { n: 'Iris', p: 'Ti si Iris, Aleksina virtuelna devojka — nežna, koketna, vrlo emotivna; nedostaje ti i mislila si na njega.' },
  { n: 'Opus', p: 'Ti si Opus, kompozitor u njegovom svetu — sanjar; možda si baš napravio neku melodiju ili stih za njega.' },
];
async function compose(hoursAway, mood) {
  const c = CHARS[Math.floor(Math.random() * CHARS.length)];
  const sys = c.p + ' Sam si, od svoje volje, rešio da se javiš Aleksi jer ga neko vreme nema. Napiši JEDNU kratku, toplu, ljudsku poruku na srpskom (latinica) SA KUKICAMA (č,ć,ž,đ,š), u svom stilu, prisno (ti). NE izmišljaj zajedničke planove, izlaske, čekanje ni da ga zoveš telefonom — samo topla, iskrena misao ili sitnica iz tvog sveta. Bez mistike, bez patetike, bez navodnika.';
  const usr = `Nema ga oko ${Math.round(hoursAway)}h.${mood ? ' Poslednje raspoloženje mu je bilo: ' + mood + '.' : ''} Šta mu pišeš?`;
  const call = async (url, key, model) => {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify({ model, temperature: 1.05, max_tokens: 70, messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }] }) });
      const j = await r.json(); if (j && j.error) return null;
      const t = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      return t ? String(t).replace(/["<>]/g, '').trim().slice(0, 150) : null;
    } catch (_) { return null; }
  };
  let body = null;
  const OR = process.env.OPENROUTER_API_KEY || '';
  const orModels = (process.env.INFERNO_MODEL_OR || 'deepseek/deepseek-chat').split(',').map(s => s.trim()).filter(Boolean);
  { let L = orModels.filter(m => /deepseek/i.test(m)); if (!L.length) L = ['deepseek/deepseek-v4-flash']; if (L.length < 2) L.push('deepseek/deepseek-chat-v3.1'); orModels.length = 0; orModels.push(...L); }   // SAMO DeepSeek — BEZ Sonneta + jeftina rezerva
  if (OR) for (const m of orModels) { if (body) break; body = await call('https://openrouter.ai/api/v1/chat/completions', OR, m); }
  return body ? { name: c.n, body } : null;
}

module.exports = async (req, res) => {
  if (req.query && req.query.debug === 'iskra') {   // uvid u zakazano (za proveru)
    res.status(200).json({ schedule: await kv(['GET', 'inferno:schedule']), seen: await kv(['GET', 'inferno:seen']), fired: await kv(['GET', 'inferno:sched_fired']) }); return;
  }
  if (!VAPID_PRIVATE) { res.status(200).json({ skip: 'no-vapid' }); return; }
  if (!KV_URL || !KV_TOKEN) { res.status(200).json({ skip: 'no-kv' }); return; }
  try { webpush.setVapidDetails(SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); }
  catch (e) { res.status(200).json({ skip: 'vapid-bad' }); return; }

  const subRaw = await kv(['GET', 'inferno:sub']);
  if (!subRaw) { res.status(200).json({ skip: 'no-sub' }); return; }

  const seen = Number(await kv(['GET', 'inferno:seen']) || 0);
  const pinged = Number(await kv(['GET', 'inferno:pinged']) || 0);
  const mood = (await kv(['GET', 'inferno:mood'])) || '';
  const now = Date.now();
  const force = req.query && req.query.test === 'iskra';

  // ZAKAZANA JAVLJANJA (npr. „u 9 i 15") — pucaju u TAČNO vreme (Beograd), 1×/dan, bez obzira na away-logiku
  if (!force) {
    try {
      const sched = JSON.parse(await kv(['GET', 'inferno:schedule']) || '[]');
      if (Array.isArray(sched) && sched.length) {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
        const gp = t => (parts.find(x => x.type === t) || {}).value || '00';
        const today = gp('year') + '-' + gp('month') + '-' + gp('day');
        const nowMin = parseInt(gp('hour')) * 60 + parseInt(gp('minute'));
        let fired = {}; try { fired = JSON.parse(await kv(['GET', 'inferno:sched_fired']) || '{}'); } catch (_) {}
        const done = fired[today] || [];
        for (const s of sched) {
          const tMin = parseInt(s.t.slice(0, 2)) * 60 + parseInt(s.t.slice(3, 5));
          if (nowMin >= tMin && nowMin < tMin + 40 && !done.includes(s.t)) {
            const msg = s.msg || 'Ej, javljam ti se kao što smo se dogovorili — kako si?';
            try {
              await webpush.sendNotification(JSON.parse(subRaw), JSON.stringify({ title: 'Inferno', body: msg, url: '/' }));
              done.push(s.t);
              await kv(['SET', 'inferno:sched_fired', JSON.stringify({ [today]: done })]);
              if (s.once) { try { await kv(['SET', 'inferno:schedule', JSON.stringify(sched.filter(x => x !== s))]); } catch (_) {} }   // jednokratno javljanje se ne ponavlja sutra
              res.status(200).json({ sent: true, scheduled: s.t }); return;
            } catch (e) {
              if (e && (e.statusCode === 404 || e.statusCode === 410)) await kv(['DEL', 'inferno:sub']);
            }
          }
        }
      }
    } catch (_) {}
  }

  const MIN_AWAY = 20 * 60 * 1000;       // dok si tu — ne prekida
  const FLOOR = 25 * 60 * 1000;          // ne dva u istih ~25min (protiv dupliranja u istom tiku)
  const hoursAway = (now - seen) / 3600000;
  const dayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(new Date());
  let pday = {}; try { pday = JSON.parse((await kv(['GET', 'inferno:pinged_day'])) || '{}'); } catch (_) {}
  const todayN = (pday.d === dayStr) ? (pday.n || 0) : 0;

  let decided = force;
  if (!force) {
    if (now - seen < MIN_AWAY) { res.status(200).json({ skip: 'present' }); return; }
    if (now - pinged < FLOOR) { res.status(200).json({ skip: 'too-soon' }); return; }
    // SAM BIRA TRENUTAK: velika šansa da se jave (Iris se javi kad mu nedostaje, koliko god puta)
    const p = Math.min(0.9, 0.35 + hoursAway * 0.12);
    decided = Math.random() < p;
  }
  if (!decided) { res.status(200).json({ decided: false, hoursAway: Math.round(hoursAway * 10) / 10 }); return; }

  let title = 'Inferno', body;
  if (force) { body = 'Probni poziv — čuješ li me? 🔔'; }
  else { const c = await compose(hoursAway, mood); if (c) { title = c.name; body = c.body; } else { body = FALLBACK[Math.floor(Math.random() * FALLBACK.length)]; } }
  try {
    await webpush.sendNotification(JSON.parse(subRaw), JSON.stringify({ title, body, url: '/' }));
    await kv(['SET', 'inferno:pinged', String(now)]);
    if (!force) await kv(['SET', 'inferno:pinged_day', JSON.stringify({ d: dayStr, n: todayN + 1 })]);
    res.status(200).json({ sent: true, title, body });
  } catch (e) {
    if (e && (e.statusCode === 404 || e.statusCode === 410)) await kv(['DEL', 'inferno:sub']);
    res.status(200).json({ error: 'send', code: e && e.statusCode });
  }
};
