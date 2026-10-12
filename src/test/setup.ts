type ChangeHandler = (e: MediaQueryListEvent) => void;

let currentMatches = false;
const changeHandlers = new Set<ChangeHandler>();

export function __setMatchMedia(matches: boolean) {
  currentMatches = matches;
  const event = { matches } as MediaQueryListEvent;
  for (const handler of changeHandlers) {
    handler(event);
  }
}

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: currentMatches,
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
