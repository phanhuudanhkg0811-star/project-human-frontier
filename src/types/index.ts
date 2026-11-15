import type { OnboardingNoticeCode, OnboardingState } from '../onboarding/types.ts';
import type { NarrativeState } from '../onboarding/narrativePersistence.ts';

export type CampaignId = 'moon-32';
export type CampaignStatus = 'not-started' | 'active' | 'victory' | 'defeat';
export type DifficultyId = 'cadet' | 'standard' | 'hardcore';

export type SolPhase =
  | 'briefing'
  | 'engineering'
  | 'comms'
  | 'rationing'
  | 'resolving'
  | 'debrief'
  | 'terminal';

export type SystemId = 'solar' | 'recycler' | 'scrubber' | 'airlock' | 'fabricator';
export type SystemStatus = 'nominal' | 'degraded' | 'offline';

export type CrewId = 'cmd' | 'eng' | 'doc' | 'geo';
export type CrewCondition = 'fit' | 'injured' | 'evacuated';
export type HungerState = 'ok' | 'hungry' | 'starving';
export type CrewTaskType =
  | 'repair-system'
  | 'upgrade-system'
  | 'rover-operate'
  | 'emergency-response'
  | 'medical-care'
  | 'rest';

export type ConsumableId = 'mre_pack' | 'medkit';
export type EquipmentId =
  | 'core_drill'
  | 'sealant_tape'
  | 'solar_lantern'
  | 'dust_shield'
  | 'radio_repeater'
  | 'cryo_thermal_rig';
export type ItemId = ConsumableId | EquipmentId;
export type EquipmentCondition = 'good' | 'worn' | 'damaged';
export type FabricatorAction = 'craft' | 'upgrade' | 'repair' | 'recycle';

export type PowerConsumerId = 'eclss' | 'wrs' | 'fabricator' | 'rover';
export type CargoPackId = 'oxygen-pack' | 'water-pack' | 'food-med-pack' | 'power-parts-pack';
export type ExpeditionId = 'lunar-crater' | 'regolith-field' | 'polar-psr';
export type DonkiLevel = 'quiet' | 'moderate' | 'storm' | 'extreme';
export type ProvenanceTag = 'observed' | 'inferred' | 'assumption' | 'simulated';
export type EventArtId = 'tech-fault' | 'airlock-leak' | 'solar-particle' | 'robot-signal-loss';
export type EventRepeatPolicy = 'once' | 'cooldown' | 'repeatable';
export type EventResourceKey = 'batteryKWh' | 'oxygenKg' | 'waterL' | 'partsKg' | 'mrePacks' | 'medkits';

export interface AssignedCrewTask {
  readonly type: CrewTaskType;
  readonly targetSystemId?: SystemId;
  readonly targetCrewId?: CrewId;
  readonly partsSpent?: number;
}

export interface CrewMemberState {
  readonly id: CrewId;
  readonly name: string;
  readonly roleTag: string;
  readonly health: number;
  readonly morale: number;
  readonly satiety: number;
  readonly condition: CrewCondition;
  readonly hungerState: HungerState;
  readonly radiationMgy: number;
  readonly assignedTask: AssignedCrewTask | null;
}

export interface StationSystemState {
  readonly id: SystemId;
  readonly level: 1 | 2 | 3;
  readonly integrity: number;
  readonly status: SystemStatus;
}

export interface ResourceState {
  readonly batteryKWh: number;
  readonly oxygenKg: number;
  readonly waterL: number;
  readonly partsKg: number;
  readonly wasteWaterL: number;
  readonly mrePacks: number;
  readonly medkits: number;
  readonly medkitLevel: 1 | 2;
  readonly waterZeroStreak: number;
  readonly oxygenZeroStreak: number;
}

export interface EquipmentItemState {
  readonly id: EquipmentId;
  readonly owned: boolean;
  readonly level: 1 | 2;
  readonly durability: number;
  readonly state: EquipmentCondition;
  readonly reservedForRover: boolean;
}

export interface FabricatorJob {
  readonly action: FabricatorAction;
  readonly itemId: ItemId;
  readonly startedSol: number;
  readonly solsRemaining: number;
  readonly partsSpent: number;
  readonly waterSpent: number;
  readonly batteryReserved: number;
}

export interface FabricatorState {
  readonly usedThisSol: boolean;
  readonly activeJob: FabricatorJob | null;
}

