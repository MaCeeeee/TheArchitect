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

The specification is not in this repository
    ASD-STE100 is copyrighted. Get Issue 9 from the official site of ASD-STE100
    (asd-ste100.org) and keep it outside the repository.

Limits
    The script does not check the part of speech of a word (rule 1.2) or its approved meaning
    (rule 1.3), and not the rules about sentence structure (active voice, one instruction per
    sentence, articles). Check those by hand. It is a check of our own, not a certification.
"""
import re, sys, json
txt = open(sys.argv[1]).read().split('\n')
start = next(i for i, l in enumerate(txt) if 'Page 2-1-A-1' in l or re.match(r'^A \(art\)', l)) if any(re.match(r'^A \(art\)', l) for l in txt) else 5425
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
