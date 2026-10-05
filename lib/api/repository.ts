import type {
  Activity,
  ActivityEvent,
  Booking,
  Comment,
  Expense,
  ExpenseCategory,
  ExpenseShare,
  Participant,
  PlacePriority,
  PlaceVoteValue,
  PublicTripBundle,
  Role,
  SavedPlace,
  SearchResults,
  Trip,
  TripBundle,
  TripInvite,
  TripSnapshot,
  User,
} from "@/types";

export class RepoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepoError";
  }
}

export type TripInput = {
  title: string;
  destinationId: string;
  startDate: string;
  endDate: string;
  travelerCount: number;
  budgetAmount?: number;
  currency?: string;
};

export type ActivityInput = {
  dayId: string;
  placeId: string | null;
  title: string;
  startTime: string;
  duration: number;
  note?: string;
  plannedCost?: number;
  actualCost?: number | null;
};

export type BookingInput = {
  type: Booking["type"];
  title: string;
  reference: string;
  startAt: string;
  notes?: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  barcodeValue?: string | null;
  barcodeType?: Booking["barcodeType"];
};

export type ExpenseInput = {
  title: string;
  amount: number;
  plannedAmount: number;
  category: ExpenseCategory;
  paidBy: string;
  shares: { userId: string; amount: number; participantId?: string | null }[];
  activityId?: string | null;
  currency?: string;
  participantId?: string | null;
};

export interface Repository {
  mode: "local" | "supabase";
  signIn(email: string, password: string): Promise<User>;
  signUp(name: string, email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  currentUser(): Promise<User | null>;
  listTrips(): Promise<Trip[]>;
  getBundle(tripId: string): Promise<TripBundle | null>;
  getPublicBundle(slug: string): Promise<PublicTripBundle | null>;
  getBySlug(slug: string): Promise<Trip | null>;
  createTrip(input: TripInput): Promise<Trip>;
  updateTrip(tripId: string, patch: Partial<Pick<Trip, "title" | "budgetAmount" | "currency" | "travelerCount" | "isPublic" | "startDate" | "endDate" | "coverImage">>): Promise<Trip>;
  deleteTrip(tripId: string): Promise<void>;
  loadTokyoSample(): Promise<Trip>;
  joinTrip(slug: string): Promise<Trip>;
  duplicateTrip(slug: string): Promise<Trip>;
  moveActivity(tripId: string, activeId: string, overId: string): Promise<void>;
  createActivity(tripId: string, input: ActivityInput): Promise<Activity>;
  updateActivity(tripId: string, activityId: string, patch: Partial<Activity>): Promise<Activity>;
  deleteActivity(tripId: string, activityId: string): Promise<void>;
  commitActivities(tripId: string, activities: Activity[], eventBody?: string): Promise<void>;
  savePlace(tripId: string, placeId: string): Promise<SavedPlace>;
  unsavePlace(tripId: string, placeId: string): Promise<void>;
  createBooking(tripId: string, input: BookingInput): Promise<Booking>;
  deleteBooking(tripId: string, bookingId: string): Promise<void>;
  createExpense(tripId: string, input: ExpenseInput): Promise<Expense>;
  deleteExpense(tripId: string, expenseId: string): Promise<void>;
  addComment(tripId: string, activityId: string, body: string): Promise<Comment>;
  setMemberRole(tripId: string, userId: string, role: Role): Promise<void>;
  search(query: string): Promise<SearchResults>;
  listEvents(tripId: string): Promise<ActivityEvent[]>;
  createInvite(tripId: string, role: Exclude<Role, "owner">): Promise<TripInvite>;
  moveSavedPlaceToDay(tripId: string, placeId: string, dayId: string): Promise<Activity>;
  moveActivityToIdeas(tripId: string, activityId: string): Promise<void>;
  listSnapshots(tripId: string): Promise<TripSnapshot[]>;
  restoreSnapshot(tripId: string, snapshotId: string): Promise<void>;
  votePlace(tripId: string, placeId: string, vote: PlaceVoteValue): Promise<void>;
  setPlacePriority(tripId: string, placeId: string, priority: PlacePriority): Promise<void>;
  addParticipant(tripId: string, name: string): Promise<Participant>;
  removeParticipant(tripId: string, participantId: string): Promise<void>;
  setFxRate(tripId: string, currency: string, rate: number): Promise<void>;
}

export type { ExpenseShare };
