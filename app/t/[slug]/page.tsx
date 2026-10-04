"use client";

import { useParams } from "next/navigation";
import { JoinTrip } from "@/components/public/public-trip";

export default function Page() {
  const params = useParams<{ slug: string }>();
  return <JoinTrip slug={params.slug} />;
}
