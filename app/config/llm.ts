export const LLMProviders = [
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'chatgpt', name: 'ChatGPT' },
  { id: 'claude', name: 'Claude' }
] as const;

export type LLMProvider = typeof LLMProviders[number]['id'];
