import { GoogleGenAI } from '@google/genai';

export class MissingApiKeyError extends Error {}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new MissingApiKeyError(
      'GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.'
    );
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

async function generateContent(prompt: string, responseMimeType?: string): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-flash-latest',
    contents: prompt,
    config: { maxOutputTokens: 4096, ...(responseMimeType ? { responseMimeType } : {}) },
  });
  const text = response.text;
  if (!text) {
    throw new Error('Unexpected empty response from Gemini API.');
  }
  return text;
}

export async function generateText(prompt: string): Promise<string> {
  return generateContent(prompt);
}

/**
 * Same as generateText, but constrains Gemini to emit raw JSON (no markdown
 * fences) via responseMimeType: 'application/json'. Use this for any prompt
 * whose output will be JSON.parse'd.
 */
export async function generateJson(prompt: string): Promise<string> {
  return generateContent(prompt, 'application/json');
}
