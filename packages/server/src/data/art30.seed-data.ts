/**
 * Art.-30-Abs.-1-Anforderungssatz — kanonischer Seed (REQ-WFCOMP-001.1 / THE-352).
 *
 * Ebene A (Spec, 7 Felder) + Ebene B (Zitat-Anker, Verbatim).
 * Scope: NUR Abs. 1 (Verantwortlicher-VVT). Abs. 2 (Auftragsverarbeiter) und
 * Abs. 5 (Ausnahme < 250 MA) bewusst außerhalb Pilot-Scope.
 *
 * VERBATIM AMTLICH VERIFIZIERT (2026-06-27): CELEX 32016R0679, OJ L 119/50–51,
 * doppelt geprüft (pdftotext + visuelles PDF-Rendering). KEINE Memory-Quelle.
 */
import type {
  Art30Criticality,
  TraceTarget,
  ComplianceRequirementPriority,
} from '@thearchitect/shared';

export const ART30_SOURCE_URL =
  'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679';
export const ART30_EFFECTIVE_FROM = '2018-05-25';
export const ART30_PARAGRAPH_NUMBER = 'Art. 30 Abs. 1';
export const ART30_TITLE = 'Verzeichnis von Verarbeitungstätigkeiten';

/** Ebene B — Verbatim Art. 30 Abs. 1 (amtlich, exakt zu pinnen). */
export const ART30_FULLTEXT = `(1) Jeder Verantwortliche und gegebenenfalls sein Vertreter führen ein Verzeichnis aller Verarbeitungstätigkeiten, die ihrer Zuständigkeit unterliegen. Dieses Verzeichnis enthält sämtliche folgenden Angaben:
a) den Namen und die Kontaktdaten des Verantwortlichen und gegebenenfalls des gemeinsam mit ihm Verantwortlichen, des Vertreters des Verantwortlichen sowie eines etwaigen Datenschutzbeauftragten;
b) die Zwecke der Verarbeitung;
c) eine Beschreibung der Kategorien betroffener Personen und der Kategorien personenbezogener Daten;
d) die Kategorien von Empfängern, gegenüber denen die personenbezogenen Daten offengelegt worden sind oder noch offengelegt werden, einschließlich Empfänger in Drittländern oder internationalen Organisationen;
e) gegebenenfalls Übermittlungen von personenbezogenen Daten an ein Drittland oder an eine internationale Organisation, einschließlich der Angabe des betreffenden Drittlands oder der betreffenden internationalen Organisation, sowie bei den in Artikel 49 Absatz 1 Unterabsatz 2 genannten Datenübermittlungen die Dokumentierung geeigneter Garantien;
f) wenn möglich, die vorgesehenen Fristen für die Löschung der verschiedenen Datenkategorien;
g) wenn möglich, eine allgemeine Beschreibung der technischen und organisatorischen Maßnahmen gemäß Artikel 32 Absatz 1.`;

export interface Art30FieldSpec {
  litera: string; // 'a'..'g'
  title: string;
  sourceParagraph: string; // Verbatim lit.-Text
  description: string;
  criticality: Art30Criticality;
  priority: ComplianceRequirementPriority;
  traceTarget: TraceTarget;
}

