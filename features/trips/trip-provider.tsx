"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useSession } from "@/features/auth/session";
import { getRepository } from "@/lib/api";
import type { ActivityInput, BookingInput, ExpenseInput, TripInput } from "@/lib/api/repository";
import { moveActivity } from "@/lib/itinerary";
import { browserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { loadWeather } from "@/lib/weather";
import type { Activity, Role, TripBundle } from "@/types";

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
};

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ tripId, children }: { tripId: string; children: React.ReactNode }) {
  const { user, ready } = useSession();
  const qc = useQueryClient();
  const key = ["bundle", tripId] as const;
  const query = useQuery({
    queryKey: key,
    enabled: ready,
    queryFn: () => getRepository().getBundle(tripId),
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

  const move = useMutation({
    mutationFn: (vars: { activeId: string; overId: string }) => getRepository().moveActivity(tripId, vars.activeId, vars.overId),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TripBundle | null>(key);
      if (prev) qc.setQueryData(key, { ...prev, activities: moveActivity(prev.activities, vars.activeId, vars.overId) });
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

  async function run(task: () => Promise<unknown>, failure: string) {
    try {
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
      createActivity: (input) => run(() => getRepository().createActivity(tripId, input), "Couldn't add that place."),
      updateActivity: (activityId, patch) => run(() => getRepository().updateActivity(tripId, activityId, patch), "Couldn't update the activity."),
      deleteActivity: (activityId) => run(() => getRepository().deleteActivity(tripId, activityId), "Couldn't remove the activity."),
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
  };

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const value = useContext(TripContext);
  if (!value) throw new Error("Trip missing");
  return value;
}

export type { TripInput };
