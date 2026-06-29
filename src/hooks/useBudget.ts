import { useCallback, useEffect, useState } from 'react';
import { getBudgetForMonth } from '../db/budgets';
import type { Budget } from '../types';

export function useBudget(month: string) {
  const [data, setData] = useState<Budget | undefined>();
  const reload = useCallback(() => {
    getBudgetForMonth(month).then(setData);
  }, [month]);
  useEffect(() => { reload(); }, [reload]);
  return { data, reload };
}
