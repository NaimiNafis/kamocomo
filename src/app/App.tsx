import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useIdentityStore } from '../store/identityStore';
import { ErrorBoundary } from './ErrorBoundary';

// Routes are code-split so only the map route pulls in the heavy Cesium
// bundle. This keeps the initial load small (mobile-first / Lighthouse) and
// lets the non-map screens load and work offline without the ~6 MB Cesium
// runtime, which the globe needs but the feeds don't.
const MainMap = lazy(() => import('../screens/MainMap/MainMap').then((m) => ({ default: m.MainMap })));
const ToukouMap = lazy(() =>
  import('../screens/ToukouMap/ToukouMap').then((m) => ({ default: m.ToukouMap })),
);
const Archive = lazy(() => import('../screens/Archive/Archive').then((m) => ({ default: m.Archive })));
const Duck = lazy(() => import('../screens/Duck/Duck').then((m) => ({ default: m.Duck })));
const DuckScan = lazy(() => import('../screens/Duck/DuckScan').then((m) => ({ default: m.DuckScan })));

function RouteFallback() {
  return <div className="h-full w-full bg-kamo-stone" />;
}

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
  useEffect(() => {
    // Established once regardless of entry route -- a duck-spot QR can be
    // someone's very first touch of the app (Appendix A.2b).
    void useIdentityStore.getState().init();
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<MainMap />} />
            <Route path="/toukou" element={<ToukouMap />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/duck" element={<Duck />} />
            <Route path="/duck/scan" element={<DuckScan />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
