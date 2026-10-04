"use client";

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { eachDayOfInterval, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { useTrip } from "@/features/trips/trip-provider";
import { activitiesForDay } from "@/lib/itinerary";

export function CalendarView() {
  const { bundle, canEdit, actions } = useTrip();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  if (!bundle) return null;
  const month = startOfMonth(parseISO(bundle.trip.startDate));
  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfMonth(month) });
  const byDate = new Map(bundle.days.map((day) => [day.date, day]));

  function onDragEnd(event: DragEndEvent) {
    if (!canEdit || !event.over) return;
    actions.move(String(event.active.id), String(event.over.id)).catch(() => undefined);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <p className="mb-3 font-serif text-2xl font-semibold">{format(month, "MMMM yyyy")}</p>
        <div className="grid grid-cols-7 gap-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
            <p key={label} className="px-1 text-xs text-muted">{label}</p>
          ))}
          {days.map((date) => {
            const iso = format(date, "yyyy-MM-dd");
            const tripDay = byDate.get(iso);
            return <CalendarCell key={iso} iso={iso} dayId={tripDay?.id} inTrip={Boolean(tripDay)} note={tripDay?.note ?? ""} activities={tripDay ? activitiesForDay(bundle.activities, tripDay.id) : []} />;
          })}
        </div>
      </div>
    </DndContext>
  );
}

function CalendarCell({ iso, dayId, inTrip, note, activities }: { iso: string; dayId?: string; inTrip: boolean; note: string; activities: { id: string; title: string }[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayId ? `day:${dayId}` : `off:${iso}`, disabled: !dayId });
  return (
    <div ref={setNodeRef} className={`min-h-28 rounded-2xl border border-border p-2 ${inTrip ? "bg-card" : "opacity-40"} ${isOver ? "bg-accent/10" : ""}`}>
      <p className="font-mono text-xs tabular">{iso.slice(8)}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
      <div className="mt-1 space-y-1">
        {activities.map((activity) => <CalCard key={activity.id} id={activity.id} title={activity.title} />)}
      </div>
    </div>
  );
}

function CalCard({ id, title }: { id: string; title: string }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
  return (
    <button ref={setNodeRef} type="button" className="block w-full truncate rounded-lg bg-background px-1.5 py-1 text-left text-xs" style={{ transform: CSS.Translate.toString(transform) }} {...listeners} {...attributes}>
      {title}
    </button>
  );
}
