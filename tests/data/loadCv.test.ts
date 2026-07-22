import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCv, CvValidationError } from '../../src/data/loadCv.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

describe('loadCv', () => {
  it('loads and validates a well-formed cv.yaml', () => {
    const cv = loadCv(path.join(fixturesDir, 'valid-cv.yaml'));
    expect(cv.name).toBe('Jane Doe');
    expect(cv.experience).toHaveLength(1);
  });

  it('throws CvValidationError with field names for a malformed cv.yaml', () => {
    expect(() => loadCv(path.join(fixturesDir, 'invalid-cv.yaml'))).toThrowError(CvValidationError);
    try {
      loadCv(path.join(fixturesDir, 'invalid-cv.yaml'));
      throw new Error('expected loadCv to throw');
    } catch (error) {
      expect((error as Error).message).toContain('summary');
      expect((error as Error).message).toContain('contact.email');
    }
  });

  it('throws CvValidationError when the file does not exist', () => {
    expect(() => loadCv(path.join(fixturesDir, 'missing.yaml'))).toThrowError(CvValidationError);
  });
});
