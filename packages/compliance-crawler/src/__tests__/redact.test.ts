/**
 * Secret-redaction tests (security hardening). The whole point is that a Mongo
 * connection error never writes the password to logs — so test the scrub directly.
 */
import { redactMongoUri, safeErrorMessage } from '@thearchitect/shared';

describe('redactMongoUri', () => {
  it('scrubs credentials from a mongodb URI', () => {
    const s = 'failed to connect to mongodb://root:HXgQsecret@100.106.223.83:27017/regulations-corpus?authSource=admin';
    const out = redactMongoUri(s);
    expect(out).not.toContain('HXgQsecret');
    expect(out).not.toContain('root:');
    expect(out).toContain('mongodb://***@100.106.223.83:27017');
  });

  it('handles mongodb+srv and leaves non-URI text intact', () => {
    expect(redactMongoUri('mongodb+srv://u:p@cluster.x/db')).toBe('mongodb+srv://***@cluster.x/db');
    expect(redactMongoUri('plain error, no uri')).toBe('plain error, no uri');
  });

  it('safeErrorMessage scrubs an Error message', () => {
    const err = new Error('MongooseServerSelectionError: mongodb://admin:pw123@h:27017 unreachable');
    expect(safeErrorMessage(err)).not.toContain('pw123');
    expect(safeErrorMessage(err)).toContain('***@h:27017');
  });
});
