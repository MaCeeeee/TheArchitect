// BSH Activity-Drill-Down Demo Seed (Phase 7 + 10)
// 4 Business Processes, each with composition-children (Activities = type:'process' + isActivity flag).
// Phase 10: Activities carry structured fields (owner / action / system / when / output / enables) in metadata
// for the Property-Panel "Activity-Steckbrief" section.

import { v4 as uuid } from 'uuid';

export const BSH_ACTIVITY_PROJECT_NAME = 'BSH Compliance Demo (Activity Drill-Down)';

export interface SeedActivity {
  name: string;
  /** WER (Rolle/Team) führt die Activity aus */
  owner: string;
  /** WAS wird gemacht (Verb + Objekt, BPMN-Action-Style) */
  action: string;
  /** WO / mit welchem System wird gearbeitet */
  system: string;
  /** BIS WANN / Frist */
  when: string;
  /** WAS kommt raus (deliverable) */
  output: string;
  /** WELCHE nächste Activity wird ermöglicht */
  enables: string;
}

interface SeedProcess {
  id: string;
  name: string;
  description: string;
  posX: number;
  posZ: number;
  activities: SeedActivity[];
}

// Business-layer Y position (matches togaf.constants.ts ARCHITECTURE_LAYERS y=8)
const BUSINESS_Y = 8;
// Hide activities far below the visible scene; isActivity flag also filters them in ArchitectureElements
const ACTIVITY_HIDDEN_Y = -100;

