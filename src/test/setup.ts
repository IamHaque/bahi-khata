type ChangeHandler = (e: MediaQueryListEvent) => void;

let currentMatches = false;
// L-14 (F2): per-query overrides so a test can simulate "narrow width but
// fine pointer" (or the reverse) instead of every query matching at once.
let currentOverrides: Record<string, boolean> = {};
const changeHandlers = new Set<ChangeHandler>();

function queryMatches(query: string): boolean {
  return query in currentOverrides
    ? (currentOverrides[query] ?? currentMatches)
    : currentMatches;
}

export function __setMatchMedia(
  matches: boolean,
  overrides?: Record<string, boolean>,
) {
  currentMatches = matches;
  currentOverrides = overrides ?? {};
  const event = { matches } as MediaQueryListEvent;
  for (const handler of changeHandlers) {
    handler(event);
  }
}

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: queryMatches(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (type: string, handler: ChangeHandler) => {
        if (type === "change") changeHandlers.add(handler);
      },
      removeEventListener: (type: string, handler: ChangeHandler) => {
        if (type === "change") changeHandlers.delete(handler);
      },
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
