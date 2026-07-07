import { BarChart3, CalendarDays, Home, MoreHorizontal, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';

const baseLink = 'flex min-w-0 flex-1 flex-col items-center justify-end gap-1 px-1 pb-2 pt-3 text-[0.68rem] font-medium';
const inactive = 'text-slate-400';
const active = 'text-sky-300';

export function BottomNav() {
  const { t } = useTranslation();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `${baseLink} ${isActive ? active : inactive}`;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] rounded-t-[2rem] border border-white/10 bg-slate-900/88 px-3 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] shadow-[0_-16px_38px_rgba(0,0,0,0.34)] backdrop-blur-xl"
    >
      <div className="grid min-h-[5.25rem] grid-cols-[1fr_1fr_4.8rem_1fr_1fr] items-end">
        <NavLink to="/" end className={linkClass}>
          <Home aria-hidden="true" className="h-5 w-5" />
          <span className="truncate">{t('nav.home')}</span>
        </NavLink>
        <NavLink to="/calendar" className={linkClass}>
          <CalendarDays aria-hidden="true" className="h-5 w-5" />
          <span className="truncate">{t('nav.calendar')}</span>
        </NavLink>
        <NavLink
          to="/add"
          className={({ isActive }) => [
            'relative flex min-w-0 flex-col items-center justify-end gap-1 pb-2 text-[0.68rem] font-medium',
            isActive ? active : inactive,
          ].join(' ')}
        >
          <span className="absolute -top-8 flex h-[4.35rem] w-[4.35rem] items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 to-sky-400 text-slate-950 shadow-[0_0_28px_rgba(56,189,248,0.58)]">
            <Plus aria-hidden="true" className="h-9 w-9" />
          </span>
          <span className="mt-10 truncate">{t('nav.add')}</span>
        </NavLink>
        <NavLink to="/reports" className={linkClass}>
          <BarChart3 aria-hidden="true" className="h-5 w-5" />
          <span className="truncate">{t('nav.reports')}</span>
        </NavLink>
        <NavLink to="/settings" className={linkClass}>
          <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
          <span className="truncate">{t('nav.settings')}</span>
        </NavLink>
      </div>
    </nav>
  );
}
