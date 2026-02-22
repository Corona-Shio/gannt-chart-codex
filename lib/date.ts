import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export const JST_TIME_ZONE = "Asia/Tokyo";

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
