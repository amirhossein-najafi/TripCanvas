import { places, placesFor, destinationById, placeById } from "@/lib/catalog";
import { eachDate } from "@/lib/dates";
import { buildDays, dayLabel, moveActivity } from "@/lib/itinerary";
import { RepoError, type ActivityInput, type BookingInput, type ExpenseInput, type Repository, type TripInput } from "@/lib/api/repository";
import { buildTokyoSample } from "@/lib/sample-trip";
import { browserSupabase } from "@/lib/supabase/client";
import { nid, slugify } from "@/lib/utils";
import { toPublicBundle } from "@/lib/public-trip";
import type { Activity, Booking, Comment, Day, Expense, ExpenseShare, Participant, PlaceVote, PublicTripBundle, Role, SavedPlace, Trip, TripBundle, TripInvite, TripMember, TripSnapshot, User } from "@/types";

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
    revision: Number(row.revision ?? 0),
    fxRates: (row.fx_rates && typeof row.fx_rates === "object" ? row.fx_rates : {}) as Record<string, number>,
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
    while (n < 50) {
      const { data, error } = await supabase.rpc("slug_available", { p_slug: slug });
      if (!error && data === true) return slug;
      if (error) {
        const { data: row } = await supabase.from("trips").select("id").eq("slug", slug).maybeSingle();
        if (!row) return slug;
      }
      slug = `${base}-${n}`;
      n += 1;
    }
    return `${base}-${nid("s")}`;
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
          barcodeValue: row.barcode_value ? asString(row.barcode_value) : null,
          barcodeType: asString(row.barcode_type || "qr") === "code128" ? "code128" : "qr",
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
      saved: ((saved.data ?? []) as Row[]).map((row) => ({
        id: asString(row.id),
        tripId: trip.id,
        placeId: asString(row.place_id),
        note: asString(row.note),
        priority: (asString(row.priority || "nice") as SavedPlace["priority"]) || "nice",
      })),
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
        currency: asString(row.currency || trip.currency || "USD"),
        participantId: row.participant_id ? asString(row.participant_id) : null,
      })),
      shares: ((shares.data ?? []) as Row[]).map((row) => ({
        id: asString(row.id),
        expenseId: asString(row.expense_id),
        tripId: trip.id,
        userId: asString(row.user_id),
        amount: Number(row.amount),
        participantId: row.participant_id ? asString(row.participant_id) : null,
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
      invites: [],
      participants: [],
      votes: [],
      snapshots: [],
    };
  }

  async function loadExtras(bundle: TripBundle): Promise<TripBundle> {
    const [invites, participants, votes, snapshots] = await Promise.all([
      supabase.from("trip_invites").select("*").eq("trip_id", bundle.trip.id),
      supabase.from("participants").select("*").eq("trip_id", bundle.trip.id),
      supabase.from("place_votes").select("*").eq("trip_id", bundle.trip.id),
      supabase.from("trip_snapshots").select("*").eq("trip_id", bundle.trip.id).order("created_at", { ascending: false }),
    ]);
    return {
      ...bundle,
      invites: ((invites.data ?? []) as Row[]).map(inviteFrom),
      participants: ((participants.data ?? []) as Row[]).map((row) => ({
        id: asString(row.id),
        tripId: bundle.trip.id,
        name: asString(row.name),
        userId: row.user_id ? asString(row.user_id) : null,
      })),
      votes: ((votes.data ?? []) as Row[]).map((row) => ({
        id: asString(row.id),
        tripId: bundle.trip.id,
        placeId: asString(row.place_id),
        userId: asString(row.user_id),
        vote: asString(row.vote) === "down" ? "down" : "up",
      })),
      snapshots: ((snapshots.data ?? []) as Row[]).map(snapshotFrom),
    };
  }

  function inviteFrom(row: Row): TripInvite {
    return {
      id: asString(row.id),
      tripId: asString(row.trip_id),
      token: asString(row.token),
      role: asString(row.role) === "editor" ? "editor" : "viewer",
      createdBy: asString(row.created_by),
      expiresAt: asString(row.expires_at),
      maxUses: Number(row.max_uses ?? 20),
      usedCount: Number(row.used_count ?? 0),
    };
  }

  function snapshotFrom(row: Row): TripSnapshot {
    const payload = (row.payload ?? {}) as { activities?: Activity[]; saved?: SavedPlace[] };
    return {
      id: asString(row.id),
      tripId: asString(row.trip_id),
      revision: Number(row.revision ?? 0),
      label: asString(row.label),
      createdAt: asString(row.created_at),
      activities: payload.activities ?? [],
      saved: payload.saved ?? [],
    };
  }

  async function writeSnapshot(tripId: string, user: User, label: string) {
    const bundle = await api.getBundle(tripId);
    if (!bundle) return;
    await supabase.from("trip_snapshots").insert({
      id: nid("snap"),
      trip_id: tripId,
      revision: bundle.trip.revision,
      label,
      payload: { activities: bundle.activities, saved: bundle.saved },
      created_at: new Date().toISOString(),
    });
    await pushEvent(tripId, user, label);
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
      return loadExtras(await assemble(tripFrom(data as Row)));
    },
    async getPublicBundle(slug) {
      const { data, error } = await supabase.rpc("get_public_trip", { p_slug: slug });
      if (error || !data) {
        const { data: row } = await supabase.from("trips").select("*").eq("slug", slug).eq("is_public", true).maybeSingle();
        if (!row) return null;
        return toPublicBundle(await assemble(tripFrom(row as Row)));
      }
      const body = data as PublicTripBundle;
      return {
        trip: body.trip,
        owner: body.owner,
        days: (body.days ?? []).map((day) => ({ ...day, date: asString(day.date).slice(0, 10), note: "" })),
        activities: body.activities ?? [],
        places: placesFor(body.trip.destinationId),
      };
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
      const draftId = nid("trip");
      const days = buildDays(draftId, eachDate(input.startDate, input.endDate));
      const slug = await uniqueSlug(`${slugify(destination.name)}-${input.startDate.slice(0, 4)}`);
      const { data, error } = await supabase.rpc("create_trip", {
        payload: {
          id: draftId,
          title: input.title.trim() || destination.name,
          destination: destination.name,
          destination_id: destination.id,
          start_date: input.startDate,
          end_date: input.endDate,
          cover_image: `https://picsum.photos/seed/${destination.id}-cover/1400/900`,
          currency: input.currency || "USD",
          timezone: destination.timezone,
          slug,
          budget_amount: input.budgetAmount ?? 1500,
          traveler_count: input.travelerCount,
          center_lat: destination.lat,
          center_lng: destination.lng,
          days: days.map((day) => ({ id: day.id, date: day.date, note: day.note })),
        },
      });
      if (error || !data) throw new RepoError(error?.message || "Couldn't create the trip.");
      return tripFrom(data as Row);
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
      const created = await api.createTrip({
        title: sample.trip.title,
        destinationId: sample.trip.destinationId,
        startDate: sample.trip.startDate,
        endDate: sample.trip.endDate,
        travelerCount: sample.trip.travelerCount,
        budgetAmount: sample.trip.budgetAmount,
        currency: sample.trip.currency,
      });
      await supabase.from("trips").update({ is_public: true, cover_image: sample.trip.coverImage }).eq("id", created.id);
      const createdBundle = await api.getBundle(created.id);
      const dayMap = new Map((createdBundle?.days ?? []).map((day, index) => [sample.days[index]?.id, day.id]));
      sample.trip = { ...sample.trip, id: created.id, slug: created.slug, ownerId: user.id };
      sample.activities = sample.activities.map((activity) => ({ ...activity, id: nid("act"), tripId: created.id, dayId: dayMap.get(activity.dayId) ?? activity.dayId }));
      sample.saved = sample.saved.map((item) => ({ ...item, id: nid("save"), tripId: created.id }));
      sample.bookings = sample.bookings.map((item) => ({ ...item, id: nid("book"), tripId: created.id }));
      sample.days = createdBundle?.days ?? sample.days;
      await supabase.from("activities").insert(sample.activities.map(activityTo));
      await supabase.from("saved_places").insert(sample.saved.map((item) => ({ id: item.id, trip_id: created.id, place_id: item.placeId, note: item.note, priority: item.priority })));
      await supabase.from("bookings").insert(sample.bookings.map((item) => ({
        id: item.id, trip_id: created.id, type: item.type, title: item.title, reference: item.reference, start_at: item.startAt, notes: item.notes, attachment_url: null, attachment_name: null, barcode_value: item.barcodeValue, barcode_type: item.barcodeType,
      })));
      if (sample.expenses.length) {
        await supabase.from("expenses").insert(sample.expenses.map((item) => ({
          id: item.id, trip_id: created.id, title: item.title, amount: item.amount, planned_amount: item.plannedAmount, category: item.category, paid_by: user.id, activity_id: null, currency: item.currency, participant_id: null,
        })));
      }
      return created;
    },
    async joinTrip(slug) {
      const user = await requireUser();
      const accepted = await supabase.rpc("accept_trip_invite", { p_token: slug });
      if (!accepted.error && accepted.data) {
        const trip = tripFrom(accepted.data as Row);
        await pushEvent(trip.id, user, `${user.name} joined the trip.`);
        return trip;
      }
      if (accepted.error && !/invite not found/i.test(accepted.error.message)) throw new RepoError(accepted.error.message);
      const pub = await api.getPublicBundle(slug);
      if (!pub) throw new RepoError("That invite link doesn't match a trip.");
      const { error } = await supabase.from("trip_members").insert({ trip_id: pub.trip.id, user_id: user.id, role: "viewer" });
      if (error && !/duplicate|already/i.test(error.message)) throw new RepoError(error.message);
      const { data } = await supabase.from("trips").select("*").eq("id", pub.trip.id).maybeSingle();
      if (!data) throw new RepoError("That invite link doesn't match a trip.");
      return tripFrom(data as Row);
    },
    async duplicateTrip(slug) {
      await requireUser();
      const source = await api.getPublicBundle(slug);
      const owned = source ? null : await api.getBySlug(slug);
      const full = owned ? await api.getBundle(owned.id) : null;
      const trip = source?.trip ?? full?.trip;
      if (!trip) throw new RepoError("That public trip isn't available.");
      const copy = await api.createTrip({
        title: `${trip.title} copy`,
        destinationId: trip.destinationId,
        startDate: trip.startDate,
        endDate: trip.endDate,
        travelerCount: full?.trip.travelerCount ?? 1,
        budgetAmount: full?.trip.budgetAmount ?? 1500,
        currency: full?.trip.currency,
      });
      const created = await api.getBundle(copy.id);
      if (!created) return copy;
      const sourceDays = source?.days ?? full?.days ?? [];
      const sourceActivities = source?.activities ?? full?.activities ?? [];
      const dayMap = new Map(sourceDays.map((day, index) => [day.id, created.days[index]?.id]));
      const activities: Activity[] = sourceActivities.map((activity, index) => ({
        id: nid("act"),
        tripId: copy.id,
        dayId: dayMap.get(activity.dayId) ?? created.days[0]?.id ?? activity.dayId,
        placeId: activity.placeId,
        title: activity.title,
        startTime: activity.startTime,
        duration: activity.duration,
        position: activity.position ?? index,
        note: "note" in activity && typeof activity.note === "string" ? activity.note : "",
        plannedCost: "plannedCost" in activity && typeof activity.plannedCost === "number" ? activity.plannedCost : 0,
        actualCost: "actualCost" in activity && typeof activity.actualCost === "number" ? activity.actualCost : null,
        status: "status" in activity && (activity.status === "planned" || activity.status === "done" || activity.status === "skipped") ? activity.status : "planned",
      }));
      await api.commitActivities(copy.id, activities, "Duplicated the itinerary.");
      for (const item of full?.saved ?? []) await api.savePlace(copy.id, item.placeId);
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
        await writeSnapshot(tripId, user, `${user.name} moved "${before.title}" to ${dayLabel(mapped, after.dayId)}.`);
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
      await writeSnapshot(tripId, user, eventBody || `${user.name} updated the itinerary.`);
    },
    async savePlace(tripId, placeId) {
      await assertEdit(tripId);
      if (!placeById(placeId)) throw new RepoError("Unknown place.");
      const saved: SavedPlace = { id: nid("save"), tripId, placeId, note: "", priority: "nice" };
      const { error } = await supabase.from("saved_places").insert({ id: saved.id, trip_id: tripId, place_id: placeId, note: "", priority: "nice" });
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
        barcodeValue: input.barcodeValue ?? null,
        barcodeType: input.barcodeType ?? "qr",
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
        barcode_value: booking.barcodeValue,
        barcode_type: booking.barcodeType,
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
        currency: input.currency || "USD",
        participantId: input.participantId ?? null,
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
        currency: expense.currency,
        participant_id: expense.participantId,
      });
      if (error) throw new RepoError(error.message);
      if (input.shares.length) {
        await supabase.from("expense_shares").insert(
          input.shares.map((share) => ({ id: nid("share"), expense_id: expense.id, trip_id: tripId, user_id: share.userId, amount: share.amount, participant_id: share.participantId ?? null })),
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
    async createInvite(tripId, role) {
      await assertEdit(tripId);
      const { data, error } = await supabase.rpc("create_trip_invite", { p_trip_id: tripId, p_role: role });
      if (error || !data) throw new RepoError(error?.message || "Couldn't create an invite.");
      return inviteFrom(data as Row);
    },
    async moveSavedPlaceToDay(tripId, placeId, dayId) {
      await assertEdit(tripId);
      const place = placeById(placeId);
      if (!place) throw new RepoError("Unknown place.");
      const { data } = await supabase.from("activities").select("position").eq("day_id", dayId);
      const position = (data ?? []).reduce((max, row) => Math.max(max, Number(row.position)), -1) + 1;
      const activity: Activity = {
        id: nid("act"), tripId, dayId, placeId, title: place.name, startTime: "10:00", duration: place.durationMin, position, note: "", plannedCost: 0, actualCost: null, status: "planned",
      };
      const { error } = await supabase.rpc("move_saved_place_to_day", {
        payload: { id: activity.id, trip_id: tripId, place_id: placeId, day_id: dayId, title: activity.title, start_time: activity.startTime, duration: activity.duration, position },
      });
      if (error) throw new RepoError(error.message);
      return activity;
    },
    async moveActivityToIdeas(tripId, activityId) {
      await assertEdit(tripId);
      const { error } = await supabase.rpc("move_activity_to_ideas", { p_trip_id: tripId, p_activity_id: activityId });
      if (error) throw new RepoError(error.message);
    },
    async listSnapshots(tripId) {
      const { data, error } = await supabase.from("trip_snapshots").select("*").eq("trip_id", tripId).order("created_at", { ascending: false });
      if (error) throw new RepoError(error.message);
      return ((data ?? []) as Row[]).map(snapshotFrom);
    },
    async restoreSnapshot(tripId, snapshotId) {
      const user = await assertEdit(tripId);
      const { data, error } = await supabase.from("trip_snapshots").select("*").eq("id", snapshotId).eq("trip_id", tripId).maybeSingle();
      if (error || !data) throw new RepoError("That version is gone.");
      const snap = snapshotFrom(data as Row);
      await api.commitActivities(tripId, snap.activities, `${user.name} restored a previous version.`);
      await supabase.from("saved_places").delete().eq("trip_id", tripId);
      if (snap.saved.length) {
        await supabase.from("saved_places").insert(snap.saved.map((item) => ({ id: item.id, trip_id: tripId, place_id: item.placeId, note: item.note, priority: item.priority })));
      }
    },
    async votePlace(tripId, placeId, vote) {
      const user = await requireUser();
      const { data } = await supabase.from("place_votes").select("*").eq("trip_id", tripId).eq("place_id", placeId).eq("user_id", user.id).maybeSingle();
      if (data && asString((data as Row).vote) === vote) {
        await supabase.from("place_votes").delete().eq("id", asString((data as Row).id));
        return;
      }
      if (data) {
        await supabase.from("place_votes").update({ vote }).eq("id", asString((data as Row).id));
        return;
      }
      const { error } = await supabase.from("place_votes").insert({ id: nid("vote"), trip_id: tripId, place_id: placeId, user_id: user.id, vote });
      if (error) throw new RepoError(error.message);
    },
    async setPlacePriority(tripId, placeId, priority) {
      await assertEdit(tripId);
      const { error } = await supabase.from("saved_places").update({ priority }).eq("trip_id", tripId).eq("place_id", placeId);
      if (error) throw new RepoError(error.message);
    },
    async addParticipant(tripId, name) {
      await assertEdit(tripId);
      const participant: Participant = { id: nid("part"), tripId, name: name.trim() || "Traveler", userId: null };
      const { error } = await supabase.from("participants").insert({ id: participant.id, trip_id: tripId, name: participant.name, user_id: null });
      if (error) throw new RepoError(error.message);
      return participant;
    },
    async removeParticipant(tripId, participantId) {
      await assertEdit(tripId);
      await supabase.from("participants").delete().eq("id", participantId).eq("trip_id", tripId);
    },
    async setFxRate(tripId, currency, rate) {
      await assertEdit(tripId);
      const current = await api.getBundle(tripId);
      if (!current) throw new RepoError("Trip not found.");
      const fxRates = { ...current.trip.fxRates, [currency]: rate };
      const { error } = await supabase.from("trips").update({ fx_rates: fxRates }).eq("id", tripId);
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
