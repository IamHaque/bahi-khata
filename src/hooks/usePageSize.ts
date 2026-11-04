import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export const PAGE_SIZES = [10, 25, 50, 100];

export function usePageSize(defaultSize: number) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("pageSize");
  const requested = Number(raw);
  const pageSize = PAGE_SIZES.includes(requested) ? requested : defaultSize;
  const canonical = pageSize === defaultSize ? null : String(pageSize);

  useEffect(() => {
    if (raw === canonical) return;
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (canonical === null) next.delete("pageSize");
      else next.set("pageSize", canonical);
      return next;
    }, { replace: true });
  }, [raw, canonical, setParams]);

  const setPageSize = useCallback((size: number) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (size === defaultSize) next.delete("pageSize");
      else next.set("pageSize", String(size));
      next.delete("page");
      return next;
    });
  }, [defaultSize, setParams]);

  return [pageSize, setPageSize] as const;
}
