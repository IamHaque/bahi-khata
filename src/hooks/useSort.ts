import { useCallback, useState } from "react";

export type SortDirection = "asc" | "desc";

export function useSort(defaultKey: string, defaultDir: SortDirection = "asc") {
  const [sortBy, setSortBy] = useState(defaultKey);
  const [sortDir, setSortDir] = useState<SortDirection>(defaultDir);

  const toggleSort = useCallback(
    (key: string) => {
      if (key === sortBy) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(key);
        setSortDir("asc");
      }
    },
    [sortBy],
  );

  return { sortBy, sortDir, toggleSort };
}
