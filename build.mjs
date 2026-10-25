// Merge GTFS + SRT timetable + Zenodo intercity routes into data/graph.json.
// Run: node build.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const D = 'data/';
const UA = { 'User-Agent': 'painaikordai/0.1' };

// --- fetch/extract sources if missing ---
if (!existsSync(D + 'gtfs/stops.txt')) execSync(`unzip -oq ${D}namtang-gtfs.zip -d ${D}gtfs -x shapes.txt fare_rules.txt fare_attributes.txt`);
mkdirSync(D + 'srt', { recursive: true });
for (const o of [0, 10000, 20000]) {
  const f = `${D}srt/p${o}.json`;
  if (!existsSync(f)) writeFileSync(f, await (await fetch(`https://datagov.mot.go.th/api/3/action/datastore_search?resource_id=da06de08-1c8d-4ecd-88f1-67652f65cb95&limit=10000&offset=${o}`)).text());
}
mkdirSync(D + 'osm', { recursive: true });
if (!existsSync(D + 'osm/rail.json')) {
  const q = '[out:json][timeout:120];area["ISO3166-1"="TH"][admin_level=2]->.a;(node["railway"~"^(station|halt)$"](area.a);way["railway"="station"](area.a););out center tags;';
  writeFileSync(D + 'osm/rail.json', await (await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: UA, body: new URLSearchParams({ data: q }) })).text());
}

// --- helpers ---
function csv(file) {
  const s = readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const h = rows.shift();
  return rows.map(r => Object.fromEntries(h.map((k, j) => [k, r[j]])));
}
const km = (a1, o1, a2, o2) => {
  const r = Math.PI / 180, x = Math.sin((a2 - a1) * r / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin((o2 - o1) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const r1 = x => Math.round(x * 10) / 10;
const median = a => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null;

const nodes = [];   // [name, lat, lon, kind]  kind: s=city stop, r=rail station, b=bus terminal, f=pier
const pats = [];    // {m, n, e, h, s:[node], t:[min], f?, d0?}
const add = (name, lat, lon, kind) => nodes.push([name, +(+lat).toFixed(6), +(+lon).toFixed(6), kind]) - 1;

// --- 1. GTFS city transit ---
const G = D + 'gtfs/';
const stopIdx = {};
for (const s of csv(G + 'stops.txt')) stopIdx[s.stop_id] = add(s.stop_name, s.stop_lat, s.stop_lon, 's');
const routes = Object.fromEntries(csv(G + 'routes.txt').map(r => [r.route_id, r]));
const st = {};
for (const r of csv(G + 'stop_times.txt')) (st[r.trip_id] ||= []).push(r);
const hw = {};
for (const f of csv(G + 'frequencies.txt')) (hw[f.trip_id] ||= []).push(f.headway_secs / 60);
const groups = {};
for (const t of csv(G + 'trips.txt')) (groups[t.route_id + '|' + t.direction_id] ||= []).push(t);

const hm = s => { const [h, m, x] = s.split(':').map(Number); return h * 60 + m + x / 60; };
// ponytail: road/river detour factors and speeds are guesses from the data medians; tune here.
const SPEED = { bus: [17, 1.3], van: [25, 1.3], boat: [18, 1.2], metro: [35, 1.2] };
for (const [key, trips] of Object.entries(groups)) {
  const rt = routes[key.split('|')[0]];
  if (rt.agency_id === 'SRT') continue; // long-distance trains come from the SRT timetable
  const ty = rt.route_type;
  const m = ty === '0' || ty === '1' || ty === '2' ? 'metro' : ty === '4' ? 'boat' : ty.includes('ตู้') ? 'van' : 'bus';
  const trip = trips.reduce((a, b) => ((st[b.trip_id] || []).length > (st[a.trip_id] || []).length ? b : a));
  const rows = (st[trip.trip_id] || []).sort((a, b) => a.stop_sequence - b.stop_sequence);
  if (rows.length < 2) continue;
  const [v, det] = SPEED[m];
  const s = [], t = [0];
  rows.forEach((r, i) => {
    s.push(stopIdx[r.stop_id]);
    if (!i) return;
    const a = nodes[s[i - 1]], b = nodes[s[i]], d = km(a[1], a[2], b[1], b[2]);
    let dt = hm(r.arrival_time) - hm(rows[i - 1].departure_time);
    if (m !== 'metro' || dt <= 0 || d / (dt / 60) > 100) dt = d * det / v * 60 + 0.5; // +0.5 min dwell
    t.push(r1(t[i - 1] + dt));
  });
  const h = median(trips.flatMap(x => hw[x.trip_id] || [])) ?? { metro: 8, bus: 15, van: 20, boat: 20 }[m];
  const [th] = rt.route_long_name.split(';'), sn = rt.route_short_name, color = th.match(/สี[^\s)\]]+/)?.[0];
  const clean = x => x.replace(/\s*[([].*?[)\]]/g, '').trim();
  // Short, readable line names: "BTS สายสุขุมวิท", "MRT สายสีน้ำเงิน", "รถเมล์สาย 138"
  const [n, chip] = rt.agency_id === 'BTSC' ? ['BTS ' + clean(th), 'BTS']
    : ['BEM', 'MRTA'].includes(rt.agency_id) ? ['MRT สาย' + color, 'MRT']
    : sn === 'ARL' ? ['Airport Rail Link', 'ARL']
    : rt.agency_id === 'SRTET' ? ['รถไฟฟ้า' + th, 'สายสีแดง']
    : m === 'boat' ? [clean(th), 'เรือ']
    : m === 'van' ? ['รถตู้ ' + (sn || clean(th)), 'รถตู้']
    : [sn ? 'รถเมล์สาย ' + sn : clean(th), sn || 'รถเมล์'];
  const hs = clean((trip.trip_headsign || '').split(';')[0].replace(/^(BTS|MRT)\s*/, ''));
  pats.push({ m, n, sn: chip, hs, c: m === 'metro' && rt.route_color ? '#' + rt.route_color : undefined, e: m === 'metro' ? 0 : 1, h: r1(h), s, t });
}
console.log('gtfs', nodes.length, 'stops', pats.length, 'patterns');

// --- 2. SRT long-distance trains, coordinates from OSM ---
const norm = s => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/\b(junction|jun|jn|halt|railway station|station)\b/g, '').replace(/[^a-z]/g, '');
const bigr = s => new Set([...s].slice(1).map((c, i) => s[i] + c));
const dice = (a, b) => { const A = bigr(a), B = bigr(b); let n = 0; for (const x of A) n += B.has(x); return (2 * n) / (A.size + B.size || 1); };
const osm = JSON.parse(readFileSync(D + 'osm/rail.json', 'utf8')).elements
  .filter(e => !['subway', 'light_rail', 'monorail'].includes(e.tags.station) && e.tags['name:en'])
  .map(e => ({ th: e.tags.name, en: e.tags['name:en'], k: norm(e.tags['name:en']), lat: e.lat ?? e.center.lat, lon: e.lon ?? e.center.lon }));
