import { getLLMToken } from './tokenManager';
import Dexie from 'dexie';

const MAX_CONTEXT_CHARS = 2000;
const MAX_PREV_CONTENTS = 10;
const MAX_SUMMARY_CHARS = 500;

type LLMProvider = 'openai' | 'anthropic' | 'deepseek';

interface LLMConfig {
  endpoint: string;
  headers: (token: string) => HeadersInit;
  formatRequest: (prompt: string) => any;
  extractResponse: (data: any) => string;
}

const LLM_CONFIGS: Record<LLMProvider, LLMConfig> = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    headers: (token) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }),
    formatRequest: (prompt) => ({
      model: "gpt-5.1-mini",
      messages: [{ role: "user", content: prompt }],
      stream: true
    }),
    extractResponse: (data) => {
      if (!data?.choices?.[0]?.delta?.content && data?.type === 'content_block_start') {
        // Handle the new response format
        return data.content_block?.text || '';
      }
      return data.choices?.[0]?.delta?.content || '';
    }
  },
  anthropic: {
    endpoint: '/anthropic-api/v1/messages',
    headers: (token) => ({
      'Content-Type': 'application/json',
      'x-api-key': token,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'yes'
    }),
    formatRequest: (prompt) => ({
      model: "claude-4.5-haiku",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 8000,
      stream: true
    }),
    extractResponse: (data) => {
      if (!data?.delta?.text && data?.type === 'content_block_start') {
        // Handle the new response format
        return data.content_block?.text || '';
      }
      return data.delta?.text || '';
    }
  },
  deepseek: {
    endpoint: 'https://api.deepseek.com/chat/completions',
    headers: (token) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }),
    formatRequest: (prompt) => ({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are an expert in analyzing plot cues from text" },
        { role: "user", content: prompt }
      ],
      stream: true
    }),
    extractResponse: (data) => {
      if (!data?.choices?.[0]?.delta?.content && data?.type === 'content_block_start') {
        // Handle the new response format
        return data.content_block?.text || '';
      }
      return data.choices?.[0]?.delta?.content || '';
    }
  }
};

async function trimContent(contents: string[]): Promise<string> {
  let combined = contents.join('\n\n');
  console.log(`[Debug] Combined content length: ${combined.length} chars`);
  
  if (combined.length <= MAX_CONTEXT_CHARS) {
    console.log('[Debug] Content within limit, no trimming needed');
    return combined;
  }
  
  console.log(`[Debug] Trimming content to ${MAX_CONTEXT_CHARS} chars`);
  return combined.slice(0, MAX_CONTEXT_CHARS);
}

export async function generateThreadSummary(
  db: Dexie,
  statusDb: Dexie,
  currentId: number,
  onStatus: (status: string) => void,
  onError: (error: string) => void,
  onPartialResponse: (text: string) => void
): Promise<string> {
  try {
    onStatus('Fetching current content...');
    const currentContent = await db.table('files')
      .where('id').equals(currentId)
      .and(item => item.heading === 0)
      .first();
    
    if (!currentContent) {
      onError('No content found');
      return '';
    }

    onStatus('Fetching previous contents...');
    const prevContents = await db.table('files')
      .where('id').below(currentId)
      .reverse()
      .limit(MAX_PREV_CONTENTS)
      .toArray();
    
    // console.log(`[Debug] Found ${prevContents.length} previous contents`);

    const prevContexts = prevContents.map(item => item.content);
    const trimmedContext = await trimContent(prevContexts);

    onStatus('Getting LLM token...');
    const tokenInfo = await getLLMToken(statusDb);
    if (!tokenInfo.token) {
      onError('No LLM token found');
      return '';
    }

    let prompt: string;
    let summary: string;

    // console.log(`[Debug] Current content length: ${currentContent.content.length} chars`);
    if (currentContent.content.length > MAX_CONTEXT_CHARS) {
      onStatus('Summarizing long content...');
      const initialPrompt = `Summarize the following text in ${MAX_SUMMARY_CHARS} characters or less:\n\n${currentContent.content}`;
      summary = await callLLMAPI(tokenInfo, initialPrompt, onStatus, onError, onPartialResponse);
    } else {
      summary = currentContent.content;
    }

    onStatus('Generating thread summary...');
    let userLanguage = 'en';  // Default to English code
    try {
      const langRecord = await statusDb.table('statusName').where('element').equals('language').first();
      if (langRecord?.value) {
        userLanguage = langRecord.value;
        console.log('[Debug] Found language record:', langRecord);
      } else {
        console.log('[Debug] No language record found, using default:', userLanguage);
      }
    } catch (error) {
      console.error('Error getting language setting:', error);
    }
    console.log(`[Debug] User language: ${userLanguage}`);
    prompt = `
      Given the following context from previous pages:

      ${trimmedContext}

      And the current content:

      ${summary}

      Analyze the plot clues in the current content by leveraging relevant references from the previous pages.

      - Summarize the current content in the selected language. The language is ${userLanguage}.
      - Identify the plot clues that appear in both the current content and previous pages.
      - Present the output in an itemized format:
        1. For each plot clue, provide a single sentence summarizing its relevance.
        2. Follow this with an analysis explaining how the plot clue evolves, connects to prior plot, and contributes to the current content.
      - Ensure that connections to previous pages are direct and relevant. Do not introduce unrelated elements or fabricate connections that do not exist.
      - If applicable, highlight how past thread influence or shape the ideas on the current page.

      IMPORTANT: Mathematical Formula Formatting Rules:
      You MUST use proper LaTeX syntax for all mathematical expressions in your response.

      Format Requirements:
      1. Inline formulas: wrap with single $ signs (e.g., $x^2 + y^2 = z^2$)
      2. Display formulas: wrap with double $$ signs (e.g., $$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$)

      Common LaTeX Commands You Should Use:
      - Subscripts: use underscore (e.g., $x_i$, $u_{r,t}$)
      - Superscripts: use caret (e.g., $x^2$, $e^{\\sigma t}$)
      - Fractions: use \\frac{numerator}{denominator} (e.g., $\\frac{a}{b}$)
      - Greek letters: use backslash (e.g., $\\sigma$, $\\varepsilon$, $\\theta$)
      - Summation: $\\sum_{i=1}^{n}$
      - Integrals: $\\int_{a}^{b}$
      - Square root: $\\sqrt{x}$

      Examples:
      - Inline: The variable $u_{r,t}$ represents the shock at time $t$.
      - Display: $$r_t = \\bar{r} + \\varepsilon_{r,t}$$
      - Complex: The cost function $\\frac{\\Phi_D}{2}(D_{t+1} - \\bar{D})^2$ includes adjustment costs.

      CRITICAL: Always enclose mathematical expressions with $ or $$ delimiters. Never write formulas in plain text.
    `;
    // print the whole prompt for debugging
    console.log(`[Debug] Prompt length: ${prompt.length} chars\n${prompt}`);
    return await callLLMAPI(tokenInfo, prompt, onStatus, onError, onPartialResponse);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    onError(`Error generating summary: ${errorMessage}`);
    return '';
  }
}

