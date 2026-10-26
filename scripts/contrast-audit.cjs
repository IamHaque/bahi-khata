// BahiKhata contrast audit for the "Ledger Page" palette (replaces the v2 script of the same name).
//   node scripts/contrast-audit.cjs [--verbose]       exit code 1 if any REQUIRED pair fails
// Method: OKLCH -> linear sRGB -> WCAG relative luminance (same method as v2).
// KEEP THE TABLES BELOW IN STEP WITH src/index.css: scripts/check-token-sync.cjs fails CI if they differ.
const clamp = (x) => Math.min(1, Math.max(0, x));
function lin([L, C, H]) {
  const h = (H * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(clamp);
}
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (base, tone, t) => base.map((v, i) => v * (1 - t) + tone[i] * t);

const themes = {
  light: {
    "background": [0.936, 0.012, 138],
    "foreground": [0.247, 0.053, 263],
    "card": [0.972, 0.009, 129],
    "card-foreground": [0.247, 0.053, 263],
    "popover": [0.972, 0.009, 129],
    "popover-foreground": [0.247, 0.053, 263],
    "primary": [0.438, 0.203, 266],
    "primary-foreground": [0.972, 0.009, 129],
    "secondary": [0.927, 0.007, 146],
    "secondary-foreground": [0.247, 0.053, 263],
    "muted": [0.927, 0.007, 146],
    "muted-foreground": [0.458, 0.043, 261],
    "accent": [0.927, 0.007, 146],
    "accent-foreground": [0.247, 0.053, 263],
    "destructive": [0.501, 0.178, 29],
    "input": [0.599, 0.02, 253],
    "ring": [0.438, 0.203, 266],
    "receivable": [0.468, 0.109, 152],
    "credit": [0.515, 0.16, 35],
    "settled": [0.458, 0.043, 261],
    "success": [0.468, 0.109, 152],
    "warning": [0.471, 0.099, 76],
    "chart-1": [0.438, 0.203, 266],
    "chart-2": [0.468, 0.109, 152],
    "chart-3": [0.515, 0.16, 35],
    "chart-4": [0.471, 0.099, 76],
    "chart-5": [0.458, 0.043, 261],
    "sidebar": [0.247, 0.053, 263],
    "sidebar-foreground": [0.865, 0.028, 263],
  },
  dark: {
    "background": [0.19, 0.015, 172],
    "foreground": [0.94, 0.011, 137],
    "card": [0.231, 0.019, 172],
    "card-foreground": [0.94, 0.011, 137],
    "popover": [0.231, 0.019, 172],
    "popover-foreground": [0.94, 0.011, 137],
    "primary": [0.757, 0.124, 271],
    "primary-foreground": [0.19, 0.015, 172],
    "secondary": [0.305, 0.017, 171],
    "secondary-foreground": [0.94, 0.011, 137],
    "muted": [0.305, 0.017, 171],
    "muted-foreground": [0.728, 0.02, 158],
    "accent": [0.305, 0.017, 171],
    "accent-foreground": [0.94, 0.011, 137],
    "destructive": [0.767, 0.138, 29],
    "input": [0.648, 0.013, 154],
    "ring": [0.757, 0.124, 271],
    "receivable": [0.79, 0.132, 153],
    "credit": [0.789, 0.125, 36],
    "settled": [0.728, 0.02, 158],
    "success": [0.79, 0.132, 153],
    "warning": [0.785, 0.131, 82],
    "chart-1": [0.757, 0.124, 271],
    "chart-2": [0.79, 0.132, 153],
    "chart-3": [0.789, 0.125, 36],
    "chart-4": [0.785, 0.131, 82],
    "chart-5": [0.728, 0.02, 158],
    "sidebar": [0.166, 0.01, 173],
    "sidebar-foreground": [0.728, 0.02, 158],
  },
};

let failures = 0;
for (const [name, t] of Object.entries(themes)) {
  const c = (k) => lin(t[k]);
  const tint = name === "light" ? 0.1 : 0.08;               // chips use bg-TONE/10 (light) and bg-TONE/8 (dark)
  const checks = [];
  for (const surf of ["background", "card", "muted"])
    for (const fg of ["foreground", "muted-foreground", "primary", "receivable", "credit", "settled", "destructive", "warning", "success"])
      checks.push([`${fg} text on ${surf}`, ratio(c(fg), c(surf)), 4.5]);
  for (const tone of ["receivable", "credit", "primary", "destructive", "warning", "success"])
    checks.push([`${tone} text on ${tone}/${tint * 100}% tint of card`, ratio(c(tone), mix(c("card"), c(tone), tint)), 4.5]);
  checks.push(["foreground on primary tint", ratio(c("foreground"), mix(c("card"), c("primary"), tint)), 4.5]);
  checks.push(["primary-foreground on primary (button)", ratio(c("primary-foreground"), c("primary")), 4.5]);
  checks.push(["sidebar-foreground on sidebar (spine)", ratio(c("sidebar-foreground"), c("sidebar")), 4.5]);
  checks.push(["foreground on background (active spine tab)", ratio(c("foreground"), c("background")), 4.5]);
  for (const surf of ["background", "card"]) {
    checks.push([`input border vs ${surf}`, ratio(c("input"), c(surf)), 3]);
    checks.push([`focus ring vs ${surf}`, ratio(c("ring"), c(surf)), 3]);
  }
  console.log(`\n== ${name}`);
  for (const [label, r, need] of checks) {
    const ok = r >= need; if (!ok) failures++;
    if (!ok || process.argv.includes("--verbose")) console.log(`${ok ? "pass" : "FAIL"}  ${r.toFixed(2)} (need ${need})  ${label}`);
  }
  console.log(`${checks.length} checks, ${checks.filter((x) => x[1] < x[2]).length} failing`);
  console.log(`info: card vs background = ${ratio(c("card"), c("background")).toFixed(3)} (Sheet on Paper)`);
}
console.log(failures ? `\nFAILED: ${failures} pair(s)` : "\nAll required pairs pass AA in both themes.");
process.exit(failures ? 1 : 0);
