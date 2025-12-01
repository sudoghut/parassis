import type { MetaFunction } from "@remix-run/node";
import { useEffect, useState, useRef } from "react";
import {
  Menu,
  FileUp,
  LayoutList,
  Settings as SettingsIcon,
  MessageCircle,
} from "lucide-react";
import Dexie from "dexie";
import { marked } from "marked";
import markedKatex from "marked-katex-extension";
import "katex/dist/katex.min.css";
import Settings from '../components/Settings';
import { LLMStatus } from '../components/LLMStatus';
import { checkLLMToken, saveLLMToken, getLLMToken } from '../utils/tokenManager';
import { generateThreadSummary, chatWithAI } from '../utils/summarizer';

export const meta: MetaFunction = () => {
  return [
    { title: "Parassis" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

const dbName = 'Parassis';
const statusDbName = 'ParassisStatusName';

// Database types
interface DbFile {
  id?: number;
  content: string;
  heading: number;
}

interface StatusDbItem {
  element: string;
  value: string;
}

// Create singleton database instances
const db = new Dexie(dbName);
db.version(1).stores({
  files: '++id, content, heading'
});

const statusDb = new Dexie(statusDbName);
statusDb.version(1).stores({
  statusName: 'element, value'  // Schema for storing settings and values
}).upgrade(tx => {
  // Ensure we have a default language setting
  return tx.table('statusName').put({
    element: 'language',
    value: 'English'  // Default to English name instead of code
  });
});

const getLatestHeadings = async (beforeId: number): Promise<DbFile[]> => {
  const headings = await db.table('files')
    .where('id').below(beforeId)
    .and((item: DbFile) => item.heading > 0)
    .sortBy('id');

  return headings.reduce((acc: DbFile[], curr) => {
    const existingIndex = acc.findIndex(h => h.heading === curr.heading);
    if (existingIndex >= 0) {
      acc[existingIndex] = curr;
    } else {
      acc.push(curr);
    }
    return acc;
  }, []).sort((a, b) => a.heading - b.heading);
};

marked.use(
  markedKatex({
    throwOnError: false,
    output: "html",
  })
);

const displayContent = async (content: string, headings: DbFile[]) => {
  const headingText = headings.map(h => {
    // Remove markdown heading symbols and trim
    const cleanHeading = h.content.replace(/^#+\s+/, '');
    // Add proper heading level based on the number of # symbols
    return `${'#'.repeat(h.heading)} ${cleanHeading}`;
  }).join('\n\n');
  if (!content.includes('\n\n')) {
    content = content.replace(/\n/g, '\n\n');
  }
  const finalContent = headingText ? `${headingText}\n\n${content}` : content;
  let parsedContent = await marked(finalContent, { breaks: true });
  parsedContent = parsedContent.replace(/\n/g, '<br />');
  document.getElementById('content')!.innerHTML = parsedContent;
};

export default function Index() {
  const loadCurrentPage = async () => {
    try {
      const currentStatus = await statusDb.table('statusName')
        .where('element').equals('currentPage')
        .first();
      
      if (!currentStatus) return;

      const currentId = parseInt(currentStatus.value);
      const currentContent = await db.table('files')
        .where('id').equals(currentId)
        .first();

      if (currentContent && currentContent.id !== undefined) {
        const latestHeadings = await getLatestHeadings(currentContent.id);
        await displayContent(currentContent.content, latestHeadings);
      }
    } catch (error) {
      console.error('Error loading current page:', error);
      setLLMError('Error loading current page');
    }
  };

  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenInfo, setTokenInfo] = useState({ provider: '', token: '', language: '' });
  const [llmStatus, setLLMStatus] = useState('');
  const [llmError, setLLMError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHeadingsMenu, setShowHeadingsMenu] = useState(false);
  const [headings, setHeadings] = useState<DbFile[]>([]);
  const [autoSummarizeOnPageTurn, setAutoSummarizeOnPageTurn] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  // Chat states
  const [showChat, setShowChat] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatProcessing, setIsChatProcessing] = useState(false);

  const formatMarkedContent = (markedContent: string): string => {
    let formatted = markedContent;
    formatted = formatted.replace(/<\/ul>/g, '</ul><br />');
    formatted = formatted.replace(/(<\/?h\d>)/g, '$1<br />');
    return formatted;
  };

  const handlePrevContent = async () => {
    console.log('[Debug] handlePrevContent: autoSummarizeOnPageTurn =', autoSummarizeOnPageTurn);
    const currentStatus = await statusDb.table('statusName')
      .where('element').equals('currentPage')
      .first();

    if (!currentStatus) return;

    const currentId = parseInt(currentStatus.value);
    const prevContent = await db.table('files')
      .where('heading').equals(0)
      .and((item: DbFile) => item.id !== undefined && item.id < currentId)
      .reverse()
      .first();

    if (prevContent && prevContent.id !== undefined) {
      await statusDb.table('statusName')
      .where('element').equals('currentPage')
        .modify({ value: prevContent.id.toString() });

      const latestHeadings = await getLatestHeadings(prevContent.id);
      await displayContent(prevContent.content, latestHeadings);

      // Always clear annotation when navigating
      const annotationEl = document.getElementById('annotation');
      if (annotationEl) {
        annotationEl.innerHTML = '';
      }

      // Clear chat history when navigating
      setChatHistory([]);

      if (autoSummarizeOnPageTurn) {
        setIsProcessing(true);
        const summary = await generateThreadSummary(
          db,
          statusDb,
          prevContent.id,
          (status: string) => setLLMStatus(status),
          (error: string) => setLLMError(error),
          (partial: string) => {
            const annotation = document.getElementById('annotation');
            if (annotation) {
              annotation.innerHTML += partial;
            }
          }
        );
        setIsProcessing(false);
        if (summary) {
          let markedSummary = await marked(summary, { breaks: true });
          markedSummary = formatMarkedContent(markedSummary);
          const annotation = document.getElementById('annotation');
          if (annotation) {
            annotation.innerHTML = markedSummary;
          }
        }
      }
    }
  };

  const handleNextContent = async () => {
      console.log('[Debug] handleNextContent: autoSummarizeOnPageTurn =', autoSummarizeOnPageTurn);
      const currentStatus = await statusDb.table('statusName')
      .where('element').equals('currentPage')
      .first();

    if (!currentStatus) return;

    const currentId = parseInt(currentStatus.value);
    const nextContent = await db.table('files')
      .where('heading').equals(0)
      .and((item: DbFile) => item.id !== undefined && item.id > currentId)
      .first();

    if (nextContent && nextContent.id !== undefined) {
      await statusDb.table('statusName')
        .where('element').equals('currentPage')
        .modify({ value: nextContent.id.toString() });

      const latestHeadings = await getLatestHeadings(nextContent.id);
      await displayContent(nextContent.content, latestHeadings);

      // Always clear annotation when navigating
      const annotationEl = document.getElementById('annotation');
      if (annotationEl) {
        annotationEl.innerHTML = '';
      }

      // Clear chat history when navigating
      setChatHistory([]);

      if (autoSummarizeOnPageTurn) {
        setIsProcessing(true);
        const summary = await generateThreadSummary(
          db,
          statusDb,
          nextContent.id,
          (status: string) => setLLMStatus(status),
          (error: string) => setLLMError(error),
          (partial: string) => {
            const annotation = document.getElementById('annotation');
            if (annotation) {
              annotation.innerHTML += partial;
            }
          }
        );
        setIsProcessing(false);
        if (summary) {
          let markedSummary = await marked(summary, { breaks: true });
          markedSummary = formatMarkedContent(markedSummary);
          const annotation = document.getElementById('annotation');
          if (annotation) {
            annotation.innerHTML = markedSummary;
          }
        }
      }
    }
  };

  // Handle clicks outside of menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowHeadingsMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll chat window to bottom when new messages arrive
  useEffect(() => {
    const chatWindowContent = document.getElementById('chat-messages');
    if (chatWindowContent && showChat) {
      chatWindowContent.scrollTop = chatWindowContent.scrollHeight;
    }
  }, [chatHistory, showChat]);

  // Load all headings when menu is opened
  const loadHeadings = async () => {
    try {
      const allHeadings = await db.table('files')
        .where('heading')
        .above(0)
        .sortBy('id');
      setHeadings(allHeadings);
    } catch (error: unknown) {
      console.error('Error loading headings:', error);
    }
  };

  const handleHeadingClick = async (headingId: number) => {
    try {
      // Find the next content after this heading
      const nextContent = await db.table('files')
        .where('id')
        .aboveOrEqual(headingId)
        .and((item: DbFile) => item.id !== undefined && item.heading === 0)
        .first();

      if (nextContent && nextContent.id !== undefined) {
        await statusDb.table('statusName')
          .where('element')
          .equals('currentPage')
          .modify({ value: nextContent.id.toString() });
        
        const latestHeadings = await getLatestHeadings(nextContent.id);
        await displayContent(nextContent.content, latestHeadings);
      }
    } catch (error: unknown) {
      console.error('Error navigating to heading:', error);
    }
    
    setShowHeadingsMenu(false);
  };

  const handleTextFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        try {
          document.getElementById('annotation')!.innerHTML = '';
          // Delete and recreate Parassis database
          await Dexie.delete(dbName);
          await db.open();
          
          await db.transaction('rw', db.table('files'), async () => {
            console.log("Database is ready to use");
            const lines = content.split('\n');
            let currentContent: string[] = [];
            
            const saveContent = async (content: string[], heading: number = 0) => {
              if (content.length > 0) {
                await db.table('files').add({
                  content: content.join('\n'),
                  heading: heading
                });
              }
            };

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine) {
                const headingMatch = trimmedLine.match(/^(#+)\s/);
                if (headingMatch) {
                  // Save accumulated content before handling new heading
                  await saveContent(currentContent);
                  currentContent = [];
                  
                  // Add the heading
                  const headingLevel = headingMatch[1].length;
                  await db.table('files').add({
                    content: trimmedLine,
                    heading: headingLevel
                  });
                } else {
                  currentContent.push(trimmedLine);
                }
              }
            }
            
            // Save any remaining content at the end
            await saveContent(currentContent);
          }).then(async () => {
            // Query for lines with heading 0, ordered by id
            const linesWithHeadingZero = await db.table('files')
              .where('heading').equals(0)
              .sortBy('id');
          
            let minIdContent: DbFile | undefined;
            if (linesWithHeadingZero.length > 0) {
              minIdContent = linesWithHeadingZero[0]; // The first item is the one with the lowest id
              
              // Store initial page in status
                const minId = await db.table('files')
                .where('heading').equals(0)
                .first()
                .then(item => item?.id || 1);
                
                await statusDb.table('statusName').put({
                element: 'currentPage',
                value: minId.toString()
                });
            } else {
              console.log('No lines with heading 0 found. Using the first line instead.');
              minIdContent = await db.table('files').toCollection().first();
              if (minIdContent) {
                await statusDb.table('statusName').put({
                element: 'currentPage',
                value: '1'
                });
              }
            }
          
            if (minIdContent && minIdContent.id !== undefined) {
              // Get all headings before this content
              const latestHeadings = await getLatestHeadings(minIdContent.id);
              await displayContent(minIdContent.content, latestHeadings);
              console.log('File processed successfully');
              
              // Reload current page to ensure proper initialization
              loadCurrentPage();
            }
          }).catch((error: unknown) => {
            console.error('Error processing file:', error);
          });
        } catch (error) {
          console.error("Error processing file:", error);
        }
      } else {
        console.error('Failed to read text file content');
      }
    };
    reader.readAsText(file);
  };

  const uploadFile = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.markdown';
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        console.log('Uploading file:', file.name);
        handleTextFile(file);
      }
    };
    input.click();
  };

  useEffect(() => {
    const init = async () => {
      try {
        await db.open();
        await statusDb.open();
      } catch (error: unknown) {
        console.error('Error opening database:', error);
        // Only delete and reinitialize if there's a version/schema error
        if (error instanceof Error && error.name === 'VersionError') {
          await Dexie.delete(dbName);
          await Dexie.delete(statusDbName);
          await db.open();
          await statusDb.open();
        }
      }

      // Load autoSummarizeOnPageTurn setting (default: true)
      try {
        const autoRecord = await statusDb.table('statusName')
          .where('element').equals('autoSummarizeOnPageTurn')
          .first();
        console.log('[Debug] Index init: autoSummarizeOnPageTurn record =', autoRecord);

        if (autoRecord?.value === 'false') {
          setAutoSummarizeOnPageTurn(false);
          console.log('[Debug] Index init: autoSummarizeOnPageTurn state set to', false);
        } else {
          setAutoSummarizeOnPageTurn(true);
          console.log('[Debug] Index init: autoSummarizeOnPageTurn state set to', true);
          if (!autoRecord) {
            await statusDb.table('statusName').put({
              element: 'autoSummarizeOnPageTurn',
              value: 'true',
            });
          }
        }
      } catch (error) {
        console.error('Error loading autoSummarizeOnPageTurn setting:', error);
      }

      const hasToken = await checkLLMToken(statusDb);
      if (!hasToken) {
        setShowTokenInput(true);
      }
      const info = await getLLMToken(statusDb);
      setTokenInfo(info);
      loadCurrentPage();
    };

    init();
  }, []);

  const handleTokenSubmit = async (provider: string, token: string, language: string) => {
    await saveLLMToken(statusDb, provider, token, language);
    setShowTokenInput(false);
    setTokenInfo({ provider, token, language });

    // Reload autoSummarizeOnPageTurn from DB after settings are saved
    try {
      const autoRecord = await statusDb.table('statusName')
        .where('element').equals('autoSummarizeOnPageTurn')
        .first();
      console.log('[Debug] After Settings save: autoSummarizeOnPageTurn record =', autoRecord);

      if (autoRecord?.value === 'false') {
        setAutoSummarizeOnPageTurn(false);
        console.log('[Debug] After Settings save: autoSummarizeOnPageTurn state set to', false);
      } else {
        setAutoSummarizeOnPageTurn(true);
        console.log('[Debug] After Settings save: autoSummarizeOnPageTurn state set to', true);
      }
    } catch (error) {
      console.error('Error reloading autoSummarizeOnPageTurn after settings save:', error);
    }
  };

  const handleSettingsClick = async () => {
    const info = await getLLMToken(statusDb);
    setTokenInfo(info);
    setShowTokenInput(true);
  };

  const handleGenerateThreadSummary = async () => {
    const currentStatus = await statusDb.table('statusName')
      .where('element').equals('currentPage')
      .first();

    if (!currentStatus) return;

    const currentId = parseInt(currentStatus.value);

    setIsProcessing(true);
    const annotationEl = document.getElementById('annotation');
    if (annotationEl) {
      annotationEl.innerHTML = '';
    }

    const summary = await generateThreadSummary(
      db,
      statusDb,
      currentId,
      (status: string) => setLLMStatus(status),
      (error: string) => setLLMError(error),
      (partial: string) => {
        const annotation = document.getElementById('annotation');
        if (annotation) {
          annotation.innerHTML += partial;
        }
      }
    );
    setIsProcessing(false);
    if (summary) {
      console.log('Summary before marked:', summary);
      let markedSummary = await marked(summary, { breaks: true });
      markedSummary = formatMarkedContent(markedSummary);
      console.log('Summary:', markedSummary);
      const annotation = document.getElementById('annotation');
      if (annotation) {
        annotation.innerHTML = markedSummary;
      }
    } else {
      console.log('No summary generated');
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || isChatProcessing) return;

    const userMessage = chatInput.trim();
    setChatInput('');

    // Add user message to chat history
    const newHistory = [...chatHistory, { role: 'user' as const, content: userMessage }];
    setChatHistory(newHistory);

    setIsChatProcessing(true);
    setIsProcessing(true);

    // Add a temporary empty assistant message to chat history for streaming
    const streamingHistory = [...newHistory, { role: 'assistant' as const, content: '' }];
    setChatHistory(streamingHistory);

    try {
      // Get current page content as context
      const currentStatus = await statusDb.table('statusName')
        .where('element').equals('currentPage')
        .first();

      let currentPageContent = '';
      if (currentStatus) {
        const currentId = parseInt(currentStatus.value);
        const currentContent = await db.table('files')
          .where('id').equals(currentId)
          .first();

        if (currentContent) {
          // Get headings for context
          const latestHeadings = await getLatestHeadings(currentId);
          const headingText = latestHeadings.map(h => {
            const cleanHeading = h.content.replace(/^#+\s+/, '');
            return `${'#'.repeat(h.heading)} ${cleanHeading}`;
          }).join('\n');

          currentPageContent = headingText ? `${headingText}\n\n${currentContent.content}` : currentContent.content;
        }
      }

      // Prepare messages with current page content as system context
      const systemPrompt = currentPageContent
        ? `You are a helpful AI assistant. Answer questions based on the conversation history and the following context from the current page:\n\n${currentPageContent}\n\nUse this context to provide relevant and accurate answers.`
        : 'You are a helpful AI assistant. Answer questions based on the conversation history.';

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...newHistory
      ];

      let assistantResponse = '';

      await chatWithAI(
        statusDb,
        messages,
        (status: string) => setLLMStatus(status),
        (error: string) => setLLMError(error),
        async (partial: string) => {
          assistantResponse += partial;
          // Update the last message in chat history with streaming content
          setChatHistory([...newHistory, { role: 'assistant' as const, content: assistantResponse }]);

          // Scroll to bottom
          const chatWindowContent = document.getElementById('chat-messages');
          if (chatWindowContent) {
            chatWindowContent.scrollTop = chatWindowContent.scrollHeight;
          }
        }
      );

      // Final update with complete response
      setChatHistory([...newHistory, { role: 'assistant' as const, content: assistantResponse }]);
    } catch (error) {
      console.error('Chat error:', error);
      setLLMError('Failed to get chat response');
      // Remove the empty assistant message on error
      setChatHistory(newHistory);
    } finally {
      setIsChatProcessing(false);
      setIsProcessing(false);
    }
  };

  const handleChatToggle = () => {
    setShowChat(!showChat);
  };

  return (
    <>
      {showTokenInput && (
        <Settings 
          onSubmit={handleTokenSubmit} 
          onClose={() => setShowTokenInput(false)}
          initialProvider={tokenInfo.provider}
          initialToken={tokenInfo.token}
          initialLanguage={tokenInfo.language}
          db={statusDb}
        />
      )}
      <div className="flex min-h-screen justify-center mb-40">
        <div className="flex flex-col w-[80%]">
          <div className="flex flex-row items-center p-4">
            <div className="flex items-center space-x-4">
              <div className="text-2xl font-bold">Parassis Reader</div>
              <Menu
                size={24}
                className="cursor-pointer"
                onClick={() => {
                  setShowHeadingsMenu(!showHeadingsMenu);
                  if (!showHeadingsMenu) {
                    loadHeadings();
                  }
                }}
                aria-label="Show document headings"
              />
              {showHeadingsMenu && (
                <div 
                  ref={menuRef}
                  className="absolute z-50 mt-2 w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 border border-gray-200 dark:border-gray-700 max-h-[80vh] overflow-y-auto"
                  style={{ top: '50px', left: '100px' }}
                >
                  <div className="py-1">
                    {headings.map((heading) => (
                      <div
                        key={heading.id}
                        className="px-4 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                        style={{ paddingLeft: `${(heading.heading) * 1}rem` }}
                        onClick={() => heading.id !== undefined && handleHeadingClick(heading.id)}
                      >
                        {heading.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <FileUp
                size={24}
                className="cursor-pointer"
                onClick={uploadFile}
                aria-label="Upload a .txt or .md file"
              />
            </div>
          </div>
          <div id="content" className="flex flex-col justify-center p-4 text-xl">
            Content
          </div>
          <div className="flex flex-row items-center justify-between p-4">
            <div className="flex space-x-4 justify-center items-center w-full">
              <div
                className={`flex-1 py-2 px-4 text-center border border-gray-300 dark:border-gray-700 rounded-md ${
                  isProcessing
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'
                }`}
                onClick={isProcessing ? undefined : handlePrevContent}
              >
                &lt;&lt;&lt; Prev
              </div>
              <div
                className={`flex-1 py-2 px-4 text-center border border-gray-300 dark:border-gray-700 rounded-md ${
                  isProcessing
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'
                }`}
                onClick={isProcessing ? undefined : handleNextContent}
              >
                Next &gt;&gt;&gt;
              </div>
            </div>
          </div>

          <div className="flex flex-row items-center p-4">
            <div className="flex items-center space-x-4">
              <div className="text-2xl font-bold">Assistant</div>
              <LayoutList
                size={24}
                className={`cursor-pointer hover:text-blue-500 transition-colors ${
                  isProcessing || isChatProcessing
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
                onClick={isProcessing || isChatProcessing ? undefined : handleGenerateThreadSummary}
                aria-label="Generate summary for current page"
              />
              <MessageCircle
                size={24}
                className={`cursor-pointer hover:text-blue-500 transition-colors ${
                  isProcessing || isChatProcessing
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
                onClick={isProcessing || isChatProcessing ? undefined : handleChatToggle}
                aria-label="Open or close chat with AI"
              />
              <SettingsIcon
                size={24}
                className="cursor-pointer hover:text-blue-500 transition-colors"
                onClick={handleSettingsClick}
                aria-label="Open settings"
              />
            </div>
          </div>

          {/* Chat Window */}
          {showChat && (
            <div className="flex flex-col p-4 border border-gray-300 dark:border-gray-700 rounded-md mb-4 mx-4 bg-gray-50 dark:bg-gray-800">
              <div className="text-lg font-bold mb-2">Chat with AI</div>
              <div
                id="chat-messages"
                className="flex flex-col space-y-2 mb-4 max-h-96 overflow-y-auto p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-600"
              >
                {chatHistory.map((msg, idx) => {
                  // Render markdown for messages
                  let renderedContent = msg.content;
                  try {
                    renderedContent = marked(msg.content, { breaks: true }) as string;
                  } catch (e) {
                    console.error('Error rendering markdown:', e);
                  }

                  return (
                    <div
                      key={idx}
                      className={`mb-2 ${
                        msg.role === 'user'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      <strong>{msg.role === 'user' ? 'You:' : 'AI:'}</strong>
                      <span
                        className="inline-block ml-2"
                        dangerouslySetInnerHTML={{ __html: renderedContent }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isChatProcessing) {
                      handleChatSubmit();
                    }
                  }}
                  placeholder="Type your message..."
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-black dark:text-white"
                  disabled={isChatProcessing}
                />
                <button
                  onClick={handleChatSubmit}
                  disabled={isChatProcessing || !chatInput.trim()}
                  className={`px-4 py-2 rounded-md ${
                    isChatProcessing || !chatInput.trim()
                      ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                      : 'bg-blue-500 hover:bg-blue-600 text-white cursor-pointer'
                  }`}
                >
                  {isChatProcessing ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          )}

          <div id="annotation" className="flex flex-col justify-center p-4  text-xl">

          </div>
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 text-center p-4 bg-white/90 dark:bg-gray-900/90 border-t border-gray-200 dark:border-gray-800 backdrop-blur">
        <p className="text-sm text-gray-600 dark:text-gray-400">By oopus</p>
      </div>
      <LLMStatus status={llmStatus} error={llmError} isLoading={isProcessing} />
    </>
  );
}
