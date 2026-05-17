import { DecisionPatternModel } from '../models/DecisionPattern';

interface SeedPattern {
  slug: string;
  name: string;
  description: string;
  category: 'integration' | 'data' | 'security' | 'observability' | 'compute' | 'messaging';
  decisionContext: string;
  complianceScore: { togaf?: number; dora?: number; nis2?: number };
  costRange: '€' | '€€' | '€€€';
  riskLevel: 'low' | 'medium' | 'high';
  lifecycleStatus: 'approved' | 'conditional' | 'investigate' | 'retiring' | 'unapproved';
  whyThis: string;
  detectorRefs: string[];
  tags: string[];
}

const SEED_PATTERNS: SeedPattern[] = [
  {
    slug: 'managed-message-queue',
    name: 'Managed Message Queue',
    description:
      'Use a managed cloud queue service (AWS SQS, Azure Service Bus, GCP Pub/Sub) instead of self-hosted RabbitMQ/Kafka.',
    category: 'messaging',
    decisionContext:
      'You need asynchronous processing with at-least-once delivery, ordering guarantees, and < 100k msgs/sec without operational overhead.',
    complianceScore: { togaf: 85, dora: 90, nis2: 80 },
    costRange: '€€',
    riskLevel: 'low',
    lifecycleStatus: 'approved',
    whyThis:
      'Reduces operational burden (no broker patching, no DR planning) and complies with DORA outage-resilience requirements by inheriting cloud-provider SLAs.',
    detectorRefs: ['async-processing-needed', 'resilience-required'],
    tags: ['queue', 'async', 'managed', 'dora'],
  },
  {
    slug: 'managed-oauth-provider',
    name: 'Managed OAuth/OIDC Provider',
    description:
      'Use a managed identity provider (Auth0, Microsoft Entra ID, AWS Cognito, Okta) instead of building authentication in-house.',
    category: 'security',
    decisionContext:
      'You need OAuth 2.1 / OIDC for user authentication with social login, MFA, and audit logging — without owning credential storage.',
    complianceScore: { togaf: 80, dora: 95, nis2: 90 },
    costRange: '€€',
    riskLevel: 'low',
    lifecycleStatus: 'approved',
    whyThis:
      'Eliminates the credential-storage attack surface, provides NIS2-compliant audit trail out of the box, and ships hardened MFA flows.',
    detectorRefs: ['authentication-required', 'nis2-credential-protection'],
    tags: ['oauth', 'oidc', 'identity', 'mfa', 'nis2'],
  },
  {
    slug: 'opentelemetry-stack',
    name: 'OpenTelemetry Observability Stack',
    description:
      'Standardize on OpenTelemetry (OTel) for traces/metrics/logs with a managed backend (Datadog, Grafana Cloud, New Relic).',
    category: 'observability',
    decisionContext:
      'You need vendor-neutral instrumentation across multiple services with distributed tracing and a single query interface.',
    complianceScore: { togaf: 75, dora: 85, nis2: 70 },
    costRange: '€€€',
    riskLevel: 'low',
    lifecycleStatus: 'approved',
    whyThis:
      'OTel is the CNCF standard — avoids vendor lock-in for instrumentation. Managed backend satisfies DORA Article 28 incident-detection requirements.',
    detectorRefs: ['observability-gap', 'dora-incident-detection'],
    tags: ['otel', 'tracing', 'metrics', 'logs', 'observability'],
  },
  {
    slug: 'managed-api-gateway',
    name: 'Managed API Gateway',
    description:
      'Use a managed API gateway (AWS API Gateway, Azure APIM, Kong Cloud) for north-south traffic, auth, rate-limiting, and contract management.',
    category: 'integration',
    decisionContext:
      'You expose 5+ APIs to internal/external consumers and need centralized auth, throttling, versioning, and analytics.',
    complianceScore: { togaf: 80, dora: 80, nis2: 75 },
    costRange: '€€',
    riskLevel: 'low',
    lifecycleStatus: 'approved',
    whyThis:
      'Centralizes cross-cutting concerns (auth, rate-limit, mTLS) — reduces drift across teams and provides one audit log for compliance.',
    detectorRefs: ['multiple-apis-exposed', 'rate-limiting-required'],
    tags: ['api', 'gateway', 'mTLS', 'rate-limit'],
  },
  {
    slug: 'managed-postgres',
    name: 'Managed Postgres (RDS / Cloud SQL / Azure DB)',
    description:
      'Use a managed Postgres service with point-in-time recovery, read-replicas, and automated patching.',
    category: 'data',
    decisionContext:
      'You need a relational store with ACID semantics, JSONB, full-text search, and operational maturity — without self-hosting.',
    complianceScore: { togaf: 80, dora: 90, nis2: 80 },
    costRange: '€€',
    riskLevel: 'low',
    lifecycleStatus: 'approved',
    whyThis:
      'Postgres covers 80% of relational use-cases. Managed flavor satisfies DORA backup/RPO/RTO requirements via PITR and cross-region snapshots.',
    detectorRefs: ['relational-store-needed', 'dora-backup-requirement'],
    tags: ['postgres', 'rds', 'managed', 'sql'],
  },
  {
    slug: 'managed-kubernetes',
    name: 'Managed Kubernetes (EKS / AKS / GKE)',
    description:
      'Use a managed Kubernetes control plane instead of self-managing kubeadm clusters.',
    category: 'compute',
    decisionContext:
      'You need container orchestration for 10+ services with horizontal scaling, rolling deploys, and policy enforcement.',
    complianceScore: { togaf: 75, dora: 85, nis2: 75 },
    costRange: '€€€',
    riskLevel: 'medium',
    lifecycleStatus: 'conditional',
    whyThis:
      'Cloud-provider handles control-plane upgrades and HA. Medium risk because workload patterns drive significant cost variance — gate on capacity-planning detector.',
    detectorRefs: ['container-orchestration-needed', 'capacity-planning-mature'],
    tags: ['kubernetes', 'eks', 'aks', 'gke', 'orchestration'],
  },
];

export async function seedDecisionPatterns(): Promise<{
  inserted: number;
  existing: number;
}> {
  let inserted = 0;
  let existing = 0;
  for (const p of SEED_PATTERNS) {
    const result = await DecisionPatternModel.updateOne(
      { slug: p.slug },
      { $setOnInsert: p },
      { upsert: true }
    );
    if (result.upsertedCount > 0) inserted++;
    else existing++;
  }
  return { inserted, existing };
}

export const SEED_PATTERN_SLUGS = SEED_PATTERNS.map((p) => p.slug);
