/**
 * UC-LAW-001 — Anwendbarkeits-Regeln als DATA (Geist von THE-413/ADR-0004 E6:
 * Gesetze sind Datenzeilen, keine Code-Sonderfälle).
 *
 * Zwei Ebenen:
 *  1. SIGNAL_DEFS — gesetzes-unabhängige fachliche Signale, die deterministisch
 *     aus Elementen (Name/Typ/Beschreibung/Sensitivity) und Projekt-Text
 *     (Vision, Beschreibung, Tags) extrahiert werden. Patterns bewusst
 *     GROSSZÜGIG (WFCOMP-Philosophie: False Negative > False Positive gefährlicher).
 *  2. APPLICABILITY_RULES — verbinden Signal → Gesetz mit Gewicht + Begründung.
 *     `corpusSourceIds` referenzieren `NORM_ONTOLOGY.normSources`-Ids; ein neues
 *     Gesetz = neue Regel-Zeile (+ ggf. Ontologie-Zeile), kein Code-Umbau.
 *
 * Score-Kombination: noisy-OR (1 - Π(1-w)) — unabhängige Evidenz verstärkt sich,
 * ohne dass ein Einzelsignal je „überstimmt" wird.
 */

// ─── Signal-Definitionen ─────────────────────────────────────────────

export interface SignalDef {
  id: string;
  label: string;
  description: string;
  /** Element-Typen, die alleine schon zählen (z. B. ai_agent, device). */
  elementTypes?: readonly string[];
  /** Mindestanzahl reiner Typ-Treffer, bevor sie zählen (Default 1). */
  minTypeMatches?: number;
  /** Patterns gegen Element-Name + -Beschreibung. */
  elementPatterns?: readonly RegExp[];
  /** Nur Elemente dieser Typen gegen elementPatterns matchen (leer = alle). */
  elementPatternTypes?: readonly string[];
  /** metadata.sensitivity-Buckets, die zählen (X-Ray: public|internal|confidential|PII). */
  sensitivities?: readonly string[];
  /** Patterns gegen Projekt-Text (Name, Beschreibung, Vision, Tags, Stakeholder). */
  projectPatterns?: readonly RegExp[];
  /** Signal gilt nur, wenn ALLE genannten Signale ebenfalls erkannt sind. */
  requiresSignals?: readonly string[];
}

/** PII-Muster — Superset der wfcomp/scope.ts-Keys, auf Namen/Beschreibungen erweitert. */
const PII_PATTERNS: readonly RegExp[] = [
  /e-?mail/i,
  /\biban\b|\bbic\b|bank.?(account|verbindung)/i,
  /phone|telefon|mobile|handy/i,
  /(first|last|full|sur|given|vor|nach)name|surname/i,
  /birth|geburt|\bdob\b/i,
  /address|adresse|anschrift|strasse|straße|street|postal|\bzip\b|\bplz\b/i,
  /\bssn\b|ustid|tax.?id|steuer(nummer|-id)/i,
  /customer|kunde|kunden|client|mandant/i,
  /\buser(s)?\b|username|user.?(id|profile|data)|benutzer|nutzer/i,
  /person(al)?.?(data|daten)|personenbezogen|\bpii\b|betroffene/i,
  /contact|kontakt/i,
  /member|mitglied/i,
  /employee|mitarbeiter|\bstaff\b|personalnummer|bewerber|applicant/i,
  /account|\bkonto\b/i,
  /profile|profil/i,
  /subscriber|subscription|abonnent/i,
  /gender|geschlecht|anrede|salutation|nationalit/i,
  /\bcrm\b|newsletter|marketing.?(list|daten)/i,
  /identity|identität|ausweis|passport/i,
];

const AI_PATTERNS: readonly RegExp[] = [
  /\ba\.?i\.?\b|\bk\.?i\.?\b|artificial intelligence|künstliche intelligenz/i,
  /\bml\b|machine.?learning|deep.?learning|neural|reinforcement/i,
  /\bllm\b|\bgpt\b|claude|gemini|foundation model|transformer/i,
  /copilot|chat.?bot|assistant|agent(en)?\b/i,
  /recommend(er|ation)|predicti(on|ve)|forecast|scoring|classif(y|ier|ication)/i,
  /computer.?vision|image recognition|\bocr\b|\bnlp\b|speech|sprachmodell/i,
  /anomaly detection|fraud detection|betrugserkennung/i,
];

