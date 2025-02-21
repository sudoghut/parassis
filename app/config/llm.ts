export const LLMProviders = [
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'openai', name: 'ChatGPT' },
  { id: 'claude', name: 'Claude' },
  { id: 'volcengine', name: 'Volcengine' }
] as const;

export type LLMProvider = typeof LLMProviders[number]['id'];
