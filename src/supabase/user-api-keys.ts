import type { AppSupabaseClient } from './client';

export interface UserApiKeys {
  goldApiKey: string | null;
  ingestSecret: string;
}

interface CloudUserApiKeysRow {
  gold_api_key: string | null;
  ingest_secret: string;
}

export async function getCloudUserApiKeys(
  client: AppSupabaseClient,
): Promise<UserApiKeys | null> {
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await client
    .from('user_api_keys')
    .select('gold_api_key,ingest_secret')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as CloudUserApiKeysRow;
  return {
    goldApiKey: row.gold_api_key,
    ingestSecret: row.ingest_secret,
  };
}

export async function upsertCloudUserApiKeys(
  client: AppSupabaseClient,
  updates: { goldApiKey?: string | null },
): Promise<UserApiKeys> {
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) throw new Error('Not authenticated');

  const row: Record<string, unknown> = {
    user_id: userData.user.id,
    updated_at: new Date().toISOString(),
  };
  if (updates.goldApiKey !== undefined) {
    row.gold_api_key = updates.goldApiKey?.trim() || null;
  }

  const { data, error } = await client
    .from('user_api_keys')
    .upsert(row, { onConflict: 'user_id' })
    .select('gold_api_key,ingest_secret')
    .single();

  if (error) throw new Error(error.message);
  const result = data as CloudUserApiKeysRow;
  return {
    goldApiKey: result.gold_api_key,
    ingestSecret: result.ingest_secret,
  };
}

export async function regenerateIngestSecret(
  client: AppSupabaseClient,
): Promise<string> {
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) throw new Error('Not authenticated');

  // Generate a new 32-byte hex secret client-side
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const newSecret = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

  const { data, error } = await client
    .from('user_api_keys')
    .upsert(
      { user_id: userData.user.id, ingest_secret: newSecret, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .select('ingest_secret')
    .single();

  if (error) throw new Error(error.message);
  return (data as { ingest_secret: string }).ingest_secret;
}
