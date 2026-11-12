# Prüfszenarien: THE-597 Retrospektives Gate, Slice 0 + 1 — VERSIEGELT

> **SEALED — do not open during implementation.** No implementer (subagent or session)
> may read this file. Only the blind verifier opens it, after implementation.

**Spec:** Linear THE-597 (AC-1..AC-4) + Loop-Kontrakt an THE-604 (20.09.2026) + RVTM `docs/superpowers/rvtm/2026-09-20-the597-retro-gate-slice01-rvtm.md`
**Created:** 2026-09-20 (before implementation)
**Ausführung:** im Worktree `/Users/mac_macee/javis-the597`, Befehle in `packages/server`, sofern nicht anders angegeben. Ein Szenario ist bestanden, wenn das beobachtbare Ergebnis exakt eintritt.

Hilfsaufruf für reine Funktionen: `npx ts-node -T -e "<code>"` in `packages/server` (`-T` = transpile-only: die Snippets sind untypisiert, `strict`/`noImplicitAny` aus der tsconfig würde sie sonst vor jedem Aufruf abweisen).

| ID | REQ | Given / When / Then | Expected observable result | Type |
|----|-----|---------------------|---------------------------|------|
| S-001 | R-001 | Given der Worktree, When `grep -c '^| F-' docs/evals/the597-fehlerfall-register.md` (Repo-Root), Then Zahl | `≥ 9` | Positive |
| S-002 | R-001 | Given das Register, When drei zufällige `F-`-Zeilen gelesen, Then jede enthält in der Spalte Quelle einen Pfad, der mit `src/`, `packages/` oder `docs/` beginnt, und die Spalte „Erwartete Fang-Schicht" enthält 1, 2 oder 3 | alle drei Zeilen erfüllen beides | Positive |
| S-003 | R-001 | Given das Register, When `grep -n 'TODO\|<n>\|<w>\|<auroc>\|<r1>' docs/evals/the597-fehlerfall-register.md`, Then | keine Treffer (keine Platzhalter übrig) | Negative |
| S-004 | R-013 | Given Abschnitt B des Registers, When gelesen, Then enthält die Zeichenfolge `wiederverwendbar: nein` (oder `Wiederverwendbar: nein`) und nennt `2026-04-05` oder `05.04.` | beides vorhanden | Positive |
| S-005 | R-002 | When `npx ts-node -T -e "const m=require('./src/evals/metrics');console.log(m.aurocFromSamples([{confidence:0.9,correct:true},{confidence:0.7,correct:true},{confidence:0.3,correct:false}]))"` | `1` | Positive |
| S-006 | R-002 | When wie S-005 mit `[{confidence:0.2,correct:true},{confidence:0.9,correct:false}]` | `0` | Positive |
| S-007 | R-002 | When wie S-005 mit `[{confidence:0.5,correct:true},{confidence:0.5,correct:false},{confidence:0.5,correct:false}]` | `0.5` | Positive |
| S-008 | R-002 | When wie S-005 mit `[{confidence:0.9,correct:true}]` und danach mit `[]` | jeweils `null` | Negative |
| S-009 | R-003 | When `npx ts-node -T -e "const m=require('./src/evals/metrics');console.log(JSON.stringify(m.thresholdRoutingStats([{confidence:0.55,correct:false},{confidence:0.95,correct:false},{confidence:0.55,correct:true},{confidence:0.95,correct:true}],[0.6])))"` | ein Objekt mit `"threshold":0.6,"wrong":2,"correct":2,"caught":1,"falseAlarms":1,"recall":0.5,"falseAlarmRate":0.5` | Positive |
| S-010 | R-003 | When wie S-009 mit `[{confidence:0.6,correct:false}]` und Schwelle `[0.6]` | `caught` ist `0` (Grenze ist strikt: 0,6 wird bei Schwelle 0,6 nicht geroutet) | Negative |
| S-011 | R-003 | When wie S-009 mit `[]` und Schwelle `[0.8]` | `recall` `0` und `falseAlarmRate` `0`, kein `NaN`/`null` | Negative |
| S-012 | R-003 | When `npx ts-node -T -e "const m=require('./src/evals/metrics');console.log(m.thresholdRoutingStats([{confidence:0.5,correct:true}]).map(r=>r.threshold).join(','))"` | `0.6,0.8,1` | Positive |
| S-013 | R-004 | When `npx ts-node -T -e "const t=require('./src/evals/typingMetrics');console.log(t.axisCalibrationSamples([{caseId:'a',source:'s',language:'de',gold:{partyRole:'controller'},predicted:{partyRole:'controller'}},{caseId:'b',source:'s',language:'de',gold:{partyRole:null},predicted:{partyRole:null},confidence:{partyRole:0.7}},{caseId:'c',source:'s',language:'de',gold:{},predicted:{partyRole:'controller'},confidence:{partyRole:0.9}}],'partyRole').length)"` | `1` (nur Fall b: Gold und Confidence vorhanden; `null`==`null` zählt) | Positive |
| S-014 | R-004 | When wie S-013, aber Ausgabe `JSON.stringify(...)` | `[{"confidence":0.7,"correct":true}]` | Positive |
| S-015 | R-007 | When `npx ts-node -T -e "const r=require('./src/evals/runTypingEval');const R=l=>({labels:l});console.log(JSON.stringify(r.aggregateVotes([R({partyRole:'controller'}),R({partyRole:'controller'}),R({partyRole:'processor'}),R({partyRole:'controller'}),R({partyRole:'processor'})])))"` | `labels.partyRole` = `"controller"`, `confidence.partyRole` = `0.6` | Positive |
| S-016 | R-007 | When wie S-015 mit Läufen `[R({partyRole:null}),R({partyRole:null}),R({}),R({})]` | `labels.partyRole` = `null`, `confidence.partyRole` = `0.5` | Positive |
| S-017 | R-007 | When wie S-015 mit `[R({}),R({}),R({})]` | Ausgabe enthält weder `"partyRole"` unter labels noch unter confidence (Achse offen) | Negative |
| S-018 | R-007 | When wie S-015 mit `[]` | exakt `{"labels":{}}` | Negative |
| S-019 | R-007 | When wie S-015 mit `[R({provisionKind:'procedural'}),R({provisionKind:'obligation'})]` und danach in umgekehrter Reihenfolge | beide Male `labels.provisionKind` = `"obligation"` (deterministischer Tie-Break), `confidence.provisionKind` = `0.5` | Positive |
| S-019b | R-007 | When wie S-015 mit `[R({partyRole:'controller'}),R({partyRole:null})]` und danach `[R({partyRole:null}),R({partyRole:'supervisory_authority'})]` | beide Male `labels.partyRole` = `null` (Enthaltung gewinnt den Tie), `confidence.partyRole` = `0.5` | Positive |
| S-020 | R-008 | When `npx ts-node -T -e "const r=require('./src/evals/runTypingEval');let n=0;const inner=async()=>{n++;return{labels:{partyRole:n%2?'controller':'processor'}}};r.withSelfConsistency(inner,4)({caseId:'x'}).then(o=>console.log(n,o.labels.partyRole,o.confidence.partyRole))"` | `4 controller 0.5` | Positive |
| S-021 | R-008 | When `npx ts-node -T -e "const r=require('./src/evals/runTypingEval');const inner=async()=>({labels:{}});console.log(r.withSelfConsistency(inner,1)===inner)"` | `true` | Negative |
| S-022 | R-009, R-010 | Given `docs/evals/the597-typing-gv3-sc5.json` (Repo-Root; die Kopie ist die committete Evidenz), When `node -e "const d=require('../../docs/evals/the597-typing-gv3-sc5.json');console.log(d.the597.k, d.samples, d.report.total, Object.keys(d.the597.axes).length, d.the597.thresholds.join(','), d.cases.length)"` | `5 5 70 5 0.6,0.8,1 70` | Positive |
| S-022b | R-010 | When `git ls-files docs/evals/the597-typing-gv3-sc5.md docs/evals/the597-typing-gv3-sc5.json docs/evals/the597-input-typing-gv3.md | wc -l` (Worktree-Root) | `3` (alle drei sind committet) | Positive |
| S-023 | R-010 | When `shasum -a 256 src/evals/golden/typing.gv3.json | cut -d' ' -f1` verglichen mit `node -e "console.log(require('../../docs/evals/the597-typing-gv3-sc5.json').the597.goldenSha256)"` | identische 64 Hex-Zeichen | Positive |
| S-024 | R-009 | When `grep -c '## THE-597 — Schicht 1 retrospektiv (Self-Consistency k=5)' ../../docs/evals/the597-typing-gv3-sc5.md` und `grep -c '^| partyRole |' ../../docs/evals/the597-typing-gv3-sc5.md` | `1` und `≥ 1` | Positive |
| S-025 | R-009 | When `sed -n '/^## THE-597/,$p' ../../docs/evals/the597-typing-gv3-sc5.md | grep -E '^\| (bindingness|normKind)'` (nur der THE-597-Abschnitt; der THE-683-Anhang führt dieselben Achsen ohne Markierung) | genau zwei Zeilen, jede enthält `⚠️` | Positive |
| S-026 | R-009 | When `node -e "const a=require('../../docs/evals/the597-typing-gv3-sc5.json').the597.axes;for(const k of ['obligationKind','partyRole','provisionKind'])console.log(k,a[k].samples>40,typeof a[k].auroc, a[k].routing.length)"` | drei Zeilen, jeweils `true`, dann `number` oder `object` (null), dann `3` | Positive |
| S-026b | R-009 | When `node -e "const c=require('../../docs/evals/the597-typing-gv3-sc5.json').cases[0];console.log(Object.keys(c).sort().join(','))"` | `caseId,confidence,gold,predicted,source` | Positive |
| S-026c | R-009 | When `grep -c "from 'dotenv'" src/evals/runTypingEval.ts` und `grep -c "^import 'dotenv/config'" src/evals/runTypingEval.ts` | `1` und `0` (dotenv wird in `main()` geladen, nicht als Import-Seiteneffekt) | Positive |
| S-026d | NF-001 | When `npx ts-node -T -e "process.env.ANTHROPIC_API_KEY='';require('./src/evals/runTypingEval');console.log(JSON.stringify(process.env.ANTHROPIC_API_KEY))"` | `""` (das bloße Laden des Moduls injiziert keinen Key aus `.env`) | Negative |
| S-027 | R-011 | Given Register Abschnitt D, When `grep -c 'Instrument-Verdikt:' docs/evals/the597-fehlerfall-register.md` (Repo-Root) und die Zeile gelesen, Then | `1`, und die Zeile enthält `MESSBAR` (auch als Teil von `NICHT MESSBAR`) | Positive |
| S-028 | R-011 | Given Abschnitt D, When die AUROC-Werte der drei Inhalts-Achsen mit `the597.axes.<achse>.auroc` in `docs/evals/the597-typing-gv3-sc5.json` verglichen (auf 3 Dezimalen, `null` = `—`), Then | alle drei stimmen überein | Positive |
| S-029 | R-012, C-005 | When `grep -n -E '^\*\*(Go|No-Go|GO|NO-GO)' docs/evals/the597-fehlerfall-register.md docs/evals/the597-typing-gv3-sc5.md` (Repo-Root) | keine Treffer | Negative |
| S-030 | R-012 | Given Abschnitt D, When die Routing-Tabelle gelesen, Then für `partyRole` stehen drei Recall-Werte und drei Fehlalarm-Werte, und der Recall bei `< 1,0` entspricht `the597.axes.partyRole.routing[2].recall` in `docs/evals/the597-typing-gv3-sc5.json` (Prozent, gerundet auf eine Dezimale) | Übereinstimmung | Positive |
| S-039 | R-001 | When das Register (Kopf, vor Abschnitt A) gelesen | enthält `Zod-Shape-Set v0`, `SHACL` und den Pfad `docs/strategy/2026-07-05-canon-architecture-design.md` | Positive |
| S-031 | R-005 | When `grep -c 'ECE + Schwellen-Routing (THE-597)' src/evals/runMappingEval.ts` | `≥ 1` | Positive |
| S-032 | R-006 | When `grep -c 'kein Cache-Bucket' docs/evals/the597-fehlerfall-register.md` (Repo-Root) und `ls docs/evals/ | grep -c '^mapping-eval'` | `1` und `0` (der Grund steht im Register; kein Mapping-Report wurde als Evidenz behauptet) | Positive |
| S-032b | R-006 | When `npm run eval:mapping -- --offline --golden src/evals/golden/mapping.v1.json > /tmp/the597-offline.log 2>&1; echo EXIT=$?; grep -c 'no valid cache for case "dsgvo-art30-vvt"' /tmp/the597-offline.log` | `EXIT=` mit einer Zahl ≠ 0, danach `1` | Negative |
| S-033 | NF-001 | When `env -u ANTHROPIC_API_KEY npx jest src/__tests__/the597Routing.test.ts src/__tests__/runTypingEval.test.ts src/__tests__/typingMetrics.test.ts 2>&1 | tail -4` | `Tests: … passed`, kein `failed` | Negative |
| S-034 | NF-002 | When `npx jest src/__tests__/evalCalibration.test.ts 2>&1 | tail -4` | alle Tests bestanden | Positive |
| S-035 | NF-003 | When `npm run build -w @thearchitect/server; echo EXIT=$?` (Repo-Root des Worktrees) | `EXIT=0` | Positive |
| S-036 | C-001 | When `git diff origin/master --stat -- packages/server/src/evals/golden/` (Worktree-Root) | leere Ausgabe | Negative |
| S-037 | C-002 | When `git rev-parse --abbrev-ref HEAD` und `git log --format=%s origin/master..HEAD | grep -c 'THE-604'` | `feat/the-597-retro-gate` und `0` | Positive |
| S-038 | C-003 | When `git worktree list | grep -c javis-the597` und `ls /Users/mac_macee/javis-the597/node_modules | wc -l` | `1` und `> 0` | Positive |
