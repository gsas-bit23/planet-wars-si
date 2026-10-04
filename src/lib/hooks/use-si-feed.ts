"use client";

import { useQuery } from "@tanstack/react-query";
import type { Feed } from "@/server/si/feed";

export function useSiFeed() {
  return useQuery<Feed>({
    queryKey: ["si-feed"],
    queryFn: async () => {
      const r = await fetch("/api/si/feed");
      if (!r.ok) throw new Error("feed unavailable");
      return r.json();
    },
    refetchInterval: 30_000,
  });
}

export function useControlMap() {
  const { data } = useSiFeed();
  const map: Record<number, number> = {};
  for (const c of data?.control ?? []) map[c.bodyId] = c.control;
  return map;
}
