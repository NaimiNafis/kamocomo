-- Several places were seeded at the same coordinates as duck spots (Delta,
-- Marutamachi, Nijo, Sanjo, Shijo), so their map markers stacked on top of the
-- duck markers and a tap was ambiguous (it hit the duck marker and opened the
-- duck page instead of the place cinematic). Nudge every place ~90 m west onto
-- the promenade side, so activity (place) markers sit clear of the
-- river's-edge duck markers. Runs once.
update places set lng = lng - 0.0010;
