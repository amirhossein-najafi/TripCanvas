export type InviteRecord = {
  token: string;
  tripId: string;
  role: "editor" | "viewer";
  expiresAt: string;
  maxUses: number;
  usedCount: number;
};

export type JoinTrip = { id: string; slug: string; isPublic: boolean };
export type JoinMember = { tripId: string; userId: string };

export type JoinResult =
  | { ok: true; tripId: string; role: "editor" | "viewer" | "existing"; inviteToken: string | null }
  | { ok: false; reason: string };

/** Token first. A slug only joins when the trip is already public. */
export function resolveJoin(input: {
  tokenOrSlug: string;
  userId: string;
  now: string;
  invites: InviteRecord[];
  trips: JoinTrip[];
  members: JoinMember[];
}): JoinResult {
  const invite = input.invites.find((item) => item.token === input.tokenOrSlug);
  if (invite) {
    if (invite.expiresAt < input.now) return { ok: false, reason: "That invite has expired." };
    const already = input.members.some((member) => member.tripId === invite.tripId && member.userId === input.userId);
    if (!already && invite.usedCount >= invite.maxUses) return { ok: false, reason: "That invite has been used up." };
    return { ok: true, tripId: invite.tripId, role: already ? "existing" : invite.role, inviteToken: invite.token };
  }
  const trip = input.trips.find((item) => item.slug === input.tokenOrSlug);
  if (!trip || !trip.isPublic) return { ok: false, reason: "That invite link doesn't match a trip." };
  const already = input.members.some((member) => member.tripId === trip.id && member.userId === input.userId);
  return { ok: true, tripId: trip.id, role: already ? "existing" : "viewer", inviteToken: null };
}
