"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MapStage } from "@/components/map/map-stage";
import { EmptyState } from "@/components/itinerary/empty-state";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/panel";
import { useSession } from "@/features/auth/session";
import { useTripParams } from "@/features/trips/use-trip-params";
import { useTrip } from "@/features/trips/trip-provider";
import { placeById } from "@/lib/catalog";
import { categoryMeta } from "@/lib/categories";
import { formatDayChip, formatDuration, formatFree, formatLong } from "@/lib/dates";
import { freeMinutes, suggestPlace } from "@/lib/fit";
import { optimizeNearestNeighbor, routeMinutes } from "@/lib/geo";
import { activitiesForDay, applyOrder, dayLabel, makeLessBusy, moveActivity, replaceDayActivities, sequenceFrom } from "@/lib/itinerary";
import { formatMoney } from "@/lib/money";
import { useViewport } from "@/lib/use-viewport";
import { nid } from "@/lib/utils";
import { parsePlanPrompt, planPlaces } from "@/lib/plan-day";
import { moveIndoorIntoRain } from "@/lib/weather";
import { useUi } from "@/store/ui-store";
import type { Activity, Place } from "@/types";
import { BoardView } from "@/components/trip/board-view";
import { CalendarView } from "@/components/trip/calendar-view";

export function ItineraryView() {
  const mode = useViewport();
  const [tabletMap, setTabletMap] = useState(false);
  if (mode === "mobile") {
    return (
      <div className="relative h-full min-h-0">
        <MapStage />
        <MobileSheet>
          <Planner />
        </MobileSheet>
      </div>
    );
  }
  if (mode === "tablet") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex justify-center gap-2 border-b border-border p-3">
          <Button size="sm" variant={tabletMap ? "outline" : "dark"} onClick={() => setTabletMap(false)}>Itinerary</Button>
          <Button size="sm" variant={tabletMap ? "dark" : "outline"} onClick={() => setTabletMap(true)}>Map</Button>
        </div>
        <div className="min-h-0 flex-1">{tabletMap ? <MapStage /> : <Planner />}</div>
      </div>
    );
  }
  return (
    <div className="h-full min-h-0">
      <Planner />
    </div>
  );
}

