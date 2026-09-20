# Prüfszenarien — VERSIEGELT

Dateien in diesem Verzeichnis sind verdeckte Prüfszenarien: geschrieben **vor** der
Umsetzung, abgeleitet **nur aus der Spec** (nie aus dem Plan), ausgeführt **nur** vom
blinden Prüfer nach Abschluss aller Tasks.

**Regel:** Wer implementiert, öffnet diese Dateien nicht — weder Subagent noch Session.
Fehlgeschlagene Szenarien kommen als Findings zurück (Eingabe, erwartet, tatsächlich),
nie als Szenariotext.

Prozess: `.agents/skills/writing-plans` (Erstellung) · `.agents/skills/subagent-driven-development/blind-verifier-prompt.md` (Ausführung).