const HIGH_RISK_AI_CONTEXT: readonly RegExp[] = [
  /recruit|bewerb|hiring|\bhr\b|human resources|personalauswahl/i,
  /credit|kredit|bonität|creditworth|scoring|loan|darlehen/i,
  /biometri|face|gesicht|fingerprint|emotion/i,
  /law enforcement|polizei|justiz|asyl|migration|border|grenz/i,
  /education|prüfung|exam|studien|zulassung/i,
  /essential (service|infrastructure)|kritische infrastruktur|safety component|sicherheitskomponente/i,
  /medical|diagnos|patient|triage/i,
  /insurance|versicherungstarif|risk assessment|risikobewertung/i,
];

const IOT_PATTERNS: readonly RegExp[] = [
  /\biot\b|internet of things|connected (car|vehicle|device|product|machine)/i,
  /sensor|telemetr|firmware|embedded|edge device|gateway/i,
  /smart.?(home|meter|device|factory|building|watch|city)/i,
  /maschinen(daten|park)|machinery|anlagen(daten)?|\bscada\b|\bplc\b|steuergerät/i,
  /wearable|tracker|vehicle data|fahrzeugdaten/i,
];

const CLOUD_PATTERNS: readonly RegExp[] = [
  /cloud|saas|paas|iaas|hosting|managed service/i,
  /\baws\b|amazon web services|azure|\bgcp\b|google cloud|hetzner|hostinger/i,
  /kubernetes|container|docker|serverless|lambda/i,
  /rechenzentrum|data.?cent(er|re)|colocation/i,
];

const CRITICAL_SECTOR_PATTERNS: readonly RegExp[] = [
  /energy|energie|strom|power (grid|plant)|gas|fernwärme|oil|öl/i,
  /water|wasser|abwasser|sewage/i,
  /transport|logisti|rail|bahn|aviation|luftfahrt|airline|airport|hafen|\bport\b|shipping|maritime/i,
  /health|gesundheit|hospital|krankenhaus|klinik|care|pflege|laborator/i,
  /telecom|telekommunikation|\bisp\b|\bdns\b|\btld\b|trust service|vertrauensdienst/i,
  /public administration|öffentliche verwaltung|behörde|kommune|municipal/i,
  /space|raumfahrt|satellite|satellit/i,
  /post|kurier|courier/i,
  /abfall|waste|entsorgung/i,
  /chemi|chemical/i,
  /food|lebensmittel|ernährung/i,
  /pharma|medizinprodukt|medical device/i,
  /banking|bank\b|finanzmarkt|financial market/i,
  /digital (infrastructure|provider)|marketplace|online.?marktplatz|search engine|suchmaschine|social network|soziales netzwerk/i,
];

const FINANCE_PATTERNS: readonly RegExp[] = [
  /\bbank(ing|en)?\b|sparkasse|volksbank/i,
  /payment|zahlung(sverkehr|sdienst)?|\bpsp\b|acquiring|issuing/i,
  /insurance|versicher/i,
  /trading|broker|börse|exchange|wertpapier|securities/i,
  /fintech|neobank|robo.?advisor/i,
  /credit|kredit|lending|leasing|factoring|darlehen/i,
  /custody|depot|verwahr/i,
  /crypto.?(asset|währung)|krypto|token|wallet/i,
  /asset management|fonds|investment|kapitalanlage/i,
];

const SUPPLY_CHAIN_PATTERNS: readonly RegExp[] = [
  /supplier|lieferant/i,
  /procurement|beschaffung|einkauf|sourcing/i,
  /supply.?chain|lieferkette/i,
  /vendor management/i,
  /rohstoff|raw material/i,
  /produktion|manufacturing|fertigung|werk\b|fabrik|factory/i,
  /import|export|zoll|customs/i,
];

