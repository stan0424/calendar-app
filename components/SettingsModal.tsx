import React, { useState, useEffect } from 'react';
import type { AiConfig, AiProvider, GeminiModel, OpenAiModel } from '../types';
import { CloseIcon } from './icons/Icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: AiConfig;
  onConfigChange: (config: AiConfig) => void;
}

// FIX: Updated to use the recommended model 'gemini-3-pro-preview'.
const geminiModels: { id: GeminiModel; name: string }[] = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
];

const openAiModels: { id: OpenAiModel; name: string }[] = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'gpt-4', name: 'GPT-4' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
];

const providers: { id: AiProvider; name: string }[] = [
    { id: 'gemini', name: 'Google Gemini' },
    { id: 'openai', name: 'OpenAI' },
    { id: 'custom', name: 'Custom (OpenAI compatible)' },
]

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentConfig, onConfigChange }) => {
  const [config, setConfig] = useState<AiConfig>(currentConfig);

  useEffect(() => {
    setConfig(currentConfig);
  }, [currentConfig, isOpen]);

  const handleSave = () => {
    onConfigChange(config);
    onClose();
  };
  
  const handleProviderChange = (provider: AiProvider) => {
    setConfig(prev => ({...prev, provider}));
  }
  
  const handleKeyChange = (provider: keyof AiConfig['keys'], value: string) => {
    setConfig(prev => ({...prev, keys: {...prev.keys, [provider]: value}}))
  }

  const handleModelChange = (provider: keyof AiConfig['models'], value: string) => {
     setConfig(prev => ({...prev, models: {...prev.models, [provider]: value}}))
  }
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-25 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg">
        <header className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">AI Settings</h2>
          <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-gray-100">
            <CloseIcon />
          </button>
        </header>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">AI Provider</label>
            <div className="flex space-x-2 rounded-lg bg-gray-100 p-1">
                {providers.map(p => (
                    <button key={p.id} onClick={() => handleProviderChange(p.id)} className={`w-full px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${config.provider === p.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:bg-white/50'}`}>
                        {p.name}
                    </button>
                ))}
            </div>
          </div>
          
          {/* Gemini Settings */}
          {config.provider === 'gemini' && (
              <div className="p-4 border rounded-lg bg-gray-50/50 space-y-4">
                <h3 className="font-semibold text-gray-800">Gemini Settings</h3>
                <div>
                  <label htmlFor="gemini-key" className="block text-sm font-medium text-gray-700">API Key</label>
                  <input type="password" id="gemini-key" value={config.keys.gemini} onChange={e => handleKeyChange('gemini', e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"/>
                </div>
                <div>
                  <label htmlFor="gemini-model" className="block text-sm font-medium text-gray-700">Model</label>
                  <select id="gemini-model" value={config.models.gemini} onChange={e => handleModelChange('gemini', e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                    {geminiModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
          )}

          {/* OpenAI Settings */}
           {config.provider === 'openai' && (
              <div className="p-4 border rounded-lg bg-gray-50/50 space-y-4">
                <h3 className="font-semibold text-gray-800">OpenAI Settings</h3>
                <div>
                  <label htmlFor="openai-key" className="block text-sm font-medium text-gray-700">API Key</label>
                  <input type="password" id="openai-key" value={config.keys.openai} onChange={e => handleKeyChange('openai', e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"/>
                </div>
                <div>
                  <label htmlFor="openai-model" className="block text-sm font-medium text-gray-700">Model</label>
                  <select id="openai-model" value={config.models.openai} onChange={e => handleModelChange('openai', e.target.value as OpenAiModel)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                    {openAiModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
          )}

          {/* Custom Settings */}
           {config.provider === 'custom' && (
              <div className="p-4 border rounded-lg bg-gray-50/50 space-y-4">
                <h3 className="font-semibold text-gray-800">Custom Settings</h3>
                <div>
                  <label htmlFor="custom-url" className="block text-sm font-medium text-gray-700">API Base URL</label>
                  <input type="text" id="custom-url" placeholder="https://api.openai.com/v1/chat/completions" value={config.customUrl} onChange={e => setConfig(prev => ({...prev, customUrl: e.target.value}))} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"/>
                </div>
                <div>
                  <label htmlFor="custom-key" className="block text-sm font-medium text-gray-700">API Key</label>
                  <input type="password" id="custom-key" value={config.keys.custom} onChange={e => handleKeyChange('custom', e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"/>
                </div>
                 <div>
                  <label htmlFor="custom-model" className="block text-sm font-medium text-gray-700">Model Name</label>
                  <input type="text" id="custom-model" placeholder="e.g., llama3-70b" value={config.models.custom} onChange={e => handleModelChange('custom', e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"/>
                </div>
              </div>
          )}
          
        </div>

        <footer className="px-6 py-4 bg-gray-50 flex justify-end rounded-b-lg">
            <button
                onClick={handleSave}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
                Save and Close
            </button>
        </footer>
      </div>
    </div>
  );
};