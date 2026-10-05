"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/features/auth/session";
import { getRepository, repositoryMode } from "@/lib/api";
import type { ActivityInput, BookingInput, ExpenseInput, TripInput } from "@/lib/api/repository";
import { moveActivity } from "@/lib/itinerary";
import { browserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { loadWeather } from "@/lib/weather";
import { cacheBundle, enqueueOp, readCachedBundle, readQueue, removeOp } from "@/lib/offline-store";
import { hasConflict } from "@/lib/sync";
import { nid } from "@/lib/utils";
import type { Activity, PlacePriority, PlaceVoteValue, Role, TripBundle } from "@/types";

type TripActions = {
  move: (activeId: string, overId: string) => Promise<void>;
  createActivity: (input: ActivityInput) => Promise<void>;
  updateActivity: (activityId: string, patch: Partial<Activity>) => Promise<void>;
  deleteActivity: (activityId: string) => Promise<void>;
  commit: (activities: Activity[], eventBody?: string) => Promise<void>;
  savePlace: (placeId: string) => Promise<void>;
  unsavePlace: (placeId: string) => Promise<void>;
  createBooking: (input: BookingInput) => Promise<void>;
  deleteBooking: (bookingId: string) => Promise<void>;
  createExpense: (input: ExpenseInput) => Promise<void>;
  deleteExpense: (expenseId: string) => Promise<void>;
  comment: (activityId: string, body: string) => Promise<void>;
  setRole: (userId: string, role: Role) => Promise<void>;
  updateTrip: (patch: Parameters<ReturnType<typeof getRepository>["updateTrip"]>[1]) => Promise<void>;
  deleteTrip: () => Promise<void>;
  createInvite: (role: Exclude<Role, "owner">) => Promise<string>;
  moveSavedPlaceToDay: (placeId: string, dayId: string) => Promise<void>;
  moveActivityToIdeas: (activityId: string) => Promise<void>;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
  votePlace: (placeId: string, vote: PlaceVoteValue) => Promise<void>;
  setPlacePriority: (placeId: string, priority: PlacePriority) => Promise<void>;
  addParticipant: (name: string) => Promise<void>;
  removeParticipant: (participantId: string) => Promise<void>;
  setFxRate: (currency: string, rate: number) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

type TripContextValue = {
  tripId: string;
  bundle: TripBundle | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  canEdit: boolean;
  role: Role | null;
  actions: TripActions;
  weather: ReturnType<typeof useQuery<Awaited<ReturnType<typeof loadWeather>>>>;
  pendingSync: number;
  conflict: boolean;
  keepDeviceCopy: () => void;
  takeServerCopy: () => Promise<void>;
};

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ tripId, children }: { tripId: string; children: React.ReactNode }) {
  const { user, ready } = useSession();
  const qc = useQueryClient();
  const key = ["bundle", tripId] as const;
  const [pendingSync, setPendingSync] = useState(0);
  const [conflict, setConflict] = useState(false);
  const history = useRef<{ past: Activity[][]; future: Activity[][] }>({ past: [], future: [] });
  const query = useQuery({
    queryKey: key,
    enabled: ready,
    queryFn: async () => {
      try {
        const bundle = await getRepository().getBundle(tripId);
        if (bundle) await cacheBundle(bundle);
        return bundle;
      } catch (error) {
        const cached = await readCachedBundle(tripId);
        if (cached) return cached;
        throw error;
      }
    },
  });

  const weather = useQuery({
    queryKey: ["weather", tripId, query.data?.trip.startDate, query.data?.trip.endDate],
    enabled: Boolean(query.data),
    staleTime: 1000 * 60 * 30,
    queryFn: () => {
      const trip = query.data!.trip;
      const dates = query.data!.days.map((day) => day.date);
      return loadWeather({
        destinationId: trip.destinationId,
        lat: trip.centerLat,
        lng: trip.centerLng,
        timezone: trip.timezone,
        dates,
      });
    },
  });

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === "tripcanvas.db.v1") qc.invalidateQueries({ queryKey: key });
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [qc, tripId]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = browserSupabase();
    const channel = supabase.channel(`trip:${tripId}`);
    for (const table of ["activities", "comments", "expenses", "days", "bookings", "saved_places", "activity_events"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `trip_id=eq.${tripId}` }, () => {
        qc.invalidateQueries({ queryKey: key });
      });
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, tripId]);

  const seen = useRef(new Set<string>());
  const primed = useRef(false);
  useEffect(() => {
    const events = query.data?.events;
    if (!events) return;
    if (!primed.current) {
      events.forEach((event) => seen.current.add(event.id));
      primed.current = true;
      return;
    }
    const latest = events[0];
    if (latest && !seen.current.has(latest.id)) {
      seen.current.add(latest.id);
      if (latest.userId !== user?.id) toast(latest.body);
    }
  }, [query.data?.events, user?.id]);

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  useEffect(() => {
    let stop = false;
    async function refreshQueue() {
      const queued = await readQueue();
      if (!stop) setPendingSync(queued.filter((item) => item.tripId === tripId).length);
    }
    refreshQueue();
    async function flush() {
      const queued = (await readQueue()).filter((item) => item.tripId === tripId);
      if (!queued.length) return;
      const server = await getRepository().getBundle(tripId);
      if (server && queued.some((item) => hasConflict(item.baseRevision, server.trip.revision))) {
        setConflict(true);
        return;
      }
      for (const op of queued) {
        const repo = getRepository() as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
        if (typeof repo[op.method] === "function") await repo[op.method](...op.args);
        await removeOp(op.id);
      }
      setConflict(false);
      await invalidate();
      await refreshQueue();
    }
    window.addEventListener("online", () => { flush().catch(() => undefined); });
    window.addEventListener("tripcanvas-db", () => { refreshQueue().catch(() => undefined); });
    return () => { stop = true; };
  }, [tripId]);

  const move = useMutation({
    mutationFn: (vars: { activeId: string; overId: string }) => getRepository().moveActivity(tripId, vars.activeId, vars.overId),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TripBundle | null>(key);
      if (prev) {
        history.current.past.push(prev.activities);
        history.current.future = [];
        qc.setQueryData(key, { ...prev, activities: moveActivity(prev.activities, vars.activeId, vars.overId) });
      }
      return { prev };
    },
    onError: (_error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error("Couldn't move activity.");
    },
    onSettled: invalidate,
  });

  const commit = useMutation({
    mutationFn: (vars: { activities: Activity[]; eventBody?: string }) => getRepository().commitActivities(tripId, vars.activities, vars.eventBody),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TripBundle | null>(key);
      if (prev) qc.setQueryData(key, { ...prev, activities: vars.activities });
      return { prev };
    },
    onError: (_error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error("Couldn't update the itinerary.");
    },
    onSettled: invalidate,
  });

  async function run(task: () => Promise<unknown>, failure: string, op?: { method: string; args: unknown[] }) {
    try {
      const offline = typeof navigator !== "undefined" && !navigator.onLine && repositoryMode() === "supabase";
      if (offline && op) {
        const bundle = qc.getQueryData<TripBundle | null>(key);
        await enqueueOp({
          id: nid("op"),
          tripId,
          baseRevision: bundle?.trip.revision ?? 0,
          label: failure,
          method: op.method,
          args: op.args,
        });
        setPendingSync((count) => count + 1);
        toast("Saved on this device. It will sync when you're back online.");
        return;
      }
      await task();
      await invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure);
      throw error;
    }
  }

  const role = query.data?.members.find((member) => member.userId === user?.id)?.role ?? null;
  const canEdit = role === "owner" || role === "editor";

  const actions = useMemo<TripActions>(
    () => ({
      move: (activeId, overId) => move.mutateAsync({ activeId, overId }),
      commit: (activities, eventBody) => commit.mutateAsync({ activities, eventBody }),
      createActivity: (input) => run(() => getRepository().createActivity(tripId, input), "Couldn't add that place.", { method: "createActivity", args: [tripId, input] }),
      updateActivity: (activityId, patch) => run(() => getRepository().updateActivity(tripId, activityId, patch), "Couldn't update the activity.", { method: "updateActivity", args: [tripId, activityId, patch] }),
      deleteActivity: (activityId) => run(() => getRepository().deleteActivity(tripId, activityId), "Couldn't remove the activity.", { method: "deleteActivity", args: [tripId, activityId] }),
      savePlace: (placeId) => run(() => getRepository().savePlace(tripId, placeId), "Couldn't save that place."),
      unsavePlace: (placeId) => run(() => getRepository().unsavePlace(tripId, placeId), "Couldn't remove the saved place."),
      createBooking: (input) => run(() => getRepository().createBooking(tripId, input), "Couldn't save the booking."),
      deleteBooking: (bookingId) => run(() => getRepository().deleteBooking(tripId, bookingId), "Couldn't delete the booking."),
      createExpense: (input) => run(() => getRepository().createExpense(tripId, input), "Couldn't add the expense."),
      deleteExpense: (expenseId) => run(() => getRepository().deleteExpense(tripId, expenseId), "Couldn't delete the expense."),
      comment: (activityId, body) => run(() => getRepository().addComment(tripId, activityId, body), "Couldn't post the comment."),
      setRole: (userId, next) => run(() => getRepository().setMemberRole(tripId, userId, next), "Couldn't change that role."),
      updateTrip: (patch) => run(() => getRepository().updateTrip(tripId, patch), "Couldn't update the trip."),
      deleteTrip: () => run(() => getRepository().deleteTrip(tripId), "Couldn't delete the trip."),
      createInvite: async (role) => {
        const invite = await getRepository().createInvite(tripId, role);
        return invite.token;
      },
      moveSavedPlaceToDay: (placeId, dayId) => run(() => getRepository().moveSavedPlaceToDay(tripId, placeId, dayId), "Couldn't move that place onto the day.", { method: "moveSavedPlaceToDay", args: [tripId, placeId, dayId] }),
      moveActivityToIdeas: (activityId) => run(() => getRepository().moveActivityToIdeas(tripId, activityId), "Couldn't move that activity to Ideas.", { method: "moveActivityToIdeas", args: [tripId, activityId] }),
      restoreSnapshot: (snapshotId) => run(() => getRepository().restoreSnapshot(tripId, snapshotId), "Couldn't restore that version."),
      votePlace: (placeId, vote) => run(() => getRepository().votePlace(tripId, placeId, vote), "Couldn't save that vote."),
      setPlacePriority: (placeId, priority) => run(() => getRepository().setPlacePriority(tripId, placeId, priority), "Couldn't set that priority."),
      addParticipant: (name) => run(() => getRepository().addParticipant(tripId, name), "Couldn't add that person."),
      removeParticipant: (participantId) => run(() => getRepository().removeParticipant(tripId, participantId), "Couldn't remove that person."),
      setFxRate: (currency, rate) => run(() => getRepository().setFxRate(tripId, currency, rate), "Couldn't save that rate."),
      undo: async () => {
        const prev = history.current.past.pop();
        const current = qc.getQueryData<TripBundle | null>(key);
        if (!prev || !current) return;
        history.current.future.push(current.activities);
        await commit.mutateAsync({ activities: prev, eventBody: "Undid the last change." });
      },
      redo: async () => {
        const next = history.current.future.pop();
        const current = qc.getQueryData<TripBundle | null>(key);
        if (!next || !current) return;
        history.current.past.push(current.activities);
        await commit.mutateAsync({ activities: next, eventBody: "Redid the change." });
      },
    }),
    [commit, move, tripId],
  );

  const value: TripContextValue = {
    tripId,
    bundle: query.data ?? null,
    isLoading: !ready || query.isLoading,
    isError: query.isError,
    refetch: () => query.refetch(),
    canEdit,
    role,
      actions,
      weather,
      pendingSync,
      conflict,
      keepDeviceCopy: () => setConflict(false),
      takeServerCopy: async () => {
        const queued = await readQueue();
        await Promise.all(queued.filter((item) => item.tripId === tripId).map((item) => removeOp(item.id)));
        setConflict(false);
        setPendingSync(0);
        await invalidate();
      },
    };

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const value = useContext(TripContext);
  if (!value) throw new Error("Trip missing");
  return value;
}

export type { TripInput };
