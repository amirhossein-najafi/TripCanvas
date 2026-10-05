"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MapStage } from "@/components/map/map-stage";
import { PlaceDrawer } from "@/components/places/place-drawer";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/panel";
import { PresenceProvider, useTripPresence } from "@/features/collaboration/use-presence";
import { getRepository } from "@/lib/api";
import { useSession } from "@/features/auth/session";
import { useTripParams } from "@/features/trips/use-trip-params";
import { TripProvider, useTrip } from "@/features/trips/trip-provider";
import { placeById } from "@/lib/catalog";
import { formatRange, tripLengthLabel } from "@/lib/dates";
import { useViewport } from "@/lib/use-viewport";
import { toast } from "sonner";

export function TripFrame({ tripId, children }: { tripId: string; children: React.ReactNode }) {
  return (
    <TripProvider tripId={tripId}>
      <TripShell>{children}</TripShell>
    </TripProvider>
  );
}

function TripShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready } = useSession();
  const { bundle, isLoading, isError, refetch } = useTrip();
  const mode = useViewport();
  const bare = pathname.endsWith("/travel") || pathname.endsWith("/story");
  const mapRoute = pathname.endsWith("/map");

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, router, pathname]);

  useEffect(() => {
    if (bundle) document.title = `${bundle.trip.destination} · TripCanvas`;
  }, [bundle]);

  if (!ready || isLoading) {
    return (
      <div className="grid h-dvh place-items-center">
        <div className="w-72 space-y-3">
          <div className="skeleton h-8" />
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
      </div>
    );
  }
  if (isError || !bundle) {
    return (
      <div className="grid h-dvh place-items-center px-6 text-center">
        <div>
          <p className="font-serif text-3xl font-semibold">We couldn&apos;t open this trip.</p>
          <p className="mt-2 text-muted">Your other trips are safe.</p>
          <Button className="mt-4" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }
  if (bare) return <>{children}</>;

  return (
    <PresenceProvider tripId={bundle.trip.id} user={user}>
    <div className="flex h-dvh flex-col bg-background">
      <TripHeader />
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(380px,480px)_minmax(0,1fr)]">
        {!(mapRoute && mode !== "desktop") && (
          <div className={`h-full min-h-0 overflow-hidden ${mapRoute ? "hidden" : ""}`}>{children}</div>
        )}
        {mode === "desktop" && (
          <div className={`h-full min-h-0 ${mapRoute ? "lg:col-span-2" : ""}`}>
            <MapStage />
          </div>
        )}
        {mapRoute && mode !== "desktop" && <div className="min-h-0">{children}</div>}
      </div>
      <TripTabs />
      <PlacePortal />
      <ShortcutKeys />
    </div>
    </PresenceProvider>
  );
}

function TripHeader() {
  const { bundle, role } = useTrip();
  const { onlineIds, peers, publish } = useTripPresence();
  useEffect(() => {
    const onMove = (event: PointerEvent) => publish({ cursor: { x: event.clientX + 12, y: event.clientY + 12, surface: "app" } });
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [publish]);
  const [share, setShare] = useState(false);
  if (!bundle) return null;
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-3">
      <Link href="/trips" className="font-serif text-xl font-semibold">TripCanvas</Link>
      <p className="hidden text-sm text-muted sm:block">{bundle.trip.destination} · {tripLengthLabel(bundle.trip.startDate, bundle.trip.endDate)}</p>
      <div className="ml-auto flex items-center gap-2">
        <div className="flex -space-x-2">
          {bundle.members.map((member) => (
            <span key={member.userId} title={`${member.user.name} · ${member.role}`} className={`grid h-8 w-8 place-items-center rounded-full border-2 border-card bg-foreground text-xs text-background ${onlineIds.includes(member.userId) ? "ring-2 ring-secondary" : ""}`}>
              {member.user.avatar || member.user.name.slice(0, 1)}
            </span>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => setShare(true)}>Share</Button>
        <MoreMenu />
        {role === "viewer" && <span className="text-xs text-muted">Viewing</span>}
      </div>
      <ShareDialog open={share} onClose={() => setShare(false)} />
      <PeerCursors peers={peers} />
      <SyncNote />
    </header>
  );
}

function MoreMenu() {
  const { tripId } = useTrip();
  const { href } = useTripParams();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/5" aria-label="More">•••</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="modal-pop z-40 min-w-48 rounded-2xl border border-border bg-card p-1 shadow-[var(--shadow)]">
          <Dropdown.Item asChild><Link className="block rounded-xl px-3 py-2 text-sm outline-none hover:bg-foreground/5" href={href(`/trips/${tripId}/travel`)}>Travel mode</Link></Dropdown.Item>
          <Dropdown.Item asChild><Link className="block rounded-xl px-3 py-2 text-sm outline-none hover:bg-foreground/5" href={`/trips/${tripId}/story`}>Present trip</Link></Dropdown.Item>
          <Dropdown.Item asChild><Link className="block rounded-xl px-3 py-2 text-sm outline-none hover:bg-foreground/5" href={`/trips/${tripId}/recap`}>Trip recap</Link></Dropdown.Item>
          <Dropdown.Item asChild><Link className="block rounded-xl px-3 py-2 text-sm outline-none hover:bg-foreground/5" href={`/trips/${tripId}/itinerary?view=history`}>Version history</Link></Dropdown.Item>
          <Dropdown.Item asChild><Link className="block rounded-xl px-3 py-2 text-sm outline-none hover:bg-foreground/5" href={href(`/trips/${tripId}/settings`)}>Settings</Link></Dropdown.Item>
          <Dropdown.Item className="rounded-xl px-3 py-2 text-sm outline-none hover:bg-foreground/5" onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>Toggle dark mode</Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function ShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bundle, canEdit, actions, role } = useTrip();
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");
  const [token, setToken] = useState("");
  useEffect(() => {
    if (!open || !canEdit) return;
    let stop = false;
    getRepository().createInvite(bundle!.trip.id, inviteRole).then((invite) => {
      if (!stop) setToken(invite.token);
    }).catch(() => undefined);
    return () => { stop = true; };
  }, [open, canEdit, inviteRole, bundle?.trip.id]);
  if (!bundle) return null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const invite = token ? `${origin}/t/${token}` : "Creating a private invite…";
  const pub = `${origin}/p/${bundle.trip.slug}`;
  return (
    <Modal open={open} onClose={onClose} title="Share this trip">
      <p className="text-sm text-muted">Invite with a role. Editors can change the plan. Viewers can look. The link is a token, not the trip name.</p>
      {canEdit && (
        <label className="mt-3 block text-sm">
          Role
          <select className="mt-1 h-10 w-full rounded-xl bg-background px-3" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "viewer" | "editor")}>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
        </label>
      )}
      <CopyRow label="Invite link" value={invite} />
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={bundle.trip.isPublic} disabled={role !== "owner"} onChange={(event) => actions.updateTrip({ isPublic: event.target.checked })} />
        Public page
      </label>
      {bundle.trip.isPublic && <CopyRow label="Public page" value={pub} />}
      {!canEdit && <p className="mt-3 text-xs text-muted">You can view this trip, not change who joins.</p>}
    </Modal>
  );
}