/** Ebene A — die 7 Felder als Spec mit Kritikalität + Trace-Target. */
export const ART30_FIELDS: Art30FieldSpec[] = [
  {
    litera: 'a',
    title: 'Verantwortlichen und Kontaktdaten benennen',
    sourceParagraph:
      'den Namen und die Kontaktdaten des Verantwortlichen und gegebenenfalls des gemeinsam mit ihm Verantwortlichen, des Vertreters des Verantwortlichen sowie eines etwaigen Datenschutzbeauftragten;',
    description:
      'Das Verzeichnis MUSS Name und Kontaktdaten des Verantwortlichen (ggf. gemeinsam Verantwortlicher, Vertreter) sowie eines etwaigen Datenschutzbeauftragten enthalten.',
    criticality: 'HART',
    priority: 'must',
    traceTarget: {
      from: 'process',
      steps: [{ rel: 'assignment', to: 'business_role', where: { role: 'Controller' } }],
    },
  },
  {
    litera: 'b',
    title: 'Zweck(e) der Verarbeitung angeben',
    sourceParagraph: 'die Zwecke der Verarbeitung;',
    description: 'Das Verzeichnis MUSS die Zwecke jeder Verarbeitungstätigkeit benennen.',
    criticality: 'HART',
    priority: 'must',
    traceTarget: {
      from: 'process',
      steps: [{ rel: 'realization', to: 'goal', where: { kind: 'Purpose' } }],
    },
  },
  {
    litera: 'c',
    title: 'Kategorien betroffener Personen und Daten beschreiben',
    sourceParagraph:
      'eine Beschreibung der Kategorien betroffener Personen und der Kategorien personenbezogener Daten;',
    description:
      'Das Verzeichnis MUSS die Kategorien betroffener Personen und die Kategorien personenbezogener Daten beschreiben.',
    criticality: 'HART',
    priority: 'must',
    traceTarget: {
      from: 'process',
      steps: [
        { rel: 'access', to: 'data_object', where: { personal: true } },
        { rel: 'association', to: 'business_object', where: { kind: 'DataSubjectCategory' } },
      ],
    },
  },
  {
    litera: 'd',
    title: 'Kategorien von Empfängern angeben',
    sourceParagraph:
      'die Kategorien von Empfängern, gegenüber denen die personenbezogenen Daten offengelegt worden sind oder noch offengelegt werden, einschließlich Empfänger in Drittländern oder internationalen Organisationen;',
    description:
      'Das Verzeichnis MUSS die Kategorien von Empfängern angeben, denen die Daten offengelegt werden (inkl. Empfänger in Drittländern/internationalen Organisationen).',
    criticality: 'HART',
    priority: 'must',
    traceTarget: {
      from: 'process',
      steps: [{ rel: 'flow', to: 'business_role', where: { role: 'Recipient' } }],
    },
  },
  {
    litera: 'e',
    title: 'Drittland-Übermittlung und geeignete Garantien dokumentieren',
    sourceParagraph:
      'gegebenenfalls Übermittlungen von personenbezogenen Daten an ein Drittland oder an eine internationale Organisation, einschließlich der Angabe des betreffenden Drittlands oder der betreffenden internationalen Organisation, sowie bei den in Artikel 49 Absatz 1 Unterabsatz 2 genannten Datenübermittlungen die Dokumentierung geeigneter Garantien;',
    description:
      'Sofern Daten an ein Drittland oder eine internationale Organisation übermittelt werden, MUSS dies samt Angabe des Drittlands und Dokumentation geeigneter Garantien (Art. 49 Abs. 1 UAbs. 2) erfasst sein.',
    criticality: 'BEDINGT',
    priority: 'must',
    traceTarget: {
      from: 'process',
      guard: { flag: 'thirdCountry', equals: true },
      steps: [
        { rel: 'flow', to: 'business_role', where: { role: 'Recipient' } },
        { rel: 'association', to: '*', where: { kind: 'Safeguard' } },
      ],
    },
  },
  {
    litera: 'f',
    title: 'Löschfristen je Datenkategorie angeben',
    sourceParagraph:
      'wenn möglich, die vorgesehenen Fristen für die Löschung der verschiedenen Datenkategorien;',
    description:
      'Wenn möglich, MUSS das Verzeichnis die vorgesehenen Löschfristen je Datenkategorie enthalten.',
    criticality: 'WEICH',
    priority: 'should',
    traceTarget: {
      from: 'data_object',
      where: { personal: true },
      steps: [{ rel: 'association', to: 'requirement', where: { kind: 'Retention' } }],
    },
  },
  {
    litera: 'g',
    title: 'Technische und organisatorische Maßnahmen (TOM) beschreiben',
    sourceParagraph:
      'wenn möglich, eine allgemeine Beschreibung der technischen und organisatorischen Maßnahmen gemäß Artikel 32 Absatz 1.',
    description:
      'Wenn möglich, MUSS das Verzeichnis eine allgemeine Beschreibung der technischen und organisatorischen Maßnahmen gemäß Art. 32 Abs. 1 enthalten.',
    criticality: 'WEICH',
    priority: 'should',
    traceTarget: {
      from: 'data_object',
      where: { personal: true },
      steps: [
        { rel: 'access', to: 'application_component' },
        { rel: 'serving', to: 'node' },
        { rel: 'association', to: 'requirement', where: { kind: 'TOM', art32: true } },
      ],
    },
  },
];
