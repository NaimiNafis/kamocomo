import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainMap } from '../screens/MainMap/MainMap';
import { ToukouMap } from '../screens/ToukouMap/ToukouMap';
import { Archive } from '../screens/Archive/Archive';
import { Duck } from '../screens/Duck/Duck';
import { DuckScan } from '../screens/Duck/DuckScan';

/**
 * Fixed routes (CLAUDE.md §"Architecture rules" #7) — physical QR codes will
 * encode these URLs, so paths must not be renamed.
 *   /                    intro -> main map, also the `?from=qr&spot=` entry
 *   /toukou              toukou/vote activity web
 *   /archive             cookpad-style history
 *   /duck                duck photo feed + stamp card
 *   /duck/scan           `?spot=<qr_token>` geofenced stamp scan
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainMap />} />
        <Route path="/toukou" element={<ToukouMap />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/duck" element={<Duck />} />
        <Route path="/duck/scan" element={<DuckScan />} />
      </Routes>
    </BrowserRouter>
  );
}
