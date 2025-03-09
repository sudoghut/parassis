export const LLMProviders = [
  { id: 'openai', name: 'ChatGPT - 4o mini' },
  { id: 'anthropic', name: 'Claude - 3.5 haiku' },
  { id: 'deepseek', name: 'DeepSeek - v3' },
  { id: 'volcengine', name: 'Volcengine - DS v3' }
] as const;

export type LLMProvider = typeof LLMProviders[number]['id'];