export interface DailyPlan {
  readonly sol: number;
  readonly status: 'draft' | 'committed';
  readonly wrsEnabled: boolean;
  readonly powerPriority: readonly PowerConsumerId[];
  readonly mreTargets: readonly CrewId[];
}

export type RoverMissionStatus =
  | 'scheduled'
  | 'outbound'
  | 'exploring'
  | 'signal-lost'
  | 'recovery-pending'
  | 'completed'
  | 'failed';
export type RoverTravelStatus = 'outbound' | 'exploring';
export type RoverTimelineStage =
  | 'available'
  | 'scheduled'
  | 'launching'
  | 'outbound'
  | 'exploring'
  | 'signal-lost'
  | 'returning'
  | 'completed'
  | 'failed';

export interface RoverIncident {
  readonly kind: 'donki-storm' | 'unmitigated-threat' | 'power-delay' | 'signal-timeout' | 'recovery-timeout';
  readonly occurredSol: number;
  readonly summary: string;
}

export interface RoverMissionRecord {
  readonly expeditionId: ExpeditionId;
  readonly status: RoverMissionStatus;
  readonly scheduledSol: number;
  readonly launchedSol: number | null;
  readonly statusEnteredSol: number;
  readonly expectedReturnSol: number | null;
  readonly launchOperatorCrewId: CrewId;
  readonly recoveryOperatorCrewId: CrewId | null;
  readonly equippedItems: readonly EquipmentId[];
  readonly travelTicksCompleted: number;
  readonly signalLostSols: number;
  readonly resumeStatus: RoverTravelStatus | null;
  readonly recoveryDelaySols: number;
  readonly incidents: readonly RoverIncident[];
}

export interface RoverMissionResult {
  readonly expeditionId: ExpeditionId;
  readonly outcome: 'completed' | 'failed';
  readonly launchedSol: number | null;
  readonly settledSol: number;
  readonly rewardSampleGranted: string | null;
  readonly scienceGranted: number;
  readonly launchOperatorCrewId: CrewId | null;
  readonly recoveryOperatorCrewId: CrewId | null;
  readonly equippedItems: readonly EquipmentId[];
  readonly incidents: readonly RoverIncident[];
}

export interface RoverState {
  readonly activeMission: RoverMissionRecord | null;
  readonly missionHistory: readonly RoverMissionResult[];
}

export interface ActiveEvent {
  readonly eventId: string;
  readonly triggeredAtSol: number;
  readonly deadlineSol: number;
  readonly context: Readonly<Record<string, string | number | boolean>>;
}

export interface EventOccurrenceRecord {
  readonly eventId: string;
  readonly triggeredSol: number;
  readonly settledSol: number;
  readonly outcome: 'resolved' | 'expired';
  readonly choiceId: string | null;
}

export interface PendingFollowUpEvent {
  readonly eventId: string;
  readonly triggerSol: number;
  readonly sourceEventId: string;
  readonly sourceChoiceId: string;
}

export interface EventState {
  readonly activeEventId: string | null;
  readonly activeEvent: ActiveEvent | null;
  readonly resolvedEventIds: readonly string[];
  readonly occurrenceHistory: readonly EventOccurrenceRecord[];
  readonly flags: Readonly<Record<string, boolean | string | number>>;
  readonly pendingFollowUps: readonly PendingFollowUpEvent[];
}

export interface CargoOrder {
  readonly id: string;
  readonly orderedAtSol: number;
  readonly arrivalSol: number;
  readonly slots: Readonly<Partial<Record<CargoPackId, number>>>;
}

export interface RadioMessage {
  readonly id: string;
  readonly sentSol: number;
  readonly prompt: string;
  readonly status: 'transmitting' | 'reply-received';
  readonly reply: string | null;
  readonly replyReadyAtMs: number;
}

export interface LogisticsState {
  readonly activeOrder: CargoOrder | null;
  readonly padCooldownSols: number;
  readonly radioMessages: readonly RadioMessage[];
}

export interface SpaceWeatherOutcome {
  readonly profileId: string;
  readonly solDate: string;
  readonly level: DonkiLevel;
  readonly solarPenaltyPct: number;
  readonly radiationRiskIndex: number;
  readonly commsNoiseIndex: number;
  readonly hardwareStressIndex: number;
  readonly repairSuccessProb: number;
  readonly repairRollOk: boolean;
  readonly roverIncidentProb: number;
  readonly roverIncidentTriggered: boolean;
  readonly radiationDoseMgy: number;
  readonly stormDegradedSystem: SystemId | null;
  readonly headline: string | null;
}

