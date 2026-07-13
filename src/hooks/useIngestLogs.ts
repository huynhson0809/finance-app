import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase/client';
import { listIngestLogs, type IngestLog } from '../supabase/ingest-logs';
import { spendlyQueryClient } from '../query/client';

export function useIngestLogs() {
  const query = useQuery<IngestLog[], Error>({
    queryKey: ['ingest-logs'],
    queryFn: async () => {
      if (!supabase) return [];
      return listIngestLogs(supabase, 100);
    },
    staleTime: 30_000,
  }, spendlyQueryClient);

  return {
    logs: query.data ?? [],
    loading: query.isPending,
    error: query.error?.message ?? null,
    reload: () => query.refetch(),
  };
}
