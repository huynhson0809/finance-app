import { Outlet } from 'react-router-dom';
import { UpdatePrompt } from './components/UpdatePrompt';
import { InstallPrompt } from './components/InstallPrompt';
import {
  APP_SHELL_MAX_WIDTH_CLASS,
  BottomNav,
  NAV_CONTENT_CLEARANCE_CLASS,
} from './components/primitives';

export function Layout() {
  return (
    <div data-testid="app-shell" className="min-h-screen bg-transparent text-slate-50">
      <UpdatePrompt />
      <InstallPrompt />
      <div className={`mx-auto flex min-h-screen w-full ${APP_SHELL_MAX_WIDTH_CLASS} flex-col bg-transparent`}>
        <main
          data-testid="app-main"
          className={`flex-1 px-0 ${NAV_CONTENT_CLEARANCE_CLASS} pt-0`}
        >
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
