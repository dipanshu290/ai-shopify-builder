import 'server-only';
import type { AIProvider } from './types';
import { createGeminiProvider } from './providers/gemini';

/**
 * AI provider factory. Reads the active provider and model from the environment
 * (AGENTS.md §7) so the app stays provider-independent and no model name is
 * hardcoded into feature code.
 *
 *   AI_PROVIDER  — "gemini" (default). Add more cases as adapters are built.
 *   AI_MODEL     — model id for the active provider.
 */
export function getAIProvider(): AIProvider {
  const provider = (process.env.AI_PROVIDER ?? 'gemini').toLowerCase();
  const model = process.env.AI_MODEL ?? 'gemini-2.5-flash';

  switch (provider) {
    case 'gemini':
      return createGeminiProvider(model);
    default:
      throw new Error(`Unsupported AI_PROVIDER "${provider}". Set AI_PROVIDER=gemini in .env.local.`);
  }
}

export type { AIProvider } from './types';
