import { moveActivityToIdeas, moveSavedPlaceToDay } from "@/lib/board";
import { destinationById, placeById, places, placesFor } from "@/lib/catalog";
import { eachDate } from "@/lib/dates";
import { resolveJoin } from "@/lib/invites";
import { buildDays, dayLabel, moveActivity } from "@/lib/itinerary";
import { toPublicBundle } from "@/lib/public-trip";
import { RepoError, type ActivityInput, type BookingInput, type ExpenseInput, type Repository, type TripInput } from "@/lib/api/repository";
import { buildTokyoSample, demoUsers, type StoredUser } from "@/lib/sample-trip";
import { nid, slugify } from "@/lib/utils";
import type { Activity, ActivityEvent, Booking, Comment, Day, Expense, ExpenseShare, Participant, PlaceVote, Role, SavedPlace, Trip, TripBundle, TripInvite, TripMember, TripSnapshot, User } from "@/types";

const KEY = "tripcanvas.db.v1";

type Database = {
  users: StoredUser[];
  sessionUserId: string | null;
  trips: Trip[];
  members: TripMember[];
  days: Day[];
  activities: Activity[];
  saved: SavedPlace[];
  bookings: Booking[];
  expenses: Expense[];
  shares: ExpenseShare[];
  comments: Comment[];
  events: ActivityEvent[];
  invites: TripInvite[];
  snapshots: TripSnapshot[];
  votes: PlaceVote[];
  participants: Participant[];
};

function strip(user: StoredUser): User {
  return { id: user.id, name: user.name, email: user.email, avatar: user.avatar };
}

function initial(): Database {
  const ali = demoUsers[0];
  const sample = buildTokyoSample(ali, { stable: true, withCollaborators: true });
  return {
    users: demoUsers.map((user) => ({ ...user })),
    sessionUserId: null,
    trips: [sample.trip],
    members: sample.members,
    days: sample.days,
    activities: sample.activities,
    saved: sample.saved,
    bookings: sample.bookings,
    expenses: sample.expenses,
    shares: sample.shares,
    comments: sample.comments,
    events: sample.events,
    invites: [],
    snapshots: [],
    votes: [],
    participants: [],
  };
}

function hydrate(parsed: Database): Database {
  return {
    ...parsed,
    invites: parsed.invites ?? [],
    snapshots: parsed.snapshots ?? [],
    votes: parsed.votes ?? [],
    participants: parsed.participants ?? [],
    trips: parsed.trips.map((trip) => ({ ...trip, revision: trip.revision ?? 0, fxRates: trip.fxRates ?? {} })),
    saved: parsed.saved.map((item) => ({ ...item, priority: item.priority ?? "nice" })),
    bookings: parsed.bookings.map((item) => ({ ...item, barcodeValue: item.barcodeValue ?? null, barcodeType: item.barcodeType ?? "qr" })),
    expenses: parsed.expenses.map((item) => ({ ...item, currency: item.currency ?? "USD", participantId: item.participantId ?? null })),
    shares: parsed.shares.map((item) => ({ ...item, participantId: item.participantId ?? null })),
  };
}

