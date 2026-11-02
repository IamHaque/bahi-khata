import { useEffect, useState, type CSSProperties } from "react";

/** Mobile keyboards can shrink/pan the visual viewport without changing dvh. */
export function usePopupViewport(): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      setStyle({
        "--popup-height": `${viewport.height}px`,
        "--popup-top": `${viewport.offsetTop}px`,
      } as CSSProperties);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return style;
}
