// BSH ESG Demo — Activity-Drill-Down Integration (UC-ADD-003 / THE-186)
// Adds composition-children to 4 existing business_process elements in the
// "Demo: BSH ESG Compliance Transformation" project so the drill-down works
// directly inside the main demo (not only in the standalone Activity-Drill-Down project).

import { v4 as uuid } from 'uuid';
import { BSH_DRILLABLE_PROCESS_IDS } from './demo-architecture-bsh';
import type { SeedActivity, SeedElement, SeedConnection, BshActivitySeedData } from './bsh-activity-demo';

// Activities are hidden from the main scene via metadata.isActivity filter; Y far below visible
const ACTIVITY_HIDDEN_Y = -100;

interface EsgProcessActivities {
  processId: string;
  // Position of the parent process in 3D — activities inherit hidden Y but reuse X/Z
  parentX: number;
  parentZ: number;
  activities: SeedActivity[];
}

const ESG_PROCESSES: EsgProcessActivities[] = [
  // ── 1. CSRD Reporting Cycle (12 Activities) ─────────────────────────────────
  {
    processId: BSH_DRILLABLE_PROCESS_IDS.CSRD_CYCLE,
    parentX: 2,
    parentZ: 3,
    activities: [
      {
        name: 'Define Scope',
        owner: 'CSO + ESG-PMO',
        action: 'definiert Reporting-Boundary (40 Werke + 8.000 Lieferanten)',
        system: 'Workiva ESG-Reporting',
        when: 'bis 31.01.',
        output: 'Scope-Memo',
        enables: 'Materiality Assessment',
      },
      {
        name: 'Materiality Assessment',
        owner: 'ESG-PMO',
        action: 'scored Doppelte Wesentlichkeit (Impact + Financial)',
        system: 'Datamaran ESG-Analytics',
        when: 'bis 15.03.',
        output: 'Materialitäts-Matrix',
        enables: 'Data Inventory',
      },
      {
        name: 'Data Inventory',
        owner: 'Data-Stewards',
        action: 'mappt Datenquellen (SAP, MES, Excel) auf ESRS-Datenpunkte',
        system: 'Collibra Data-Catalog',
        when: 'bis 31.03.',
        output: 'Data-Catalog (ESRS-Mapping)',
        enables: 'Scope 1 GHG Collection',
      },
      {
        name: 'Scope 1 GHG Collection',
        owner: 'Plant-Manager',
        action: 'liefert Verbrauchsdaten (Gas, Diesel, Kältemittel) aus MES',
        system: 'MES + SAP S/4 Energy-Module',
        when: 'bis 30.04.',
        output: 'Scope-1-Datensatz',
        enables: 'Scope 2 GHG Collection',
      },
      {
        name: 'Scope 2 GHG Collection',
        owner: 'Energy-Manager',
        action: 'konsolidiert Strom/Wärme-Bezug (marktbasiert + standortbasiert)',
        system: 'Energy-Manager-Dashboard',
        when: 'bis 30.04.',
        output: 'Scope-2-Datensatz',
        enables: 'Scope 3 Survey',
      },
      {
        name: 'Scope 3 Survey',
        owner: 'Procurement-ESG',
        action: 'befragt Top-200 Lieferanten via CDP',
        system: 'CDP Supply-Chain + EcoVadis',
        when: 'bis 31.05.',
        output: 'Tier-1-Emissionsdaten',
        enables: 'Internal Verification',
      },
      {
        name: 'Internal Verification',
        owner: 'Internal Audit',
        action: 'prüft Datenqualität + Konsistenz aller Statements',
        system: 'TeamMate+ Audit-Software',
        when: 'bis 30.09.',
        output: 'Internal-Audit-Memo',
        enables: 'External Audit Coordination',
      },
      {
        name: 'External Audit Coordination',
        owner: 'Finance-Reporting + Deloitte',
        action: 'koordiniert Limited Assurance gemäß ISAE 3000',
        system: 'Deloitte Connect + DMS',
        when: 'bis 31.10.',
        output: 'Audit-Sign-off (limited assurance)',
        enables: 'Draft ESRS Disclosure',
      },
      {
        name: 'Draft ESRS Disclosure',
        owner: 'ESG-PMO + Communications',
        action: 'schreibt finalen ESRS-Bericht (~250 Seiten)',
        system: 'Workiva ESG-Reporting',
        when: 'bis 30.11.',
        output: 'Final Draft (~250 S.)',
        enables: 'Board Review',
      },
      {
        name: 'Board Review',
        owner: 'Vorstand + Aufsichtsrat',
        action: 'genehmigt Bericht in dedizierter Sitzung',
        system: 'Diligent Boardroom',
        when: 'bis 15.12.',
        output: 'Board-Approval (formaler Beschluss)',
        enables: 'Public Disclosure',
      },
      {
        name: 'Public Disclosure',
        owner: 'Communications',
        action: 'publiziert Bericht auf bsh-group.com + Investor-Portal',
        system: 'Corporate CMS + IR-Portal',
        when: 'bis 15.02.',
        output: 'Öffentlicher Bericht',
        enables: 'Continuous Improvement Plan',
      },
      {
        name: 'Continuous Improvement Plan',
        owner: 'ESG-PMO',
        action: 'konsolidiert Lessons Learned + Roadmap fürs Folgejahr',
        system: 'Confluence + Monday.com',
        when: 'bis 28.02.',
        output: 'Improvement-Backlog',
        enables: 'Define Scope (nächste Periode)',
      },
    ],
  },

  // ── 2. Supplier Risk Assessment / LkSG (8 Activities) ───────────────────────
  {
    processId: BSH_DRILLABLE_PROCESS_IDS.SUPPLIER_RISK,
    parentX: -2,
    parentZ: 3,
    activities: [
      {
        name: 'Initial Onboarding Application',
        owner: 'Lieferant (extern)',
        action: 'reicht Selbstauskunft + Zertifikate (ISO 9001, SA8000) ein',
        system: 'SAP Ariba Supplier-Portal',
        when: 'Eigenleistung des Lieferanten',
        output: 'Application-ID + Document-Set',
        enables: 'Sanctions/PEP Screening',
      },
      {
        name: 'Sanctions/PEP Screening',
        owner: 'Procurement-Compliance',
        action: 'prüft gegen EU/US/UN Sanktionslisten + PEP-Datenbanken',
        system: 'Dow Jones Sanctions + RDC',
        when: 'innerhalb 2 Werktagen',
        output: 'Screening-Report (clean/flagged)',
        enables: 'Country/Industry Risk Score',
      },
      {
        name: 'Country/Industry Risk Score',
        owner: 'Procurement-Compliance',
        action: 'klassifiziert nach LkSG-Risk-Map (Land, Branche, Größe)',
        system: 'IntegrityNext + LkSG-Risk-Matrix',
        when: 'innerhalb 5 Werktagen',
        output: 'Risk-Tier 1 / 2 / 3',
        enables: 'On-site Audit Trigger',
      },
      {
        name: 'On-site Audit Trigger',
        owner: 'Procurement-Compliance',
        action: 'plant Audit bei Tier-3-Risk oder begründetem Verdacht',
        system: 'Audit-Workbench + Travel-Booking',
        when: 'bei Tier-3 sofort, sonst stichprobenartig',
        output: 'Audit-Plan + Auditor-Assignment',
        enables: 'Audit Execution',
      },
      {
        name: 'Audit Execution',
        owner: 'External Auditor (TÜV / SGS)',
        action: 'führt SA8000- oder amfori-BSCI-Audit durch',
        system: 'amfori-BSCI Audit-Tool',
        when: 'innerhalb 30 Tage',
        output: 'Audit-Findings (NCs + Empfehlungen)',
        enables: 'Findings Documentation',
      },
      {
        name: 'Findings Documentation',
        owner: 'Procurement-Compliance',
        action: 'dokumentiert Non-Conformities + Risiko-Klassifizierung',
        system: 'IntegrityNext + Risk-Register',
        when: 'innerhalb 5 Werktage nach Audit',
        output: 'CAPA-Issue-Liste',
        enables: 'Corrective Action Plan',
      },
      {
        name: 'Corrective Action Plan',
        owner: 'Lieferant (mit Procurement-Aufsicht)',
        action: 'erstellt + implementiert Maßnahmenplan für jede NC',
        system: 'IntegrityNext-CAPA-Modul',
        when: 'innerhalb 90 Tage',
        output: 'CAPA-Closure-Evidence',
        enables: 'Annual Re-certification',
      },
      {
        name: 'Annual Re-certification',
        owner: 'Procurement-Compliance',
        action: 'überprüft Status, erneuert Vendor-Code-Aktivierung',
        system: 'IntegrityNext + SAP Ariba',
        when: 'jährlich zum Vertragsstichtag',
        output: 'Re-cert-Statement (continued / suspended)',
        enables: 'LkSG Annual Report',
      },
    ],
  },

  // ── 3. Scope 1 Data Collection (10 Activities) ──────────────────────────────
  {
    processId: BSH_DRILLABLE_PROCESS_IDS.SCOPE1_COLLECTION,
    parentX: -6,
    parentZ: 3,
    activities: [
      {
        name: 'Define Scope-1 Boundary',
        owner: 'ESG-PMO',
        action: 'definiert organisatorische Grenze (Werke, Fuhrpark, Gebäude)',
        system: 'OneTrust ESG + Confluence',
        when: 'bis 31.01.',
        output: 'Boundary-Doc (operational control)',
        enables: 'Inventory Emission Sources',
      },
      {
        name: 'Inventory Emission Sources',
        owner: 'Plant-EHS',
        action: 'inventarisiert Gas-, Diesel-, Kältemittel-Quellen pro Werk',
        system: 'SAP EHS + Plant-Master-Data',
        when: 'bis 15.02.',
        output: 'Source-Inventar (alle 40 Werke)',
        enables: 'Plant-Level Data Request',
      },
      {
        name: 'Plant-Level Data Request',
        owner: 'Group-Sustainability',
        action: 'verschickt strukturierte Daten-Tickets pro Werk',
        system: 'Plant-Survey-Tool (Microsoft Forms)',
        when: 'bis 28.02.',
        output: 'Data-Request-Tickets',
        enables: 'Validate Source Data',
      },
      {
        name: 'Validate Source Data',
        owner: 'Plant-Manager',
        action: 'validiert Verbrauchswerte gegen Energie-Rechnungen + Logbücher',
        system: 'Plant-EHS-System + SAP S/4 FI',
        when: 'bis 15.03.',
        output: 'Validation-Memo pro Werk',
        enables: 'Apply Emission Factors',
      },
      {
        name: 'Apply Emission Factors (DEFRA/IPCC)',
        owner: 'ESG-Analyst',
        action: 'multipliziert Verbrauchsdaten mit Emissionsfaktoren',
        system: 'Sphera GHG-Tool',
        when: 'bis 31.03.',
        output: 'CO2e-Werte pro Source',
        enables: 'Aggregate by Site',
      },
      {
        name: 'Aggregate by Site',
        owner: 'ESG-Analyst',
        action: 'aggregiert pro Werk + verifiziert Plausibilität',
        system: 'Sphera GHG-Tool',
        when: 'bis 15.04.',
        output: 'Site-Level-Report (40 Werke)',
        enables: 'Internal QA Review',
      },
      {
        name: 'Internal QA Review',
        owner: 'Internal Audit',
        action: 'reviewt Datenqualität + Auditierbarkeit',
        system: 'TeamMate+ Audit-Software',
        when: 'bis 22.04.',
        output: 'QA-Sign-off',
        enables: 'Aggregate to Group-Level',
      },
      {
        name: 'Aggregate to Group-Level',
        owner: 'ESG-Analyst',
        action: 'aggregiert auf Konzern-Ebene + Brand-Splits',
        system: 'Sphera GHG-Tool',
        when: 'bis 25.04.',
        output: 'Group-Level-Statement',
        enables: 'Reconcile vs Energy-Bills',
      },
      {
        name: 'Reconcile vs Energy-Bills',
        owner: 'Finance + Sustainability',
        action: 'prüft Konsistenz mit konsolidierten Energie-Rechnungen',
        system: 'SAP FI + Sphera',
        when: 'bis 28.04.',
        output: 'Reconciliation-Memo',
        enables: 'Hand-over to CSRD-Reporting',
      },
      {
        name: 'Hand-over to CSRD-Reporting',
        owner: 'ESG-Analyst',
        action: 'übergibt validierten Datensatz an CSRD-Process',
        system: 'Workiva ESG-Reporting',
        when: 'bis 30.04.',
        output: 'Scope-1-Final-Datensatz',
        enables: 'CSRD Materiality Assessment',
      },
    ],
  },

  // ── 4. GDPR Incident Response (6 Activities) ────────────────────────────────
  {
    processId: BSH_DRILLABLE_PROCESS_IDS.GDPR_INCIDENT,
    parentX: 6,
    parentZ: 3,
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
];

function freeTextDescriptionFor(act: SeedActivity): string {
  return `${act.owner} ${act.action} (${act.system}) — ${act.when}. Output: ${act.output} → ermöglicht ${act.enables}.`;
}

/**
 * Builder analog zu `buildBshActivitySeed()`, aber für die ESG-Compliance-Transformation-Demo.
 * Nutzt EXISTIERENDE Process-IDs aus `demo-architecture-bsh.ts` als Composition-Parents
 * (statt eigene Processes zu generieren).
 */
export function buildBshTransformationActivities(): BshActivitySeedData {
  const elements: SeedElement[] = [];
  const connections: SeedConnection[] = [];

  for (const proc of ESG_PROCESSES) {
    const activityIds: string[] = [];
    proc.activities.forEach((act, idx) => {
      const aId = `${proc.processId}-act-${idx + 1}`;
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
        posX: proc.parentX,
        posY: ACTIVITY_HIDDEN_Y,
        posZ: proc.parentZ,
        metadataJson: JSON.stringify({
          source: 'bsh-esg-activities',
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

      // Composition: parent process → child activity (ArchiMate convention)
      connections.push({
        id: uuid(),
        sourceId: proc.processId,
        targetId: aId,
        type: 'composition',
        label: 'composes',
      });
    });

    // Sequential flow between activities (i → i+1)
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
