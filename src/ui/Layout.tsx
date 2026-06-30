import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UpdatePrompt } from './components/UpdatePrompt';
import { OfflineBanner } from './components/OfflineBanner';

export function Layout() {
  const { t } = useTranslation();
  const tab = 'flex-1 py-3 text-center text-sm';
  const active = ({ isActive }: { isActive: boolean }) =>
    `${tab} ${isActive ? 'font-bold text-blue-600' : 'text-gray-600'}`;
  return (
    <div className="min-h-screen flex flex-col">
      <OfflineBanner />
      <UpdatePrompt />
      <main className="flex-1 pb-16"><Outlet /></main>
      <nav className="fixed bottom-0 inset-x-0 flex bg-white border-t">
        <NavLink to="/" end className={active}>{t('nav.home')}</NavLink>
        <NavLink to="/add" className={active}>{t('nav.add')}</NavLink>
        <NavLink to="/reports" className={active}>{t('nav.reports')}</NavLink>
        <NavLink to="/settings" className={active}>{t('nav.settings')}</NavLink>
      </nav>
    </div>
  );
}
