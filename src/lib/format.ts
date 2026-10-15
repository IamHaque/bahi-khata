const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(amount: number): string {
  return inrFormatter.format(amount);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDayMonth(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export function formatMonthYear(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const absDiff = Math.abs(diffMs);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absDiff < minute) return "just now";
  if (absDiff < hour) {
    const mins = Math.round(absDiff / minute);
    return diffMs < 0 ? `${mins} min ago` : `in ${mins} min`;
  }
  if (absDiff < day) {
    const hrs = Math.round(absDiff / hour);
    return diffMs < 0 ? `${hrs} hr ago` : `in ${hrs} hr`;
  }
  if (absDiff < 7 * day) {
    const days = Math.round(absDiff / day);
    return diffMs < 0 ? `${days} day${days === 1 ? "" : "s"} ago` : `in ${days} days`;
  }
  return formatDate(d);
}
