# Geographic source

`natural-earth-10m.json.gz` is a local, compact GeoJSON archive of Natural Earth 5.1.2. See `manifest.json` for the original URLs, SHA-256 hashes and public-domain license. Normal map generation uses this archive offline.

To recreate the archive, download the manifest's two URLs to this directory as `natural-earth-map-units-10m.geojson` and `natural-earth-map-subunits-10m.geojson`, verify their SHA-256 hashes, then run `node scripts/pack-geodata.mjs` from the repository root. Those intermediate downloads are not needed for builds and can be removed afterward.

The archive uses all map units and replaces the USA map unit with the mainland, Alaska and Hawaii subunits. `../geography.mjs` groups continental divisions under their existing ISO game ID, while assigning separate stable IDs to detached overseas units. It corrects known source naming issues for the Spratly Islands and disambiguates the two sides of Saint Martin. Numeric ISO codes are derived from alpha-2 codes because some numeric fields in the source are inconsistent.

`../generate-map.mjs` produces the SVG paths, ocean positions and small-island markers with a single projection. It preserves small rings during simplification and restores D3 ring winding afterward. The overview hides polygons smaller than 0.7 square SVG units; the regional view (4×) keeps polygons above 0.03, and the close view (12×) shows all contours. At most one marker is added per otherwise invisible named territory; coastal islets never receive individual markers. Uncoded disputed slivers remain search-only in the overview. The label point from the source prevents dateline-spanning archipelagos from focusing in the Atlantic. The source's borders are geographic game units, not diplomatic claims.
