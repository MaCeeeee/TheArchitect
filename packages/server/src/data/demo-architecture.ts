// Demo seed data: Enterprise Banking Platform
// 16 elements across 3 layers, 22 connections

export interface DemoElement {
  id: string;
  type: string;
  name: string;
  description: string;
  layer: string;
  togafDomain: string;
  maturityLevel: number;
  riskLevel: string;
  status: string;
  position3D: { x: number; y: number; z: number };
  metadata: Record<string, unknown>;
}

export interface DemoConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  label: string;
}

// ── Business Layer (5 elements, y=4) ──

const BIZ_CUSTOMER_ONBOARDING = 'demo-biz-customer-onboarding';
const BIZ_LOAN_PROCESSING = 'demo-biz-loan-processing';
const BIZ_PAYMENT_GATEWAY = 'demo-biz-payment-gateway';
const BIZ_FRAUD_DETECTION = 'demo-biz-fraud-detection';
const BIZ_REGULATORY_REPORTING = 'demo-biz-regulatory-reporting';

// ── Application Layer (6 elements, y=0) ──

const APP_API_GATEWAY = 'demo-app-api-gateway';
const APP_AUTH_SERVICE = 'demo-app-auth-service';
const APP_ACCOUNT_SERVICE = 'demo-app-account-service';
const APP_TRANSACTION_SERVICE = 'demo-app-transaction-service';
const APP_NOTIFICATION_SERVICE = 'demo-app-notification-service';
const APP_ANALYTICS_ENGINE = 'demo-app-analytics-engine';

// ── Technology Layer (5 elements, y=-4) ──

const TECH_POSTGRES = 'demo-tech-postgres-cluster';
const TECH_REDIS = 'demo-tech-redis-cache';
const TECH_KAFKA = 'demo-tech-kafka-bus';
const TECH_S3 = 'demo-tech-s3-storage';
const TECH_K8S = 'demo-tech-k8s-cluster';

export const DEMO_PROJECT_NAME = 'Demo: Enterprise Banking Platform';

