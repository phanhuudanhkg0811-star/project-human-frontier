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
