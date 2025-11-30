// Shared date/time parsing and normalization utilities for both frontend and backend

// Parse model-provided date/time strings with Taiwan timezone defaults
export function parseModelDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  // If already ISO with timezone, let JS parse directly
  if (/T.*[Z\+\-]\d{0,2}:?\d{0,2}$/.test(value)) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  // yyyy-MM-dd HH:mm or yyyy-MM-ddTHH:mm -> assume Asia/Taipei +08:00
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/);
  if (m) {
    const s = `${m[1]}T${m[2]}+08:00`;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // yyyy-MM-dd -> start of day +08:00
  const m2 = value.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (m2) {
    const s = `${m2[1]}T00:00+08:00`;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// Robust extraction from OCR text with Chinese labels
export function parseTransportDateTimeV2(text: string): Date | null {
  if (!text) return null;
  try {
    const dateRegexes = [
      /(行程日期|日期)[:：]?\s*(\d{4})年(\d{1,2})月(\d{1,2})日/,
      /(\d{4})年(\d{1,2})月(\d{1,2})日/,
    ];
    const timeRegexes = [
      /(行程時間|時間)[:：]?\s*([0-2]?\d:[0-5]\d)/,
      /\b([0-2]?\d:[0-5]\d)\b/,
    ];

    let y: number | null = null;
    let m: number | null = null;
    let d: number | null = null;
    let hh: number | null = null;
    let mm: number | null = null;

    for (const re of dateRegexes) {
      const md = text.match(re);
      if (md) {
        if (md.length >= 5) {
          y = parseInt(md[2], 10);
          m = parseInt(md[3], 10) - 1;
          d = parseInt(md[4], 10);
        } else if (md.length >= 4) {
          y = parseInt(md[1], 10);
          m = parseInt(md[2], 10) - 1;
          d = parseInt(md[3], 10);
        }
        break;
      }
    }

    for (const re of timeRegexes) {
      const mt = text.match(re);
      if (mt) {
        const t = (mt[mt.length - 1] || "").split(":");
        hh = parseInt(t[0], 10);
        mm = parseInt(t[1], 10);
        break;
      }
    }

    if (y == null || m == null || d == null || hh == null || mm == null) return null;

    const iso = `${y.toString().padStart(4, "0")}-${(m + 1).toString().padStart(2, "0")}-${d
      .toString()
      .padStart(2, "0")}T${hh.toString().padStart(2, "0")}:${mm
      .toString()
      .padStart(2, "0")}:00+08:00`;
    const dt = new Date(iso);
    return isNaN(dt.getTime()) ? null : dt;
  } catch {
    return null;
  }
}

// Normalize start/end/allDay consistently. If times missing, fallback is 1h duration.
export function normalizeEventTimesFromText(
  args: { startTime?: any; endTime?: any; allDay?: boolean },
): { start: Date; end: Date; allDay: boolean } {
  const allDay = !!args.allDay;
  let start = parseModelDateTimeLocal(args.startTime as any);
  let end = parseModelDateTimeLocal(args.endTime as any);

  if (!start && args.startTime) start = new Date(args.startTime);
  if (!end && args.endTime) end = new Date(args.endTime);

  // If only a date was provided and allDay is true, set start at 00:00 +08 and end = start + 1 day
  if (!start && typeof args.startTime === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.startTime)) {
    const s = parseModelDateTimeLocal(args.startTime);
    if (s) start = s;
  }

  if (!start) {
    const now = new Date();
    start = now;
  }
  if (!end) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  if (allDay) {
    const y = start.getFullYear();
    const m = start.getMonth();
    const d = start.getDate();
    const startLocal = new Date(y, m, d, 0, 0, 0, 0);
    start = startLocal;
    end = new Date(startLocal.getTime() + 24 * 60 * 60 * 1000);
  }

  if (end <= start) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  return { start, end, allDay };
}

