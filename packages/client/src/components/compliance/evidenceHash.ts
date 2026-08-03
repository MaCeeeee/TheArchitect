/**
 * evidenceHash — der Fingerabdruck eines Nachweises, LOKAL gebildet (THE-576).
 *
 * ── WARUM DIE DATEI HIER BLEIBT ──
 *
 * Das Evidenz-Objekt verlangt einen `sha256` des referenzierten Inhalts und
 * hält zugleich fest, dass es BEWUSST keinen Artefakt-Upload gibt:
 * Aufbewahrungs- und Löschpflichten bleiben beim Quellsystem, solange
 * THE-536 offen ist.
 *
 * Beides zusammen lässt genau einen Weg: Der Browser liest die Datei, bildet
 * den Hash, und **nur der Fingerabdruck** geht an den Server. Die Datei
 * verlässt den Rechner nie — kein Upload, kein Zwischenspeicher, keine
 * Kopie unter unserer Aufbewahrungspflicht.
 *
 * Der Nutzer muss das WISSEN, nicht nur dass es so ist — die Fläche sagt es.
 */

/** SHA-256 als 64-stelliger Kleinbuchstaben-Hex — das Format des Validators. */
export async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Der Fingerabdruck einer lokal gewählten Datei. Sie wird NICHT hochgeladen. */
export async function sha256OfFile(file: Blob): Promise<string> {
  return sha256Hex(await file.arrayBuffer());
}

/**
 * Die Form, die der Server-Validator akzeptiert.
 *
 * ACHTUNG: Die Form allein sagt NICHTS über den Wahrheitsgehalt. 64 Nullen
 * sind formal gültig und belegen trotzdem nichts. Deshalb erfindet die Fläche
 * niemals einen Hash — er entsteht ausschließlich aus einer gewählten Datei.
 */
export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
