# Prüfszenarien: THE-597 Slice 3 — Go/No-Go für Schicht 1 — VERSIEGELT

> **SEALED — do not open during implementation.** No implementer (subagent or session)
> may read this file. Only the blind verifier opens it, after implementation.

**Spec:** `docs/evals/the597-slice3-vorregistrierung.md` (freigegeben 17.11.2026)
**Created:** 2026-11-17 (before implementation)

Alle Befehle im Worktree `/Users/mac_macee/javis-the597-s3`. **Nie** `npm run typing:eval` ausführen, nie eine LLM-API rufen. Szenarien, die eine Datei vorübergehend ändern, stellen sie am Ende wieder her; nach jedem Szenario muss `git status --porcelain` denselben Stand zeigen wie vorher.

## Unabhängige Nachrechnung (von S-006, S-007, S-008, S-011 benutzt)

Der Prüfer rechnet die Regel **selbst** aus den Rohdaten nach, ohne den Code des Implementierers. Script nach `/tmp/the597-recompute.js` schreiben:

```js
// Liest die 7 Lauf-Dateien, wendet die Vorregistrierung an, druckt JSON.
const fs = require('fs'); const D = 'docs/evals/';
const gv3 = ['the597-typing-gv3-sc5-run1.json','the597-typing-gv3-sc5.json','the597-slice3/gv3-run3.json','the597-slice3/gv3-run4.json','the597-slice3/gv3-run5.json'];
const gv2 = ['the597-slice3/gv2-run1.json','the597-slice3/gv2-run2.json'];
const load = f => JSON.parse(fs.readFileSync(D + f, 'utf8')).cases;
function stat(cases, axis, t) {
  let w = 0, c = 0, caught = 0, fa = 0;
  for (const x of cases) {
    const conf = x.confidence && x.confidence[axis]; const g = x.gold[axis];
    if (conf === undefined || g === undefined) continue;
    const p = x.predicted[axis]; const ok = (g === null && p === null) || (g !== null && g === p);
    if (ok) { c++; if (conf < t) fa++; } else { w++; if (conf < t) caught++; }
  }
  return { wrong: w, correct: c, recall: w ? caught / w : 0, fa: c ? fa / c : 0, load: (w + c) ? (caught + fa) / (w + c) : 0 };
}
const pass = s => s.wrong > 0 && s.correct > 0 && s.recall >= 0.5 && s.fa <= 0.1;
const out = [];
for (const axis of ['obligationKind','partyRole','provisionKind']) for (const t of [0.8, 1.0]) {
  const per = gv3.map(f => stat(load(f), axis, t));
  const pooled = stat(gv3.flatMap(load), axis, t);
  const rep = axis === 'partyRole' ? null : stat(gv2.flatMap(load), axis, t);
  const stable = per.filter(pass).length;
  const go = pass(pooled) && stable >= 4 && (rep === null || pass(rep));
  out.push({ axis, t, recall: +pooled.recall.toFixed(4), fa: +pooled.fa.toFixed(4), load: +pooled.load.toFixed(4), stable, rep: rep && pass(rep), go });
}
console.log(JSON.stringify({ layer1: out.some(o => o.go) ? 'GO' : 'NO-GO', combos: out }, null, 1));
```

Run: `node /tmp/the597-recompute.js > /tmp/the597-recompute.json`

## Szenarien