export function createLocalRepository(): Repository {
  let db = read();

  function read(): Database {
    if (typeof window === "undefined") return initial();
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return initial();
      const parsed = JSON.parse(raw) as Database;
      if (!parsed.users || !parsed.trips || !parsed.activities) return initial();
      return hydrate(parsed);
    } catch {
      return initial();
    }
  }

  function save() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, JSON.stringify(db));
    window.dispatchEvent(new CustomEvent("tripcanvas-db"));
  }

  function requireUser() {
    db = read();
    const user = db.users.find((item) => item.id === db.sessionUserId);
    if (!user) throw new RepoError("You need to sign in.");
    return user;
  }

  function roleOf(tripId: string, userId: string | null): Role | null {
    if (!userId) return null;
    return db.members.find((member) => member.tripId === tripId && member.userId === userId)?.role ?? null;
  }

  function assertEdit(tripId: string) {
    const user = requireUser();
    const role = roleOf(tripId, user.id);
    if (role !== "owner" && role !== "editor") throw new RepoError("You can't edit this trip.");
    return user;
  }

  function assertOwner(tripId: string) {
    const user = requireUser();
    if (roleOf(tripId, user.id) !== "owner") throw new RepoError("Only the owner can do that.");
    return user;
  }

  function assemble(trip: Trip): TripBundle {
    const memberRows = db.members.filter((member) => member.tripId === trip.id);
    return {
      trip,
      members: memberRows.map((member) => {
        const user = db.users.find((item) => item.id === member.userId);
        return {
          ...member,
          user: user ? strip(user) : { id: member.userId, name: "Traveler", email: "", avatar: "?" },
        };
      }),
      days: db.days.filter((day) => day.tripId === trip.id).sort((a, b) => a.date.localeCompare(b.date)),
      activities: db.activities.filter((activity) => activity.tripId === trip.id),
      saved: db.saved.filter((item) => item.tripId === trip.id),
      bookings: db.bookings.filter((item) => item.tripId === trip.id),
      expenses: db.expenses.filter((item) => item.tripId === trip.id),
      shares: db.shares.filter((item) => item.tripId === trip.id),
      comments: db.comments.filter((item) => item.tripId === trip.id),
      events: db.events.filter((item) => item.tripId === trip.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      places: placesFor(trip.destinationId),
      invites: db.invites.filter((item) => item.tripId === trip.id),
      participants: db.participants.filter((item) => item.tripId === trip.id),
      votes: db.votes.filter((item) => item.tripId === trip.id),
      snapshots: db.snapshots.filter((item) => item.tripId === trip.id),
    };
  }

  function bump(tripId: string) {
    const trip = db.trips.find((item) => item.id === tripId);
    if (trip) trip.revision += 1;
  }

  function snapshot(tripId: string, user: User, label: string) {
    bump(tripId);
    const trip = db.trips.find((item) => item.id === tripId);
    db.snapshots.unshift({
      id: nid("snap"),
      tripId,
      revision: trip?.revision ?? 0,
      label,
      createdAt: new Date().toISOString(),
      activities: db.activities.filter((item) => item.tripId === tripId).map((item) => ({ ...item })),
      saved: db.saved.filter((item) => item.tripId === tripId).map((item) => ({ ...item })),
    });
    pushEvent(tripId, user, label);
  }

  function uniqueSlug(base: string) {
    let slug = base || "trip";
    let n = 2;
    while (db.trips.some((trip) => trip.slug === slug)) {
      slug = `${base}-${n}`;
      n += 1;
    }
    return slug;
  }

  function pushEvent(tripId: string, user: User, body: string) {
    db.events.unshift({ id: nid("evt"), tripId, userId: user.id, body, createdAt: new Date().toISOString() });
  }

  const api: Repository = {
    mode: "local",
    async signIn(email, password) {
      db = read();
      const user = db.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
      if (!user || user.password !== password) throw new RepoError("Those details don't match.");
      db.sessionUserId = user.id;
      save();
      return strip(user);
    },
    async signUp(name, email, password) {
      db = read();
      const clean = email.trim().toLowerCase();
      if (db.users.some((user) => user.email.toLowerCase() === clean)) throw new RepoError("That email is already in use.");
      if (password.length < 4) throw new RepoError("Use at least 4 characters.");
      const user: StoredUser = { id: nid("user"), name: name.trim() || "Traveler", email: clean, avatar: (name.trim()[0] || "T").toUpperCase(), password };
      db.users.push(user);
      db.sessionUserId = user.id;
      save();
      return strip(user);
    },
    async signOut() {
      db = read();
      db.sessionUserId = null;
      save();
    },
    async currentUser() {
      db = read();
      const user = db.users.find((item) => item.id === db.sessionUserId);
      return user ? strip(user) : null;
    },
    async listTrips() {
      const user = requireUser();
      const ids = new Set(db.members.filter((member) => member.userId === user.id).map((member) => member.tripId));
      return db.trips.filter((trip) => ids.has(trip.id)).sort((a, b) => b.startDate.localeCompare(a.startDate));
    },
    async getBundle(tripId) {
      db = read();
      const trip = db.trips.find((item) => item.id === tripId);
      if (!trip) return null;
      const userId = db.sessionUserId;
      if (!roleOf(tripId, userId)) return null;
      return assemble(trip);
    },
    async getPublicBundle(slug) {
      db = read();
      const trip = db.trips.find((item) => item.slug === slug && item.isPublic);
      return trip ? toPublicBundle(assemble(trip)) : null;
    },
    async getBySlug(slug) {
      db = read();
      return db.trips.find((item) => item.slug === slug) ?? null;
    },
    async createTrip(input: TripInput) {
      const user = requireUser();
      const destination = destinationById(input.destinationId);
      if (!destination) throw new RepoError("Pick a destination we know.");
      if (input.endDate < input.startDate) throw new RepoError("The end date is before the start.");
      const year = input.startDate.slice(0, 4);
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
        slug: uniqueSlug(`${slugify(destination.name)}-${year}`),
        isPublic: false,
        budgetAmount: input.budgetAmount ?? 1500,
        travelerCount: input.travelerCount,
        centerLat: destination.lat,
        centerLng: destination.lng,
        revision: 0,
        fxRates: {},
      };
      db.trips.push(trip);
      db.members.push({ tripId: trip.id, userId: user.id, role: "owner" });
      db.days.push(...buildDays(trip.id, eachDate(trip.startDate, trip.endDate)));
      save();
      return trip;
    },
    async updateTrip(tripId, patch) {
      const trip = db.trips.find((item) => item.id === tripId);
      if (!trip) throw new RepoError("Trip not found.");
      const touchesSettings = patch.isPublic != null || patch.startDate != null || patch.endDate != null;
      if (touchesSettings) assertOwner(tripId);
      else assertEdit(tripId);
      if (patch.startDate || patch.endDate) {
        const start = patch.startDate ?? trip.startDate;
        const end = patch.endDate ?? trip.endDate;
        if (end < start) throw new RepoError("The end date is before the start.");
        const dates = eachDate(start, end);
        const current = db.days.filter((day) => day.tripId === tripId);
        const removed = current.filter((day) => !dates.includes(day.date));
        if (removed.some((day) => db.activities.some((activity) => activity.dayId === day.id))) {
          throw new RepoError("Move activities off a day before you drop it.");
        }
        db.days = db.days.filter((day) => day.tripId !== tripId || dates.includes(day.date));
        const have = new Set(db.days.filter((day) => day.tripId === tripId).map((day) => day.date));
        db.days.push(...buildDays(tripId, dates.filter((date) => !have.has(date))));
      }
      Object.assign(trip, patch);
      save();
      return trip;
    },
    async deleteTrip(tripId) {
      assertOwner(tripId);
      db.trips = db.trips.filter((trip) => trip.id !== tripId);
      db.members = db.members.filter((item) => item.tripId !== tripId);
      db.days = db.days.filter((item) => item.tripId !== tripId);
      db.activities = db.activities.filter((item) => item.tripId !== tripId);
      db.saved = db.saved.filter((item) => item.tripId !== tripId);
      db.bookings = db.bookings.filter((item) => item.tripId !== tripId);
      db.expenses = db.expenses.filter((item) => item.tripId !== tripId);
      db.shares = db.shares.filter((item) => item.tripId !== tripId);
      db.comments = db.comments.filter((item) => item.tripId !== tripId);
      db.events = db.events.filter((item) => item.tripId !== tripId);
      db.invites = db.invites.filter((item) => item.tripId !== tripId);
      db.snapshots = db.snapshots.filter((item) => item.tripId !== tripId);
      db.votes = db.votes.filter((item) => item.tripId !== tripId);
      db.participants = db.participants.filter((item) => item.tripId !== tripId);
      save();
    },
    async loadTokyoSample() {
      const user = requireUser();
      const sample = buildTokyoSample(user, { stable: false, withCollaborators: false });
      sample.trip.slug = uniqueSlug(sample.trip.slug);
      db.trips.push(sample.trip);
      db.members.push(...sample.members);
      db.days.push(...sample.days);
      db.activities.push(...sample.activities);
      db.saved.push(...sample.saved);
      db.bookings.push(...sample.bookings);
      db.expenses.push(...sample.expenses);
      db.shares.push(...sample.shares);
      save();
      return sample.trip;
    },
    async joinTrip(slug) {
      const user = requireUser();
      const result = resolveJoin({
        tokenOrSlug: slug,
        userId: user.id,
        now: new Date().toISOString(),
        invites: db.invites,
        trips: db.trips,
        members: db.members,
      });
      if (!result.ok) throw new RepoError(result.reason);
      const trip = db.trips.find((item) => item.id === result.tripId);
      if (!trip) throw new RepoError("That invite link doesn't match a trip.");
      if (result.role !== "existing") {
        db.members.push({ tripId: trip.id, userId: user.id, role: result.role });
        if (result.inviteToken) {
          const invite = db.invites.find((item) => item.token === result.inviteToken);
          if (invite) invite.usedCount += 1;
        }
        pushEvent(trip.id, user, `${user.name} joined the trip.`);
        save();
      }
      return trip;
    },
    async duplicateTrip(slug) {
      const user = requireUser();
      const source = db.trips.find((item) => item.slug === slug && (item.isPublic || roleOf(item.id, user.id)));
      if (!source) throw new RepoError("That public trip isn't available.");
      const trip: Trip = {
        ...source,
        id: nid("trip"),
        ownerId: user.id,
        title: `${source.title} copy`,
        slug: uniqueSlug(`${source.slug}-copy`),
        isPublic: false,
      };
      const dayMap = new Map<string, string>();
      const days = db.days.filter((day) => day.tripId === source.id).map((day) => {
        const id = nid("day");
        dayMap.set(day.id, id);
        return { ...day, id, tripId: trip.id };
      });
      const activities = db.activities.filter((activity) => activity.tripId === source.id).map((activity) => ({
        ...activity,
        id: nid("act"),
        tripId: trip.id,
        dayId: dayMap.get(activity.dayId) ?? activity.dayId,
      }));
      const saved = db.saved.filter((item) => item.tripId === source.id).map((item) => ({ ...item, id: nid("save"), tripId: trip.id }));
      db.trips.push(trip);
      db.members.push({ tripId: trip.id, userId: user.id, role: "owner" });
      db.days.push(...days);
      db.activities.push(...activities);
      db.saved.push(...saved);
      save();
      return trip;
    },
    async moveActivity(tripId, activeId, overId) {
      const user = assertEdit(tripId);
      const before = db.activities.find((activity) => activity.id === activeId && activity.tripId === tripId);
      if (!before) throw new RepoError("Activity not found.");
      const next = moveActivity(db.activities, activeId, overId);
      const after = next.find((activity) => activity.id === activeId);
      db.activities = next;
      if (after && before.dayId !== after.dayId) {
        snapshot(tripId, user, `${user.name} moved "${before.title}" to ${dayLabel(db.days, after.dayId)}.`);
      } else bump(tripId);
      save();
    },
    async createActivity(tripId, input: ActivityInput) {
      assertEdit(tripId);
      const siblings = db.activities.filter((activity) => activity.dayId === input.dayId);
      const activity: Activity = {
        id: nid("act"),
        tripId,
        dayId: input.dayId,
        placeId: input.placeId,
        title: input.title,
        startTime: input.startTime,
        duration: input.duration,
        position: siblings.length ? Math.max(...siblings.map((item) => item.position)) + 1 : 0,
        note: input.note ?? "",
        plannedCost: input.plannedCost ?? 0,
        actualCost: input.actualCost ?? null,
        status: "planned",
      };
      db.activities.push(activity);
      save();
      return activity;
    },
    async updateActivity(tripId, activityId, patch) {
      assertEdit(tripId);
      const activity = db.activities.find((item) => item.id === activityId && item.tripId === tripId);
      if (!activity) throw new RepoError("Activity not found.");
      Object.assign(activity, patch, { id: activity.id, tripId });
      save();
      return activity;
    },
    async deleteActivity(tripId, activityId) {
      assertEdit(tripId);
      db.activities = db.activities.filter((item) => item.id !== activityId);
      db.comments = db.comments.filter((item) => item.activityId !== activityId);
      save();
    },
    async commitActivities(tripId, activities, eventBody) {
      const user = assertEdit(tripId);
      if (activities.some((activity) => activity.tripId !== tripId)) throw new RepoError("Invalid activity.");
      db.activities = [...db.activities.filter((activity) => activity.tripId !== tripId), ...activities];
      snapshot(tripId, user, eventBody || `${user.name} updated the itinerary.`);
      save();
    },
    async savePlace(tripId, placeId) {
      assertEdit(tripId);
      if (!placeById(placeId)) throw new RepoError("Unknown place.");
      const existing = db.saved.find((item) => item.tripId === tripId && item.placeId === placeId);
      if (existing) return existing;
      const saved: SavedPlace = { id: nid("save"), tripId, placeId, note: "", priority: "nice" };
      db.saved.push(saved);
      save();
      return saved;
    },
    async unsavePlace(tripId, placeId) {
      assertEdit(tripId);
      db.saved = db.saved.filter((item) => !(item.tripId === tripId && item.placeId === placeId));
      save();
    },
    async createBooking(tripId, input: BookingInput) {
      assertEdit(tripId);
      const booking: Booking = {
        id: nid("book"),
        tripId,
        type: input.type,
        title: input.title,
        reference: input.reference,
        startAt: input.startAt,
        notes: input.notes ?? "",
        attachmentUrl: input.attachmentUrl ?? null,
        attachmentName: input.attachmentName ?? null,
        barcodeValue: input.barcodeValue ?? null,
        barcodeType: input.barcodeType ?? "qr",
      };
      db.bookings.push(booking);
      save();
      return booking;
    },
    async deleteBooking(tripId, bookingId) {
      assertEdit(tripId);
      db.bookings = db.bookings.filter((item) => item.id !== bookingId);
      save();
    },
    async createExpense(tripId, input: ExpenseInput) {
      assertEdit(tripId);
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
        participantId: input.participantId ?? input.paidBy,
      };
      db.expenses.push(expense);
      input.shares.forEach((share) => {
        db.shares.push({ id: nid("share"), expenseId: expense.id, tripId, userId: share.userId, amount: share.amount, participantId: share.participantId ?? share.userId });
      });
      save();
      return expense;
    },
    async deleteExpense(tripId, expenseId) {
      assertEdit(tripId);
      db.expenses = db.expenses.filter((item) => item.id !== expenseId);
      db.shares = db.shares.filter((item) => item.expenseId !== expenseId);
      save();
    },
    async addComment(tripId, activityId, body) {
      const user = assertEdit(tripId);
      const activity = db.activities.find((item) => item.id === activityId && item.tripId === tripId);
      if (!activity) throw new RepoError("Activity not found.");
      const comment: Comment = { id: nid("c"), activityId, tripId, userId: user.id, body: body.trim(), createdAt: new Date().toISOString() };
      db.comments.push(comment);
      save();
      return comment;
    },
    async setMemberRole(tripId, userId, role) {
      assertOwner(tripId);
      const member = db.members.find((item) => item.tripId === tripId && item.userId === userId);
      if (!member) throw new RepoError("That person isn't on this trip.");
      if (member.role === "owner" || role === "owner") throw new RepoError("The owner role stays put.");
      member.role = role;
      save();
    },
    async createInvite(tripId, role) {
      const user = assertEdit(tripId);
      const invite: TripInvite = {
        id: nid("inv"),
        tripId,
        token: nid("tok").replace(/^tok_/, ""),
        role,
        createdBy: user.id,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        maxUses: 20,
        usedCount: 0,
      };
      db.invites.push(invite);
      save();
      return invite;
    },
    async moveSavedPlaceToDay(tripId, placeId, dayId) {
      assertEdit(tripId);
      const place = placeById(placeId);
      if (!place) throw new RepoError("Unknown place.");
      const siblings = db.activities.filter((activity) => activity.dayId === dayId);
      const activity: Activity = {
        id: nid("act"),
        tripId,
        dayId,
        placeId,
        title: place.name,
        startTime: "10:00",
        duration: place.durationMin,
        position: siblings.length ? Math.max(...siblings.map((item) => item.position)) + 1 : 0,
        note: "",
        plannedCost: 0,
        actualCost: null,
        status: "planned",
      };
      const next = moveSavedPlaceToDay({ activities: db.activities, saved: db.saved, tripId, placeId, activity });
      if (!next) throw new RepoError("That place is not in Ideas.");
      db.activities = next.activities;
      db.saved = next.saved;
      bump(tripId);
      save();
      return activity;
    },
    async moveActivityToIdeas(tripId, activityId) {
      assertEdit(tripId);
      const next = moveActivityToIdeas({ activities: db.activities, saved: db.saved, tripId, activityId, savedId: nid("save") });
      if (!next) throw new RepoError("Activity not found.");
      db.activities = next.activities;
      db.saved = next.saved;
      bump(tripId);
      save();
    },
    async listSnapshots(tripId) {
      db = read();
      return db.snapshots.filter((item) => item.tripId === tripId);
    },
    async restoreSnapshot(tripId, snapshotId) {
      const user = assertEdit(tripId);
      const snap = db.snapshots.find((item) => item.id === snapshotId && item.tripId === tripId);
      if (!snap) throw new RepoError("That version is gone.");
      db.activities = [...db.activities.filter((item) => item.tripId !== tripId), ...snap.activities.map((item) => ({ ...item }))];
      db.saved = [...db.saved.filter((item) => item.tripId !== tripId), ...snap.saved.map((item) => ({ ...item }))];
      snapshot(tripId, user, `${user.name} restored a previous version.`);
      save();
    },
    async votePlace(tripId, placeId, vote) {
      const user = requireUser();
      if (!roleOf(tripId, user.id)) throw new RepoError("You need to be on this trip.");
      const existing = db.votes.find((item) => item.tripId === tripId && item.placeId === placeId && item.userId === user.id);
      if (existing?.vote === vote) db.votes = db.votes.filter((item) => item !== existing);
      else if (existing) existing.vote = vote;
      else db.votes.push({ id: nid("vote"), tripId, placeId, userId: user.id, vote });
      save();
    },
    async setPlacePriority(tripId, placeId, priority) {
      assertEdit(tripId);
      const saved = db.saved.find((item) => item.tripId === tripId && item.placeId === placeId);
      if (!saved) throw new RepoError("Save the place first.");
      saved.priority = priority;
      save();
    },
    async addParticipant(tripId, name) {
      assertEdit(tripId);
      const participant: Participant = { id: nid("part"), tripId, name: name.trim() || "Traveler", userId: null };
      db.participants.push(participant);
      save();
      return participant;
    },
    async removeParticipant(tripId, participantId) {
      assertEdit(tripId);
      db.participants = db.participants.filter((item) => item.id !== participantId);
      save();
    },
    async setFxRate(tripId, currency, rate) {
      assertEdit(tripId);
      const trip = db.trips.find((item) => item.id === tripId);
      if (!trip) throw new RepoError("Trip not found.");
      trip.fxRates = { ...trip.fxRates, [currency]: rate };
      save();
    },
    async search(query) {
      const user = requireUser();
      const q = query.trim().toLowerCase();
      const mine = new Set(db.members.filter((member) => member.userId === user.id).map((member) => member.tripId));
      const trips = db.trips.filter((trip) => mine.has(trip.id) && `${trip.title} ${trip.destination}`.toLowerCase().includes(q));
      const activities = db.activities
        .filter((activity) => mine.has(activity.tripId) && activity.title.toLowerCase().includes(q))
        .slice(0, 8)
        .map((activity) => {
          const trip = db.trips.find((item) => item.id === activity.tripId)!;
          return { activity, trip, dayLabel: dayLabel(db.days, activity.dayId) };
        });
      return {
        places: places.filter((place) => place.name.toLowerCase().includes(q)).slice(0, 6),
        trips: trips.slice(0, 6),
        activities,
      };
    },
    async listEvents(tripId) {
      return db.events.filter((event) => event.tripId === tripId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };

  return api;
}
