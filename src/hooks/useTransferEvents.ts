import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase/client";
import { listCloudTransferEvents } from "../supabase/assets";
import {
  spendlyQueryClient,
  spendlyStaleTimes,
  assetQueryKeys,
} from "../query/client";
import type { AssetEvent } from "../assets/types";

export function useRecentTransferEvents(limit = 5) {
  const query = useQuery<AssetEvent[], Error>(
    {
      queryKey: [...assetQueryKeys.eventsRoot, "transfers", "recent", limit],
      queryFn: async () => {
        if (!supabase) return [];
        return listCloudTransferEvents(supabase, { limit });
      },
      staleTime: spendlyStaleTimes.recentTransactions,
    },
    spendlyQueryClient,
  );

  return {
    data: query.data ?? [],
    loading: query.isPending,
    error: query.error?.message ?? null,
  };
}

export function useMonthTransferEvents(sinceISO: string, untilISO: string) {
  const query = useQuery<AssetEvent[], Error>(
    {
      queryKey: [...assetQueryKeys.eventsRoot, "transfers", sinceISO, untilISO],
      queryFn: async () => {
        if (!supabase) return [];
        return listCloudTransferEvents(supabase, { sinceISO, untilISO });
      },
      staleTime: spendlyStaleTimes.monthTransactions,
    },
    spendlyQueryClient,
  );

  return {
    data: query.data ?? [],
    loading: query.isPending,
    error: query.error?.message ?? null,
  };
}
