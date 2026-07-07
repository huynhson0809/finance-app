import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createIngestTransactionHandler } from '../_shared/ingest-handler.ts';

Deno.serve(createIngestTransactionHandler({
  getEnv: name => Deno.env.get(name),
  createClient,
}));
