"""Checks UI texts against ASD-STE100 (Simplified Technical English), Issue 9.

Purpose
    For every sentence: the dictionary status of every word (approved, not approved with the
    replacement the dictionary names, or not in the dictionary), the sentence length (rules 5.1
    and 6.3: 20 words for an instruction, 25 for a description, counted per rules 8.5-8.7),
    semicolons (8.1), contractions (4.2) and -ing forms (3.5). It prints every sentence with a
    finding and ends with "N sentences with findings".

    The ladder texts of UC-METH-001 were checked with it. Their words are recorded in
    packages/shared/src/constants/ste100-words.constants.ts, and two guard tests
    (topologyLadderText.test.ts, ladderText.test.ts) fail on any word that is not listed there.
    Run this script before a word is added to that list.

Usage
    python3 scripts/ste100-check.py <specification.txt> <texts.json>

    <specification.txt>  the specification as plain text (for example: pdftotext -layout)
    <texts.json>         {"technical_nouns": [...], "procedure": [...], "description": [...]}
                         "procedure" holds instructions, "description" everything else.
                         A number can be written as a placeholder: {5}

    Exit status: 0 no findings, 1 one or more sentences with findings, 2 wrong call or a
    specification file in which the dictionary was not found.

The specification is not in this repository
    ASD-STE100 is copyrighted. Get Issue 9 from the official site of ASD-STE100
    (asd-ste100.org) and keep it outside the repository.

Limits
    The script does not check the part of speech of a word (rule 1.2) or its approved meaning
    (rule 1.3), and not the rules about sentence structure (active voice, one instruction per
    sentence, articles). Check those by hand. It is a check of our own, not a certification.

    Part of speech: a word that the dictionary approves as one part of speech is not flagged
    when a text uses it as a different one. "Check" is approved as a noun: the script accepts
    "check the model" as well. Look at each word of a new text in the dictionary by hand.

The script and the guard in TypeScript (packages/shared/src/constants/ste100-guard.ts)
    They do not accept the same texts. A text must pass both.

    The script is stricter than the guard:
    - It knows the whole dictionary. A word that is not approved is a finding, with the
      replacement that the dictionary names. The guard knows only the list of checked words.
    - An -ing form is a finding.

    The script is looser than the guard:
    - It accepts a word with -s, -es or -ies if the word without it is approved or is a
      technical noun. The guard accepts only the listed form.
    - A colon ends a sentence for the word count. For the guard it does not.
    - It does not examine the words in parentheses. The guard does.
    - It accepts one capital letter anywhere. The guard accepts it only in "A to B" and
      "group A".
    - It ignores a word without a plain letter or number (a Greek or Cyrillic word, a sign) and
      does not look for letters or signs that the texts do not use.
    - It does not look for the terms that the plain texts replaced ("loop", "context").
    - A sample name in a text must be in "technical_nouns". The guard takes such names apart
      from the technical nouns, and only from the test that put them into the text.
    - It finds a contraction only with a straight apostrophe, and it accepts an empty text.
"""
import re, sys, json
if len(sys.argv) != 3:
    print('usage: python3 scripts/ste100-check.py <specification.txt> <texts.json>\n'
          '  <specification.txt>  ASD-STE100 Issue 9 as plain text (not in this repository)\n'
          '  <texts.json>         {"technical_nouns": [...], "procedure": [...], "description": [...]}\n'
          'The header of this file says more.', file=sys.stderr)
    sys.exit(2)
txt = open(sys.argv[1]).read().split('\n')
# The dictionary starts at its first entry, the article "A".
start = next((i for i, l in enumerate(txt) if re.match(r'^A \(art\)', l)), None)
if start is None:
    print(f'{sys.argv[1]}: the dictionary was not found. No line starts with the entry "A (art)". '
          'Give the specification as plain text with its layout (for example: pdftotext -layout).', file=sys.stderr)
    sys.exit(2)
POS = r'\((?:n|v|adj|adv|prep|conj|pron|art|pn)\)'
approved, unapproved = {}, {}
cur = None
for l in txt[start:]:
    m = re.match(r'^([A-Za-z][A-Za-z\'\- ]*?) (' + POS + r'),?\s+(.*)$', l)
    if m:
        w, pos, rest = m.group(1), m.group(2), m.group(3)
        if w.isupper():
            approved.setdefault(w.lower(), []).append((pos, re.split(r'\s{3,}', rest)[0])); cur = ('A', w.lower())
        elif w.islower():
            unapproved.setdefault(w, []).append((pos, re.split(r'\s{3,}', rest)[0])); cur = ('U', w)
        continue
    # inflected forms of an approved verb/adjective sit alone in column 1
    m = re.match(r'^([A-Z][A-Z\'\-]+),?(\s{3,}.*)?$', l)
    if m and cur and cur[0] == 'A':
        approved.setdefault(m.group(1).lower(), []).append(('form of ' + cur[1], ''))
print(f'dictionary: {len(approved)} approved entries/forms, {len(unapproved)} not approved', file=sys.stderr)
draft = json.load(open(sys.argv[2]))
TN = {w.lower() for w in draft['technical_nouns']}
for f in ('is','are','was','were','be','been'): approved.setdefault(f, [('form of be','')])
NUM = {'one','two','three','four','five','six','ten'}
problems = 0
for kind, limit in (('procedure', 20), ('description', 25)):
    for text in draft[kind]:
        for sent in re.split(r'(?<=[.:!?])\s+', text):
            s = re.sub(r'\([^)]*\)', ' PAREN ', sent)          # 8.5: text in parentheses = one word
            s = re.sub(r'\{[^}]*\}', ' 5 ', s)                   # placeholders are numbers
            words = [w for w in re.split(r'[\s·→,]+', s) if re.search(r'[A-Za-z0-9]', w)]
            notes = []
            if len(words) > limit: notes.append(f'{len(words)} words > {limit}')
            if ';' in sent: notes.append('semicolon (8.1)')
            if re.search(r"n't|'ll|'re|it's", sent): notes.append('contraction (4.2)')
            i = 0
            tokens = [re.sub(r"^[^A-Za-z]+|[^A-Za-z]+$", '', w) for w in words]
            while i < len(tokens):
                t = tokens[i]; low = t.lower()
                if not t or t == 'PAREN' or len(t) == 1 and t.isupper(): i += 1; continue
                two = (low + ' ' + tokens[i + 1].lower()) if i + 1 < len(tokens) else ''
                if two in TN: i += 2; continue
                if low in TN: i += 1; continue
                if low in approved or low in NUM: i += 1; continue
                if low in unapproved:
                    notes.append(f'"{t}" NOT approved → ' + ' / '.join(f'{p} {alt}' for p, alt in unapproved[low]))
                elif low.endswith('s') and (low[:-1] in approved or low[:-1] in TN): pass
                elif low.endswith('es') and low[:-2] in approved: pass
                elif low.endswith('ies') and low[:-3] + 'y' in approved: pass
                else: notes.append(f'"{t}" not in dictionary (technical noun/verb?)')
                if low.endswith('ing') and low not in TN: notes.append(f'"{t}" -ing form (3.5)')
                i += 1
            if notes:
                problems += 1
                print(f'[{kind}] {sent}\n    ' + '\n    '.join(notes))
print(f'\n{problems} sentences with findings')
sys.exit(1 if problems else 0)
