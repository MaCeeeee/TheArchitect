# Pitch Sprint — Tag 5 Rehearsal #1 Punch-List (2026-04-15)

Befund aus dem ersten vollständigen Demo-Probelauf auf localhost mit Script in der Hand und Stoppuhr. Format: pro Sektion eingetragen *während* oder *direkt nach* dem Probelauf, nicht aus dem Gedächtnis am nächsten Tag.

---

## Rehearsal-Kontext

- **Datum / Uhrzeit**: 2026-04-15 _TT:MM_
- **Browser**: Chrome _Version_, frisches Profil, DE, Zoom 100%
- **Fensterformat**: 1920×1080
- **Demo-Daten**: `demo-seed.ts` Cloud Migration Wave 1 (28 Elemente, 3 Targets)
- **Recording**: `pitch-backup/rehearsal-1-full.mp4` (nicht committed)
- **Stoppuhr**: _App_

---

## Timing pro Akt

| Akt | Thema | Ziel (min:sek) | Ist (min:sek) | Δ | Kommentar |
|-----|-------|---------------:|--------------:|---|-----------|
| 1 | Problem + CSV Upload | 2:00 | _:_ | _ | |
| 2 | Login → 3D → X-Ray | 3:00 | _:_ | _ | |
| 3 | Vision + Blueprint + Copilot | 4:00 | _:_ | _ | |
| 4 | Compliance Pipeline | 3:00 | _:_ | _ | |
| 5 | Roadmap + Monte Carlo + MiroFish + Oracle | 4:00 | _:_ | _ | |
| 6 | Dashboard + PDF + CTA | 2:00 | _:_ | _ | |
| **Total** | | **18:00** | _:_ | _ | Ziel: 18 min ± 2 min |

Tight-Variante (15 min): Akt 3 auf 3 min, Akt 5 auf 3 min kürzen. Falls Ist >20 min: Akt 3 Fallback-Monolog raus, Akt 5 Oracle-Teil streichen.

---

## P0 — Demo-Blocker (sofort in 5.4 fixen)

Alles, was den Pitch **unmöglich** macht oder sofort Vertrauen zerstört.

- [ ] _z.B. 3D-Szene rendert nicht, App crasht, Login schlägt fehl_

## P1 — Sichtbare Wackler (fix wenn <30 min möglich)

Alles, was der Auditor *sieht*, aber den Pitch nicht kippt.

- [ ] _z.B. Button-Fokus nicht sichtbar, Toast-Text in EN statt DE, Chart-Animation zu langsam_

## P2 — Script-Rewrites (keine Code-Änderung)

Stellen, wo der Monolog holperig klingt, der Übergang nicht trägt oder eine Zahl falsch ist.

- [ ] _z.B. Akt 3 Fallback-Monolog zu lang, Transition Akt 4→5 unklar, "€2,4M" im Script aber Dashboard zeigt "€2,35M"_

## P3 — Kosmetik (Tag 6 Punch-List)

Alles, was schön wäre, aber den Pitch nicht beeinflusst.

- [ ] _z.B. Skeleton-Loader hübscher, Hover-State KPI-Strip, Sidebar-Spacing_

---

## Console-Errors

Am Ende des Probelaufs DevTools öffnen und zählen. Jeder Error einzeln:

| # | Error (kurz) | Akt | Kritisch? |
|---|--------------|-----|-----------|
| 1 | _z.B. "Failed to load resource: favicon.ico 404"_ | alle | nein (P3) |

**Total Errors**: _n_
**Davon P0-kritisch**: _n_

---

## Stolperstellen beim Monolog

Stellen, wo du gestockt hast, "äh" gesagt hast, oder eine Zahl nicht parat war.

- _Akt X, Minute Y: "…"_

---

## Beobachtungen Audience-Perspektive

Der Bildschirm aus Zuschauer-Sicht. Wenn du selbst nicht objektiv bist: Recording hinterher einmal auf 2× schauen und Zuschauer-Eindrücke ergänzen.

- **Was zieht den Blick in den ersten 10 Sekunden?** _Antwort_
- **Wo verliert der Zuschauer die Orientierung?** _Antwort_
- **Welche Zahl bleibt am stärksten hängen?** _Antwort_
- **Welche Transition fühlt sich bemüht an?** _Antwort_

---

## Entscheidungen für 5.4

Nach Analyse der obigen Liste hier die konkreten Fix-Actions für den nächsten 1,5h-Block:

1. _z.B. `SimulationPanel.tsx` — Scope-Badge-Text "Wave 1" fett machen (P1, 5 min)_
2. _z.B. Script Akt 3 — Fallback-Level-2 von 45s auf 25s kürzen (P2, 10 min)_
3. _..._

**Harter Cutoff für Fixes**: 90 min ab jetzt. Danach: alles Offene → Tag 6.

---

## Rehearsal-Bewertung (Gefühl)

Auf einer Skala von 1 bis 10, wie nah am Pitch-Ready?

- **Content**: _n/10_ — sind die Akte gut geschnitten?
- **Technik**: _n/10_ — läuft die Demo stabil?
- **Monolog**: _n/10_ — sitzt der Text?
- **Gesamt**: _n/10_

Bei ≥7/10 gesamt: weiter zu Tag 6 (Visual Polish).
Bei <7/10 gesamt: Rehearsal #1a auf Do 16.04. Abend einplanen.

---

## Nächste Schritte

- [ ] P0 + zeitnahe P1-Items fixen (5.4)
- [ ] Commit `feat(pitch-sprint): Tag 5 — demo script + rehearsal #1 + critical fixes`
- [ ] Daily Note `2026-04-15.md` schreiben
- [ ] `pitch-sprint-tag5-progress.md` fertigstellen
- [ ] Ggf. Rehearsal #1a für Do 16.04. Abend einplanen
