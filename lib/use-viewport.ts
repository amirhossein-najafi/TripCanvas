"use client";

import { useEffect, useState } from "react";

export function useViewport() {
  const [mode, setMode] = useState<"mobile" | "tablet" | "desktop">("desktop");
  useEffect(() => {
    const sync = () => {
      const width = window.innerWidth;
      setMode(width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop");
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  return mode;
}