export interface DebriefMetricDelta {
  readonly key: string;
  readonly label: string;
  readonly delta: number;
  readonly unit: string;
}

export interface DebriefContext {
  readonly briefId: string;
  readonly reasonTag: string;
  readonly sourceEventId: string | null;
  readonly sourceChoiceId: string | null;
  readonly evidenceType: ProvenanceTag;
  readonly metricHighlights: readonly DebriefMetricDelta[];
}

export type CampaignReason = 'moon-victory' | 'crew-collapse' | 'oxygen-depleted' | 'water-depleted' | 'final-requirements-unmet' | 'legacy-outcome';
export interface CampaignRequirement {
  readonly id: string;
  readonly met: boolean;
  readonly actual: number;
  readonly target: number;
}
export interface CampaignEvaluation {
  readonly status: 'active' | 'victory' | 'defeat';
  readonly reasonCode: CampaignReason | null;
  readonly requirements: readonly CampaignRequirement[];
  readonly rank: 'S' | 'A' | 'B' | null;
  readonly rankingVersion: string | null;
}
export interface CampaignCheckpoint {
  readonly resources: ResourceState;
  readonly crew: Readonly<Record<CrewId, CrewMemberState>>;
  readonly systems: Readonly<Record<SystemId, StationSystemState>>;
  readonly completedExpeditions: number;
  readonly sciencePoints: number;
  readonly wrsProcessedWasteWaterL: number;
  readonly solarGeneratedKWh: number;
  readonly fissionGeneratedKWh: number;
  readonly batteryOverflowKWh: number;
  readonly essentialUnmetKWh: number;
}

export interface SolSummary {
  /** Null for legacy Sols: historical crew/resources must never be inferred from the current state. */
  readonly checkpoint: CampaignCheckpoint | null;
  readonly sol: number;
  readonly isLunarNight: boolean;
  readonly surfaceTempC: number;
  readonly powerGeneratedKWh: number;
  readonly powerConsumedKWh: number;
  readonly unmetLoads: readonly PowerConsumerId[];
  readonly blackout: boolean;
  readonly wrsRecoveredWaterL: number;
  readonly resourceDeltas: {
    readonly batteryKWh: number;
    readonly oxygenKg: number;
    readonly waterL: number;
    readonly partsKg: number;
    readonly mrePacks: number;
    readonly medkits: number;
  };
  readonly weather: SpaceWeatherOutcome;
  readonly briefId: string;
  readonly debriefContext: DebriefContext | null;
  readonly highlights: readonly string[];
}

export interface DebriefState {
  readonly pendingDismiss: boolean;
  readonly lastSummary: SolSummary | null;
}

export interface MissionLogEntry {
  readonly sol: number;
  readonly phase: SolPhase;
  readonly code: string;
  readonly message: string;
}

export interface MissionHistory {
  readonly summaries: readonly SolSummary[];
  readonly logs: readonly MissionLogEntry[];
}

export interface CampaignState {
  readonly outcome: CampaignEvaluation | null;
  readonly id: CampaignId;
  readonly runId: string;
  readonly planet: 'moon';
  readonly status: CampaignStatus;
  readonly difficulty: DifficultyId;
  readonly seed: number;
  readonly donkiProfileId: string;
  readonly spaceWeatherOverride?: 'quiet';
  readonly targetSol: number;
  readonly sciencePoints: number;
  readonly endReason: string | null;
}

export interface MissionClock {
  readonly sol: number;
  readonly phase: SolPhase;
  readonly resolutionIndex: number;
}

export interface GameState {
  readonly schemaVersion: 4;
  readonly contentVersion: string;
  readonly modelVersion: string;
  readonly catalogVersion: string;
  readonly revision: number;
  readonly campaign: CampaignState;
  readonly clock: MissionClock;
  readonly resources: ResourceState;
  readonly systems: Readonly<Record<SystemId, StationSystemState>>;
  readonly crew: Readonly<Record<CrewId, CrewMemberState>>;
  readonly equipment: Readonly<Record<EquipmentId, EquipmentItemState>>;
  readonly fabricator: FabricatorState;
  readonly dailyPlan: DailyPlan;
  readonly rover: RoverState;
  readonly events: EventState;
  readonly logistics: LogisticsState;
  readonly debrief: DebriefState;
  readonly history: MissionHistory;
}

