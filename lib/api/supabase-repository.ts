import { places, placesFor, destinationById, placeById } from "@/lib/catalog";
import { eachDate } from "@/lib/dates";
import { buildDays, dayLabel, moveActivity } from "@/lib/itinerary";
import { RepoError, type ActivityInput, type BookingInput, type ExpenseInput, type Repository, type TripInput } from "@/lib/api/repository";
import { buildTokyoSample } from "@/lib/sample-trip";
import { browserSupabase } from "@/lib/supabase/client";
import { nid, slugify } from "@/lib/utils";
import type { Activity, Booking, Comment, Day, Expense, ExpenseShare, Role, SavedPlace, Trip, TripBundle, TripMember, User } from "@/types";

type Row = Record<string, unknown>;

function asString(value: unknown) {
  return String(value ?? "");
}

function userFrom(row: Row): User {
  return { id: asString(row.id), name: asString(row.name || "Traveler"), email: asString(row.email), avatar: asString(row.avatar || asString(row.name || "T")[0]).slice(0, 2).toUpperCase() };
}

function tripFrom(row: Row): Trip {
  return {
    id: asString(row.id),
    ownerId: asString(row.owner_id),
    title: asString(row.title),
    destination: asString(row.destination),
    destinationId: asString(row.destination_id),
    startDate: asString(row.start_date).slice(0, 10),
    endDate: asString(row.end_date).slice(0, 10),
    coverImage: asString(row.cover_image),
    currency: asString(row.currency || "USD"),
    timezone: asString(row.timezone),
    slug: asString(row.slug),
    isPublic: Boolean(row.is_public),
    budgetAmount: Number(row.budget_amount ?? 0),
    travelerCount: Number(row.traveler_count ?? 1),
    centerLat: Number(row.center_lat),
    centerLng: Number(row.center_lng),
  };
}

function activityFrom(row: Row): Activity {
  return {
    id: asString(row.id),
    tripId: asString(row.trip_id),
    dayId: asString(row.day_id),
    placeId: row.place_id ? asString(row.place_id) : null,
    title: asString(row.title),
    startTime: asString(row.start_time).slice(0, 5),
    duration: Number(row.duration ?? 60),
    position: Number(row.position ?? 0),
    note: asString(row.note),
    plannedCost: Number(row.planned_cost ?? 0),
    actualCost: row.actual_cost == null ? null : Number(row.actual_cost),
    status: (asString(row.status || "planned") as Activity["status"]) || "planned",
  };
}

function activityTo(activity: Activity) {
  return {
    id: activity.id,
    trip_id: activity.tripId,
    day_id: activity.dayId,
    place_id: activity.placeId,
    title: activity.title,
    start_time: activity.startTime,
    duration: activity.duration,
    position: activity.position,
    note: activity.note,
    planned_cost: activity.plannedCost,
    actual_cost: activity.actualCost,
    status: activity.status,
  };
}

let catalogReady = false;

