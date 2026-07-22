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

export async function generateText(prompt: string): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { maxOutputTokens: 4096 },
  });
  const text = response.text;
  if (!text) {
    throw new Error('Unexpected empty response from Gemini API.');
  }
  return text;
}
