# UX Test Guide: Connections & Integrations

## Philosophie

> "Der Nutzer steht im Vordergrund. Komplexität rausnehmen. Alles was KI machen kann, soll KI machen. Der Mensch verifiziert und staunt." — Steve Jobs Prinzip

Enterprise-Architektur-Tools scheitern daran, dass sie dem Nutzer die Komplexität aufbürden. TheArchitect muss das Gegenteil sein: Der Nutzer gibt Credentials ein, drückt "Sync" — und die Architektur baut sich von selbst auf.

---

## Testaufbau

**Voraussetzung:** App läuft lokal (`npm run dev`), mindestens eine Connection angelegt (z.B. n8n oder GitHub).

**Tester:** Chrome mit integriertem Claude — Screenshots der UI machen und an Claude senden mit der Frage: "Finde UX-Probleme in diesem Screenshot."

---

## Flow 1: Neue Connection anlegen (Settings → Connections)

**Ziel:** Ein Nutzer, der TheArchitect zum ersten Mal nutzt, soll in <60 Sekunden eine Connection einrichten können.

### Schritte

1. Gehe zu **Settings → Connections**
2. Klicke **"+ Add Connection"**
3. Screenshot machen und an Claude schicken:

**Prompt für Claude:**
```
Ich teste die UX meiner Enterprise Architecture App "TheArchitect". 
Dies ist das Formular zum Anlegen einer neuen Verbindung zu externen Tools 
(Jira, GitHub, n8n, SAP, ServiceNow, etc.).

Bewerte als UX-Experte mit Steve-Jobs-Maßstäben:
1. Ist sofort klar was der Nutzer tun muss?
2. Gibt es unnötige Felder die man automatisch befüllen/erkennen könnte?
3. Sind die Labels verständlich für einen Enterprise Architect (nicht Entwickler)?
4. Fehlen hilfreiche Hinweise oder Tooltips?
5. Ist der Flow zu viele Schritte?
6. Wo könnte KI dem Nutzer Arbeit abnehmen?

Wichtig: Die Zielgruppe sind Enterprise Architekten, CIOs, IT-Manager — 
NICHT Entwickler. Die Terminologie muss auf C-Level verständlich sein.
```

### Worauf achten

- [ ] Wird der richtige Placeholder für die Base URL je nach Typ angezeigt?
- [ ] Wechselt das Auth-Method-Dropdown wenn man den Typ ändert?
- [ ] Zeigt Jira das zusätzliche Email-Feld?
- [ ] Ist der "Test"-Button nach dem Erstellen sofort sichtbar?
- [ ] Was passiert bei falschem Token? Ist die Fehlermeldung verständlich?
- [ ] Gibt es eine Bestätigung nach erfolgreichem Test?

---

## Flow 2: Connection testen (Settings → Connections)

### Schritte

1. Bei einer bestehenden Connection auf **"Test"** klicken
2. Screenshot machen — einmal bei Erfolg, einmal bei Fehler

**Prompt für Claude:**
```
Dies ist das Ergebnis eines Connection-Tests in meiner EA-App.
[Screenshot]

Bewerte:
1. Ist das Feedback sofort verständlich?
2. Gibt der Fehler genug Info um das Problem zu lösen?
3. Fehlt ein "Hilfe"-Link oder eine Anleitung?
4. Sollte nach erfolgreichem Test automatisch der nächste Schritt vorgeschlagen werden?
5. Wo ist unnötige Komplexität die man entfernen kann?
```

### Worauf achten

- [ ] Spinner wird angezeigt während Test läuft
- [ ] Grüner Haken bei Erfolg mit Nachricht (z.B. "Connected as MaCeeeee")
- [ ] Rotes X bei Fehler mit verständlicher Nachricht
- [ ] Timestamp wird angezeigt

---

## Flow 3: Integration zum Projekt hinzufügen (Projekt → Integrations)

**Ziel:** Der Nutzer verbindet eine Connection mit seinem Projekt und importiert Daten.

### Schritte

1. Öffne ein Projekt
2. Gehe zum **Integrations**-Panel (rechte Sidebar oder Import-Tab)
3. Klicke **"+ Add Integration"**
4. Screenshot machen

**Prompt für Claude:**
```
Dies ist das Formular um eine externe Datenquelle mit einem 
Architektur-Projekt zu verknüpfen. Der Nutzer wählt eine bestehende 
Connection und konfiguriert Filter (z.B. welche Jira-Projekte, 
welche GitHub-Repos, welcher SAP-Modus).

Bewerte als UX-Experte:
1. Versteht ein Enterprise Architect sofort was "Integration" vs "Connection" bedeutet?
2. Sind die typ-spezifischen Filter verständlich?
3. Wo könnte man Schritte automatisieren oder eliminieren?
4. Ist "Auto-Sync Interval" selbsterklärend?
5. Sollten Standardwerte intelligenter vorbelegt sein?
6. Fehlt ein "Preview" bevor man importiert?
7. Was würde Steve Jobs streichen?
```

### Worauf achten

- [ ] Werden nur Connections angezeigt die der User angelegt hat?
- [ ] GitHub/GitLab: Werden Orgs automatisch geladen?
- [ ] GitHub/GitLab: Repo-Liste mit Checkboxen?
- [ ] Jira: JQL-Filter wird automatisch aus Projekt generiert?
- [ ] n8n: Tag-Filter und "Active only" Checkbox?
- [ ] SAP: Mode-Dropdown (SolMan/Cloud ALM/S4)?
- [ ] Standards DB: Framework-Dropdown mit allen 6 Optionen?
- [ ] "No connections available" → Zeigt Link zu Settings?
- [ ] Sync-Interval Dropdown sinnvolle Optionen?

