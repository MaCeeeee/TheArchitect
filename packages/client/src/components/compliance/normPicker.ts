/**
 * normPicker — bündelt die Korpus-Normen für die Auswahl im Generator
 * (THE-570).
 *
 * ── WARUM BÜNDELN ──
 *
 * Der Korpus führt jede Sprachfassung als eigene Quelle: `nis2` neben
 * `nis2-de`, `ai-act-en` neben `ai-act-de`, `lksg` allein. Roh angezeigt
 * wären das über dreißig Einträge mit uneinheitlichen Namen. Der Nutzer
 * denkt aber in Gesetzen, nicht in Fassungen — also: ein Eintrag je
 * Rechtsakt, die Fassung wählt das Sprach-Feld.
 *
 * ── DIE SPRACHE WIRD NICHT GERATEN ──
 *
 * Sie kommt aus `identity.expressionLanguage` (FRBR-Ausdrucksebene, aus dem
 * Korpus-Dokument). Der Suffix `-de`/`-en` dient AUSSCHLIESSLICH dazu, die
 * Fassungen desselben Rechtsakts zusammenzuführen — nie dazu, die Sprache zu
 * bestimmen. Eine Fassung ohne gemeldete Sprache erscheint als eigener
 * Eintrag statt still einer falschen Gruppe zugeschlagen zu werden.
 */

export interface PickerNorm {
  identity: { workId: string; expressionLanguage?: string };
  source: 'upload' | 'corpus';
  title: string;
  jurisdiction?: string;
  sectionCount: number;
}

export interface NormGroup {
  /** Anzeigename des Rechtsakts, z. B. „NIS2". */
  label: string;
  /** Schlüssel der Gruppe — der gemeinsame Wortstamm der Quellen. */
  key: string;
  /** Fassungen: Sprache → workId. Sprache `unknown`, wenn der Korpus keine meldet. */
  versions: Array<{ language: string; workId: string; sectionCount: number }>;
}

/** Trennt den Sprach-Suffix ab — nur zur Gruppierung, nie zur Sprachbestimmung. */
function stemOf(workId: string): string {
  const source = workId.startsWith('corpus:') ? workId.slice('corpus:'.length) : workId;
  return source.replace(/-(de|en)$/i, '');
}

export function groupCorpusNorms(norms: PickerNorm[]): NormGroup[] {
  const byStem = new Map<string, NormGroup>();
  for (const n of norms) {
    if (n.source !== 'corpus') continue;
    const key = stemOf(n.identity.workId);
    const group = byStem.get(key) ?? { key, label: key.toUpperCase(), versions: [] };
    // Dieselbe workId kann ZWEIMAL kommen: als Projekt-Norm (die bei einem
    // Korpus-Miss aus der App-DB stammt und dann nur einzelne eingefuegte
    // Klauseln traegt) und als vollstaendiges Korpus-Gesetz. Die vollstaendigere
    // Fassung gewinnt — sonst bietet die Auswahl 1 Artikel statt 46 an
    // (am 03.08. in der Handprobe genau so passiert).
    const existing = group.versions.find((v) => v.workId === n.identity.workId);
    if (existing) {
      if (n.sectionCount > existing.sectionCount) {
        existing.sectionCount = n.sectionCount;
        existing.language = n.identity.expressionLanguage ?? existing.language;
      }
      continue;
    }
    group.versions.push({
      language: n.identity.expressionLanguage ?? 'unknown',
      workId: n.identity.workId,
      sectionCount: n.sectionCount,
    });
    byStem.set(key, group);
  }
  for (const g of byStem.values()) {
    // Sprache aufsteigend, innerhalb einer Sprache die VOLLSTAENDIGERE zuerst:
    // dieselbe Sprache kann zweimal vorkommen — als verkuerzte Projekt-Norm
    // (Korpus-Miss → App-DB-Fallback mit einzelnen Klauseln) und als
    // vollstaendiges Korpus-Gesetz. Wer generiert, will alle Artikel.
    g.versions.sort(
      (a, b) => a.language.localeCompare(b.language) || b.sectionCount - a.sectionCount,
    );
  }
  return [...byStem.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Die Fassung für eine Sprachwahl. Gibt es die gewünschte Sprache nicht,
 * fällt die Auswahl auf die einzige vorhandene — aber der Aufrufer erfährt
 * es (`exact: false`) und kann es anzeigen, statt still etwas anderes zu
 * laden als der Nutzer gewählt hat.
 */
export function resolveVersion(
  group: NormGroup,
  preferred: string,
): { workId: string; language: string; exact: boolean } | null {
  if (group.versions.length === 0) return null;
  const hit = group.versions.find((v) => v.language === preferred);
  if (hit) return { workId: hit.workId, language: hit.language, exact: true };
  const fallback = group.versions[0];
  return { workId: fallback.workId, language: fallback.language, exact: false };
}
