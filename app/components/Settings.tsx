import { useEffect, useState } from 'react';
import { LLMProviders } from '../config/llm';
import { X } from 'lucide-react';
import Dexie from 'dexie';

interface SettingsProps {
  onSubmit: (provider: string, token: string, language: string) => void;
  onClose: () => void;
  initialProvider?: string;
  initialToken?: string;
  initialLanguage?: string;
  db: Dexie;
}

const LANGUAGES = [
    { code: 'de', name: 'Deutsch' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'it', name: 'Italiano' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
    { code: 'pt', name: 'Português' },
    { code: 'ru', name: 'Русский' },
    { code: 'zh', name: '中文' },
];

export default function Settings({ onSubmit, onClose, initialProvider = '', initialToken = '', initialLanguage = '中文', db }: SettingsProps) {
  const [provider, setProvider] = useState(initialProvider);
  const [token, setToken] = useState(initialToken);
  const [language, setLanguage] = useState(initialLanguage);

  useEffect(() => {
    // Load initial language setting
    const loadLanguage = async () => {
      try {
        const record = await db.table('statusName')
          .where('element').equals('language')
          .first();
        if (record?.value) {
          setLanguage(record.value);
        }
      } catch (error) {
        console.error('Error loading language setting:', error);
      }
    };
    loadLanguage();
  }, [db]);

  const handleLanguageChange = async (newLanguage: string) => {
    try {
      await db.table('statusName')
        .where('element').equals('language')
        .modify({ value: newLanguage });
    } catch (error) {
      console.error('Error updating language:', error);
      // If record doesn't exist, create it
      try {
        await db.table('statusName').add({
          element: 'language',
          value: newLanguage
        });
      } catch (addError) {
        console.error('Error creating language record:', addError);
      }
    }
    setLanguage(newLanguage);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(provider, token, language);
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
        <h2 className="text-2xl font-bold mb-6 text-white">Settings</h2>
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
          <div className="mb-4">
            <label className="block mb-2 text-gray-300">API Token</label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="Enter your API token"
            />
          </div>
          <div className="mb-6">
            <label className="block mb-2 text-gray-300">Language</label>
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.name}>
                  {lang.name}
                </option>
              ))}
            </select>
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