export const BSH_PROCESSES: SeedProcess[] = [
  {
    id: 'bsh-proc-gdpr',
    name: 'GDPR-Incident-Response',
    description: 'Standardized 72h incident response process per Art. 33 DSGVO',
    posX: -30,
    posZ: 0,
    activities: [
      {
        name: 'Detect Breach',
        owner: 'IT-Security Operations',
        action: 'identifiziert den Datenvorfall (SIEM-Alert oder Mitarbeiter-Meldung)',
        system: 'Splunk SIEM + Service-Now',
        when: 'innerhalb 1h nach Erkennung',
        output: 'Incident-Ticket mit Erst-Triage',
        enables: 'Classify Severity',
      },
      {
        name: 'Classify Severity',
        owner: 'CISO',
        action: 'bewertet Vorfall (Datenkategorie, Anzahl Betroffene, Schadenshöhe)',
        system: 'Service-Now + interner Severity-Matrix',
        when: 'innerhalb 4h nach Detect',
        output: 'Severity-Score Low/Medium/High',
        enables: 'Notify DPO',
      },
      {
        name: 'Notify DPO',
        owner: 'Incident-Manager',
        action: 'informiert Datenschutzbeauftragten per gesicherter Mail',
        system: 'PGP-verschlüsselte E-Mail',
        when: 'innerhalb 6h nach Detect',
        output: 'DPO-Bestätigung + Akteneröffnung',
        enables: 'Assess Impact',
      },
      {
        name: 'Assess Impact',
        owner: 'DPO + Legal Counsel',
        action: 'bewertet Risiko für betroffene Personen (Art. 33 Abs. 1 DSGVO)',
        system: 'OneTrust Privacy + Legal-Workspace',
        when: 'innerhalb 24h nach Detect',
        output: 'Impact-Report (Hoch / Mittel / Gering)',
        enables: 'Notify Authority (72h)',
      },
      {
        name: 'Notify Authority (72h)',
        owner: 'DPO',
        action: 'meldet Vorfall an Aufsichtsbehörde (BfDI / Landesbehörde)',
        system: 'BfDI-Online-Meldeportal',
        when: 'strikt innerhalb 72h ab Erkennung',
        output: 'Behörden-Aktenzeichen',
        enables: 'Document & Close',
      },
      {
        name: 'Document & Close',
        owner: 'DPO + Compliance',
        action: 'archiviert Maßnahmen, Lessons-Learned, Behörden-Korrespondenz',
        system: 'Confluence Compliance-Space + DMS',
        when: 'innerhalb 14 Tage',
        output: 'Closure-Report (Audit-Trail)',
        enables: 'Jährliche DSGVO-Prüfung',
      },
    ],
  },
  {
    id: 'bsh-proc-supplier',
    name: 'Supplier-Onboarding',
    description: 'LkSG-compliant supplier qualification and risk assessment',
    posX: -10,
    posZ: 0,
    activities: [
      {
        name: 'Submit Application',
        owner: 'Lieferant (extern)',
        action: 'reicht Selbstauskunft + Zertifikate (ISO 9001, SA8000) ein',
        system: 'SAP Ariba Supplier-Portal',
        when: 'Eigenleistung des Lieferanten',
        output: 'Application-ID + Document-Set',
        enables: 'Risk Assessment',
      },
      {
        name: 'Risk Assessment',
        owner: 'Procurement-Compliance',
        action: 'prüft Land, Branche, Sanktionslisten gegen LkSG-Risk-Map',
        system: 'IntegrityNext + Dow Jones Sanctions',
        when: 'innerhalb 5 Werktagen',
        output: 'Risk-Tier 1 / 2 / 3',
        enables: 'Approve & Contract',
      },
      {
        name: 'Approve & Contract',
        owner: 'Procurement-Manager',
        action: 'schließt Rahmenvertrag mit LkSG-Klauseln + Audit-Recht ab',
        system: 'SAP Ariba Contracts',
        when: 'innerhalb 10 Werktagen nach Risk-Approval',
        output: 'Signierter Rahmenvertrag',
        enables: 'Activate in System',
      },
      {
        name: 'Activate in System',
        owner: 'Master-Data-Team',
        action: 'legt Lieferant in SAP S/4 + Ariba an, vergibt Vendor-Code',
        system: 'SAP S/4HANA Vendor-Master',
        when: 'innerhalb 2 Werktagen',
        output: 'Aktiver Vendor-Code',
        enables: 'Erste Bestellung möglich',
      },
    ],
  },
  {
    id: 'bsh-proc-recall',
    name: 'Product-Recall',
    description: 'Cross-country product recall coordination workflow',
    posX: 10,
    posZ: 0,
    activities: [
      {
        name: 'Detect Defect',
        owner: 'Quality Operations',
        action: 'meldet Defekt aus Field-Reports / Kundenservice',
        system: 'Salesforce Service Cloud + Quality-DB',
        when: 'sofort bei Schwellwert-Überschreitung',
        output: 'Defect-Ticket + Initial-Klassifizierung',
        enables: 'Classify Severity',
      },
      {
        name: 'Classify Severity',
        owner: 'Product-Safety Officer',
        action: 'bewertet Risiko (CE-konform? Verletzungsgefahr?) gegen ProdSG',
        system: 'PSO-Workbench + Risk-Matrix',
        when: 'innerhalb 48h',
        output: 'Severity Class A / B / C',
        enables: 'Trace Affected Lots',
      },
      {
        name: 'Trace Affected Lots',
        owner: 'Production-IT',
        action: 'identifiziert betroffene Charge / Werk / Auslieferungsländer',
        system: 'MES + SAP S/4 Track-and-Trace',
        when: 'innerhalb 24h',
        output: 'Lot-Liste mit Country-Map',
        enables: 'Notify Authorities',
      },
      {
        name: 'Notify Authorities',
        owner: 'Regulatory-Affairs',
        action: 'meldet Recall an BAuA / nationale Pendants pro Land',
        system: 'BAuA-Meldeportal + RAPEX',
        when: 'innerhalb 72h ab Severity-A',
        output: 'Behörden-Bestätigung pro Land',
        enables: 'Issue Public Notice',
      },
      {
        name: 'Issue Public Notice',
        owner: 'Communications',
        action: 'publiziert Rückruf-Pressemeldung + RAPEX-Eintrag',
        system: 'PR-Newswire + Corporate Website',
        when: 'innerhalb 24h nach Behörden-Freigabe',
        output: 'Öffentliche Bekanntmachung',
        enables: 'Halt Production',
      },
      {
        name: 'Halt Production',
        owner: 'Plant Manager',
        action: 'stoppt betroffene Linien per Werks-MES',
        system: 'MES Plant-Floor',
        when: 'sofort nach Public Notice',
        output: 'Stop-Confirmation pro Werk',
        enables: 'Coordinate Logistics',
      },
      {
        name: 'Coordinate Logistics',
        owner: 'Supply-Chain Operations',
        action: 'plant Rückholung aus Distributoren + Retail',
        system: 'SAP TM Transportation Management',
        when: 'innerhalb 5 Werktagen',
        output: 'Reverse-Logistics-Plan',
        enables: 'Customer Communication',
      },
      {
        name: 'Customer Communication',
        owner: 'Customer-Service-Lead',
        action: 'informiert Endkunden via E-Mail + Hotline + Web',
        system: 'Salesforce Service Cloud + SMS-Gateway',
        when: 'parallel zu Logistik',
        output: 'Customer-Notification-Tracker',
        enables: 'Replace/Refund Workflow',
      },
      {
        name: 'Replace/Refund Workflow',
        owner: 'After-Sales',
        action: 'führt Austausch oder Geld-zurück durch',
        system: 'Salesforce Service Cloud + SAP FI',
        when: 'laufend bis 6 Monate',
        output: 'Case-Closure pro Kunde',
        enables: 'Root-Cause Analysis',
      },
      {
        name: 'Root-Cause Analysis',
        owner: 'Engineering + Quality',
        action: 'analysiert Ursache via 8D-Methodik',
        system: 'Quality-Management-System',
        when: 'innerhalb 30 Tage',
        output: '8D-Report',
        enables: 'Process Improvement',
      },
      {
        name: 'Process Improvement',
        owner: 'Production-Engineering',
        action: 'implementiert FMEA-Updates, Supplier-Change, Test-Verschärfung',
        system: 'PLM + FMEA-Tool',
        when: 'innerhalb 90 Tage',
        output: 'Update-PEP (Process-Excellence-Plan)',
        enables: 'Final Report',
      },
      {
        name: 'Final Report',
        owner: 'Compliance Office',
        action: 'erstellt finalen Recall-Report inkl. Kosten + Lessons-Learned',
        system: 'Confluence + DMS Archive',
        when: 'innerhalb 6 Monate',
        output: 'Archivierter Recall-Report',
        enables: 'Audit-Closure (jährlich)',
      },
    ],
  },
  {
    id: 'bsh-proc-csrd',
    name: 'Annual-CSRD-Reporting',
    description: 'Full ESRS disclosure cycle — multi-row pyramid demonstration',
    posX: 30,
    posZ: 0,
    activities: [
      { name: 'Define Scope',                 owner: 'CSO + ESG-PMO',                action: 'definiert Reporting-Boundary (40 Werke + 8.000 Lieferanten)', system: 'OneTrust ESG + Confluence',         when: 'bis 31.01.', output: 'Scope-Memo',                       enables: 'Stakeholder Engagement' },
      { name: 'Stakeholder Engagement',       owner: 'Investor-Relations + ESG-PMO', action: 'interviewt 30+ Stakeholder (Investoren, NGOs, Mitarbeiter)',  system: 'Microsoft Forms + Workshops',       when: 'bis 28.02.', output: 'Stakeholder-Map',                  enables: 'Materiality Assessment' },
      { name: 'Materiality Assessment',       owner: 'ESG-PMO',                      action: 'scored Doppelte Wesentlichkeit (Impact + Financial)',         system: 'Datamaran ESG-Analytics',           when: 'bis 15.03.', output: 'Materialitäts-Matrix',             enables: 'Data Inventory' },
      { name: 'Data Inventory',               owner: 'Data-Stewards',                action: 'mappt Datenquellen (SAP, MES, Excel) auf ESRS-Datenpunkte',   system: 'Collibra Data-Catalog',             when: 'bis 31.03.', output: 'Data-Catalog (ESRS-Mapping)',      enables: 'Scope 1 GHG Collection' },
      { name: 'Scope 1 GHG Collection',       owner: 'Plant-Manager',                action: 'liefert Verbrauchsdaten (Gas, Diesel, Kältemittel) aus MES',  system: 'MES + SAP S/4 Energy-Module',       when: 'bis 30.04.', output: 'Scope-1-Datensatz',                enables: 'Scope 2 GHG Collection' },
      { name: 'Scope 2 GHG Collection',       owner: 'Energy-Manager',               action: 'konsolidiert Strom/Wärme-Bezug (marktbasiert + standortbasiert)', system: 'Energy-Manager-Dashboard',     when: 'bis 30.04.', output: 'Scope-2-Datensatz',                enables: 'Scope 3 Upstream Survey' },
      { name: 'Scope 3 Upstream Survey',      owner: 'Procurement-ESG',              action: 'befragt Top-200 Lieferanten via CDP',                          system: 'CDP Supply-Chain + EcoVadis',       when: 'bis 31.05.', output: 'Tier-1-Emissionsdaten',            enables: 'Scope 3 Downstream Modeling' },
      { name: 'Scope 3 Downstream Modeling',  owner: 'Product-LCA-Team',             action: 'modelliert Use-Phase-Emissionen aller Geräte (10y avg)',      system: 'Sphera LCA-Tool',                   when: 'bis 31.05.', output: 'Downstream-Modell',                enables: 'Energy Consumption Audit' },
      { name: 'Energy Consumption Audit',     owner: 'Sustainability-Officer',       action: 'auditiert Energie-Mix gegen EU-Taxonomy DNSH',                system: 'EU-Taxonomy-Compliance-Tool',       when: 'bis 15.06.', output: 'Energy-Audit-Report',              enables: 'Water Usage Tracking' },
      { name: 'Water Usage Tracking',         owner: 'Plant-EHS',                    action: 'erfasst Wasser-Entnahme/Rückgabe + Stress-Index pro Werk',    system: 'AWS-Aqueduct + Plant-EHS-System',   when: 'bis 15.06.', output: 'Water-Statement',                  enables: 'Waste Management Data' },
      { name: 'Waste Management Data',        owner: 'EHS-Team',                     action: 'konsolidiert Abfall-Volumina pro Kategorie',                  system: 'Plant-EHS + SAP EHS',               when: 'bis 15.06.', output: 'Waste-Statement',                  enables: 'Biodiversity Impact' },
      { name: 'Biodiversity Impact',          owner: 'Sustainability + lokale EHS',  action: 'bewertet Standorte gegen Schutzgebiete (IFC PS6)',            system: 'IBAT + Sphera Biodiversity',        when: 'bis 30.06.', output: 'Biodiversity-Disclosure',          enables: 'Pollution Inventory' },
      { name: 'Pollution Inventory',          owner: 'EHS',                          action: 'sammelt Luft/Wasser/Boden-Emissionen aus E-PRTR-Pflichten',   system: 'E-PRTR-Reporting + SAP EHS',        when: 'bis 30.06.', output: 'Pollution-Inventory',              enables: 'Resource Use Reporting' },
      { name: 'Resource Use Reporting',       owner: 'Procurement-ESG',              action: 'bewertet Material-Footprint (Stahl, Cu, Plastik, Seltene Erden)', system: 'Material-Flow-Analytics',       when: 'bis 15.07.', output: 'Resource-Statement',               enables: 'Workforce Data Collection' },
      { name: 'Workforce Data Collection',    owner: 'HR-Analytics',                 action: 'liefert Diversity, Vergütung, Trainings, Unfälle',            system: 'SAP SuccessFactors',                when: 'bis 31.07.', output: 'S1-Datensatz (Workforce)',         enables: 'Supplier Audit Data' },
      { name: 'Supplier Audit Data',          owner: 'Procurement-Compliance',       action: 'konsolidiert LkSG-Audits + Korrektur-Status',                 system: 'IntegrityNext + Ariba',             when: 'bis 31.07.', output: 'Tier-1-Audit-Statement',           enables: 'Affected Communities' },
      { name: 'Affected Communities',         owner: 'Sustainability',               action: 'dokumentiert Anwohner-Beschwerden + Mitigations je Werk',     system: 'Community-Engagement-Tracker',      when: 'bis 15.08.', output: 'S3-Disclosure',                    enables: 'Customer Data Privacy' },
      { name: 'Customer Data Privacy',        owner: 'DPO + Legal',                  action: 'liefert DSGVO-Verstöße, Beschwerden, Sanktionen',             system: 'OneTrust Privacy',                  when: 'bis 15.08.', output: 'S4-Statement',                     enables: 'Business Conduct Reporting' },
      { name: 'Business Conduct Reporting',   owner: 'Compliance Office',            action: 'reports Antikorruption, Lobbying, Kartellverstöße',           system: 'GRC-Compliance-Suite',              when: 'bis 31.08.', output: 'G1-Statement',                     enables: 'Climate Risk Assessment' },
      { name: 'Climate Risk Assessment',      owner: 'Risk-Office + ESG',            action: 'modelliert Physical + Transition Risks gemäß TCFD',           system: 'Munich Re Climate Risk + ClimateGo',when: 'bis 31.08.', output: 'Climate-Risk-Disclosure',          enables: 'Internal Verification' },
      { name: 'Internal Verification',        owner: 'Internal Audit',               action: 'prüft Datenqualität + Konsistenz aller Statements',           system: 'TeamMate+ Audit-Software',          when: 'bis 30.09.', output: 'Internal-Audit-Memo',              enables: 'External Audit Coordination' },
      { name: 'External Audit Coordination',  owner: 'Finance-Reporting + Deloitte', action: 'koordiniert Limited Assurance gemäß ISAE 3000',               system: 'Deloitte Connect + DMS',            when: 'bis 31.10.', output: 'Audit-Sign-off (limited assurance)', enables: 'Draft ESRS Disclosure' },
      { name: 'Draft ESRS Disclosure',        owner: 'ESG-PMO + Communications',     action: 'schreibt finalen ESRS-Bericht (~250 Seiten)',                 system: 'Workiva ESG-Reporting',             when: 'bis 30.11.', output: 'Final Draft (~250 S.)',            enables: 'Board Review' },
      { name: 'Board Review',                 owner: 'Vorstand + Aufsichtsrat',      action: 'genehmigt Bericht in dedizierter Sitzung',                    system: 'Diligent Boardroom',                when: 'bis 15.12.', output: 'Board-Approval (formaler Beschluss)', enables: 'Investor Statement' },
      { name: 'Investor Statement',           owner: 'Investor Relations',           action: 'formuliert Highlights für Geschäftsbericht + Capital-Markets-Day', system: 'IR-Workspace + Sharepoint',     when: 'bis 15.01.', output: 'IR-Brief',                         enables: 'SEC Filing' },
      { name: 'SEC Filing',                   owner: 'CFO-Office',                   action: 'reicht 20-F / Form 6-K bei SEC ein (falls US-listed)',        system: 'SEC EDGAR-Portal',                  when: 'bis 31.01.', output: 'SEC-Akzeptanz',                    enables: 'Public Disclosure' },
      { name: 'Public Disclosure',            owner: 'Communications',               action: 'publiziert Bericht auf bsh-group.com + Investor-Portal',      system: 'Corporate CMS + IR-Portal',         when: 'bis 15.02.', output: 'Öffentlicher Bericht',             enables: 'Continuous Improvement Plan' },
      { name: 'Continuous Improvement Plan',  owner: 'ESG-PMO',                      action: 'konsolidiert Lessons Learned + Roadmap fürs Folgejahr',       system: 'Confluence + Monday.com',           when: 'bis 28.02.', output: 'Improvement-Backlog',              enables: 'Define Scope (nächste Periode)' },
    ],
  },
];