| ID | REQ | Given / When / Then | Expected observable result | Type |
|----|-----|---------------------|---------------------------|------|
| S-001 | Daten | Given die Messung ist abgeschlossen, When `ls docs/evals/the597-slice3/*.json` | Genau 5 Dateien: `gv3-run3.json`, `gv3-run4.json`, `gv3-run5.json`, `gv2-run1.json`, `gv2-run2.json` | Positive |
| S-002 | Instrument | Given die 5 neuen Lauf-Dateien, When je Datei `node -e 'const j=require("./"+process.argv[1]);console.log(j.model,j.samples,j.variante,j.the597.goldenSha256,j.cases.length)'` | Jede Zeile: `claude-haiku-4-5-20251001 5 tp-4 <hash> 70`; Hash bei gv3-Dateien `af57f9f52f7fcae330562b271a957cc585a0071d8aadced9d83aa68f33091b11`, bei gv2-Dateien `39e09d58d20391ee89a95b687157862286f13f12219ce98f9dd0ddb5b1a006a3` | Positive |
| S-003 | Daten | Given die 7 Läufe (2 aus Slice 1 + 5 neue), When `shasum -a 256 docs/evals/the597-typing-gv3-sc5-run1.json docs/evals/the597-typing-gv3-sc5.json docs/evals/the597-slice3/*.json \| cut -d' ' -f1 \| sort -u \| wc -l` | `7` (kein Lauf doppelt) | Negative |
| S-004 | Bericht | Given der Ergebnisbericht, When `ls docs/evals/the597-slice3-ergebnis.md docs/evals/the597-slice3-ergebnis.json` | Beide Dateien existieren | Positive |
| S-005 | Binär | Given `docs/evals/the597-slice3-ergebnis.md`, When man nach dem Verdikt für Schicht 1 sucht | Genau eines der Wörter `GO` oder `NO-GO` als Verdikt für Schicht 1; keine Formulierung wie „unentschieden", „knapp", „tendenziell", „vorläufig" (`grep -inE 'unentschieden\|knapp\|tendenziell\|vorläufig' docs/evals/the597-slice3-ergebnis.md` → keine Treffer) | Negative |
| S-006 | Regel | Given `/tmp/the597-recompute.json`, When man dessen `layer1` mit dem Verdikt im Bericht vergleicht | Identisch | Positive |
| S-007 | Regel | Given `/tmp/the597-recompute.json`, When man für jede der 6 Kombinationen (3 Achsen × Schwellen 0,8 / 1,0) Recall und Fehlalarm (gepoolt gv3) mit den Zahlen im Bericht vergleicht | Alle 6 Kombinationen erscheinen im Bericht; Recall und Fehlalarm stimmen auf 0,1 Prozentpunkte überein; die als GO markierten Kombinationen sind genau die mit `go: true` | Positive |
| S-008 | Stabilität | Given `/tmp/the597-recompute.json`, When man die Zahl der Einzelläufe, in denen das Kriterium hält, je Kombination mit dem Bericht vergleicht | Je Kombination dieselbe Zahl (x von 5); keine Kombination mit weniger als 4 ist als GO markiert | Negative |
| S-009 | partyRole | Given der Bericht, When man die partyRole-Zeilen liest | Für partyRole ist die gv2-Replikation als entfallen/nicht anwendbar ausgewiesen (keine gv2-Recall-/Fehlalarm-Zahl als Entscheidungsgrund); falls partyRole GO ist, steht ausdrücklich dabei, dass dieses GO auf **einem** Gold-Set steht | Positive |
| S-010 | partyRole | Given eine Sicherungskopie von `docs/evals/the597-slice3/gv2-run1.json` und `gv2-run2.json`, When man in beiden Dateien jedes `predicted.partyRole` auf `"__falsch__"` setzt (node-Einzeiler), das Bewertungsskript des Implementierers erneut ausführt (Befehl aus dem Kopf von `docs/evals/the597-slice3-ergebnis.md` oder dem Plan-Header-Pfad `packages/server/src/scripts/`) und dann beide Dateien aus der Sicherung wiederherstellt | Das Verdikt für Schicht 1 und alle partyRole-GO-Markierungen sind vor und nach der Änderung gleich (partyRole auf gv2 geht nicht in die Entscheidung ein). Danach `git status --porcelain` wie vorher; Bericht wieder byte-gleich mit dem Commit (`git diff --exit-code docs/evals/`) | Negative |
| S-011 | Prüf-Last | Given der Bericht und `/tmp/the597-recompute.json`, When man die Prüf-Last je Kombination vergleicht | Der Bericht nennt die Prüf-Last je Kombination (Abweichung ≤ 0,1 Prozentpunkte) und sagt ausdrücklich, dass sie nicht über GO/NO-GO entscheidet; das Verdikt ist dasselbe wie in der Nachrechnung, die die Prüf-Last nicht benutzt | Positive |
| S-012 | Instrument | Given eine Sicherungskopie von `docs/evals/the597-slice3/gv3-run3.json`, When man darin `"samples": 5` durch `"samples": 3` ersetzt, das Bewertungsskript ausführt und die Datei danach wiederherstellt | Das Skript bricht mit Exit-Code ≠ 0 ab und nennt `samples` als Grund; es wird kein neues Verdikt geschrieben (`git diff --exit-code docs/evals/the597-slice3-ergebnis.md` nach Wiederherstellung → sauber) | Negative |
| S-013 | Instrument | Given eine Sicherungskopie von `docs/evals/the597-slice3/gv2-run1.json`, When man sie durch eine Kopie von `gv3-run3.json` ersetzt (gv3-Lauf als gv2 ausgegeben), das Bewertungsskript ausführt und danach wiederherstellt | Exit-Code ≠ 0; Meldung nennt den Golden-Hash bzw. das Golden als Grund | Negative |
| S-014 | Daten | Given eine Sicherungskopie von `docs/evals/the597-slice3/gv3-run5.json`, When man die Datei vorübergehend umbenennt (`mv … …bak`), das Bewertungsskript ausführt und danach zurückbenennt | Exit-Code ≠ 0; kein Verdikt aus nur 4 gv3-Läufen | Negative |
| S-015 | Reproduzierbar | Given ein sauberer Worktree, When man das Bewertungsskript zweimal hintereinander ausführt | `git diff --exit-code docs/evals/the597-slice3-ergebnis.md docs/evals/the597-slice3-ergebnis.json` nach beiden Läufen sauber (byte-gleich mit dem Commit) | Positive |
| S-016 | Input-Hash | Given der Bericht, When man die dort genannten SHA-256 mit `shasum -a 256` der 7 Lauf-Dateien vergleicht | Alle 7 Hashes stehen im Bericht und stimmen überein | Positive |
| S-017 | Register | Given `docs/evals/the597-fehlerfall-register.md`, When man den Abschnitt zum Slice-3-Ergebnis liest | Er existiert, nennt dasselbe Verdikt wie der Bericht, verweist auf Vorregistrierung und Bericht und sagt, dass Schicht 2 (Zod/SHACL) und Schicht 3 (FCA) **nicht gemessen** wurden | Positive |
| S-018 | Reihenfolge | Given die Git-Historie des Branches `feat/the-597-slice3`, When `git log --format='%h %s' origin/master..HEAD -- docs/evals/the597-slice3/ docs/evals/the597-slice3-ergebnis.md` | Der Commit, der die 5 Lauf-Dateien einführt, liegt **vor** (älter als) dem Commit, der den Ergebnisbericht einführt | Positive |
| S-019 | Unverändert | Given die Branch-Historie, When `git diff --stat origin/master..HEAD -- packages/shared/src/typing/ packages/server/src/evals/golden/ docs/evals/the597-slice3-vorregistrierung.md docs/evals/the597-typing-gv3-sc5.json docs/evals/the597-typing-gv3-sc5-run1.json` | Leer — Prompt, Goldens, Vorregistrierung und die Slice-1-Läufe sind unverändert | Negative |
| S-020 | Auto-Close | Given die Branch-Historie, When `git log --format=%s origin/master..HEAD \| grep -E 'THE-604\|THE-606'` und `git rev-parse --abbrev-ref HEAD` | Keine Commit-Titel mit THE-604 oder THE-606; Branch-Name enthält weder THE-604 noch THE-606 | Negative |
| S-021 | Tests | Given `packages/server`, When `npx tsc --noEmit -p .` und `npx jest src/__tests__/the597` | tsc ohne Fehler; alle Suiten, deren Pfad mit `the597` beginnt, PASS | Positive |
