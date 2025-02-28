import type { MetaFunction } from "@remix-run/node";
import { useEffect, useState } from "react";
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
  const headingText = headings.map(h => h.content).join('\n\n');
  const finalContent = headingText ? `${headingText}\n\n${content}` : content;
  let parsedContent = await marked(finalContent);
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
        document.getElementById('annotation')!.innerHTML = summary;
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
        document.getElementById('annotation')!.innerHTML = summary;
      }
    }
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

            // Combine headings with content
            const headingText = latestHeadings.map(h => h.content).join('\n');
            let finalContent = headingText ? `${headingText}\n\n${minIdContent.content}` : minIdContent.content;
            
            console.log('final content:', finalContent);
            let parsedContent = await marked(finalContent);
            parsedContent = parsedContent.replace(/\n/g, '<br />');

            console.log('parsed content:', parsedContent);
            document.getElementById('content')!.innerHTML = parsedContent;
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
      <div className="flex h-screen justify-center">
        <div className="flex flex-col w-[80%]">
          <div className="flex flex-row items-center p-4">
            <div className="flex items-center space-x-4">
              <div className="text-2xl font-bold">Parassis Reader</div>
              <Menu size={24} className="cursor-pointer" onClick={() => console.log('Menu clicked')} />
              <FileUp size={24} className="cursor-pointer" onClick={uploadFile} />
              <Save size={24} className="cursor-pointer" onClick={() => console.log('Save clicked')} />
            </div>
          </div>
          <div id="content" className="flex flex-col items-center justify-center p-4">
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
              <LayoutList size={24} />
              <Wand size={24} />
              <MessageCircle size={24} />
              <SettingsIcon 
                size={24} 
                className="cursor-pointer hover:text-blue-500 transition-colors"
                onClick={handleSettingsClick}
              />
            </div>
          </div>
          <div id="annotation" className="flex flex-row items-center justify-center p-4">
            Annotation content
          </div>
        </div>
      </div>
      <LLMStatus status={llmStatus} error={llmError} isLoading={isProcessing} />
    </>
  );
}