export interface DonkiSolEntry {
  readonly sol: number;
  readonly date: string;
  readonly level: DonkiLevel;
  readonly radiationRiskIndex: number;
  readonly commsNoiseIndex: number;
  readonly hardwareStressIndex: number;
  readonly solarPenaltyPct: number;
  readonly flares: {
    readonly count: number;
    readonly maxClass: string | null;
    readonly ids: readonly string[];
  };
  readonly cme: {
    readonly count: number;
    readonly maxSpeedKms: number;
    readonly maxHalfAngle: number;
    readonly earthDirectedCount: number;
    readonly ids: readonly string[];
  };
  readonly sep: { readonly count: number; readonly ids: readonly string[] };
  readonly ips: { readonly count: number; readonly ids: readonly string[] };
  readonly notifications: {
    readonly count: number;
    readonly types: readonly string[];
    readonly headline: string | null;
  };
}

export interface DonkiSample {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly solCount: number;
  readonly provenance: ProvenanceTag;
  readonly summary: {
    readonly totalFlares: number;
    readonly xClassFlares: number;
    readonly mClassFlares: number;
    readonly totalCmes: number;
    readonly totalSeps: number;
    readonly totalIps: number;
    readonly totalNotifications: number;
    readonly stormOrExtremeSols: readonly number[];
  };
  readonly sols: readonly DonkiSolEntry[];
}

export interface DonkiCatalog {
  readonly catalogVersion: string;
  readonly generatedAtUtc: string;
  readonly source: string;
  readonly endpointsUsed: readonly string[];
  readonly provenance: ProvenanceTag;
  readonly derivedIndicesProvenance: ProvenanceTag;
  readonly samples: readonly DonkiSample[];
}

export interface BalanceConfig {
  readonly contentVersion: string;
  readonly modelVersion: string;
  readonly catalogVersion: string;
  readonly storages: {
    readonly batteryKWh: { readonly initial: number; readonly max: number; readonly warnBelow: number };
    readonly oxygenKg: { readonly initial: number; readonly max: number; readonly warnBelow: number };
    readonly waterL: { readonly initial: number; readonly max: number; readonly warnBelow: number };
    readonly partsKg: { readonly initial: number; readonly max: number; readonly warnBelow: number };
    readonly wasteWaterL: { readonly initial: number; readonly max: number; readonly warnBelow: number };
  };
  readonly consumables: {
    readonly mrePacks: { readonly initial: number; readonly max: number; readonly satietyRestore: number; readonly massKgApprox: number; readonly warnBelow: number };
    readonly medkits: { readonly initial: number; readonly max: number; readonly healLv1: number; readonly healLv2: number; readonly medicBonus: number };
  };
  readonly power: {
    readonly fissionKWhPerSol: number;
    readonly essentialLoadKWh: number;
    readonly solarByLevelKWh: Readonly<Record<'1' | '2' | '3', number>>;
    readonly blackoutPenalty: { readonly healthDelta: number; readonly moraleDelta: number };
  };
  readonly eclss: {
    readonly oxygenKgPerCrewPerSol: number;
    readonly waterLPerCrewPerSol: number;
    readonly wasteWaterGeneratedPerCrewPerSol: number;
    readonly airlockDegradedLeakO2Kg: number;
    readonly wrsByLevel: Readonly<Record<'1' | '2' | '3', { readonly recoveryRate: number; readonly powerKWh: number; readonly maxBatchL: number }>>;
  };
  readonly crew: {
    readonly satietyDrainPerSol: number;
    readonly injuredBelowHealth: number;
    readonly fitRecoverAtHealth: number;
    readonly tiredBelowMorale: number;
    readonly normalRecoverAtMorale: number;
    readonly restMoraleGain: number;
    readonly restHealthGain: number;
    readonly medicalCareMoraleGain: number;
    readonly medicalCareHealthGain: number;
    readonly hungryMoraleDelta: number;
    readonly starvingHealthDelta: number;
    readonly starvingMoraleDelta: number;
  };
  readonly systems: {
    readonly maxLevel: number;
    readonly repairPartsCost: number;
    readonly upgradePartsByTargetLevel: Readonly<Record<'2' | '3', number>>;
  };
  readonly logistics: {
    readonly maxSlots: number;
    readonly slotWeightKg: number;
    readonly maxPayloadKg: number;
    readonly transitSols: number;
    readonly padCooldownSols: number;
    readonly radioLatencyMs: number;
    readonly groundProcessingMs: number;
    readonly packs: ReadonlyArray<{
      readonly id: CargoPackId;
      readonly name: string;
      readonly nameEn?: string;
      readonly weightKg: number;
      readonly summary: string;
      readonly summaryEn?: string;
      readonly grant: Readonly<Partial<Record<'oxygenKg' | 'waterL' | 'mrePacks' | 'medkits' | 'batteryKWh' | 'partsKg', number>>>;
    }>;
  };
  readonly donkiProbability: {
    readonly repairBaseSuccessProb: number;
    readonly repairHardwareStressWeight: number;
    readonly repairAlexBonus: number;
    readonly repairMinSuccessProb: number;
    readonly roverBaseIncidentProb: number;
    readonly roverStressWeight: number;
    readonly roverBlockedMultiplier: number;
    readonly roverElenaMultiplier: number;
    readonly crewHighRadiationThreshold: number;
    readonly crewShelterProtectionByLevel: Readonly<Record<'1' | '2' | '3', number>>;
    readonly dustShieldRadiationBonus: number;
    readonly backgroundMgyPerSol: number;
    readonly stormPeakExtraMgy: number;
    readonly stormSystemDegradeChance: number;
  };
}

