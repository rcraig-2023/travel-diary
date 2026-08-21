export function formatTripDateRange(
  startDateStr: string | null | undefined,
  endDateStr?: string | null | undefined
): string {
  if (!startDateStr) return "";
  try {
    const start = new Date(startDateStr);
    if (isNaN(start.getTime())) return startDateStr;

    if (!endDateStr || startDateStr === endDateStr) {
      return start.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) {
      return start.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const durationLabel = diffDays > 1 ? " (" + diffDays + " days)" : "";

    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      const month = start.toLocaleDateString(undefined, { month: "short" });
      return month + " " + start.getDate() + " – " + end.getDate() + ", " + start.getFullYear() + durationLabel;
    }

    if (start.getFullYear() === end.getFullYear()) {
      const startFmt = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const endFmt = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return startFmt + " – " + endFmt + ", " + start.getFullYear() + durationLabel;
    }

    const startFmt = start.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const endFmt = end.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return startFmt + " – " + endFmt + durationLabel;
  } catch {
    return startDateStr;
  }
}

export function addDaysToDate(dateStr: string, days: number): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  } catch {
    return dateStr;
  }
}
