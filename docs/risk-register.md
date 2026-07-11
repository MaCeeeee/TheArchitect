# Risk & Decision Register

Interim board for architecture/engineering **decisions and risks** — until this becomes a
product feature (dogfooded into the self-model project `6a3ff887`, motivation layer).

The distinguishing field is **Review-Trigger**: the concrete condition that forces a
re-evaluation. This mirrors the loop-engineering pattern (static scores, dynamic inputs →
re-score on trigger) and Asilomar #16 (the system *reminds*, the human *decides*).

Each entry maps to ArchiMate motivation elements (Risk-&-Security-Overlay):
- **Driver** — why we care
- **Assessment** — the finding / risk
- **Requirement/Constraint** — the decision / response
- Review-Trigger + source live as element metadata

| Field | Meaning |
|---|---|
| ID | `RISK-NNN` / `DEC-NNN` |
| Type | Decision \| Risk |
| Status | Open \| Decided \| Accepted \| Mitigated \| Superseded |
| Driver | The concern the item serves |
| Assessment | The finding (evidence, numbers) |
| Decision / Response | What we chose to do |
| **Review-Trigger** | Condition that forces re-evaluation |
| Source | Chat / ticket / meeting |
| Refs | Linear / PR / doc |
| Date · Owner | When decided · who owns the review |

---

## DEC-001 — Firecrawl: Cloud statt Self-Host

- **Type:** Decision
- **Status:** Decided (NO-GO self-host)
- **Driver:** Korpus-Crawling-Kosten unter Kontrolle halten
- **Assessment:** Self-Host-Firecrawl unwirtschaftlich — 1 Scrape = 1 URL (nicht 1 Artikel),
  ~26 von 500 Gratis-Seiten/Monat nutzbar, Korpus wird geteilt.
- **Decision / Response:** Bei Firecrawl **Cloud** bleiben. Self-Host (THE-402) nicht bauen;
  Kosten-Gate THE-403 = NO-GO. REQs 003.1–003.5 nicht implementieren.
- **Review-Trigger:** **> 5.000 Seiten/Monat** Crawl-Volumen → Self-Host neu bewerten.
- **Source:** Chat „Self-hosted Firecrawl ticket structure"
- **Refs:** THE-402, THE-403
- **Date · Owner:** 2026-07-04 · —
