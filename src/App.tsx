import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './ui/Layout';
import { HomeScreen } from './ui/HomeScreen';
import { AddScreen } from './ui/AddScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { ConfirmScreen } from './ui/ConfirmScreen';
import { AuthGate } from './ui/AuthGate';
import { TransactionEditScreen } from './ui/TransactionEditScreen';
import { CategoryManagerScreen } from './ui/CategoryManagerScreen';
import { SettingsReportScreen } from './ui/SettingsReportScreen';

const CalendarScreen = lazy(() =>
  import('./ui/CalendarScreen').then(m => ({ default: m.CalendarScreen })),
);

const ReportsScreen = lazy(() =>
  import('./ui/ReportsScreen').then(m => ({ default: m.ReportsScreen })),
);

const AssetManagementScreen = lazy(() =>
  import('./ui/AssetManagementScreen').then(m => ({ default: m.AssetManagementScreen })),
);

const DebtManagementScreen = lazy(() =>
  import('./ui/DebtManagementScreen').then(m => ({ default: m.DebtManagementScreen })),
);

function RouteFallback() {
  return <div className="p-4 text-sm text-gray-500">Loading...</div>;
}

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomeScreen />} />
          <Route path="add" element={<AddScreen />} />
          <Route
            path="assets"
            element={
              <Suspense fallback={<RouteFallback />}>
                <AssetManagementScreen />
              </Suspense>
            }
          />
          <Route
            path="debts"
            element={
              <Suspense fallback={<RouteFallback />}>
                <DebtManagementScreen />
              </Suspense>
            }
          />
          <Route path="categories" element={<CategoryManagerScreen />} />
          <Route path="confirm" element={<ConfirmScreen />} />
          <Route path="transactions/:id" element={<TransactionEditScreen />} />
          <Route
            path="calendar"
            element={
              <Suspense fallback={<RouteFallback />}>
                <CalendarScreen />
              </Suspense>
            }
          />
          <Route
            path="reports"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ReportsScreen />
              </Suspense>
            }
          />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="settings/reports/:mode" element={<SettingsReportScreen />} />
        </Route>
      </Routes>
    </AuthGate>
  );
}
