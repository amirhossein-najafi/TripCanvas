export type Role = "owner" | "editor" | "viewer";

export type PlaceCategory =
  | "food"
  | "cafe"
  | "park"
  | "shrine"
  | "shopping"
  | "museum"
  | "sight"
  | "hotel"
  | "activity";

export type User = {
  id: string;
  name: string;
  email: string;
  avatar: string;
};

export type Destination = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  zoom: number;
  timezone: string;
  blurb: string;
};

export type Trip = {
  id: string;
  ownerId: string;
  title: string;
  destination: string;
  destinationId: string;
  startDate: string;
  endDate: string;
  coverImage: string;
  currency: string;
  timezone: string;
  slug: string;
  isPublic: boolean;
  budgetAmount: number;
  travelerCount: number;
  centerLat: number;
  centerLng: number;
  revision: number;
  /** How many units of the trip currency equal 1 unit of the key currency. */
  fxRates: Record<string, number>;
};

export type TripMember = {
  tripId: string;
  userId: string;
  role: Role;
};

export type Day = {
  id: string;
  tripId: string;
  date: string;
  note: string;
};

export type Place = {
  id: string;
  destinationId: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  category: PlaceCategory;
  image: string;
  rating: number;
  durationMin: number;
  indoor: boolean;
  about: string;
  openHour: number;
  closeHour: number;
};

export type ActivityStatus = "planned" | "done" | "skipped";

export type Activity = {
  id: string;
  tripId: string;
  dayId: string;
  placeId: string | null;
  title: string;
  startTime: string;
  duration: number;
  position: number;
  note: string;
  plannedCost: number;
  actualCost: number | null;
  status: ActivityStatus;
};

export type PlacePriority = "must" | "nice" | "skip";

export type SavedPlace = {
  id: string;
  tripId: string;
  placeId: string;
  note: string;
  priority: PlacePriority;
};

export type BookingType = "flight" | "hotel" | "ticket" | "train" | "other";

export type BarcodeType = "qr" | "code128";

export type Booking = {
  id: string;
  tripId: string;
  type: BookingType;
  title: string;
  reference: string;
  startAt: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  notes: string;
  barcodeValue: string | null;
  barcodeType: BarcodeType;
};

export type ExpenseCategory = "Hotel" | "Food" | "Transport" | "Activities" | "Shopping";

export type Expense = {
  id: string;
  tripId: string;
  title: string;
  amount: number;
  plannedAmount: number;
  category: ExpenseCategory;
  paidBy: string;
  activityId: string | null;
  currency: string;
  participantId: string | null;
};

export type ExpenseShare = {
  id: string;
  expenseId: string;
  tripId: string;
  userId: string;
  amount: number;
  participantId: string | null;
};

export type Comment = {
  id: string;
  activityId: string;
  tripId: string;
  userId: string;
  body: string;
  createdAt: string;
};

export type ActivityEvent = {
  id: string;
  tripId: string;
  userId: string;
  body: string;
  createdAt: string;
};

export type MemberProfile = TripMember & { user: User };

export type TripInvite = {
  id: string;
  tripId: string;
  token: string;
  role: Exclude<Role, "owner">;
  createdBy: string;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
};

export type Participant = {
  id: string;
  tripId: string;
  name: string;
  userId: string | null;
};

export type PlaceVoteValue = "up" | "down";

export type PlaceVote = {
  id: string;
  tripId: string;
  placeId: string;
  userId: string;
  vote: PlaceVoteValue;
};

export type TripSnapshot = {
  id: string;
  tripId: string;
  revision: number;
  label: string;
  createdAt: string;
  activities: Activity[];
  saved: SavedPlace[];
};

export type PublicTrip = {
  id: string;
  title: string;
  destination: string;
  destinationId: string;
  startDate: string;
  endDate: string;
  coverImage: string;
  timezone: string;
  slug: string;
  centerLat: number;
  centerLng: number;
};

export type PublicActivity = {
  id: string;
  dayId: string;
  placeId: string | null;
  title: string;
  startTime: string;
  duration: number;
  position: number;
};

export type PublicTripBundle = {
  trip: PublicTrip;
  days: Day[];
  activities: PublicActivity[];
  places: Place[];
  owner: { name: string; avatar: string };
};

export type TripBundle = {
  trip: Trip;
  members: MemberProfile[];
  days: Day[];
  activities: Activity[];
  saved: SavedPlace[];
  bookings: Booking[];
  expenses: Expense[];
  shares: ExpenseShare[];
  comments: Comment[];
  events: ActivityEvent[];
  places: Place[];
  invites: TripInvite[];
  participants: Participant[];
  votes: PlaceVote[];
  snapshots: TripSnapshot[];
};

export type SearchResults = {
  places: Place[];
  trips: Trip[];
  activities: { activity: Activity; trip: Trip; dayLabel: string }[];
};

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Hotel",
  "Food",
  "Transport",
  "Activities",
  "Shopping",
];

export const DAY_COLORS = ["#e25b45", "#3d7a62", "#3d6f8c", "#c4841d", "#7b5ea7", "#c45c78", "#4d7c6b"];
