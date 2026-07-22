import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateText, generateJson, MissingApiKeyError } from '../../src/llm/client.js';

describe('generateText', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });

  it('throws MissingApiKeyError when GEMINI_API_KEY is not set', async () => {
    await expect(generateText('hello')).rejects.toThrowError(MissingApiKeyError);
  });
});

describe('generateJson', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });

  it('throws MissingApiKeyError when GEMINI_API_KEY is not set', async () => {
    await expect(generateJson('hello')).rejects.toThrowError(MissingApiKeyError);
  });
});
