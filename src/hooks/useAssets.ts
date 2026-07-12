import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { selectEffectiveAssetRates } from '../assets/rates';
import type {
  AssetAccount,
  AssetEvent,
  AssetRate,
  AssetRatePair,
  AssetSummary,
} from '../assets/types';
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
} from '../supabase/assets';
import {
  deleteCloudAssetRate,
  listCloudAssetRates,
  refreshCloudAssetRates,
  upsertCloudAssetRate,
} from '../supabase/rates';
import type { AssetRateRefreshResult } from '../supabase/rates';

const SUPABASE_NOT_CONFIGURED = 'Supabase is not configured';

export interface AssetRateOverrideInput {
  pair: AssetRatePair;
  value: number;
}

function requireSupabase(action: string): NonNullable<typeof supabase> {
  if (!supabase) {
    throw new Error(`${SUPABASE_NOT_CONFIGURED}; cannot ${action}`);
  }
  return supabase;
}

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

async function saveAssetRateOverride(input: AssetRateOverrideInput): Promise<AssetRate> {
  return upsertCloudAssetRate(requireSupabase('save an asset rate override'), input);
}

async function clearAssetRateOverride(pair: AssetRatePair): Promise<void> {
  await deleteCloudAssetRate(requireSupabase('clear an asset rate override'), pair);
}

async function refreshAutomaticAssetRates(): Promise<AssetRateRefreshResult> {
  return refreshCloudAssetRates(requireSupabase('refresh automatic asset rates'));
}

async function invalidateRateDependentQueries(): Promise<void> {
  await Promise.all([
    spendlyQueryClient.invalidateQueries({
      queryKey: assetQueryKeys.rates,
      exact: true,
    }),
    spendlyQueryClient.invalidateQueries({
      queryKey: assetQueryKeys.summary,
      exact: true,
    }),
  ]);
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
    select: selectEffectiveAssetRates,
    staleTime: ASSET_STALE_TIME_MS,
  }, spendlyQueryClient);
}

export function useSaveAssetRateOverride(): UseMutationResult<
  AssetRate,
  Error,
  AssetRateOverrideInput
> {
  return useMutation<AssetRate, Error, AssetRateOverrideInput>({
    mutationFn: saveAssetRateOverride,
    onSuccess: invalidateRateDependentQueries,
  }, spendlyQueryClient);
}

export function useClearAssetRateOverride(): UseMutationResult<void, Error, AssetRatePair> {
  return useMutation<void, Error, AssetRatePair>({
    mutationFn: clearAssetRateOverride,
    onSuccess: invalidateRateDependentQueries,
  }, spendlyQueryClient);
}

export function useRefreshAssetRates(): UseMutationResult<AssetRateRefreshResult, Error, void> {
  return useMutation<AssetRateRefreshResult, Error, void>({
    mutationFn: refreshAutomaticAssetRates,
    onSuccess: invalidateRateDependentQueries,
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
