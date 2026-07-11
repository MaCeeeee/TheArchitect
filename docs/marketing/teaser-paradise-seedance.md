# Teaser „knock, knock → paradise" — Produktions-Sheet

**Stand:** 2026-06-29 · **Kanal:** LinkedIn (Social Teaser) · **Format:** 9:16 vertikal · **Länge:** ~18–20 s · **Ton:** off (text-getrieben)
**Leitwort:** Vertrauen · **Erste Architektur / Codename:** *paradise* · **Status:** Konzept + alle Beats abgenommen

---

## 1. Idee & These

Ein durchgehender Sog: aus einer zerfallenden Illusion (Matrix-Code-Regen) **durch den Bildschirm** in einen dunklen Maschinen-Flug — und am Wendepunkt bricht es ins Licht: *paradise* als **Ort**, dem man trauen kann. Der Umschlag ist **Vertrauen**.

Mythos-Rahmen (Matrix): Du vertraust einer Architektur, die du nie überprüft hast — der bequemen Illusion. *knock, knock.* Wach auf. Hier ist das Echte.

## 2. Eiserne Regel

**Das Produkt erscheint nicht.** Keine UI, keine Layer, kein 3D-Modell. Nur Gefühl, Metapher, die Wörter und am Ende das Logo. Der Zuschauer geht mit einer **Frage** raus.

## 3. Visuelles System (durchgehend)

- **Farbe — ein Neon-Grün:** weiß-heißer Kern `#f2fff6` + Glow `#22d33f` / `#11a82f` / `#0a7d24`. Matrix-Regen-Grün `#00ff41`, Smaragd-Bloom `#10b981`, dunkles Siegel-Grün `#04210f`. Violett ist gestrichen — Grün ist die Vertrauens-Farbe und zieht sich von Regen über paradise bis Logo.
- **Reveal — Neon-Flacker-Zündung:** jeder Hero-Text „zündet" wie eine Neon-Röhre an (knock,knock · paradise · Logo). Längeres Flackern beim Wort *paradise*.
- **Typo:** **Serif** (Georgia/Logo-Serif) für Marken-Wörter, **Sans** für Fließtext/Claims. „knock, knock" = grüne Terminal-Monospace, **oben links** (wie auf Neos Monitor).

## 4. Beat Sheet

| Zeit | Beat | Bild | On-Screen-Text | Quelle |
|---|---|---|---|---|
| 0–5 s | Die Illusion | Doku-Regen (grün) dünnt aus | — | **eigene MatrixRain** |
| 5–7 s | Aufwachen + Durchbruch | `knock, knock` flackert an (oben links), tippt sich, **loomt**, **fliegt durch den Schirm**; Sog kippt ins **Dunkel-Teal** | **`knock, knock`** | MatrixRain + Editor (Z-Push) |
| 7–12 s | Flug in die Maschine | Dunkler Sturzflug durch teal-grüne Datenstadt | *„You can't transform what you can't trust."* | **Javis_intro.mov** |
| 12–17 s | Wendepunkt → paradise | Dunkel → grüner Lichtpunkt zündet → Bloom → leuchtende Stadt; Wort *paradise* flackert an; dunkel-grüner Siegel-Puls | *„So we started with trust."* → *paradise* | Seedance + Editor |
| 17–20 s | Endcard | Neon-Logo zündet (T/A → THE ARCHITECT) → Claim | *You have the idea. We make it real.* · *Trust, by design* · *thearchitect.site* | Editor (echte Logo-PNGs) |

## 5. Segment 1 — Cold Open (eigene MatrixRain)

Quelle: [`packages/client/src/components/landing/MatrixRain.tsx`](../../packages/client/src/components/landing/MatrixRain.tsx). Der fallende „Code" ist die **TheArchitect-Doku auf Chinesisch** → der Regen ist das Produktwissen selbst. **Null Fremd-IP** (eigene Implementierung; „knock, knock" ohne „Neo", eigene Glyphen).

**Ablauf:** dichter Regen → dünnt aus → fast schwarz → grüner Block-Cursor blinkt → **`knock, knock`** flackert an (Neon-Power-On) und tippt sich in phosphor-grüner Monospace **oben links** → hält kurz → **loomt** (wächst bedrohlich) → **rauscht riesig auf den Betrachter zu und durch den Schirm** → der Sog kippt ins **Dunkel-Teal** (Vignette + Motion-Blur) = nahtloser Schnitt in Javis_intro.mov.

**Code-Ergänzung für die Teaser-Variante** (additiv, Landingpage nicht anfassen): `color`-Prop (für reines Grün/Neon) + Dichte-Rampe (Ausdünnen) + Recording mit `opacity={1}` auf Schwarz, 9:16.

## 6. Segment 2 — Javis_intro.mov (vorhanden)

Datei: `…/GoogleDrive/Meine Ablage/JAVIS/Javis_intro.mov` · **4,95 s** · ~928×774.
Look: stockdunkler Sturzflug durch eine teal-grüne Maschinen-/Datenstadt, schwere Bewegungsunschärfe, vereinzelt rote Glints. Anfang (0,0 s) fast schwarz mit zarter Teal-Struktur → **deshalb endet der Cold-Open-Sog im Dunkel-Teal**, damit der Schnitt unsichtbar ist. Für 9:16 ggf. beschneiden.

