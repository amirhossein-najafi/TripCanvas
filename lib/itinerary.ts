import { fromMinutes, toMinutes } from "@/lib/dates";
import type { Activity, Day } from "@/types";
import { nid } from "@/lib/utils";

export function buildDays(tripId: string, dates: string[], ids?: string[]): Day[] {
  return dates.map((date, index) => ({
    id: ids?.[index] ?? nid("day"),
    tripId,
    date,
    note: "",
  }));
}

export function activitiesForDay(activities: Activity[], dayId: string) {
  return activities.filter((activity) => activity.dayId === dayId).sort((a, b) => a.position - b.position || a.startTime.localeCompare(b.startTime));
}

export function moveActivity(activities: Activity[], activeId: string, overId: string): Activity[] {
  const active = activities.find((activity) => activity.id === activeId);
  if (!active) return activities;

  let toDayId = active.dayId;
  let toIndex = 0;

  if (overId.startsWith("day:")) {
    toDayId = overId.slice(4);
    toIndex = activities.filter((activity) => activity.dayId === toDayId && activity.id !== activeId).length;
  } else if (overId === activeId) {
    return activities;
  } else {
    const over = activities.find((activity) => activity.id === overId);
    if (!over) return activities;
    toDayId = over.dayId;
    const siblings = activities
      .filter((activity) => activity.dayId === toDayId && activity.id !== activeId)
      .sort((a, b) => a.position - b.position);
    const index = siblings.findIndex((activity) => activity.id === overId);
    toIndex = index < 0 ? siblings.length : index;
  }

  const sourceDay = active.dayId;
  const others = activities.filter((activity) => activity.id !== activeId);
  const target = others.filter((activity) => activity.dayId === toDayId).sort((a, b) => a.position - b.position);
  target.splice(toIndex, 0, { ...active, dayId: toDayId });
  const source = sourceDay !== toDayId ? others.filter((activity) => activity.dayId === sourceDay).sort((a, b) => a.position - b.position) : [];
  const untouched = others.filter((activity) => activity.dayId !== toDayId && activity.dayId !== sourceDay);
  return [...untouched, ...reindex(target), ...reindex(source)];
}

export function applyOrder(activities: Activity[], dayId: string, orderedIds: string[], resequence = false): Activity[] {
  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  const next = activities.map((activity) =>
    activity.dayId === dayId && positions.has(activity.id) ? { ...activity, position: positions.get(activity.id)! } : activity,
  );
  if (!resequence) return next;
  const dayActs = activitiesForDay(next, dayId);
  const start = dayActs[0] ? toMinutes(dayActs[0].startTime) : 9 * 60;
  const timed = sequenceFrom(dayActs, start);
  const timedIds = new Set(timed.map((activity) => activity.id));
  return [...next.filter((activity) => !timedIds.has(activity.id)), ...timed];
}

export function sequenceFrom(list: Activity[], startMinutes: number, gap = 20) {
  let cursor = startMinutes;
  return [...list]
    .sort((a, b) => a.position - b.position)
    .map((activity) => {
      const startTime = fromMinutes(cursor);
      cursor += Math.max(activity.duration, 30) + gap;
      return { ...activity, startTime };
    });
}

export function reindex(list: Activity[]) {
  return list.map((activity, index) => ({ ...activity, position: index }));
}

export function makeLessBusy(activities: Activity[], dayId: string) {
  const day = activitiesForDay(activities, dayId);
  if (day.length <= 3) return { next: activities, removed: [] as Activity[] };
  const kept = day.slice(0, 3).map((activity, index) => ({ ...activity, position: index }));
  const removed = day.slice(3);
  const removedIds = new Set(removed.map((activity) => activity.id));
  const next = activities
    .filter((activity) => !removedIds.has(activity.id))
    .map((activity) => kept.find((item) => item.id === activity.id) ?? activity);
  return { next, removed };
}

export function replaceDayActivities(activities: Activity[], dayId: string, created: Activity[]) {
  const removed = activities.filter((activity) => activity.dayId === dayId);
  return { next: [...activities.filter((activity) => activity.dayId !== dayId), ...created], removed };
}

export function dayLabel(days: Day[], dayId: string) {
  const index = [...days].sort((a, b) => a.date.localeCompare(b.date)).findIndex((day) => day.id === dayId);
  return index >= 0 ? `Day ${index + 1}` : "another day";
}
