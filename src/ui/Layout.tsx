import { Outlet } from 'react-router-dom';
import { UpdatePrompt } from './components/UpdatePrompt';
import { InstallPrompt } from './components/InstallPrompt';
import { BottomNav } from './components/primitives';

export function Layout() {
  return (
    <div data-testid="app-shell" className="min-h-screen bg-transparent text-slate-50">
      <UpdatePrompt />
      <InstallPrompt />
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-transparent">
        <main className="flex-1 px-0 pb-32 pt-0">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
