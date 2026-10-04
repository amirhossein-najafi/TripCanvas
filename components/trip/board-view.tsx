"use client";

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useTripParams } from "@/features/trips/use-trip-params";
import { useTrip } from "@/features/trips/trip-provider";
import { placeById } from "@/lib/catalog";
import { formatDayChip } from "@/lib/dates";
import { activitiesForDay } from "@/lib/itinerary";

export function BoardView() {
  const { bundle, canEdit, actions } = useTrip();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  if (!bundle) return null;

  function onDragEnd(event: DragEndEvent) {
    if (!canEdit || !event.over) return;
    const active = String(event.active.id);
    const over = String(event.over.id);
    if (active.startsWith("save:") && over.startsWith("day:")) {
      const place = placeById(active.slice(5));
      if (!place) return;
      actions.createActivity({ dayId: over.slice(4), placeId: place.id, title: place.name, startTime: "10:00", duration: place.durationMin }).catch(() => undefined);
      actions.unsavePlace(place.id).catch(() => undefined);
      return;
    }
    if (over === "ideas" && !active.startsWith("save:")) {
      const activity = bundle!.activities.find((item) => item.id === active);
      if (activity?.placeId) actions.savePlace(activity.placeId).catch(() => undefined);
      actions.deleteActivity(active).catch(() => undefined);
      return;
    }
    if (!active.startsWith("save:")) actions.move(active, over).catch(() => undefined);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex min-h-0 flex-1 gap-3 overflow-auto p-4">
        <Column id="ideas" title="Ideas">
          {bundle.saved.map((item) => {
            const place = placeById(item.placeId);
            if (!place) return null;
            return <IdeaCard key={item.id} id={`save:${place.id}`} title={place.name} />;
          })}
        </Column>
        {bundle.days.map((day) => (
          <Column key={day.id} id={`day:${day.id}`} title={formatDayChip(day.date)}>
            {activitiesForDay(bundle.activities, day.id).map((activity) => (
              <IdeaCard key={activity.id} id={activity.id} title={activity.title} />
            ))}
          </Column>
        ))}
      </div>
    </DndContext>
  );
}

function Column({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={`w-56 shrink-0 rounded-[18px] border border-border p-3 ${isOver ? "bg-accent/10" : "bg-background"}`}>
      <p className="mb-3 text-xs tracking-[0.14em] text-muted uppercase">{title}</p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function IdeaCard({ id, title }: { id: string; title: string }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
  const patch = useTripParams().patch;
  const placeId = id.startsWith("save:") ? id.slice(5) : undefined;
  return (
    <button
      ref={setNodeRef}
      type="button"
      className="block w-full rounded-2xl border border-border bg-card px-3 py-3 text-left text-sm"
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      onClick={() => placeId && patch({ place: placeId })}
    >
      {title}
    </button>
  );
}