const SECURITY_PATTERNS: readonly RegExp[] = [
  /\bauth(entication|orization)?\b|\bsso\b|\biam\b|identity provider|\bmfa\b|\b2fa\b/i,
  /firewall|\bwaf\b|intrusion|\bids\b|\bips\b/i,
  /encrypt|verschlüssel|\btls\b|certificate|zertifikat|\bpki\b/i,
  /\bsiem\b|security operations|\bsoc\b|incident (response|management)/i,
  /\bvpn\b|zero.?trust/i,
  /backup|disaster recovery|notfall/i,
  /vulnerab|schwachstelle|patch|penetration|pentest/i,
];

const HEALTH_DATA_PATTERNS: readonly RegExp[] = [
  /patient/i,
  /medical|mediz|clinical|klinisch/i,
  /diagnos|therap|behandlung|treatment/i,
  /health (record|data)|gesundheitsdaten|\behr\b|\bepa\b/i,
  /medikament|medication|rezept|prescription/i,
];

const CUSTOMER_FACING_TYPES = ['business_actor', 'business_role', 'stakeholder'] as const;
// Nur echte Produkt-Hardware — facility/material (Gebäude, Rohstoffe) sind physisch,
// aber keine „connected products"; IoT-Namen fangen die Patterns.
const CONNECTED_PRODUCT_TYPES = ['device', 'equipment'] as const;
const TECH_TYPES = ['node', 'system_software', 'technology_service', 'technology_interface', 'artifact', 'communication_network', 'path'] as const;

export const SIGNAL_DEFS: readonly SignalDef[] = [
  {
    id: 'personal-data',
    label: 'Personal data processing',
    description: 'Elements whose name/description indicates personal data (PII) — customers, users, employees, contact or account data.',
    elementPatterns: PII_PATTERNS,
    sensitivities: ['PII'],
  },
  {
    id: 'pii-classified',
    label: 'Elements classified as PII',
    description: 'Elements explicitly classified as PII via the sensitivity metadata (X-Ray sensitivity view).',
    sensitivities: ['PII'],
  },
  {
    id: 'customer-facing',
    label: 'Natural persons as actors',
    description: 'Business actors/roles representing natural persons (customers, users, employees, patients).',
    elementPatternTypes: CUSTOMER_FACING_TYPES,
    elementPatterns: [
      /customer|kunde|consumer|verbraucher/i,
      /\buser\b|nutzer|benutzer/i,
      /employee|mitarbeiter|bewerber|applicant/i,
      /patient|citizen|bürger|member|mitglied/i,
    ],
  },
  {
    id: 'health-data',
    label: 'Health context',
    description: 'Elements or project context around patients, diagnoses or health records (GDPR Art. 9 special categories, NIS2 health sector).',
    elementPatterns: HEALTH_DATA_PATTERNS,
    projectPatterns: HEALTH_DATA_PATTERNS,
  },
  {
    id: 'ai-components',
    label: 'AI components',
    description: 'AI agents or elements indicating machine learning, LLMs, chatbots, scoring or prediction.',
    elementTypes: ['ai_agent'],
    elementPatterns: AI_PATTERNS,
    projectPatterns: AI_PATTERNS,
  },
  {
    id: 'high-risk-ai-context',
    label: 'Potential high-risk AI context',
    description: 'AI components combined with high-risk domains from AI Act Annex III (HR, credit scoring, biometrics, critical infrastructure, health).',
    requiresSignals: ['ai-components'],
    elementPatterns: HIGH_RISK_AI_CONTEXT,
    projectPatterns: HIGH_RISK_AI_CONTEXT,
  },
  {
    id: 'connected-products',
    label: 'Connected products / IoT',
    description: 'Device/equipment elements or IoT/telemetry indicators — connected products generate in-scope data.',
    elementTypes: CONNECTED_PRODUCT_TYPES,
    elementPatterns: IOT_PATTERNS,
    projectPatterns: IOT_PATTERNS,
  },
  {
    id: 'cloud-services',
    label: 'Cloud / data processing services',
    description: 'Cloud, SaaS or data-center components — relevant for switching/interoperability duties and digital-infrastructure rules.',
    elementPatterns: CLOUD_PATTERNS,
    projectPatterns: CLOUD_PATTERNS,
  },
  {
    id: 'critical-sector',
    label: 'Essential/important sector (NIS2 Annex)',
    description: 'Sector indicators from NIS2 Annex I/II: energy, transport, health, water, digital infrastructure, public administration, food, chemicals …',
    elementPatterns: CRITICAL_SECTOR_PATTERNS,
    projectPatterns: CRITICAL_SECTOR_PATTERNS,
  },
  {
    id: 'financial-sector',
    label: 'Financial sector',
    description: 'Banking, payment, insurance, trading or crypto-asset indicators.',
    elementPatterns: FINANCE_PATTERNS,
    projectPatterns: FINANCE_PATTERNS,
  },
  {
    id: 'supply-chain',
    label: 'Supply chain / procurement',
    description: 'Suppliers, procurement, sourcing or manufacturing elements.',
    elementPatterns: SUPPLY_CHAIN_PATTERNS,
    projectPatterns: SUPPLY_CHAIN_PATTERNS,
  },
  {
    id: 'security-baseline',
    label: 'Security-relevant technology estate',
    description: 'Security components (IAM, encryption, SIEM …) or a substantial technology layer (≥3 technology elements) that warrants an ISMS baseline.',
    elementPatterns: SECURITY_PATTERNS,
    elementTypes: TECH_TYPES,
    minTypeMatches: 3,
  },
] as const;

