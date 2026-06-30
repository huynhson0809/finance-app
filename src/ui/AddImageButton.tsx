import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { imageHolder } from '../lib/image';

export function AddImageButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const imageId = imageHolder.put(file);
    navigate('/confirm', { state: { imageId } });
    // reset so re-selecting the same file re-triggers change
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <label
      className="fixed right-4 bottom-36 w-14 h-14 rounded-full bg-emerald-600 text-white text-xl flex items-center justify-center shadow-lg cursor-pointer"
      aria-label={t('add.byImage')}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      📷
    </label>
  );
}