export interface CrewProfileConfig {
  readonly id: CrewId;
  readonly name: string;
  readonly roleTag: string;
  readonly perkId: string;
  readonly perkDescription: string;
  readonly perkDescriptionEn?: string;
  readonly initialHealth: number;
  readonly initialMorale: number;
  readonly initialSatiety: number;
  readonly initialCondition: CrewCondition;
  readonly initialHungerState: HungerState;
  readonly initialRadiationMgy: number;
}

export interface RecipeItemConfig {
  readonly id: ItemId;
  readonly name: string;
  readonly category: 'consumable' | 'equipment';
  readonly rack: 'UL' | 'LR';
  readonly requiredFabricatorLevel: 1 | 2 | 3;
  readonly craftCost: {
    readonly partsKg: number;
    readonly waterL: number;
    readonly batteryKWh: number;
    readonly durationSols: number;
  };
  readonly upgradeCost: {
    readonly partsKg: number;
    readonly waterL: number;
    readonly batteryKWh: number;
    readonly durationSols: number;
  } | null;
  readonly effectSummary: string;
  readonly effectSummaryEn?: string;
  readonly blockThreat: string | null;
}

export interface RecipeCatalog {
  readonly contentVersion: string;
  readonly rules: {
    readonly maxQueueCommandsPerSol: number;
    readonly crewSlotsRequired: number;
    readonly repairCost: { readonly partsKg: number; readonly batteryKWh: number; readonly waterL: number; readonly durationSols: number };
    readonly recycleReturnRate: number;
    readonly recycleDurationSols: number;
  };
  readonly items: readonly RecipeItemConfig[];
}

export interface ExpeditionConfig {
  readonly id: ExpeditionId;
  readonly name: string;
  readonly windowStartSol: number;
  readonly windowEndSol: number;
  readonly durationSols: number;
  readonly launchPowerKWh: number;
  readonly threat: string;
  readonly mitigationOptions: readonly {
    readonly allOf: readonly EquipmentId[];
    readonly requirements?: { readonly minBatteryKWh?: number };
  }[];
  readonly rewardSample: string;
  readonly rewards: {
    readonly partsKg: number;
    readonly batteryKWh: number;
    readonly oxygenKg: number;
    readonly waterL: number;
    readonly science: number;
  };
}

export interface CampaignConfig {
  readonly training: { readonly reportSol: number; readonly minActiveCrew: number; readonly minExpeditions: number };
  readonly ranking: {
    readonly version: string;
    readonly S: { readonly minFitCrew: number; readonly minExpeditions: number };
    readonly A: { readonly minActiveCrew: number; readonly minExpeditions: number };
  };
  readonly contentVersion: string;
  readonly id: CampaignId;
  readonly title: string;
  readonly planet: 'moon';
  readonly targetSol: number;
  readonly milestones: {
    readonly lunarDay: { readonly startSol: number; readonly endSol: number };
    readonly lunarNight: { readonly startSol: number; readonly endSol: number };
    readonly lunarDawn: { readonly startSol: number; readonly endSol: number };
    readonly goldenCrisisSol: number;
    readonly recommendedLastCargoSol: number;
  };
  readonly victory: { readonly reachSol: number; readonly minActiveCrew: number; readonly requirePositiveOxygen: boolean; readonly requirePositiveWater: boolean };
  readonly defeat: { readonly minActiveCrew: number; readonly o2ZeroConsecutiveSols: number; readonly waterZeroConsecutiveSols: number };
  readonly difficultyProfiles: Readonly<
    Record<DifficultyId, { readonly id: DifficultyId; readonly label: string; readonly labelEn?: string; readonly weatherRiskMultiplier: number; readonly eventSeverityMultiplier: number }>
  >;
  readonly expeditions: readonly ExpeditionConfig[];
}

