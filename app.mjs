// Request handler shared by server.mjs (local) and api/*.mjs (Vercel).
import { readFileSync } from 'node:fs';
import { route, search } from './route.mjs';

try { process.loadEnvFile(); } catch {} // .env: MAPILLARY_TOKEN=MLY|...
const UA = { 'User-Agent': 'painaikordai/0.1 (personal trip planner)' };
const html = () => readFileSync(new URL('public/index.html', import.meta.url));

const inTH = ([la, lo]) => la > 5 && la < 21 && lo > 97 && lo < 106;
const pt = s => { const p = (s || '').split(',').map(Number); return p.length === 2 && p.every(Number.isFinite) && inTH(p) ? p : null; };
const bkkNow = () => (Date.now() / 60000 + 7 * 60) % 1440;

// ponytail: unbounded in-memory caches; fine for one small server, add an LRU if traffic grows.
const geoCache = new Map(), photoCache = new Map();
async function nominatim(q) {
  if (!geoCache.has(q)) {
    const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=th&accept-language=th&limit=5&q=' + encodeURIComponent(q);
    const r = await fetch(u, { headers: UA }).then(r => r.json()).catch(() => []);
    geoCache.set(q, r.map(x => ({ name: x.name || x.display_name.split(',')[0], sub: x.display_name.split(',').slice(1, 3).join(',').trim(), lat: +x.lat, lon: +x.lon })));
  }
  return geoCache.get(q);
}
async function photo(lat, lon) {
  const tok = process.env.MAPILLARY_TOKEN;
  if (!tok) return null;
  const k = lat.toFixed(4) + ',' + lon.toFixed(4);
  if (!photoCache.has(k)) {
    const d = 0.0008; // ~90 m box
    const u = `https://graph.mapillary.com/images?fields=id,thumb_1024_url,computed_geometry,captured_at&limit=30&bbox=${lon - d},${lat - d},${lon + d},${lat + d}`;
    const r = await fetch(u, { headers: { Authorization: 'OAuth ' + tok } }).then(r => r.json()).catch(() => ({}));
    const best = (r.data || []).map(x => [x, (x.computed_geometry.coordinates[1] - lat) ** 2 + (x.computed_geometry.coordinates[0] - lon) ** 2]).sort((a, b) => a[1] - b[1])[0]?.[0];
    photoCache.set(k, best ? { img: best.thumb_1024_url, link: 'https://www.mapillary.com/app/?pKey=' + best.id, date: new Date(best.captured_at).toISOString().slice(0, 7) } : null);
  }
  return photoCache.get(k);
}

export default async function handler(req, res) {
  const u = new URL(req.url, 'http://x');
  const json = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
  try {
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html()); }
    if (u.pathname === '/api/search') {
      const q = (u.searchParams.get('q') || '').slice(0, 100).trim();
      if (q.length < 2) return json([]);
      const local = search(q), seen = new Set(local.map(x => x.name));
      return json([...local, ...(await nominatim(q)).filter(x => !seen.has(x.name))].slice(0, 8));
    }
    if (u.pathname === '/api/route') {
      const from = pt(u.searchParams.get('from')), to = pt(u.searchParams.get('to'));
      if (!from || !to) return json({ error: 'ตำแหน่งต้องอยู่ในประเทศไทย' }, 400);
      const now = bkkNow();
      return json({ now, ...(route(from, to, now) || { error: 'หาเส้นทางไม่เจอ' }) });
    }
    if (u.pathname === '/api/photo') {
      const p = pt(u.searchParams.get('at'));
      return p ? json(await photo(...p)) : json(null, 400);
    }
    res.writeHead(404).end();
  } catch (e) {
    console.error(e);
    json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' }, 500);
  }
}
