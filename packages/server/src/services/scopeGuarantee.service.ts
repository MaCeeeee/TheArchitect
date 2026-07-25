/**
 * THE-516 / REQ-LAW-002.7 — Scope-Guarantee, purer Kern (ADR-0006).
 *
 * Der per ContextTrace belegte Fehlermodus (THE-423/CRA): eine Familie wird
 * GEFUNDEN, aber die topHits enthalten nur Durchführungs-§§ — der Artikel,
 * der über die Anwendbarkeit ENTSCHEIDET (Geltungsbereich), liegt dem Judge
 * nie vor → Fehlurteil „gilt nicht". Dieser Kern garantiert je Familie bis zu
 * 2 Geltungsbereichs-§§ im Judge-Beweismaterial (E1: Beweis-Garantie, KEIN
 * Ranking-Boost — das Retrieval bleibt unangetastet).
 *
 * PURE — kein I/O. Task 2 (Verdrahtung in lawDiscovery.service) liest die
 * Korpus-Docs, ruft diese Funktionen und setzt das Flag/Alerting (E5).
 * Erster produktiver Konsument der ONTO-Typisierung: die E3-Regeln hier sind
 * der Präzedenzfall für alle künftigen Konsumenten.
 */
import type { CorpusHit, DiscoveryCandidate } from '@thearchitect/shared';
import { buildRegulationKey } from '@thearchitect/shared';

/**
 * Korpus-Doc-Ausschnitt EINER Familie, wie der Kern ihn braucht — bewusst als
 * plain shape (kein Mongoose `Document`), damit Task 2 `.lean()`-Reads und der
 * Eval-Harness (Task 3) Fixtures übergeben können.
 * Feld-Semantik identisch zu `ICorpusRegulation` (corpusClient.service.ts).
 */
export interface ScopeCorpusDoc {
  source: string;
  paragraphNumber: string;
  title: string;
  fullText: string;
  language: string;
  jurisdiction: string;
  versionHash: string;
  typing?: {
    provisionKind?: string | null;
    versionHash?: string;
    status?: 'suggested' | 'confirmed' | 'rejected';
  };
}

export interface SelectScopeOptions {
  /**
   * Bevorzugte Sprachvariante (E2) — Task 2 übergibt die dominante Sprache
   * der vorhandenen Familien-topHits, damit das Judge-Beweismaterial
   * sprachlich homogen bleibt.
   */
  preferredLanguage?: string;
}

/**
 * E3-Konsumregeln (ADR-0006 — Präzedenz für alle künftigen Typing-Konsumenten).
 * Jede Regel ist ein eigener Guard, damit keine „aus Versehen" wegfällt.
 */
function isConsumableScopeDoc(d: ScopeCorpusDoc): boolean {
  // E3: ohne typing ist der § schlicht untypisiert — keine Garantie möglich.
  if (!d.typing) return false;
  // E3: nur die scope-applicability-Achse trägt die Garantie.
  if (d.typing.provisionKind !== 'scope-applicability') return false;
  // E3.1 (Text-Anker): nach einer Novelle beschreibt das Label einen ALTEN
  // Text-Stand — stale ⇒ wie untypisiert behandeln. Lieber keine Garantie als
  // eine falsche; die Garantie fällt stumm weg, bis der Re-Typing-Batch lief.
  if (d.typing.versionHash !== d.versionHash) return false;
  // E3.2: `rejected` NIE konsumieren — diese Regel muss VOR dem ersten
  // rejected-Label existieren, sonst konsumiert der erste Konsument still
  // menschlich verworfene Vorschläge. `suggested` und `confirmed` passieren.
  if (d.typing.status === 'rejected') return false;
  return true;
}

/** Numerischer Artikel-Parse: „Art. 5a" → {num: 5, suffix: 'a'}, „§ 3" → {num: 3}. */
function parseArticleNumber(paragraphNumber: string): { num: number; suffix: string } | null {
  const m = /(\d+)\s*([a-z]*)/i.exec(paragraphNumber);
  if (!m) return null;
  return { num: Number(m[1]), suffix: m[2].toLowerCase() };
}

/**
 * E2-Ordnung: NUMERISCH primär aufsteigend („Art. 2" < „Art. 10" — naive
 * String-Sortierung würde das brechen), Buchstaben-Suffix sekundär
 * (Art. 5 < Art. 5a), Unparsebares zuletzt. Deterministischer Tie-Break über
 * source/paragraphNumber — gleiche Eingabemenge ⇒ immer gleiche Auswahl.
 */
