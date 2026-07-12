import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  createSecretKeyOnlyFetch,
  createFetchAssetRatesHandler,
  type AssetRatesSupabaseClient,
  type FetchAssetRatesHandlerDependencies,
} from '../_shared/asset-rates-handler.ts';

type RuntimeFetch = typeof globalThis.fetch;

type UntypedClientFactory = (
  supabaseUrl: string,
  supabaseKey: string,
  options: {
    auth: { persistSession: false };
    global?: { fetch: RuntimeFetch };
  },
) => unknown;

const createUntypedClient = createSupabaseClient as unknown as UntypedClientFactory;
const createAssetRatesClient: FetchAssetRatesHandlerDependencies['createClient'] = (
  supabaseUrl,
  supabaseKey,
  options,
): AssetRatesSupabaseClient => (
  createUntypedClient(supabaseUrl, supabaseKey, options) as AssetRatesSupabaseClient
);

const runtimeFetch = globalThis.fetch.bind(globalThis);
const createSecretKeyAssetRatesClient:
  FetchAssetRatesHandlerDependencies['createSecretKeyClient'] = (
    supabaseUrl,
    supabaseKey,
    options,
  ): AssetRatesSupabaseClient => (
    createUntypedClient(supabaseUrl, supabaseKey, {
      ...options,
      global: {
        fetch: createSecretKeyOnlyFetch(
          supabaseKey,
          runtimeFetch,
        ) as RuntimeFetch,
      },
    }) as AssetRatesSupabaseClient
  );

Deno.serve(createFetchAssetRatesHandler({
  getEnv: name => Deno.env.get(name),
  createClient: createAssetRatesClient,
  createSecretKeyClient: createSecretKeyAssetRatesClient,
  fetch: runtimeFetch,
}));
