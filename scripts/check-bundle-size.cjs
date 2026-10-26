// Fails the build if any JS chunk is too big. Run AFTER `npm run build`.
//   node scripts/check-bundle-size.cjs
// Budgets (raw, uncompressed): no single chunk over 500 kB; whole app over 1.5 MB is also a failure.
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "dist", "assets");
const MAX_CHUNK = 500 * 1024, MAX_TOTAL = 1.5 * 1024 * 1024;
if (!fs.existsSync(dir)) { console.error("dist/assets not found: run `npm run build` first"); process.exit(2); }
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => [f, fs.statSync(path.join(dir, f)).size]);
files.sort((a, b) => b[1] - a[1]);
let bad = 0;
for (const [f, s] of files.slice(0, 6)) console.log(`${(s / 1024).toFixed(1).padStart(8)} kB  ${f}`);
for (const [f, s] of files) if (s > MAX_CHUNK) { bad++; console.error(`FAIL: ${f} is ${(s / 1024).toFixed(0)} kB (> 500 kB)`); }
const total = files.reduce((a, [, s]) => a + s, 0);
console.log(`total JS: ${(total / 1024).toFixed(0)} kB across ${files.length} chunks`);
if (total > MAX_TOTAL) { bad++; console.error(`FAIL: total JS ${(total / 1024).toFixed(0)} kB (> 1500 kB)`); }
process.exit(bad ? 1 : 0);
