import { Camera } from 'lucide-react';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { imageHolder } from '../lib/image';

export function AddImageButton({ variant = 'floating' }: { variant?: 'floating' | 'tile' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const imageId = imageHolder.put(file);
    navigate('/confirm', { state: { imageId } });
    if (inputRef.current) inputRef.current.value = '';
  }

  const className = variant === 'tile'
    ? 'flex min-h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3 text-sm font-semibold text-sky-300'
    : 'fixed right-4 bottom-36 z-20 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg';

  if (variant === 'tile') {
    return (
      <>
        <button
          type="button"
          className={className}
          aria-label={t('add.byImage')}
          onClick={() => inputRef.current?.click()}
        >
          <Camera aria-hidden="true" className="h-7 w-7" />
          <span>{t('add.byImage')}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleChange}
        />
      </>
    );
  }

  return (
    <label className={className} aria-label={t('add.byImage')}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      <Camera aria-hidden="true" className="h-6 w-6" />
    </label>
  );
}
