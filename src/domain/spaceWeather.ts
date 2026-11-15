import { deriveRoll } from './prng.ts';
import type {
  BalanceConfig,
  CrewPhysiologyDataset,
  DonkiCatalog,
  DonkiLevel,
  DonkiSolEntry,
  SystemId,
} from '../types/index.ts';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

const QUIET_WEATHER: DonkiSolEntry = {
  sol: 1,
  date: 'QUIET-FIXTURE',
  level: 'quiet',
  radiationRiskIndex: 0,
  commsNoiseIndex: 0,
  hardwareStressIndex: 0,
  solarPenaltyPct: 0,
  flares: { count: 0, maxClass: null, ids: [] },
  cme: { count: 0, maxSpeedKms: 0, maxHalfAngle: 0, earthDirectedCount: 0, ids: [] },
  sep: { count: 0, ids: [] },
  ips: { count: 0, ids: [] },
  notifications: { count: 0, types: [], headline: null },
};

/** Resolve the NASA DONKI space weather bucket for a given profile and Sol (1..32). */
export function getSolWeather(
  catalog: DonkiCatalog,
  profileId: string,
  sol: number,
  override?: 'quiet'
): DonkiSolEntry {
  if (override === 'quiet') {
    return { ...QUIET_WEATHER, sol };
  }
  const sample = catalog.samples.find((s) => s.id === profileId) ?? catalog.samples[0];
  const clampedIdx = clamp(Math.floor(sol) - 1, 0, sample.sols.length - 1);
  return sample.sols[clampedIdx];
}

/**
 * Compute probability in [repairMinSuccessProb, 0.99] that a repair task succeeds cleanly.
 * Interplanetary shocks (IPS), fast CMEs, and high flare stress degrade success probability;
 * assigning Engineer Dmitri grants an expertise bonus.
 */
export function computeRepairSuccessProb(
  weather: DonkiSolEntry,
  balance: BalanceConfig,
  difficultyRiskMult: number,
  options: { readonly isEngineerAssigned: boolean }
): number {
  if (weather.level === 'quiet' && weather.hardwareStressIndex === 0) {
    return 1.0;
  }
  const p = balance.donkiProbability;
  const penalty = weather.hardwareStressIndex * p.repairHardwareStressWeight * difficultyRiskMult;
  const alexBonus = options.isEngineerAssigned ? p.repairEngineerBonus : 0;
  return round4(clamp(p.repairBaseSuccessProb - penalty + alexBonus, p.repairMinSuccessProb, 0.99));
}

/**
 * Compute probability of a Rover telemetry/hardware incident on the current Sol.
 * Unblocked rover hazards keep baseline risk, while fast CME / IPS storms amplify incident odds.
 * Proper BlockThreat equipment lowers risk by `roverBlockedMultiplier`; Trọng cuts risk further.
 */
export function computeRoverRiskProb(
  weather: DonkiSolEntry,
  balance: BalanceConfig,
  difficultyRiskMult: number,
  options: { readonly threatBlocked: boolean; readonly isGeologistOperating: boolean }
): number {
  if (weather.level === 'quiet' && weather.hardwareStressIndex === 0 && weather.commsNoiseIndex === 0) {
    return 0;
  }
  const p = balance.donkiProbability;
  const stormPressure = (weather.hardwareStressIndex * 0.65 + weather.commsNoiseIndex * 0.35) * p.roverStressWeight;
  let prob = (p.roverBaseIncidentProb + stormPressure) * difficultyRiskMult;
  if (options.threatBlocked) {
    prob *= p.roverBlockedMultiplier;
  }
  if (options.isGeologistOperating) {
    prob *= p.roverGeologistMultiplier;
  }
  return round4(clamp(prob, 0.005, 0.92));
}

export interface CrewWeatherRisk {
  readonly radiationDoseMgy: number;
  readonly stormInjuryProb: number;
  readonly stormMoralePenalty: number;
  readonly stormSystemDegradeProb: number;
}

export const DEFAULT_RADLAB_SURFACE_SCALE_FACTOR = 1.20228;

/**
 * Derive lunar surface quiet-day GCR background dose (mGy/Sol) directly from the loaded
 * NASA OSDR RadLab CRaTER orbital dataset (`convertedMeanMgyPerDay`) multiplied by the
 * surface-albedo/duration calibration factor (~1.20228 => 0.3161 * 1.20228 = 0.38 mGy/Sol).
 */