export const DEMO_ELEMENTS: DemoElement[] = [
  // ── Business Layer ──
  {
    id: BIZ_CUSTOMER_ONBOARDING,
    type: 'business_capability',
    name: 'Customer Onboarding',
    description: 'End-to-end KYC verification, identity proofing, and account opening workflow for retail and commercial customers.',
    layer: 'business',
    togafDomain: 'business',
    maturityLevel: 4,
    riskLevel: 'medium',
    status: 'current',
    position3D: { x: -6, y: 4, z: 0 },
    metadata: { cost: '$450K/yr', owner: 'Retail Banking', technology: 'React + Node.js' },
  },
  {
    id: BIZ_LOAN_PROCESSING,
    type: 'business_capability',
    name: 'Loan Processing',
    description: 'Automated credit scoring, underwriting decisions, and loan origination pipeline supporting mortgage, personal, and commercial loans.',
    layer: 'business',
    togafDomain: 'business',
    maturityLevel: 3,
    riskLevel: 'high',
    status: 'current',
    position3D: { x: -3, y: 4, z: 0 },
    metadata: { cost: '$1.2M/yr', owner: 'Credit Risk', technology: 'Java + Spring Boot' },
  },
  {
    id: BIZ_PAYMENT_GATEWAY,
    type: 'business_capability',
    name: 'Payment Gateway',
    description: 'Multi-channel payment processing supporting SWIFT, SEPA, ACH, and real-time payments with fraud screening.',
    layer: 'business',
    togafDomain: 'business',
    maturityLevel: 5,
    riskLevel: 'critical',
    status: 'current',
    position3D: { x: 0, y: 4, z: 0 },
    metadata: { cost: '$2.1M/yr', owner: 'Payment Operations', technology: 'Go + gRPC' },
  },
  {
    id: BIZ_FRAUD_DETECTION,
    type: 'business_capability',
    name: 'Fraud Detection',
    description: 'Real-time transaction monitoring using ML models, rule engines, and behavioral analytics to detect and prevent fraud.',
    layer: 'business',
    togafDomain: 'business',
    maturityLevel: 4,
    riskLevel: 'critical',
    status: 'current',
    position3D: { x: 3, y: 4, z: 0 },
    metadata: { cost: '$800K/yr', owner: 'Security Operations', technology: 'Python + TensorFlow' },
  },
  {
    id: BIZ_REGULATORY_REPORTING,
    type: 'business_capability',
    name: 'Regulatory Reporting',
    description: 'Automated generation and submission of regulatory reports (Basel III, MiFID II, GDPR) to supervisory authorities.',
    layer: 'business',
    togafDomain: 'business',
    maturityLevel: 2,
    riskLevel: 'high',
    status: 'current',
    position3D: { x: 6, y: 4, z: 0 },
    metadata: { cost: '$350K/yr', owner: 'Compliance', technology: 'Python + Pandas' },
  },

  // ── Application Layer ──
  {
    id: APP_API_GATEWAY,
    type: 'application',
    name: 'API Gateway',
    description: 'Central entry point for all client requests with rate limiting, JWT validation, request routing, and API versioning.',
    layer: 'application',
    togafDomain: 'application',
    maturityLevel: 5,
    riskLevel: 'high',
    status: 'current',
    position3D: { x: -5, y: 0, z: 0 },
    metadata: { cost: '$120K/yr', owner: 'Platform Engineering', technology: 'Kong + Lua' },
  },
  {
    id: APP_AUTH_SERVICE,
    type: 'service',
    name: 'Auth Service',
    description: 'OAuth 2.0 / OpenID Connect identity provider with MFA, SSO federation, and session management.',
    layer: 'application',
    togafDomain: 'application',
    maturityLevel: 4,
    riskLevel: 'critical',
    status: 'current',
    position3D: { x: -3, y: 0, z: 0 },
    metadata: { cost: '$90K/yr', owner: 'Identity Team', technology: 'Node.js + Passport' },
  },
  {
    id: APP_ACCOUNT_SERVICE,
    type: 'service',
    name: 'Account Service',
    description: 'Core banking accounts microservice managing balances, transactions, statements, and account lifecycle events.',
    layer: 'application',
    togafDomain: 'application',
    maturityLevel: 3,
    riskLevel: 'medium',
    status: 'current',
    position3D: { x: -1, y: 0, z: 0 },
    metadata: { cost: '$200K/yr', owner: 'Core Banking', technology: 'Java + Spring Boot' },
  },
  {
    id: APP_TRANSACTION_SERVICE,
    type: 'service',
    name: 'Transaction Service',
    description: 'Event-sourced transaction processing engine handling debits, credits, transfers, and reconciliation.',
    layer: 'application',
    togafDomain: 'application',
    maturityLevel: 4,
    riskLevel: 'high',
    status: 'current',
    position3D: { x: 1, y: 0, z: 0 },
    metadata: { cost: '$300K/yr', owner: 'Core Banking', technology: 'Kotlin + Axon' },
  },
  {
    id: APP_NOTIFICATION_SERVICE,
    type: 'service',
    name: 'Notification Service',
    description: 'Multi-channel notification delivery (email, SMS, push, in-app) with template management and delivery tracking.',
    layer: 'application',
    togafDomain: 'application',
    maturityLevel: 3,
    riskLevel: 'low',
    status: 'current',
    position3D: { x: 3, y: 0, z: 0 },
    metadata: { cost: '$60K/yr', owner: 'Platform Engineering', technology: 'Node.js + Bull' },
  },
  {
    id: APP_ANALYTICS_ENGINE,
    type: 'application',
    name: 'Analytics Engine',
    description: 'Real-time and batch analytics platform for business intelligence, risk dashboards, and regulatory data aggregation.',
    layer: 'application',
    togafDomain: 'application',
    maturityLevel: 2,
    riskLevel: 'medium',
    status: 'current',
    position3D: { x: 5, y: 0, z: 0 },
    metadata: { cost: '$250K/yr', owner: 'Data Engineering', technology: 'Spark + Airflow' },
  },

  // ── Technology Layer ──
  {
    id: TECH_POSTGRES,
    type: 'technology_component',
    name: 'PostgreSQL Cluster',
    description: 'Primary relational database cluster with streaming replication, point-in-time recovery, and connection pooling via PgBouncer.',
    layer: 'technology',
    togafDomain: 'technology',
    maturityLevel: 5,
    riskLevel: 'high',
    status: 'current',
    position3D: { x: -4, y: -4, z: 0 },
    metadata: { cost: '$180K/yr', owner: 'Database Team', technology: 'PostgreSQL 16 + PgBouncer' },
  },
  {
    id: TECH_REDIS,
    type: 'technology_component',
    name: 'Redis Cache',
    description: 'In-memory data store for session management, API response caching, rate limiting counters, and pub/sub messaging.',
    layer: 'technology',
    togafDomain: 'technology',
    maturityLevel: 4,
    riskLevel: 'medium',
    status: 'current',
    position3D: { x: -2, y: -4, z: 0 },
    metadata: { cost: '$45K/yr', owner: 'Platform Engineering', technology: 'Redis 7 Sentinel' },
  },
  {
    id: TECH_KAFKA,
    type: 'technology_component',
    name: 'Kafka Event Bus',
    description: 'Distributed event streaming platform for inter-service communication, event sourcing, and real-time data pipelines.',
    layer: 'technology',
    togafDomain: 'technology',
    maturityLevel: 3,
    riskLevel: 'high',
    status: 'current',
    position3D: { x: 0, y: -4, z: 0 },
    metadata: { cost: '$150K/yr', owner: 'Platform Engineering', technology: 'Confluent Kafka' },
  },
  {
    id: TECH_S3,
    type: 'technology_component',
    name: 'S3 Object Storage',
    description: 'Scalable object storage for documents, statements, regulatory filings, audit logs, and ML model artifacts.',
    layer: 'technology',
    togafDomain: 'technology',
    maturityLevel: 5,
    riskLevel: 'low',
    status: 'current',
    position3D: { x: 2, y: -4, z: 0 },
    metadata: { cost: '$30K/yr', owner: 'Cloud Infrastructure', technology: 'AWS S3 + Lifecycle' },
  },
  {
    id: TECH_K8S,
    type: 'technology_component',
    name: 'Kubernetes Cluster',
    description: 'Container orchestration platform running all microservices with auto-scaling, service mesh, and GitOps deployment.',
    layer: 'technology',
    togafDomain: 'technology',
    maturityLevel: 4,
    riskLevel: 'medium',
    status: 'current',
    position3D: { x: 4, y: -4, z: 0 },
    metadata: { cost: '$400K/yr', owner: 'Cloud Infrastructure', technology: 'EKS + Istio' },
  },
];