export interface SimulationCatalog {
  readonly catalogVersion: string;
  readonly modelVersion: string;
  readonly campaign: {
    readonly id: CampaignId;
    readonly planet: 'moon';
    readonly targetSol: number;
    readonly lunarDayStartSol: number;
    readonly lunarDayEndSol: number;
    readonly lunarNightStartSol: number;
    readonly lunarNightEndSol: number;
    readonly lunarDawnResumeSol: number;
    readonly provenance: ProvenanceTag;
  };
  readonly environment: {
    readonly source: string;
    readonly provenance: ProvenanceTag;
    readonly diurnalCycleHours: number;
    readonly temperatureC: {
      readonly meanC: number;
      readonly amplitudeC: number;
      readonly dayMaxC: number;
      readonly nightMinC: number;
      readonly noiseSdC: number;
      readonly fitR2: number;
      readonly shapeExponentK?: number;
      readonly provenance: ProvenanceTag;
    };
    readonly dustTauMean: number;
    readonly dustNote: string;
    readonly radiationBaselineMgyPerSol: {
      readonly nominalBackgroundMgy: number;
      readonly shelterReductionPct: number;
      readonly provenance: ProvenanceTag;
    };
    readonly earthMoonCommsDelaySec: {
      readonly oneWaySec: number;
      readonly roundTripDisplaySec: number;
      readonly provenance: ProvenanceTag;
    };
  };
  readonly baselineProvenance: Readonly<Record<string, ProvenanceTag>>;
}

export interface EventTriggerCondition {
  readonly sol?: number;
  readonly solMin?: number;
  readonly solMax?: number;
  readonly isLunarNight?: boolean;
  readonly flagSet?: string;
  readonly flagNotSet?: string;
  readonly flagEquals?: { readonly key: string; readonly value: boolean | string | number };
  readonly choiceMade?: { readonly eventId: string; readonly choiceId: string };
  readonly eventSeen?: string;
  readonly eventNotSeen?: string;
  readonly roverExpeditionId?: ExpeditionId;
  readonly roverStatus?: RoverTimelineStage;
  readonly systemIntegrityBelow?: { readonly id: SystemId; readonly maxIntegrity: number };
  readonly minResource?: Readonly<Partial<Record<EventResourceKey, number>>>;
  readonly maxResource?: Readonly<Partial<Record<EventResourceKey, number>>>;
  readonly crewCondition?: { readonly crewId?: CrewId; readonly condition: CrewCondition };
}

export type EventEffect =
  | { readonly kind: 'resource'; readonly resource: EventResourceKey; readonly delta: number }
  | { readonly kind: 'science'; readonly delta: number }
  | {
      readonly kind: 'crew';
      readonly target: CrewId | 'all';
      readonly healthDelta?: number;
      readonly moraleDelta?: number;
      readonly satietyDelta?: number;
    }
  | { readonly kind: 'equipment-wear'; readonly equipmentId: EquipmentId; readonly wear: number }
  | { readonly kind: 'system-integrity'; readonly systemId: SystemId; readonly delta: number }
  | { readonly kind: 'plan-override'; readonly wrsEnabled?: boolean; readonly extraPowerCostKWh?: number }
  | { readonly kind: 'set-flag'; readonly key: string; readonly value: boolean | string | number }
  | { readonly kind: 'clear-flag'; readonly key: string }
  | {
      readonly kind: 'assign-task';
      readonly crewId: CrewId;
      readonly task: CrewTaskType;
      readonly targetSystemId?: SystemId;
      readonly targetCrewId?: CrewId;
    }
  | {
      readonly kind: 'rover-action';
      readonly action: 'continue-expedition' | 'fail-expedition' | 'recover-signal' | 'delay-1-sol';
      readonly expeditionId?: ExpeditionId;
    }
  | { readonly kind: 'schedule-follow-up'; readonly eventId: string; readonly delaySols: number };

export interface EventChoice {
  readonly id: string;
  readonly label: string;
  readonly labelEn?: string;
  readonly requiresEquipment?: EquipmentId;
  readonly requiresFlag?: string;
  readonly requiresCrew?: {
    readonly crewId: CrewId;
    readonly requireFree?: boolean;
    readonly requireFit?: boolean;
  };
  readonly effects: readonly EventEffect[];
  readonly log: string;
  readonly logEn?: string;
}

