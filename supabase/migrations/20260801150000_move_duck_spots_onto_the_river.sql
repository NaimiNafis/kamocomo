-- The duck spots were seeded at approximate bridge/landmark coordinates, which
-- in practice put several of them on roads and embankments rather than on the
-- water. On a photorealistic map that reads as wrong: the duck is standing in
-- traffic.
--
-- This moves them onto the river itself. Coordinates are supplied by hand off
-- the map rather than derived, because the previous "trace the river" place set
-- was itself approximate and snapping to it would just inherit its error.
--
-- ⚠ A duck spot's coordinates are not only where its marker draws — they are
-- also the geofence centre that `scan_duck_spot` measures against, within
-- ~120 m. Moving a spot moves the area where its QR can be scanned. Jujo moves
-- ~250 m, which is further than the geofence radius, so anyone standing at the
-- OLD location can no longer collect that stamp. If a QR is already physically
-- installed, it has to move to match, or the geofence has to widen.
--
-- Places mirror their duck spot's position (they were created from it in
-- 20260801120000), so both are updated together or the marker and the geofence
-- would drift apart.

update duck_spots set lat = 34.973611, lng = 135.765194
where id = 'd1000000-0000-0000-0000-000000000010'; -- Jujo / 十条

-- Re-sync every linked place to its duck spot, so this stays correct for any
-- future coordinate change without needing to repeat the values.
update places p
set lat = d.lat, lng = d.lng
from duck_spots d
where p.duck_spot_id = d.id;
