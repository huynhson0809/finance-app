import { openFinanceDB } from './index';

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const db = await openFinanceDB();
  const row = await db.get('settings', key);
  return row?.value as T | undefined;
}

export async function setSetting<T = unknown>(key: string, value: T): Promise<void> {
  const db = await openFinanceDB();
  await db.put('settings', { key, value });
}
