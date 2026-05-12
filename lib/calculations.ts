import type { Entry, ProcessedEntry } from "@/types";

export const MIN_HOURS = 4;

export function calcHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 1440;
  return +(mins / 60).toFixed(6);
}

/**
 * Processes entries into billable buckets.
 *
 * Two independent splits per entry:
 *   OVERTIME – hours beyond `overtimeThreshold` in a single entry → rate ×1.5
 *   TFN/ABN  – first `tfnLimit` cumulative hours → TFN salary; excess → ABN invoice
 *
 * The intersection produces four buckets per entry: rTFN, otTFN, rABN, otABN.
 */
export function processEntries(
  entries: Entry[],
  tfnLimit = 30,
  tfnRate?: number,
  overtimeThreshold = 12,
): ProcessedEntry[] {
  const sorted = [...entries].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : a.startTime.localeCompare(b.startTime);
  });

  let periodRun = 0;

  return sorted.map(entry => {
    const worked   = calcHours(entry.startTime, entry.endTime) - (entry.breakMins || 0) / 60;
    const total    = Math.max(MIN_HOURS, worked);

    const regular  = Math.min(total, overtimeThreshold);
    const overtime = total - regular;

    const tfnPortion = Math.max(0, Math.min(tfnLimit, periodRun + total) - periodRun);
    const abnPortion = total - tfnPortion;

    const rTFN  = Math.max(0, Math.min(regular, tfnPortion));
    const otTFN = Math.max(0, Math.min(total, tfnPortion) - regular);
    const rABN  = Math.max(0, Math.min(regular, total) - tfnPortion);
    const otABN = Math.max(0, total - Math.max(regular, tfnPortion));

    const abnR = entry.hourlyRate;
    const tR   = tfnRate ?? abnR;
    const tfnEarnings = rTFN * tR  + otTFN * tR  * 1.5;
    const abnEarnings = rABN * abnR + otABN * abnR * 1.5;

    periodRun += total;

    return {
      ...entry,
      total, regular, overtime,
      tfnPortion, abnPortion,
      rTFN, otTFN, rABN, otABN,
      tfnEarnings, abnEarnings,
      totalEarnings: tfnEarnings + abnEarnings,
    };
  });
}
