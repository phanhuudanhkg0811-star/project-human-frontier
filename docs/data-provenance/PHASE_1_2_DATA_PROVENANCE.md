# Phase 1.2 NASA Data Provenance

This committed summary contains no credentials. Full execution notes remain under the gitignored `local-docs/` directory.

## Lunar mapping products

- Moon Trek documents public OGC WMTS layer access and GetCapabilities-driven tile URLs: <https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon>.
- Terrain source: LRO LOLA Gridded Data Record, `LRO-L-LOLA-4-GDR-V1.0`, release `0030`: <https://pds.nasa.gov/datasearch/subscription-service/data_product_information.cfm?dsid=LRO-L-LOLA-4-GDR-V1.0&releaseid=0030>.
- Thermal source: LRO Diviner Gridded Data Records, `LRO-L-DLRE-5-GDR-V1.0`: <https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=LRO-L-DLRE-5-GDR-V1.0>.
- Moon Trek layer labels pinned in the static catalog are `LRO_LOLA_ClrShade_Global_256ppd_v06`, `LRO_LOLA_ClrShade_SPole875_5mp_v04_EQ`, `LRO_Diviner_ST_Avg_Clr_Global_32ppd`, and `diviner_Clrtbol_min_SP`. LOLA color-hillshade is a rendered visualization of the source DEM, not a raw elevation value.
- Apollo reference coordinates come from NASA NSSDC's LRO-derived landing-site coordinates: <https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html>.
- The Shackleton reference coordinate comes from NASA's south-polar imagery page: <https://moon.nasa.gov/resources/162/on-the-rim/>.

`src/data/lunar-sites.json` intentionally separates observed product/location metadata from the inferred or assumed mapping between those reference areas and fictional gameplay expeditions. It does not claim unsampled point elevation or temperature. LOLA supplies topography; Diviner supplies thermal products.

## Polar thermal profile (Artemis south-pole base)

- Product: Diviner Derived Global Cumulative Product, polar band `global_cumul_avg_cyl_90s80s_002.tab` (LRO-L-DLRE-5-GDR-V1.0, Williams et al. 2017), PDS bundle `urn-nasa-pds-lro_diviner_derived1`: <https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/global_cumul_avg_cyl_90s80s_002.tab>.
- Raw archive: `nasa/data/raw/diviner/diviner_gcp_90s80s.tab` (156,211,313 bytes, SHA-256 recorded in `nasa/data/manifest.json` by `nasa/src/data/downloader.py`).
- Cell used: `-89.25 S, 222.75 E` — nearest 0.5° Diviner GCP cell to Connecting Ridge (`-89.45 S, 222.7 E`), the Artemis III candidate region recorded in `src/data/lunar-sites.json` as `artemis-base-camp`. The site-to-cell choice is a gameplay assumption; no unsampled point temperature is claimed.
- Fit: engine curve `T = night + (day − night) · sin(π·f)^k` over the illuminated local-time window, fit to the cell's 96 local-time bins → `k = 0.79`, `r2 = 0.927`.
- Values committed to `src/data/simulation-catalog.json` (`temperatureC`): `dayMaxC −27.16 °C`, `nightMinC −185.62 °C`, `meanC −117.26 °C`, `noiseSdC 11.73 °C`, `shapeExponentK 0.79`; profile detail: `src/data/environment-profile-moon-polar.json` (committed, no raw table needed). Lab copy: `nasa/data/calibration/environment_profile_moon_polar.json` — local lab only, not committed.
- Contrast with the equatorial band (`00n10n`, `dayMaxC +117.29 °C`): polar daytime highs stay below 0 °C and the cycle minimum approaches −200 °C, matching the Artemis south-pole setting.
- Script: `nasa/scripts/build_diviner_polar.py` is local lab tooling, not committed — it downloads the polar band, parses it with the unchanged `src/data/parsers.py::parse_diviner_gcp`, and fits `T = night + (day − night) · sin(π·f)^k` to the cell's 96 local-time bins (`k = 0.79`, `r2 = 0.927`). `scripts/build-catalog.mjs` reads `src/data/environment-profile-moon-polar.json` via `MOON_ENV_PROFILE`.

## RadLab CRaTER reference sample

- API documentation: <https://visualization.osdr.nasa.gov/radlab/gui/data-api/>.
- Instrument: `CRaTER-D1D2`, LRO lunar orbit.
- Query interval: `2010-01-01` inclusive through `2010-01-04` exclusive.
- Records: `72` hourly values.
- Absorbed dose-rate summary: mean `13.169461805555555 µGy/hour`, min `12.121666666666668`, max `14.383333333333335`.
- Converted mean: `0.3160670833333333 mGy/day`, using `µGy/hour × 24 / 1000`.
- Raw response SHA-256: `d42fb16adb08e2a2d7ce1ad50f975d60ac776564245640bc89e5436c147b637e`.

CRaTER is an orbital measurement. The game uses this sample as a relative educational reference; it is not presented as direct lunar-surface astronaut dose and does not directly set Health/Morale coefficients.

## Credential policy

The public Moon Trek, PDS, NSSDC, and RadLab requests above did not require `NASA_API_KEY`. If a later NASA endpoint needs the key, it must be read from `.env` and redacted from all logs and committed documentation.