function MobileSheet({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState(1);
  const height = ["28%", "52%", "88%"][snap];
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[22px] border border-border bg-card shadow-[var(--shadow)]" style={{ height }}>
      <button type="button" className="flex justify-center py-2" onClick={() => setSnap((value) => (value + 1) % 3)} aria-label="Resize plan">
        <span className="h-1.5 w-12 rounded-full bg-foreground/20" />
      </button>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function Planner() {
  const { bundle, canEdit, actions, weather } = useTrip();
  const { day, view, patch } = useTripParams();
  const { user } = useSession();
  const setDragging = useUi((state) => state.setDraggingActivityId);
  const setExplorer = useUi((state) => state.setExplorerOpen);
  const setFocus = useUi((state) => state.setFocusPlaceId);
  const [overId, setOverId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [prompt, setPrompt] = useState("I want coffee, art and ramen, no more than 6km walking.");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const selected = bundle?.days[day - 1] ?? bundle?.days[0];
  const dayActs = selected && bundle ? activitiesForDay(bundle.activities, selected.id) : [];
  const active = bundle?.activities.find((activity) => activity.id === activeId) ?? null;
  const forecast = weather.data?.find((item) => item.date === selected?.date);
  const saving = useMemo(() => {
    const points = dayActs
      .map((activity) => {
        const place = placeById(activity.placeId);
        return place ? { id: activity.id, lat: place.lat, lng: place.lng } : null;
      })
      .filter((point): point is { id: string; lat: number; lng: number } => Boolean(point));
    if (points.length < 3) return 0;
    return routeMinutes(points) - routeMinutes(optimizeNearestNeighbor(points));
  }, [dayActs]);
  if (!bundle || !selected) return null;
  const current = bundle;

  const free = freeMinutes(dayActs.map((activity) => activity.duration));
  const lastPlace = placeById([...dayActs].reverse().find((activity) => activity.placeId)?.placeId);
  const savedPlaces = bundle.saved
    .map((item) => placeById(item.placeId))
    .filter((place): place is Place => Boolean(place))
    .filter((place) => !dayActs.some((activity) => activity.placeId === place.id));
  const suggestion = selected ? suggestPlace({ freeMin: free, anchor: lastPlace ?? { lat: bundle.trip.centerLat, lng: bundle.trip.centerLng }, places: savedPlaces }) : null;

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    setDragging(id);
  }
  function onDragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    const next = event.over ? String(event.over.id) : null;
    setActiveId(null);
    setOverId(null);
    setDragging(null);
    if (!canEdit || !next || next === id) return;
    actions.move(id, next).catch(() => undefined);
  }

  async function optimize() {
    if (!selected || !user) return;
    const points = dayActs
      .map((activity) => {
        const place = placeById(activity.placeId);
        return place ? { id: activity.id, lat: place.lat, lng: place.lng } : null;
      })
      .filter((point): point is { id: string; lat: number; lng: number } => Boolean(point));
    const ordered = optimizeNearestNeighbor(points).map((point) => point.id);
    const rest = dayActs.filter((activity) => !ordered.includes(activity.id)).map((activity) => activity.id);
    const next = applyOrder(current.activities, selected.id, [...ordered, ...rest], true);
    await actions.commit(next, `${user.name} optimized ${dayLabel(current.days, selected.id)}.`);
  }

  async function addSuggested() {
    if (!selected || !suggestion) return;
    const start = dayActs.length ? dayActs[dayActs.length - 1].startTime : "15:00";
    await actions.createActivity({
      dayId: selected.id,
      placeId: suggestion.id,
      title: suggestion.name,
      startTime: start,
      duration: suggestion.durationMin,
    });
  }

  async function pullIndoor() {
    if (!selected || !user) return;
    let next = moveIndoorIntoRain(current.activities, current.places, selected.id);
    if (next === current.activities) {
      const elsewhere = current.activities.find((activity) => activity.dayId !== selected.id && placeById(activity.placeId)?.indoor === true);
      if (!elsewhere) {
        toast("No indoor activities to move.");
        return;
      }
      next = moveIndoorIntoRain(moveActivity(current.activities, elsewhere.id, `day:${selected.id}`), current.places, selected.id);
    }
    await actions.commit(next, `${user.name} moved indoor activities into the rain.`);
  }

  async function applyPlan() {
    if (!selected || !user) return;
    const intent = parsePlanPrompt(prompt);
    if (intent.lessBusy && intent.categories.length === 0) {
      const { next, removed } = makeLessBusy(current.activities, selected.id);
      await actions.commit(next, `${user.name} made ${dayLabel(current.days, selected.id)} less busy.`);
      for (const activity of removed) if (activity.placeId) await actions.savePlace(activity.placeId);
      setPlanOpen(false);
      return;
    }
    const saved = current.saved.map((item) => placeById(item.placeId)).filter((place): place is Place => Boolean(place));
    const anchorPlace = lastPlace ?? { lat: current.trip.centerLat, lng: current.trip.centerLng };
    const { ordered } = planPlaces({ prompt, saved, anchor: anchorPlace });
    if (!ordered.length) {
      toast("Nothing saved fits that plan.");
      return;
    }
    const drafted: Activity[] = ordered.map((place, index) => ({
      id: nid("act"),
      tripId: current.trip.id,
      dayId: selected.id,
      placeId: place.id,
      title: place.name,
      startTime: "09:00",
      duration: place.durationMin,
      position: index,
      note: "",
      plannedCost: 0,
      actualCost: null,
      status: "planned",
    }));
    const created = sequenceFrom(drafted, 9 * 60, 25);
    const { next } = replaceDayActivities(current.activities, selected.id, created);
    await actions.commit(next, `${user.name} planned ${dayLabel(current.days, selected.id)}.`);
    setPlanOpen(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 overflow-auto border-b border-border px-3 py-3">
        {bundle.days.map((item, index) => (
          <DayChip key={item.id} id={item.id} label={formatDayChip(item.date)} active={item.id === selected?.id} hot={overId === `day:${item.id}`} onClick={() => { setFocus(null); patch({ day: String(index + 1) }); }} testId={`day-chip-${index + 1}`} />
        ))}
      </div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        {(["timeline", "calendar", "board"] as const).map((item) => (
          <button key={item} type="button" onClick={() => patch({ view: item === "timeline" ? null : item })} className="relative px-2 py-1 text-sm capitalize">
            {view === item && <motion.span layoutId="view-pill" className="absolute inset-0 rounded-full bg-foreground/8" />}
            <span className="relative">{item}</span>
          </button>
        ))}
        <button type="button" className="ml-auto text-sm text-accent" onClick={() => setPlanOpen(true)}>Plan my day</button>
      </div>
      {selected && forecast && (
        <div className="flex flex-wrap items-center gap-3 px-4 pt-4 text-sm">
          <p className="font-medium">{formatLong(selected.date)}</p>
          <p className="font-mono tabular">{forecast.emoji} {forecast.temp}° · {forecast.rain}% rain</p>
          {forecast.rainAfter && <p className="text-muted">Rain expected after {forecast.rainAfter}.</p>}
          {forecast.rainAfter && canEdit && (
            <button type="button" className="text-accent" onClick={pullIndoor}>Move indoor activities here</button>
          )}
        </div>
      )}
      {view === "calendar" && <CalendarView />}
      {view === "board" && <BoardView />}
      {view === "timeline" && (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={(event) => setOverId(event.over ? String(event.over.id) : null)} onDragCancel={() => { setActiveId(null); setDragging(null); }} onDragEnd={onDragEnd}>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4" onScroll={(event) => {
            const root = event.currentTarget;
            const cards = [...root.querySelectorAll<HTMLElement>("[data-place]")];
            const edge = root.scrollTop + 80;
            const current = cards.find((card) => card.offsetTop >= edge) ?? cards.at(-1);
            if (current?.dataset.place) setFocus(current.dataset.place);
          }}>
            {saving >= 5 && canEdit && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <p>Your route can be {saving} minutes shorter.</p>
                <Button size="sm" onClick={optimize}>Optimize route</Button>
              </div>
            )}
            {free >= 90 && (
              <p className="mb-3 text-sm text-muted">{dayLabel(bundle.days, selected.id)} has {formatFree(free)} free.</p>
            )}
            {suggestion && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-secondary/15 px-4 py-3">
                <p>{suggestion.name} fits here.</p>
                {canEdit && <Button size="sm" variant="outline" onClick={addSuggested}>Add</Button>}
              </div>
            )}
            {!dayActs.length && <EmptyState destination={bundle.trip.destination} onExplore={() => setExplorer(true)} />}
            <SortableContext items={dayActs.map((activity) => activity.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {dayActs.map((activity) => (
                  <SortableCard key={activity.id} activity={activity} rainy={Boolean(forecast && forecast.rain >= 50 && placeById(activity.placeId) && !placeById(activity.placeId)!.indoor)} canEdit={canEdit} currency={bundle.trip.currency} />
                ))}
              </div>
            </SortableContext>
          </div>
          <DragOverlay>{active ? <CardBody activity={active} currency={bundle.trip.currency} overlay /> : null}</DragOverlay>
        </DndContext>
      )}
      <Modal open={planOpen} onClose={() => setPlanOpen(false)} title="Plan my day">
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} className="w-full rounded-2xl border border-border bg-background p-3 outline-none" />
        <div className="mt-3 flex flex-wrap gap-2">
          {["I want coffee, art and ramen, no more than 6km walking.", "Make this day less busy."].map((example) => (
            <button key={example} type="button" className="rounded-full border border-border px-3 py-1 text-xs" onClick={() => setPrompt(example)}>{example}</button>
          ))}
        </div>
        <Button className="mt-4" onClick={applyPlan}>Build the day</Button>
      </Modal>
    </div>
  );
}

