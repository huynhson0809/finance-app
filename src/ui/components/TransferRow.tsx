import { ArrowRightLeft } from "lucide-react";
import { formatMoney } from "../../lib/money";
import type { TransferDisplayItem } from "../../timeline";

interface TransferRowProps {
  transfer: TransferDisplayItem;
  locale: "vi" | "en";
}

function formatTransferDate(iso: string, locale: "vi" | "en"): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function TransferRow({ transfer, locale }: TransferRowProps) {
  const subtitle = `${transfer.fromAccountName} → ${transfer.toAccountName} · ${formatTransferDate(transfer.occurredAt, locale)}`;

  return (
    <li>
      <div
        className="grid min-h-[4.25rem] grid-cols-[2.75rem_minmax(0,1fr)_minmax(5.5rem,7.5rem)] items-center gap-2 border-b border-white/10 bg-black px-3 py-2 text-slate-50"
        aria-label={`Transfer ${transfer.amount}`}
      >
        <span className="grid h-9 w-9 place-items-center rounded-lg">
          <ArrowRightLeft
            aria-hidden="true"
            className="h-7 w-7 text-amber-400"
          />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-base font-bold">
            {transfer.fromAccountName} → {transfer.toAccountName}
          </span>
          <span className="block truncate text-xs text-zinc-400">
            {subtitle}
          </span>
        </span>
        <span className="shrink-0 truncate whitespace-nowrap text-right text-base font-bold text-amber-400">
          {formatMoney(
            transfer.amount,
            transfer.currency as "VND" | "USD",
            locale,
          )}
        </span>
      </div>
    </li>
  );
}
