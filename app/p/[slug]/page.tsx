"use client";

import { useParams } from "next/navigation";
import { PublicTrip } from "@/components/public/public-trip";

export default function Page() {
  const params = useParams<{ slug: string }>();
  return <PublicTrip slug={params.slug} />;
}
