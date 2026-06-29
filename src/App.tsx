import { Routes, Route } from 'react-router-dom';
import { Layout } from './ui/Layout';
import { HomeScreen } from './ui/HomeScreen';
import { AddScreen } from './ui/AddScreen';
import { SettingsScreen } from './ui/SettingsScreen';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomeScreen />} />
        <Route path="add" element={<AddScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
      </Route>
    </Routes>
  );
}
