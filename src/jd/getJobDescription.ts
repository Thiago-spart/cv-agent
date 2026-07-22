import fs from 'node:fs/promises';

export type JdSource =
  | { mode: 'paste'; text: string }
  | { mode: 'file'; path: string }
  | { mode: 'url'; url: string };

export class JobDescriptionError extends Error {}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function resolveJobDescription(source: JdSource): Promise<string> {
  if (source.mode === 'paste') {
    const text = source.text.trim();
    if (!text) {
      throw new JobDescriptionError('Pasted job description was empty.');
    }
    return text;
  }

  if (source.mode === 'file') {
    let raw: string;
    try {
      raw = await fs.readFile(source.path, 'utf8');
    } catch {
      throw new JobDescriptionError(`Could not read job description file at ${source.path}.`);
    }
    const text = raw.trim();
    if (!text) {
      throw new JobDescriptionError(`Job description file at ${source.path} was empty.`);
    }
    return text;
  }

  let response: Response;
  try {
    response = await fetch(source.url);
  } catch {
    throw new JobDescriptionError(
      `Could not fetch URL ${source.url}. Please paste the job description text instead.`
    );
  }
  if (!response.ok) {
    throw new JobDescriptionError(
      `Fetching ${source.url} returned HTTP ${response.status}. Please paste the job description text instead.`
    );
  }
  let html: string;
  try {
    html = await response.text();
  } catch {
    throw new JobDescriptionError(
      `Could not read response body from ${source.url}. Please paste the job description text instead.`
    );
  }
  const text = stripHtml(html);
  if (text.length < 50) {
    throw new JobDescriptionError(
      `Could not extract meaningful text from ${source.url}. Please paste the job description text instead.`
    );
  }
  return text;
}
