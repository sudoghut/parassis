export const LLMProviders = [
  { id: 'openai', name: 'ChatGPT - 5.1 mini' },
  { id: 'anthropic', name: 'Claude - 4.5 haiku' },
  { id: 'deepseek', name: 'DeepSeek - 3.2' }
] as const;

export type LLMProvider = typeof LLMProviders[number]['id'];
