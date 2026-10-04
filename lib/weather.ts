import { activitiesForDay } from "@/lib/itinerary";
import { fromMinutes, toMinutes } from "@/lib/dates";
import type { Activity, Place } from "@/types";

export type DayWeather = {
  date: string;
  temp: number;
  rain: number;
  code: number;
  label: string;
  emoji: string;
  rainAfter: string | null;
};

const MONTHS: Record<string, { hi: number; rain: number; code: number }[]> = {
  tokyo: normals(10, 48, 14),
  istanbul: normals(9, 42, 12),
  paris: normals(7, 46, 11),
  rome: normals(12, 36, 15),
  kyoto: normals(9, 44, 13),
  "new-york": normals(4, 40, 12),
  london: normals(8, 50, 11),
  barcelona: normals(13, 30, 15),
  marrakech: normals(18, 18, 14),
  cairo: normals(22, 6, 12),
  "cape-town": normals(17, 30, 8, true),
  rio: normals(26, 36, 6, true),
  "buenos-aires": normals(16, 28, 10, true),
  "mexico-city": normals(20, 32, 6),
  sydney: normals(18, 32, 8, true),
  bangkok: normals(31, 28, 4),
  seoul: normals(6, 34, 16),
  reykjavik: normals(3, 55, 8),
};

function normals(base: number, rain: number, swing: number, south = false) {
  return Array.from({ length: 12 }, (_, month) => {
    const winter = south ? month >= 4 && month <= 7 : month <= 1 || month >= 10;
    return {
      hi: base + (winter ? 0 : swing) + (month - 6),
      rain: winter ? rain + 10 : Math.max(8, rain - month),
      code: winter ? 61 : 2,
    };
  });
}

export function weatherEmoji(code: number) {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code >= 95) return "⛈️";
  return "☁️";
}

export function weatherLabel(code: number) {
  if (code === 0) return "Clear";
  if (code <= 3) return "Cloudy";
  if (code <= 48) return "Fog";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code >= 95) return "Storm";
  return "Cloudy";
}

export function fallbackWeather(destinationId: string, dates: string[]): DayWeather[] {
  const table = MONTHS[destinationId] ?? MONTHS.tokyo;
  return dates.map((date) => {
    const day = Number(date.slice(8, 10));
    const month = Number(date.slice(5, 7)) - 1;
    const normal = table[month] ?? table[0];
    const rainy = day % 4 === 0;
    const rain = Math.min(90, normal.rain + (rainy ? 35 : (day % 3) * 4));
    const code = rainy ? 61 : normal.code;
    return {
      date,
      temp: normal.hi + (day % 5) - 2,
      rain,
      code,
      label: weatherLabel(code),
      emoji: weatherEmoji(code),
      rainAfter: rain >= 50 ? "15:00" : null,
    };
  });
}

export async function loadWeather(options: {
  destinationId: string;
  lat: number;
  lng: number;
  timezone: string;
  dates: string[];
}): Promise<DayWeather[]> {
  const fallback = fallbackWeather(options.destinationId, options.dates);
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(options.lat));
    url.searchParams.set("longitude", String(options.lng));
    url.searchParams.set("daily", "weather_code,temperature_2m_max,precipitation_probability_max");
    url.searchParams.set("timezone", options.timezone);
    url.searchParams.set("forecast_days", "16");
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return fallback;
    const data = (await response.json()) as {
      daily?: { time: string[]; temperature_2m_max: number[]; precipitation_probability_max: number[]; weather_code: number[] };
    };
    if (!data.daily) return fallback;
    const byDate = new Map(data.daily.time.map((date, index) => [date, index]));
    return options.dates.map((date, index) => {
      const hit = byDate.get(date);
      if (hit == null) return fallback[index];
      const code = data.daily!.weather_code[hit] ?? 2;
      const rain = data.daily!.precipitation_probability_max[hit] ?? 0;
      const temp = Math.round(data.daily!.temperature_2m_max[hit] ?? fallback[index].temp);
      return {
        date,
        temp,
        rain,
        code,
        label: weatherLabel(code),
        emoji: weatherEmoji(code),
        rainAfter: rain >= 50 ? "15:00" : null,
      };
    });
  } catch {
    return fallback;
  }
}

export function placeIsOutdoor(place: Place | undefined) {
  return Boolean(place && !place.indoor);
}

/** Outdoor stops stay before the rain hour. Indoor stops move into it. */
export function moveIndoorIntoRain(activities: Activity[], places: Place[], dayId: string): Activity[] {
  const dayActs = activitiesForDay(activities, dayId);
  const outdoor: Activity[] = [];
  const indoor: Activity[] = [];
  for (const activity of dayActs) {
    const place = places.find((item) => item.id === activity.placeId);
    if (place && !place.indoor) outdoor.push(activity);
    else indoor.push(activity);
  }
  if (!indoor.length || !outdoor.length) return activities;
  const ordered = [...outdoor, ...indoor];
  let cursor = Math.min(...dayActs.map((activity) => toMinutes(activity.startTime)));
  const rainAt = 15 * 60;
  const updated = new Map<string, Activity>();
  ordered.forEach((activity, index) => {
    const indoorStart = index === outdoor.length;
    if (indoorStart) cursor = Math.max(cursor, rainAt);
    updated.set(activity.id, { ...activity, position: index, startTime: fromMinutes(cursor) });
    cursor += Math.max(activity.duration, 45) + 20;
  });
  return activities.map((activity) => updated.get(activity.id) ?? activity);
}
