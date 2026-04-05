/**
 * Standards Database Connector
 *
 * Provides architecture elements from compliance/standards frameworks.
 * Two modes:
 *   1. Pre-loaded templates (ISO 27001, BSI IT-Grundschutz, NIST CSF, DORA, NIS2, KRITIS)
 *   2. NIST OSCAL API fetch for live catalog data
 *
 * NIST OSCAL API:
 *   GET https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json
 *
 * Creates requirement/constraint elements that can be linked to existing architecture.
 */

import { v4 as uuid } from 'uuid';
import type { ConnectorConfig, IConnector, AuthMethod, ConnectorType } from './base.connector';
import type { ParsedElement, ParsedConnection } from '../upload.service';

// ─── Built-in Standards Templates ───

interface StandardControl {
  id: string;
  title: string;
  description: string;
  family?: string;
  priority?: string;
}

const ISO_27001_CONTROLS: StandardControl[] = [
  // Annex A — selected key controls
  { id: 'A.5.1', title: 'Policies for information security', family: 'Organizational', description: 'Management direction for information security' },
  { id: 'A.5.2', title: 'Information security roles and responsibilities', family: 'Organizational', description: 'Define and allocate information security responsibilities' },
  { id: 'A.5.3', title: 'Segregation of duties', family: 'Organizational', description: 'Conflicting duties shall be segregated' },
  { id: 'A.6.1', title: 'Screening', family: 'People', description: 'Background verification checks on candidates' },
  { id: 'A.7.1', title: 'Physical security perimeters', family: 'Physical', description: 'Security perimeters shall be defined' },
  { id: 'A.8.1', title: 'User endpoint devices', family: 'Technological', description: 'Protect information on user endpoint devices' },
  { id: 'A.8.2', title: 'Privileged access rights', family: 'Technological', description: 'Restrict and manage privileged access rights' },
  { id: 'A.8.3', title: 'Information access restriction', family: 'Technological', description: 'Access to information restricted per policy' },
  { id: 'A.8.5', title: 'Secure authentication', family: 'Technological', description: 'Secure authentication technologies and procedures' },
  { id: 'A.8.7', title: 'Protection against malware', family: 'Technological', description: 'Protection against malware shall be implemented' },
  { id: 'A.8.8', title: 'Management of technical vulnerabilities', family: 'Technological', description: 'Technical vulnerabilities shall be managed' },
  { id: 'A.8.9', title: 'Configuration management', family: 'Technological', description: 'Configurations shall be established and managed' },
  { id: 'A.8.10', title: 'Information deletion', family: 'Technological', description: 'Information shall be deleted when no longer required' },
  { id: 'A.8.11', title: 'Data masking', family: 'Technological', description: 'Data masking shall be used per policy' },
  { id: 'A.8.12', title: 'Data leakage prevention', family: 'Technological', description: 'Measures to prevent data leakage' },
  { id: 'A.8.15', title: 'Logging', family: 'Technological', description: 'Logs recording activities shall be produced and stored' },
  { id: 'A.8.16', title: 'Monitoring activities', family: 'Technological', description: 'Networks, systems and applications shall be monitored' },
  { id: 'A.8.23', title: 'Web filtering', family: 'Technological', description: 'Access to external websites shall be managed' },
  { id: 'A.8.24', title: 'Use of cryptography', family: 'Technological', description: 'Rules for cryptography shall be defined' },
  { id: 'A.8.25', title: 'Secure development lifecycle', family: 'Technological', description: 'Secure development rules shall be established' },
  { id: 'A.8.28', title: 'Secure coding', family: 'Technological', description: 'Secure coding principles shall be applied' },
];

