// Fails if src/index.css differs from the values scripts/contrast-audit.cjs audits.
//   node scripts/check-token-sync.cjs
// Without this, someone could edit a colour in index.css and the audit would still pass on its own copy.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src", "index.css"), "utf8");
const aud = fs.readFileSync(path.join(__dirname, "contrast-audit.cjs"), "utf8");
const themes = eval("(" + aud.match(/const themes = (\{[\s\S]*?\n\});/)[1] + ")");
const block = (sel) => {
  const i = css.indexOf(sel + " {"); if (i < 0) return "";
  const j = css.indexOf("{", i); let d = 0;
  for (let k = j; k < css.length; k++) { if (css[k] === "{") d++; if (css[k] === "}" && --d === 0) return css.slice(j + 1, k); }
  return "";
};
const parse = (b) => Object.fromEntries([...b.matchAll(/--([a-z0-9-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)\s*;/g)].map((m) => [m[1], [+m[2], +m[3], +m[4]]]));
const real = { light: parse(block(":root")), dark: parse(block(".dark")) };
let bad = 0, n = 0;
for (const th of ["light", "dark"]) for (const [k, v] of Object.entries(themes[th])) {
  const r = real[th][k]; n++;
  if (!r) { bad++; console.error(`MISSING  ${th} --${k} (audited as ${JSON.stringify(v)})`); continue; }
  if (r[0] !== v[0] || r[1] !== v[1] || r[2] !== v[2]) { bad++; console.error(`MISMATCH ${th} --${k}: css ${JSON.stringify(r)} vs audit ${JSON.stringify(v)}`); }
}
console.log(bad ? `FAILED: ${bad} of ${n} tokens out of sync` : `OK: ${n} audited tokens match src/index.css`);
process.exit(bad ? 1 : 0);
