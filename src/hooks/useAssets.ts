import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AssetAccount, AssetEvent, AssetRate, AssetSummary } from '../assets/types';
import { buildAssetSummary } from '../assets/valuation';
import {
  ASSET_STALE_TIME_MS,
  assetQueryKeys,
  spendlyQueryClient,
} from '../query/client';
import { supabase } from '../supabase/client';
import {
  listCloudAssetAccounts,
  listCloudAssetEvents,
  listCloudAssetRates,
} from '../supabase/assets';

async function loadAssetAccounts(): Promise<AssetAccount[]> {
  if (!supabase) return [];
  return listCloudAssetAccounts(supabase);
}

async function loadAssetRates(): Promise<AssetRate[]> {
  if (!supabase) return [];
  return listCloudAssetRates(supabase);
}

async function loadAssetEvents(accountId?: string): Promise<AssetEvent[]> {
  if (!supabase) return [];
  return listCloudAssetEvents(supabase, accountId);
}

async function loadAssetSummary(): Promise<AssetSummary> {
  const [accounts, rates] = await Promise.all([
    spendlyQueryClient.fetchQuery({
      queryKey: assetQueryKeys.accounts,
      queryFn: loadAssetAccounts,
      staleTime: ASSET_STALE_TIME_MS,
    }),
    spendlyQueryClient.fetchQuery({
      queryKey: assetQueryKeys.rates,
      queryFn: loadAssetRates,
      staleTime: ASSET_STALE_TIME_MS,
    }),
  ]);

  return buildAssetSummary(accounts, rates);
}

export function useAssetAccounts(): UseQueryResult<AssetAccount[]> {
  return useQuery<AssetAccount[], Error>({
    queryKey: assetQueryKeys.accounts,
    queryFn: loadAssetAccounts,
    staleTime: ASSET_STALE_TIME_MS,
  }, spendlyQueryClient);
}

export function useAssetRates(): UseQueryResult<AssetRate[]> {
  return useQuery<AssetRate[], Error>({
    queryKey: assetQueryKeys.rates,
    queryFn: loadAssetRates,
    staleTime: ASSET_STALE_TIME_MS,
  }, spendlyQueryClient);
}

export function useAssetSummary(): UseQueryResult<AssetSummary> {
  return useQuery<AssetSummary, Error>({
    queryKey: assetQueryKeys.summary,
    queryFn: loadAssetSummary,
    staleTime: ASSET_STALE_TIME_MS,
  }, spendlyQueryClient);
}

export function useAssetEvents(accountId?: string): UseQueryResult<AssetEvent[]> {
  return useQuery<AssetEvent[], Error>({
    queryKey: assetQueryKeys.events(accountId),
    queryFn: () => loadAssetEvents(accountId),
    staleTime: ASSET_STALE_TIME_MS,
  }, spendlyQueryClient);
}
