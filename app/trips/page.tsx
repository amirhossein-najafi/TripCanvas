"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/session";
import { getRepository } from "@/lib/api";
import { formatRange, tripLengthLabel } from "@/lib/dates";

export default function TripsPage() {
  const { user, ready, signOut } = useSession();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const query = useQuery({ queryKey: ["trips", user?.id], enabled: ready && Boolean(user), queryFn: () => getRepository().listTrips() });

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (ready && !user) router.replace("/login?next=/trips");
  }, [ready, user, router]);

  if (!mounted || !ready || !user) return <div className="p-8">Loading…</div>;
  const trips = query.data ?? [];
  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-5 py-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-serif text-2xl font-semibold">TripCanvas</Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => signOut().then(() => router.push("/"))}>Sign out</Button>
          <Button onClick={() => router.push("/")}>New trip</Button>
        </div>
      </header>
      <h1 className="mt-10 font-serif text-5xl font-semibold">Your trips</h1>
      {!trips.length && (
        <div className="mt-8 max-w-md">
          <p className="font-serif text-3xl font-semibold">Your trip starts here ✈️</p>
          <p className="mt-2 text-muted">Create one, or open the Tokyo sample.</p>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => router.push("/")}>Create a trip</Button>
            <Button variant="outline" onClick={async () => {
              const trip = await getRepository().loadTokyoSample();
              router.push(`/trips/${trip.id}/itinerary`);
            }}>Load Tokyo sample</Button>
          </div>
        </div>
      )}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {trips.map((trip) => (
          <Link key={trip.id} href={`/trips/${trip.id}/itinerary`} className="overflow-hidden rounded-[18px] border border-border bg-card">
            <img src={trip.coverImage} alt="" className="h-40 w-full object-cover" />
            <div className="p-4">
              <p className="font-serif text-3xl font-semibold">{trip.destination}</p>
              <p className="mt-1 text-sm text-muted">{formatRange(trip.startDate, trip.endDate)} · {tripLengthLabel(trip.startDate, trip.endDate)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
