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

export type PhotoDateBounds = {
  minDate: string; // "YYYY-MM-DD"
  maxDate: string; // "YYYY-MM-DD"
  totalWithDates: number;
};

/**
 * Extracts earliest and latest dates from a collection of photos
 */
export function computePhotoDateBounds(
  photos: { takenAt?: string | null }[]
): PhotoDateBounds | null {
  const validDates: string[] = [];

  for (const p of photos) {
    if (!p.takenAt) continue;
    try {
      const d = new Date(p.takenAt);
      if (!isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        validDates.push(`${yyyy}-${mm}-${dd}`);
      }
    } catch {
      // ignore malformed
    }
  }

  if (validDates.length === 0) return null;

  validDates.sort();
  return {
    minDate: validDates[0],
    maxDate: validDates[validDates.length - 1],
    totalWithDates: validDates.length,
  };
}

/**
 * Determines if a trip's visit_date was automatically assigned as today's date
 * when the pin was dropped, rather than explicitly chosen by the user.
 */
export function isDefaultTripDate(trip: {
  visit_date?: string | null;
  end_date?: string | null;
  created_at?: string;
}): boolean {
  if (!trip.visit_date || !trip.created_at) return false;
  if (trip.end_date) return false; // An end_date indicates intentional user customization

  try {
    const createdDate = new Date(trip.created_at);
    const yyyy = createdDate.getFullYear();
    const mm = String(createdDate.getMonth() + 1).padStart(2, "0");
    const dd = String(createdDate.getDate()).padStart(2, "0");
    const createdYmd = `${yyyy}-${mm}-${dd}`;

    const tripStartYmd = trip.visit_date.slice(0, 10);
    return tripStartYmd === createdYmd;
  } catch {
    return false;
  }
}

export type TripDateSyncStatus =
  | 'NO_PHOTOS'
  | 'MATCH'
  | 'INSIDE'
  | 'DEFAULT_PLACEHOLDER'
  | 'EXPAND'
  | 'OUT_OF_BOUNDS';

export type TripDateSyncAnalysis = {
  status: TripDateSyncStatus;
  suggestedStartDate: string;
  suggestedEndDate: string;
  message?: string;
};

/**
 * Evaluates whether trip dates need updating based on uploaded photo EXIF dates:
 * - 'INSIDE': Photos fall within the trip duration. Never shrink user's trip!
 * - 'DEFAULT_PLACEHOLDER': Trip date was just the pin creation day (e.g. Jun 17, 2026), photos are Jan 3.
 * - 'EXPAND': Photos extend before or after existing range.
 * - 'OUT_OF_BOUNDS': Dates completely mismatch.
 */
export function evaluateTripDateSync(
  trip: { visit_date?: string | null; end_date?: string | null; created_at?: string },
  bounds: PhotoDateBounds | null
): TripDateSyncAnalysis {
  if (!bounds || bounds.totalWithDates === 0) {
    return {
      status: 'NO_PHOTOS',
      suggestedStartDate: trip.visit_date || '',
      suggestedEndDate: trip.end_date || '',
    };
  }

  const { minDate, maxDate, totalWithDates } = bounds;
  const currentStart = trip.visit_date ? trip.visit_date.slice(0, 10) : '';
  const currentEnd = trip.end_date ? trip.end_date.slice(0, 10) : currentStart;

  // Case 1: No dates set on trip at all
  if (!currentStart) {
    return {
      status: 'OUT_OF_BOUNDS',
      suggestedStartDate: minDate,
      suggestedEndDate: minDate === maxDate ? '' : maxDate,
      message: `Set trip dates to ${formatTripDateRange(minDate, maxDate)} (detected from ${totalWithDates} photos)`,
    };
  }

  // Case 2: Exact match
  if (currentStart === minDate && (currentEnd === maxDate || (!trip.end_date && minDate === maxDate))) {
    return {
      status: 'MATCH',
      suggestedStartDate: currentStart,
      suggestedEndDate: trip.end_date || '',
    };
  }

  // Case 3: Default Placeholder (created today, no end date, photos are from a different day/month/year)
  if (isDefaultTripDate(trip) && currentStart !== minDate) {
    return {
      status: 'DEFAULT_PLACEHOLDER',
      suggestedStartDate: minDate,
      suggestedEndDate: minDate === maxDate ? '' : maxDate,
      message: `Photos were taken on ${formatTripDateRange(minDate, maxDate)}. Update trip date to match?`,
    };
  }

  // Case 4: Photos fall completely inside current trip range (The "Never Shrink" rule)
  // e.g. Trip is Jan 1 - Jan 10, photos are Jan 3 - Jan 5
  if (currentStart <= minDate && currentEnd >= maxDate) {
    return {
      status: 'INSIDE',
      suggestedStartDate: currentStart,
      suggestedEndDate: trip.end_date || '',
    };
  }

  // Case 5: Photos extend outside current range (Smart expansion)
  const newStart = minDate < currentStart ? minDate : currentStart;
  const newEnd = maxDate > currentEnd ? maxDate : currentEnd;

  // If photos are completely outside or in a different month
  if (maxDate < currentStart || minDate > currentEnd) {
    return {
      status: 'OUT_OF_BOUNDS',
      suggestedStartDate: minDate,
      suggestedEndDate: minDate === maxDate ? '' : maxDate,
      message: `Photos were taken on ${formatTripDateRange(minDate, maxDate)}. Update trip dates to match?`,
    };
  }

  return {
    status: 'EXPAND',
    suggestedStartDate: newStart,
    suggestedEndDate: newEnd === newStart ? '' : newEnd,
    message: `Photos extend beyond your trip dates. Extend duration to ${formatTripDateRange(newStart, newEnd)}?`,
  };
}
