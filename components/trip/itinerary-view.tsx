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
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MapStage } from "@/components/map/map-stage";
import { EmptyState } from "@/components/itinerary/empty-state";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/panel";
import { ActivityEditor } from "@/components/trip/activity-editor";
import { useTripPresence } from "@/features/collaboration/use-presence";
import { useSession } from "@/features/auth/session";
import { useTripParams } from "@/features/trips/use-trip-params";
import { useTrip } from "@/features/trips/trip-provider";
import { placeById } from "@/lib/catalog";
import { categoryMeta } from "@/lib/categories";
import { formatDayChip, formatDuration, formatFree, formatLong, fromMinutes, minutesInZone, toMinutes } from "@/lib/dates";
import { freeMinutes, suggestPlace } from "@/lib/fit";
import { optimizeNearestNeighbor, routeMinutes, walkMinutes, haversine } from "@/lib/geo";
import { estimateRoute, legSummary, orderByEta, routeBetween } from "@/lib/routing";
import { activitiesForDay, applyOrder, dayLabel, makeLessBusy, moveActivity, replaceDayActivities, sequenceFrom } from "@/lib/itinerary";
import { formatMoney } from "@/lib/money";
import { useViewport } from "@/lib/use-viewport";
import { nid } from "@/lib/utils";
import { parsePlanPrompt, planWithConstraints } from "@/lib/plan-day";
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
  const [preview, setPreview] = useState<{ removed: Activity[]; added: string[]; next: Activity[]; keep: boolean; reason: string | null } | null>(null);
  const [undoActivities, setUndoActivities] = useState<Activity[] | null>(null);
  const [editor, setEditor] = useState<Activity | null>(null);
  const [legs, setLegs] = useState<Record<string, string>>({});
  const presence = useTripPresence();

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
  const legKey = dayActs.map((activity) => `${activity.id}:${activity.placeId}`).join("|");
  useEffect(() => {
    let stop = false;
    const points = dayActs.map((activity) => ({ activity, place: placeById(activity.placeId) })).filter((item) => item.place);
    Promise.all(points.slice(1).map(async (item, index) => {
      const from = points[index].place!;
      const to = item.place!;
      const route = await routeBetween(from, to).catch(() => estimateRoute(from, to));
      return [item.activity.id, legSummary(route)] as const;
    })).then((rows) => {
      if (!stop) setLegs(Object.fromEntries(rows));
    });
    return () => { stop = true; };
  }, [legKey]);
  if (!bundle || !selected) return null;
  const current = bundle;

  const free = freeMinutes(dayActs.map((activity) => activity.duration));
  const lastPlace = placeById([...dayActs].reverse().find((activity) => activity.placeId)?.placeId);
  const savedPlaces = bundle.saved
    .map((item) => placeById(item.placeId))
    .filter((place): place is Place => Boolean(place))
    .filter((place) => !dayActs.some((activity) => activity.placeId === place.id));
  const suggestion = selected ? suggestPlace({ freeMin: free, anchor: lastPlace ?? { lat: bundle.trip.centerLat, lng: bundle.trip.centerLng }, places: savedPlaces }) : null;

  function ghost(event: DragStartEvent | DragMoveEvent) {
    const id = String(event.active.id);
    const activity = bundle?.activities.find((item) => item.id === id);
    const translated = event.active.rect.current.translated;
    const over = "over" in event && event.over ? String(event.over.id) : null;
    presence.publish({ drag: { activityId: id, title: activity?.title ?? "Activity", overId: over, x: translated?.left ?? 0, y: translated?.top ?? 0 } });
  }
  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    setDragging(id);
    ghost(event);
  }
  function onDragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    const next = event.over ? String(event.over.id) : null;
    setActiveId(null);
    setOverId(null);
    setDragging(null);
    presence.publish({ drag: null });
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
    const costs = new Map<string, number>();
    await Promise.all(points.flatMap((from) => points.map(async (to) => {
      if (from.id === to.id) return;
      const route = await routeBetween(from, to).catch(() => estimateRoute(from, to));
      costs.set(`${from.id}>${to.id}`, route.minutes);
    })));
    const ordered = costs.size
      ? orderByEta(points.map((point) => point.id), (from, to) => costs.get(`${from}>${to}`) ?? walkMinutes(haversine(
        points.find((point) => point.id === from)!,
        points.find((point) => point.id === to)!,
      )))
      : optimizeNearestNeighbor(points).map((point) => point.id);
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
      setPreview({ removed, added: [], next, keep: true, reason: null });
      return;
    }
    const saved = current.saved
      .map((item) => {
        const place = placeById(item.placeId);
        return place ? { ...place, priority: item.priority, cost: 0 } : null;
      })
      .filter((place): place is NonNullable<typeof place> => Boolean(place));
    const anchorPlace = lastPlace ?? { lat: current.trip.centerLat, lng: current.trip.centerLng };
    const rainAfterMin = forecast?.rainAfter ? toMinutes(forecast.rainAfter) : null;
    const blocked = current.bookings
      .filter((booking) => booking.startAt.slice(0, 10) === selected.date)
      .map((booking) => ({ start: toMinutes(booking.startAt.slice(11, 16) || "12:00"), end: toMinutes(booking.startAt.slice(11, 16) || "12:00") + 90, title: booking.title }));
    const pool = intent.categories.length ? saved.filter((place) => intent.categories.includes(place.category)) : saved;
    const planned = planWithConstraints({
      places: pool,
      anchor: anchorPlace,
      maxWalkKm: intent.maxKm,
      rainAfterMin,
      blocked,
      budget: Math.max(0, current.trip.budgetAmount - current.expenses.reduce((sum, expense) => sum + expense.amount, 0)),
    });
    const chosen = planned.ordered;
    if (!chosen.length) {
      setPreview({ removed: [], added: [], next: current.activities, keep: true, reason: planned.notes.at(-1) ?? "Nothing saved fits that plan." });
      return;
    }
    const drafted: Activity[] = chosen.map((place, index) => ({
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
    const { next, removed } = replaceDayActivities(current.activities, selected.id, created);
    setPreview({ removed, added: created.map((item) => item.title), next, keep: true, reason: planned.notes[0] ?? null });
  }

  async function confirmPlan() {
    if (!preview || !selected || !user) return;
    setUndoActivities(current.activities);
    await actions.commit(preview.next, `${user.name} planned ${dayLabel(current.days, selected.id)}.`);
    if (preview.keep) {
      for (const activity of preview.removed) if (activity.placeId) await actions.savePlace(activity.placeId);
    }
    setPreview(null);
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
        <button type="button" data-testid="plan-my-day" className="ml-auto text-sm text-accent" onClick={() => setPlanOpen(true)}>Plan my day</button>
        {canEdit && <button type="button" className="text-sm text-muted" onClick={() => actions.undo()}>Undo</button>}
        {canEdit && <button type="button" className="text-sm text-muted" onClick={() => actions.redo()}>Redo</button>}
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
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragMove={ghost} onDragOver={(event) => setOverId(event.over ? String(event.over.id) : null)} onDragCancel={() => { setActiveId(null); setDragging(null); presence.publish({ drag: null }); }} onDragEnd={onDragEnd}>
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
            {bundle.bookings.filter((booking) => booking.startAt.slice(0, 10) === selected.date).map((booking) => (
              <p key={booking.id} className="mb-2 rounded-2xl border border-dashed border-border px-3 py-2 text-sm">{booking.startAt.slice(11, 16)} · {booking.title}</p>
            ))}
            <SortableContext items={dayActs.map((activity) => activity.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                <NowLine timezone={bundle.trip.timezone} date={selected.date} />
                {dayActs.map((activity) => (
                  <div key={activity.id}>
                    {legs[activity.id] && <p className="mb-1 ml-[88px] text-xs text-muted">{legs[activity.id]}</p>}
                    <SortableCard activity={activity} rainy={Boolean(forecast && forecast.rain >= 50 && placeById(activity.placeId) && !placeById(activity.placeId)!.indoor)} canEdit={canEdit} currency={bundle.trip.currency} timezone={bundle.trip.timezone} date={selected.date} onEdit={() => setEditor(activity)} />
                  </div>
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
        <Button className="mt-4" data-testid="build-day" onClick={applyPlan}>Build the day</Button>
        {preview && (
          <div data-testid="plan-preview" className="mt-4 space-y-2 text-sm">
            <p className="font-medium">Here&apos;s your new plan</p>
            {preview.reason && <p className="text-muted">{preview.reason}</p>}
            {!!preview.removed.length && <div>Removed: {preview.removed.map((item) => item.title).join(", ")}</div>}
            {!!preview.added.length && <div>Added: {preview.added.join(", ")}</div>}
            <label className="flex items-center gap-2">
              <input data-testid="keep-removed" type="checkbox" checked={preview.keep} onChange={(event) => setPreview({ ...preview, keep: event.target.checked })} />
              Keep removed places in Ideas
            </label>
            <div className="flex gap-2">
              {(preview.added.length > 0 || preview.removed.length > 0) && <Button size="sm" onClick={confirmPlan}>Apply</Button>}
              <Button size="sm" variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
            </div>
          </div>
        )}
        {undoActivities && <button type="button" className="mt-3 text-sm text-accent" onClick={() => { actions.commit(undoActivities, `${user?.name ?? "You"} undid the new plan.`); setUndoActivities(null); }}>Undo plan</button>}
      </Modal>
      {view === "history" && (
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <h2 className="font-serif text-3xl font-semibold">Version history</h2>
          <div className="mt-4 space-y-3">
            {bundle.snapshots.map((snap) => (
              <article key={snap.id} className="rounded-2xl border border-border p-3">
                <p>{snap.label}</p>
                <p className="text-xs text-muted">{snap.createdAt}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => toast(snap.activities.map((item) => item.title).slice(0, 6).join(" · ") || "Empty day")}>Preview</Button>
                  {canEdit && <Button size="sm" onClick={() => actions.restoreSnapshot(snap.id)}>Restore</Button>}
                </div>
              </article>
            ))}
            {!bundle.snapshots.length && <p className="text-sm text-muted">Moves, plans, and route optimizations show up here.</p>}
          </div>
        </div>
      )}
      {editor && <ActivityEditor activity={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}

function NowLine({ timezone, date }: { timezone: string; date: string }) {
  if (minutesInZone(timezone) < 0) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (today !== date) return null;
  return <p className="text-xs text-accent">Now · {fromMinutes(minutesInZone(timezone))}</p>;
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

function SortableCard({ activity, rainy, canEdit, currency, timezone, date, onEdit }: { activity: Activity; rainy: boolean; canEdit: boolean; currency: string; timezone: string; date: string; onEdit: () => void }) {
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
      <CardBody activity={activity} currency={currency} rainy={rainy} timezone={timezone} date={date} onEdit={onEdit} />
    </article>
  );
}

function CardBody({ activity, currency, rainy, overlay, timezone, date, onEdit }: { activity: Activity; currency: string; rainy?: boolean; overlay?: boolean; timezone?: string; date?: string; onEdit?: () => void }) {
  const { bundle, canEdit, actions } = useTrip();
  const place = placeById(activity.placeId);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const comments = bundle?.comments.filter((comment) => comment.activityId === activity.id) ?? [];
  const cost = activity.actualCost ?? activity.plannedCost;
  const now = timezone && date ? minutesInZone(timezone) : null;
  const today = timezone ? new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) : "";
  const late = Boolean(now != null && date === today && activity.status === "planned" && toMinutes(activity.startTime) + 15 < now);
  const tone = activity.status === "done" ? "border-secondary" : activity.status === "skipped" ? "opacity-60" : late ? "border-accent" : "";
  return (
    <motion.div layout className={`rounded-[16px] border border-border bg-card p-3 ${tone} ${overlay ? "shadow-[var(--shadow)]" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{activity.title}</p>
          {place && <p className="text-sm text-muted">{categoryMeta(place.category).emoji} {place.name}</p>}
          <p className="mt-1 font-mono text-xs text-muted tabular">
            {formatDuration(activity.duration)}
            {cost > 0 && ` · ${formatMoney(cost, currency)}`}
          </p>
        </div>
        <div className="flex gap-2">
          {onEdit && <button type="button" data-testid={`activity-edit-${activity.id}`} className="text-sm text-muted" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onEdit(); }}>Edit</button>}
          <button type="button" className="text-sm text-muted" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}>
            💬 {comments.length}
          </button>
        </div>
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