const byNorm = {};
for (const o of osm) (byNorm[o.k] ||= []).push(o);

const recs = [0, 10000, 20000].flatMap(o => JSON.parse(readFileSync(`${D}srt/p${o}.json`, 'utf8')).result.records);
const trains = {};
for (const r of recs) if (/^\d+$/.test(r['หมายเลขขบวนรถ']) && +r['หมายเลขขบวนรถ'] < 500) (trains[r['หมายเลขขบวนรถ']] ||= []).push(r);
const tmin = s => { const m = s && s.match(/(?:(\d+)\s+)?(\d+):(\d+):(\d+)/); return m ? (+(m[1] || 0)) * 1440 + +m[2] * 60 + +m[3] + m[4] / 60 : null; };
const seqs = Object.entries(trains).map(([no, rs]) => {
  rs.sort((a, b) => a._id - b._id);
  return [no, rs.filter((r, i) => r['Stop type'] === 'Scheduled stop' || i === 0 || i === rs.length - 1)
    .map(r => ({ name: r['สถานี'], time: tmin(r['Departure time']) ?? tmin(r['Arrival time']) })).filter(x => x.time != null)];
});
// Resolve station -> OSM: unique exact name first, then fuzzy/ambiguous ones by closeness to a resolved neighbour.
const where = {};
for (const [, seq] of seqs) for (const x of seq) if (byNorm[norm(x.name)]?.length === 1) where[x.name] = byNorm[norm(x.name)][0];
for (let pass = 0; pass < 3; pass++) for (const [, seq] of seqs) seq.forEach((x, i) => {
  if (where[x.name]) return;
  const nb = [seq[i - 1], seq[i + 1]].map(y => y && where[y.name]).filter(Boolean);
  if (!nb.length) return;
  const k = norm(x.name);
  const cands = byNorm[k] || osm.filter(o => dice(o.k, k) >= 0.5);
  let best = null, bd = 60; // km: a station can't be further than this from its neighbour
  for (const c of cands) { const d = Math.min(...nb.map(n => km(n.lat, n.lon, c.lat, c.lon))); if (d < bd) { bd = d; best = c; } }
  if (best) where[x.name] = best;
});
const railNode = new Map();
const rn = o => railNode.get(o) ?? railNode.set(o, add(`สถานีรถไฟ${o.th};${o.en}`, o.lat, o.lon, 'r')).get(o);
let missing = new Set();
for (const [no, seq] of seqs) {
  const ok = seq.filter(x => where[x.name] || !missing.add(x.name));
  if (ok.length < 2) continue;
  const d0 = ok[0].time;
  pats.push({ m: 'train', n: `รถไฟขบวน ${no}`, sn: 'รถไฟ', hs: where[ok.at(-1).name].th, e: 0, h: 0, s: ok.map(x => rn(where[x.name])), t: ok.map(x => r1(x.time - d0)), d0: r1(d0 % 1440) });
}
console.log('srt', Object.keys(trains).length, 'trains,', railNode.size, 'stations; unmatched', missing.size, [...missing].slice(0, 15).join(', '));

