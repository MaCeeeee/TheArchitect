import type { IndustryDefaults, SevenRsStrategy } from '../types/cost.types';

// ─── Industry Benchmark Defaults ───
// Sources: Prosci (700+ orgs), Gartner, HBR, SonarQube (745 apps/365M LOC),
// PMI, Brynjolfsson et al. 2021, Six Sigma literature, FinOps Foundation
export const INDUSTRY_DEFAULTS: IndustryDefaults = {
  hourlyRateDACH: 85,
  cmBudgetPercent: 0.10,
  wrightLearningRate: 0.80,
  defaultDataErrorRate: 0.20,
  migrationCostPerRecord: 1.50,
  maintenanceGrowthRate: 0.10,
  productivityDipPercent: 0.20,
  productivityDipMonths: 4,
  defaultTDR: 0.15,
  discountRate: 0.08,
  successProbPhase1: 0.70,
  successProbPhase2: 0.80,
  successProbPhase3: 0.90,
  copqAsRevenuePercent: 0.20,
  trainingDaysLow: 3,
  trainingDaysMedium: 5,
  trainingDaysHigh: 10,
  cloudWastePercent: 0.30,
  downtimeCostPerHourSME: 14000,
  conditionalRiskDirect: 0.85,
  fluktuationCostMultiplier: 1.75,
  onPremUtilization: 0.60,
  changeSaturationThreshold: 3,
  changeSaturationK: 0.225,
};

// ─── 7 R's Strategy Cost Multipliers ───
// Applied to annualCost to estimate transformation investment
export const SEVEN_RS_MULTIPLIERS: Record<SevenRsStrategy, number> = {
  retain: 0.05,       // Minimal maintenance
  retire: 0.15,       // Decommission + archive
  rehost: 0.30,       // Lift-and-shift (IaaS)
  relocate: 0.25,     // Move to another cloud region/provider
  replatform: 0.50,   // Minor optimization for cloud (PaaS)
  repurchase: 0.70,   // License new SaaS + data migration
  refactor: 1.00,     // Re-architect for cloud-native
};

// ─── Training Days per Strategy ───
export const TRAINING_DAYS_PER_STRATEGY: Record<SevenRsStrategy, number> = {
  retain: 0,
  retire: 1,
  rehost: 2,
  relocate: 2,
  replatform: 5,
  repurchase: 8,
  refactor: 10,
};

// ─── Base Costs by Element Type (Tier 0 fallback) ───
export const BASE_COSTS_BY_TYPE: Record<string, number> = {
  // Application Layer
  application: 50000,
  application_component: 20000,
  application_service: 15000,
  service: 15000,
  application_collaboration: 10000,
  application_interface: 8000,
  application_function: 12000,
  application_interaction: 10000,
  application_process: 12000,
  application_event: 5000,
  data_object: 10000,
  // Technology Layer
  technology_component: 30000,
  infrastructure: 80000,
  platform_service: 25000,
  technology_service: 20000,
  node: 40000,
  device: 15000,
  system_software: 20000,
  technology_collaboration: 10000,
  technology_interface: 8000,
  technology_function: 15000,
  technology_process: 15000,
  technology_interaction: 10000,
  technology_event: 5000,
  artifact: 5000,
  communication_network: 35000,
  path: 5000,
  // Business Layer
  process: 25000,
  business_service: 20000,
  business_actor: 10000,
  business_role: 8000,
  business_collaboration: 12000,
  business_interface: 8000,
  business_function: 15000,
  business_interaction: 10000,
  business_event: 5000,
  business_object: 8000,
  contract: 5000,
  representation: 3000,
  product: 20000,
  // Strategy Layer
  business_capability: 30000,
  value_stream: 25000,
  resource: 15000,
  course_of_action: 10000,
  // Information Layer
  data_entity: 10000,
  data_model: 8000,
  // Motivation Layer
  stakeholder: 5000,
  driver: 3000,
  assessment: 5000,
  goal: 5000,
  outcome: 5000,
  principle: 3000,
  requirement: 5000,
  constraint: 3000,
  meaning: 2000,
  am_value: 2000,
  // Implementation & Migration
  work_package: 20000,
  deliverable: 10000,
  implementation_event: 5000,
  plateau: 15000,
  gap: 8000,
  // Physical
  equipment: 25000,
  facility: 50000,
  distribution_network: 30000,
  material: 10000,
  // Composite
  grouping: 5000,
  location: 10000,
  // AI Extension
  ai_agent: 12000,
};

// ─── Status Multipliers ───
export const STATUS_COST_MULTIPLIERS: Record<string, number> = {
  current: 1.0,
  target: 1.8,
  transitional: 1.5,
  retired: 0.2,
};

// ─── COCOMO II Constants ───
export const COCOMO_A = 2.94;
export const COCOMO_B_BASE = 0.91;
export const COCOMO_SF_INCREMENT = 0.01;
export const COCOMO_SCHEDULE_A = 3.67;
export const COCOMO_SCHEDULE_SE_BASE = 0.28;
export const COCOMO_SCHEDULE_SE_FACTOR = 0.2;
