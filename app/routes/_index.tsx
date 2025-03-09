import type { MetaFunction } from "@remix-run/node";
import { useEffect, useState, useRef } from "react";
import { 
  Menu, 
  FileUp,
  LayoutList,
  Wand,
  MessageCircle,
  Save,
  Settings as SettingsIcon,
} from "lucide-react";
import Dexie from "dexie";
import { marked } from "marked";
import Settings from '../components/Settings';
import { LLMStatus } from '../components/LLMStatus';
import { checkLLMToken, saveLLMToken, getLLMToken } from '../utils/tokenManager';
import { generateThreadSummary } from '../utils/summarizer';

export const meta: MetaFunction = () => {
  return [
    { title: "Parassis" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

const dbName = 'Parassis';
const statusDbName = 'ParassisStatusName';

const initializeStatusDb = () => {
  const db = new Dexie(statusDbName);
  db.version(1).stores({
    statusName: 'element, value'  // Schema for storing settings and values
  }).upgrade(tx => {
    // Ensure we have a default language setting
    return tx.table('statusName').put({
      element: 'language',
      value: 'English'  // Default to English name instead of code
    });
  });
  return db;
};

const initializeDb = () => {
  const db = new Dexie(dbName);
  db.version(1).stores({
    files: '++id, content, heading'
  });
  return db;
};

const getLatestHeadings = async (db: Dexie, beforeId: number) => {
  const headings = await db.table('files')
    .where('id').below(beforeId)
    .and(item => item.heading > 0)
    .sortBy('id');

  return headings.reduce((acc: any[], curr) => {
    const existingIndex = acc.findIndex(h => h.heading === curr.heading);
    if (existingIndex >= 0) {
      acc[existingIndex] = curr;
    } else {
      acc.push(curr);
    }
    return acc;
  }, []).sort((a, b) => a.heading - b.heading);
};

const displayContent = async (content: string, headings: any[]) => {
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
    const db = initializeDb();
    const statusDb = initializeStatusDb();
    try {
      const currentStatus = await statusDb.table('statusName')
        .where('element').equals('currentPage')
        .first();
      
      if (!currentStatus) return;

      const currentId = parseInt(currentStatus.value);
      const currentContent = await db.table('files')
        .where('id').equals(currentId)
        .first();

      if (currentContent) {
        const latestHeadings = await getLatestHeadings(db, currentId);
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
  const [headings, setHeadings] = useState<any[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  const formatMarkedContent = (markedContent: string): string => {
    let formatted = markedContent;
    formatted = formatted.replace(/<\/ul>/g, '</ul><br />');
    formatted = formatted.replace(/(<\/?h\d>)/g, '$1<br />');
    return formatted;
  };

  const handlePrevContent = async () => {
    const db = initializeDb();
    const statusDb = initializeStatusDb();
    const currentStatus = await statusDb.table('statusName')
      .where('element').equals('currentPage')
      .first();
    
    if (!currentStatus) return;
    
    const currentId = parseInt(currentStatus.value);
    const prevContent = await db.table('files')
      .where('heading').equals(0)
      .and(item => item.id < currentId)
      .reverse()
      .first();

    if (prevContent) {
      await statusDb.table('statusName')
      .where('element').equals('currentPage')
        .modify({ value: prevContent.id.toString() });
      
      const latestHeadings = await getLatestHeadings(db, prevContent.id);
      await displayContent(prevContent.content, latestHeadings);

      setIsProcessing(true);
      // Clear annotation before generating
      document.getElementById('annotation')!.innerHTML = '';
      // Generate and display thread summary
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
        document.getElementById('annotation')!.innerHTML = markedSummary;
      }
    }
  };

  const handleNextContent = async () => {
    const db = initializeDb();
      const statusDb = initializeStatusDb();
      const currentStatus = await statusDb.table('statusName')
      .where('element').equals('currentPage')
      .first();
    
    if (!currentStatus) return;
    
    const currentId = parseInt(currentStatus.value);
    const nextContent = await db.table('files')
      .where('heading').equals(0)
      .and(item => item.id > currentId)
      .first();

    if (nextContent) {
      const statusDb = initializeStatusDb();
      await statusDb.table('statusName')
        .where('element').equals('currentPage')
        .modify({ value: nextContent.id.toString() });
      
      const latestHeadings = await getLatestHeadings(db, nextContent.id);
      await displayContent(nextContent.content, latestHeadings);

      setIsProcessing(true);
      // Clear annotation before generating
      document.getElementById('annotation')!.innerHTML = '';
      // Generate and display thread summary
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
        document.getElementById('annotation')!.innerHTML = markedSummary;
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

  // Load all headings when menu is opened
  const loadHeadings = async () => {
    const db = initializeDb();
    try {
      const allHeadings = await db.table('files')
        .where('heading')
        .above(0)
        .sortBy('id');
      setHeadings(allHeadings);
    } catch (error) {
      console.error('Error loading headings:', error);
    }
  };

  const handleHeadingClick = async (headingId: number) => {
    const db = initializeDb();
    const statusDb = initializeStatusDb();
    
    try {
      // Find the next content after this heading
      const nextContent = await db.table('files')
        .where('id')
        .aboveOrEqual(headingId)
        .and(item => item.heading === 0)
        .first();

      if (nextContent) {
        await statusDb.table('statusName')
          .where('element')
          .equals('currentPage')
          .modify({ value: nextContent.id.toString() });
        
        const latestHeadings = await getLatestHeadings(db, nextContent.id);
        await displayContent(nextContent.content, latestHeadings);
      }
    } catch (error) {
      console.error('Error navigating to heading:', error);
    }
    
    setShowHeadingsMenu(false);
  };

  const handleTextFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        const db = initializeDb();
        try {
          await db.open();
          document.getElementById('annotation')!.innerHTML = '';
          // Delete and recreate Parassis database
          await Dexie.delete(dbName);
          const newDb = initializeDb();
          await newDb.open();
          
          await newDb.transaction('rw', newDb.table('files'), async () => {
            console.log("Database is ready to use");
            const lines = content.split('\n');
            let currentContent = [];
            
            const saveContent = async (content: string[], heading: number = 0) => {
              if (content.length > 0) {
                await newDb.table('files').add({
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
                  await newDb.table('files').add({
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
            const linesWithHeadingZero = await newDb.table('files')
              .where('heading').equals(0)
              .sortBy('id');
          
            let minIdContent;
            if (linesWithHeadingZero.length > 0) {
              minIdContent = linesWithHeadingZero[0]; // The first item is the one with the lowest id
              
              // Store initial page in status
              const statusDb = initializeStatusDb();
                const minId = await newDb.table('files')
                .where('heading').equals(0)
                .first()
                .then(item => item?.id || 1);
                
                await statusDb.table('statusName').put({
                element: 'currentPage',
                value: minId.toString()
                });
            } else {
              console.log('No lines with heading 0 found. Using the first line instead.');
              minIdContent = await newDb.table('files').toCollection().first();
              if (minIdContent) {
                const statusDb = initializeStatusDb();
                await statusDb.table('statusName').put({
                element: 'currentPage',
                value: '1'
                });
              }
            }
          
            // Get all headings before this content
            const latestHeadings = await getLatestHeadings(newDb, minIdContent.id);
            await displayContent(minIdContent.content, latestHeadings);
            console.log('File processed successfully');
            
            // Reload current page to ensure proper initialization
            loadCurrentPage();
          }).catch(error => {
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
      const db = initializeDb();
      const statusDb = initializeStatusDb();
      try {
        await db.open();
        await statusDb.open();
      } catch (error: unknown) {
        console.error('Error opening database:', error);
        // Only delete and reinitialize if there's a version/schema error
        if (error instanceof Error && error.name === 'VersionError') {
          await Dexie.delete(dbName);
          await Dexie.delete(statusDbName);
          const newDb = initializeDb();
          const newStatusDb = initializeStatusDb();
          await newDb.open();
          await newStatusDb.open();
        }
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
    const statusDb = initializeStatusDb();
    await saveLLMToken(statusDb, provider, token, language);
    setShowTokenInput(false);
    setTokenInfo({ provider, token, language });
  };

  const handleSettingsClick = async () => {
    const statusDb = initializeStatusDb();
    const info = await getLLMToken(statusDb);
    setTokenInfo(info);
    setShowTokenInput(true);
  };

  const handleGenerateThreadSummary = async () => {
    const db = initializeDb();
    const statusDb = initializeStatusDb();
    const currentStatus = await statusDb.table('statusName')
      .where('element').equals('currentPage')
      .first();
    
    // if (!currentStatus) return;
    
    const currentId = parseInt(currentStatus.value);
    setIsProcessing(true);
    document.getElementById('annotation')!.innerHTML = '';
    
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
      document.getElementById('annotation')!.innerHTML = markedSummary;
    } else {
      console.log('No summary generated');
    }
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
          db={initializeStatusDb()}
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
                        onClick={() => handleHeadingClick(heading.id)}
                      >
                        {heading.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <FileUp size={24} className="cursor-pointer" onClick={uploadFile} />
              <Save size={24} className="cursor-pointer" onClick={() => console.log('Save clicked')} />
            </div>
          </div>
          <div id="content" className="flex flex-col justify-center p-4 text-xl">
            Content
          </div>
          <div className="flex flex-row items-center justify-between p-4">
            <div className="flex space-x-4 justify-center items-center w-full">
              <div 
                className="flex-1 py-2 px-4 text-center cursor-pointer border-r"
                onClick={handlePrevContent}
              >
                &lt;&lt;&lt; Prev
              </div>
              <div 
                className="flex-1 py-2 px-4 text-center cursor-pointer"
                onClick={handleNextContent}
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
                className="cursor-pointer hover:text-blue-500 transition-colors"
                onClick={handleGenerateThreadSummary}
              />
              <Wand size={24} />
              <MessageCircle size={24} />
              <SettingsIcon 
                size={24} 
                className="cursor-pointer hover:text-blue-500 transition-colors"
                onClick={handleSettingsClick}
              />
            </div>
          </div>
          <div id="annotation" className="flex flex-col justify-center p-4  text-xl">
            Annotation content
          </div>
        </div>
      </div>
      <LLMStatus status={llmStatus} error={llmError} isLoading={isProcessing} />
    </>
  );
}