function compareByArticleNumber(a: ScopeCorpusDoc, b: ScopeCorpusDoc): number {
  const pa = parseArticleNumber(a.paragraphNumber);
  const pb = parseArticleNumber(b.paragraphNumber);
  if (pa && pb) {
    if (pa.num !== pb.num) return pa.num - pb.num;
    if (pa.suffix !== pb.suffix) return pa.suffix < pb.suffix ? -1 : 1;
  } else if (pa && !pb) {
    return -1;
  } else if (!pa && pb) {
    return 1;
  }
  const ka = `${a.source}:${a.paragraphNumber}`;
  const kb = `${b.source}:${b.paragraphNumber}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * E2-Sprachwahl: EINE Sprachvariante je Familie. Fallback-Reihenfolge
 * deterministisch dokumentiert: preferredLanguage (falls Kandidaten vorhanden)
 * → 'de' → 'en' → lexikographisch kleinste vorhandene Sprache.
 */
function pickLanguage(languages: Set<string>, preferred?: string): string | undefined {
  if (preferred && languages.has(preferred)) return preferred;
  if (languages.has('de')) return 'de';
  if (languages.has('en')) return 'en';
  return [...languages].sort()[0];
}

/**
 * Wählt aus den Korpus-Docs EINER Familie die konsumierbaren scope-§§:
 * E3-Guards → eine Sprachvariante → max. 2, nach niedrigster Artikelnummer
 * (ADR-0006 E2/E3). Gibt die Docs zurück (noch keine Hits) — die
 * Hit-Formung macht `injectScopeHits`.
 */
export function selectScopeProvisions(docs: ScopeCorpusDoc[], opts: SelectScopeOptions): ScopeCorpusDoc[] {
  const consumable = docs.filter(isConsumableScopeDoc);
  if (consumable.length === 0) return [];

  const language = pickLanguage(new Set(consumable.map(d => d.language)), opts.preferredLanguage);
  const inLanguage = consumable.filter(d => d.language === language);

  // E2-Dosierung: max. 2 scope-§§ je Familie (AC-6) — Art. 1/2 zuerst, weil
  // die niedrigsten Artikelnummern in EU-Rechtsakten typischerweise
  // Gegenstand/Geltungsbereich tragen.
  return [...inLanguage].sort(compareByArticleNumber).slice(0, 2);
}

export interface InjectScopeHitsResult {
  candidate: DiscoveryCandidate;
  /** Nur GENUIN hinzugefügte regulationKeys — Dedupe-Treffer erscheinen hier nicht. */
  injectedKeys: string[];
}

/**
 * Injiziert die gewählten scope-§§ ins Judge-Beweismaterial des Kandidaten.
 *
 * Injektion ist Beweis-Garantie, keine Ranking-Änderung — der Familien-Score
 * ist zu diesem Zeitpunkt fix (ADR-0006 E1): `score`, `hitCount` und die
 * Reihenfolge der Bestands-topHits bleiben EXAKT unverändert; injizierte
 * Einträge tragen neutralen Score 0 und werden ANS ENDE gehängt (die
 * Top-Similarity-Ordnung, die der Judge kennt, bleibt intakt).
 *
 * E2-Dedupe: Ist ein scope-§ bereits regulär in den topHits (gleicher
 * regulationKey), gilt die Garantie als erfüllt — kein Duplikat, kein Eintrag
 * in `injectedKeys`. Der Eingabe-Kandidat wird NICHT mutiert.
 */
export function injectScopeHits(candidate: DiscoveryCandidate, scopeDocs: ScopeCorpusDoc[]): InjectScopeHitsResult {
  const existingKeys = new Set(candidate.topHits.map(h => h.regulationKey));
  const injected: CorpusHit[] = [];
  const injectedKeys: string[] = [];

  for (const d of scopeDocs) {
    // Identität exakt wie der Korpus sie baut (ADR-0001: byte-identische Keys
    // auf beiden Seiten) — sonst greift der Dedupe nie.
    const regulationKey = buildRegulationKey(d.source, d.paragraphNumber);
    if (existingKeys.has(regulationKey)) continue; // Garantie erfüllt — schon in Evidenz
    existingKeys.add(regulationKey);
    injected.push({
      regulationKey,
      versionHash: d.versionHash,
      source: d.source,
      paragraphNumber: d.paragraphNumber,
      title: d.title,
      jurisdiction: d.jurisdiction,
      language: d.language,
      // Score-Neutralität (harte Leitplanke): 0, damit nichts stromabwärts
      // versehentlich in eine Score-Rechnung einfließen kann.
      score: 0,
      // Herkunfts-Markierung (E4): macht „wurden injizierte §§ zitiert,
      // kippten Urteile?" im ContextTrace abfragbar (Notar-Prinzip).
      origin: 'scope-guarantee',
    });
    injectedKeys.push(regulationKey);
  }

  return {
    candidate: { ...candidate, topHits: [...candidate.topHits, ...injected] },
    injectedKeys,
  };
}

/**
 * Sichtbarkeits-Feld (ADR-0006 E5). `unavailable` wird NICHT hier abgeleitet —
 * das ist der Lookup-Fehler-Zustand, den Task 2 setzt, wenn der Korpus-Read
 * wirft (und der als EINZIGER alertet).
 */
export type ScopeGuaranteeState = 'applied' | 'partial' | 'unavailable';

/** Per-Familie-Ergebnis, wie Task 2 es nach Auswahl + Injektion zusammensetzt. */
export interface FamilyScopeResult {
  family: string;
  /** ≥1 scope-§ liegt im Beweismaterial — injiziert ODER bereits regulär vorhanden (E2-Dedupe). */
  covered: boolean;
}

/**
 * `applied` = jede Kandidaten-Familie hat ≥1 scope-§ in der Evidenz;
 * `partial` = mind. eine Familie ohne konsumierbare scope-§§ — ein LEGITIMER
 * Zustand (z. B. frisch gecrawltes Gesetz vor dem Re-Typing-Batch), daher
 * nur Log + Feld, KEIN Alert (ADR-0006 E5, Alert-Müdigkeit).
 * Leere Menge ⇒ `applied` (nichts zu garantieren).
 */
export function guaranteeStateFor(results: FamilyScopeResult[]): Exclude<ScopeGuaranteeState, 'unavailable'> {
  return results.every(r => r.covered) ? 'applied' : 'partial';
}
