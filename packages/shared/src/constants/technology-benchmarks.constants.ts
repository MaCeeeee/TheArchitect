/**
 * Technology Benchmark Catalog — Real-World Annual Cost Estimates
 *
 * Sources: AWS/Azure/GCP public pricing (2024-2025), Gartner IT Spending Benchmarks,
 * Flexera State of the Cloud, SaaS vendor pricing pages.
 *
 * Costs are EUR/year for a typical SME deployment (10-50 users, moderate load).
 * Range: low = minimal/dev, mid = typical production, high = enterprise-scale.
 */

// ─── Types ───

export type TechCategory =
  | 'database'
  | 'messaging'
  | 'compute'
  | 'storage'
  | 'saas'
  | 'ai_ml'
  | 'monitoring'
  | 'api_gateway'
  | 'security'
  | 'networking'
  | 'container'
  | 'cicd'
  | 'erp'
  | 'crm'
  | 'structural';

export interface TechnologyBenchmark {
  id: string;
  keywords: RegExp;
  category: TechCategory;
  annualCostRange: { low: number; mid: number; high: number };
  source: string;
  scaleFactor?: 'per_user' | 'per_gb' | 'per_request' | 'fixed';
}

// ─── Zero-Cost Element Types (ArchiMate structural / non-operational) ───

export const ZERO_COST_ELEMENT_TYPES = new Set([
  'data_entity',
  'data_object',
  'data_model',
  'grouping',
  'location',
  'stakeholder',
  'driver',
  'assessment',
  'goal',
  'outcome',
  'principle',
  'requirement',
  'constraint',
  'meaning',
  'am_value',
  'business_object',
  'contract',
  'representation',
  'gap',
  'plateau',
  'implementation_event',
  'business_event',
  'business_interaction',
  'application_event',
  'technology_event',
]);

// ─── Zero-Cost Name Patterns (workflow utility nodes, notes, etc.) ───

export const ZERO_COST_NAME_PATTERN = /^(sticky\s*note\d*|noOp|noop|no.?operation|comment|annotation|note\d*|set\s*schema|merge\d*|aggregate\d*|if\s+task|switch|loop\s+over|split\s*in|split\s*out|remove\s*duplicat|filter|sort|limit|item\s*lists?|respond\s*to\s*webhook|wait|start|end|begin)$/i;

// ─── Technology Benchmarks ───