export function computeRadLabSurfaceBaselineMgy(
  crewPhysiology: CrewPhysiologyDataset,
  surfaceScaleFactor = DEFAULT_RADLAB_SURFACE_SCALE_FACTOR
): number {
  return round4(crewPhysiology.convertedMeanMgyPerDay * surfaceScaleFactor);
}

/**
 * Compute expected daily crew radiation dose (mGy), acute flare injury risk, and equipment/system stress
 * driven by NASA DONKI SEP/FLR/IPS indices and grounded by NASA OSDR RadLab baseline data.
 *
 * @assumption Airlock/Storm-Shelter bulkhead level (`systems.airlock`) + operational `dust_shield` equipment
 * proxy habitat storm shielding attenuation rather than CO2 scrubber filtration.
 * Constant galactic cosmic ray (GCR) background (driven by RadLab when supplied, else `backgroundMgyPerSol`)
 * always applies even on quiet Sols.
 */
export function computeCrewWeatherRisk(
  weather: DonkiSolEntry,
  balance: BalanceConfig,
  difficultyRiskMult: number,
  shelterLevel: 1 | 2 | 3,
  shelterIntegrity: number,
  hasDustShield = false,
  crewPhysiology?: CrewPhysiologyDataset
): CrewWeatherRisk {
  const p = balance.donkiProbability;
  const shieldFromHull =
    p.crewShelterProtectionByLevel[String(shelterLevel) as '1' | '2' | '3'] *
    clamp(shelterIntegrity, 0, 1);
  const baseShield = clamp(
    shieldFromHull + (hasDustShield ? p.dustShieldRadiationBonus : 0),
    0,
    0.95
  );
  const effectiveBackgroundMgy = crewPhysiology
    ? computeRadLabSurfaceBaselineMgy(crewPhysiology, p.radlabSurfaceScaleFactor)
    : p.backgroundMgyPerSol;
  const quietBackgroundMgy = round4(effectiveBackgroundMgy * (1 - baseShield * 0.25));

  if (
    weather.level === 'quiet' &&
    weather.radiationRiskIndex === 0 &&
    weather.hardwareStressIndex === 0
  ) {
    return {
      radiationDoseMgy: quietBackgroundMgy,
      stormInjuryProb: 0,
      stormMoralePenalty: 0,
      stormSystemDegradeProb: 0,
    };
  }

  const rawExtraMgy = weather.radiationRiskIndex * p.stormPeakExtraMgy * difficultyRiskMult;
  const radiationDoseMgy = round4(quietBackgroundMgy + rawExtraMgy * (1 - baseShield * 0.8));

  const excessRisk = Math.max(0, weather.radiationRiskIndex - p.crewHighRadiationThreshold);
  const stormInjuryProb = round4(
    clamp(excessRisk * 0.65 * (1 - baseShield) * difficultyRiskMult, 0, 0.6)
  );
  const stormMoralePenalty = weather.level === 'extreme' ? -5 : weather.level === 'storm' ? -2 : 0;

  const stormSystemDegradeProb = round4(
    clamp(
      Math.max(0, weather.hardwareStressIndex - 0.35) * p.stormSystemDegradeChance * (1 - baseShield * 0.5) * difficultyRiskMult,
      0,
      0.45
    )
  );

  return {
    radiationDoseMgy,
    stormInjuryProb,
    stormMoralePenalty,
    stormSystemDegradeProb,
  };
}

/**
 * Compute effective daytime solar derating factor (`solarPenaltyPct`) during DONKI geomagnetic/SEP/CME storms
 * (0 during lunar night). Models protective PV shunt throttling and solar-proton cell degradation—NOT lunar
 * dust clouds, since the atmosphere-free Moon cannot suspend windborne dust.
 */
export function computeWeatherPowerPenalty(weather: DonkiSolEntry, isLunarNight: boolean): number {
  if (isLunarNight) return 0;
  return round4(clamp(weather.solarPenaltyPct, 0, 0.3));
}

export interface WeatherOutlook {
  readonly sol: number;
  readonly date: string;
  readonly level: DonkiLevel;
  readonly repairSuccessProb: number;
  readonly roverIncidentProb: number;
  readonly crewWeatherRisk: CrewWeatherRisk;
  readonly radlabBaselineMgyPerSol?: number;
  readonly solarPenaltyPct: number;
  readonly headline: string | null;
}

export function selectStormTargets(seed: number, sol: number): SystemId {
  const candidates: readonly SystemId[] = ['solar', 'recycler', 'scrubber', 'airlock', 'fabricator'];
  const roll = deriveRoll(seed, sol, 'storm-target');
  const idx = Math.min(candidates.length - 1, Math.floor(roll * candidates.length));
  return candidates[idx];
}
