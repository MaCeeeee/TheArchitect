/**
 * Compliance-Facts v1 — gesetzes-agnostische Fakten-Taxonomie für Architektur-Elemente.
 *
 * Ousterhout-Prinzip (strategische Programmierung): Ein Element deklariert EINMAL,
 * was es ist / hält / tut / wie es betrieben wird — gesetzesfrei. Jedes Gesetz wird
 * ein PRÄDIKAT über diesen Fakten (unten: PREDICATES_V1). Ein neues Gesetz kostet
 * damit 0 Element-Änderungen, solange es keine echt neue Fakten-Dimension braucht
 * (AI Act ⇒ eine neue optionale Dimension `ai`, Minor-Bump — nicht 86 Beschreibungen).
 *
 * Die Fakten leben in Neo4j unter metadataJson.compliance (etabliertes Muster,
 * kompletter API-Schreibpfad existiert). Die Freitext-BESCHREIBUNG bleibt
 * Funktionsprosa für Menschen und wird nie wieder pro Gesetz erweitert.
 *
 * ACHTUNG Schreibpfad: PUT /elements/:id ERSETZT metadataJson vollständig
 * (architecture.routes.ts, kein Merge) — deshalb IMMER mergeComplianceIntoMetadata()
 * benutzen (GET → merge → PUT), sonst werden fremde Marker (isPolicyNode, source,
 * sensitivity …) zerstört, auf deren Roh-Serialisierung policy-evaluation.service
 * per CONTAINS filtert.
 *
 * Design-Dokument: COMPLIANCE_FACTS.md (daneben). Entscheidung: Judge-Panel 2026-07-04.
 * Linear: Epic THE-378.
 */
import { z } from 'zod';

export const FACTS_VERSION = 1 as const;

// ─── Dimension 1: kind — was bin ich? ───────────────────────────

export const KIND_VALUES = ['store', 'service', 'infra', 'external', 'control'] as const;
export type FactsKind = (typeof KIND_VALUES)[number];

// ─── Dimension 2: holds — welche pbD-Kategorien halte/verarbeite ich? ──
//
// Format "kategorie:presence". presence=doc ist die maschinenlesbare Form der
// Rubrik-Zusatzbedingung "explizit dokumentiert" (RUBRIC.md §2.3): Nur doc-Halter
// matchen Stufe-1-Pflichten. maybe = plausibel, aber nicht dokumentiert → no-match
// (konservativ, §4) und zugleich die To-do-Liste für die Daten-Inventur.

export const HOLDS_CATEGORIES = [
  'account', // Name, E-Mail, Profil (DPV pd:Identifying/Contact — Referenz unverifiziert)
  'credentials', // Passwort-Hash, MFA-Secret, API-Keys, Session-Token
  'telemetry', // IP, User-Agent, Session-/Nutzungs-IDs (Art. 4 Nr. 1 — Online-Kennungen)
  'content', // nutzergenerierte Inhalte mit MÖGLICHER pbD (Uploads, Prompts)
  'financial', // Zahlungs-/Rechnungsdaten (heute leer, absehbar bei Billing)
  'special', // Art. 9 DSGVO besondere Kategorien (heute nirgends — bewusst als Leitplanke)
] as const;
export type HoldsCategory = (typeof HOLDS_CATEGORIES)[number];

export const HOLDS_PRESENCE = ['doc', 'maybe'] as const;
export type HoldsPresence = (typeof HOLDS_PRESENCE)[number];

const HOLDS_ENTRY_RE = new RegExp(
  `^(${HOLDS_CATEGORIES.join('|')}):(${HOLDS_PRESENCE.join('|')})$`
);

export interface HoldsEntry {
  category: HoldsCategory;
  presence: HoldsPresence;
}

export function parseHoldsEntry(s: string): HoldsEntry {
  const m = HOLDS_ENTRY_RE.exec(s);
  if (!m) throw new Error(`invalid holds entry "${s}" (expected "<category>:<doc|maybe>")`);
  return { category: m[1] as HoldsCategory, presence: m[2] as HoldsPresence };
}

