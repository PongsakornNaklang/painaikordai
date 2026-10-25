// Route finder over data/graph.json (built by build.mjs). Pure code: no AI involved.
import { readFileSync } from 'node:fs';

const g = JSON.parse(readFileSync(new URL('data/graph.json', import.meta.url), 'utf8'));
export const { nodes, pats } = g;
const N = nodes.length;

export const km = (a1, o1, a2, o2) => {
  const r = Math.PI / 180, x = Math.sin((a2 - a1) * r / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin((o2 - o1) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const walkMin = d => Math.max(1, d * 1.3 / 4.8 * 60);
const localMin = d => 5 + d * 1.4 / 30 * 60;
const LOCAL_WEIGHT = 3;   // prefer public transport over taxi/songthaew/Grab
const TRANSFER = 3;       // minutes of "hassle" per boarding
// Trains run to the real SRT timetable: wait until the next departure. Others: half the headway, capped.
const wait = (p, i, clock) => (p.m === 'train' ? (((p.d0 + p.t[i] - clock) % 1440) + 1440) % 1440 : Math.min(p.h / 2, 30));

// State ids: 0..N-1 = standing at a stop; N.. = riding pattern p at stop index i.
const base = [], patOf = [], idxOf = [];
let S = N;
pats.forEach((p, k) => { base[k] = S; p.s.forEach((_, i) => { patOf.push(k); idxOf.push(i); }); S += p.s.length; });
const T = S; // virtual destination

const boards = Array.from({ length: N }, () => []);
pats.forEach((p, k) => p.s.forEach((n, i) => i < p.s.length - 1 && boards[n].push(k, i)));
const links = Array.from({ length: N }, () => []);
for (let i = 0; i < g.links.length; i += 4) links[g.links[i]].push(g.links[i + 1], g.links[i + 2], g.links[i + 3]);

class Heap {
  a = [];
  push(c, s) { const a = this.a; a.push([c, s]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

// Ways to step off/on the network at a GPS point: walk to stops <=1 km, or a local ride to nearby hubs/stops.
function access(lat, lon) {
  const out = [], hubs = [], stops = [];
  nodes.forEach(([, la, lo, k], i) => {
    const d = km(lat, lon, la, lo);
    if (d <= 1) out.push([i, walkMin(d), 'walk']);
    (k === 's' ? stops : hubs).push([d, i]);
  });
  // ponytail: linear scan of ~18k nodes per query; add a grid index if it shows up in profiles.
  const pick = (arr, n, max) => arr.sort((a, b) => a[0] - b[0]).slice(0, n).filter(([d]) => d > 1 && d <= max).forEach(([d, i]) => out.push([i, localMin(d), 'local']));
  pick(hubs, 8, Infinity);
  pick(stops, 8, 15);
  return out;
}

export function route(from, to, now = 0) { // now = minutes since midnight, Bangkok time
  const dist = new Float64Array(T + 1).fill(Infinity);
  const clk = new Float64Array(T + 1); // real minutes elapsed (dist is weighted)
  const prev = new Int32Array(T + 1).fill(-2), how = new Array(T + 1); // -1 = origin
  const h = new Heap();
  const relax = (s, c, p, why, t) => { if (c < dist[s]) { dist[s] = c; clk[s] = t; prev[s] = p; how[s] = why; h.push(c, s); } };
  const weight = (min, mode) => (mode === 'local' ? min * LOCAL_WEIGHT : min);

  for (const [i, min, mode] of access(from[0], from[1])) relax(i, weight(min, mode), -1, { mode, min }, min);
  const egress = new Map(access(to[0], to[1]).map(([i, min, mode]) => [i, { mode, min }]));
  const direct = km(from[0], from[1], to[0], to[1]);
  if (direct <= 1.5) relax(T, walkMin(direct), -1, { mode: 'walk', min: walkMin(direct) }, walkMin(direct));
  else if (direct <= 80) relax(T, weight(localMin(direct), 'local'), -1, { mode: 'local', min: localMin(direct) }, localMin(direct));

  while (h.size) {
    const [c, s] = h.pop();
    if (c > dist[s]) continue;
    if (s === T) break;
    if (s < N) {
      const e = egress.get(s);
      const t = clk[s];
      if (e) relax(T, c + weight(e.min, e.mode), s, e, t + e.min);
      const b = boards[s];
      for (let j = 0; j < b.length; j += 2) { const w = wait(pats[b[j]], b[j + 1], now + t); relax(base[b[j]] + b[j + 1], c + w + TRANSFER, s, 'board', t + w); }
      const l = links[s];
      for (let j = 0; j < l.length; j += 3) { const mode = l[j + 2] ? 'local' : 'walk'; relax(l[j], c + weight(l[j + 1], mode), s, { mode, min: l[j + 1] }, t + l[j + 1]); }
    } else {
      const p = pats[patOf[s - N]], i = idxOf[s - N];
      relax(p.s[i], c, s, 'alight', clk[s]);
      if (i + 1 < p.s.length) relax(s + 1, c + p.t[i + 1] - p.t[i], s, 'ride', clk[s] + p.t[i + 1] - p.t[i]);
    }
  }
  if (dist[T] === Infinity) return null;

  const chain = [];
  for (let s = T; s !== -1; s = prev[s]) chain.unshift(s);
  const place = s => (s === -1 ? { name: 'ตำแหน่งของคุณ', lat: from[0], lon: from[1] } : s === T ? { name: 'ปลายทาง', lat: to[0], lon: to[1] } : { name: nodes[s][0].split(';')[0], lat: nodes[s][1], lon: nodes[s][2] });
  const legs = [];
  let at = -1;
  for (let k = 0; k < chain.length; k++) {
    const s = chain[k];
    if (how[s] === 'board') {
      let e = k; while (how[chain[e + 1]] === 'ride') e++;
      const p = pats[patOf[s - N]], i = idxOf[s - N], j = idxOf[chain[e] - N];
      const leg = { mode: p.m, name: p.n, chip: p.sn, toward: p.hs, color: p.c, op: p.op || undefined, est: !!p.e, from: place(p.s[i]), to: place(p.s[j]), min: p.t[j] - p.t[i], wait: clk[s] - clk[prev[s]], stops: j - i,
        path: p.s.slice(i, j + 1).map(n => [nodes[n][1], nodes[n][2]]) };
      if (p.m === 'train') { leg.dep = (p.d0 + p.t[i]) % 1440; leg.arr = (p.d0 + p.t[j]) % 1440; }
      if (p.f) leg.fare = p.f;
      if (p.k) leg.perDay = p.k;
      if (p.m !== 'train') leg.headway = p.h;
      legs.push(leg);
      at = p.s[j]; k = e + 1; // skip the alight state
    } else if (typeof how[s] === 'object') {
      const a = place(at), b = place(s), last = legs.at(-1);
      if (last && last.mode === 'walk' && how[s].mode === 'walk') { last.to = b; last.min += how[s].min; last.path.push([b.lat, b.lon]); }
      else legs.push({ mode: how[s].mode, name: how[s].mode === 'walk' ? 'เดิน' : 'สองแถว / แท็กซี่ / Grab', est: true, from: a, to: b, min: how[s].min, wait: 0, path: [[a.lat, a.lon], [b.lat, b.lon]], km: Math.round(km(a.lat, a.lon, b.lat, b.lon) * 10) / 10 });
      at = s;
    }
  }
  for (const l of legs) { l.min = Math.round(l.min); l.wait = Math.round(l.wait); }
  const total = legs.reduce((a, l) => a + l.min + l.wait, 0);
  const fares = legs.filter(l => l.fare);
  return { total, est: legs.some(l => l.est), fare: fares.reduce((a, l) => a + l.fare, 0), fareComplete: legs.every(l => l.fare || l.mode === 'walk'), legs };
}

// Name search over our own stops/stations/terminals.
const KIND = { r: 'สถานีรถไฟ', b: 'จุดขึ้นรถทัวร์/บขส.', f: 'ท่าเรือ', s: 'ป้าย/สถานี' };
export function search(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set(), out = [];
  for (const [name, lat, lon, k] of nodes) {
    if (!name.toLowerCase().includes(q)) continue;
    const [th, en] = name.split(';');
    if (seen.has(th)) continue;
    seen.add(th);
    out.push({ name: th, sub: KIND[k] + (en ? ' · ' + en : ''), lat, lon, rank: (k === 's' ? 1 : 0) + th.length / 100 });
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, 6).map(({ rank, ...r }) => r);
}
