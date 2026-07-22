import fs from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import type { Cv } from '../data/cvSchema.js';

const TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'cv.html');

export function fillCvTemplate(cv: Cv): string {
  const source = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const template = Handlebars.compile(source);
  return template(cv);
}