const DORA_CONTROLS: StandardControl[] = [
  { id: 'DORA-1.1', title: 'ICT Risk Management Framework', family: 'ICT Risk', description: 'Establish comprehensive ICT risk management framework', priority: 'critical' },
  { id: 'DORA-1.2', title: 'ICT Risk Management Strategy', family: 'ICT Risk', description: 'ICT risk management strategy aligned with business strategy' },
  { id: 'DORA-2.1', title: 'ICT Incident Classification', family: 'Incident', description: 'Classify ICT-related incidents by severity' },
  { id: 'DORA-2.2', title: 'Major Incident Reporting', family: 'Incident', description: 'Report major ICT-related incidents to supervisory authorities' },
  { id: 'DORA-3.1', title: 'Digital Operational Resilience Testing', family: 'Testing', description: 'Establish testing program for operational resilience' },
  { id: 'DORA-3.2', title: 'Threat-Led Penetration Testing', family: 'Testing', description: 'Advanced TLPT for systemically important entities' },
  { id: 'DORA-4.1', title: 'Third-Party ICT Risk', family: 'Third-Party', description: 'Manage risks from third-party ICT service providers' },
  { id: 'DORA-4.2', title: 'Critical ICT Third-Party Provider Oversight', family: 'Third-Party', description: 'Oversight framework for critical ICT providers' },
  { id: 'DORA-5.1', title: 'ICT Threat Intelligence Sharing', family: 'Sharing', description: 'Participate in threat intelligence sharing arrangements' },
];

const NIS2_CONTROLS: StandardControl[] = [
  { id: 'NIS2-1', title: 'Risk Management Measures', family: 'Risk', description: 'Implement appropriate cybersecurity risk management measures' },
  { id: 'NIS2-2', title: 'Incident Handling', family: 'Incident', description: 'Handle and report cybersecurity incidents' },
  { id: 'NIS2-3', title: 'Business Continuity', family: 'Continuity', description: 'Ensure business continuity and crisis management' },
  { id: 'NIS2-4', title: 'Supply Chain Security', family: 'Supply Chain', description: 'Security in supply chain and supplier relationships' },
  { id: 'NIS2-5', title: 'Network Security', family: 'Network', description: 'Security in network and information systems' },
  { id: 'NIS2-6', title: 'Vulnerability Management', family: 'Vulnerability', description: 'Vulnerability handling and disclosure' },
  { id: 'NIS2-7', title: 'Cybersecurity Hygiene', family: 'Hygiene', description: 'Basic cyber hygiene practices and training' },
  { id: 'NIS2-8', title: 'Cryptographic Controls', family: 'Crypto', description: 'Policies on use of cryptography and encryption' },
  { id: 'NIS2-9', title: 'Access Control', family: 'Access', description: 'Human resources security and access control policies' },
  { id: 'NIS2-10', title: 'Multi-Factor Authentication', family: 'Auth', description: 'MFA and continuous authentication solutions' },
];

const BSI_CONTROLS: StandardControl[] = [
  { id: 'BSI-ORP.1', title: 'Organisation', family: 'ORP', description: 'Organizational security management' },
  { id: 'BSI-ORP.2', title: 'Personal', family: 'ORP', description: 'Personnel security' },
  { id: 'BSI-ORP.3', title: 'Sensibilisierung und Schulung', family: 'ORP', description: 'Awareness and training' },
  { id: 'BSI-CON.1', title: 'Kryptokonzept', family: 'CON', description: 'Cryptography concept' },
  { id: 'BSI-CON.3', title: 'Datensicherungskonzept', family: 'CON', description: 'Backup concept' },
  { id: 'BSI-OPS.1.1.2', title: 'Ordnungsgemäße IT-Administration', family: 'OPS', description: 'Proper IT administration' },
  { id: 'BSI-OPS.1.1.3', title: 'Patch- und Änderungsmanagement', family: 'OPS', description: 'Patch and change management' },
  { id: 'BSI-OPS.1.1.4', title: 'Schutz vor Schadprogrammen', family: 'OPS', description: 'Malware protection' },
  { id: 'BSI-OPS.1.1.5', title: 'Protokollierung', family: 'OPS', description: 'Logging' },
  { id: 'BSI-DER.1', title: 'Detektion von sicherheitsrelevanten Ereignissen', family: 'DER', description: 'Security event detection' },
  { id: 'BSI-DER.2.1', title: 'Behandlung von Sicherheitsvorfällen', family: 'DER', description: 'Incident response' },
  { id: 'BSI-INF.1', title: 'Allgemeines Gebäude', family: 'INF', description: 'General building security' },
];

