# What is PostGIS

## 1. The Real-World Problem — When You Actually Hit This

Your app stores places with two float columns: `lat double precision` and `lon double precision`. It works fine for a few thousand restaurants. Then you ship "find coffee shops within 2km" and everything falls apart.

You pull every row into your Node or Python app, run a haversine formula in a loop, and filter. With 50,000 rows it is slow. With 2 million it times out. You try to push the math into SQL with `WHERE 6371 * acos(...) < 2`, and now even that is slow because Postgres has to run that math on every single row — there is no index that helps. Worse, your distances are subtly wrong near the poles, across the international date line, or when you forget that one degree of longitude is not the same number of meters everywhere.

You also need more than "distance between points." You need "is this delivery address inside this polygon?", "do these two neighborhoods overlap?", "find the 10 closest drivers." Floats plus app-side math cannot answer any of that cleanly.

That is the exact moment you need PostGIS. It gives Postgres real spatial types, a real spatial index, and hundreds of spatial functions so the database does the geometry correctly and fast.

## 2. The Analogy — Make the Mechanic Obvious

Think of a regular Postgres table without PostGIS as a filing cabinet that only understands numbers and text.

You write latitude and longitude on each file as two separate numbers on a sticky note. If someone asks "find all files for places within 2km of me," you have to pull every single file out, measure the distance by hand with a calculator, and put back the ones that do not match. No shortcut. Every query touches every file.

PostGIS upgrades that cabinet in three ways.

First, it adds a new kind of folder: a map folder. Instead of two loose numbers, you store the actual shape — a point, a line, a polygon — as one object that knows it lives on Earth. That is the `geometry` and `geography` types.

Second, it adds a map atlas index to the cabinet. Instead of scanning every file, the cabinet maintains a grid of bounding boxes that tells it instantly which files could possibly be near you. That is the GiST index. You only measure the few candidates that survive the grid.

Third, it adds a proper toolkit: rulers that know the Earth is round, stencils that test "inside" and "overlaps," and a sorting trick that finds nearest neighbors without measuring everything. Those are the `ST_*` functions and the `<->` operator.

Without all three, you are still just doing math on floats. With all three, Postgres becomes a real geographic database.

## 3. The Full Explanation — How It Actually Works

PostGIS is not a separate database. It is an extension you install into Postgres. One command adds new types, indexes, and functions to your existing database.

```sql
CREATE EXTENSION postgis;
```

After that, you have two new spatial types that matter most.

`geometry` stores shapes on a flat plane. It uses Cartesian math, which is very fast. You also tell it what coordinate system the numbers are in using an SRID. SRID 4326 means "WGS84 lat/lon degrees" — the GPS standard. SRID 3857 means "Web Mercator meters" — what web maps use. Two geometries with different SRIDs cannot be compared until you transform one with `ST_Transform`. Distances in geometry are in the units of the SRID, so in 4326 a distance of 1 means one degree, not one meter. That confuses people constantly.

`geography` stores shapes on a round Earth. It always assumes SRID 4326 and does spheroid math. Distances are always in meters, which is what you usually want for "within X km." It is more correct for global data but a bit slower than geometry because the math is harder. Think of it this way: geometry is a flat paper map, geography is the actual globe.

Most teams make the choice like this: if you are storing global lat/lon and need correct real-world distance, use `geography(Point,4326)`. If you are working within one city or country and have projected your data into meters (like 3857 or a local UTM zone), or you need maximum speed for intersection tests, use `geometry`. For a typical "nearby places" feature with GPS coordinates, start with geography.

The index is what makes this usable in production. A normal B-tree cannot index 2D shapes. PostGIS uses GiST (Generalized Search Tree), which builds a tree of bounding boxes. When you ask "everything within 2km," GiST first discards every box that cannot possibly overlap your search circle, then only the few survivors get an exact distance check. Without GiST, PostGIS still works but every query is a full table scan and will be slow past a few thousand rows. This is not optional — it is the whole performance story.

The functions are the last piece. The ones you use daily are small and composable:

`ST_MakePoint(lon, lat)` builds a point. Note lon comes first, not lat. `ST_SetSRID(point, 4326)` tags it with its coordinate system, and `::geography` casts it to geography if that is your column type.

`ST_DWithin(geom1, geom2, distance)` answers "are these within X meters?" and it can use the GiST index. This is almost always what you want for "nearby."

`ST_Distance(geom1, geom2)` returns the exact distance. By itself it cannot use an index efficiently for filtering. Use it to return the distance after you have filtered with `ST_DWithin`, or for ordering.