// ─── Regeln: Signal → Gesetz ─────────────────────────────────────────

export interface RuleContribution {
  signalId: string;
  weight: number; // ∈ (0,1] — noisy-OR-Beitrag
  rationale: string;
}

export interface ApplicabilityRule {
  /** Sprachneutrale Familien-Id (ai-act-de/-en → 'ai-act'). */
  ruleId: string;
  label: string;
  /** Ontologie-Ids (`NORM_ONTOLOGY.normSources`) — Reihenfolge = Präferenz. */
  corpusSourceIds: readonly string[];
  jurisdiction: string;
  kind: string; // NormKind (E6)
  bindingness: string; // Bindingness (E6)
  contributions: readonly RuleContribution[];
  /** Was die Heuristik NICHT prüfen kann (Schwellenwerte, Rollen) — ehrlich ausweisen. */
  baselineNote?: string;
  /** Erkennt hochgeladene Standards (Upload-Welt) als „referenced" — Titel-Match. */
  uploadTitlePatterns?: readonly RegExp[];
}

export const APPLICABILITY_RULES: readonly ApplicabilityRule[] = [
  {
    ruleId: 'dsgvo',
    label: 'GDPR / DSGVO',
    corpusSourceIds: ['dsgvo'],
    jurisdiction: 'EU',
    kind: 'legislation',
    bindingness: 'binding',
    contributions: [
      { signalId: 'personal-data', weight: 0.7, rationale: 'The architecture contains elements that process personal data (PII indicators in names/descriptions).' },
      { signalId: 'pii-classified', weight: 0.75, rationale: 'Elements are explicitly classified as PII in the sensitivity metadata.' },
      { signalId: 'customer-facing', weight: 0.35, rationale: 'Natural persons (customers, users, employees) appear as business actors.' },
      { signalId: 'health-data', weight: 0.3, rationale: 'Health context suggests special categories of personal data (Art. 9 GDPR).' },
    ],
    baselineNote: 'Applies to virtually any organization processing personal data of persons in the EU — role (controller/processor) determines the concrete duties.',
  },
  {
    ruleId: 'ai-act',
    label: 'EU AI Act (Regulation (EU) 2024/1689)',
    corpusSourceIds: ['ai-act-de', 'ai-act-en'],
    jurisdiction: 'EU',
    kind: 'legislation',
    bindingness: 'binding',
    contributions: [
      { signalId: 'ai-components', weight: 0.65, rationale: 'The architecture contains AI components (AI agents, ML/LLM/scoring elements).' },
      { signalId: 'high-risk-ai-context', weight: 0.5, rationale: 'AI is used in a domain listed as high-risk in Annex III (HR, credit, biometrics, critical infrastructure, health).' },
    ],
    baselineNote: 'Duties depend on the role (provider vs. deployer) and the risk class of each AI system — classify each AI component individually.',
  },
  {
    ruleId: 'data-act',
    label: 'EU Data Act (Regulation (EU) 2023/2854)',
    corpusSourceIds: ['data-act-de', 'data-act-en'],
    jurisdiction: 'EU',
    kind: 'legislation',
    bindingness: 'binding',
    contributions: [
      { signalId: 'connected-products', weight: 0.6, rationale: 'Connected products / IoT elements generate product data covered by Data Act access and sharing duties.' },
      { signalId: 'cloud-services', weight: 0.3, rationale: 'Data processing services (cloud/SaaS) fall under the Data Act switching and interoperability rules (Art. 23 ff.).' },
    ],
  },
  {
    ruleId: 'nis2',
    label: 'NIS2 Directive ((EU) 2022/2555)',
    corpusSourceIds: ['nis2'],
    jurisdiction: 'EU',
    kind: 'legislation',
    bindingness: 'binding',
    contributions: [
      { signalId: 'critical-sector', weight: 0.55, rationale: 'Sector indicators match the essential/important entity sectors of NIS2 Annex I/II.' },
      { signalId: 'cloud-services', weight: 0.25, rationale: 'Cloud/data-center services are digital infrastructure under NIS2.' },
      { signalId: 'security-baseline', weight: 0.15, rationale: 'A substantial technology estate indicates cybersecurity risk-management duties would bite.' },
    ],
    baselineNote: 'NIS2 has size thresholds (usually ≥50 employees or ≥€10M turnover) and national transposition — verify entity classification.',
  },
  {
    ruleId: 'dora',
    label: 'DORA (Regulation (EU) 2022/2554)',
    corpusSourceIds: ['dora'],
    jurisdiction: 'EU',
    kind: 'legislation',
    bindingness: 'binding',
    contributions: [
      { signalId: 'financial-sector', weight: 0.7, rationale: 'Financial-sector indicators (banking, payment, insurance, trading, crypto-assets) — DORA governs ICT risk for financial entities.' },
    ],
    baselineNote: 'Applies to financial entities and their critical ICT third-party providers — check whether the organization itself is regulated.',
  },
  {
    ruleId: 'lksg',
    label: 'LkSG (German Supply Chain Due Diligence Act)',
    corpusSourceIds: ['lksg'],
    jurisdiction: 'DE',
    kind: 'legislation',
    bindingness: 'binding',
    contributions: [
      { signalId: 'supply-chain', weight: 0.45, rationale: 'Supply-chain/procurement/manufacturing elements indicate supplier due-diligence exposure.' },
    ],
    baselineNote: 'Only binds companies with ≥1,000 employees in Germany — below the threshold it still arrives indirectly via customer contracts.',
  },
  {
    ruleId: 'iso27001',
    label: 'ISO/IEC 27001 (ISMS)',
    corpusSourceIds: ['iso27001'],
    jurisdiction: 'EU',
    kind: 'technical_standard',
    bindingness: 'voluntary-de-facto',
    contributions: [
      { signalId: 'security-baseline', weight: 0.4, rationale: 'Security components / a substantial technology layer — an ISMS baseline structures exactly these controls.' },
      { signalId: 'personal-data', weight: 0.2, rationale: 'Personal data processing strengthens the case for certified security management (GDPR Art. 32).' },
      { signalId: 'critical-sector', weight: 0.2, rationale: 'In NIS2/DORA-exposed sectors, ISO 27001 is the de-facto evidence baseline.' },
    ],
    baselineNote: 'Not a law — a voluntary standard that serves as evidence towards GDPR Art. 32, NIS2 and DORA duties.',
    uploadTitlePatterns: [/iso[\s/_-]*(iec)?[\s/_-]*27001/i],
  },
] as const;

/** Report-Konstanten — eine Stelle für UI + Tests. */
export const APPLICABILITY_DISCLAIMER =
  'Automated, heuristic decision support based on the architecture model — NOT legal advice. Verify applicability, entity classification and thresholds with your legal/compliance function.';

export const ASSUMED_JURISDICTIONS: readonly string[] = ['EU', 'DE'];

/** Max. Evidenz-Einträge pro Signal im Report (Transparenz ohne Payload-Flut). */
export const MAX_EVIDENCE_PER_SIGNAL = 8;
