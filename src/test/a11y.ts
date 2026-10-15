import * as axe from "axe-core";

/**
 * S-40 — the automated accessibility gate.
 *
 * The PRD's bar is "zero serious or critical violations", so the helper
 * runs axe-core over a rendered container and keeps only impacts
 * `serious` and `critical`. Moderate/minor findings are included in the
 * thrown message for context but never fail the test on their own.
 *
 * Note: axe's colour-contrast rule cannot compute in jsdom (no layout
 * engine) — it reports those as "incomplete", never as violations. The
 * token contrast itself is audited by scripts/contrast-audit.cjs and
 * pinned in its own test.
 */

export async function runAxe(container: Element): Promise<axe.Result[]> {
  const results = await axe.run(container, {
    resultTypes: ["violations"],
  });
  return results.violations;
}

export function seriousViolations(violations: axe.Result[]): axe.Result[] {
  return violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
}

export function formatViolations(violations: axe.Result[]): string {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)\n` +
        v.nodes
          .slice(0, 3)
          .map((node) => `  ${node.html}`)
          .join("\n"),
    )
    .join("\n");
}

/** Assert a rendered container has no serious/critical a11y violations. */
export async function expectNoSeriousViolations(
  container: Element,
): Promise<void> {
  const violations = await runAxe(container);
  const serious = seriousViolations(violations);
  if (serious.length > 0) {
    throw new Error(`A11y violations:\n${formatViolations(serious)}`);
  }
}
