// S-40 contrast audit: oklch tokens -> WCAG AA ratios, both themes.
// Run: node scripts/contrast-audit.cjs
function oklchToLinearRgb(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(fg, bg) {
  const l1 = luminance(fg), l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const light = {
  background: [0.99, 0.002, 250], foreground: [0.2, 0.015, 250],
  card: [1, 0, 0], "card-foreground": [0.2, 0.015, 250],
  primary: [0.55, 0.19, 262], "primary-foreground": [0.98, 0.005, 262],
  secondary: [0.96, 0.005, 250], muted: [0.96, 0.005, 250],
  "muted-foreground": [0.45, 0.015, 250],
  destructive: [0.55, 0.2, 25],
  receivable: [0.52, 0.14, 150], credit: [0.58, 0.17, 25],
  settled: [0.5, 0.012, 250], success: [0.5, 0.15, 150],
  warning: [0.48, 0.15, 75],
};
const dark = {
  background: [0.16, 0.01, 250], foreground: [0.97, 0.005, 250],
  card: [0.19, 0.012, 250], "card-foreground": [0.97, 0.005, 250],
  primary: [0.7, 0.16, 262], "primary-foreground": [0.2, 0.02, 262],
  secondary: [0.23, 0.012, 250], muted: [0.23, 0.012, 250],
  "muted-foreground": [0.65, 0.015, 250],
  destructive: [0.68, 0.18, 25],
  receivable: [0.75, 0.15, 150], credit: [0.72, 0.16, 25],
  settled: [0.65, 0.012, 250], success: [0.72, 0.15, 150],
  warning: [0.75, 0.14, 75],
};

function audit(name, t) {
  const rgb = (k) => oklchToLinearRgb(...t[k]);
  const pairs = [
    ["foreground", "background", 4.5],
    ["foreground", "card", 4.5],
    ["muted-foreground", "background", 4.5],
    ["muted-foreground", "card", 4.5],
    ["muted-foreground", "muted", 4.5],
    ["muted-foreground", "secondary", 4.5],
    ["primary-foreground", "primary", 4.5],
    ["receivable", "background", 4.5],
    ["receivable", "card", 4.5],
    ["credit", "background", 4.5],
    ["credit", "card", 4.5],
    ["settled", "card", 4.5],
    ["success", "card", 4.5],
    ["warning", "card", 4.5],
    ["destructive", "card", 4.5],
    ["destructive", "background", 4.5],
    ["primary", "background", 4.5], // links
    ["primary", "card", 4.5],
  ];
  console.log(`\n=== ${name} ===`);
  let fails = 0;
  for (const [fg, bg, min] of pairs) {
    const r = ratio(rgb(fg), rgb(bg));
    const ok = r >= min;
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"} ${fg} on ${bg}: ${r.toFixed(2)}:1`);
  }
  console.log(fails === 0 ? "All pairs pass AA." : `${fails} FAILING pair(s).`);
}
audit("light", light);
audit("dark", dark);
