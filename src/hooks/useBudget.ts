import { useCallback, useEffect, useState } from 'react';
import { getBudgetForMonth } from '../db/budgets';
import type { Budget } from '../types';

export function useBudget(month: string) {
  const [data, setData] = useState<Budget | undefined>();
  const reload = useCallback(() => {
    getBudgetForMonth(month)
      .then(setData)
      .catch(err => console.error('useBudget load failed', err));
  }, [month]);
  useEffect(() => { reload(); }, [reload]);
  return { data, reload };
}
