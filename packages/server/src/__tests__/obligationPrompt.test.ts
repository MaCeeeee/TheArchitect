/**
 * Tests für die Prompt-Bauer der Pflicht-Zerlegung, Klassifikation und des
 * Paar-Richters (THE-438 Slice 1, Task 3).
 *
 * DIE BLENDUNG IST DIE ZENTRALE GARANTIE. Gemessen (THE-538, 2026-08-01):
 * wortgleicher Pflichttext unter zwei Gesetzes-Etiketten ergab beim Paar-Richter
 * 7/15 „verschiedene Sache" mit der Begründung „unterschiedliche Rechtsgüter";
 * geblendet 15/15. Der Richter urteilte über das Etikett, nicht über den Text.
 *
 * Sie gilt hier für ALLE DREI Prompts, nicht nur für den Richter — nachgemessen
 * an den 219 zerlegten Pflichten: 3 Handlungs-Formulierungen, 4 Bedingungen und
 * 1 Adressat trugen einen Gesetzesnamen, und zwar ausnahmslos DSGVO. Eine
 * gerichtete Verunreinigung: sie macht DSGVO-Pflichten DSGVO-spezifischer und
 * senkt damit ihre Chance, auf eine NIS2-/DORA-Formulierung zu passen. Mit
 * 1,4 % hat sie das Ergebnis nicht getragen — sie ist nur umsonst zu beseitigen.
 */
import {
  buildSlotUserPrompt,
  buildClassifyUserPrompt,
  buildPairJudgeUserPrompt,
  buildDeriveUserPrompt,
  DERIVE_SYSTEM,
  blindLawNames,
  parseSlots,
  parseActionAssignment,
  parsePairVerdict,
  SLOT_SYSTEM,
  CLASSIFY_SYSTEM,
  PAIR_JUDGE_SYSTEM,
  NO_ACTION,
  type ObligationRef,
} from '@thearchitect/shared';

const oblA: ObligationRef = {
  law: 'DSGVO',
  para: 'Art. 33',
  title: 'Meldung an die Aufsichtsbehörde',
  text: 'Der Verantwortliche meldet die Verletzung binnen 72 Stunden.',
};
const oblB: ObligationRef = {
  law: 'NIS2',
  para: 'Art. 23',
  title: 'Berichtspflichten',
  text: 'Die Einrichtung meldet erhebliche Sicherheitsvorfälle an das CSIRT.',
};
const LAW_NAMES = /\bDSGVO\b|\bGDPR\b|\bNIS-?2\b|\bDORA\b|\bKI-?VO\b|\bMDR\b|\bLkSG\b|\beIDAS\b/;

describe('blindLawNames (THE-438)', () => {
  it('removes law names and citations', () => {
    expect(blindLawNames('Nach DSGVO Art. 33 zu melden.')).not.toMatch(LAW_NAMES);
    expect(blindLawNames('Nach DSGVO Art. 33 zu melden.')).not.toMatch(/Art\.\s*33/);
  });

  it('catches the multi-word and hyphenated spellings', () => {
    for (const s of ['AI Act', 'AI-Act', 'KI-VO', 'NIS 2', 'NIS2', 'Data Act', 'ePrivacy']) {
      expect(blindLawNames(`Gemäß ${s} gilt Folgendes.`)).not.toMatch(new RegExp(s.replace(/[-\s]/, '.?'), 'i'));
    }
  });

  it('catches § citations as well as Artikel', () => {
    expect(blindLawNames('§ 4 LkSG verlangt ein Risikomanagement.')).not.toMatch(/§\s*4/);
    expect(blindLawNames('Artikel 32 verlangt TOMs.')).not.toMatch(/Artikel\s*32/);
  });

  it('leaves the substantive obligation intact — blinding must not eat the content', () => {
    const out = blindLawNames('Nach DSGVO Art. 32 sind technische und organisatorische Maßnahmen zu treffen.');
    expect(out).toContain('technische und organisatorische Maßnahmen zu treffen');
  });
});

describe('prompt builders blind structurally, not per call site', () => {
  it.each([
    ['slot', () => buildSlotUserPrompt(oblA)],
    ['classify', () => buildClassifyUserPrompt(oblA)],
    ['pair-judge', () => buildPairJudgeUserPrompt(oblA, oblB)],
  ])('%s prompt carries no law name', (_name, build) => {
    expect(build()).not.toMatch(LAW_NAMES);
  });

  it('blinds regardless of WHERE the law name hides', () => {
    const sneaky: ObligationRef = {
      ...oblA,
      title: 'DSGVO-Meldung',
      text: 'Nach DORA Art. 19 und § 4 LkSG zu melden.',
    };
    for (const p of [buildSlotUserPrompt(sneaky), buildClassifyUserPrompt(sneaky), buildPairJudgeUserPrompt(sneaky, oblB)]) {
      expect(p).not.toMatch(LAW_NAMES);
    }
  });

  it('never renders the law/para fields of the record itself', () => {
    const p = buildPairJudgeUserPrompt(oblA, oblB);
    expect(p).toContain('Rechtsakt X');
    expect(p).toContain('Rechtsakt Y');
    expect(p).not.toMatch(/Art\.\s*33|Art\.\s*23/);
  });

  it('keeps the substantive text so the judge has something to judge', () => {
    const p = buildPairJudgeUserPrompt(oblA, oblB);
    expect(p).toContain('binnen 72 Stunden');
    expect(p).toContain('an das CSIRT');
  });
});

