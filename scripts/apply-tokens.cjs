// Applies a design-token file to src/index.css, deterministically and idempotently.
//   node scripts/apply-tokens.cjs [path-to-token-file]     (default: design/design-tokens.ledger.css)
// Replaces existing token values, adds missing tokens, and appends the @layer components block once.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const target = path.join(root, "src", "index.css");
const srcPath = path.resolve(root, process.argv[2] || "design/design-tokens.ledger.css");
const source = fs.readFileSync(srcPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
let css = fs.readFileSync(target, "utf8");

function findBlock(src, header) {                         // [openIndex, closeIndex] of the braces
  const i = src.indexOf(header + " {");
  if (i < 0) return null;
  const open = src.indexOf("{", i);
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === "{") depth++;
    if (src[k] === "}" && --depth === 0) return [open, k];
  }
  return null;
}
const decls = (body) => [...body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]);
let changed = 0, added = 0;

function patchBlock(header, srcBody) {
  for (const [name, value] of decls(srcBody)) {
    const b = findBlock(css, header);
    if (!b) throw new Error(`block "${header}" not found in src/index.css`);
    const body = css.slice(b[0] + 1, b[1]);
    const re = new RegExp(`(--${name}\\s*:\\s*)([^;]+)(;)`);
    if (re.test(body)) {
      const next = body.replace(re, (all, a, old, c) => { if (old.trim() !== value) changed++; return a + value + c; });
      css = css.slice(0, b[0] + 1) + next + css.slice(b[1]);
    } else {
      css = css.slice(0, b[1]) + `  --${name}: ${value};\n` + css.slice(b[1]);
      added++;
    }
  }
}
for (const header of ["@theme inline", ":root", ".dark"]) {
  const s = findBlock(source, header);
  if (!s) throw new Error(`"${header}" block missing from ${path.basename(srcPath)}`);
  patchBlock(header, source.slice(s[0] + 1, s[1]));
}
const layer = findBlock(source, "@layer components");
if (layer && !css.includes(".totals-rule")) {
  css = css.trimEnd() + "\n\n@layer components " + source.slice(layer[0], layer[1] + 1) + "\n";
  added++;
}
fs.writeFileSync(target, css);
console.log(`src/index.css updated: ${changed} value(s) changed, ${added} item(s) added.`);
