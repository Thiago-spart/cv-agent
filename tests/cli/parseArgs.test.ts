import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliArgsError } from '../../src/cli/parseArgs.js';

describe('parseCliArgs', () => {
  it('returns null when no arguments are given', () => {
    expect(parseCliArgs([])).toBeNull();
  });

  it('parses a minimal create invocation with defaults', () => {
    const options = parseCliArgs(['--action', 'create', '--slug', 'acme']);
    expect(options).toEqual({
      actions: ['create'],
      language: 'pt-BR',
      cvPath: 'data/cv.yaml',
      slug: 'acme',
      jdSource: undefined,
      input: undefined,
      body: undefined,
      json: false,
    });
  });

  it('parses --key=value syntax and multiple actions', () => {
    const options = parseCliArgs(['--action=optimize,email', '--slug=acme', '--jd-file=./jd.txt', '--lang=en']);
    expect(options).toEqual({
      actions: ['optimize', 'email'],
      language: 'en',
      cvPath: 'data/cv.yaml',
      slug: 'acme',
      jdSource: { mode: 'file', path: './jd.txt' },
      input: undefined,
      body: undefined,
      json: false,
    });
  });

  it('parses --jd-text and --jd-url as their respective JdSource modes', () => {
    const textOptions = parseCliArgs(['--action', 'email', '--slug', 'x', '--jd-text', 'hello']);
    expect(textOptions?.jdSource).toEqual({ mode: 'paste', text: 'hello' });

    const urlOptions = parseCliArgs(['--action', 'optimize', '--slug', 'x', '--jd-url', 'https://example.com/job']);
    expect(urlOptions?.jdSource).toEqual({ mode: 'url', url: 'https://example.com/job' });
  });

  it('allows optimize without a job description when --input bypass is given', () => {
    const options = parseCliArgs(['--action', 'optimize', '--slug', 'acme', '--input', './tailored.yaml']);
    expect(options?.jdSource).toBeUndefined();
    expect(options?.input).toBe('./tailored.yaml');
  });

  it('allows email without a job description when --body bypass is given', () => {
    const options = parseCliArgs(['--action', 'email', '--slug', 'acme', '--body', './body.txt']);
    expect(options?.jdSource).toBeUndefined();
    expect(options?.body).toBe('./body.txt');
  });

  it('sets json true when --json is present', () => {
    const options = parseCliArgs(['--action', 'create', '--slug', 'acme', '--json']);
    expect(options?.json).toBe(true);
  });

  it('throws when --slug is missing', () => {
    expect(() => parseCliArgs(['--action', 'create'])).toThrow(CliArgsError);
  });

  it('throws when --action is missing', () => {
    expect(() => parseCliArgs(['--slug', 'acme'])).toThrow(CliArgsError);
  });

  it('throws on an unknown action', () => {
    expect(() => parseCliArgs(['--action', 'translate', '--slug', 'acme'])).toThrow(CliArgsError);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseCliArgs(['--action', 'create', '--slug', 'acme', '--bogus', 'x'])).toThrow(CliArgsError);
  });

  it('throws when optimize has no job description and no --input bypass', () => {
    expect(() => parseCliArgs(['--action', 'optimize', '--slug', 'acme'])).toThrow(CliArgsError);
  });

  it('throws when email has no job description and no --body bypass', () => {
    expect(() => parseCliArgs(['--action', 'email', '--slug', 'acme'])).toThrow(CliArgsError);
  });

  it('throws when more than one --jd-* flag is given', () => {
    expect(() =>
      parseCliArgs(['--action', 'optimize', '--slug', 'acme', '--jd-text', 'a', '--jd-file', 'b'])
    ).toThrow(CliArgsError);
  });

  it('throws on an invalid --lang value', () => {
    expect(() => parseCliArgs(['--action', 'create', '--slug', 'acme', '--lang', 'fr'])).toThrow(CliArgsError);
  });

  it('throws when a flag is missing its value', () => {
    expect(() => parseCliArgs(['--action', 'create', '--slug'])).toThrow(CliArgsError);
  });
});
