import type { Language } from '../actions/createCv.js';
import type { JdSource } from '../jd/getJobDescription.js';

export type CliAction = 'create' | 'optimize' | 'email';

export interface CliOptions {
  actions: CliAction[];
  language: Language;
  cvPath: string;
  slug: string;
  jdSource?: JdSource;
  input?: string;
  body?: string;
  json: boolean;
}

export class CliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliArgsError';
  }
}

const KNOWN_FLAGS = new Set([
  'action',
  'lang',
  'cv',
  'slug',
  'jd-text',
  'jd-file',
  'jd-url',
  'input',
  'body',
  'json',
]);

const VALID_ACTIONS: CliAction[] = ['create', 'optimize', 'email'];

function parseFlags(argv: string[]): Map<string, string | true> {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      throw new CliArgsError(`Unexpected argument: ${arg}`);
    }
    const raw = arg.slice(2);
    const eqIndex = raw.indexOf('=');
    if (eqIndex !== -1) {
      flags.set(raw.slice(0, eqIndex), raw.slice(eqIndex + 1));
      continue;
    }
    if (raw === 'json') {
      flags.set(raw, true);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new CliArgsError(`Flag --${raw} requires a value.`);
    }
    flags.set(raw, next);
    i++;
  }
  return flags;
}

export function parseCliArgs(argv: string[]): CliOptions | null {
  if (argv.length === 0) return null;

  const flags = parseFlags(argv);

  for (const key of flags.keys()) {
    if (!KNOWN_FLAGS.has(key)) {
      throw new CliArgsError(`Unknown flag: --${key}`);
    }
  }

  const actionRaw = flags.get('action');
  if (typeof actionRaw !== 'string' || actionRaw.trim() === '') {
    throw new CliArgsError('Missing required flag: --action <create,optimize,email>');
  }
  const actions = actionRaw.split(',').map((value) => value.trim()) as CliAction[];
  for (const action of actions) {
    if (!VALID_ACTIONS.includes(action)) {
      throw new CliArgsError(`Unknown action: ${action}. Expected one of ${VALID_ACTIONS.join(', ')}.`);
    }
  }

  const slug = flags.get('slug');
  if (typeof slug !== 'string' || slug.trim() === '') {
    throw new CliArgsError('Missing required flag: --slug <str>');
  }

  let language: Language = 'pt-BR';
  const langRaw = flags.get('lang');
  if (typeof langRaw === 'string') {
    if (langRaw !== 'pt-BR' && langRaw !== 'en') {
      throw new CliArgsError(`Unknown --lang value: ${langRaw}. Expected pt-BR or en.`);
    }
    language = langRaw;
  }

  const cvRaw = flags.get('cv');
  const cvPath = typeof cvRaw === 'string' ? cvRaw : 'data/cv.yaml';

  const inputRaw = flags.get('input');
  const input = typeof inputRaw === 'string' ? inputRaw : undefined;

  const bodyRaw = flags.get('body');
  const body = typeof bodyRaw === 'string' ? bodyRaw : undefined;

  const jdText = flags.get('jd-text');
  const jdFile = flags.get('jd-file');
  const jdUrl = flags.get('jd-url');
  const jdFlagsGiven = [jdText, jdFile, jdUrl].filter((value) => typeof value === 'string').length;
  if (jdFlagsGiven > 1) {
    throw new CliArgsError('Only one of --jd-text, --jd-file, --jd-url may be given.');
  }

  let jdSource: JdSource | undefined;
  if (typeof jdText === 'string') {
    jdSource = { mode: 'paste', text: jdText };
  } else if (typeof jdFile === 'string') {
    jdSource = { mode: 'file', path: jdFile };
  } else if (typeof jdUrl === 'string') {
    jdSource = { mode: 'url', url: jdUrl };
  }

  const needsJdForOptimize = actions.includes('optimize') && input === undefined;
  const needsJdForEmail = actions.includes('email') && body === undefined;
  if ((needsJdForOptimize || needsJdForEmail) && jdSource === undefined) {
    throw new CliArgsError(
      'A job description is required (--jd-text, --jd-file, or --jd-url) for optimize/email unless using --input/--body bypass.'
    );
  }

  const json = flags.get('json') === true;

  return { actions, language, cvPath, slug, jdSource, input, body, json };
}
