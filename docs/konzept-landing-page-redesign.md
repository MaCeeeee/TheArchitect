# TheArchitect — Landing Page Redesign Konzept

**Ziel:** Eine immersive, scroll-driven Landing Page, bei der der User eine lebendige Enterprise-Architektur erlebt, bevor er die App betritt. Inspiriert von WebGL-Scroll-Experiences (vaalentin/2015), angepasst auf den TheArchitect-Kontext.

**Status:** Konzept-Phase | **Erstellt:** 31.03.2026

---

## 1. Vision & Kernidee

Der User soll beim Scrollen **durch eine Enterprise-Architektur fliegen** — von der Strategy-Ebene ganz oben bis hinunter zur Technology-Ebene. Jede Scroll-Sektion enthält erklärenden Content, der sich mit der 3D-Szene synchronisiert. Am Ende wartet die Health-Check-Upload-Zone als natürlicher Call-to-Action.

**Metapher:** "Von der Vogelperspektive ins Detail" — der User erlebt die gleiche Reise, die ein Enterprise Architekt mit TheArchitect macht.

---

## 2. Seitenstruktur (Scroll-Sektionen)

Die Seite besteht aus einem **fixierten Three.js-Canvas als Fullscreen-Hintergrund** und **scrollbaren Content-Overlays**, die die Kamera und Szene steuern.

### Sektion 0 — Hero (Viewport: 0–100vh)

**3D-Szene:** Kamera schwebt weit oben. Man sieht eine Demo-Architektur von oben — alle 5 TOGAF-Layer als halbtransparente Ebenen mit leuchtenden Nodes und fließenden Connection-Partikeln. Langsame Rotation.

**Content-Overlay:**
- Logo + Nav (sticky Header, wie jetzt)
- Badge: "AI-Powered Architecture Intelligence"
- Headline: *"See your architecture like never before."*
- Subtile Scroll-Indikation (animierter Chevron oder "Scroll to explore")

**Effekt:** Nodes pulsieren leicht, Partikel fließen entlang der ConnectionLines. Atmosphärisch, ruhig, einladend.

---

### Sektion 1 — Strategy Layer (100–200vh)