function DayChip({ id, label, active, hot, onClick, testId }: { id: string; label: string; active: boolean; hot: boolean; onClick: () => void; testId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${id}` });
  return (
    <button ref={setNodeRef} type="button" data-testid={testId} onClick={onClick} className={`relative shrink-0 rounded-full px-3 py-2 font-mono text-sm tabular ${active ? "text-foreground" : "text-muted"} ${hot || isOver ? "bg-accent/15" : ""}`}>
      {active && <motion.span layoutId="day-pill" className="absolute inset-0 rounded-full bg-foreground/8" />}
      <span className="relative">{label}</span>
    </button>
  );
}

function SortableCard({ activity, rainy, canEdit, currency }: { activity: Activity; rainy: boolean; canEdit: boolean; currency: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: activity.id, disabled: !canEdit });
  const patch = useTripParams().patch;
  const setFocus = useUi((state) => state.setFocusPlaceId);
  return (
    <article
      ref={setNodeRef}
      data-testid={`activity-${activity.placeId ?? activity.id}`}
      data-place={activity.placeId ?? ""}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className="grid grid-cols-[72px_16px_1fr] gap-2"
      {...attributes}
      {...listeners}
      onClick={() => {
        if (activity.placeId) {
          setFocus(activity.placeId);
          patch({ place: activity.placeId });
        }
      }}
    >
      <time className="pt-3 font-mono text-sm tabular">{activity.startTime}</time>
      <div className="relative">
        <span className="absolute top-0 bottom-0 left-1/2 w-px bg-border" />
        <span className="absolute top-4 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-accent" />
      </div>
      <CardBody activity={activity} currency={currency} rainy={rainy} />
    </article>
  );
}

function CardBody({ activity, currency, rainy, overlay }: { activity: Activity; currency: string; rainy?: boolean; overlay?: boolean }) {
  const { bundle, canEdit, actions } = useTrip();
  const place = placeById(activity.placeId);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const comments = bundle?.comments.filter((comment) => comment.activityId === activity.id) ?? [];
  const cost = activity.actualCost ?? activity.plannedCost;
  return (
    <motion.div layout className={`rounded-[16px] border border-border bg-card p-3 ${overlay ? "shadow-[var(--shadow)]" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{activity.title}</p>
          {place && <p className="text-sm text-muted">{categoryMeta(place.category).emoji} {place.name}</p>}
          <p className="mt-1 font-mono text-xs text-muted tabular">
            {formatDuration(activity.duration)}
            {cost > 0 && ` · ${formatMoney(cost, currency)}`}
          </p>
        </div>
        <button type="button" className="text-sm text-muted" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}>
          💬 {comments.length}
        </button>
      </div>
      {rainy && <p className="mt-2 text-xs text-accent">Outdoor activity</p>}
      {open && !overlay && (
        <div className="mt-3 space-y-2 border-t border-border pt-3" onPointerDown={(event) => event.stopPropagation()}>
          {comments.map((comment) => {
            const author = bundle?.members.find((member) => member.userId === comment.userId)?.user.name ?? "Someone";
            return (
              <p key={comment.id} className="text-sm"><span className="font-medium">{author}: </span>{comment.body}</p>
            );
          })}
          {canEdit && (
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!body.trim()) return; actions.comment(activity.id, body); setBody(""); }}>
              <input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add a note" className="h-9 flex-1 rounded-xl bg-background px-3 text-sm outline-none" />
              <Button size="sm" type="submit">Send</Button>
            </form>
          )}
        </div>
      )}
    </motion.div>
  );
}
