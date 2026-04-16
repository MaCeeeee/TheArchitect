# Pitch-Sprint Tag 6 — Progress (2026-04-16)

Tag 6 war nicht der geplante "Punch-List + Visual Polish"-Tag (aus Tag-5-Plan). Stattdessen drei unvorhergesehene, aber pitch-kritische Arbeitspakete, ausgelöst durch Rehearsal-#1-Auswertung, ein Production-Bug-Report und ein für 17.04. angesetztes Gespräch mit einem Business Architect von BSH.

**Kontext:** Pitch am 23.04.2026, NKubator Nürnberg, 3 min + 2 min Q&A. Solo-Entwickler neben 40h-Job.

---

## Arbeitspakete Tag 6

### 1. Waitlist in Production repariert

Die Waitlist-Form auf `thearchitect.site` war seit Deploy defekt — NocoDB lief, aber Caddy routete `waitlist.thearchitect.site` nicht. Folge: Landing-Page-Form schlug still fehl, Signups kamen nie an.

**Fix:**
- NocoDB-Container in `caddy_net` hinzugefügt (`docker network connect`)
- Caddyfile erweitert: `waitlist.thearchitect.site { reverse_proxy nocodb:8080 }`
- Caddy-Restart (nicht reload — Bind-Mount-inode-Problem nach `sed -i`)
- Let's Encrypt-Cert automatisch ausgestellt
- End-to-End-Verifikation: POST auf Form → Eintrag in NocoDB ✅

**Memory angelegt:** `infra_waitlist_nocodb.md` — Netzwerk-Topologie, Caddy-Integration, sed-inode-Stolperfalle.

### 2. Admin-Notification-Mail für neue Signups

Nutzer-Feedback: *"aber wer hat auf der Waitinglist signiert und warum hab ich das nicht mit bekommen?"* Bestehende 3 Signups waren unbekannt geblieben — kritisch für Follow-up bei Pilot-Gesprächen.

**Implementierung:**
- `sendWaitlistAdminNotification()` in `packages/server/src/services/email.service.ts`
- Fire-and-forget nach `createRes.ok` in `packages/server/src/routes/waitlist.routes.ts`
- `pageInfo.totalRows` aus NocoDB liefert Signup-Counter
- Subject-Format: `[Waitlist] #${total} — ${email}`
- Default-Empfänger: `macee@thearchitect.site`, überschreibbar via `WAITLIST_ADMIN_EMAIL`
- Background-Closure mit eigenem try/catch — darf die User-Response nicht blockieren und nicht fehlen wenn SMTP broken ist

**Verifikation:** SMTP-Direkttest + echter Signup-POST → Mail kam an.

### 3. Rehearsal #1 ausgewertet

**Timing-Befund:** 300s gegen 170s Soll (Zielfenster 2:45–3:00). **+130s über Ziel.**

**Delivery-Befund (Video-Review):**
- Zu viele "ähm" — konzentriert in den Slide-Übergängen
- Überleitungen holprig, Hirn sucht jedes Mal neu nach Formulierung
- Hook-Pause (Slide 1) zu kurz

**Diagnose:** Kein Content-Problem, sondern ein **Transition-Problem**. Wenn das Hirn zwischen Slides formulieren muss, entstehen Ähms automatisch.

**Fix:** Vier Transition-Sätze wortgenau formuliert, jeder endet mit der Headline der nächsten Slide — Slide wechselt AUF den letzten Wörtern.

| Übergang | Satz (wort-für-wort) | Regie |
|----------|---------------------|-------|
| 1 → 2 | *"Die Antwort? Gibt's nicht. Weil achthundert Systeme in einer PowerPoint stehen."* | nach 2s Pause |
| 2 → 3 | *"Was wäre, wenn diese PowerPoint leben würde?"* | nach 1s Pause, Stimme senken |
| 3 → 4 | *"Warum das jetzt funktioniert? Drei Dinge passieren gleichzeitig."* | nach 2s Pause |
| 4 → 5 | *"Bleibt eine Frage: Warum ich."* | nach 1s Pause, ruhiger werden |

