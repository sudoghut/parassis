import type { MetaFunction } from "@remix-run/node";
import { 
  Menu, 
  FileUp,
  LayoutList,
  Wand,
  MessageCircle,
  Save,
} from "lucide-react";


export const meta: MetaFunction = () => {
  return [
    { title: "Parassis" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export default function Index() {
  return (
<div className="flex h-screen justify-center">
  <div className="flex flex-col w-[80%]">
    <div className="flex flex-row items-center p-4">
      <div className="flex items-center space-x-4">
      <div className="text-2xl font-bold">Parassis Reader</div>
        <Menu size={24} />
        <FileUp size={24} />
        <Save size={24} />
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