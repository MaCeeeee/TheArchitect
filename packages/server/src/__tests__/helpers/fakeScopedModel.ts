/**
 * Mongoose-Model-Double für Mandanten-Tests (Security-Audit H2).
 *
 * Verhält sich wie die echte DB: `findById*` findet JEDES Dokument — die DB
 * kennt keine Mandanten —, `findOne*` nur, wenn alle Filterfelder passen.
 * Ein Test sieht damit, ob eine Route den Mandanten in den Filter legt.
 */
type Doc = Record<string, unknown> & { _id: string };
type Filter = Record<string, unknown>;
type Update = Record<string, unknown>;

function query<T>(value: T) {
  const p = Promise.resolve(value);
  return Object.assign(p, {
    lean: () => query(value),
    select: () => query(value),
    populate: () => query(value),
    sort: () => query(value),
  });
}

function applyUpdate(doc: Doc, update: Update): Doc {
  for (const [k, v] of Object.entries(update)) {
    if (!k.startsWith('$')) doc[k] = v;
  }
  if (update.$set && typeof update.$set === 'object') Object.assign(doc, update.$set);
  return doc;
}

export function fakeScopedModel(seed: Doc[]) {
  let docs: Doc[] = seed.map((d) => ({ ...d }));
  const byId = (id: unknown) => docs.find((d) => d._id === String(id)) ?? null;
  const matching = (filter: Filter) =>
    docs.find((d) => Object.entries(filter).every(([k, v]) => String(d[k]) === String(v))) ?? null;
  const remove = (doc: Doc | null) => {
    if (doc) docs = docs.filter((d) => d !== doc);
    return doc;
  };

  return {
    all: () => docs,
    reset: (next: Doc[]) => {
      docs = next.map((d) => ({ ...d }));
    },
    findById: jest.fn((id: unknown) => query(byId(id))),
    findByIdAndUpdate: jest.fn((id: unknown, u: Update) => {
      const d = byId(id);
      return query(d ? applyUpdate(d, u) : null);
    }),
    findByIdAndDelete: jest.fn((id: unknown) => query(remove(byId(id)))),
    findOne: jest.fn((f: Filter) => query(matching(f))),
    findOneAndUpdate: jest.fn((f: Filter, u: Update) => {
      const d = matching(f);
      return query(d ? applyUpdate(d, u) : null);
    }),
    findOneAndDelete: jest.fn((f: Filter) => query(remove(matching(f)))),
    deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
    updateMany: jest.fn(async () => ({ modifiedCount: 0 })),
    find: jest.fn(() => query([] as Doc[])),
  };
}
