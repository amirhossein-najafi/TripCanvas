"use client";

import { motion, useMotionValue, useTransform } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { LandingMap } from "@/components/map/landing-map";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/session";
import { getRepository } from "@/lib/api";
import { destinations, searchDestinations } from "@/lib/catalog";
import type { Destination } from "@/types";
import { toast } from "sonner";

const SHOWCASE = [
  ["Plan", "Days, a timeline, and a board for the places you are not ready to schedule."],
  ["Map", "Numbered stops, a route per day, and the camera that follows the plan."],
  ["Budget", "Planned against actual, and who owes whom when the bill is shared."],
  ["Bookings", "Flights, hotels, tickets, and a full-screen code when you are at the door."],
  ["Collaborate", "Owners, editors, viewers, and a live note when someone moves a stop."],
];

export function HomePage() {
  const { user, ready } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const signedIn = mounted && ready && Boolean(user);
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Destination | null>(null);
  const [start, setStart] = useState("2027-03-12");
  const [end, setEnd] = useState("2027-03-17");
  const [travelers, setTravelers] = useState(2);
  const [busy, setBusy] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const shiftX = useTransform(x, [-0.5, 0.5], [-14, 14]);
  const shiftY = useTransform(y, [-0.5, 0.5], [-10, 10]);
  const results = useMemo(() => searchDestinations(query), [query]);
  const center: [number, number] = picked ? [picked.lng, picked.lat] : [139.65, 35.68];

  async function create() {
    if (!picked) return;
    const input = { title: picked.name, destinationId: picked.id, startDate: start, endDate: end, travelerCount: travelers, budgetAmount: 1500, currency: "USD" };
    if (!signedIn) {
      sessionStorage.setItem("tripcanvas.pending", JSON.stringify(input));
      router.push("/login?next=/continue");
      return;
    }
    setBusy(true);
    try {
      const trip = await getRepository().createTrip(input);
      router.push(`/trips/${trip.id}/itinerary`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the trip.");
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="absolute top-0 right-0 left-0 z-20 flex items-center justify-between px-5 py-4">
        <span className="font-serif text-xl font-semibold">TripCanvas</span>
        <div className="flex items-center gap-2">
          <button type="button" className="text-sm" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>Dark mode</button>
          <Link href={signedIn ? "/trips" : "/login"} className="rounded-full bg-foreground px-3 py-1.5 text-sm text-background">{signedIn ? "Your trips" : "Sign in"}</Link>
        </div>
      </header>
      <section
        className="relative min-h-dvh overflow-hidden"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          x.set((event.clientX - rect.left) / rect.width - 0.5);
          y.set((event.clientY - rect.top) / rect.height - 0.5);
        }}
      >
        <div className="absolute inset-0">
          <LandingMap center={center} zoom={picked?.zoom ?? 1.7} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/75 to-transparent" />
        <div className="relative z-10 grid min-h-dvh items-center gap-10 px-6 py-24 lg:grid-cols-[1.1fr_0.9fr] lg:px-16">
          <div>
            <h1 className="max-w-xl font-serif text-6xl leading-[0.95] font-semibold md:text-7xl">Plan less.<br />Experience more.</h1>
            <label className="mt-8 block max-w-xl">
              <span className="sr-only">Where do you want to go?</span>
              <input
                data-testid="destination-search"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPicked(null); }}
                placeholder="Where do you want to go?"
                className="h-16 w-full rounded-[18px] border border-border bg-card px-5 text-xl shadow-[var(--shadow)] outline-none"
              />
            </label>
            {query && !picked && (
              <div className="mt-2 max-h-80 max-w-xl overflow-auto rounded-2xl border border-border bg-card">
                {results.map((destination) => (
                  <button key={destination.id} type="button" data-testid={`destination-${destination.id}`} className="block w-full px-4 py-3 text-left hover:bg-foreground/5" onClick={() => { setPicked(destination); setQuery(destination.name); }}>
                    <span className="font-medium">{destination.name}</span>
                    <span className="ml-2 text-sm text-muted">{destination.country}</span>
                  </button>
                ))}
              </div>
            )}
            {picked && (
              <div className="mt-4 max-w-xl rounded-[18px] border border-border bg-card p-4 shadow-[var(--shadow)]">
                <p className="font-serif text-3xl font-semibold">{picked.name}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="h-10 rounded-xl bg-background px-3" />
                  <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="h-10 rounded-xl bg-background px-3" />
                  <input type="number" min={1} max={12} value={travelers} onChange={(event) => setTravelers(Number(event.target.value))} className="h-10 rounded-xl bg-background px-3" aria-label="Travelers" />
                </div>
                <p className="mt-2 text-sm text-muted">{travelers} travelers</p>
                <Button data-testid="create-trip" className="mt-4" disabled={busy || end < start} onClick={create}>Create a trip</Button>
              </div>
            )}
          </div>
          <motion.aside style={{ x: shiftX, y: shiftY }} className="hidden rounded-[22px] border border-border bg-card/90 p-5 shadow-[var(--shadow)] backdrop-blur lg:block">
            <p className="text-xs tracking-[0.18em] text-muted uppercase">{picked?.name ?? "Tokyo"}</p>
            <p className="mt-3 font-serif text-3xl font-semibold">Day 1</p>
            <div className="mt-4 space-y-3 font-mono text-sm tabular">
              <p>09:00 Shibuya</p>
              <p>11:30 Meiji Shrine</p>
              <p>14:00 Harajuku</p>
            </div>
            <p className="mt-6 text-sm text-muted">{picked?.blurb ?? destinations[0].blurb}</p>
          </motion.aside>
        </div>
      </section>
      <section className="px-6 py-20 lg:px-16">
        <h2 className="max-w-xl font-serif text-5xl font-semibold">One trip. Everything in one place.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-5">
          {SHOWCASE.map(([title, copy]) => (
            <article key={title} className="rounded-[18px] border border-border bg-card p-4">
              <h3 className="font-serif text-2xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{copy}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