const KRITIS_CONTROLS: StandardControl[] = [
  { id: 'KRITIS-1', title: 'Verfügbarkeit', family: 'Availability', description: 'Sicherstellung der Verfügbarkeit kritischer Dienste' },
  { id: 'KRITIS-2', title: 'Integrität', family: 'Integrity', description: 'Schutz der Integrität kritischer Systeme und Daten' },
  { id: 'KRITIS-3', title: 'Vertraulichkeit', family: 'Confidentiality', description: 'Gewährleistung der Vertraulichkeit sensibler Informationen' },
  { id: 'KRITIS-4', title: 'Resilienz', family: 'Resilience', description: 'Aufbau von Widerstandsfähigkeit gegen Störungen' },
  { id: 'KRITIS-5', title: 'Incident Response', family: 'Response', description: 'Reaktion auf Sicherheitsvorfälle innerhalb gesetzlicher Fristen' },
  { id: 'KRITIS-6', title: 'IT-SiG 2.0 Compliance', family: 'Compliance', description: 'Einhaltung der Anforderungen des IT-Sicherheitsgesetzes 2.0' },
  { id: 'KRITIS-7', title: 'Angriffserkennung (SzA)', family: 'Detection', description: 'Systeme zur Angriffserkennung gemäß §8a BSIG' },
  { id: 'KRITIS-8', title: 'Meldepflichten', family: 'Reporting', description: 'Meldung erheblicher Störungen an BSI' },
];

const STANDARDS_MAP: Record<string, StandardControl[]> = {
  'iso27001': ISO_27001_CONTROLS,
  'dora': DORA_CONTROLS,
  'nis2': NIS2_CONTROLS,
  'bsi': BSI_CONTROLS,
  'kritis': KRITIS_CONTROLS,
};

export class StandardsConnector implements IConnector {
  readonly type: ConnectorType = 'standards_db';
  readonly displayName = 'Standards & Compliance';
  readonly supportedAuthMethods: AuthMethod[] = ['api_key'];

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    const source = (config.filters.standard || 'iso27001').toLowerCase();

    // Built-in templates always work
    if (STANDARDS_MAP[source]) {
      return { success: true, message: `Template loaded — ${STANDARDS_MAP[source].length} controls available (${source.toUpperCase()})` };
    }

    // NIST OSCAL API check
    if (source === 'nist' || source === 'nist_csf' || source === 'nist_800_53') {
      try {
        const resp = await fetch('https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json', {
          method: 'HEAD',
          signal: AbortSignal.timeout(10000),
        });
        return resp.ok
          ? { success: true, message: 'NIST OSCAL API reachable' }
          : { success: false, message: `NIST API returned ${resp.status}` };
      } catch (err: any) {
        return { success: false, message: `NIST API unreachable: ${err.message}` };
      }
    }