// ─── Dimension 3: does — welche compliance-relevanten Funktionen führe ich aus? ──
//
// EINE Liste für zwei Rubrik-Konzepte: Stufe-2-Ausführer (ropa→Art. 30,
// breach_notify/incident_response→Art. 33/NIS2 23, dsr→Art. 15/17/20-Prozess)
// UND "Element IST Sicherheitsmaßnahme" (auth/tls/encrypt_rest/backup/audit_log
// → Art. 32, NIS2 21(2)). Abwesenheit = Element tut es nicht.

export const DOES_VALUES = [
  'auth',
  'tls',
  'encrypt_rest',
  'audit_log',
  'backup',
  'incident_response',
  'breach_notify',
  'ropa', // record of processing activities — führt das VVT (Art. 30)
  'dsr', // data subject requests — implementiert Betroffenenrechte-Prozess
] as const;
export type DoesValue = (typeof DOES_VALUES)[number];

// ─── Dimension 4: ops — wo laufe ich, wer betreibt mich, wie kritisch bin ich? ──

export const OPS_LOC = ['eu', 'adequacy', 'us', 'other'] as const;
export const OPS_OP = ['self', 'vendor_processor', 'vendor_other'] as const;
export const OPS_TIER = ['core', 'support', 'dev'] as const;

// ─── Schema ─────────────────────────────────────────────────────

export const ComplianceFactsV1Schema = z.object({
  v: z.literal(FACTS_VERSION),
  kind: z.enum(KIND_VALUES),
  holds: z.array(z.string().regex(HOLDS_ENTRY_RE)).default([]),
  does: z.array(z.enum(DOES_VALUES)).default([]),
  ops: z.object({
    loc: z.enum(OPS_LOC),
    op: z.enum(OPS_OP),
    tier: z.enum(OPS_TIER),
  }),
  /**
   * RESERVIERT für v1.1 (Gap-Analyse: "doc-Halter OHNE Löschfähigkeit").
   * v1 validiert, aber verlangt und nutzt es nicht — Judge-Graft, damit die
   * naheliegendste Kundenfrage später ein additives Update ist, kein Bruch.
   */
  cap: z.array(z.enum(['delete_by_subject', 'export_by_subject', 'retention_policy'])).optional(),
  note: z.string().max(300).optional(),
});

export type ComplianceFactsV1 = z.infer<typeof ComplianceFactsV1Schema>;

/** metadata.compliance aus einem (API- oder Neo4j-)metadata-Objekt lesen. Null = kein Profil. */
export function parseFactsFromMetadata(metadata: unknown): ComplianceFactsV1 | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const c = (metadata as Record<string, unknown>).compliance;
  if (!c) return null;
  const parsed = ComplianceFactsV1Schema.safeParse(c);
  return parsed.success ? parsed.data : null;
}

/**
 * GET→merge→PUT-Baustein: hängt/ersetzt NUR den compliance-Schlüssel und lässt
 * alle anderen metadata-Schlüssel byte-identisch (Schlüssel-Reihenfolge bleibt,
 * weil bestehende Keys zuerst gespreadet werden) — Pflicht wegen des
 * Voll-Ersatz-PUT und der CONTAINS-Queries auf dem Roh-JSON.
 */
export function mergeComplianceIntoMetadata(
  existingMetadata: Record<string, unknown> | null | undefined,
  facts: ComplianceFactsV1
): Record<string, unknown> {
  return { ...(existingMetadata ?? {}), compliance: facts };
}

// ─── Serialisierung (Kurz-DSL für Prompt, Worksheet, Reports) ───
//
// Eine Halbzeile je Element: "<kind>; holds <a,b?|->; does <x,y|->; <loc>/<op>/<tier>"
// presence=doc ist Default (nackter Name), maybe wird "name?". Leere Liste = "-".
// Kein Profil → Aufrufer rendert "facts: n/a" (LLM fällt auf description zurück —
// Übergangsphase + BSH-Transfer-Slice bleiben so gültig).

export function serializeFacts(f: ComplianceFactsV1): string {
  const holds = f.holds.length
    ? f.holds
        .map(parseHoldsEntry)
        .map(h => (h.presence === 'doc' ? h.category : `${h.category}?`))
        .join(',')
    : '-';
  const does = f.does.length ? f.does.join(',') : '-';
  return `${f.kind}; holds ${holds}; does ${does}; ${f.ops.loc}/${f.ops.op}/${f.ops.tier}`;
}

