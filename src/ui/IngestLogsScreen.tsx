import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useIngestLogs } from '../hooks/useIngestLogs';
import { GlassPanel } from './components/primitives';

function statusBadge(status: string) {
  switch (status) {
    case 'success':
      return <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">OK</span>;
    case 'duplicate':
      return <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">Dup</span>;
    default:
      return <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-300">Error</span>;
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function IngestLogsScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logs, loading, error, reload } = useIngestLogs();

  return (
    <div className="space-y-4 px-4 py-5 pb-36 text-slate-100">
      <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="grid h-11 w-11 place-items-center rounded-full text-slate-100"
        >
          <ArrowLeft aria-hidden="true" className="h-7 w-7" />
        </button>
        <h1 className="truncate text-center text-xl font-bold text-white">Automation Logs</h1>
        <button
          type="button"
          onClick={() => void reload()}
          aria-label="Refresh"
          className="grid h-11 w-11 place-items-center rounded-full text-slate-400"
        >
          <RefreshCw aria-hidden="true" className="h-5 w-5" />
        </button>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {loading ? (
        <GlassPanel className="p-4 text-center text-sm text-slate-400">Loading...</GlassPanel>
      ) : logs.length === 0 ? (
        <GlassPanel className="border-dashed border-white/15 p-6 text-center text-sm text-slate-400">
          Chưa có log nào. Khi Shortcut gửi request, log sẽ hiện ở đây.
        </GlassPanel>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <GlassPanel key={log.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {statusBadge(log.status)}
                    <span className="text-xs text-slate-400">{formatTime(log.createdAt)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm">
                    {log.bank && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-bold text-slate-200">
                        {log.bank}
                      </span>
                    )}
                    {log.type && (
                      <span className="text-xs text-slate-400">{log.type}</span>
                    )}
                    {log.amount && (
                      <span className="text-xs font-semibold text-slate-200">{log.amount}</span>
                    )}
                  </div>
                  {log.content && (
                    <p className="mt-1 truncate text-xs text-slate-400">{log.content}</p>
                  )}
                  {log.status === 'error' && (
                    <div className="mt-2 rounded-lg bg-rose-500/10 px-2 py-1.5">
                      <p className="text-xs font-semibold text-rose-300">{log.errorCode}</p>
                      {log.errorDetail && (
                        <p className="mt-0.5 break-all text-xs text-rose-200/80">{log.errorDetail}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
}
