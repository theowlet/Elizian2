-- Clear placeholder coordinates that were set by 2026-02-partners-set-default-coordinates.sql.
-- Partners with these exact (lat, lon) are reset to NULL so they no longer appear on the map
-- until real coordinates are set via Partner Console (map/geocode or manual).
-- Safe to run multiple times.

WITH placeholder_coords(lat, lon) AS (
  VALUES
    (28.6139, 77.2090),
    (19.0760, 72.8777),
    (12.9716, 77.5946),
    (17.3850, 78.4867),
    (13.0827, 80.2707),
    (22.5726, 88.3639),
    (18.5204, 73.8567),
    (26.9124, 75.7873),
    (28.4595, 77.0266),
    (28.5355, 77.3910)
)
UPDATE partners p
SET latitude = NULL, longitude = NULL
FROM placeholder_coords c
WHERE CAST(p.latitude AS NUMERIC) = c.lat
  AND CAST(p.longitude AS NUMERIC) = c.lon;