// ─── Gesetze als Prädikate über den Fakten ──────────────────────
//
// Signatur mit stage + reason (statt nacktem boolean): reason ist zugleich die
// menschenlesbare Prüfer-Erklärung; gaps kommen in v1.1 additiv dazu.

export interface PredicateResult {
  match: boolean;
  /** 1 = Systemfähigkeit (Rubrik §2.3 Stufe 1), 2 = organisatorischer Akt, null = n/a */
  stage: 1 | 2 | null;
  reason: string;
}

type Predicate = (f: ComplianceFactsV1) => PredicateResult;

function docHolder(f: ComplianceFactsV1): boolean {
  return f.holds.some(h => parseHoldsEntry(h).presence === 'doc');
}

export const PREDICATES_V1: Record<string, Predicate> = {
  /** Art. 17 Löschung — Stufe 1: dokumentierte pbD-Halter; Infrastruktur transitiv. */
  'gdpr.art17': f => {
    const match = docHolder(f) && f.kind !== 'infra';
    return {
      match,
      stage: 1,
      reason: match
        ? 'hält dokumentierte pbD-Kategorie(n) → muss Löschung technisch können'
        : f.kind === 'infra'
          ? 'Infrastruktur: für Datenpflichten transitiv (Rubrik §2.3)'
          : 'keine dokumentierte pbD-Kategorie (maybe zählt nicht — Rubrik §4 konservativ)',
    };
  },
  /** Art. 28 Auftragsverarbeiter — trifft externe Verarbeiter, unabhängig von Stufe 1/2. */
  'gdpr.art28': f => {
    const match = f.ops.op === 'vendor_processor';
    return {
      match,
      stage: null,
      reason: match
        ? 'Dritter verarbeitet/hostet in unserem Auftrag → AVV (Art. 28) erforderlich'
        : 'kein Auftragsverarbeiter',
    };
  },
  /** Art. 32 Sicherheit — Stufe 1: doc-Halter ODER Element ist selbst Maßnahme. */
  'gdpr.art32': f => {
    const isMeasure = f.does.some(d =>
      ['auth', 'tls', 'encrypt_rest', 'backup', 'audit_log'].includes(d)
    );
    const holder = docHolder(f) && f.kind !== 'infra';
    const match = holder || isMeasure;
    return {
      match,
      stage: 1,
      reason: match
        ? isMeasure
          ? 'implementiert selbst eine TOM (auth/tls/encrypt/backup/audit)'
          : 'dokumentierter pbD-Halter → Sicherheitsmaßnahmen am System nachzuweisen'
        : 'weder doc-Halter noch Sicherheitsmaßnahme',
    };
  },
  /** Art. 44 ff. Drittlandtransfer. */
  'gdpr.art44': f => {
    const match = f.ops.op === 'vendor_processor' && !['eu', 'adequacy'].includes(f.ops.loc);
    return {
      match,
      stage: null,
      reason: match
        ? 'Auftragsverarbeiter außerhalb EU/Angemessenheit → Transfer-Mechanismus nötig'
        : 'kein Drittlandtransfer über Auftragsverarbeiter',
    };
  },
  /** Art. 30 VVT — Stufe 2: nur der Ausführer; Datenhalter bleiben automatisch no-match. */
  'gdpr.art30': f => ({
    match: f.does.includes('ropa'),
    stage: 2,
    reason: f.does.includes('ropa')
      ? 'führt das Verzeichnis der Verarbeitungstätigkeiten'
      : 'führt das VVT nicht (Datenhalter stehen nur IM Verzeichnis — transitiv)',
  }),
  /** Art. 33 Breach-Meldung — Stufe 2. */
  'gdpr.art33': f => {
    const match = f.does.includes('breach_notify') || f.does.includes('incident_response');
    return {
      match,
      stage: 2,
      reason: match
        ? 'führt Incident-Response/Breach-Meldung aus'
        : 'meldet nicht selbst (Systeme, in denen ein Breach passieren könnte, sind transitiv)',
    };
  },
  /** NIS2 Art. 21 Risk-Mgmt — Stufe 1, bewusst BREIT: Netz-/Informationssysteme der
   *  Diensterbringung; hier ist infra ausdrücklich MATCH (anders als bei Datenpflichten). */
  'nis2.art21': f => {
    const match = f.ops.tier !== 'dev';
    return {
      match,
      stage: 1,
      reason: match
        ? 'Netz-/Informationssystem der Diensterbringung (tier core/support)'
        : 'reines Entwicklungssystem — nicht Teil der Diensterbringung',
    };
  },
  /** NIS2 Art. 21(3) Lieferkette — derselbe ops.op-Fakt wie Art. 28, anderes Prädikat:
   *  der Beweis, dass die Taxonomie gesetzes-agnostisch ist. */
  'nis2.art21.supplychain': f => ({
    match: f.ops.op !== 'self',
    stage: null,
    reason:
      f.ops.op !== 'self'
        ? 'fremdbetrieben → Lieferketten-Sicherheit (Art. 21 Abs. 3)'
        : 'selbst betrieben',
  }),
  /** NIS2 Art. 23 Meldung — Stufe 2. */
  'nis2.art23': f => ({
    match: f.does.includes('incident_response'),
    stage: 2,
    reason: f.does.includes('incident_response')
      ? 'führt Incident-Response aus (Meldeweg CSIRT)'
      : 'meldet nicht selbst',
  }),
};