export interface EventNode {
  readonly id: string;
  readonly title: string;
  readonly titleEn?: string;
  readonly category: 'ops' | 'hazard' | 'crisis' | 'milestone';
  readonly art: EventArtId;
  readonly priority: number;
  readonly weight: number;
  readonly repeatPolicy: EventRepeatPolicy;
  readonly cooldownSols?: number;
  readonly deadlineOffsetSols?: number;
  readonly scienceBriefId: string | null;
  readonly when: readonly EventTriggerCondition[];
  readonly mandatory: boolean;
  readonly prompt: string;
  readonly promptEn?: string;
  readonly choices: readonly EventChoice[];
  readonly onExpireEffects?: readonly EventEffect[];
}

export interface ScienceBrief {
  readonly id: string;
  readonly tags: readonly string[];
  readonly title: string;
  readonly titleEn?: string;
  readonly content: string;
  readonly contentEn?: string;
  readonly source: string;
  readonly sourceUrl: string;
  readonly provenance: ProvenanceTag;
}

export interface LunarSiteConfig {
  readonly expeditionId: ExpeditionId;
  readonly representativeLocation: {
    readonly name: string;
    readonly latitudeDeg: number;
    readonly longitudeDegEast: number;
    readonly bbox: readonly [number, number, number, number];
    readonly provenance: ProvenanceTag;
    readonly source: string;
  };
  readonly mappingProvenance: ProvenanceTag;
  readonly terrain: {
    readonly productId: string;
    readonly datasetReleaseId: string;
    readonly layerId: string;
    readonly unit: string;
    readonly provenance: ProvenanceTag;
    readonly source: string;
  };
  readonly thermal: {
    readonly productId: string;
    readonly layerId: string;
    readonly unit: string;
    readonly provenance: ProvenanceTag;
    readonly source: string;
  };
  readonly gameplayNote: string;
}

export interface CrewPhysiologyDataset {
  readonly datasetId: string;
  readonly instrumentId: string;
  readonly trajectory: string;
  readonly queryUrl: string;
  readonly sampledPeriod: { readonly startInclusive: string; readonly endExclusive: string };
  readonly recordCount: number;
  readonly absorbedDoseRateUGyPerHour: { readonly mean: number; readonly min: number; readonly max: number };
  readonly convertedMeanMgyPerDay: number;
  readonly conversionFormula: string;
  readonly sha256: string;
  readonly provenance: ProvenanceTag;
  readonly caveat: string;
  readonly source: string;
}

export interface ContentBundle {
  readonly balance: BalanceConfig;
  readonly crewCatalog: readonly CrewProfileConfig[];
  readonly recipes: RecipeCatalog;
  readonly campaign: CampaignConfig;
  readonly catalog: SimulationCatalog;
  readonly donki: DonkiCatalog;
  readonly events: readonly EventNode[];
  readonly briefs: readonly ScienceBrief[];
  readonly lunarSites: readonly LunarSiteConfig[];
  readonly crewPhysiology: CrewPhysiologyDataset;
}

export type GameCommand =
  | {
      readonly type: 'game/start';
      readonly seed?: number;
      readonly difficulty?: DifficultyId;
      readonly donkiProfileId?: string;
      readonly spaceWeatherOverride?: 'quiet';
    }
  | { readonly type: 'phase/advance' }
  | { readonly type: 'event/resolve'; readonly eventId: string; readonly choiceId: string }
  | {
      readonly type: 'crew/assign';
      readonly crewId: CrewId;
      readonly task: CrewTaskType;
      readonly targetSystemId?: SystemId;
      readonly targetCrewId?: CrewId;
    }
  | { readonly type: 'crew/unassign'; readonly crewId: CrewId }
  | { readonly type: 'fabricator/queue'; readonly action: FabricatorAction; readonly itemId: ItemId }
  | { readonly type: 'fabricator/cancel' }
  | { readonly type: 'comms/send-radio'; readonly id: string; readonly message: string; readonly nowMs?: number }
  | { readonly type: 'comms/tick-radio'; readonly nowMs: number }
  | { readonly type: 'comms/order-cargo'; readonly slots: Readonly<Partial<Record<CargoPackId, number>>> }
  | {
      readonly type: 'rover/schedule';
      readonly expeditionId: ExpeditionId;
      readonly equipmentIds: readonly EquipmentId[];
      readonly launchOperatorCrewId: CrewId;
    }
  | { readonly type: 'rover/cancel-schedule' }
  | { readonly type: 'rover/recover-signal' }
  | { readonly type: 'rover/set-recovery-operator'; readonly crewId: CrewId }
  | { readonly type: 'crew/use-medkit'; readonly targetCrewId: CrewId; readonly administeredByCrewId?: CrewId }
  | { readonly type: 'rationing/set-wrs'; readonly enabled: boolean }
  | { readonly type: 'rationing/set-power-priority'; readonly order: readonly PowerConsumerId[] }
  | { readonly type: 'rationing/toggle-mre'; readonly crewId: CrewId; readonly enabled?: boolean }
  | { readonly type: 'sol/end' }
  | { readonly type: 'debrief/dismiss' };

