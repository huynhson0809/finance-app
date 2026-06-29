import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './vi.json';
import en from './en.json';
import { getSetting, setSetting } from '../db/settings';

export type Locale = 'vi' | 'en';

export async function initI18n(): Promise<void> {
  const stored = (await getSetting<Locale>('locale')) ?? 'vi';
  await i18n.use(initReactI18next).init({
    resources: { vi: { translation: vi }, en: { translation: en } },
    lng: stored,
    fallbackLng: 'vi',
    interpolation: { escapeValue: false },
  });
}

export async function setLocale(locale: Locale): Promise<void> {
  await setSetting('locale', locale);
  await i18n.changeLanguage(locale);
}

export { i18n };
