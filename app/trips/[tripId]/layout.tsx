"use client";

import { useParams } from "next/navigation";
import { TripFrame } from "@/components/trip/trip-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ tripId: string }>();
  return <TripFrame tripId={params.tripId}>{children}</TripFrame>;
}