// ─── Registry: jeder Enum-Wert → Definition + Normreferenz ──────
//
// EINE Quelle für Prompt-Legende, Labeler-Cheatsheet und späteren Export
// (Judge-Graft aus dem DPV-Design). dpv-Referenzen sind aus Modellwissen und
// VOR jedem Audit-/Marketing-Claim gegen die W3C-DPV-2.x-Spec zu verifizieren.

export interface RegistryEntry {
  dimension: 'kind' | 'holds.category' | 'does' | 'ops.loc' | 'ops.op' | 'ops.tier';
  value: string;
  definition: string;
  ref: string; // Artikel/Norm-Referenz
  dpv?: string; // W3C-DPV-Konzept (UNVERIFIZIERT — siehe COMPLIANCE_FACTS.md)
}

export const FACTS_REGISTRY_V1: RegistryEntry[] = [
  { dimension: 'kind', value: 'store', definition: 'Persistiert Daten (DB, Objektspeicher, Log-Senke).', ref: 'Rubrik §2.3 Stufe 1' },
  { dimension: 'kind', value: 'service', definition: 'Fachliche/technische Funktion ohne eigene Persistenzhoheit.', ref: 'Rubrik §2.2' },
  { dimension: 'kind', value: 'infra', definition: 'Hosting-/Laufzeit-Schicht; für DATEN-Pflichten transitiv.', ref: 'Rubrik §2.3 Zusatzbedingung' },
  { dimension: 'kind', value: 'external', definition: 'Fremdbetriebener Dienst außerhalb der eigenen Deployment-Grenze.', ref: 'Art. 4 Nr. 8, Art. 28 DSGVO', dpv: 'dpv:DataProcessor' },
  { dimension: 'kind', value: 'control', definition: 'Element IST eine technische/organisatorische Maßnahme.', ref: 'Art. 32 DSGVO; NIS2 Art. 21(2)', dpv: 'dpv:TechnicalOrganisationalMeasure' },
  { dimension: 'holds.category', value: 'account', definition: 'Identifizierende Stammdaten: Name, E-Mail, Profil.', ref: 'Art. 4 Nr. 1 DSGVO', dpv: 'pd:Identifying' },
  { dimension: 'holds.category', value: 'credentials', definition: 'Passwort-Hashes, MFA-Secrets, API-Keys, Session-Token.', ref: 'Art. 32 DSGVO', dpv: 'pd:Password' },
  { dimension: 'holds.category', value: 'telemetry', definition: 'IP, User-Agent, Online-Kennungen, Nutzungsdaten.', ref: 'Art. 4 Nr. 1 DSGVO (Online-Kennung)', dpv: 'pd:IPAddress' },
  { dimension: 'holds.category', value: 'content', definition: 'Nutzergenerierte Inhalte mit möglicher pbD (Uploads, Prompts).', ref: 'Erwägungsgrund 26' },
  { dimension: 'holds.category', value: 'financial', definition: 'Zahlungs-/Rechnungsdaten.', ref: 'Art. 4 Nr. 1 DSGVO', dpv: 'pd:Financial' },
  { dimension: 'holds.category', value: 'special', definition: 'Besondere Kategorien (Gesundheit, Religion, …).', ref: 'Art. 9 Abs. 1 DSGVO', dpv: 'pd:SpecialCategoryPersonalData' },
  { dimension: 'does', value: 'auth', definition: 'Authentifizierung/Autorisierung der Zugriffe.', ref: 'Art. 32 Abs. 1 lit. b' },
  { dimension: 'does', value: 'tls', definition: 'Transportverschlüsselung/TLS-Terminierung.', ref: 'Art. 32 Abs. 1 lit. a; NIS2 21(2)(h)' },
  { dimension: 'does', value: 'encrypt_rest', definition: 'Verschlüsselung ruhender Daten.', ref: 'Art. 32 Abs. 1 lit. a' },
  { dimension: 'does', value: 'audit_log', definition: 'Protokolliert sicherheitsrelevante Aktionen nachweisbar.', ref: 'Art. 5 Abs. 2 (Rechenschaft)' },
  { dimension: 'does', value: 'backup', definition: 'Sicherung + getestete Wiederherstellung.', ref: 'Art. 32 Abs. 1 lit. c; NIS2 21(2)(c)' },
  { dimension: 'does', value: 'incident_response', definition: 'Erkennt/bewertet/behandelt Sicherheitsvorfälle.', ref: 'Art. 33 DSGVO; NIS2 Art. 23' },
  { dimension: 'does', value: 'breach_notify', definition: 'Führt die 72h-Meldung an die Aufsichtsbehörde aus.', ref: 'Art. 33 Abs. 1 DSGVO' },
  { dimension: 'does', value: 'ropa', definition: 'Führt das Verzeichnis der Verarbeitungstätigkeiten.', ref: 'Art. 30 DSGVO', dpv: 'dpv:ROPA' },
  { dimension: 'does', value: 'dsr', definition: 'Implementiert Betroffenenrechte-Prozesse (Auskunft/Löschung/Export).', ref: 'Art. 15/17/20 DSGVO' },
  { dimension: 'ops.loc', value: 'eu', definition: 'Verarbeitung in der EU/EWR.', ref: 'Kap. V DSGVO' },
  { dimension: 'ops.loc', value: 'adequacy', definition: 'Drittland mit Angemessenheitsbeschluss.', ref: 'Art. 45 DSGVO' },
  { dimension: 'ops.loc', value: 'us', definition: 'USA (eigener Wert: DPF-Status ist volatil).', ref: 'Art. 44 ff. DSGVO' },
  { dimension: 'ops.loc', value: 'other', definition: 'Sonstiges Drittland ohne Angemessenheit.', ref: 'Art. 46/49 DSGVO' },
  { dimension: 'ops.op', value: 'self', definition: 'Von uns selbst betrieben.', ref: '—' },
  { dimension: 'ops.op', value: 'vendor_processor', definition: 'Dritter verarbeitet/hostet in unserem Auftrag (AVV nötig).', ref: 'Art. 28 DSGVO; NIS2 21(3)', dpv: 'dpv:DataProcessor' },
  { dimension: 'ops.op', value: 'vendor_other', definition: 'Dritter ohne Auftragsverarbeitung (eigener Verantwortlicher).', ref: 'Art. 4 Nr. 7 DSGVO' },
  { dimension: 'ops.tier', value: 'core', definition: 'Unmittelbar diensterbringend.', ref: 'NIS2 Art. 21 Abs. 1' },
  { dimension: 'ops.tier', value: 'support', definition: 'Unterstützend für die Diensterbringung.', ref: 'NIS2 Art. 21 Abs. 1' },
  { dimension: 'ops.tier', value: 'dev', definition: 'Nur Entwicklung/Build — nicht Teil der Diensterbringung.', ref: '—' },
];
