import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export const JST_TIME_ZONE = "Asia/Tokyo";
const holidayCache = new Map<number, Set<string>>();

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateKey(dateString: string) {
  const [yearRaw, monthRaw, dayRaw] = dateString.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { year, month, day };
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const delta = (weekday - firstDay + 7) % 7;
  return 1 + delta + (nth - 1) * 7;
}

function vernalEquinoxDay(year: number) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnEquinoxDay(year: number) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function buildJapaneseHolidaySet(year: number) {
  const holidays = new Set<string>();
  const add = (month: number, day: number) => holidays.add(toDateKey(year, month, day));

  if (year >= 1949) add(1, 1);
  if (year >= 2000) {
    add(1, nthWeekdayOfMonth(year, 1, 1, 2));
  } else if (year >= 1949) {
    add(1, 15);
  }

  if (year >= 1967) add(2, 11);
  if (year >= 2020) add(2, 23);
  if (year >= 1949) add(4, 29);
  if (year >= 1949) add(5, 3);
  if (year >= 2007) add(5, 4);
  if (year >= 1949) add(5, 5);

  if (year >= 1949) add(3, vernalEquinoxDay(year));
  if (year >= 1948) add(9, autumnEquinoxDay(year));

  if (year === 2020) {
    add(7, 23);
  } else if (year === 2021) {
    add(7, 22);
  } else if (year >= 2003) {
    add(7, nthWeekdayOfMonth(year, 7, 1, 3));
  } else if (year >= 1996) {
    add(7, 20);
  }

  if (year === 2020) {
    add(8, 10);
  } else if (year === 2021) {
    add(8, 8);
  } else if (year >= 2016) {
    add(8, 11);
  }

  if (year >= 2003) {
    add(9, nthWeekdayOfMonth(year, 9, 1, 3));
  } else if (year >= 1966) {
    add(9, 15);
  }

  if (year === 2020) {
    add(7, 24);
  } else if (year === 2021) {
    add(7, 23);
  } else if (year >= 2000) {
    add(10, nthWeekdayOfMonth(year, 10, 1, 2));
  } else if (year >= 1966) {
    add(10, 10);
  }

  if (year >= 1948) add(11, 3);
  if (year >= 1948) add(11, 23);

  if (year >= 1989 && year <= 2018) add(12, 23);
  if (year === 1990) add(11, 12);
  if (year === 1993) add(6, 9);
  if (year === 2019) add(5, 1);
  if (year === 2019) add(10, 22);

  if (year >= 1985) {
    const bridge = new Set<string>();
    for (let month = 1; month <= 12; month += 1) {
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let day = 1; day <= daysInMonth; day += 1) {
        const key = toDateKey(year, month, day);
        if (holidays.has(key)) continue;
        const date = new Date(year, month - 1, day);
        const prevDate = new Date(date);
        prevDate.setDate(prevDate.getDate() - 1);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        const prev = toDateKey(prevDate.getFullYear(), prevDate.getMonth() + 1, prevDate.getDate());
        const next = toDateKey(nextDate.getFullYear(), nextDate.getMonth() + 1, nextDate.getDate());
        if (holidays.has(prev) && holidays.has(next)) {
          bridge.add(key);
        }
      }
    }
    for (const key of bridge) {
      holidays.add(key);
    }
  }

  if (year >= 1973) {
    const current = [...holidays].sort();
    for (const key of current) {
      const parsed = parseDateKey(key);
      if (!parsed) continue;
      const dayOfWeek = new Date(parsed.year, parsed.month - 1, parsed.day).getDay();
      if (dayOfWeek !== 0) continue;

      const substitute = new Date(parsed.year, parsed.month - 1, parsed.day);
      while (true) {
        substitute.setDate(substitute.getDate() + 1);
        const substituteKey = toDateKey(substitute.getFullYear(), substitute.getMonth() + 1, substitute.getDate());
        if (!holidays.has(substituteKey)) {
          holidays.add(substituteKey);
          break;
        }
      }
    }
  }

  return holidays;
}

function getJapaneseHolidaySet(year: number) {
  if (holidayCache.has(year)) {
    return holidayCache.get(year) as Set<string>;
  }
  const holidaySet = buildJapaneseHolidaySet(year);
  holidayCache.set(year, holidaySet);
  return holidaySet;
}

export function toJstDateString(date: Date): string {
  const jstDate = new Date(date.toLocaleString("en-US", { timeZone: JST_TIME_ZONE }));
  return format(jstDate, "yyyy-MM-dd");
}

export function dateRange(start: string, end: string): string[] {
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  const days = differenceInCalendarDays(endDate, startDate);

  return Array.from({ length: days + 1 }, (_, index) => format(addDays(startDate, index), "yyyy-MM-dd"));
}

export function daysBetween(start: string, end: string): number {
  return differenceInCalendarDays(parseISO(end), parseISO(start));
}

export function isJapaneseHoliday(dateString: string): boolean {
  const parsed = parseDateKey(dateString);
  if (!parsed) return false;
  return getJapaneseHolidaySet(parsed.year).has(dateString);
}

export function isWeekend(dateString: string): boolean {
  const parsed = parseDateKey(dateString);
  if (!parsed) return false;
  const day = new Date(parsed.year, parsed.month - 1, parsed.day).getDay();
  return day === 0 || day === 6;
}

export function isNonWorkingDay(dateString: string): boolean {
  return isWeekend(dateString) || isJapaneseHoliday(dateString);
}