export interface SeedElement {
  id: string;
  type: string;
  name: string;
  description: string;
  layer: string;
  togafDomain: string;
  maturityLevel: number;
  riskLevel: string;
  status: string;
  posX: number;
  posY: number;
  posZ: number;
  metadataJson: string;
}

export interface SeedConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  label: string;
}

export interface BshActivitySeedData {
  elements: SeedElement[];
  connections: SeedConnection[];
}

function freeTextDescriptionFor(act: SeedActivity): string {
  // Backup-prose for the Description field — kept for users who turn off the Steckbrief
  return `${act.owner} ${act.action} (${act.system}) — ${act.when}. Output: ${act.output} → ermöglicht ${act.enables}.`;
}

export function buildBshActivitySeed(): BshActivitySeedData {
  const elements: SeedElement[] = [];
  const connections: SeedConnection[] = [];

  for (const proc of BSH_PROCESSES) {
    elements.push({
      id: proc.id,
      type: 'process',
      name: proc.name,
      description: proc.description,
      layer: 'business',
      togafDomain: 'business',
      maturityLevel: 3,
      riskLevel: 'medium',
      status: 'current',
      posX: proc.posX,
      posY: BUSINESS_Y,
      posZ: proc.posZ,
      metadataJson: JSON.stringify({ source: 'bsh-activity-demo' }),
    });

    const activityIds: string[] = [];
    proc.activities.forEach((act, idx) => {
      const aId = `${proc.id}-act-${idx + 1}`;
      activityIds.push(aId);
      elements.push({
        id: aId,
        type: 'process',
        name: act.name,
        description: freeTextDescriptionFor(act),
        layer: 'business',
        togafDomain: 'business',
        maturityLevel: 3,
        riskLevel: 'low',
        status: 'current',
        posX: proc.posX,
        posY: ACTIVITY_HIDDEN_Y,
        posZ: proc.posZ,
        metadataJson: JSON.stringify({
          source: 'bsh-activity-demo',
          isActivity: true,
          sequenceIndex: idx + 1,
          activityOwner: act.owner,
          activityAction: act.action,
          activitySystem: act.system,
          activityWhen: act.when,
          activityOutput: act.output,
          activityEnables: act.enables,
        }),
      });

      // Composition: parent → child (ArchiMate convention)
      connections.push({
        id: uuid(),
        sourceId: proc.id,
        targetId: aId,
        type: 'composition',
        label: 'composes',
      });
    });

    // Sequential flow between activities (1→2, 2→3, ...)
    for (let i = 0; i < activityIds.length - 1; i++) {
      connections.push({
        id: uuid(),
        sourceId: activityIds[i],
        targetId: activityIds[i + 1],
        type: 'flow',
        label: 'next',
      });
    }
  }

  return { elements, connections };
}
