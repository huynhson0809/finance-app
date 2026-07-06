import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './ui/Layout';
import { HomeScreen } from './ui/HomeScreen';
import { AddScreen } from './ui/AddScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { ConfirmScreen } from './ui/ConfirmScreen';
import { AuthGate } from './ui/AuthGate';

const ReportsScreen = lazy(() =>
  import('./ui/ReportsScreen').then(m => ({ default: m.ReportsScreen })),
);

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomeScreen />} />
          <Route path="add" element={<AddScreen />} />
          <Route path="confirm" element={<ConfirmScreen />} />
          <Route
            path="reports"
            element={
              <Suspense fallback={<div className="p-4 text-sm text-gray-500">Loading…</div>}>
                <ReportsScreen />
              </Suspense>
            }
          />
          <Route path="settings" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </AuthGate>
  );
}
