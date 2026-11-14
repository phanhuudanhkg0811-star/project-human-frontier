import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POC_ENV_PATH = process.env.MOON_ENV_PROFILE
  ?? path.join(ROOT, 'nasa/data/calibration/environment_profile_moon_polar.json');
const OUT_CATALOG = path.join(ROOT, 'src', 'data', 'simulation-catalog.json');

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function main() {
  if (!fs.existsSync(POC_ENV_PATH)) {
    throw new Error(`Missing calibrated Moon environment profile at ${POC_ENV_PATH}`);
  }
  const rawPocText = fs.readFileSync(POC_ENV_PATH, 'utf8');
  const pocEnv = JSON.parse(rawPocText);

  const coreCatalog = {
    catalogVersion: '1.2.0-moon32-polar',
    modelVersion: '1.4.2-ts-polar',
    generatedAtUtc: new Date().toISOString(),
    campaign: {
      id: 'moon-32',
      planet: 'moon',
      targetSol: 32,
      lunarDayStartSol: 1,
      lunarDayEndSol: 14,
      lunarNightStartSol: 15,
      lunarNightEndSol: 28,
      lunarDawnResumeSol: 29,
      provenance: 'assumption',
    },
    environment: {
      source: pocEnv.source ?? 'Calibrated from LRO Diviner lunar surface temperature GCP records',
      provenance: 'observed',
      diurnalCycleHours: pocEnv.thermal?.period_days ? pocEnv.thermal.period_days * 24 : 708.7,
      temperatureC: {
        meanC: pocEnv.thermal?.mean_c ?? -55.6177,
        amplitudeC: pocEnv.thermal?.amplitude_c ?? 164.0104,
        dayMaxC: pocEnv.thermal?.day_max_c ?? 117.2871,
        nightMinC: pocEnv.thermal?.night_min_c ?? -171.6508,
        noiseSdC: pocEnv.thermal?.noise_sd_c ?? 26.4013,
        fitR2: pocEnv.thermal?.r2 ?? 0.954,
        shapeExponentK: pocEnv.thermal?.shape_exponent_k,
        provenance: 'observed',
      },
      dustTauMean: 0.0,
      dustNote: 'Atmosphere-free lunar vacuum; Mars dust storm tau does not apply.',
      radiationBaselineMgyPerSol: {
        nominalBackgroundMgy: 0.38,
        shelterReductionPct: 0.55,
        provenance: 'inferred',
      },
      earthMoonCommsDelaySec: {
        oneWaySec: 1.28,
        roundTripDisplaySec: 1.3,
        provenance: 'observed',
      },
    },
    baselineProvenance: {
      divinerThermal: 'observed',
      donkiSpaceWeather: 'observed',
      donkiHazardProbabilities: 'inferred',
      gameplayBalanceOptionA: 'assumption',
    },
  };

  const simulationCatalog = {
    ...coreCatalog,
    provenanceMeta: {
      sourceFiles: ['data/calibration/environment_profile_moon_polar.json'],
      sourceUrls: [
        'https://pds-geosciences.wustl.edu/missions/lro/diviner.htm',
        'https://ssd.jpl.nasa.gov/horizons/',
      ],
      rawInputSha256: sha256Hex(rawPocText),
      normalizedSha256: sha256Hex(JSON.stringify({ campaign: coreCatalog.campaign, environment: coreCatalog.environment })),
    },
  };

  fs.mkdirSync(path.dirname(OUT_CATALOG), { recursive: true });
  fs.writeFileSync(OUT_CATALOG, JSON.stringify(simulationCatalog, null, 2) + '\n', 'utf8');
  console.log(`Saved ${OUT_CATALOG}`);
}

main();
