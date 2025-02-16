import type { MetaFunction } from "@remix-run/node";
import { 
  Menu, 
  FileUp,
  LayoutList,
  Wand,
  MessageCircle,
  Save,
} from "lucide-react";
import { Database } from 'limbo-wasm';


export const meta: MetaFunction = () => {
  return [
    { title: "Parassis" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

const uploadFile = async () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.md,.markdown,.db';
  input.onchange = async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      console.log('Uploading file:', file.name);
      
      if (file.name.endsWith('.db')) {
        // Handle .db file
        handleDbFile(file);
      } else {
        // Handle text files (.txt, .md, .markdown)
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
      console.log('Text file content:', content);
      // Add your text file processing logic here
    } else {
      console.error('Failed to read text file content');
    }
  };
  reader.readAsText(file);
};

export default function Index() {
  return (
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
    <div className="flex flex-row items-center justify-center p-4">
      Content
    </div>
    <div className="flex flex-row items-center justify-between p-4">
      <div className="flex space-x-4 justify-center items-center w-full">
        <div className="flex-1 py-2 px-4 text-center cursor-pointer border-r">
          &lt;&lt;&lt; Prev
        </div>
        <div className="flex-1 py-2 px-4 text-center cursor-pointer">
          Next &gt;&gt;&gt;
        </div>
      </div>
    </div>
    {/* <div className="flex flex-row items-center justify-center p-4 w-[30%] border-b self-center">
    </div> */}
    

    <div className="flex flex-row items-center p-4">
      <div className="flex items-center space-x-4">
      <div className="text-2xl font-bold">Assistant</div>
        <LayoutList size={24} />
        <Wand size={24} />
        <MessageCircle size={24} />
        
      </div>
    </div>
    <div className="flex flex-row items-center justify-center p-4">
      Anotation
    </div>
  </div>
</div>
  );
}