export const TECHNOLOGY_BENCHMARKS: TechnologyBenchmark[] = [
  // ═══ Databases ═══
  {
    id: 'postgresql',
    keywords: /postgres|pgvector|aurora[\s_-]?postgres|cockroach|timescale|citus/i,
    category: 'database',
    annualCostRange: { low: 1200, mid: 3600, high: 18000 },
    source: 'AWS RDS PostgreSQL Pricing 2025',
  },
  {
    id: 'mysql',
    keywords: /mysql|mariadb|aurora[\s_-]?mysql|percona|planetscale/i,
    category: 'database',
    annualCostRange: { low: 1000, mid: 3000, high: 15000 },
    source: 'AWS RDS MySQL Pricing 2025',
  },
  {
    id: 'mongodb',
    keywords: /mongo|documentdb|cosmos[\s_-]?db/i,
    category: 'database',
    annualCostRange: { low: 1800, mid: 6000, high: 24000 },
    source: 'MongoDB Atlas Pricing 2025',
  },
  {
    id: 'redis',
    keywords: /redis|elasticache|valkey|memcached|dragonfly/i,
    category: 'database',
    annualCostRange: { low: 600, mid: 2400, high: 12000 },
    source: 'AWS ElastiCache Pricing 2025',
  },
  {
    id: 'neo4j',
    keywords: /neo4j|graph[\s_-]?db|neptune|arangodb/i,
    category: 'database',
    annualCostRange: { low: 2400, mid: 7200, high: 30000 },
    source: 'Neo4j Aura Pricing 2025',
  },
  {
    id: 'elasticsearch',
    keywords: /elastic|opensearch|solr|meilisearch|algolia/i,
    category: 'database',
    annualCostRange: { low: 2400, mid: 9600, high: 48000 },
    source: 'Elastic Cloud Pricing 2025',
  },
  {
    id: 'sqlite',
    keywords: /sqlite|duckdb|litestream/i,
    category: 'database',
    annualCostRange: { low: 0, mid: 0, high: 120 },
    source: 'Embedded DB — no hosting cost',
  },
  {
    id: 'mssql',
    keywords: /mssql|sql[\s_-]?server|azure[\s_-]?sql/i,
    category: 'database',
    annualCostRange: { low: 3600, mid: 12000, high: 60000 },
    source: 'Azure SQL Pricing 2025',
  },
  {
    id: 'oracle_db',
    keywords: /oracle[\s_-]?db|oracle[\s_-]?database|oci[\s_-]?db/i,
    category: 'database',
    annualCostRange: { low: 12000, mid: 48000, high: 240000 },
    source: 'Oracle Cloud DB Pricing 2025',
  },
  {
    id: 'supabase',
    keywords: /supabase/i,
    category: 'database',
    annualCostRange: { low: 0, mid: 300, high: 4800 },
    source: 'Supabase Pricing 2025',
  },
  {
    id: 'airtable',
    keywords: /airtable/i,
    category: 'database',
    annualCostRange: { low: 0, mid: 1200, high: 6000 },
    source: 'Airtable Pricing 2025',
    scaleFactor: 'per_user',
  },

  // ═══ Messaging & Queues ═══
  {
    id: 'rabbitmq',
    keywords: /rabbitmq|amqp/i,
    category: 'messaging',
    annualCostRange: { low: 1200, mid: 4800, high: 18000 },
    source: 'CloudAMQP Pricing 2025',
  },
  {
    id: 'kafka',
    keywords: /kafka|confluent|event[\s_-]?stream|ksql/i,
    category: 'messaging',
    annualCostRange: { low: 3600, mid: 18000, high: 72000 },
    source: 'Confluent Cloud Pricing 2025',
  },
  {
    id: 'sqs',
    keywords: /sqs|amazon[\s_-]?queue|azure[\s_-]?queue|cloud[\s_-]?task/i,
    category: 'messaging',
    annualCostRange: { low: 12, mid: 240, high: 2400 },
    source: 'AWS SQS Pricing 2025',
    scaleFactor: 'per_request',
  },
  {
    id: 'nats',
    keywords: /nats|nats\.io/i,
    category: 'messaging',
    annualCostRange: { low: 0, mid: 1800, high: 9600 },
    source: 'Synadia NGS Pricing 2025',
  },

  // ═══ Object Storage ═══
  {
    id: 's3',
    keywords: /\bs3\b|minio|blob[\s_-]?stor|object[\s_-]?stor|cloud[\s_-]?storage|gcs|backblaze|wasabi/i,
    category: 'storage',
    annualCostRange: { low: 120, mid: 600, high: 6000 },
    source: 'AWS S3 Pricing 2025',
    scaleFactor: 'per_gb',
  },
  {
    id: 'file_storage',
    keywords: /google[\s_-]?drive|dropbox|onedrive|nextcloud|sharepoint|box\.com/i,
    category: 'storage',
    annualCostRange: { low: 72, mid: 720, high: 3600 },
    source: 'Cloud file storage avg pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'ftp',
    keywords: /\bftp\b|\bsftp\b|\bssh\b/i,
    category: 'storage',
    annualCostRange: { low: 0, mid: 120, high: 600 },
    source: 'Self-hosted / included in compute',
  },

  // ═══ Compute & Containers ═══
  {
    id: 'kubernetes',
    keywords: /k8s|kubernetes|eks|aks|gke|openshift|rancher/i,
    category: 'container',
    annualCostRange: { low: 6000, mid: 24000, high: 120000 },
    source: 'AWS EKS / Azure AKS Pricing 2025',
  },
  {
    id: 'docker',
    keywords: /docker|container[\s_-]?registry|ecr|gcr|acr/i,
    category: 'container',
    annualCostRange: { low: 0, mid: 600, high: 3600 },
    source: 'Docker Hub / ECR Pricing 2025',
  },
  {
    id: 'lambda',
    keywords: /lambda|cloud[\s_-]?function|azure[\s_-]?function|serverless/i,
    category: 'compute',
    annualCostRange: { low: 0, mid: 360, high: 6000 },
    source: 'AWS Lambda Pricing 2025',
    scaleFactor: 'per_request',
  },
  {
    id: 'ec2',
    keywords: /\bec2\b|virtual[\s_-]?machine|compute[\s_-]?engine|\bvm\b|droplet/i,
    category: 'compute',
    annualCostRange: { low: 1200, mid: 4800, high: 36000 },
    source: 'AWS EC2 / Azure VM Pricing 2025',
  },

  // ═══ SaaS Tools ═══
  {
    id: 'slack',
    keywords: /\bslack\b/i,
    category: 'saas',
    annualCostRange: { low: 0, mid: 960, high: 4800 },
    source: 'Slack Pro/Business+ Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'jira',
    keywords: /\bjira\b|atlassian/i,
    category: 'saas',
    annualCostRange: { low: 0, mid: 4200, high: 21000 },
    source: 'Atlassian Cloud Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'confluence',
    keywords: /confluence/i,
    category: 'saas',
    annualCostRange: { low: 0, mid: 3000, high: 15000 },
    source: 'Atlassian Confluence Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'notion',
    keywords: /\bnotion\b/i,
    category: 'saas',
    annualCostRange: { low: 0, mid: 960, high: 4800 },
    source: 'Notion Team Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'github',
    keywords: /\bgithub\b/i,
    category: 'saas',
    annualCostRange: { low: 0, mid: 2400, high: 12000 },
    source: 'GitHub Team/Enterprise Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'gitlab',
    keywords: /\bgitlab\b/i,
    category: 'saas',
    annualCostRange: { low: 0, mid: 3480, high: 14400 },
    source: 'GitLab Premium/Ultimate Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'salesforce',
    keywords: /salesforce|sfdc|sales[\s_-]?cloud|service[\s_-]?cloud/i,
    category: 'crm',
    annualCostRange: { low: 3000, mid: 18000, high: 90000 },
    source: 'Salesforce Enterprise Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'hubspot',
    keywords: /hubspot/i,
    category: 'crm',
    annualCostRange: { low: 0, mid: 6000, high: 36000 },
    source: 'HubSpot Professional Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'stripe',
    keywords: /stripe|payment[\s_-]?gateway/i,
    category: 'saas',
    annualCostRange: { low: 600, mid: 6000, high: 60000 },
    source: 'Stripe Pricing 2025 (2.9% + processing)',
    scaleFactor: 'per_request',
  },
  {
    id: 'twilio',
    keywords: /twilio|sendgrid/i,
    category: 'saas',
    annualCostRange: { low: 180, mid: 1800, high: 18000 },
    source: 'Twilio / SendGrid Pricing 2025',
    scaleFactor: 'per_request',
  },
  {
    id: 'mailchimp',
    keywords: /mailchimp|email[\s_-]?market/i,
    category: 'saas',
    annualCostRange: { low: 0, mid: 1800, high: 12000 },
    source: 'Mailchimp Standard Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'discord',
    keywords: /discord/i,
    category: 'saas',
    annualCostRange: { low: 0, mid: 0, high: 1200 },
    source: 'Discord free/Nitro Pricing 2025',
  },
  {
    id: 'telegram',
    keywords: /telegram/i,
    category: 'saas',
    annualCostRange: { low: 0, mid: 0, high: 600 },
    source: 'Telegram Bot API — free tier',
  },
  {
    id: 'teams',
    keywords: /microsoft[\s_-]?teams|\bteams\b/i,
    category: 'saas',
    annualCostRange: { low: 0, mid: 1440, high: 7200 },
    source: 'Microsoft 365 Business Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'asana',
    keywords: /asana/i,
    category: 'saas',
    annualCostRange: { low: 0, mid: 1320, high: 6000 },
    source: 'Asana Business Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'trello',
    keywords: /trello/i,
    category: 'saas',
    annualCostRange: { low: 0, mid: 600, high: 2100 },
    source: 'Trello Premium Pricing 2025',
    scaleFactor: 'per_user',
  },

  // ═══ AI / ML ═══
  {
    id: 'openai',
    keywords: /openai|gpt[\s_-]?[34o]|chatgpt|dall[\s_-]?e/i,
    category: 'ai_ml',
    annualCostRange: { low: 1200, mid: 12000, high: 60000 },
    source: 'OpenAI API Pricing 2025',
    scaleFactor: 'per_request',
  },
  {
    id: 'anthropic',
    keywords: /anthropic|claude|haiku|sonnet|opus/i,
    category: 'ai_ml',
    annualCostRange: { low: 1200, mid: 12000, high: 60000 },
    source: 'Anthropic API Pricing 2025',
    scaleFactor: 'per_request',
  },
  {
    id: 'langchain',
    keywords: /langchain|langgraph|rag[\s_-]?agent|vector[\s_-]?store|embedding/i,
    category: 'ai_ml',
    annualCostRange: { low: 600, mid: 6000, high: 36000 },
    source: 'LLM orchestration — API costs + compute',
  },
  {
    id: 'ollama',
    keywords: /ollama|llama|mistral|local[\s_-]?llm/i,
    category: 'ai_ml',
    annualCostRange: { low: 0, mid: 2400, high: 18000 },
    source: 'Self-hosted LLM — GPU compute cost',
  },
  {
    id: 'sagemaker',
    keywords: /sagemaker|vertex[\s_-]?ai|azure[\s_-]?ml|bedrock/i,
    category: 'ai_ml',
    annualCostRange: { low: 2400, mid: 18000, high: 120000 },
    source: 'AWS SageMaker / Vertex AI Pricing 2025',
  },

  // ═══ Monitoring & Observability ═══
  {
    id: 'datadog',
    keywords: /datadog/i,
    category: 'monitoring',
    annualCostRange: { low: 1800, mid: 12000, high: 60000 },
    source: 'Datadog Pro Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'grafana',
    keywords: /grafana/i,
    category: 'monitoring',
    annualCostRange: { low: 0, mid: 3600, high: 18000 },
    source: 'Grafana Cloud Pricing 2025',
  },
  {
    id: 'prometheus',
    keywords: /prometheus|thanos|victoriametrics/i,
    category: 'monitoring',
    annualCostRange: { low: 0, mid: 1200, high: 6000 },
    source: 'Self-hosted — included in compute',
  },
  {
    id: 'newrelic',
    keywords: /new[\s_-]?relic/i,
    category: 'monitoring',
    annualCostRange: { low: 0, mid: 6000, high: 36000 },
    source: 'New Relic Pro Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'sentry',
    keywords: /sentry|error[\s_-]?track/i,
    category: 'monitoring',
    annualCostRange: { low: 0, mid: 1560, high: 9600 },
    source: 'Sentry Team Pricing 2025',
  },

  // ═══ Networking & API Gateways ═══
  {
    id: 'nginx',
    keywords: /nginx|haproxy|envoy|traefik|caddy/i,
    category: 'api_gateway',
    annualCostRange: { low: 0, mid: 1200, high: 6000 },
    source: 'Self-hosted / NGINX Plus Pricing',
  },
  {
    id: 'cloudflare',
    keywords: /cloudflare|cdn|akamai|fastly/i,
    category: 'networking',
    annualCostRange: { low: 0, mid: 2400, high: 24000 },
    source: 'Cloudflare Pro/Business Pricing 2025',
  },
  {
    id: 'api_gateway',
    keywords: /api[\s_-]?gateway|kong|apigee|aws[\s_-]?gateway/i,
    category: 'api_gateway',
    annualCostRange: { low: 360, mid: 3600, high: 24000 },
    source: 'AWS API Gateway / Kong Enterprise Pricing',
    scaleFactor: 'per_request',
  },
  {
    id: 'load_balancer',
    keywords: /load[\s_-]?balanc|alb|nlb|elb/i,
    category: 'networking',
    annualCostRange: { low: 600, mid: 2400, high: 12000 },
    source: 'AWS ALB Pricing 2025',
  },
  {
    id: 'vpn',
    keywords: /\bvpn\b|wireguard|tailscale|zerotier/i,
    category: 'networking',
    annualCostRange: { low: 0, mid: 600, high: 6000 },
    source: 'Tailscale / VPN Pricing 2025',
    scaleFactor: 'per_user',
  },

  // ═══ CI/CD ═══
  {
    id: 'github_actions',
    keywords: /github[\s_-]?action|github[\s_-]?ci/i,
    category: 'cicd',
    annualCostRange: { low: 0, mid: 1200, high: 6000 },
    source: 'GitHub Actions Pricing 2025',
  },
  {
    id: 'gitlab_ci',
    keywords: /gitlab[\s_-]?ci|gitlab[\s_-]?runner/i,
    category: 'cicd',
    annualCostRange: { low: 0, mid: 1200, high: 6000 },
    source: 'GitLab CI/CD Pricing 2025',
  },
  {
    id: 'jenkins',
    keywords: /jenkins|circleci|travis|buildkite|drone/i,
    category: 'cicd',
    annualCostRange: { low: 0, mid: 2400, high: 18000 },
    source: 'CI/CD platform avg pricing 2025',
  },

  // ═══ Security ═══
  {
    id: 'sonarqube',
    keywords: /sonar|snyk|veracode|checkmarx|fortify/i,
    category: 'security',
    annualCostRange: { low: 0, mid: 6000, high: 36000 },
    source: 'SonarQube / Snyk Pricing 2025',
  },
  {
    id: 'vault',
    keywords: /vault|hashicorp|secrets[\s_-]?manag|aws[\s_-]?secrets/i,
    category: 'security',
    annualCostRange: { low: 0, mid: 1200, high: 12000 },
    source: 'HashiCorp Vault Pricing 2025',
  },
  {
    id: 'auth0',
    keywords: /auth0|okta|keycloak|cognito|firebase[\s_-]?auth/i,
    category: 'security',
    annualCostRange: { low: 0, mid: 3600, high: 24000 },
    source: 'Auth0 / Okta Pricing 2025',
    scaleFactor: 'per_user',
  },

  // ═══ ERP & Enterprise ═══
  {
    id: 'sap',
    keywords: /\bsap\b|s\/4[\s_-]?hana|sap[\s_-]?erp|solman/i,
    category: 'erp',
    annualCostRange: { low: 60000, mid: 250000, high: 1200000 },
    source: 'SAP S/4HANA Cloud Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'servicenow',
    keywords: /servicenow|snow[\s_-]?cmdb/i,
    category: 'erp',
    annualCostRange: { low: 12000, mid: 60000, high: 300000 },
    source: 'ServiceNow ITSM Pricing 2025',
    scaleFactor: 'per_user',
  },
  {
    id: 'leanix',
    keywords: /leanix/i,
    category: 'erp',
    annualCostRange: { low: 24000, mid: 60000, high: 180000 },
    source: 'LeanIX EAM Pricing 2025',
    scaleFactor: 'per_user',
  },

  // ═══ Automation ═══
  {
    id: 'n8n',
    keywords: /\bn8n\b/i,
    category: 'saas',
    annualCostRange: { low: 0, mid: 240, high: 2400 },
    source: 'n8n Cloud Pricing 2025',
  },
  {
    id: 'zapier',
    keywords: /zapier|make\.com|integromat/i,
    category: 'saas',
    annualCostRange: { low: 240, mid: 1800, high: 7200 },
    source: 'Zapier Team Pricing 2025',
  },

  // ═══ HTTP / Generic API ═══
  {
    id: 'http_request',
    keywords: /http[\s_-]?request|rest[\s_-]?api|api[\s_-]?call|fetch|axios/i,
    category: 'api_gateway',
    annualCostRange: { low: 0, mid: 0, high: 600 },
    source: 'HTTP calls — marginal cost only',
  },

  // ═══ Workflow Nodes (Zero-Cost) ═══
  {
    id: 'sticky_note',
    keywords: /sticky[\s_-]?note\d*|annotation|comment[\s_-]?node/i,
    category: 'structural',
    annualCostRange: { low: 0, mid: 0, high: 0 },
    source: 'Non-operational — structural element',
  },
  {
    id: 'flow_control',
    keywords: /^(if|switch|merge\d*|aggregate\d*|split|filter|sort|limit|code[\s_-]?node|set[\s_-]?data|rename[\s_-]?keys|compare[\s_-]?datasets|summarize)/i,
    category: 'structural',
    annualCostRange: { low: 0, mid: 0, high: 0 },
    source: 'Non-operational — workflow logic',
  },
  {
    id: 'extract_transform',
    keywords: /extract[\s_-]?from|convert[\s_-]?to|xml[\s_-]?to|json[\s_-]?to|csv[\s_-]?to|spreadsheet|html[\s_-]?to|markdown/i,
    category: 'structural',
    annualCostRange: { low: 0, mid: 0, high: 0 },
    source: 'Non-operational — data transformation',
  },
];
