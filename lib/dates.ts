import { addMinutes, eachDayOfInterval, format, parse, parseISO } from "date-fns";

export function eachDate(start: string, end: string) {
  return eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).map((date) => format(date, "yyyy-MM-dd"));
}

export function dayCount(start: string, end: string) {
  return eachDate(start, end).length;
}

export function formatDayChip(iso: string) {
  return format(parseISO(iso), "EEE d");
}

export function formatMonthDay(iso: string) {
  return format(parseISO(iso), "MMM d");
}

export function formatLong(iso: string) {
  return format(parseISO(iso), "EEE · d MMMM");
}

export function formatRange(start: string, end: string) {
  return `${format(parseISO(start), "MMM d")} → ${format(parseISO(end), "MMM d")}`;
}

export function tripLengthLabel(start: string, end: string) {
  const count = dayCount(start, end);
  return `${count} day${count === 1 ? "" : "s"}`;
}

export function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function fromMinutes(total: number) {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatTimeLabel(time: string) {
  const date = parse(time, "HH:mm", new Date());
  return format(date, "HH:mm");
}

export function formatDuration(minutes: number) {
  if (minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function addMinutesToTime(time: string, minutes: number) {
  const base = parse(time, "HH:mm", new Date());
  return format(addMinutes(base, minutes), "HH:mm");
}

export function formatFree(minutes: number) {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (minutes > 90) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours} hours`;
  }
  return `${minutes} minutes`;
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function hourInZone(timeZone: string, date = new Date()) {
  const value = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone,
  }).format(date);
  return Number(value);
}
