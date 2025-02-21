import { useState } from 'react';
import { LLMProviders } from '../config/llm';
import { X } from 'lucide-react'; // Add this import

interface TokenInputProps {
  onSubmit: (provider: string, token: string) => void;
  onClose: () => void; // Add this prop
  initialProvider?: string;
  initialToken?: string;
}

export default function TokenInput({ onSubmit, onClose, initialProvider = '', initialToken = '' }: TokenInputProps) {
  const [provider, setProvider] = useState(initialProvider);
  const [token, setToken] = useState(initialToken);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(provider, token);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 p-8 rounded-xl w-96 shadow-2xl transform transition-all relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={24} />
        </button>
        <h2 className="text-2xl font-bold mb-6 text-white">Enter LLM Token</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-2 text-gray-300">Provider</label>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setToken(''); // Clear token when provider changes
              }}
              className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              {LLMProviders.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="mb-6">
            <label className="block mb-2 text-gray-300">API Token</label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="Enter your API token"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all duration-200"
            disabled={!token}
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