function PeerCursors({ peers }: { peers: { id: string; name: string; cursor: { x: number; y: number } | null; drag: { title: string; x: number; y: number } | null }[] }) {
  return (
    <>
      {peers.map((peer) => (
        <div key={peer.id}>
          {peer.cursor && (
            <div className="pointer-events-none fixed z-50" style={{ left: peer.cursor.x, top: peer.cursor.y }}>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-white">{peer.name}</span>
            </div>
          )}
          {peer.drag && (
            <div className="pointer-events-none fixed z-50 rounded-2xl border border-border bg-card/80 px-3 py-2 text-sm shadow-[var(--shadow)]" style={{ left: peer.drag.x, top: peer.drag.y }}>
              {peer.name} · {peer.drag.title}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function SyncNote() {
  const { pendingSync, conflict, keepDeviceCopy, takeServerCopy } = useTrip();
  if (!pendingSync && !conflict) return null;
  return (
    <div className="fixed bottom-20 left-1/2 z-40 w-[min(440px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-[var(--shadow)]">
      {conflict ? (
        <div className="flex flex-wrap items-center gap-2">
          <p>This trip changed while you were offline.</p>
          <Button size="sm" onClick={keepDeviceCopy}>Keep mine</Button>
          <Button size="sm" variant="outline" onClick={() => takeServerCopy()}>Use server</Button>
        </div>
      ) : (
        <p>{pendingSync} change{pendingSync === 1 ? "" : "s"} waiting to sync.</p>
      )}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 flex gap-2">
        <code className="flex-1 truncate rounded-xl bg-background px-3 py-2 text-xs">{value}</code>
        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(value); toast("Link copied"); }}>Copy</Button>
      </div>
    </div>
  );
}

function TripTabs() {
  const { tripId } = useTrip();
  const pathname = usePathname();
  const { href } = useTripParams();
  const tabs = [
    ["Overview", `/trips/${tripId}`],
    ["Itinerary", `/trips/${tripId}/itinerary`],
    ["Budget", `/trips/${tripId}/budget`],
    ["Bookings", `/trips/${tripId}/bookings`],
  ] as const;
  return (
    <nav className="flex border-t border-border px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {tabs.map(([label, path]) => {
        const active = pathname === path;
        return (
          <Link key={path} href={href(path)} className="relative flex-1 py-2 text-center text-sm">
            {active && <motion.span layoutId="trip-tab" className="absolute inset-1 rounded-full bg-foreground/8" />}
            <span className="relative">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function PlacePortal() {
  const { bundle, canEdit, actions } = useTrip();
  const { placeId, day, patch } = useTripParams();
  if (!bundle) return null;
  const place = placeById(placeId) ?? bundle.places.find((item) => item.id === placeId) ?? null;
  const selected = bundle.days[day - 1] ?? bundle.days[0];
  const saved = bundle.saved.some((item) => item.placeId === place?.id);
  return (
    <PlaceDrawer
      place={place}
      city={bundle.trip.destination}
      timeZone={bundle.trip.timezone}
      saved={saved}
      canEdit={canEdit}
      onClose={() => patch({ place: null })}
      onAdd={() => {
        if (!place || !selected) return;
        const added = place;
        const target = selected;
        patch({ place: null });
        actions.createActivity({ dayId: target.id, placeId: added.id, title: added.name, startTime: "10:00", duration: added.durationMin }).then(() => toast(`Added to ${formatRange(target.date, target.date)}`)).catch(() => undefined);
      }}
      onSave={() => {
        if (!place) return;
        if (saved) actions.unsavePlace(place.id).catch(() => undefined);
        else actions.savePlace(place.id).catch(() => undefined);
      }}
    />
  );
}

function ShortcutKeys() {
  const { bundle } = useTrip();
  const { day, patch } = useTripParams();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (event.target as HTMLElement | null)?.isContentEditable) return;
      if (event.key === "Escape") patch({ place: null });
      if (!bundle) return;
      if (event.key === "ArrowRight") patch({ day: String(Math.min(bundle.days.length, day + 1)) });
      if (event.key === "ArrowLeft") patch({ day: String(Math.max(1, day - 1)) });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bundle, day, patch]);
  return null;
}
