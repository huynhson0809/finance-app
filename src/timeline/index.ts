import type { Transaction } from "../types";
import type { AssetEvent, AssetAccount } from "../assets/types";

export interface TransferDisplayItem {
  kind: "transfer";
  id: string;
  amount: number;
  currency: string;
  occurredAt: string;
  fromAccountName: string;
  toAccountName: string;
  note?: string | null;
}

export interface TransactionDisplayItem {
  kind: "transaction";
  transaction: Transaction;
}

export type TimelineItem = TransactionDisplayItem | TransferDisplayItem;

export function buildTransferItems(
  events: AssetEvent[],
  accounts: AssetAccount[],
): TransferDisplayItem[] {
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const items: TransferDisplayItem[] = [];

  for (const event of events) {
    if (event.type !== "transfer_out") continue;
    const fromAccount = accountMap.get(event.accountId);
    const toAccount = event.counterpartyAccountId
      ? accountMap.get(event.counterpartyAccountId)
      : undefined;

    items.push({
      kind: "transfer",
      id: event.id,
      amount: Math.abs(event.amount),
      currency: event.currency,
      occurredAt: event.occurredAt,
      fromAccountName: fromAccount?.name ?? "?",
      toAccountName: toAccount?.name ?? "?",
      note: event.note,
    });
  }

  return items;
}

export function mergeTimeline(
  transactions: Transaction[],
  transfers: TransferDisplayItem[],
): TimelineItem[] {
  const txItems: TimelineItem[] = transactions.map((t) => ({
    kind: "transaction",
    transaction: t,
  }));
  const tfItems: TimelineItem[] = transfers.map((t) => ({ ...t }));
  const all = [...txItems, ...tfItems];

  all.sort((a, b) => {
    const dateA =
      a.kind === "transaction" ? a.transaction.occurredAt : a.occurredAt;
    const dateB =
      b.kind === "transaction" ? b.transaction.occurredAt : b.occurredAt;
    const cmp = dateB.localeCompare(dateA);
    if (cmp !== 0) return cmp;
    // Tiebreaker: use createdAt for transactions
    const createdA =
      (a.kind === "transaction" ? a.transaction.createdAt : "") ?? "";
    const createdB =
      (b.kind === "transaction" ? b.transaction.createdAt : "") ?? "";
    return createdB.localeCompare(createdA);
  });

  return all;
}
