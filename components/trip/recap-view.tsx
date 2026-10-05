"use client";

import { TripMap } from "@/components/map/trip-map";
import { useTrip } from "@/features/trips/trip-provider";
import { placeById } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { recapStats } from "@/lib/recap";
import { DAY_COLORS } from "@/types";

export function RecapView() {
  const { bundle } = useTrip();
  if (!bundle) return null;
  const stats = recapStats({ activities: bundle.activities, places: bundle.places, expenses: bundle.expenses });
  const stops = bundle.activities.flatMap((activity) => {
    const place = placeById(activity.placeId);
    return place ? [{ activity, place }] : [];
  });
  return (
    <div className="h-full overflow-auto px-5 py-6">
      <p className="text-xs tracking-[0.16em] text-muted uppercase">After the trip</p>
      <h1 className="mt-2 font-serif text-5xl font-semibold">{bundle.trip.destination}</h1>
      <p className="mt-4 font-mono text-lg tabular">{stats.km} km walked · {stats.places} places · {stats.restaurants} restaurants · {formatMoney(stats.spent, bundle.trip.currency)} spent</p>
      <div className="mt-6 h-64 overflow-hidden rounded-[18px] border border-border">
        <TripMap
          markers={stops.map((stop, index) => ({ id: stop.activity.id, placeId: stop.place.id, lat: stop.place.lat, lng: stop.place.lng, number: index + 1, color: DAY_COLORS[index % DAY_COLORS.length], title: stop.activity.title }))}
          routes={[{ id: "recap", color: DAY_COLORS[0], active: true, coordinates: stops.map((stop) => [stop.place.lng, stop.place.lat]) }]}
          fitKey="recap"
        />
      </div>
      <div className="mt-6 space-y-3">
        {stops.map((stop) => (
          <article key={stop.activity.id} className="flex gap-3">
            {stop.place.image && <img src={stop.place.image} alt="" className="h-16 w-16 rounded-2xl object-cover" />}
            <div>
              <p className="font-medium">{stop.activity.title}</p>
              <p className="text-sm text-muted">{stop.activity.startTime}</p>
            </div>
          </article>
        ))}
      </div>
      <button type="button" className="mt-6 text-sm text-accent" onClick={() => exportCard(bundle.trip.destination, stats, bundle.trip.currency)}>Export image</button>
    </div>
  );
}

function exportCard(destination: string, stats: { km: number; places: number; restaurants: number; spent: number }, currency: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#1c1917";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f5f0e8";
  ctx.font = "64px Georgia";
  ctx.fillText(destination, 72, 180);
  ctx.font = "32px sans-serif";
  ctx.fillText(`${stats.km} km · ${stats.places} places · ${stats.restaurants} restaurants`, 72, 280);
  ctx.fillText(`${stats.spent.toFixed(0)} ${currency} spent`, 72, 340);
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${destination}-recap.png`;
  link.click();
}