export function createSupabaseRepository(): Repository {
  const supabase = browserSupabase();

  async function requireUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new RepoError("You need to sign in.");
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
    if (profile) return userFrom(profile as Row);
    const name = asString(data.user.user_metadata?.name || data.user.email?.split("@")[0] || "Traveler");
    return { id: data.user.id, name, email: data.user.email ?? "", avatar: name[0]?.toUpperCase() ?? "T" };
  }

  async function roleOf(tripId: string, userId: string): Promise<Role | null> {
    const { data } = await supabase.from("trip_members").select("role").eq("trip_id", tripId).eq("user_id", userId).maybeSingle();
    return (data?.role as Role | undefined) ?? null;
  }

  async function assertEdit(tripId: string) {
    const user = await requireUser();
    const role = await roleOf(tripId, user.id);
    if (role !== "owner" && role !== "editor") throw new RepoError("You can't edit this trip.");
    return user;
  }

  async function assertOwner(tripId: string) {
    const user = await requireUser();
    if ((await roleOf(tripId, user.id)) !== "owner") throw new RepoError("Only the owner can do that.");
    return user;
  }

  async function ensureCatalog() {
    if (catalogReady) return;
    const rows = places.map((place) => ({
      id: place.id,
      destination_id: place.destinationId,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      address: place.address,
      category: place.category,
      image: place.image,
      rating: place.rating,
      duration_min: place.durationMin,
      indoor: place.indoor,
      about: place.about,
      open_hour: place.openHour,
      close_hour: place.closeHour,
    }));
    const { error } = await supabase.from("places").upsert(rows);
    if (!error) catalogReady = true;
  }

  async function uniqueSlug(base: string) {
    let slug = base || "trip";
    let n = 2;
    while (true) {
      const { data } = await supabase.from("trips").select("id").eq("slug", slug).maybeSingle();
      if (!data) return slug;
      slug = `${base}-${n}`;
      n += 1;
    }
  }

  async function pushEvent(tripId: string, user: User, body: string) {
    await supabase.from("activity_events").insert({ id: nid("evt"), trip_id: tripId, user_id: user.id, body, created_at: new Date().toISOString() });
  }

  async function assemble(trip: Trip): Promise<TripBundle> {
    const [members, days, activities, saved, bookings, expenses, shares, comments, events] = await Promise.all([
      supabase.from("trip_members").select("*").eq("trip_id", trip.id),
      supabase.from("days").select("*").eq("trip_id", trip.id).order("date"),
      supabase.from("activities").select("*").eq("trip_id", trip.id),
      supabase.from("saved_places").select("*").eq("trip_id", trip.id),
      supabase.from("bookings").select("*").eq("trip_id", trip.id),
      supabase.from("expenses").select("*").eq("trip_id", trip.id),
      supabase.from("expense_shares").select("*").eq("trip_id", trip.id),
      supabase.from("comments").select("*").eq("trip_id", trip.id),
      supabase.from("activity_events").select("*").eq("trip_id", trip.id).order("created_at", { ascending: false }),
    ]);
    const memberRows = (members.data ?? []) as Row[];
    const ids = memberRows.map((row) => asString(row.user_id));
    const { data: profiles } = ids.length ? await supabase.from("profiles").select("*").in("id", ids) : { data: [] };
    const profileMap = new Map(((profiles ?? []) as Row[]).map((row) => [asString(row.id), userFrom(row)]));

    const bookingRows = await Promise.all(
      ((bookings.data ?? []) as Row[]).map(async (row) => {
        let attachmentUrl = row.attachment_url ? asString(row.attachment_url) : null;
        if (attachmentUrl?.startsWith("storage:")) {
          const { data } = await supabase.storage.from("booking-files").createSignedUrl(attachmentUrl.slice(8), 60 * 60);
          attachmentUrl = data?.signedUrl ?? null;
        }
        const booking: Booking = {
          id: asString(row.id),
          tripId: trip.id,
          type: asString(row.type) as Booking["type"],
          title: asString(row.title),
          reference: asString(row.reference),
          startAt: asString(row.start_at),
          attachmentUrl,
          attachmentName: row.attachment_name ? asString(row.attachment_name) : null,
          notes: asString(row.notes),
        };
        return booking;
      }),
    );

    return {
      trip,
      members: memberRows.map((row) => {
        const userId = asString(row.user_id);
        return {
          tripId: trip.id,
          userId,
          role: asString(row.role) as Role,
          user: profileMap.get(userId) ?? { id: userId, name: "Traveler", email: "", avatar: "?" },
        };
      }),
      days: ((days.data ?? []) as Row[]).map((row) => ({ id: asString(row.id), tripId: trip.id, date: asString(row.date).slice(0, 10), note: asString(row.note) })),
      activities: ((activities.data ?? []) as Row[]).map(activityFrom),
      saved: ((saved.data ?? []) as Row[]).map((row) => ({ id: asString(row.id), tripId: trip.id, placeId: asString(row.place_id), note: asString(row.note) })),
      bookings: bookingRows,
      expenses: ((expenses.data ?? []) as Row[]).map((row) => ({
        id: asString(row.id),
        tripId: trip.id,
        title: asString(row.title),
        amount: Number(row.amount),
        plannedAmount: Number(row.planned_amount ?? row.amount),
        category: asString(row.category) as Expense["category"],
        paidBy: asString(row.paid_by),
        activityId: row.activity_id ? asString(row.activity_id) : null,
      })),
      shares: ((shares.data ?? []) as Row[]).map((row) => ({
        id: asString(row.id),
        expenseId: asString(row.expense_id),
        tripId: trip.id,
        userId: asString(row.user_id),
        amount: Number(row.amount),
      })),
      comments: ((comments.data ?? []) as Row[]).map((row) => ({
        id: asString(row.id),
        activityId: asString(row.activity_id),
        tripId: trip.id,
        userId: asString(row.user_id),
        body: asString(row.body),
        createdAt: asString(row.created_at),
      })),
      events: ((events.data ?? []) as Row[]).map((row) => ({
        id: asString(row.id),
        tripId: trip.id,
        userId: asString(row.user_id),
        body: asString(row.body),
        createdAt: asString(row.created_at),
      })),
      places: placesFor(trip.destinationId),
    };
  }

  async function uploadAttachment(tripId: string, dataUrl: string, name: string) {
    const blob = dataUrlToBlob(dataUrl);
    const path = `${tripId}/${nid("file")}-${name.replace(/[^\w.]+/g, "_")}`;
    const { error } = await supabase.storage.from("booking-files").upload(path, blob, { upsert: false, contentType: blob.type });
    if (error) throw new RepoError(error.message);
    return `storage:${path}`;
  }

  const api: Repository = {
    mode: "supabase",
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new RepoError(error.message);
      return requireUser();
    },
    async signUp(name, email, password) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim() } },
      });
      if (error) throw new RepoError(error.message);
      if (!data.session) throw new RepoError("Check your email to confirm the account, then sign in.");
      return requireUser();
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    async currentUser() {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) return null;
      try {
        return await requireUser();
      } catch {
        return null;
      }
    },
    async listTrips() {
      const user = await requireUser();
      const { data: memberships, error } = await supabase.from("trip_members").select("trip_id").eq("user_id", user.id);
      if (error) throw new RepoError(error.message);
      const ids = (memberships ?? []).map((row) => row.trip_id as string);
      if (!ids.length) return [];
      const { data, error: tripError } = await supabase.from("trips").select("*").in("id", ids).order("start_date", { ascending: false });
      if (tripError) throw new RepoError(tripError.message);
      return ((data ?? []) as Row[]).map(tripFrom);
    },
    async getBundle(tripId) {
      const { data, error } = await supabase.from("trips").select("*").eq("id", tripId).maybeSingle();
      if (error) throw new RepoError(error.message);
      if (!data) return null;
      return assemble(tripFrom(data as Row));
    },
    async getPublicBundle(slug) {
      const { data } = await supabase.from("trips").select("*").eq("slug", slug).eq("is_public", true).maybeSingle();
      if (!data) return null;
      return assemble(tripFrom(data as Row));
    },
    async getBySlug(slug) {
      const { data } = await supabase.from("trips").select("*").eq("slug", slug).maybeSingle();
      return data ? tripFrom(data as Row) : null;
    },
    async createTrip(input: TripInput) {
      const user = await requireUser();
      await ensureCatalog();
      const destination = destinationById(input.destinationId);
      if (!destination) throw new RepoError("Pick a destination we know.");
      if (input.endDate < input.startDate) throw new RepoError("The end date is before the start.");
      const trip: Trip = {
        id: nid("trip"),
        ownerId: user.id,
        title: input.title.trim() || destination.name,
        destination: destination.name,
        destinationId: destination.id,
        startDate: input.startDate,
        endDate: input.endDate,
        coverImage: `https://picsum.photos/seed/${destination.id}-cover/1400/900`,
        currency: input.currency || "USD",
        timezone: destination.timezone,
        slug: await uniqueSlug(`${slugify(destination.name)}-${input.startDate.slice(0, 4)}`),
        isPublic: false,
        budgetAmount: input.budgetAmount ?? 1500,
        travelerCount: input.travelerCount,
        centerLat: destination.lat,
        centerLng: destination.lng,
      };
      const { error } = await supabase.from("trips").insert({
        id: trip.id,
        owner_id: trip.ownerId,
        title: trip.title,
        destination: trip.destination,
        destination_id: trip.destinationId,
        start_date: trip.startDate,
        end_date: trip.endDate,
        cover_image: trip.coverImage,
        currency: trip.currency,
        timezone: trip.timezone,
        slug: trip.slug,
        is_public: trip.isPublic,
        budget_amount: trip.budgetAmount,
        traveler_count: trip.travelerCount,
        center_lat: trip.centerLat,
        center_lng: trip.centerLng,
      });
      if (error) throw new RepoError(error.message);
      const member: TripMember = { tripId: trip.id, userId: user.id, role: "owner" };
      const { error: memberError } = await supabase.from("trip_members").insert({ trip_id: member.tripId, user_id: member.userId, role: member.role });
      if (memberError) throw new RepoError(memberError.message);
      const days = buildDays(trip.id, eachDate(trip.startDate, trip.endDate));
      const { error: dayError } = await supabase.from("days").insert(days.map((day) => ({ id: day.id, trip_id: day.tripId, date: day.date, note: day.note })));
      if (dayError) throw new RepoError(dayError.message);
      return trip;
    },
    async updateTrip(tripId, patch) {
      const touchesSettings = patch.isPublic != null || patch.startDate != null || patch.endDate != null;
      if (touchesSettings) await assertOwner(tripId);
      else await assertEdit(tripId);
      const current = await api.getBundle(tripId);
      if (!current) throw new RepoError("Trip not found.");
      if (patch.startDate || patch.endDate) {
        const start = patch.startDate ?? current.trip.startDate;
        const end = patch.endDate ?? current.trip.endDate;
        if (end < start) throw new RepoError("The end date is before the start.");
        const dates = eachDate(start, end);
        const removed = current.days.filter((day) => !dates.includes(day.date));
        if (removed.some((day) => current.activities.some((activity) => activity.dayId === day.id))) {
          throw new RepoError("Move activities off a day before you drop it.");
        }
        if (removed.length) await supabase.from("days").delete().in("id", removed.map((day) => day.id));
        const have = new Set(current.days.map((day) => day.date));
        const added = buildDays(tripId, dates.filter((date) => !have.has(date)));
        if (added.length) await supabase.from("days").insert(added.map((day) => ({ id: day.id, trip_id: tripId, date: day.date, note: "" })));
      }
      const { error } = await supabase.from("trips").update({
        title: patch.title,
        budget_amount: patch.budgetAmount,
        currency: patch.currency,
        traveler_count: patch.travelerCount,
        is_public: patch.isPublic,
        start_date: patch.startDate,
        end_date: patch.endDate,
        cover_image: patch.coverImage,
      }).eq("id", tripId);
      if (error) throw new RepoError(error.message);
      const { data } = await supabase.from("trips").select("*").eq("id", tripId).single();
      return tripFrom(data as Row);
    },
    async deleteTrip(tripId) {
      await assertOwner(tripId);
      const { error } = await supabase.from("trips").delete().eq("id", tripId);
      if (error) throw new RepoError(error.message);
    },
    async loadTokyoSample() {
      const user = await requireUser();
      await ensureCatalog();
      const sample = buildTokyoSample(user, { stable: false, withCollaborators: false });
      sample.trip.slug = await uniqueSlug(sample.trip.slug);
      const { error } = await supabase.from("trips").insert({
        id: sample.trip.id,
        owner_id: user.id,
        title: sample.trip.title,
        destination: sample.trip.destination,
        destination_id: sample.trip.destinationId,
        start_date: sample.trip.startDate,
        end_date: sample.trip.endDate,
        cover_image: sample.trip.coverImage,
        currency: sample.trip.currency,
        timezone: sample.trip.timezone,
        slug: sample.trip.slug,
        is_public: true,
        budget_amount: sample.trip.budgetAmount,
        traveler_count: sample.trip.travelerCount,
        center_lat: sample.trip.centerLat,
        center_lng: sample.trip.centerLng,
      });
      if (error) throw new RepoError(error.message);
      await supabase.from("trip_members").insert({ trip_id: sample.trip.id, user_id: user.id, role: "owner" });
      await supabase.from("days").insert(sample.days.map((day) => ({ id: day.id, trip_id: sample.trip.id, date: day.date, note: day.note })));
      await supabase.from("activities").insert(sample.activities.map(activityTo));
      await supabase.from("saved_places").insert(sample.saved.map((item) => ({ id: item.id, trip_id: sample.trip.id, place_id: item.placeId, note: item.note })));
      await supabase.from("bookings").insert(sample.bookings.map((item) => ({
        id: item.id, trip_id: sample.trip.id, type: item.type, title: item.title, reference: item.reference, start_at: item.startAt, notes: item.notes, attachment_url: null, attachment_name: null,
      })));
      if (sample.expenses.length) {
        await supabase.from("expenses").insert(sample.expenses.map((item) => ({
          id: item.id, trip_id: sample.trip.id, title: item.title, amount: item.amount, planned_amount: item.plannedAmount, category: item.category, paid_by: item.paidBy, activity_id: item.activityId,
        })));
      }
      return sample.trip;
    },
    async joinTrip(slug) {
      const user = await requireUser();
      const trip = await api.getBySlug(slug);
      if (!trip) throw new RepoError("That invite link doesn't match a trip.");
      const role = await roleOf(trip.id, user.id);
      if (!role) {
        const { error } = await supabase.from("trip_members").insert({ trip_id: trip.id, user_id: user.id, role: "viewer" });
        if (error) throw new RepoError(error.message);
        await pushEvent(trip.id, user, `${user.name} joined the trip.`);
      }
      return trip;
    },
    async duplicateTrip(slug) {
      const user = await requireUser();
      const source = await api.getPublicBundle(slug);
      const owned = source ? null : await api.getBySlug(slug);
      const bundle = source ?? (owned ? await api.getBundle(owned.id) : null);
      if (!bundle) throw new RepoError("That public trip isn't available.");
      const copy = await api.createTrip({
        title: `${bundle.trip.title} copy`,
        destinationId: bundle.trip.destinationId,
        startDate: bundle.trip.startDate,
        endDate: bundle.trip.endDate,
        travelerCount: bundle.trip.travelerCount,
        budgetAmount: bundle.trip.budgetAmount,
        currency: bundle.trip.currency,
      });
      const created = await api.getBundle(copy.id);
      if (!created) return copy;
      const dayMap = new Map(bundle.days.map((day, index) => [day.id, created.days[index]?.id]));
      const activities = bundle.activities.map((activity) => ({
        ...activity,
        id: nid("act"),
        tripId: copy.id,
        dayId: dayMap.get(activity.dayId) ?? created.days[0]?.id ?? activity.dayId,
      }));
      await api.commitActivities(copy.id, activities);
      for (const item of bundle.saved) await api.savePlace(copy.id, item.placeId);
      return copy;
    },
    async moveActivity(tripId, activeId, overId) {
      const user = await assertEdit(tripId);
      const { data, error } = await supabase.from("activities").select("*").eq("trip_id", tripId);
      if (error) throw new RepoError(error.message);
      const current = ((data ?? []) as Row[]).map(activityFrom);
      const before = current.find((activity) => activity.id === activeId);
      if (!before) throw new RepoError("Activity not found.");
      const next = moveActivity(current, activeId, overId);
      const after = next.find((activity) => activity.id === activeId);
      const { error: upsertError } = await supabase.from("activities").upsert(next.map(activityTo));
      if (upsertError) throw new RepoError(upsertError.message);
      if (after && before.dayId !== after.dayId) {
        const { data: days } = await supabase.from("days").select("*").eq("trip_id", tripId);
        const mapped: Day[] = ((days ?? []) as Row[]).map((row) => ({ id: asString(row.id), tripId, date: asString(row.date), note: "" }));
        await pushEvent(tripId, user, `${user.name} moved "${before.title}" to ${dayLabel(mapped, after.dayId)}.`);
      }
    },
    async createActivity(tripId, input: ActivityInput) {
      await assertEdit(tripId);
      const { data } = await supabase.from("activities").select("position").eq("day_id", input.dayId);
      const position = (data ?? []).reduce((max, row) => Math.max(max, Number(row.position)), -1) + 1;
      const activity: Activity = {
        id: nid("act"),
        tripId,
        dayId: input.dayId,
        placeId: input.placeId,
        title: input.title,
        startTime: input.startTime,
        duration: input.duration,
        position,
        note: input.note ?? "",
        plannedCost: input.plannedCost ?? 0,
        actualCost: input.actualCost ?? null,
        status: "planned",
      };
      const { error } = await supabase.from("activities").insert(activityTo(activity));
      if (error) throw new RepoError(error.message);
      return activity;
    },
    async updateActivity(tripId, activityId, patch) {
      await assertEdit(tripId);
      const { data, error } = await supabase.from("activities").select("*").eq("id", activityId).eq("trip_id", tripId).single();
      if (error) throw new RepoError(error.message);
      const next = { ...activityFrom(data as Row), ...patch, id: activityId, tripId };
      const { error: updateError } = await supabase.from("activities").update(activityTo(next)).eq("id", activityId);
      if (updateError) throw new RepoError(updateError.message);
      return next;
    },
    async deleteActivity(tripId, activityId) {
      await assertEdit(tripId);
      const { error } = await supabase.from("activities").delete().eq("id", activityId).eq("trip_id", tripId);
      if (error) throw new RepoError(error.message);
    },
    async commitActivities(tripId, activities, eventBody) {
      const user = await assertEdit(tripId);
      if (activities.some((activity) => activity.tripId !== tripId)) throw new RepoError("Invalid activity.");
      if (activities.length) {
        const { error } = await supabase.from("activities").upsert(activities.map(activityTo));
        if (error) throw new RepoError(error.message);
      }
      const { data } = await supabase.from("activities").select("id").eq("trip_id", tripId);
      const keep = new Set(activities.map((activity) => activity.id));
      const remove = ((data ?? []) as { id: string }[]).map((row) => row.id).filter((id) => !keep.has(id));
      if (remove.length) await supabase.from("activities").delete().in("id", remove);
      if (eventBody) await pushEvent(tripId, user, eventBody);
    },
    async savePlace(tripId, placeId) {
      await assertEdit(tripId);
      if (!placeById(placeId)) throw new RepoError("Unknown place.");
      const saved: SavedPlace = { id: nid("save"), tripId, placeId, note: "" };
      const { error } = await supabase.from("saved_places").insert({ id: saved.id, trip_id: tripId, place_id: placeId, note: "" });
      if (error && !error.message.toLowerCase().includes("duplicate")) throw new RepoError(error.message);
      return saved;
    },
    async unsavePlace(tripId, placeId) {
      await assertEdit(tripId);
      await supabase.from("saved_places").delete().eq("trip_id", tripId).eq("place_id", placeId);
    },
    async createBooking(tripId, input: BookingInput) {
      await assertEdit(tripId);
      let attachmentUrl = input.attachmentUrl ?? null;
      if (attachmentUrl?.startsWith("data:")) attachmentUrl = await uploadAttachment(tripId, attachmentUrl, input.attachmentName || "file");
      const booking: Booking = {
        id: nid("book"),
        tripId,
        type: input.type,
        title: input.title,
        reference: input.reference,
        startAt: input.startAt,
        notes: input.notes ?? "",
        attachmentUrl,
        attachmentName: input.attachmentName ?? null,
      };
      const { error } = await supabase.from("bookings").insert({
        id: booking.id,
        trip_id: tripId,
        type: booking.type,
        title: booking.title,
        reference: booking.reference,
        start_at: booking.startAt,
        notes: booking.notes,
        attachment_url: booking.attachmentUrl,
        attachment_name: booking.attachmentName,
      });
      if (error) throw new RepoError(error.message);
      return booking;
    },
    async deleteBooking(tripId, bookingId) {
      await assertEdit(tripId);
      await supabase.from("bookings").delete().eq("id", bookingId).eq("trip_id", tripId);
    },
    async createExpense(tripId, input: ExpenseInput) {
      await assertEdit(tripId);
      const expense: Expense = {
        id: nid("exp"),
        tripId,
        title: input.title,
        amount: input.amount,
        plannedAmount: input.plannedAmount,
        category: input.category,
        paidBy: input.paidBy,
        activityId: input.activityId ?? null,
      };
      const { error } = await supabase.from("expenses").insert({
        id: expense.id,
        trip_id: tripId,
        title: expense.title,
        amount: expense.amount,
        planned_amount: expense.plannedAmount,
        category: expense.category,
        paid_by: expense.paidBy,
        activity_id: expense.activityId,
      });
      if (error) throw new RepoError(error.message);
      if (input.shares.length) {
        await supabase.from("expense_shares").insert(
          input.shares.map((share) => ({ id: nid("share"), expense_id: expense.id, trip_id: tripId, user_id: share.userId, amount: share.amount })),
        );
      }
      return expense;
    },
    async deleteExpense(tripId, expenseId) {
      await assertEdit(tripId);
      await supabase.from("expense_shares").delete().eq("expense_id", expenseId);
      await supabase.from("expenses").delete().eq("id", expenseId).eq("trip_id", tripId);
    },
    async addComment(tripId, activityId, body) {
      const user = await assertEdit(tripId);
      const comment: Comment = { id: nid("c"), activityId, tripId, userId: user.id, body: body.trim(), createdAt: new Date().toISOString() };
      const { error } = await supabase.from("comments").insert({
        id: comment.id,
        activity_id: activityId,
        trip_id: tripId,
        user_id: user.id,
        body: comment.body,
        created_at: comment.createdAt,
      });
      if (error) throw new RepoError(error.message);
      return comment;
    },
    async setMemberRole(tripId, userId, role) {
      await assertOwner(tripId);
      if (role === "owner") throw new RepoError("The owner role stays put.");
      const { error } = await supabase.from("trip_members").update({ role }).eq("trip_id", tripId).eq("user_id", userId).neq("role", "owner");
      if (error) throw new RepoError(error.message);
    },
    async search(query) {
      const user = await requireUser();
      const q = query.trim().toLowerCase();
      const trips = (await api.listTrips()).filter((trip) => `${trip.title} ${trip.destination}`.toLowerCase().includes(q)).slice(0, 6);
      const activities = [];
      for (const trip of trips) {
        const bundle = await api.getBundle(trip.id);
        if (!bundle) continue;
        for (const activity of bundle.activities) {
          if (activity.title.toLowerCase().includes(q)) activities.push({ activity, trip, dayLabel: dayLabel(bundle.days, activity.dayId) });
        }
      }
      return {
        places: places.filter((place) => place.name.toLowerCase().includes(q)).slice(0, 6),
        trips,
        activities: activities.slice(0, 8),
      };
    },
    async listEvents(tripId) {
      const { data } = await supabase.from("activity_events").select("*").eq("trip_id", tripId).order("created_at", { ascending: false });
      return ((data ?? []) as Row[]).map((row) => ({
        id: asString(row.id),
        tripId,
        userId: asString(row.user_id),
        body: asString(row.body),
        createdAt: asString(row.created_at),
      }));
    },
  };

  return api;
}

function dataUrlToBlob(dataUrl: string) {
  const [meta, content] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(meta)?.[1] || "application/octet-stream";
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
