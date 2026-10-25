// Smallest check that fails if routing breaks. Run: node check.mjs
import assert from 'node:assert';
import { route, search } from './route.mjs';

const show = r => r.legs.map(l => `  ${l.mode.padEnd(6)} ${String(l.min + l.wait).padStart(4)}m  ${l.from.name} → ${l.to.name}  (${l.name})`).join('\n');
const SIAM = [13.7456, 100.5341];

const city = route(SIAM, [13.8030, 100.5530]); // Chatuchak park
console.log('Siam → Chatuchak', city.total, 'min\n' + show(city));
assert(city.legs.some(l => l.mode === 'metro'), 'city trip should use BTS/MRT');
assert(city.total < 90);

const cm = route(SIAM, [18.7877, 98.9933], 8 * 60); // Tha Phae gate, Chiang Mai
console.log('Siam → Chiang Mai', cm.total, 'min\n' + show(cm));
assert(cm.legs.some(l => ['train', 'coach'].includes(l.mode)), 'long trip should use train or coach');
assert(cm.total > 480 && cm.total < 1200);

assert(search('เชียงใหม่').length > 0);
console.log('ok');
