import type { AppSupabaseClient } from './client';

export interface IngestLog {
  id: string;
  bank: string | null;
  type: string | null;
  amount: string | null;
  content: string | null;
  status: 'success' | 'duplicate' | 'error';
  errorCode: string | null;
  errorDetail: string | null;
  createdAt: string;
}

interface CloudIngestLogRow {
  id: string;
  bank: string | null;
  type: string | null;
  amount: string | null;
  content: string | null;
  status: string;
  error_code: string | null;
  error_detail: string | null;
  created_at: string;
}

function mapIngestLog(row: CloudIngestLogRow): IngestLog {
  return {
    id: row.id,
    bank: row.bank,
    type: row.type,
    amount: row.amount,
    content: row.content,
    status: row.status as IngestLog['status'],
    errorCode: row.error_code,
    errorDetail: row.error_detail,
    createdAt: row.created_at,
  };
}

export async function listIngestLogs(
  client: AppSupabaseClient,
  limit = 50,
): Promise<IngestLog[]> {
  const { data, error } = await client
    .from('ingest_logs')
    .select('id,bank,type,amount,content,status,error_code,error_detail,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapIngestLog);
}
