/**
 * Global Forest Watch (GFW) map tile helpers, plus a client-side GPS
 * coordinate parser.
 *
 * The actual GFW *data* query (tree-cover-loss years for a coordinate)
 * is NOT done from the browser — GFW's Data API requires a server-side
 * API key a browser can't safely hold, and doesn't send permissive CORS
 * headers for authenticated calls anyway. That query goes through the
 * backend instead: `verifyDocumentSatellite` in `services/api.ts` calls
 * `POST /shipments/{id}/documents/{id}/verify-satellite`, which reuses
 * the exact same `GeospatialService` the shipment-processing pipeline
 * itself uses — same GFW client, same retry/redirect handling, same EUDR
 * business rules. No `NEXT_PUBLIC_*` key ever needs to be configured.
 *
 * What genuinely IS safe and useful to do straight from the browser is
 * loading GFW's public raster *tiles* for the map overlay — those need
 * no API key at all.
 */

/** Esri World Imagery — real satellite basemap tiles, no key required. */
export const SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const SATELLITE_ATTRIBUTION =
  "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

/** OpenStreetMap — real street basemap tiles, no key required. */
export const STREET_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const STREET_ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * GFW UMD tree-cover-loss dynamic raster tiles. `tcd` is the tree-cover
 * density threshold (%); `start_year`/`end_year` bound the loss window.
 * Rendered semi-transparent over the satellite basemap so cleared areas
 * light up in place.
 */
export function gfwTreeCoverLossTileUrl(startYear = 2001, endYear = 2024, treeCoverDensity = 30): string {
  return (
    "https://tiles.globalforestwatch.org/umd_tree_cover_loss/latest/dynamic/{z}/{x}/{y}.png" +
    `?start_year=${startYear}&end_year=${endYear}&tcd=${treeCoverDensity}`
  );
}
export const GFW_ATTRIBUTION =
  "Tree-cover loss: Hansen/UMD/Google/USGS/NASA, via Global Forest Watch";

/**
 * Best-effort parse of a free-text GPS coordinate string (as extracted
 * from a document, e.g. "6.6885, -1.6244" or "6.6885 N, -1.6244 W") into
 * a lat/lng pair. Used only as a fallback in the UI for documents whose
 * `satellite_verification` wasn't computed at processing time — the
 * backend's own `coordinate_parser.py` is the source of truth for the
 * pipeline itself. Returns null rather than guessing on anything
 * ambiguous.
 */
export function parseGpsCoordinateString(
  raw: string | null | undefined,
): { latitude: number; longitude: number } | null {
  if (!raw) return null;
  const matches = raw.match(/-?\d+(\.\d+)?/g);
  if (!matches || matches.length < 2) return null;

  const latitude = Number.parseFloat(matches[0]!);
  const longitude = Number.parseFloat(matches[1]!);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
}
