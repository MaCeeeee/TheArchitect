# RVTM — THE-570: Die Kette an den Korpus hängen

**Ticket:** THE-570 (UC-REQTRACE-002) · **Stand:** GEBAUT + am echten Korpus verifiziert 2026-08-03.
**Score (Pre-Flight):** ≈ 90 · **Ousterhout:** durchweg niedrig; beide Watch-Points sind in der Handprobe eingetreten und behoben.

| AC | Verifikation | Status |
| --- | --- | --- |
| Gesetz-Auswahl aus dem Korpus, kein „Add to pipeline" nötig | Handprobe: 13 Rechtsakte im Dropdown (aus 24 Quellen gebündelt), Auswahl ohne Vorbereitungsschritt | ✅ |
| Artikel-Auswahl nach Gesetzeswahl | Handprobe: NIS2 → **46 Artikel** mit Überschriften („Art. 23 — Berichtspflichten") | ✅ |
| Sprachfassung ehrlich (nur vorhandene, Hinweis bei Abweichung) | `normPicker` liest `identity.expressionLanguage` (FRBR) — **nie aus dem Suffix geraten**; `lang-hint` bei Fallback | ✅ |
| Vorschau statt Blackbox | Handprobe: Label „ARTICLE TEXT (FROM CORPUS — READ ONLY)", 9242 Zeichen echter Art.-23-Text, `readOnly` | ✅ |
| Anforderungen tragen `normId` + `sectionEId` | Durchstich: `chain.regulationKey: nis2-de:art-23`; Confirm speichert den Anker mit | ✅ |
| **Drift-Check wird scharf (`checked ≥ 1`)** | **API-Durchstich: `checked: 2, skipped: 0`** — vorher nachweislich 0 | ✅ |
| „Custom" bleibt, mit Hinweis „kein Drift-Check" | `no-anchor-hint` erscheint bei eingefügtem Text | ✅ |
| Version-Gate greift | Bestand (THE-422-Zweig der Route), unverändert | ✅ Bestand |
| Regression: Einfüge-Weg unverändert | 90 Client-Tests grün, darunter die Bestands-Modal-Tests | ✅ |

**Was die Handprobe fand (und Tests nicht fanden):**
1. **Der Anker ging beim Speichern verloren.** Der Dialog generierte mit `normId`+`sectionEId`, schickte sie beim Confirm aber nicht mit — das Requirement hätte den Anker verloren und der Drift-Check es als `skipped` gemeldet. Generieren mit Anker und Speichern ohne wäre eine stille Lücke gewesen.
2. **1 statt 46 Artikeln.** Dieselbe Sprache kann zweimal in einer Gruppe stehen: verkürzte Projekt-Norm (Korpus-Miss → App-DB-Fallback) neben vollständigem Korpus-Gesetz. Jetzt gewinnt die vollständigere Fassung — mit Test.

**Nebenbefund (kein Fix, dokumentiert):** Beim ersten Aufruf direkt nach Serverstart liefert `GET /norms` eine leere `available`-Liste (der Endpunkt schluckt Korpus-Fehler mit `.catch(() => [])`, Bestand aus THE-390). Der Dialog fällt dann auf die feste Quellenliste zurück — funktionsfähig, aber der Nutzer erfährt nicht, warum der Korpus fehlt. Kandidat für ein eigenes kleines Ticket.

**Sichtbar geworden:** Die AI-Act-Lücke aus THE-572 steht jetzt in der Oberfläche — 113 Artikel deutsch, 112 englisch.
