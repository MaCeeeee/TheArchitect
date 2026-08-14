/**
 * THE-681 (REQ-679.2): Erwägungsgründe als EIGENE Collection.
 *
 * ── WARUM NICHT IN `regulations` ──
 *
 * Jeder bestehende Leser nimmt an, eine Zeile dort sei ein Artikel:
 * `typing:batch` würde ~2500 Erwägungsgründe kostenpflichtig mittypen, der
 * Adjudikationsbogen-Generator zöge sie als „ohne Adressatenklasse" in die
 * Stichprobe, der Vektor-Backfill verwässerte das Artikel-Retrieval. Eine
 * eigene Collection berührt keinen dieser Pfade; Rollback = ignorieren.
 *
 * ── SCHLÜSSEL ──
 *
 * `regulationKey` entsteht über die UNVERÄNDERTE buildRegulationKey-Funktion
 * aus @thearchitect/shared: buildRegulationKey('cra-de', 'Rec. 12') →
 * `cra-de:rec-12`. ADR-0001 (byte-identische Schlüsselbildung beidseits)
 * bleibt unberührt — wir rufen die Funktion nur mit einem neuen Präfix auf.
 *
 * ── strict: 'throw' VON ANFANG AN ──
 *
 * Die typing-Schema-Falle vom 12.08. (Interface kannte ein Feld, das Schema
 * nicht, mongoose strippte es bei 1746 Writes kommentarlos, 5,78 $ Ernte weg)
 * wird hier nicht wiederholt: Ein unbekanntes Feld bricht den Write laut.
 * Der Listen-Gleichstand-Test in recitals.test.ts prüft zusätzlich, dass
 * jedes Feld, das der Bauer erzeugt, im Schema steht.
 */
import { Schema, model, models, type Model } from 'mongoose';

export interface IRecital {
  /** Sprachfassung, z. B. 'cra-de' — identisch zum source-Feld der Artikel. */
  source: string;
  language: string;
  celex: string;
  recitalNumber: number;
  /** `source:rec-N`, unique — aus der unveränderten buildRegulationKey. */
  regulationKey: string;
  /** Text OHNE die führende „(N)"-Nummer — die steht in recitalNumber. */
  fullText: string;
  /** SHA-256 über fullText — Idempotenz-Anker (AC-6): gleicher Text, kein Write. */
  versionHash: string;
  /**
   * Artikel, die der Erwägungsgrund WÖRTLICH nennt, als `art-N`-Anker —
   * mechanisch extrahiert, nie geraten (AC-4). Verweise auf Artikel FREMDER
   * Rechtsakte („Artikel 5 der Verordnung (EU) 2016/679") sind ausgeschlossen.
   * Leer heißt: kein expliziter Verweis — nicht „kein Zusammenhang".
   */
  citedArticles: string[];
  crawledAt: Date;
}

const recitalSchema = new Schema<IRecital>(
  {
    source: { type: String, required: true },
    language: { type: String, required: true },
    celex: { type: String, required: true },
    recitalNumber: { type: Number, required: true },
    regulationKey: { type: String, required: true, unique: true },
    fullText: { type: String, required: true },
    versionHash: { type: String, required: true },
    citedArticles: { type: [String], required: true, default: [] },
    crawledAt: { type: Date, required: true },
  },
  { collection: 'recitals', strict: 'throw' }
);

recitalSchema.index({ source: 1, recitalNumber: 1 });

export const Recital: Model<IRecital> =
  (models.Recital as Model<IRecital>) ?? model<IRecital>('Recital', recitalSchema);
