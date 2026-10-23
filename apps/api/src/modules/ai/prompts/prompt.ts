import type { ZodType } from 'zod';
import type { PromptName } from '../ai-client';

const REQUIRED_JSON_KEYWORD = 'json';

export interface PromptDefinition<TOutput> {
  readonly name: PromptName;
  readonly systemMessage: string;
  readonly outputSchema: ZodType<TOutput>;
}

const registeredPrompts = new Map<PromptName, PromptDefinition<unknown>>();

export function registerPrompt<TOutput>(definition: PromptDefinition<TOutput>): void {
  if (!definition.systemMessage.toLowerCase().includes(REQUIRED_JSON_KEYWORD)) {
    throw new Error(
      `Prompt "${definition.name}" was rejected at registration: its system message must ` +
        `contain the word "${REQUIRED_JSON_KEYWORD}", which DeepSeek JSON mode requires or ` +
        `it refuses the request.`,
    );
  }
  registeredPrompts.set(definition.name, definition);
}

export function getPrompt(name: PromptName): PromptDefinition<unknown> {
  const definition = registeredPrompts.get(name);
  if (definition === undefined) {
    throw new Error(`Prompt "${name}" is not registered.`);
  }
  return definition;
}

export function clearPromptRegistryForTests(): void {
  registeredPrompts.clear();
}