**Einübungsplan fürs Wochenende:** Die vier Sätze 10× hintereinander laut sprechen ohne Slides, bis sie rhythmisch rollen. Erst dann mit Rest zusammenführen.

Ergänzt in `docs/pitch-sprint-tag5-punchlist.md` unter "Transitions".

### 4. Q&A-Framing ehrlicher

Alte Antwort auf *"Wie viel Traction konkret?"* in der Punchlist war schwammig. Neue Version konfrontativ-ehrlich:

> *"Landing ist seit zwei Wochen live, null Marketing, null Outreach — null echte Signups bisher. Genau deshalb bin ich heute hier. Ich brauche zehn Pilot-Gespräche, nicht hundert E-Mails."* (Stand 2026-04-16)

**Warum:** In einem Raum mit Gründern + Investoren wird jede ausweichende Antwort erkannt. Die ehrliche Variante macht den Ask konkret (10 Pilot-Gespräche).

### 5. BSH ESG-Demo UI-Trigger

**Anlass:** Meeting morgen 17.04. mit Business Architect von BSH. Erkenntnis: BSH-Demo existierte nur als Backend-Route `/api/demo/create-bsh` und Seed `packages/server/src/data/demo-architecture-bsh.ts` — **kein UI-Einstieg**. Damit nicht vorführbar.

**Fix:**
- `demoAPI.createBsh()` in `packages/client/src/services/api.ts:502-505`
- `DashboardPage.tsx`: State `creatingDemo: false | 'banking' | 'bsh'`, Handler nimmt Variant-Parameter
- Header: Zwei Buttons — *Banking Demo* (purple) + *ESG Demo* (emerald)
- Empty-State: beide Demo-Buttons side-by-side mit Plus-Button

Deploy erfolgreich, Buttons sichtbar auf Production.

**Gelernt:** Alle Backend-Seeds brauchen mindestens eine sichtbare UI-Entry — sonst existieren sie für Pitch/Demo nicht.

### 6. .gitignore aufgeräumt

Zwei lokale Working-Files wurden in `git status` sichtbar:
- `docs/AUTO_SE_Transformation_CostEnrichment.csv`
- `docs/thearchitect-user-flows.excalidraw`

Beide explizit in `.gitignore` aufgenommen (keine Wildcard-Muster, weil an anderer Stelle CSVs/Excalidraws committed sein können).

---

## Wave-3-Cost-Plausibilität (BSH Demo)

**Frage aus Smoke-Test:** Warum braucht Wave 3 im BSH-Demo 8,5 M€?

**Aufschlüsselung aus `demo-architecture-bsh.ts`:**

| Komponente | Kostenanteil |
|------------|--------------|
| `TECH_AZURE_EU` | annualCost 1.800.000 × 3 Jahre = 5.400.000 |
| `TECH_SNOWFLAKE` | costEstimateMostLikely 520.000 |
| `TECH_KAFKA` / Event Hubs | ~180.000 |
| `TECH_POSTGRES` | 4.200/Monat × 36 Monate ≈ 150.000 |
| `PROC_CSRD_CYCLE` | 2.000.000 (jährl. Audit+Reporting-Zyklus) |
| Sonstige + Puffer | ~250.000 |
| **Summe** | **~8.500.000** |

**Erkenntnis:** Plausibel als **3-Jahres-TCO**, nicht als reine Wave-Einmalkosten. Das Cost-Modell mischt annualCost × Horizon + Einmal-CapEx, ohne dies in der Roadmap-UI zu unterscheiden.

**Entscheidung:** Nicht tonight gefixt (kein Pitch-Blocker). **Tag 7 Visual-Polish-Kandidat:** CAPEX-vs-TCO-Unterscheidung in Roadmap-UI, damit Pitch-Q&A *"Was davon ist einmalig, was laufend?"* sauber beantwortbar wird.

---

## BSH Business-Architect Meeting-Prep (17.04.)

**Erwartete Frage-Richtung** (vom Nutzer antizipiert): *"Welche Capabilities brauche ich um das Gesetz zu erfüllen und welche Prozesse?"*

**Was im BSH-Seed drin ist:**