export async function chatWithAI(
  db: Dexie,
  messages: Array<{role: 'user' | 'assistant' | 'system', content: string}>,
  onStatus: (status: string) => void,
  onError: (error: string) => void,
  onPartialResponse: (text: string) => void
): Promise<string> {
  try {
    onStatus('Getting LLM token...');
    const tokenInfo = await getLLMToken(db);
    if (!tokenInfo.token) {
      onError('No LLM token found');
      return '';
    }

    const provider = tokenInfo.provider as LLMProvider;
    const config = LLM_CONFIGS[provider];

    if (!config) {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }

    onStatus('Sending message to AI...');

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: config.headers(tokenInfo.token),
      body: JSON.stringify({
        ...config.formatRequest(''), // Get base structure
        messages: messages
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`LLM API call failed: ${response.status} ${response.statusText}\n${errorData}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let fullText = '';
    let chunkCount = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      chunkCount++;
      onStatus(`Processing response chunk ${chunkCount}...`);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const jsonData = JSON.parse(jsonStr);
            let content = config.extractResponse(jsonData);
            if (content) {
              fullText += content;
              onPartialResponse(content);
            }
          } catch (e) {
            console.warn('Failed to parse JSON:', e);
          }
        }
      }
    }

    onStatus('Chat response complete');
    return fullText;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    onError(`Chat Error: ${errorMessage}`);
    throw error;
  }
}

async function callLLMAPI(
  tokenInfo: { provider: string, token: string },
  prompt: string,
  onStatus: (status: string) => void,
  onError: (error: string) => void,
  onPartialResponse: (text: string) => void
): Promise<string> {
  const provider = tokenInfo.provider as LLMProvider;
  const config = LLM_CONFIGS[provider];
  console.log(`[Debug] Using LLM provider: ${provider}`);
  console.log(`[Debug] LLM_CONFIGS: ${JSON.stringify(LLM_CONFIGS)}`);
  
  if (!config) {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  try {
    console.log(`[Debug] Calling LLM API - Provider: ${provider}, Endpoint: ${config.endpoint}`);
    console.log(`[Debug] Prompt length: ${prompt.length} chars`);
    
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: config.headers(tokenInfo.token),
      body: JSON.stringify(config.formatRequest(prompt))
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`LLM API call failed: ${response.status} ${response.statusText}\n${errorData}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let fullText = '';
    let chunkCount = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      chunkCount++;
      //console.log(`[Debug] Received chunk size: ${chunk.length} chars`);
      onStatus(`Processing response chunk ${chunkCount}...`);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') continue;
          
          try {
            const jsonData = JSON.parse(jsonStr);
            let content = config.extractResponse(jsonData);
            if (content) {
              fullText += content;
              onPartialResponse(content);
            }
          } catch (e) {
            console.warn('Failed to parse JSON:', e);
            console.log(`[Debug] JSON string: ${jsonStr}`);
          }
        }
      }
    }

    console.log(`[Debug] Complete response length: ${fullText.length} chars`);
    console.log(`[Debug] The response is:\n${fullText}`);
    onStatus('Thread summary generation complete');
    return fullText;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    onError(`LLM API Error: ${errorMessage}`);
    throw error;
  }
}
