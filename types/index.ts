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

export type SavedPlace = {
  id: string;
  tripId: string;
  placeId: string;
  note: string;
};

export type BookingType = "flight" | "hotel" | "ticket" | "train" | "other";

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
};

export type ExpenseShare = {
  id: string;
  expenseId: string;
  tripId: string;
  userId: string;
  amount: number;
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
