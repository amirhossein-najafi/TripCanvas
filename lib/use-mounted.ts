"use client";

import { useSyncExternalStore } from "react";

export function useMounted() {
  return useSyncExternalStore(subscribe, getClient, getServer);
}

function subscribe() {
  return () => undefined;
}

function getClient() {
  return true;
}

function getServer() {
  return false;
}