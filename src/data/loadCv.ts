import fs from 'node:fs';
import yaml from 'js-yaml';
import { cvSchema, type Cv } from './cvSchema.js';

export class CvValidationError extends Error {}

export function loadCv(filePath: string): Cv {
  if (!fs.existsSync(filePath)) {
    throw new CvValidationError(
      `CV data file not found at ${filePath}. Copy data/cv.example.yaml to data/cv.yaml and fill in your details.`
    );
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw);

  const result = cvSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new CvValidationError(`Invalid CV data in ${filePath}:\n${issues}`);
  }

  return result.data;
}
