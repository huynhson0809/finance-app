import { useCallback, useEffect, useState } from 'react';
import { listTransactions } from '../db/transactions';
import type { Transaction } from '../types';

export function useTransactions(limit?: number) {
  const [data, setData] = useState<Transaction[]>([]);
  const reload = useCallback(() => {
    listTransactions({ limit }).then(setData);
  }, [limit]);
  useEffect(() => { reload(); }, [reload]);
  return { data, reload };
}