---

## Flow 4: Sync durchführen und Ergebnisse prüfen

### Schritte

1. Bei einer konfigurierten Integration auf **"Sync"** klicken
2. Warten bis der Sync fertig ist
3. Screenshot machen

**Prompt für Claude:**
```
Der Nutzer hat gerade Daten aus [n8n/GitHub/etc.] in sein 
Architektur-Projekt synchronisiert. Dies zeigt das Ergebnis.

Bewerte:
1. Versteht der Nutzer sofort was passiert ist?
2. "248 elements, 428 connections" — ist das verständlich oder braucht es Kontext?
3. Fehlt ein Link zum 3D-View um die importierten Elemente zu sehen?
4. Sollte nach dem Sync automatisch etwas passieren (z.B. View aktualisieren)?
5. Sind die Warnings hilfreich oder verwirrend?
6. Wo würde ein "Wow"-Moment entstehen wenn man es anders präsentiert?
```

### Worauf achten

- [ ] Spinner während Sync
- [ ] Grüne Erfolgsmeldung mit Element-/Connection-Count
- [ ] Dauer wird angezeigt
- [ ] Warnings sind sichtbar aber nicht alarmierend
- [ ] Bei Fehler: Ist klar was schiefging?

---

## Flow 5: Enrichment (Kostenanreicherung)

### Schritte

1. Bei einem Enrichment-fähigen Connector (Jira, LeanIX, ServiceNow, SAP, SonarQube, Abacus) auf **"Enrich"** klicken
2. Screenshot machen

**Prompt für Claude:**
```
Der Nutzer hat "Enrich" geklickt um Kostendaten aus [Connector] 
automatisch seinen Architektur-Elementen zuzuordnen.

Bewerte:
1. Versteht der Nutzer was "Enrich" bedeutet?
2. Ist klar welche Felder angereichert werden?
3. Sollte es eine Vorschau geben bevor Daten überschrieben werden?
4. "Enriched 5 elements with cost data" — reicht das oder will man Details sehen?
5. Wie kann man den "Magic Moment" maximieren?
```

---

## Flow 6: Empty States und Error States

### Schritte

Teste absichtlich kaputte/leere Zustände:

1. **Keine Connections:** Settings → Connections bei leerem Account
2. **Keine Integrations:** Projekt ohne Integrations öffnen
3. **Falscher Token:** Connection mit ungültigem Token anlegen und testen
4. **Unerreichbarer Server:** Connection mit falscher URL anlegen

**Prompt für Claude:**
```
Dies ist ein [Empty State / Error State] in meiner EA-App.
[Screenshot]

Bewerte:
1. Versteht der Nutzer sofort was er tun muss?
2. Gibt es einen klaren Call-to-Action?
3. Ist die Fehlermeldung actionable?
4. Fehlt ein "Hilfe" oder "Dokumentation"-Link?
5. Wirkt der Zustand einladend oder abschreckend?
```

---

## Flow 7: End-to-End "Zero to Architecture"

Der ultimative Test: Vom leeren Projekt zur vollständigen Architektur.

### Schritte

1. Neues Projekt erstellen
2. Settings → Connection anlegen (z.B. n8n oder Standards DB)
3. Zurück zum Projekt → Integration hinzufügen
4. Sync klicken
5. 3D View öffnen — sind die Elemente da?
6. Analyze Tab — werden Kosten angezeigt?

**Prompt für Claude:**
```
Ich habe gerade den kompletten Flow getestet: Neues Projekt → 
Connection anlegen → Integration hinzufügen → Sync → 3D View.

Hier sind Screenshots von jedem Schritt: [Screenshots]

Bewerte den GESAMTEN Flow:
1. Wie viele Klicks waren nötig? Kann man Schritte eliminieren?
2. Wo hat der Nutzer gezögert oder sich gefragt "was jetzt?"
3. Wo fehlt eine automatische Weiterleitung?
4. Gibt es einen "Wow"-Moment? Wenn nein — wo könnte man einen schaffen?
5. Was würde ein CEO beim ersten Öffnen denken?
6. Was würde Steve Jobs streichen, vereinfachen oder automatisieren?
```

---

## Checkliste: Steve Jobs Prinzipien

Nach jedem Test-Flow gegen diese Prinzipien prüfen:

| Prinzip | Frage |
|---|---|
| **Einfachheit** | Kann man einen Schritt/ein Feld weglassen? |
| **Automatisierung** | Kann die KI das für den Nutzer tun? |
| **Klarheit** | Versteht ein Nicht-Techniker jeden Begriff? |
| **Feedback** | Weiß der Nutzer jederzeit was passiert? |
| **Delight** | Gibt es einen Moment der begeistert? |
| **Fehlertoleranz** | Kommt der Nutzer alleine aus jedem Fehler raus? |
| **Progressivität** | Wird Komplexität erst gezeigt wenn nötig? |

---

## Bug-Reporting Format

Wenn Claude oder du einen Bug/UX-Issue findest:

```
## [UX/BUG] Kurze Beschreibung

**Flow:** Connection anlegen / Integration / Sync / etc.
**Schritt:** Was wurde getan
**Erwartet:** Was hätte passieren sollen
**Tatsächlich:** Was passiert ist
**Screenshot:** [falls vorhanden]
**Schwere:** Critical / Major / Minor / Enhancement
**Steve-Jobs-Score:** 1-5 (1=komplex, 5=magisch einfach)
```