    return { success: false, message: `Unknown standard: ${source}. Available: iso27001, dora, nis2, bsi, kritis, nist` };
  }

  async getAvailableTypes(_config: ConnectorConfig): Promise<string[]> {
    return ['iso27001', 'dora', 'nis2', 'bsi', 'kritis', 'nist_800_53'];
  }

  async fetchData(config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }> {
    const source = (config.filters.standard || 'iso27001').toLowerCase();

    // NIST OSCAL live fetch
    if (source === 'nist' || source === 'nist_csf' || source === 'nist_800_53') {
      return this.fetchNIST(config);
    }

    // Built-in templates
    const controls = STANDARDS_MAP[source];
    if (!controls) {
      return {
        elements: [],
        connections: [],
        warnings: [`Unknown standard: ${source}`],
        metadata: {},
      };
    }

    return this.buildFromTemplate(source, controls);
  }

  // ─── Template Builder ───

  private buildFromTemplate(
    standard: string,
    controls: StandardControl[],
  ): { elements: ParsedElement[]; connections: ParsedConnection[]; warnings: string[]; metadata: Record<string, unknown> } {
    const elements: ParsedElement[] = [];
    const connections: ParsedConnection[] = [];
    const familyIds = new Map<string, string>();

    // Create family grouping elements
    const families = [...new Set(controls.map(c => c.family).filter(Boolean))] as string[];
    for (const family of families) {
      const elemId = `elem-${uuid().slice(0, 8)}`;
      familyIds.set(family, elemId);

      elements.push({
        id: elemId,
        name: `[${standard.toUpperCase()}] ${family}`,
        type: 'grouping',
        layer: 'motivation',
        description: `${standard.toUpperCase()} control family: ${family}`,
        status: 'current',
        riskLevel: 'low',
        maturityLevel: 3,
        properties: { standard, family, source: 'standards_db' },
      });
    }

    // Create control elements
    for (const ctrl of controls) {
      const elemId = `elem-${uuid().slice(0, 8)}`;

      const type = ctrl.priority === 'critical' ? 'requirement' : 'constraint';

      elements.push({
        id: elemId,
        name: `[${ctrl.id}] ${ctrl.title}`,
        type,
        layer: 'motivation',
        description: ctrl.description,
        status: 'current',
        riskLevel: ctrl.priority === 'critical' ? 'high' : 'low',
        maturityLevel: 3,
        properties: {
          standard,
          controlId: ctrl.id,
          family: ctrl.family || '',
          source: 'standards_db',
        },
      });

      // Link control → family
      if (ctrl.family && familyIds.has(ctrl.family)) {
        connections.push({
          id: `conn-${uuid().slice(0, 8)}`,
          sourceId: elemId,
          targetId: familyIds.get(ctrl.family)!,
          type: 'composition',
        });
      }
    }

    return {
      elements,
      connections,
      warnings: [`${standard.toUpperCase()}: ${controls.length} controls loaded from template`],
      metadata: { standard, source: 'template', controlCount: controls.length },
    };
  }

  // ─── NIST OSCAL Live Fetch ───

  private async fetchNIST(_config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }> {
    const elements: ParsedElement[] = [];
    const connections: ParsedConnection[] = [];
    const warnings: string[] = [];

    try {
      const resp = await fetch(
        'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json',
        { signal: AbortSignal.timeout(30000) },
      );

      if (!resp.ok) {
        warnings.push(`NIST OSCAL fetch failed: ${resp.status}`);
        return { elements, connections, warnings, metadata: {} };
      }

      const catalog = await resp.json() as any;
      const groups = catalog?.catalog?.groups || [];
      const familyIds = new Map<string, string>();

      for (const group of groups) {
        const familyId = `elem-${uuid().slice(0, 8)}`;
        const familyTitle = group.title || group.id || '';
        familyIds.set(group.id, familyId);

        elements.push({
          id: familyId,
          name: `[NIST] ${familyTitle}`,
          type: 'grouping',
          layer: 'motivation',
          description: `NIST SP 800-53 family: ${familyTitle}`,
          status: 'current',
          riskLevel: 'low',
          maturityLevel: 3,
          properties: { standard: 'nist_800_53', family: group.id, source: 'standards_db' },
        });

        // Limit controls per family to avoid overwhelming import
        const controls = (group.controls || []).slice(0, 30);

        for (const ctrl of controls) {
          const elemId = `elem-${uuid().slice(0, 8)}`;
          const title = ctrl.title || ctrl.id || '';

          elements.push({
            id: elemId,
            name: `[${ctrl.id?.toUpperCase()}] ${title}`,
            type: 'constraint',
            layer: 'motivation',
            description: extractOSCALText(ctrl.parts),
            status: 'current',
            riskLevel: 'low',
            maturityLevel: 3,
            properties: {
              standard: 'nist_800_53',
              controlId: ctrl.id,
              family: group.id,
              source: 'standards_db',
            },
          });

          connections.push({
            id: `conn-${uuid().slice(0, 8)}`,
            sourceId: elemId,
            targetId: familyId,
            type: 'composition',
          });
        }
      }

      warnings.push(`NIST SP 800-53: ${elements.length} controls loaded from OSCAL`);
    } catch (err: any) {
      warnings.push(`NIST OSCAL fetch error: ${err.message}`);
    }

    return { elements, connections, warnings, metadata: { standard: 'nist_800_53', source: 'oscal_api' } };
  }
}

// ─── Helpers ───

function extractOSCALText(parts: any[] | undefined): string {
  if (!parts || !Array.isArray(parts)) return '';
  const texts: string[] = [];
  for (const part of parts) {
    if (part.prose) texts.push(part.prose);
    if (part.parts) texts.push(extractOSCALText(part.parts));
  }
  return texts.join(' ').substring(0, 500);
}

/** @internal Exported for testing only */
export const __testExports = {
  extractOSCALText,
  STANDARDS_MAP,
  ISO_27001_CONTROLS,
  DORA_CONTROLS,
  NIS2_CONTROLS,
  BSI_CONTROLS,
  KRITIS_CONTROLS,
};