`ST_Contains`, `ST_Intersects`, `ST_Within` test shape relationships — inside, overlapping, touching — and are also index-assisted.

The nearest-neighbor operator `<->` is special. `ORDER BY geom <-> search_point LIMIT 10` finds the 10 closest rows using the GiST index without measuring every row. It is an index-assisted KNN search, far faster than `ORDER BY ST_Distance(...)`.

PostGIS adds about a thousand functions, but those five cover 90% of interviews and production queries. Everything else — buffers, unions, area, length, GeoJSON export with `ST_AsGeoJSON` — builds on the same types and index.

PostGIS also interacts with the rest of Postgres normally. Spatial queries run inside transactions, respect MVCC, replicate via streaming replication, and can be backed up with pg_dump. Large shape columns are TOASTed like any large value. The operational difference is that GiST indexes benefit from `VACUUM` and need regular `ANALYZE` like any index, and bulk loads of spatial data are faster if you create the GiST index after loading.

## 4. See It In Practice — Real Code or Queries

All examples are PostgreSQL with PostGIS. Run them after `CREATE EXTENSION postgis;`.

Create a table for nearby search. Two common choices, pick one:

```sql
-- Choice A: geography — correct global distances in meters, best for lat/lon
CREATE TABLE places (
  id   bigserial PRIMARY KEY,
  name text NOT NULL,
  geog geography(Point, 4326) NOT NULL
);

-- Choice B: geometry — faster, planar, store as 4326 and query carefully
CREATE TABLE places_geom (
  id   bigserial PRIMARY KEY,
  name text NOT NULL,
  geom geometry(Point, 4326) NOT NULL
);
```

Insert rows. Remember ST_MakePoint takes lon first, lat second:

```sql
-- Insert a coffee shop in Bangalore (lon 77.5946, lat 12.9716)
INSERT INTO places (name, geog)
VALUES (
  'MG Road Coffee',
  ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography
);

-- Same insert for geometry table
INSERT INTO places_geom (name, geom)
VALUES (
  'MG Road Coffee',
  ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)
);
```

Create the GiST index. Without this, every query below does a sequential scan:

```sql
-- For geography
CREATE INDEX idx_places_geog ON places USING GIST (geog);

-- For geometry
CREATE INDEX idx_places_geom ON places_geom USING GIST (geom);

-- Let the planner know about the distribution
ANALYZE places;
```

Find everything within 2000 meters. This is the query you actually ship for "nearby":

```sql
-- Geography version — distance is in meters, index is used
SELECT id, name,
       ST_Distance(geog, ST_SetSRID(ST_MakePoint(77.60, 12.97), 4326)::geography) AS dist_m
FROM places
WHERE ST_DWithin(
  geog,
  ST_SetSRID(ST_MakePoint(77.60, 12.97), 4326)::geography,
  2000
)
ORDER BY dist_m;
```

```sql
-- Geometry version — ST_DWithin in degrees if you stay in 4326, so cast or transform
-- Better: cast to geography for correct meters, still uses the index
SELECT id, name
FROM places_geom
WHERE ST_DWithin(
  geom::geography,
  ST_SetSRID(ST_MakePoint(77.60, 12.97), 4326)::geography,
  2000
);
```

Find the 10 closest places without scanning the whole table. This uses the KNN operator `<->`, which is GiST-accelerated:

```sql
-- KNN nearest neighbors — uses GiST, does not compute distance for every row
SELECT id, name,
       ST_Distance(geog, ST_SetSRID(ST_MakePoint(77.60, 12.97), 4326)::geography) AS dist_m
FROM places
ORDER BY geog <-> ST_SetSRID(ST_MakePoint(77.60, 12.97), 4326)::geography
LIMIT 10;
```

Check if a delivery point is inside a service polygon, and export as GeoJSON for the frontend:

```sql
-- Polygon example: is a point inside a delivery zone?
WITH zone AS (
  SELECT ST_SetSRID(ST_GeomFromText('POLYGON((77.5 12.9, 77.7 12.9, 77.7 13.1, 77.5 13.1, 77.5 12.9))'), 4326)::geography AS area
)
SELECT ST_Contains(zone.area::geometry, ST_SetSRID(ST_MakePoint(77.60, 12.97), 4326)) AS inside,
       ST_AsGeoJSON(zone.area::geometry) AS geojson
FROM zone;
```

Transform between coordinate systems when you need planar math in meters:

