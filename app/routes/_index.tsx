import type { MetaFunction } from "@remix-run/node";
import { useEffect, useState } from "react";
import { 
  Menu, 
  FileUp,
  LayoutList,
  Wand,
  MessageCircle,
  Save,
  Settings, // Add this import
} from "lucide-react";
import Dexie from "dexie";
import { marked } from "marked";
import TokenInput from '../components/TokenInput';
import { checkLLMToken, saveLLMToken, getLLMToken } from '../utils/tokenManager';

export const meta: MetaFunction = () => {
  return [
    { title: "Parassis" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

const dbName = 'Parassis';

const initializeDb = () => {
  const db = new Dexie(dbName);
  db.version(1).stores({
    files: '++id, content, heading',
    statusName: 'name, value'  // Modified schema
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

const handlePrevContent = async () => {
  const db = initializeDb();
  const currentStatus = await db.table('statusName')
    .where('name').equals('currentPage')
    .first();
  
  if (!currentStatus) return;
  
  const currentId = parseInt(currentStatus.value);
  const prevContent = await db.table('files')
    .where('heading').equals(0)
    .and(item => item.id < currentId)
    .reverse()
    .first();

  if (prevContent) {
    await db.table('statusName')
      .where('name').equals('currentPage')
      .modify({ value: prevContent.id.toString() });
    
    const latestHeadings = await getLatestHeadings(db, prevContent.id);
    await displayContent(prevContent.content, latestHeadings);
  }
};

const handleNextContent = async () => {
  const db = initializeDb();
  const currentStatus = await db.table('statusName')
    .where('name').equals('currentPage')
    .first();
  
  if (!currentStatus) return;
  
  const currentId = parseInt(currentStatus.value);
  const nextContent = await db.table('files')
    .where('heading').equals(0)
    .and(item => item.id > currentId)
    .first();

  if (nextContent) {
    await db.table('statusName')
      .where('name').equals('currentPage')
      .modify({ value: nextContent.id.toString() });
    
    const latestHeadings = await getLatestHeadings(db, nextContent.id);
    await displayContent(nextContent.content, latestHeadings);
  }
};

const uploadFile = async () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.md,.markdown';
  input.onchange = async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      console.log('Uploading file:', file.name);
      
      if (file.name.endsWith('.db')) {
        // Handle .db file
        handleDbFile(file);
      } else {
        // Handle text file
        handleTextFile(file);
      }
    }
  };
  input.click();
};

const handleDbFile = (file: File) => {
  const reader = new FileReader();
  reader.onload = async (event) => {
    const arrayBuffer = event.target?.result as ArrayBuffer;
    if (arrayBuffer) {
      console.log('DB file content (first 50 bytes):', new Uint8Array(arrayBuffer).slice(0, 50));
      // Add your .db file processing logic here
      // For example, you might want to use SQL.js to work with the SQLite database
    } else {
      console.error('Failed to read .db file content');
    }
  };
  reader.readAsArrayBuffer(file);
};

const handleTextFile = (file: File) => {
  const reader = new FileReader();
  reader.onload = async (event) => {
    const content = event.target?.result as string;
    if (content) {
      let db: Dexie;
      Dexie.delete(dbName).then(() => {
        db = initializeDb();
        return db.open();
      }).then(() => {
        db.transaction('rw', db.table('files'), db.table('statusName'), async () => {
          console.log("Database is ready to use");
          const lines = content.split('\n');
          let currentContent = [];
          
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
                  // content: trimmedLine.replace(/^#+\s/, ''),
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
        
          let minIdContent;
          if (linesWithHeadingZero.length > 0) {
            minIdContent = linesWithHeadingZero[0]; // The first item is the one with the lowest id
            
            // Store initial page in status
            await db.table('statusName').put({
              name: 'currentPage',
              value: minIdContent.id.toString()
            });
          } else {
            console.log('No lines with heading 0 found. Using the first line instead.');
            minIdContent = await db.table('files').toCollection().first();
            if (minIdContent) {
              await db.table('statusName').put({
                name: 'currentPage',
                value: minIdContent.id.toString()
              });
            }
          }
        
          // Get all headings before this content
          const latestHeadings = await getLatestHeadings(db, minIdContent.id);

          // Combine headings with content
          const headingText = latestHeadings.map(h => h.content).join('\n');
          const finalContent = headingText ? `${headingText}\n\n${minIdContent.content}` : minIdContent.content;
          
          console.log('final content:', finalContent);
          let parsedContent = await marked(finalContent);
          parsedContent = parsedContent.replace(/\n/g, '<br />');


          console.log('parsed content:', parsedContent);
          document.getElementById('content')!.innerHTML = parsedContent;
          console.log('File processed successfully');
        }).catch(error => {
          console.error('Error processing file:', error);
        });
    }).catch((error) => {
          console.error("Error setting up the database:", error);
      });
    } else {
      console.error('Failed to read text file content');
    }
  };
  reader.readAsText(file);
};

const loadCurrentPage = async () => {
  const db = initializeDb();
  try {
    const currentStatus = await db.table('statusName')
      .where('name').equals('currentPage')
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
  }
};

export default function Index() {
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenInfo, setTokenInfo] = useState({ provider: '', token: '' });

  useEffect(() => {
    const init = async () => {
      const db = initializeDb();
      const hasToken = await checkLLMToken(db);
      if (!hasToken) {
        setShowTokenInput(true);
      }
      const info = await getLLMToken(db);
      setTokenInfo(info);
      loadCurrentPage();
    };

    init();
  }, []);

  const handleTokenSubmit = async (provider: string, token: string) => {
    const db = initializeDb();
    await saveLLMToken(db, provider, token);
    setShowTokenInput(false);
  };

  const handleSettingsClick = async () => {
    const db = initializeDb();
    const info = await getLLMToken(db);
    setTokenInfo(info);
    setShowTokenInput(true);
  };

  return (
    <>
      {showTokenInput && (
        <TokenInput 
          onSubmit={handleTokenSubmit} 
          onClose={() => setShowTokenInput(false)}
          initialProvider={tokenInfo.provider}
          initialToken={tokenInfo.token}
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
              <Settings 
                size={24} 
                className="cursor-pointer hover:text-blue-500 transition-colors"
                onClick={handleSettingsClick}
              />
            </div>
          </div>
          <div className="flex flex-row items-center justify-center p-4">
            Anotation
          </div>
        </div>
      </div>
    </>
  );
}
