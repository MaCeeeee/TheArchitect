/**
 * Fake corpus Model stub for governedRetrieval / corpusClient unit tests (THE-422).
 *
 * corpusClient chains `.findOne({...}).sort({version:-1})` and `.find({...}).sort({...})`
 * and also awaits the query directly (no `.sort()`), so the stub returns chainable,
 * `await`-able query objects: a thenable that also exposes `.sort()` returning itself.
 * Deliberately tiny — only implements what corpusClient actually calls. Extend HERE,
 * never inline in a test.
 */
import type { Model } from 'mongoose';
import type { ICorpusRegulation } from '../../services/corpusClient.service';

type Row = Partial<ICorpusRegulation> & { regulationKey: string; versionHash: string; version: number };

const REQUIRED = {
  source: 's',
  jurisdiction: 'EU',
  paragraphNumber: '1',
  title: 't',
  fullText: '',
  summary: undefined,
  sourceUrl: 'http://x',
  effectiveFrom: new Date(0),
  language: 'en',
} as Omit<Row, 'regulationKey' | 'versionHash' | 'version'>;

/** Mongo-ish filter match: supports equality, `{ $in: [...] }`, `$exists` and `$ne`. */
function matches(row: any, filter: Record<string, any>): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const op = v as Record<string, any>;
      if (Array.isArray(op.$in)) return op.$in.includes(row[k]);
      // $exists/$ne kommen aus dem relationSuggestions-Read (THE-433): Docs ohne
      // Vorschlaege duerfen die Review-Liste nie erreichen.
      let ok = true;
      if ('$exists' in op) ok = ok && (row[k] !== undefined) === Boolean(op.$exists);
      if ('$ne' in op) ok = ok && JSON.stringify(row[k]) !== JSON.stringify(op.$ne);
      if ('$exists' in op || '$ne' in op) return ok;
    }
    return row[k] === v;
  });
}

/** `.find()` result: sortable/selectable/lean-able + await-able to the array. */
function findQuery(rows: Row[]) {
  let result = [...rows];
  const q: any = {
    // select/lean sind No-ops im Fake: die Projektion darf das Ergebnis eines
    // Prueffalls nicht veraendern, sonst prueft er die Projektion statt der Logik.
    select() {
      return q;
    },
    lean() {
      return q;
    },
    sort(spec: Record<string, 1 | -1>) {
      const [field, dir] = Object.entries(spec)[0];
      result = [...result].sort((a: any, b: any) => (a[field] > b[field] ? 1 : -1) * dir);
      return q;
    },
    then(resolve: (v: any) => void) {
      resolve(result);
    },
  };
  return q;
}

/** `.findOne()` result: sortable (ignored — always latest version) + await-able to one row / null. */
function findOneQuery(rows: Row[]) {
  const q: any = {
    sort() {
      return q;
    },
    then(resolve: (v: any) => void) {
      resolve([...rows].sort((a, b) => (b.version ?? 1) - (a.version ?? 1))[0] ?? null);
    },
  };
  return q;
}

/** Minimal Model-like stub for `__setCorpusForTests`. Only implements what corpusClient uses. */
export function makeFakeCorpus(rows: Array<Partial<Row>>): Model<ICorpusRegulation> {
  const full = rows.map(r => ({ ...REQUIRED, ...r })) as Row[];
  return {
    findOne: (f: Record<string, any>) => findOneQuery(full.filter(r => matches(r, f))),
    find: (f: Record<string, any>) => findQuery(full.filter(r => matches(r, f))),
    estimatedDocumentCount: async () => full.length,
  } as unknown as Model<ICorpusRegulation>;
}
