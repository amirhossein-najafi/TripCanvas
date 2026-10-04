"use client";

import { Command } from "cmdk";
import { useTheme } from "next-themes";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { getRepository } from "@/lib/api";
import { useUi } from "@/store/ui-store";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const { user } = useSession();
  const setExplorer = useUi((state) => state.setExplorerOpen);
  const tripId = pathname.match(/^\/trips\/(?!new$)([^/]+)/)?.[1];
  const search = useQuery({
    queryKey: ["search", query, user?.id],
    enabled: open && query.trim().length > 1 && Boolean(user),
    queryFn: () => getRepository().search(query.trim()),
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(path: string) {
    setOpen(false);
    setQuery("");
    router.push(path);
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      shouldFilter={false}
      vimBindings={false}
      overlayClassName="fixed inset-0 z-[60] bg-black/40"
      contentClassName="modal-pop fixed top-[18vh] left-1/2 z-[61] w-[min(560px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-[18px] border border-border bg-card shadow-[var(--shadow)]"
    >
      <Command.Input value={query} onValueChange={setQuery} placeholder="Search..." className="h-12 w-full border-b border-border bg-transparent px-4 outline-none" />
      <Command.List className="max-h-80 overflow-auto p-2">
        <Command.Empty className="px-3 py-6 text-sm text-muted">No matches.</Command.Empty>
        {!query && (
          <Command.Group heading="Actions" className="text-xs text-muted">
            <Item onSelect={() => go("/")}>Create new trip</Item>
            {tripId && <Item onSelect={() => { setExplorer(true); setOpen(false); }}>Add place</Item>}
            {tripId && <Item onSelect={() => go(`/trips/${tripId}/bookings`)}>Go to bookings</Item>}
            <Item onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>Toggle dark mode</Item>
          </Command.Group>
        )}
        {search.data && (
          <>
            <Group title="Places" items={search.data.places.map((place) => ({ id: place.id, label: place.name, href: tripId ? `/trips/${tripId}/itinerary?place=${place.id}` : `/?q=${place.name}` }))} go={go} />
            <Group title="Trips" items={search.data.trips.map((trip) => ({ id: trip.id, label: `${trip.title} · ${trip.destination}`, href: `/trips/${trip.id}/itinerary` }))} go={go} />
            <Group title="Activities" items={search.data.activities.map((item) => ({ id: item.activity.id, label: `${item.activity.title} · ${item.dayLabel}`, href: `/trips/${item.trip.id}/itinerary` }))} go={go} />
          </>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

function Item({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return <Command.Item onSelect={onSelect} className="cursor-pointer rounded-xl px-3 py-2 text-sm text-foreground data-[selected=true]:bg-foreground/5">{children}</Command.Item>;
}

function Group({ title, items, go }: { title: string; items: { id: string; label: string; href: string }[]; go: (href: string) => void }) {
  if (!items.length) return null;
  return (
    <Command.Group heading={title} className="mt-2 text-xs tracking-wide text-muted uppercase">
      {items.map((item) => <Item key={item.id} onSelect={() => go(item.href)}>{item.label}</Item>)}
    </Command.Group>
  );
}
