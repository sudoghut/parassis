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
  const [autoSummarizeOnPageTurn, setAutoSummarizeOnPageTurn] = useState(false);

  useEffect(() => {
    // Load initial language and auto summarize setting
    const loadSettings = async () => {
      try {
        const langRecord = await db.table('statusName')
          .where('element').equals('language')
          .first();
        if (langRecord?.value) {
          setLanguage(langRecord.value);
        }

        const autoRecord = await db.table('statusName')
          .where('element').equals('autoSummarizeOnPageTurn')
          .first();

        if (autoRecord?.value === 'true') {
          setAutoSummarizeOnPageTurn(true);
        } else if (autoRecord?.value === 'false') {
          setAutoSummarizeOnPageTurn(false);
        } else {
          // Default to false and persist if missing/invalid
          setAutoSummarizeOnPageTurn(false);
          if (!autoRecord) {
            await db.table('statusName').put({
              element: 'autoSummarizeOnPageTurn',
              value: 'false',
            });
          }
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };
    loadSettings();
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

  const handleAutoSummarizeChange = async (enabled: boolean) => {
    const value = enabled ? 'true' : 'false';
    try {
      const existing = await db.table('statusName')
        .where('element').equals('autoSummarizeOnPageTurn')
        .first();

      if (existing) {
        await db.table('statusName')
          .where('element').equals('autoSummarizeOnPageTurn')
          .modify({ value });
      } else {
        await db.table('statusName').add({
          element: 'autoSummarizeOnPageTurn',
          value,
        });
      }
    } catch (error) {
      console.error('Error updating autoSummarizeOnPageTurn:', error);
    }
    setAutoSummarizeOnPageTurn(enabled);
  };

  const handleRemoveDataAndConfiguration = async () => {
    if (confirm('Are you sure you want to remove all data and configuration? This will clear all uploaded content, settings, and API tokens. This action cannot be undone.')) {
      try {
        // Delete all IndexedDB databases
        await Dexie.delete('Parassis');
        await Dexie.delete('ParassisStatusName');

        console.log('All databases deleted successfully');
        alert('All data and configuration have been removed. The page will now reload.');
        window.location.reload();
      } catch (error) {
        console.error('Error removing data and configuration:', error);
        alert('Failed to remove data and configuration.');
      }
    }
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
          <div className="mb-4">
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
          <div className="mb-6">
            <label className="flex items-center justify-between mb-1 text-gray-300">
              <span>Auto summarize on page turn</span>
              <button
                type="button"
                onClick={() => handleAutoSummarizeChange(!autoSummarizeOnPageTurn)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoSummarizeOnPageTurn ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    autoSummarizeOnPageTurn ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
            <p className="text-xs text-gray-400">
              Automatically generate a summary and fix grammar when you move to the previous or next page.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRemoveDataAndConfiguration}
            className="w-full mb-3 bg-red-600 text-white p-3 rounded-lg hover:bg-red-700 transition-all duration-200"
          >
            Remove data and configuration
          </button>

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
