// Translation dictionary for the public landing page.
// "German Garnish" scope — EA terminology stays English (TOGAF, ArchiMate,
// Stakeholder, Compliance, Monte Carlo, X-Ray). Formal "Sie" address for
// enterprise audience.

export const TEXT: Record<string, { de: string; en: string }> = {
  // ── Header ──
  'header.signin': { de: 'Anmelden', en: 'Sign In' },
  'header.skipToContent': { de: 'Zum Inhalt springen', en: 'Skip to content' },

  // ── Hero ──
  'hero.badge': { de: 'KI-gestützte Architektur-Intelligenz', en: 'AI-Powered Architecture Intelligence' },
  'hero.title.pre': { de: 'Sehen Sie Ihre Architektur', en: 'See your architecture' },
  'hero.title.highlight': { de: 'wie nie zuvor', en: 'like never before' },
  'hero.subtitle': {
    de: 'KI-native Architektur-Analyse mit 3D-Visualisierung, Multi-Agent-Simulation und Monte-Carlo-Roadmaps. Von einem Enterprise Architect — für Enterprise Architects.',
    en: 'AI-native architecture analysis with 3D visualization, multi-agent simulation, and Monte Carlo roadmaps. Built by an Enterprise Architect — for Enterprise Architects.',
  },
  'hero.scroll': { de: 'Scrollen zum Entdecken', en: 'Scroll to explore' },

  // ── Section 1: Strategy Layer ──
  'strategy.eyebrow': { de: 'Strategy Layer', en: 'Strategy Layer' },
  'strategy.title': { de: 'Starten Sie mit dem großen Bild', en: 'Start with the big picture' },
  'strategy.body': {
    de: 'Definieren Sie Business Capabilities, Value Streams und strategische Ziele. TheArchitect bildet sie in 3D ab, damit Sie alle Zusammenhänge auf einen Blick erfassen.',
    en: 'Define business capabilities, value streams, and strategic goals. TheArchitect maps them in 3D so you see the relationships at a glance.',
  },
  'strategy.badge': { de: 'TOGAF 10 konform', en: 'TOGAF 10 Compliant' },

  // ── Section 2: Business → Application ──
  'biz.eyebrow': { de: 'Business → Application', en: 'Business → Application' },
  'biz.title': { de: 'Jede Abhängigkeit sichtbar', en: 'Trace every dependency' },
  'biz.body': {
    de: 'Von Geschäftsprozessen bis Anwendungen, von Datenobjekten bis Infrastruktur — jede Verbindung ist sichtbar, navigierbar und auditierbar.',
    en: 'From business processes to applications, data entities to infrastructure — every connection is visible, navigable, and auditable.',
  },
  'biz.badge': { de: 'KI-gestützte Abhängigkeitsanalyse', en: 'AI-Powered Dependency Analysis' },

  // ── Section 3: X-Ray ──
  'xray.eyebrow': { de: 'X-Ray Mode', en: 'X-Ray Mode' },
  'xray.title': { de: 'Sehen Sie, was andere übersehen', en: 'See what others miss' },
  'xray.body': {
    de: 'Aktivieren Sie den X-Ray-Modus, um Risiken, Kosten-Hotspots und Optimierungspotenziale in Ihrer gesamten Architektur sofort zu erkennen.',
    en: 'Activate X-Ray to instantly spot risks, cost hotspots, and optimization opportunities across your entire architecture.',
  },
  'xray.card1.title': { de: 'Risk Scoring', en: 'Risk Scoring' },
  'xray.card1.desc': { de: '14 KI-Detektoren scannen nach Schwachstellen', en: '14 AI detectors scanning for vulnerabilities' },
  'xray.card2.title': { de: 'Cost Gravity', en: 'Cost Gravity' },
  'xray.card2.desc': { de: 'Kosten-Hotspot-Visualisierung mit Topologie-Multiplikatoren', en: 'Cost hotspot visualization with topology multipliers' },
  'xray.card3.title': { de: 'Critical Path', en: 'Critical Path' },
  'xray.card3.desc': { de: 'Abhängigkeitskette und Blast Radius identifizieren', en: 'Dependency chain identification and blast radius' },

  // ── Section 4: Health Check ──
  'health.title.pre': { de: 'Wie gesund ist Ihre', en: 'How healthy is your' },
  'health.title.highlight': { de: 'Architektur?', en: 'architecture?' },
  'health.subtitle': {
    de: 'Laden Sie Ihre Artefakte hoch. Erhalten Sie in 60 Sekunden einen KI-Health-Score. Kein Account nötig.',
    en: 'Upload your artifacts. Get an AI health score in 60 seconds. No account required.',
  },
  'health.haveAccount': { de: 'Bereits einen Account?', en: 'Already have an account?' },
  'health.signin': { de: 'Anmelden', en: 'Sign in' },

  // ── UploadZone ──
  'upload.drop': { de: 'Architektur-Datei hier ablegen', en: 'Drop your architecture file here' },
  'upload.formats': { de: 'CSV, Excel, ArchiMate XML oder JSON · Max 10MB', en: 'CSV, Excel, ArchiMate XML, or JSON · Max 10MB' },
  'upload.browse': { de: 'Dateien auswählen', en: 'Browse files' },
  'upload.uploading': { de: 'Wird hochgeladen & geparst...', en: 'Uploading & parsing...' },
  'upload.scanning': { de: 'KI-Health-Check läuft...', en: 'Running AI Health Check...' },
  'upload.scanningDesc': { de: '14 Detektoren analysieren Ihre Architektur', en: '14 detectors analyzing your architecture' },
  'upload.demo': { de: 'oder mit Demo-Daten testen', en: 'or try with sample data' },
  'upload.demoFailed': { de: 'Demo-Daten konnten nicht geladen werden.', en: 'Failed to load demo data.' },
  'upload.srLabel': { de: 'Architektur-Datei hochladen', en: 'Upload architecture file' },

  // ── Features (Fallback) ──
  'features.1.title': { de: '3D-Visualisierung', en: '3D Visualization' },
  'features.1.desc': {
    de: 'Interaktiver 3D-Architektur-Explorer mit Layern, Verbindungen und Echtzeit-Abhängigkeits-Mapping',
    en: 'Interactive 3D architecture explorer with layers, connections, and real-time dependency mapping',
  },
  'features.2.title': { de: 'TOGAF 10 & ArchiMate 3.2', en: 'TOGAF 10 & ArchiMate 3.2' },
  'features.2.desc': {
    de: 'Automatisches Compliance-Checking, ADM-Governance und volles ArchiMate-Metamodell',
    en: 'Automated compliance checking, ADM governance, and full ArchiMate metamodel support',
  },
  'features.3.title': { de: 'AI Advisor', en: 'AI Advisor' },
  'features.3.desc': {
    de: '14 Detektoren finden Risiken, Waisen-Elemente, zyklische Abhängigkeiten, TIME-Klassifizierung und Kosten-Hotspots',
    en: '14 detectors finding risks, orphans, circular dependencies, TIME classification, and cost hotspots',
  },

  // ── TrustBar ──
  'trust.1': { de: '80+ ArchiMate-Elementtypen', en: '80+ ArchiMate element types' },
  'trust.2': { de: 'Portfolio Management', en: 'Portfolio Management' },
  'trust.3': { de: 'LeanIX & Jira Import', en: 'LeanIX & Jira Import' },
  'trust.4': { de: 'Stakeholder Sharing', en: 'Stakeholder Sharing' },

  // ── StatsBar ──
  'stats.1.label': { de: 'KI-Detektoren', en: 'AI Detectors' },
  'stats.2.label': { de: 'ArchiMate-Typen', en: 'ArchiMate Types' },
  'stats.3.label': { de: 'Visualisierung', en: 'Visualization' },
  'stats.4.label': { de: 'Konform', en: 'Compliant' },

  // ── DifferentiationGrid ──
  'diff.heading': { de: 'Warum nicht LeanIX, Ardoq oder Bizzdesign?', en: 'Why not LeanIX, Ardoq, or Bizzdesign?' },
  'diff.subheading': { de: 'Kein etablierter Anbieter hat KI-native Architektur. Noch nicht.', en: 'No incumbent has AI-native architecture. Not yet.' },
  'diff.1.label': { de: 'KI-nativ — nicht nachgerüstet', en: 'AI-native — not retrofitted' },
  'diff.1.detail': {
    de: '14 KI-Detektoren, Multi-Agent-Simulation und stochastische Analyse sind der Kern, nicht Plugins.',
    en: '14 AI detectors, multi-agent simulation, and stochastic analysis are the core, not plugins.',
  },
  'diff.2.label': { de: '3D-Visualisierung — keine 2D-Box-Diagramme', en: '3D visualization — not 2D box diagrams' },
  'diff.2.detail': {
    de: 'React Three Fiber mit Layer-Planes, Fly-to-Navigation und WebGPU-Rendering.',
    en: 'React Three Fiber with layer planes, fly-to navigation, and WebGPU rendering.',
  },
  'diff.3.label': { de: 'Multi-Agent-Simulation — keine statische Analyse', en: 'Multi-agent simulation — not static analysis' },
  'diff.3.detail': {
    de: 'MiroFish simuliert Stakeholder-Verhalten mit Fatigue-Index, Emergence-Tracking und Anti-Hallucination-Layer.',
    en: 'MiroFish simulates stakeholder behavior with fatigue index, emergence tracking, and anti-hallucination layer.',
  },
  'diff.4.label': { de: 'Product-led: Testen vor dem Kauf', en: 'Product-led: try before you buy' },
  'diff.4.detail': {
    de: 'Kostenloser KI-Health-Check — kein Sales Call, kein Enterprise-Vertrag, kein Setup-Wizard.',
    en: 'Free AI health check — no sales call, no enterprise contract, no setup wizard.',
  },

  // ── Waitlist ──
  'waitlist.eyebrow': { de: 'Early Access', en: 'Early Access' },
  'waitlist.title': { de: 'Auf die Warteliste setzen', en: 'Get on the waitlist' },
  'waitlist.body': {
    de: 'Gehören Sie zu den Ersten, die KI-native Enterprise Architecture erleben. Wir benachrichtigen Sie, sobald Ihr Platz bereit ist.',
    en: "Be among the first to experience AI-native Enterprise Architecture. We'll notify you when your spot is ready.",
  },
  'waitlist.emailPlaceholder': { de: 'sie@firma.de', en: 'you@company.com' },
  'waitlist.namePlaceholder': { de: 'Name (optional)', en: 'Name (optional)' },
  'waitlist.companyPlaceholder': { de: 'Firma (optional)', en: 'Company (optional)' },
  'waitlist.submit': { de: 'Auf die Warteliste', en: 'Join the Waitlist' },
  'waitlist.submitting': { de: 'Wird gesendet...', en: 'Joining...' },
  'waitlist.success': { de: 'Willkommen auf der Warteliste!', en: 'Welcome to the waitlist!' },
  'waitlist.error': { de: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.', en: 'Something went wrong. Please try again.' },
  'waitlist.legalPre': { de: 'Mit dem Absenden stimmen Sie unserer', en: 'By joining, you agree to our' },
  'waitlist.legalLink': { de: 'Datenschutzerklärung', en: 'Privacy Policy' },
  'waitlist.legalPost': { de: 'zu. Kein Spam, niemals.', en: '. No spam, ever.' },

  // ── Footer ──
  'footer.privacy': { de: 'Datenschutz', en: 'Privacy' },
  'footer.terms': { de: 'AGB', en: 'Terms' },
  'footer.imprint': { de: 'Impressum', en: 'Imprint' },

  // ── Errors ──
  'error.upload': { de: 'Upload fehlgeschlagen', en: 'Upload failed' },
  'error.scan': { de: 'Scan fehlgeschlagen', en: 'Scan failed' },
  'error.connection': { de: 'Verbindung fehlgeschlagen. Bitte erneut versuchen.', en: 'Connection failed. Please try again.' },

  // ── Results View ──
  'results.title': { de: 'Ihr Architektur-Health-Score', en: 'Your Architecture Health Score' },
  'results.analyzed.pre': { de: 'Elemente in', en: 'elements analyzed in' },
  'results.issuesFound': { de: 'Problem(e) gefunden', en: 'issue(s) found' },
  'results.save': { de: 'Speichern & Vollanalyse', en: 'Save & Get Full Analysis' },
  'results.share': { de: 'Report teilen', en: 'Share Report' },
  'results.uploadAnother': { de: 'Weitere Datei hochladen', en: 'Upload another file' },
};
