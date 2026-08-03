/**
 * legalApplicability.service — der Anschluss von Frage 1 (THE-555).
 *
 *     „Betrifft mich dieses Gesetz?"
 *     → „Betrifft dich in Rolle X — N von M getypten Normsätzen."
 *
 * ── WAS DIESER DIENST IST — UND WAS NICHT ──
 *
 * Beide Enden existierten vor ihm und sind gemessen:
 *   - Kundenseite:  `Project.legalProfile` (THE-548, Gate 8/8)
 *   - Norm-Seite:   Korpus-Typisierung, 77 % partyRole auf 1640 Provisions,
 *                   Hausregel in `typedProvision.service.ts` (THE-540 Achse 1)
 *   - Bewertung:    `assessNormApplicability` (shared) — bis THE-555 ohne Aufrufer
 *
 * Dieser Dienst ist NUR das Gelenk. Er erfindet keine Rollen (nur konsumierbare
 * Typisierung zählt), dupliziert keine Hausregel (Import statt Kopie) und
 * rechnet nichts zusammen, was getrennt gehört.
 *
 * ── SPRACHVARIANTEN ──
 *
 * Der Korpus führt Gesetze in Sprachfassungen (`dora` + `dora-de`,
 * `mdr-de` + `mdr-en`, gemessen 2026-08-03: 25 Quellen). Für die Frage
 * „betrifft mich DORA?" sind das EIN Gesetz — und je Gesetz darf nur EINE
 * Fassung zählen, sonst verdoppelt sich jeder Zähler. Priorität: bar > -de
 * > -en; die gewählte Fassung steht in der Antwort.
 *
 * Linear: THE-555 · Rahmen: Facetten-Landkarte (Facette 1), ADR-0007
 */
import {
  assessNormApplicability,
  type LegalProfile,
  type LegalApplicabilityAssessment,
} from '@thearchitect/shared';
import { isConsumableTyping, type TypedProvisionDoc } from './typedProvision.service';

/** Korpus-Zusammenfassung, wie die schlanke Leseprojektion sie liefert. */
export interface TypedCorpusSummary extends TypedProvisionDoc {
  source: string;
}

/** `dora-de` → `dora`, `mdr-en` → `mdr`. Nur echte Sprachsuffixe. */
export function normalizeCorpusSource(source: string): string {
  return source.replace(/-(de|en)$/, '');
}

/**
 * Eine Sprachfassung je Gesetz — Priorität bar > `-de` > `-en`.
 *
 * Die bare Fassung ist im Korpus die kanonische (deutsch), `-de` ihre
 * explizite Schwester, `-en` die Übersetzung. Beide zu zählen hieße, jede
 * Provision doppelt zu zählen — der Nenner der Antwort wäre erfunden.
 */
export function pickExpression(variants: string[]): string {
  const score = (s: string): number => (s.endsWith('-en') ? 2 : s.endsWith('-de') ? 1 : 0);
  return [...variants].sort((a, b) => score(a) - score(b))[0];
}

export interface LawRoleAggregate {
  /** Normalisiertes Gesetz (`dora`). */
  law: string;
  /** Die gezählte Sprachfassung (`dora` oder `dora-de`). */
  expression: string;
  /** Provisions der gewählten Fassung — auch ungetypte (ehrlicher Nenner). */
  provisionsTotal: number;
  /** Davon mit konsumierbarer Typisierung (Hausregel). */
  provisionsTyped: number;
  /**
   * Rolle → die Kennungen der Provisions, die sie binden.
   *
   * Bewusst die LISTE, nicht die Zahl: Die Kennung IST die Section-`eId` der
   * Norm (gemessen THE-573: 46 von 46 bei nis2-de), also bis zum Gesetzestext
   * auflösbar. Die Anzahl ist `.length` — eine Quelle, damit Zahl und Liste
   * nicht auseinanderdriften können.
   */
  roleKeys: Map<string, string[]>;
}

/**
 * Wie viele bindende Artikel die Antwort namentlich nennt.
 *
 * DSGVO band im Referenzfall 39 Provisions — eine ungekürzte Liste wäre
 * Rauschen. Gekürzt wird trotzdem nicht still: `provisionsBinding` trägt
 * weiterhin die VOLLE Zahl, der Rest ist damit an der Antwort ablesbar.
 */
export const BINDING_PROVISIONS_CAP = 10;

/**
 * Verdichtet Korpus-Zusammenfassungen zu Rollen je Gesetz. REIN.
 *
 * Die Hausregel kommt aus `typedProvision.service.ts` — `rejected` und
 * stale Labels zählen als nicht vorhanden, nicht als Wert.
 */
export function aggregateTypedRoles(docs: TypedCorpusSummary[]): Map<string, LawRoleAggregate> {
  // 1. Fassung je Gesetz wählen — erst dann zählen.
  const variantsByLaw = new Map<string, Set<string>>();
  for (const d of docs) {
    const law = normalizeCorpusSource(d.source);
    const set = variantsByLaw.get(law) ?? new Set<string>();
    set.add(d.source);
    variantsByLaw.set(law, set);
  }

  const out = new Map<string, LawRoleAggregate>();
  for (const [law, variants] of variantsByLaw) {
    const expression = pickExpression([...variants]);
    const chosen = docs.filter((d) => d.source === expression);
    const roleKeys = new Map<string, string[]>();
    let typed = 0;
    for (const d of chosen) {
      if (!isConsumableTyping(d)) continue;
      const role = d.typing?.partyRole;
      if (!role) continue;
      typed += 1;
      roleKeys.set(role, [...(roleKeys.get(role) ?? []), d.regulationKey]);
    }
    out.set(law, { law, expression, provisionsTotal: chosen.length, provisionsTyped: typed, roleKeys });
  }
  return out;
}