**3D-Transition:** Kamera fliegt langsam nach unten und zoomt auf den Strategy-Layer. Die anderen Layer faden aus, nur der Strategy-Layer bleibt sichtbar. Nodes des Strategy-Layers werden größer und leuchten in Lila (#8b5cf6).

**Content-Overlay (links oder rechts neben der 3D-Szene):**
- Kleines Label: "STRATEGY LAYER"
- Headline: *"Start with the big picture"*
- Beschreibung: "Define business capabilities, value streams, and strategic goals. TheArchitect maps them in 3D so you see the relationships at a glance."
- Feature-Highlight: Icon + "TOGAF 10 Compliant"

**Effekt:** Nodes erscheinen einzeln (staggered reveal), ConnectionLines bauen sich auf.

---

### Sektion 2 — Business & Application Layer (200–350vh)

**3D-Transition:** Kamera fährt tiefer. Business-Layer (grün, #22c55e) erscheint unter dem Strategy-Layer. Verbindungen zwischen den Layern werden sichtbar — vertikale Connection-Lines mit FlowParticles.

**Content-Overlay:**
- Label: "BUSINESS → APPLICATION"
- Headline: *"Trace every dependency"*
- Beschreibung: "From business processes to applications, data entities to infrastructure — every connection is visible, navigable, and auditable."
- Feature-Highlight: "AI-Powered Dependency Analysis"

**Effekt:** Cross-Layer-Connections animieren sich mit den goldenen FlowParticles. Application-Layer (orange, #f97316) faded ein.

---

### Sektion 3 — X-Ray / Risk View (350–450vh)

**3D-Transition:** Die Szene wechselt visuell in den X-Ray-Modus: Hintergrund wird dunkler (#080e1a), Nodes bekommen Risk-Farben (rot=hoch, grün=niedrig), Critical-Path-Nodes pulsieren. Connection-Lines werden dünner, nur High-Risk-Connections leuchten rot.

**Content-Overlay:**
- Label: "X-RAY MODE"
- Headline: *"See what others miss"*
- Beschreibung: "Activate X-Ray to instantly spot risks, cost hotspots, and optimization opportunities across your entire architecture."
- Feature-Highlights (3 Mini-Cards):
  - "Risk Scoring" — 12 AI-Detektoren
  - "Cost Gravity" — Kosten-Hotspot-Visualisierung
  - "Critical Path" — Abhängigkeitsketten identifizieren

**Effekt:** Der visuelle Wechsel zur X-Ray-Ästhetik ist der Wow-Moment der Seite. Nodes morphen ihre Farben, Umgebung dimmt sich.

---

### Sektion 4 — Health Check / Upload (450–550vh)

**3D-Transition:** Kamera zoomt wieder heraus auf die Gesamtansicht. Die Szene beruhigt sich, wird dezent und geht in einen "idle"-Modus mit sanftem Pulsieren. Der 3D-Hintergrund wird leicht geblurrt / abgedunkelt, um den Upload-Bereich hervorzuheben.

**Content-Overlay (zentriert):**
- Headline: *"How healthy is your architecture?"*
- Subtitle: "Upload your artifacts. Get an AI health score in 60 seconds. No account required."
- **Upload-Zone** (bestehende Drag-and-Drop-Komponente, visuell aufgewertet):
  - Glassmorphism-Effekt (backdrop-blur, halbtransparenter Rahmen)
  - Upload-Icon animiert sich bei Hover
  - Drag-Over: 3D-Szene reagiert (z.B. Nodes beschleunigen oder leuchten heller)
- Darunter: "Already have an account? [Sign In]"

**Effekt:** Sanfter Kontrast — die Szene wird ruhig, der Fokus liegt auf der Aktion.

---

### Sektion 5 — Social Proof / Footer (550–600vh)

**3D-Szene:** Bleibt im ruhigen Idle-Modus.

**Content-Overlay:**
- Optional: Testimonials oder Logos
- Footer mit Links

---

## 3. Technische Architektur

### 3.1 Neue Komponenten

```
components/landing/
  LandingPage.tsx          — Neuer Orchestrator (ersetzt den alten)
  LandingCanvas.tsx        — Fixierter Three.js Canvas (fullscreen, position:fixed)
  LandingScene.tsx         — Three.js-Szene mit Demo-Architektur
  LandingCamera.tsx        — Scroll-gesteuerte Kamera (useFrame + scroll-progress)
  DemoArchitecture.tsx     — Statische Demo-Nodes und Connections (kein Store nötig)
  ScrollSection.tsx        — Wiederverwendbare Scroll-Sektion mit Intersection Observer
  UploadSection.tsx        — Aufgewertete Upload-Zone (aus bestehendem Code extrahiert)
  useScrollProgress.ts     — Custom Hook: scroll-position → 0..1 progress pro Sektion
```

### 3.2 Scroll-Steuerung

**Ansatz: Intersection Observer + CSS scroll-snap (optional)**

```typescript
// useScrollProgress.ts — Kernmechanik
function useScrollProgress() {
  const [progress, setProgress] = useState(0);  // 0 = top, 1 = bottom

  useEffect(() => {
    const onScroll = () => {
      const scrollY = window.scrollY;
      const maxScroll = document.body.scrollHeight - window.innerHeight;
      setProgress(scrollY / maxScroll);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return progress;
}
```

**Kamera-Interpolation in Three.js:**

```typescript
// LandingCamera.tsx — Scroll → Kamera-Position
const CAMERA_KEYFRAMES = [
  { progress: 0.0, position: [0, 30, 40],  lookAt: [0, 4, 0]  },  // Hero: weit oben
  { progress: 0.2, position: [8, 18, 15],  lookAt: [0, 8, 0]  },  // Strategy zoom
  { progress: 0.4, position: [12, 10, 12], lookAt: [0, 4, 0]  },  // Business/App
  { progress: 0.65, position: [15, 12, 15], lookAt: [0, 4, 0] },  // X-Ray
  { progress: 0.85, position: [0, 25, 35],  lookAt: [0, 4, 0] },  // Zoom out
];

useFrame(() => {
  // Interpoliere zwischen den nächsten zwei Keyframes basierend auf scroll-progress
  const [from, to] = findKeyframes(scrollProgress);
  const t = remapProgress(scrollProgress, from.progress, to.progress);
  camera.position.lerpVectors(from.position, to.position, easeInOutCubic(t));
  // ... lookAt interpolation
});
```

### 3.3 Demo-Architektur (statische Daten)

Anstatt den ArchitectureStore zu nutzen (der User-Daten erwartet), erstellen wir eine **leichtgewichtige Demo-Szene** mit hardcodierten Nodes:

```typescript
// DemoArchitecture.tsx
const DEMO_NODES = [
  // Strategy Layer (y=8)
  { id: 'cap1', name: 'Digital Transformation', layer: 'strategy', type: 'box', pos: [-3, 8, 0] },
  { id: 'cap2', name: 'Customer Experience', layer: 'strategy', type: 'box', pos: [3, 8, 0] },

  // Business Layer (y=5)
  { id: 'proc1', name: 'Order Management', layer: 'business', type: 'cylinder', pos: [-4, 5, 2] },
  { id: 'proc2', name: 'CRM Process', layer: 'business', type: 'cylinder', pos: [2, 5, -1] },

  // Application Layer (y=2)
  { id: 'app1', name: 'ERP System', layer: 'application', type: 'sphere', pos: [-2, 2, 3] },
  { id: 'app2', name: 'CRM Platform', layer: 'application', type: 'sphere', pos: [4, 2, 1] },

  // Technology Layer (y=-1)
  { id: 'tech1', name: 'Kubernetes Cluster', layer: 'technology', type: 'cylinder', pos: [0, -1, 0] },
  { id: 'tech2', name: 'PostgreSQL', layer: 'technology', type: 'box', pos: [5, -1, -2] },
];

const DEMO_CONNECTIONS = [
  { from: 'cap1', to: 'proc1', type: 'depends_on' },
  { from: 'cap2', to: 'proc2', type: 'depends_on' },
  { from: 'proc1', to: 'app1', type: 'uses' },
  { from: 'proc2', to: 'app2', type: 'uses' },
  { from: 'app1', to: 'tech1', type: 'runs_on' },
  { from: 'app2', to: 'tech2', type: 'stored_in' },
];
```

### 3.4 Wiederverwendung bestehender Komponenten

| Bestehend | Wiederverwendbar? | Anpassung |
|-----------|-------------------|-----------|
| `LayerPlane.tsx` | **Ja, direkt** | Props-Steuerung für opacity/visibility über scroll-progress |
| `ConnectionLines.tsx` | **Teilweise** | Vereinfachte Version ohne Store-Dependencies, mit statischen Demo-Daten |
| `NodeObject3D.tsx` | **Teilweise** | Vereinfachte Version: kein Drag, kein Context-Menu, nur visuelle Animation |
| `ViewModeCamera.tsx` | **Nein** | Eigene scroll-gesteuerte Kamera (LandingCamera) |
| `FlowParticle` (aus ConnectionLines) | **Ja, direkt** | Partikel-Logik 1:1 übernehmen |
| `HealthScoreRing.tsx` | **Ja, direkt** | Für die Results-Ansicht |
| Design Tokens (`tokens.ts`) | **Ja, direkt** | Farben, Spacing, Motion aus dem Design System |

### 3.5 Performance-Überlegungen

**Lazy Loading:** Der Three.js Canvas (und alle 3D-Deps) wird per `React.lazy()` geladen, damit der First Paint nicht blockiert wird.

```typescript
const LandingCanvas = React.lazy(() => import('./LandingCanvas'));

// In LandingPage:
<Suspense fallback={<GradientBackground />}>
  <LandingCanvas scrollProgress={progress} />
</Suspense>
```

**Reduced Motion:** Für `prefers-reduced-motion` eine statische Fallback-Version ohne 3D.

**Mobile:** Auf Screens < 768px entweder eine vereinfachte 2D-Partikel-Animation (Canvas2D) oder nur den statischen Gradient-Background.

---

## 4. Visuelles Design

### 4.1 Farbpalette (aus Design Tokens)

| Rolle | Farbe | Verwendung |
|-------|-------|------------|
| Hintergrund | `#0a0a0a` → `#080e1a` | Szene-Background, wird dunkler bei X-Ray |
| Strategy | `#8b5cf6` (Lila) | Nodes, Glow, Label |
| Business | `#22c55e` (Grün) | Nodes, Connections |
| Application | `#f97316` (Orange) | Nodes, Connections |
| Technology | `#00ff41` (Cyberpunk-Grün) | Nodes, Grid, Brand-Accent |
| Risk-Rot | `#ef4444` | X-Ray High-Risk |
| Grid | `#111111` / `#1a2a1a` | Boden-Grid |

### 4.2 Typography & Overlay-Stil

- **Headlines:** Weiß, bold, 3xl-5xl, mit Gradient-Text für Emphasis
- **Body:** `text-slate-400`, max-w-lg, genug Kontrast gegen den dunklen 3D-Hintergrund
- **Overlays:** Glassmorphism — `bg-[#0f172a]/60 backdrop-blur-md border border-[#334155]/50`
- **Labels:** Uppercase, Letter-Spacing, kleine Schrift, Layer-Farbe

### 4.3 Animationen

| Element | Animation | Trigger |
|---------|-----------|---------|
| Nodes | Fade-in + scale (0→1) | Scroll in Sichtbereich |
| Connections | Draw-on (Länge 0→100%) | Nach Node-Reveal |
| FlowParticles | Kontinuierlich | Sobald Connection sichtbar |
| Text-Overlays | Fade-up (translateY + opacity) | Intersection Observer |
| Layer-Planes | Opacity 0→0.05 | Scroll-Progress |
| X-Ray Transition | Color-morph auf allen Nodes | Sektion 3 Progress |
| Kamera | Smooth interpolation | Scroll-Progress (60fps) |

---

## 5. Pro & Contra

### Pro

- **Differenzierung:** Kein anderes EA-Tool hat eine scroll-driven 3D-Experience auf der Landing Page. Starker Wow-Faktor für Enterprise-Architekten, die visuell denken.
- **Product-Led:** Der User erlebt das Kernfeature (3D-Visualisierung) sofort, ohne Account. Das senkt die Hemmschwelle zur Registrierung.
- **Wiederverwendung:** ~60% der 3D-Logik existiert bereits. LayerPlane, FlowParticle, Node-Geometrien und Farben können direkt übernommen werden.
- **Storytelling:** Die Scroll-Journey erzählt die TOGAF-Schichten als Geschichte — von Strategie bis Technologie. Das ist edukativ und überzeugend zugleich.
- **Performance-sicher:** Durch Lazy Loading, Suspense-Fallback und Reduced-Motion-Support bleibt die Seite auch ohne WebGL nutzbar.

### Contra

- **Aufwand:** Geschätzt 3-5 Tage Implementierung (neue Komponenten, Scroll-Mechanik, Feintuning der Animationen). Nicht trivial.
- **Bundle Size:** Three.js + React Three Fiber sind bereits im Client-Bundle (~300KB gzipped). Für die Landing Page wird das aber trotzdem geladen — auch wenn der User nur den Health Check nutzt. Mitigation: Code-Splitting per Route.
- **Mobile-Experience:** 3D auf Mobile ist ressourcenintensiv. Auf Low-End-Geräten (< 4GB RAM) kann es ruckeln. Braucht eine robuste Fallback-Strategie.
- **Scroll-Hijacking-Risiko:** Scroll-gesteuerte Animationen können sich "unnatürlich" anfühlen, wenn sie nicht perfekt getimed sind. Erfordert viel Feintuning und Testing.
- **SEO:** Content in Scroll-Sektionen mit `position: fixed` Canvas kann für Crawler problematisch sein. Mitigation: Semantic HTML unter dem Canvas, `<noscript>` Fallback.
- **Wartung:** Jede Änderung am 3D-System (neue Layer, neue Node-Typen) muss auch in der Demo-Architektur nachgezogen werden. Erhöhter Wartungsaufwand.

---

## 6. Technische Risiken & Mitigationen

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|-------------------|------------|
| Performance auf Low-End Mobile | Hoch | Canvas-Auflösung reduzieren (`dpr={[1, 1.5]}`), Fallback auf 2D |
| Scroll-Jank (nicht-smooth) | Mittel | `requestAnimationFrame` statt scroll-Event, `will-change: transform` |
| Three.js Lazy-Load FOUC | Mittel | Gradient-Hintergrund als Fallback, der nahtlos übergeht |
| Browser-Kompatibilität WebGL2 | Niedrig | `@react-three/fiber` handled Fallback, ~98% Support |
| SEO-Crawlability | Mittel | Semantic HTML im DOM, `<noscript>` Content |

---

## 7. Implementierungsreihenfolge (vorgeschlagen)

| Phase | Tasks | Dauer |
|-------|-------|-------|
| **Phase 1** | `useScrollProgress` Hook, `LandingCanvas` mit fixiertem Canvas, `LandingCamera` mit Keyframe-Interpolation | 0.5 Tage |
| **Phase 2** | `DemoArchitecture` mit statischen Nodes/Connections, vereinfachte `DemoNode` und `DemoConnection` Komponenten | 1 Tag |
| **Phase 3** | Scroll-Sektionen mit Content-Overlays, Intersection Observer für Reveal-Animationen | 1 Tag |
| **Phase 4** | X-Ray-Transition (Sektion 3), Upload-Integration (Sektion 4) | 1 Tag |
| **Phase 5** | Mobile Fallback, Performance-Optimierung, Reduced Motion, SEO | 0.5-1 Tag |
| **Phase 6** | Feintuning, Timing, Easing, Testing auf verschiedenen Geräten | 0.5-1 Tag |

**Gesamtaufwand: ~4-5 Tage**

---

## 8. Offene Fragen

1. **Demo-Daten:** Soll die Demo-Architektur ein realistisches Enterprise-Szenario abbilden (z.B. E-Commerce-Plattform) oder abstrakt bleiben?
2. **Mobile-Strategie:** Vereinfachte 3D-Szene (weniger Nodes) oder komplett anderer Ansatz (Video/Lottie-Animation)?
3. **Analytics:** Scroll-Depth-Tracking für die Sektionen? Wo steigen User aus?
4. **A/B-Test:** Soll die alte Landing Page als Fallback/Vergleich erhalten bleiben?
5. **Scroll-Verhalten:** Freies Scrollen oder Snap-to-Section (`scroll-snap-type: y mandatory`)?

---

## 9. Referenzen

- **Inspiration:** [vaalentin/2015](https://vaalentin.github.io/2015/) — WebGL Scroll Experience
- **Bestehende 3D-Komponenten:** `packages/client/src/components/3d/`
- **Design Tokens:** `packages/client/src/design-system/tokens.ts`
- **TOGAF Layer-Farben:** `@thearchitect/shared/src/constants/togaf.constants`
- **React Three Fiber Scroll:** [drei ScrollControls](https://github.com/pmndrs/drei#scrollcontrols) — Alternative zu eigenem useScrollProgress