export const DEMO_CONNECTIONS: DemoConnection[] = [
  // ── Business → Application (6) ──
  { id: 'demo-conn-01', sourceId: BIZ_CUSTOMER_ONBOARDING, targetId: APP_AUTH_SERVICE, type: 'serving', label: 'Identity Verification' },
  { id: 'demo-conn-02', sourceId: BIZ_CUSTOMER_ONBOARDING, targetId: APP_ACCOUNT_SERVICE, type: 'serving', label: 'Account Creation' },
  { id: 'demo-conn-03', sourceId: BIZ_LOAN_PROCESSING, targetId: APP_ACCOUNT_SERVICE, type: 'serving', label: 'Loan Accounts' },
  { id: 'demo-conn-04', sourceId: BIZ_PAYMENT_GATEWAY, targetId: APP_TRANSACTION_SERVICE, type: 'serving', label: 'Payment Execution' },
  { id: 'demo-conn-05', sourceId: BIZ_FRAUD_DETECTION, targetId: APP_ANALYTICS_ENGINE, type: 'serving', label: 'Risk Scoring' },
  { id: 'demo-conn-06', sourceId: BIZ_REGULATORY_REPORTING, targetId: APP_ANALYTICS_ENGINE, type: 'serving', label: 'Data Aggregation' },

  // ── Application → Application (7) ──
  { id: 'demo-conn-07', sourceId: APP_API_GATEWAY, targetId: APP_AUTH_SERVICE, type: 'flow', label: 'Auth Check' },
  { id: 'demo-conn-08', sourceId: APP_API_GATEWAY, targetId: APP_ACCOUNT_SERVICE, type: 'flow', label: 'Route Requests' },
  { id: 'demo-conn-09', sourceId: APP_API_GATEWAY, targetId: APP_TRANSACTION_SERVICE, type: 'flow', label: 'Route Requests' },
  { id: 'demo-conn-10', sourceId: APP_ACCOUNT_SERVICE, targetId: APP_NOTIFICATION_SERVICE, type: 'triggering', label: 'Account Events' },
  { id: 'demo-conn-11', sourceId: APP_TRANSACTION_SERVICE, targetId: APP_NOTIFICATION_SERVICE, type: 'triggering', label: 'Tx Alerts' },
  { id: 'demo-conn-12', sourceId: APP_TRANSACTION_SERVICE, targetId: APP_ANALYTICS_ENGINE, type: 'flow', label: 'Tx Events' },
  { id: 'demo-conn-13', sourceId: APP_AUTH_SERVICE, targetId: APP_NOTIFICATION_SERVICE, type: 'triggering', label: 'Security Alerts' },

  // ── Application → Technology (7) ──
  { id: 'demo-conn-14', sourceId: APP_ACCOUNT_SERVICE, targetId: TECH_POSTGRES, type: 'serving', label: 'Persistence' },
  { id: 'demo-conn-15', sourceId: APP_TRANSACTION_SERVICE, targetId: TECH_POSTGRES, type: 'serving', label: 'Tx Store' },
  { id: 'demo-conn-16', sourceId: APP_AUTH_SERVICE, targetId: TECH_REDIS, type: 'serving', label: 'Session Cache' },
  { id: 'demo-conn-17', sourceId: APP_API_GATEWAY, targetId: TECH_REDIS, type: 'serving', label: 'Rate Limits' },
  { id: 'demo-conn-18', sourceId: APP_TRANSACTION_SERVICE, targetId: TECH_KAFKA, type: 'flow', label: 'Event Publish' },
  { id: 'demo-conn-19', sourceId: APP_ANALYTICS_ENGINE, targetId: TECH_KAFKA, type: 'flow', label: 'Event Consume' },
  { id: 'demo-conn-20', sourceId: APP_NOTIFICATION_SERVICE, targetId: TECH_S3, type: 'serving', label: 'Template Storage' },

  // ── Technology → Technology (2) ──
  { id: 'demo-conn-21', sourceId: TECH_K8S, targetId: TECH_POSTGRES, type: 'serving', label: 'Orchestrates' },
  { id: 'demo-conn-22', sourceId: TECH_K8S, targetId: TECH_KAFKA, type: 'serving', label: 'Orchestrates' },
];