## 7. Segment 3 — Wendepunkt → paradise (Seedance / Higgsfield)

Workflow: Start-Bild generieren → mit Seedance + Kamera-Preset animieren (~5 s/Clip), Last-Frame → Next-Start-Frame ketten. Text/Wort/Logo NICHT in Seedance — im Editor (Neon-Grün + Flacker).

**Style-Token (in jeden Prompt):**
`cinematic, neon-green palette (white-hot core, emerald glow), volumetric light, motion blur, dark background, 4k`

### Clip A · Der Durchbruch
- **Start-Bild:** Last-Frame von Javis_intro.mov + `a single brilliant green point of light igniting on the horizon`
- **Seedance-Motion:** `camera accelerates toward the green light, the dark chaotic machine-structures reorganize into a clean ordered glowing green lattice as we pass, light blooming, streaks`
- **Higgsfield-Preset:** Crash Zoom In

### Clip B · paradise + Siegel
- **Start-Bild:** `breathtaking luminous ordered metropolis of light, calm symmetrical, glowing emerald and white-hot green neon, vast scale, serene god-rays, digital paradise city from above, awe-inspiring, cinematic, 4k`
- **Seedance-Motion:** `slow majestic forward glide revealing the vast glowing green city; then a soft dark-green pulse ripples outward across the whole city like a seal, settling`
- **Higgsfield-Preset:** Crane Up → 360 Orbit (sanft)

**Overlay im Editor:** *„So we started with trust."* (weiß, Fließtext) beim Lichtpunkt → Wort **paradise** (Serif italic, Neon-Grün, **langes Flackern**) beim Bloom → dunkel-grüner Siegel-Ring-Puls.

## 8. Segment 4 — Endcard (Editor)

Schwarz. **Neon-Logo zündet flackernd**: erst T/A-Monogramm, dann THE ARCHITECT-Wortmarke (weiß-heißer Kern + grüner Glow, Serif) → Claim → Tagline → URL.

- **Claim:** *You have the idea.* / *We make it real.* (zweite Zeile Mint-Grün)
- **Tagline:** *Trust, by design*
- **URL:** *thearchitect.site*
- **Assets:** echte Logo-PNGs (T/A-Monogramm + THE-ARCHITECT-Wortmarke) im Editor einsetzen. Ablage geplant: `docs/marketing/assets/` (sobald gespeichert). Im Browser-Preview ist der Neon-Look CSS-nachgebaut.

## 9. Overlay- & Schnittliste (Editor)

| In | Out | Element | Stil |
|---|---|---|---|
| ~5.5 s | 7.0 s | `knock, knock` | grüne Terminal-Monospace, oben links, Flacker-On → Z-Push durch den Schirm |
| 8.5 s | 11.5 s | „You can't transform what you can't trust." | weiß, 600, unteres Drittel |
| 12.5 s | 14.5 s | „So we started with trust." | weiß |
| 14.5 s | 16.5 s | *paradise* | Serif italic, Neon-Grün, langes Flackern |
| 17.0 s | 20.0 s | Endcard: Logo + Claim + Tagline + URL | Neon-Grün-System, Schwarz |

## 10. Produktions-Checkliste

- [ ] MatrixRain Teaser-Variante (`color`-Prop + Dichte-Rampe) + 9:16 Recording
- [ ] Cold-Open-Schnitt (Regen → knock,knock Flacker/Tipp/Loom → Z-Push → Teal-Sog)
- [ ] Javis_intro.mov auf 9:16 beschneiden, an Cold Open anschneiden
- [ ] Seedance Clip A + B (Durchbruch + paradise/Siegel), Frame-Chaining
- [ ] Overlays + Wort *paradise* (Flacker) im Editor
- [ ] Endcard mit echten Logo-PNGs
- [ ] Master 9:16 (+ optional 1:1-Crop)

## 11. Assets

- **Logos:** T/A-Monogramm + THE-ARCHITECT-Wortmarke (neon-grün, Serif) — PNGs ablegen unter `docs/marketing/assets/`
- **MatrixRain:** `packages/client/src/components/landing/MatrixRain.tsx`
- **Flug-Footage:** `Javis_intro.mov` (Google Drive / JAVIS)

## 12. Offen / Folge

- Echte Logo-PNGs ins Repo legen (dann auch im Preview einbindbar).
- Sound-on-Version (LinkedIn-Detailview hat Ton): Musik/Sound-Design + ggf. „knock, knock"-Klopfen.
- Spätere Varianten: A-Teaser → C (2–3 min Pitch/Demo) in derselben Neon-Grün-Bildsprache.

## Anhang — Browser-Previews (Brainstorm-Session)

Unter `.superpowers/brainstorm/<session>/`: `coldopen-matrix.html` (Cold Open), `paradise-reveal.html` (Wendepunkt), `endcard-logo.html` (Endcard). Stilstudien in CSS/Canvas — nicht der Final-Render, aber Komposition/Timing/Farbe verbindlich.