// --- 3. Intercity bus + ferry (Zenodo) ---
// Source names are English only; give the common ones (provinces, big terminals, towns) a Thai name.
const TH = {
  'Amnat Charoen': 'อำนาจเจริญ', Bangkok: 'กรุงเทพฯ', 'Bueng Kan': 'บึงกาฬ', 'Buri Ram': 'บุรีรัมย์', Buriram: 'บุรีรัมย์', Chachoengsao: 'ฉะเชิงเทรา',
  'Chai Nat': 'ชัยนาท', Chaiyaphum: 'ชัยภูมิ', Chanthaburi: 'จันทบุรี', 'Chiang Mai': 'เชียงใหม่', 'Chiang Rai': 'เชียงราย', 'Chon Buri': 'ชลบุรี',
  Chonburi: 'ชลบุรี', Chumphon: 'ชุมพร', Kalasin: 'กาฬสินธุ์', 'Kamphaeng Phet': 'กำแพงเพชร', Kanchanaburi: 'กาญจนบุรี', 'Khon Kaen': 'ขอนแก่น',
  Krabi: 'กระบี่', Lampang: 'ลำปาง', Lamphun: 'ลำพูน', Loei: 'เลย', 'Lop Buri': 'ลพบุรี', Lopburi: 'ลพบุรี', 'Mae Hong Son': 'แม่ฮ่องสอน',
  'Maha Sarakham': 'มหาสารคาม', Mukdahan: 'มุกดาหาร', 'Nakhon Nayok': 'นครนายก', 'Nakhon Pathom': 'นครปฐม', 'Nakhon Phanom': 'นครพนม',
  'Nakhon Ratchasima': 'นครราชสีมา', Korat: 'โคราช', 'Nakhon Sawan': 'นครสวรรค์', 'Nakhon Si Thammarat': 'นครศรีธรรมราช', Nan: 'น่าน',
  Narathiwat: 'นราธิวาส', 'Nong Bua Lam Phu': 'หนองบัวลำภู', 'Nong Khai': 'หนองคาย', Nonthaburi: 'นนทบุรี', 'Pathum Thani': 'ปทุมธานี',
  Pattani: 'ปัตตานี', Phangnga: 'พังงา', 'Phang Nga': 'พังงา', Phatthalung: 'พัทลุง', Phayao: 'พะเยา', Phetchabun: 'เพชรบูรณ์', Phetchaburi: 'เพชรบุรี',
  Phichit: 'พิจิตร', Phitsanulok: 'พิษณุโลก', 'Phra Nakhon Si Ayutthaya': 'พระนครศรีอยุธยา', Ayutthaya: 'อยุธยา', Phrae: 'แพร่', Phuket: 'ภูเก็ต',
  'Prachin Buri': 'ปราจีนบุรี', 'Prachuap Khiri Khan': 'ประจวบคีรีขันธ์', Ranong: 'ระนอง', Ratchaburi: 'ราชบุรี', Rayong: 'ระยอง', 'Roi Et': 'ร้อยเอ็ด',
  'Sa Kaeo': 'สระแก้ว', 'Sakon Nakhon': 'สกลนคร', 'Samut Prakan': 'สมุทรปราการ', 'Samut Sakhon': 'สมุทรสาคร', 'Samut Songkhram': 'สมุทรสงคราม',
  Saraburi: 'สระบุรี', Satun: 'สตูล', 'Si Sa Ket': 'ศรีสะเกษ', 'Sing Buri': 'สิงห์บุรี', Sukhothai: 'สุโขทัย', 'Suphan Buri': 'สุพรรณบุรี',
  'Surat Thani': 'สุราษฎร์ธานี', Surin: 'สุรินทร์', Tak: 'ตาก', Trang: 'ตรัง', Trat: 'ตราด', 'Ubon Ratchathani': 'อุบลราชธานี', 'Udon Thani': 'อุดรธานี',
  'Uthai Thani': 'อุทัยธานี', Uttaradit: 'อุตรดิตถ์', Yala: 'ยะลา', Yasothon: 'ยโสธร',
  'Mo Chit 2': 'หมอชิต 2', Chatuchak: 'หมอชิต 2 (จตุจักร)', 'Chatuchak Coach Station (Mo Chit 2)': 'หมอชิต 2', 'Mini Bus Terminal (Chatuchak)': 'ท่ารถตู้ จตุจักร',
  'Sai Tai Mai': 'สายใต้ใหม่', 'Southern Bangkok Bus Terminal (Sai Tai Mai)': 'สายใต้ใหม่', Ekkamai: 'เอกมัย', Rangsit: 'รังสิต', 'Hat Yai': 'หาดใหญ่',
  'Koh Samui': 'เกาะสมุย', 'Koh Kood': 'เกาะกูด', 'Koh Mak': 'เกาะหมาก', 'Koh Lanta': 'เกาะลันตา', 'Koh Phangan': 'เกาะพะงัน', 'Koh Tao': 'เกาะเต่า',
  'Koh Chang': 'เกาะช้าง', 'Koh Phi Phi': 'เกาะพีพี', 'Ao Nang': 'อ่าวนาง', Pattaya: 'พัทยา', 'Hua Hin': 'หัวหิน', Pranburi: 'ปราณบุรี', Pai: 'ปาย',
};
const thName = en => { const d = en.replace(/ District$/, ''); return TH[en] ? `${TH[en]};${en}` : TH[d] ? `อ.${TH[d]};${en}` : en; };
const term = new Map();
const tn = (mode, name, lat, lon) => { const k = mode + name + lat + lon; return term.get(k) ?? term.set(k, add(thName(name), lat, lon, mode === 'boat' ? 'f' : 'b')).get(k); };
const dur = s => { const h = s.match(/(\d+)\s*h/), m = s.match(/(\d+)\s*m/); return h || m ? (+(h?.[1] || 0)) * 60 + +(m?.[1] || 0) : null; };
for (const [file, m, v] of [['bus_traffic.csv', 'coach', 71], ['ferry_traffic.csv', 'ferry', 46]]) for (const r of csv(D + file)) {
  const a = tn(m === 'ferry' ? 'boat' : 'bus', r.Departure, r['Departure Latitude'], r['Departure Longitude']);
  const b = tn(m === 'ferry' ? 'boat' : 'bus', r.Destination, r['Destination Latitude'], r['Destination Longitude']);
  if (a === b) continue;
  const dist = Math.max(parseFloat(r.Distance) || 0, km(nodes[a][1], nodes[a][2], nodes[b][1], nodes[b][2]) * 1.2); // some published distances are too short
  const pub = dur(r['Est. Duration'] || ''); // published durations faster than 100 km/h are bogus
  const trips = parseFloat(r['Total Trips']) || 1;
  const fare = parseFloat((r['Cheapest Price'] || '').replace(/[^\d.]/g, '')) || undefined;
  pats.push({ m, n: m === 'ferry' ? 'เรือ' : 'รถทัวร์/รถตู้', sn: m === 'ferry' ? 'เรือ' : 'รถทัวร์', hs: thName(r.Destination).split(';')[0], op: (r['List of Operators'] || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 2).join(', '), e: 1, h: r1(1440 / trips), s: [a, b], t: [0, Math.round(pub && pub >= dist / 100 * 60 ? pub : dist / v * 60)], f: fare, k: trips });
}
console.log('intercity terminals', term.size);

