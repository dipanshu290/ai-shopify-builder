import 'server-only';
import { GoogleGenAI } from '@google/genai';
import type {
  AIProvider,
  PlanTurnInput,
  StreamPageInput,
  EditPageInput,
  GenerateThemeInput,
  ShopifySectionInput,
} from '../types';
import {
  turnPlanSchema,
  pagePatchSchema,
  themeSpecSchema,
  shopifySectionSpecSchema,
  type TurnPlan,
  type PagePatch,
  type ThemeSpec,
  type ShopifySectionSpec,
} from '../schema';
import {
  planTurnSystemPrompt,
  streamPageSystemPrompt,
  editPageSystemPrompt,
  themeSystemPrompt,
  shopifySectionSystemPrompt,
} from '../prompts';

/**
 * Gemini adapter. All Gemini-specific request shaping lives here so the rest of
 * the app depends only on the `AIProvider` interface. The API key and model id
 * are read from the environment and never leave the server.
 */

type Turn = { role: 'user' | 'assistant'; content: string };

/** Map our chat turns to Gemini's `contents` (assistant -> "model"). */
function toContents(messages: Turn[]) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

export function createGeminiProvider(model: string): AIProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to .env.local.');
  }
  const ai = new GoogleGenAI({ apiKey });

  return {
    async planTurn(input: PlanTurnInput): Promise<TurnPlan> {
      const response = await ai.models.generateContent({
        model,
        contents: toContents(input.messages),
        config: {
          systemInstruction: planTurnSystemPrompt(input.existingPages, input.activePageId),
          temperature: 0.7,
          responseMimeType: 'application/json',
          abortSignal: input.abortSignal,
        },
      });

      const text = response.text ?? '';
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Model didn't return clean JSON — degrade gracefully to a chat reply.
        return { reply: text.trim() || 'Sorry, could you rephrase that?', action: 'chat', plannedPages: [] };
      }

      const result = turnPlanSchema.safeParse(parsed);
      if (!result.success) {
        return { reply: 'Sorry, I had trouble planning that. Could you rephrase?', action: 'chat', plannedPages: [] };
      }
      return result.data;
    },

    async generateTheme(input: GenerateThemeInput): Promise<ThemeSpec> {
      const response = await ai.models.generateContent({
        model,
        contents: toContents(input.messages),
        config: {
          systemInstruction: themeSystemPrompt(),
          temperature: 0.7,
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
          abortSignal: input.abortSignal,
        },
      });

      const text = response.text ?? '';
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error('The model returned an invalid theme.');
      }
      const parsed = themeSpecSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error('The model returned an invalid theme.');
      }
      return parsed.data;
    },

    async *streamPage(input: StreamPageInput): AsyncIterable<string> {
      const stream = await ai.models.generateContentStream({
        model,
        contents: toContents(input.messages),
        config: {
          systemInstruction: streamPageSystemPrompt(input.page, input.siblingPages, input.styleGuide),
          temperature: 0.8,
          maxOutputTokens: 32768,
          abortSignal: input.abortSignal,
        },
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield text;
      }
    },

    async editPage(input: EditPageInput): Promise<PagePatch> {
      const response = await ai.models.generateContent({
        model,
        contents: toContents(input.messages),
        config: {
          systemInstruction: editPageSystemPrompt(input.page, input.html, input.styleGuide),
          temperature: 0.4,
          responseMimeType: 'application/json',
          maxOutputTokens: 32768,
          abortSignal: input.abortSignal,
        },
      });

      const text = response.text ?? '';
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Model didn't return clean JSON — no operations to apply.
        return { operations: [] as PagePatch['operations'] };
      }

      const result = pagePatchSchema.safeParse(parsed);
      if (!result.success) {
        // Drop the whole patch rather than apply partially-invalid operations.
        return { operations: [] as PagePatch['operations'] };
      }
      return result.data;
    },

    async generateShopifySection(input: ShopifySectionInput): Promise<ShopifySectionSpec> {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: input.html }] }],
        config: {
          systemInstruction: shopifySectionSystemPrompt({
            brandName: input.brandName,
            pageType: input.pageType,
            pageLabel: input.pageLabel,
            role: input.role,
            styleGuide: input.styleGuide,
          }),
          temperature: 0.4,
          responseMimeType: 'application/json',
          maxOutputTokens: 32768,
          abortSignal: input.abortSignal,
        },
      });

      const text = response.text ?? '';
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error('The model returned an invalid Shopify section.');
      }
      const parsed = shopifySectionSpecSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error('The model returned an invalid Shopify section.');
      }
      return parsed.data;
    },
  };
}