describe('system prompts', () => {
  it('offers "no matching action" as a first-class answer in the classifier', () => {
    // Ein erzwungener Katalog-Treffer ist der Hauptfehlermodus
    // (Schema-Blindheit). Die Option muss im PROMPT stehen, nicht nur im
    // Parser erlaubt sein.
    expect(CLASSIFY_SYSTEM).toContain(NO_ACTION);
  });

  it('builds the classifier catalogue from the ontology, not a copy', () => {
    expect(CLASSIFY_SYSTEM).toContain('vorfall-melden-behoerde');
    expect(CLASSIFY_SYSTEM).toContain('technisch-organisatorische-massnahmen');
  });

  it('asks for the RECIPIENT, not the obliged party (THE-540)', () => {
    // Der Slot hiess `adressat` und fragte nach dem Verpflichteten — geliefert
    // wurde ueberwiegend der Empfaenger. Der Prompt fragt jetzt danach, was das
    // Modell ohnehin liefert, und sagt ausdruecklich, was NICHT gemeint ist.
    expect(SLOT_SYSTEM).toContain('empfaenger');
    expect(SLOT_SYSTEM).toMatch(/NICHT wer verpflichtet ist/);
    expect(SLOT_SYSTEM).not.toMatch(/- adressat:/);
  });

  it('keeps the slot prompt free of a predefined action vocabulary', () => {
    // Erst FREI extrahieren, dann Vokabular ableiten. Gibt man die Liste vor,
    // misst man die Liste und nicht den Korpus.
    expect(SLOT_SYSTEM).not.toContain('vorfall-melden-behoerde');
    expect(SLOT_SYSTEM).not.toContain('technisch-organisatorische-massnahmen');
  });

  it('derives the vocabulary without prescribing a size or a list', () => {
    // Gibt man eine Anzahl vor, produziert das Modell sie — dann misst man die
    // Vorgabe statt den Korpus. Und "laesst sich nicht buendeln" muss eine
    // zulaessige Antwort sein, sonst erzeugt jedes Modell ein plausibles
    // Vokabular, auch wenn keines existiert.
    expect(DERIVE_SYSTEM).not.toMatch(/\b(26|25|20|30)\b/);
    expect(DERIVE_SYSTEM).not.toContain('vorfall-melden-behoerde');
    expect(DERIVE_SYSTEM).toMatch(/NICHT sinnvoll bündeln/);
  });

  it('blinds the phrases fed into the derivation as well', () => {
    const p = buildDeriveUserPrompt(['DSGVO-Verzeichnis nach Art. 30 führen', 'Vorfall melden']);
    expect(p).not.toMatch(LAW_NAMES);
    expect(p).toContain('Vorfall melden');
  });

  it('states the weak thesis in the judge rubric, not the strong one', () => {
    // Die Vormittags-Rubrik verneinte bei abweichendem Adressaten — und schloss
    // damit genau die Antwort aus, die geprueft werden sollte.
    expect(PAIR_JUDGE_SYSTEM).toMatch(/Parameter/);
    expect(PAIR_JUDGE_SYSTEM).toMatch(/nicht nur der Empfänger oder die Frist/);
  });
});

describe('parsers', () => {
  it('parses a slot decomposition and survives fenced JSON', () => {
    const raw = '```json\n{"handlung":"melden","empfaenger":"Aufsichtsbehörde","modalitaet":"pflicht","bedingung":"72h"}\n```';
    expect(parseSlots(raw)?.handlung).toBe('melden');
  });

  it('maps the "none" answer to a null action without calling it a failure', () => {
    expect(parseActionAssignment(`{"id":"${NO_ACTION}"}`)).toEqual({ actionId: null });
  });

  it('rejects an invented action id instead of passing it through', () => {
    expect(parseActionAssignment('{"id":"erfunden"}')).toBeNull();
  });

  it('returns null on unparseable output rather than throwing', () => {
    expect(parseSlots('ich bin mir nicht sicher')).toBeNull();
    expect(parseActionAssignment('')).toBeNull();
    expect(parsePairVerdict('¯\\_(ツ)_/¯')).toBeNull();
  });

  it('parses a pair verdict and defaults the delta when the rater omits it', () => {
    expect(parsePairVerdict('{"same":true,"why":"eine Meldekette"}')).toEqual({
      same: true,
      delta: '—',
      why: 'eine Meldekette',
    });
  });

  it('treats a missing boolean as unparseable — no silent false', () => {
    // "same" fehlt darf NICHT als "nein" durchgehen: das wuerde einen kaputten
    // Lauf in einen sauberen Negativ-Befund verwandeln.
    expect(parsePairVerdict('{"why":"unklar"}')).toBeNull();
  });
});