// --- 4. Transfers: walk (<=400 m, 12 nearest) between all nodes; local ride (<=25 km) between hubs ---
const links = []; // flat [a, b, min, kind(0 walk,1 local)]
const cell = (lat, lon, sz) => Math.floor(lat / sz) + ':' + Math.floor(lon / sz);
function near(ids, maxKm, sz, cap, kind, minutes) {
  const grid = {};
  for (const i of ids) (grid[cell(nodes[i][1], nodes[i][2], sz)] ||= []).push(i);
  for (const i of ids) {
    const [, la, lo] = nodes[i], cy = Math.floor(la / sz), cx = Math.floor(lo / sz), out = [];
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) for (const j of grid[(cy + y) + ':' + (cx + x)] || []) {
      if (j === i) continue;
      const d = km(la, lo, nodes[j][1], nodes[j][2]);
      if (d <= maxKm) out.push([d, j]);
    }
    out.sort((a, b) => a[0] - b[0]).slice(0, cap).forEach(([d, j]) => links.push(i, j, r1(minutes(d)), kind));
  }
}
const all = nodes.map((_, i) => i);
near(all, 0.4, 0.004, 12, 0, d => Math.max(1, d * 1.3 / 4.8 * 60));
near(all.filter(i => nodes[i][3] !== 's'), 25, 0.25, 30, 1, d => 5 + d * 1.4 / 30 * 60);
console.log('links', links.length / 4);

writeFileSync(D + 'graph.json', JSON.stringify({ built: new Date().toISOString(), nodes, pats, links }));
console.log('wrote', D + 'graph.json');
