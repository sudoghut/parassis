import { getLLMToken } from './tokenManager';
import Dexie from 'dexie';

const MAX_CONTEXT_CHARS = 2000;
const MAX_PREV_CONTENTS = 5;
const MAX_SUMMARY_CHARS = 500;

type LLMProvider = 'openai' | 'anthropic' | 'deepseek' | 'volcengine';

interface LLMConfig {
  endpoint: string;
  headers: (token: string) => HeadersInit;
  formatRequest: (prompt: string) => any;
  extractResponse: (data: any) => string;
}

const LLM_CONFIGS: Record<LLMProvider, LLMConfig> = {
  volcengine: {
    endpoint: '/volces-api/api/v3/chat/completions',
    headers: (token) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }),
    formatRequest: (prompt) => ({
      model: "deepseek-v3-241226",
      messages: [
        { role: "system", content: "你是人工智能助手." },
        { role: "user", content: prompt }
      ]
    }),
    extractResponse: (data) => {
      try {
        if (!data) {
          throw new Error('Empty response from Deepseek API');
        }
        if (typeof data !== 'object') {
          throw new Error(`Invalid response type from Deepseek API: ${typeof data}`);
        }
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
          throw new Error('No choices in Deepseek API response');
        }
        if (!data.choices[0].message) {
          throw new Error('No message in Deepseek API response choice');
        }
        return data.choices[0].message.content || '';
      } catch (error) {
        throw new Error(`Failed to extract Deepseek response: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    headers: (token) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }),
    formatRequest: (prompt) => ({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      stream: true
    }),
    extractResponse: (data) => data.choices[0].delta.content || ''
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    headers: (token) => ({
      'Content-Type': 'application/json',
      'x-api-key': token,
      'anthropic-version': '2023-06-01'
    }),
    formatRequest: (prompt) => ({
      model: "claude-2",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    }),
    extractResponse: (data) => data.content[0].text
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
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt }
      ]
    }),
    extractResponse: (data) => {
      try {
        if (!data) {
          throw new Error('Empty response from Deepseek API');
        }
        if (typeof data !== 'object') {
          throw new Error(`Invalid response type from Deepseek API: ${typeof data}`);
        }
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
          throw new Error('No choices in Deepseek API response');
        }
        if (!data.choices[0].message) {
          throw new Error('No message in Deepseek API response choice');
        }
        return data.choices[0].message.content || '';
      } catch (error) {
        throw new Error(`Failed to extract Deepseek response: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
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
  return combined.slice(combined.length - MAX_CONTEXT_CHARS);
}

export async function generateThreadSummary(
  db: Dexie, 
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
      .where('heading').equals(0)
      .and(item => item.id < currentId)
      .reverse()
      .limit(MAX_PREV_CONTENTS)
      .toArray();
    
    console.log(`[Debug] Found ${prevContents.length} previous contents`);

    const prevContexts = prevContents.map(item => item.content);
    const trimmedContext = await trimContent(prevContexts);

    onStatus('Getting LLM token...');
    const tokenInfo = await getLLMToken(db);
    if (!tokenInfo.token) {
      onError('No LLM token found');
      return '';
    }

    let prompt: string;
    let summary: string;

    console.log(`[Debug] Current content length: ${currentContent.content.length} chars`);
    if (currentContent.content.length > MAX_CONTEXT_CHARS) {
      onStatus('Summarizing long content...');
      const initialPrompt = `Summarize the following text in ${MAX_SUMMARY_CHARS} characters or less:\n\n${currentContent.content}`;
      summary = await callLLMAPI(tokenInfo, initialPrompt, onStatus, onError, onPartialResponse);
    } else {
      summary = currentContent.content;
    }

    onStatus('Generating thread summary...');
    prompt = `Given the following context from previous pages:\n\n${trimmedContext}\n\n` +
      `And the current content:\n\n${summary}\n\n` +
      `Identify and summarize the main recurring themes or threads across these texts. ` +
      `Emphasize connections between ideas and concepts that appear multiple times. ` +
      `Ensure that the summary is in the same language as the provided content.`;
    // print the whole prompt for debugging
    console.log(`[Debug] Prompt length: ${prompt.length} chars\n${prompt}`);
    return await callLLMAPI(tokenInfo, prompt, onStatus, onError, onPartialResponse);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    onError(`Error generating summary: ${errorMessage}`);
    return '';
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

    // Handle non-streaming responses (Volcengine, Deepseek)
    if (provider === 'volcengine' || provider === 'deepseek') {
      const rawResponse = await response.text();
      console.log(`[Debug] Raw API Response:`, rawResponse);
      
      let content: string;
      try {
        const jsonData = JSON.parse(rawResponse);
        console.log(`[Debug] Parsed JSON Data:`, JSON.stringify(jsonData, null, 2));
        content = config.extractResponse(jsonData);
        onPartialResponse(content);
        console.log(`[Debug] Complete response length: ${content.length} chars`);
      } catch (error: unknown) {
        const parseError = error instanceof Error ? error : new Error(String(error));
        console.error('[Debug] JSON Parse Error:', parseError);
        console.error('[Debug] Raw Response that caused error:', rawResponse);
        throw new Error(`Failed to parse Deepseek response: ${parseError.message}\nRaw response: ${rawResponse}`);
      }
      onStatus('Thread summary generation complete');
      return content;
    }

    // Handle streaming responses (OpenAI, etc.)
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let fullText = '';
    let chunkCount = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      chunkCount++;
      console.log(`[Debug] Received chunk size: ${chunk.length} chars`);
      onStatus(`Processing response chunk ${chunkCount}...`);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') continue;
          
          try {
            const jsonData = JSON.parse(jsonStr);
            const content = config.extractResponse(jsonData);
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

    console.log(`[Debug] Complete response length: ${fullText.length} chars`);
    onStatus('Thread summary generation complete');
    return fullText;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    onError(`LLM API Error: ${errorMessage}`);
    throw error;
  }
}
