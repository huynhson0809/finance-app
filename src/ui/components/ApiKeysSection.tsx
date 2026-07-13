import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabase/client';
import {
  getCloudUserApiKeys,
  upsertCloudUserApiKeys,
  regenerateIngestSecret,
} from '../../supabase/user-api-keys';
import { DarkField, GlassPanel } from './primitives';

export function ApiKeysSection() {
  const [goldApiKey, setGoldApiKey] = useState('');
  const [ingestSecret, setIngestSecret] = useState('');
  const [showIngestSecret, setShowIngestSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    getCloudUserApiKeys(supabase).then(keys => {
      if (keys) {
        setGoldApiKey(keys.goldApiKey ?? '');
        setIngestSecret(keys.ingestSecret);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function handleSaveGoldKey() {
    if (!supabase || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await upsertCloudUserApiKeys(supabase, { goldApiKey: goldApiKey || null });
      setIngestSecret(result.ingestSecret);
      setFeedback('Saved');
      setTimeout(() => setFeedback(null), 2000);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateIngestKey() {
    if (!supabase || saving) return;
    if (!confirm('Tạo key mới? Shortcut cũ sẽ ngừng hoạt động cho đến khi cập nhật key mới.')) return;
    setSaving(true);
    setFeedback(null);
    try {
      const newSecret = await regenerateIngestSecret(supabase);
      setIngestSecret(newSecret);
      setFeedback('Key mới đã tạo');
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setFeedback('Copied!');
      setTimeout(() => setFeedback(null), 1500);
    });
  }

  if (!loaded) return null;

  return (
    <GlassPanel className="space-y-4 p-4">
      <h2 className="font-semibold text-white">API Keys</h2>

      <div>
        <DarkField label="Gold API Key (goldapi.io)">
          <input
            value={goldApiKey}
            onChange={e => setGoldApiKey(e.target.value)}
            placeholder="goldapi-xxxxxxxx-io"
            aria-label="Gold API Key"
          />
        </DarkField>
        <p className="mt-1 text-xs text-slate-500">
          Đăng ký tại goldapi.io. Dùng để lấy giá vàng tự động.
        </p>
        <button
          type="button"
          onClick={handleSaveGoldKey}
          disabled={saving}
          aria-label="Update gold API key"
          className="mt-2 rounded-xl bg-sky-400 px-3 py-1.5 text-sm font-bold text-slate-950 disabled:opacity-50"
        >
          OK
        </button>
      </div>

      <div className="border-t border-white/10 pt-4">
        <label className="block text-sm font-medium text-slate-300">
          Ingest Secret (dùng cho Shortcut)
        </label>
        <div className="mt-2 flex items-center gap-2">
          <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 font-mono text-sm text-white">
            {showIngestSecret
              ? <span className="break-all">{ingestSecret}</span>
              : <span className="text-slate-500">••••••••••••••••</span>
            }
          </div>
          <button
            type="button"
            onClick={() => setShowIngestSecret(!showIngestSecret)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.07] text-slate-300"
            aria-label={showIngestSecret ? 'Hide' : 'Show'}
          >
            {showIngestSecret
              ? <EyeOff aria-hidden="true" className="h-4 w-4" />
              : <Eye aria-hidden="true" className="h-4 w-4" />
            }
          </button>
          <button
            type="button"
            onClick={() => copyToClipboard(ingestSecret)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.07] text-slate-300"
            aria-label="Copy"
          >
            <Copy aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Dán key này vào header <code className="text-slate-400">x-ingest-secret</code> trong iOS Shortcut.
        </p>
        <button
          type="button"
          onClick={handleRegenerateIngestKey}
          disabled={saving}
          className="mt-2 inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-1.5 text-sm font-semibold text-slate-300 disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          Tạo key mới
        </button>
      </div>

      {feedback && (
        <div className="rounded-xl bg-sky-400/10 px-3 py-2 text-sm font-semibold text-sky-300">
          {feedback}
        </div>
      )}
    </GlassPanel>
  );
}
