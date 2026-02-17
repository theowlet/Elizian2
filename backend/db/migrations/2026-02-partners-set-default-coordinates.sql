-- Set latitude/longitude for existing partners that have none, so they appear on the venue map.
-- Uses Indian city coordinates and assigns them in round-robin so venues spread across the map.
-- Safe to run multiple times: only updates rows where (latitude IS NULL OR longitude IS NULL OR (0,0)).

WITH needing_coords AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn
  FROM partners
  WHERE latitude IS NULL OR longitude IS NULL
     OR (CAST(latitude AS NUMERIC) = 0 AND CAST(longitude AS NUMERIC) = 0)
),
city_coords(rn, lat, lon) AS (
  VALUES
    (1, 28.6139, 77.2090),   -- Delhi
    (2, 19.0760, 72.8777),   -- Mumbai
    (3, 12.9716, 77.5946),   -- Bangalore
    (4, 17.3850, 78.4867),   -- Hyderabad
    (5, 13.0827, 80.2707),   -- Chennai
    (6, 22.5726, 88.3639),   -- Kolkata
    (7, 18.5204, 73.8567),   -- Pune
    (8, 26.9124, 75.7873),   -- Jaipur
    (9, 28.4595, 77.0266),   -- Gurgaon
    (10, 28.5355, 77.3910)   -- Noida
),
assignments AS (
  SELECT n.id, c.lat, c.lon
  FROM needing_coords n
  JOIN city_coords c ON ((n.rn - 1) % 10 + 1) = c.rn
)
UPDATE partners p
SET latitude = a.lat, longitude = a.lon
FROM assignments a
WHERE p.id = a.id;
