"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useTripParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const day = Math.max(1, Number(params.get("day") || "1") || 1);
  const placeId = params.get("place");
  const view = params.get("view") || "timeline";

  function patch(next: Record<string, string | null>, path = pathname) {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) sp.delete(key);
      else sp.set(key, value);
    }
    const query = sp.toString();
    router.replace(query ? `${path}?${query}` : path, { scroll: false });
  }

  function href(path: string) {
    const sp = new URLSearchParams(params.toString());
    const query = sp.toString();
    return query ? `${path}?${query}` : path;
  }

  return { day, placeId, view, patch, href, pathname };
}
