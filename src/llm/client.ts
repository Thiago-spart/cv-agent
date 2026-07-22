import Anthropic from '@anthropic-ai/sdk';

export class MissingApiKeyError extends Error {}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new MissingApiKeyError(
      'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.'
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}

export async function generateText(prompt: string): Promise<string> {
  const anthropic = getClient();
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = message.content[0];
  if (block.type !== 'text') {
    throw new Error('Unexpected response content type from Claude API.');
  }
  return block.text;
}