| Element | Typ | Bezug |
|---------|-----|-------|
| GHG_ACCOUNTING | Capability | CSRD Scope 1/2/3 |
| SUPPLIER_DD | Capability | LkSG + CSDDD |
| LCA | Capability | CSRD Taxonomy + Green Claims |
| MATERIALITY | Capability | CSRD double materiality |
| EPR | Capability | Extended Producer Responsibility |
| SCOPE1_COLLECTION | Process | GHG_ACCOUNTING-Sub |
| SUPPLIER_RISK | Process | SUPPLIER_DD-Sub |
| CSRD_CYCLE | Process | MATERIALITY + Reporting-Cycle |
| CSRD | Standard | Compliance-Matrix-Target |
| LkSG | Standard | Compliance-Matrix-Target |

**Beantwortbar im Meeting:**
- *"Welche Capabilities für CSRD?"* → GHG_ACCOUNTING + MATERIALITY + LCA
- *"Welche für LkSG?"* → SUPPLIER_DD + SUPPLIER_RISK
- *"Mapping auf Prozesse?"* → Dependency-Graph im 3D-View

**Pending (heute Abend):**
- BSH-Demo laden
- Compliance-Tab öffnen
- AI-Match für CSRD + LkSG vorlaufen lassen — Mappings pre-generiert, nicht live im Meeting
- 3 Talking-Point-Anker notieren

**Defensive Antwort bei Legal-Skepsis:** *"Die Mapping-Bibliothek ist kein Ersatz für Rechtsberatung — sie ist ein Beschleuniger für die erste 80%. Die verbleibenden 20% Interpretation bleiben Legal + Compliance."*

---

## Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `packages/server/src/services/email.service.ts` | `sendWaitlistAdminNotification()` |
| `packages/server/src/routes/waitlist.routes.ts` | Fire-and-forget Admin-Notification |
| `packages/client/src/services/api.ts` | `demoAPI.createBsh()` |
| `packages/client/src/components/ui/DashboardPage.tsx` | Variant-State + zwei Demo-Buttons |
| `docs/pitch-sprint-tag5-punchlist.md` | 4 Transition-Sätze + Q&A-Update |
| `.gitignore` | CSV + Excalidraw lokal |

Infra (VPS):
- `/root/Caddyfile` um `waitlist.thearchitect.site`-Block ergänzt
- `nocodb` Container an `caddy_net` hängt

Memory:
- `infra_waitlist_nocodb.md` — NocoDB-Topologie + Caddy + sed-inode

---

## Commits

| Commit | Scope |
|--------|-------|
| `f42e70b` | feat(waitlist): admin notification email + honest Q&A framing |
| `e342604` | chore: gitignore local working files (CSV + excalidraw) |
| `9670a41` | feat(dashboard): BSH ESG Compliance demo trigger |
| *pending* | docs(pitch-sprint): Tag 6 progress + daily note |

---

## Pitch-Checkliste

- [x] Tag 1-5 Code + Demo-Script + Rehearsal #1
- [x] Rehearsal #1 Auswertung — Timing + Delivery
- [x] 4 Transition-Sätze formuliert
- [x] Q&A-Framing honest ("null echte Signups")
- [x] Waitlist-Production reparierbar + Admin-Notifikation
- [x] BSH-Demo UI-zugänglich
- [ ] BSH AI-Match vor-generieren (heute Abend)
- [ ] BSH Business-Architect-Meeting (17.04.)
- [ ] Rehearsal #2 (Wochenende, mit Transition-Sätzen)
- [ ] One-Pager-PDF für Follow-up-Gespräche
- [ ] Rehearsal #3 + #4 (Mo/Di)
- [ ] Pitch 23.04.

---

## Ausblick Tag 7 (17./18.04.)

Nach BSH-Meeting Auswertung — welche Fragen kamen, was fehlte. Dann:
- CAPEX-vs-TCO-Distinktion in Roadmap-UI (aus Wave-3-Analyse)
- One-Pager-PDF aufsetzen
- Rehearsal #2 mit neuen Transition-Sätzen

Ziel: Rehearsal #2 bei 2:45–3:00 einschwenken. Falls ja → Rehearsal #3 nur Delivery-Polish.