export interface LegalApplicabilityRow extends LegalApplicabilityAssessment {
  law: string;
  expression: string;
  provisionsTotal: number;
  provisionsTyped: number;
  /** Bei `applicable`: wie viele getypte Provisions eine Profilrolle binden. */
  provisionsBinding?: number;
  /** Bei `applicable`: welche Profilrollen greifen. */
  matchedRoles?: string[];
  /**
   * Bei `applicable`: WELCHE Artikel binden — die Antwort auf Frage 2
   * (THE-573). Die Kennungen sind die Section-`eId`s der Norm und damit über
   * `GET /:projectId/norms/corpus:<expression>/sections/:eId` bis zum
   * Gesetzestext auflösbar.
   *
   * NICHT `citations` — das Feld gehört den Belegen der VERDRÄNGUNGS-Kante
   * („warum gilt DORA statt NIS2"). Beide beantworten im Prüfungsfall
   * verschiedene Fragen und dürfen nicht vermengt werden.
   *
   * Auf `BINDING_PROVISIONS_CAP` gekürzt; die volle Zahl steht in
   * `provisionsBinding`, der Rest ist die Differenz.
   */
  bindingProvisionEIds?: string[];
}

const STATE_ORDER: Record<LegalApplicabilityAssessment['state'], number> = {
  applicable: 0,
  displaced: 1,
  not_applicable: 2,
  undetermined: 3,
};

/**
 * Die Vier-Zustands-Antwort je Gesetz. REIN — kein I/O.
 *
 * Sortiert nach Betroffenheit (applicable → displaced → not_applicable →
 * undetermined): die Antwort vor dem Rauschen.
 */
export function assessLawsForProfile(
  profile: LegalProfile | null | undefined,
  aggregates: Map<string, LawRoleAggregate>,
): LegalApplicabilityRow[] {
  const rows: LegalApplicabilityRow[] = [];
  for (const agg of aggregates.values()) {
    const normRoles = [...agg.roleKeys.keys()];
    const assessment = assessNormApplicability(profile, {
      source: agg.law,
      addresseeClasses: normRoles,
    });

    const row: LegalApplicabilityRow = {
      ...assessment,
      law: agg.law,
      expression: agg.expression,
      provisionsTotal: agg.provisionsTotal,
      provisionsTyped: agg.provisionsTyped,
    };

    if (assessment.state === 'applicable') {
      const profileRoles = profile?.addresseeClasses ?? [];
      const matched = normRoles.filter((r) => profileRoles.includes(r));
      row.matchedRoles = matched;
      // Nur was eine PROFILROLLE bindet — nicht jeder getypte Artikel.
      const binding = matched.flatMap((r) => agg.roleKeys.get(r) ?? []);
      row.provisionsBinding = binding.length;
      // Die volle Zahl bleibt oben stehen; gekürzt wird nur die Namensliste,
      // und die Differenz ist damit ablesbar statt verschwiegen.
      row.bindingProvisionEIds = binding.slice(0, BINDING_PROVISIONS_CAP);
    }
    rows.push(row);
  }
  return rows.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.law.localeCompare(b.law));
}

export interface ProjectLegalApplicability {
  profilePresent: boolean;
  /** `unavailable` heißt: Server B nicht erreichbar — NICHT „nichts gilt". */
  corpus: 'ok' | 'unavailable';
  laws: LegalApplicabilityRow[];
  /**
   * Ehrlichkeits-Fußnote, fester Bestandteil der Antwort: suggested-Typisierung
   * (macro-F1 0,883) × Selbstauskunft = belegte Einschätzung, keine Rechtsberatung.
   */
  disclaimer: string;
}

export const LEGAL_APPLICABILITY_DISCLAIMER =
  'Assessment based on suggested corpus typing (partyRole macro-F1 0.883) and the project’s self-declared legal profile. It is an evidenced estimate, not legal advice.';

/** Korpus-Lesezugriff, injiziert — im Test ein Stub, in Produktion die schlanke Projektion. */
export type FetchTypedCorpus = () => Promise<TypedCorpusSummary[]>;

/**
 * Glue: Projekt-Profil + Korpus → Antwort.
 *
 * Korpus-Ausfall ist ein EIGENER Zustand (`corpus: 'unavailable'`), keine
 * leere Liste — eine leere Liste sähe aus wie „kein Gesetz betrifft dich",
 * und das wäre die gefährliche Fehlerrichtung.
 */
export async function buildProjectLegalApplicability(
  profile: LegalProfile | null | undefined,
  fetchCorpus: FetchTypedCorpus,
): Promise<ProjectLegalApplicability> {
  let docs: TypedCorpusSummary[];
  try {
    docs = await fetchCorpus();
  } catch {
    return {
      profilePresent: Boolean(profile?.addresseeClasses?.length),
      corpus: 'unavailable',
      laws: [],
      disclaimer: LEGAL_APPLICABILITY_DISCLAIMER,
    };
  }
  return {
    profilePresent: Boolean(profile?.addresseeClasses?.length),
    corpus: 'ok',
    laws: assessLawsForProfile(profile, aggregateTypedRoles(docs)),
    disclaimer: LEGAL_APPLICABILITY_DISCLAIMER,
  };
}
