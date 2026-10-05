import { destinations, placesFor } from "@/lib/catalog";
import { nid } from "@/lib/utils";
import type { Activity, ActivityEvent, Booking, Comment, Day, Expense, ExpenseShare, SavedPlace, Trip, TripMember, User } from "@/types";

export const DEMO_PASSWORD = "demo";

export type StoredUser = User & { password: string };

export const demoUsers: StoredUser[] = [
  { id: "user-ali", name: "Ali", email: "ali@tripcanvas.app", avatar: "A", password: DEMO_PASSWORD },
  { id: "user-sara", name: "Sara", email: "sara@tripcanvas.app", avatar: "S", password: DEMO_PASSWORD },
  { id: "user-reza", name: "Reza", email: "reza@tripcanvas.app", avatar: "R", password: DEMO_PASSWORD },
];

export function buildTokyoSample(owner: User, options?: { stable?: boolean; withCollaborators?: boolean }) {
  const stable = options?.stable ?? false;
  const id = (prefix: string, stableId: string) => (stable ? stableId : nid(prefix));
  const destination = destinations[0];
  const tripId = id("trip", "trip_tokyo");
  const trip: Trip = {
    id: tripId,
    ownerId: owner.id,
    title: "Tokyo",
    destination: "Tokyo",
    destinationId: "tokyo",
    startDate: "2027-03-12",
    endDate: "2027-03-17",
    coverImage: "https://picsum.photos/seed/tokyo-trip/1400/900",
    currency: "USD",
    timezone: destination.timezone,
    slug: stable ? "tokyo-2027" : `tokyo-${nid("s").slice(-4)}`,
    isPublic: true,
    budgetAmount: 1500,
    travelerCount: 2,
    centerLat: destination.lat,
    centerLng: destination.lng,
    revision: 0,
    fxRates: { JPY: 0.0067, EUR: 1.08 },
  };

  const dates = ["2027-03-12", "2027-03-13", "2027-03-14", "2027-03-15", "2027-03-16", "2027-03-17"];
  const dayIds = dates.map((date, index) => id("day", `day_${index + 1}_${date}`));
  const days: Day[] = dates.map((date, index) => ({
    id: dayIds[index],
    tripId,
    date,
    note: ["Shibuya", "Asakusa", "Toyosu & Odaiba", "Disney", "Shinjuku", "Departure"][index],
  }));

  const act = (
    stableId: string,
    dayIndex: number,
    placeId: string | null,
    title: string,
    startTime: string,
    duration: number,
    position: number,
    plannedCost = 0,
    actualCost: number | null = null,
    note = "",
  ): Activity => ({
    id: id("act", stableId),
    tripId,
    dayId: dayIds[dayIndex],
    placeId,
    title,
    startTime,
    duration,
    position,
    note,
    plannedCost,
    actualCost,
    status: "planned",
  });

  const towerId = id("act", "act_tower");
  const activities: Activity[] = [
    act("act_breakfast", 0, "starbucks-shibuya", "Breakfast", "08:30", 45, 0, 12, 12),
    act("act_meiji", 0, "meiji", "Meiji Shrine", "11:00", 90, 1),
    act("act_harajuku", 0, "harajuku", "Harajuku", "14:00", 90, 2, 40, 40, "Shopping"),
    act("act_hotel", 0, "hyatt", "Check in", "19:30", 40, 3),
    act("act_sensoji", 1, "sensoji", "Sensō-ji", "10:00", 80, 0),
    act("act_skytree", 1, "skytree", "Tokyo Skytree", "13:30", 80, 1),
    act("act_tower", 1, "tokyo-tower", "Tokyo Tower", "18:00", 75, 2, 20, null, "Sunset if the sky is clear."),
    act("act_teamlab", 2, "teamlab", "teamLab Planets", "10:30", 90, 0, 35, 35),
    act("act_lunch", 2, "toyosu", "Lunch", "13:00", 70, 1, 22, 22),
    act("act_odaiba", 2, "odaiba", "Odaiba", "15:30", 80, 2),
    act("act_dinner", 2, "odaiba-dinner", "Dinner", "19:00", 80, 3, 30, 24),
    act("act_disney", 3, "disney", "Tokyo DisneySea", "09:00", 420, 0, 90, 90),
    act("act_gyoen", 4, "gyoen", "Shinjuku Gyoen", "10:00", 90, 0),
    act("act_leave", 5, null, "Departure", "09:30", 120, 0, 0, null, "Haneda. Leave the hotel by 9."),
  ];

  const saved: SavedPlace[] = ["sushi-dai", "mori", "ueno", "glitch"].map((placeId, index) => ({
    id: id("save", `save_${index}`),
    tripId,
    placeId,
    note: "",
    priority: index === 0 ? "must" : "nice",
  }));

  const collaborators = options?.withCollaborators ?? stable;
  const members: TripMember[] = [{ tripId, userId: owner.id, role: "owner" }];
  if (collaborators) {
    if (!members.some((member) => member.userId === "user-sara")) members.push({ tripId, userId: "user-sara", role: "editor" });
    if (!members.some((member) => member.userId === "user-reza")) members.push({ tripId, userId: "user-reza", role: "viewer" });
  }

  const bookings: Booking[] = [
    {
      id: id("book", "book_flight"),
      tripId,
      type: "flight",
      title: "Tehran → Tokyo",
      reference: "TK875",
      startAt: "2027-03-12T08:10:00",
      attachmentUrl: null,
      attachmentName: null,
      notes: "Window seat if the app lets you pick one.",
      barcodeValue: "TK875",
      barcodeType: "qr",
    },
    {
      id: id("book", "book_hotel"),
      tripId,
      type: "hotel",
      title: "Park Hyatt Tokyo",
      reference: "PH-2041",
      startAt: "2027-03-12T15:00:00",
      attachmentUrl: null,
      attachmentName: null,
      notes: "5 nights. Late check-in confirmed.",
      barcodeValue: "PH-2041",
      barcodeType: "qr",
    },
    {
      id: id("book", "book_ticket"),
      tripId,
      type: "ticket",
      title: "teamLab Planets",
      reference: "TL-8831",
      startAt: "2027-03-14T10:30:00",
      attachmentUrl: null,
      attachmentName: null,
      notes: "Timed entry. Arrive 15 minutes early.",
      barcodeValue: "TL-8831",
      barcodeType: "qr",
    },
  ];

  const expense = (
    stableId: string,
    title: string,
    amount: number,
    plannedAmount: number,
    category: Expense["category"],
    paidBy: string,
    shares: { userId: string; amount: number }[],
  ): { expense: Expense; shares: ExpenseShare[] } => {
    const expenseId = id("exp", stableId);
    return {
      expense: { id: expenseId, tripId, title, amount, plannedAmount, category, paidBy, activityId: null, currency: "USD", participantId: paidBy },
      shares: shares.map((share, index) => ({
        id: id("share", `${stableId}_${index}`),
        expenseId,
        tripId,
        userId: share.userId,
        amount: share.amount,
        participantId: share.userId,
      })),
    };
  };

  const ali = owner.id;
  const sara = "user-sara";
  const reza = "user-reza";
  const built = collaborators
    ? [
        expense("hotel", "Park Hyatt Tokyo", 420, 450, "Hotel", ali, [{ userId: ali, amount: 420 }]),
        expense("breakfasts", "Breakfasts", 64, 64, "Food", ali, [{ userId: ali, amount: 64 }]),
        expense("ichiran", "Dinner", 24, 30, "Food", ali, [{ userId: ali, amount: 24 }]),
        expense("group-dinner", "Group dinner", 72, 72, "Food", ali, [
          { userId: ali, amount: 24 },
          { userId: sara, amount: 24 },
          { userId: reza, amount: 24 },
        ]),
        expense("transit", "Suica & airport", 95, 95, "Transport", ali, [{ userId: ali, amount: 95 }]),
        expense("solo-activities", "Shrines & gardens", 35, 35, "Activities", ali, [{ userId: ali, amount: 35 }]),
        expense("tickets", "Museum tickets", 90, 90, "Activities", ali, [
          { userId: ali, amount: 53 },
          { userId: sara, amount: 30 },
          { userId: reza, amount: 7 },
        ]),
        expense("shopping", "Harajuku", 60, 70, "Shopping", ali, [{ userId: ali, amount: 60 }]),
      ]
    : [expense("hotel", "Hotel", 420, 450, "Hotel", ali, [{ userId: ali, amount: 420 }])];

  const now = "2027-03-01T09:00:00.000Z";
  const comments: Comment[] = collaborators
    ? [
        { id: id("c", "c1"), activityId: towerId, tripId, userId: "user-sara", body: "Let's do this at sunset.", createdAt: now },
        { id: id("c", "c2"), activityId: towerId, tripId, userId: ali, body: "18:00?", createdAt: "2027-03-01T09:12:00.000Z" },
        { id: id("c", "c3"), activityId: towerId, tripId, userId: "user-reza", body: "I'll book the tickets.", createdAt: "2027-03-01T09:20:00.000Z" },
      ]
    : [];

  const events: ActivityEvent[] = collaborators
    ? [
        {
          id: id("evt", "evt1"),
          tripId,
          userId: "user-sara",
          body: `Sara moved "Tokyo Tower" to Day 2.`,
          createdAt: "2027-02-20T14:00:00.000Z",
        },
      ]
    : [];

  return {
    trip,
    members,
    days,
    activities,
    saved,
    bookings,
    expenses: built.map((item) => item.expense),
    shares: built.flatMap((item) => item.shares),
    comments,
    events,
    places: placesFor("tokyo"),
  };
}