export type ErrorCode =
  | 'E_CONTRACT_MISMATCH'
  | 'E_MODEL_MISMATCH'
  | 'E_CATALOG_MISMATCH'
  | 'E_SAVE_CORRUPTED'
  | 'E_STATE_INVALID'
  | 'E_PLAN_INVALID'
  | 'E_PHASE_INVALID'
  | 'E_INSUFFICIENT_RESOURCE'
  | 'E_RESOLVE_FAILED';

export interface DomainError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
}

export interface DomainEffect {
  readonly type:
    | 'phase-changed'
    | 'event-resolved'
    | 'crew-assigned'
    | 'fabricator-queued'
    | 'cargo-ordered'
    | 'rover-scheduled'
    | 'rover-cancelled'
    | 'rover-signal-recovered'
    | 'rover-recovery-assigned'
    | 'medkit-used'
    | 'sol-resolved'
    | 'debrief-dismissed'
    | 'game-started';
  readonly message: string;
}

export type DispatchResult =
  | { readonly ok: true; readonly state: GameState; readonly effects: readonly DomainEffect[] }
  | { readonly ok: false; readonly state: GameState; readonly error: DomainError };

export type Permission =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: string; readonly message: string };

export interface SimulationRuntimeState {
  readonly status: 'idle' | 'loading' | 'ready' | 'resolving' | 'error';
  readonly loadedModelVersion: string;
  readonly loadedCatalogVersion: string;
  readonly error: DomainError | null;
}

export interface SaveEnvelope {
  readonly schemaVersion: 4;
  readonly savedAt: string;
  readonly appVersion: string;
  readonly contentVersion: string;
  readonly modelVersion: string;
  readonly catalogVersion: string;
  readonly state: GameState;
  readonly checksum: string;
}

export interface ForecastPoint {
  readonly sol: number;
  readonly batteryKWh: number;
  readonly oxygenKg: number;
  readonly waterL: number;
  readonly partsKg: number;
  readonly mrePacks: number;
  readonly isLunarNight: boolean;
  readonly weatherLevel: DonkiLevel;
}

export interface GamePort {
  getSnapshot(): GameState;
  dispatch(command: GameCommand): Promise<DispatchResult>;
  subscribe(listener: () => void): () => void;
  getRuntimeState(): SimulationRuntimeState;
  reset(): Promise<void>;
}

export interface ToastMessage {
  readonly id: string;
  readonly tone: 'info' | 'warn' | 'error' | 'success';
  readonly text: string;
}

export type AppScreen = 'title' | 'intro' | 'cockpit';
export type IntroMode = 'first-run' | 'replay';

export type ActiveModalType =
  | null
  | 'journal'
  | 'starlog'
  | 'character'
  | 'crafting'
  | 'expedition'
  | 'end'
  | 'comms'
  | 'launch'
  | 'menu'
  | 'tutorial'
  | 'about';

export interface UiState {
  readonly appScreen: AppScreen;
  readonly introMode: IntroMode;
  readonly introReturnScreen: 'title' | 'cockpit';
  readonly introSceneIndex: number;
  readonly activeModal: ActiveModalType;
  readonly selectedCrewId: CrewId | null;
  readonly selectedSystemId: SystemId | null;
  readonly selectedEquipmentIds: readonly EquipmentId[];
  readonly devPanelOpen: boolean;
  readonly locale: 'vi' | 'en';
  readonly reducedMotion: boolean;
  readonly audioMuted: boolean;
  readonly tutorialCompleted: boolean;
  readonly tutorialStep: number;
  readonly onboarding: OnboardingState;
  readonly onboardingNoticeCode: OnboardingNoticeCode;
  readonly narrative: NarrativeState;
  readonly toasts: readonly ToastMessage[];
}