```sql
-- Convert 4326 degrees to 3857 meters for web-map math
SELECT ST_Transform(ST_SetSRID(ST_MakePoint(77.60, 12.97), 4326), 3857);
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is PostGIS?**

PostGIS is a Postgres extension that adds spatial types, spatial indexes, and spatial functions. In plain words, it teaches Postgres how to store shapes (points, lines, polygons) instead of just numbers, how to index them with a 2D index (GiST) so queries do not scan every row, and how to answer questions like "within X meters," "inside this area," or "closest 10" correctly on a round Earth. You enable it with `CREATE EXTENSION postgis;` and then you get `geometry`/`geography` columns, GiST indexes, and about a thousand `ST_*` functions.

**Q: What is the difference between geometry and geography, and when do you use each?**

Geometry does math on a flat plane. It is fast and flexible, but distances are in the units of whatever SRID you chose, so in SRID 4326 a distance of 1 means one degree. Geography does math on a spheroid. It always assumes SRID 4326 and returns distances in meters, correctly handling curvature. Use geography when you store global GPS lat/lon and want correct "within X meters" without projecting. Use geometry when you are working in a known local projection (like 3857 or a UTM zone) and want speed, or when you need operations that geography does not support well. A simple rule: if your inputs are random GPS points from users and the feature is "nearby in km," start with geography.

**Q: What is an SRID and why does it matter?**

SRID stands for Spatial Reference Identifier. It is a number that says what coordinate system the numbers mean. 4326 means WGS84 lat/lon in degrees — what GPS gives you. 3857 means Web Mercator in meters — what most web maps display. If you store a point as 4326 but query it as if it were 3857, your distances will be nonsense. You set it with `ST_SetSRID` and convert between systems with `ST_Transform`. Mixing SRIDs without transforming is one of the most common PostGIS bugs, and Postgres will often error with "Operation on mixed SRID geometries" rather than give a wrong answer.

**Q: How do you make PostGIS queries fast? What index do you use?**

You create a GiST index on the spatial column: `CREATE INDEX ON places USING GIST (geog)`. GiST builds a tree of bounding boxes, so `ST_DWithin` and `ST_Intersects` can discard most rows without exact math. A B-tree cannot help with 2D shapes. Without GiST, every spatial query is a sequential scan. With GiST, a "within 2km" query on millions of rows goes from seconds to milliseconds. You also want `ANALYZE` so the planner knows the data distribution, and you want to use index-assisted functions — `ST_DWithin` over `ST_Distance(...) < X` for filtering, and `<->` for nearest-neighbor ordering.

**Q: Why not just store lat and lon as floats and compute haversine in the app?**

Three reasons. First, performance. App-side haversine means you fetch every row or run heavy math per row in SQL with no index — it does not scale. Second, correctness. Haversine only handles point-to-point distance. It cannot answer "inside polygon," "do these overlap," or handle poles, the date line, and projections correctly. Third, you lose the database toolkit: no spatial index, no KNN search, no GeoJSON export, no integration with transactions and replication. Floats are fine for displaying a single coordinate. They are the wrong data model for searching by location.

**Q: What is the difference between ST_DWithin and ST_Distance, and which should you use for filtering?**

`ST_DWithin(a, b, dist)` returns true/false for "are these within dist?" and can use a GiST index to skip most rows. `ST_Distance(a, b)` computes the exact distance and, when used as `WHERE ST_Distance(a,b) < X`, cannot use the index efficiently because it must compute the distance for every row first. For filtering, always prefer `ST_DWithin`. Use `ST_Distance` in the `SELECT` list to return the actual distance after filtering, or inside `ORDER BY ... <->` for nearest neighbors.

**Q: How does the KNN operator <-> work?**

`<->` is the "distance" operator that is GiST-aware. When you write `ORDER BY geog <-> search_point LIMIT 10`, Postgres does not compute distance to every row. It walks the GiST tree, visiting the bounding boxes closest to the search point first, and stops after it has found 10 true nearest rows. This is an indexed nearest-neighbor search. Compare that to `ORDER BY ST_Distance(geog, search_point) LIMIT 10`, which must compute distance for all rows and then sort. For "find closest drivers" on a large table, `<->` is often 100x faster.

**Q: What does ST_Transform do?**

It reprojects a geometry from one SRID to another. Example: you stored data in 4326 (degrees) but want to do planar math in meters, so you transform to 3857. You cannot compare or do math on two geometries with different SRIDs — Postgres will error. `ST_Transform(geom, 3857)` returns a new geometry in the target system. Geography does not need this for distance — it already handles meters — but geometry often does.

## 6. The Traps — What Goes Wrong in Production

**Forgetting the GiST index.** This is the most common production failure. PostGIS works without an index, so the query returns correct results in development with 200 rows and you think you are done. At 500k rows the same `ST_DWithin` takes 4 seconds and times out. The fix is always `CREATE INDEX ... USING GIST` and verifying with `EXPLAIN ANALYZE` that you see a "Bitmap Index Scan" or "Index Scan using idx_places_geog" instead of "Seq Scan." Do not use `USING BTREE` — it cannot index shapes.

**Lon/lat swapped.** `ST_MakePoint` takes `lon` first, `lat` second — the opposite of how most people say "lat, lon." Swapping them puts a point in Bangalore into the ocean near Antarctica. No error is thrown, the point is just wrong, and your "nearby" query returns nothing. Always write `ST_MakePoint(lon, lat)` and comment it if needed.

**Wrong SRID or missing SRID.** If you forget `ST_SetSRID`, you get SRID 0 or an implicit default, and later joins or `ST_DWithin` calls fail or give wrong units. If you mix SRIDs — one column in 4326, another in 3857 — Postgres errors with "mixed SRID." The fix is to set SRID at insert and transform explicitly when you need a different system.

**Using degrees as meters.** With `geometry(Point, 4326)`, `ST_Distance` and `ST_DWithin` use degrees. Writing `ST_DWithin(geom, point, 2000)` does not mean 2000 meters — it means 2000 degrees, which is larger than the Earth. Either use `geography` where distance is always meters, or cast `geom::geography`, or transform to a meter-based SRID first.

**Filtering with ST_Distance instead of ST_DWithin.** `WHERE ST_Distance(geog, point) < 2000` looks correct but forces a full scan and per-row math. `WHERE ST_DWithin(geog, point, 2000)` does the same logic but uses the index. In code review, flag any `ST_Distance` in a `WHERE` clause.

**Doing distance math in the app layer.** Pulling thousands of rows to compute haversine in JavaScript or Python wastes network, memory, and CPU, and reintroduces floating-point and curvature bugs. Push the spatial predicate into Postgres where the index lives. Return only the filtered, ordered results and the computed distance as a column.

**Not handling the antimeridian and poles with geometry.** A bounding box query that crosses longitude 180/-180 fails with naive `WHERE lon BETWEEN 179 AND -179`. Geography handles this correctly. If you must use geometry near those edges, you need to split the polygon or use geography.

## 7. Compare With Related Concepts

**PostGIS vs storing lat/lon as two floats.** Floats are just numbers — no type safety, no index for radius, no shape support. PostGIS stores a real spatial object, indexes it in 2D, and gives you correct distance and relationship functions. Use floats only if you never search by location and just display the coordinates. Use PostGIS as soon as you need "nearby," "inside," or "closest." The storage cost is similar, the query capability is not.

**PostGIS geography vs geometry.** Geography is correct and simple for global GPS — meters everywhere, no projection to think about, but slightly slower and with fewer supported functions. Geometry is faster and more feature-complete but requires you to understand SRIDs and projections. Rule: if someone says "within X km of this lat/lon," reach for geography first. If they say "we projected everything to 3857 for the map and need fast polygon overlaps in one city," reach for geometry.

**PostGIS vs MongoDB 2dsphere.** Both do "nearby" and "inside polygon." MongoDB's `2dsphere` index is convenient if you are already on Mongo and only need simple point queries with GeoJSON. PostGIS is far more powerful — richer shape types, more functions, joins with relational data, and mature planner control with `EXPLAIN ANALYZE`. If your app is relational or needs anything beyond basic radius, PostGIS is the stronger choice. If your stack is already Mongo and the spatial needs are minimal, `2dsphere` avoids adding Postgres.

**PostGIS GiST vs B-tree vs SP-GiST/BRIN.** B-tree only helps with one-dimensional ordering, not 2D containment or distance. GiST is the general spatial workhorse for points, polygons, and KNN. SP-GiST can be faster for non-overlapping data like points, and BRIN is tiny and fast for huge, naturally ordered tables (like time-series partitions) but imprecise. Default to GiST unless you have measured a reason to switch.

## 8. 🧠 The Memory Hook

PostGIS turns Postgres from "stores two numbers that happen to be lat and lon" into "stores real shapes on a real Earth, indexes them as boxes in a tree, and measures with the right ruler." If you remember geography equals globe and meters, geometry equals paper and projection, and no GiST means no speed, you will not get tripped in an interview or in production.
