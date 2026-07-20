import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import {
  VIEWER_OPTIONS,
  applyKyotoCameraConstraints,
  configureCesiumIon,
  setKyotoHomeView,
} from '../../lib/cesium';

configureCesiumIon();

/**
 * Full-screen Cesium globe, constrained to Kyoto (§8.1). This is the base of
 * the main-map route (§5.3); the overlay chrome (tutorial button, language
 * toggle, map-style switch, "you are here" marker) lands in Phase 4.
 */
export function MainMap() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Cesium.Viewer(containerRef.current, VIEWER_OPTIONS);
    const removeConstraints = applyKyotoCameraConstraints(viewer);
    setKyotoHomeView(viewer);

    return () => {
      removeConstraints();
      viewer.destroy();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" data-testid="cesium-globe" />;
}
