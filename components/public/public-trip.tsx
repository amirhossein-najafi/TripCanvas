"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { TripMap } from "@/components/map/trip-map";
import { useSession } from "@/features/auth/session";
import { getRepository } from "@/lib/api";
import { placeById } from "@/lib/catalog";
import { activitiesForDay } from "@/lib/itinerary";
import { formatDayChip, tripLengthLabel } from "@/lib/dates";
import { DAY_COLORS } from "@/types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function PublicTrip({ slug }: { slug: string }) {
  const { user } = useSession();
  const router = useRouter();
  const query = useQuery({ queryKey: ["public", slug], queryFn: () => getRepository().getPublicBundle(slug) });
  const bundle = query.data;
  if (query.isLoading) return <div className="p-8">Loading the trip…</div>;
  if (!bundle) return <div className="grid min-h-dvh place-items-center px-6 text-center"><div><p className="font-serif text-4xl font-semibold">This trip is private.</p><Link href="/" className="mt-4 inline-block text-accent">Back home</Link></div></div>;
  const owner = bundle.members.find((member) => member.role === "owner")?.user.name ?? "Someone";
  const markers = bundle.days.flatMap((day, index) => activitiesForDay(bundle.activities, day.id).flatMap((activity, activityIndex) => {
    const place = placeById(activity.placeId);
    if (!place) return [];
    return [{ id: activity.id, placeId: place.id, lat: place.lat, lng: place.lng, number: activityIndex + 1, color: DAY_COLORS[index % DAY_COLORS.length], title: activity.title }];
  }));
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="font-serif text-xl font-semibold">TripCanvas</Link>
        <Button onClick={async () => {
          if (!user) {
            router.push(`/login?next=/p/${slug}`);
            return;
          }
          const trip = await getRepository().duplicateTrip(slug);
          toast("Trip duplicated");
          router.push(`/trips/${trip.id}/itinerary`);
        }}>Duplicate this trip</Button>
      </header>
      <div className="grid lg:grid-cols-2">
        <div className="px-6 py-8">
          <p className="text-sm text-muted">{owner}&apos;s {tripLengthLabel(bundle.trip.startDate, bundle.trip.endDate).toLowerCase()} {bundle.trip.destination} itinerary</p>
          <h1 className="mt-2 font-serif text-6xl font-semibold">{bundle.trip.destination}</h1>
          <div className="mt-8 space-y-6">
            {bundle.days.map((day, index) => (
              <section key={day.id}>
                <h2 className="font-mono text-sm tabular">Day {index + 1} · {formatDayChip(day.date)}</h2>
                <div className="mt-2 space-y-2">
                  {activitiesForDay(bundle.activities, day.id).map((activity) => (
                    <p key={activity.id}>{activity.startTime} {activity.title}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
        <div className="h-[50vh] lg:h-auto lg:min-h-dvh">
          <TripMap markers={markers} routes={bundle.days.map((day, index) => ({
            id: day.id,
            color: DAY_COLORS[index % DAY_COLORS.length],
            active: true,
            coordinates: activitiesForDay(bundle.activities, day.id).flatMap((activity) => {
              const place = placeById(activity.placeId);
              return place ? [[place.lng, place.lat] as [number, number]] : [];
            }),
          }))} fitKey={bundle.trip.id} />
        </div>
      </div>
    </div>
  );
}

export function JoinTrip({ slug }: { slug: string }) {
  const { user, ready } = useSession();
  const router = useRouter();
  const query = useQuery({ queryKey: ["join", slug, user?.id], enabled: ready && Boolean(user), queryFn: () => getRepository().joinTrip(slug) });
  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=/t/${slug}`);
    if (query.data) router.replace(`/trips/${query.data.id}/itinerary`);
  }, [ready, user, query.data, router, slug]);
  return <div className="grid min-h-dvh place-items-center">{query.isError ? "That invite link doesn't match a trip." : "Joining the trip…"}</div>;
}
