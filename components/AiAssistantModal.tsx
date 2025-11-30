
import React, { useState, useRef, useEffect } from 'react';
import { createEventViaAi } from '../services/aiService';
import type { CalendarEvent, AiConfig, Message } from '../types';
import { ImageIcon, SendIcon, CloseIcon, BotIcon, UserIcon, MicIcon } from './icons/Icons';
import { parseModelDateTimeLocal, normalizeEventTimesFromText } from '../shared/datetime';

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEvent: (event: Omit<CalendarEvent, 'id'>) => void;
  onDeleteEvent: (id: string) => void;
  onUpdateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  events: CalendarEvent[];
  aiConfig: AiConfig;
}

// Check for SpeechRecognition API vendor prefixes
// FIX: Cast window to `any` to access non-standard SpeechRecognition properties.
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// Safe Date Parsing for Mobile Browsers (Safari)
const safeParseDate = (dateStr: string): Date => {
    if (!dateStr) return new Date();
    
    // Attempt to fix common format issues: "2024-05-20 14:00" -> "2024-05-20T14:00"
    // Safari hates spaces in ISO-like strings.
    let safeStr = dateStr;
    if (typeof dateStr === 'string' && dateStr.includes(' ') && !dateStr.includes('T')) {
        safeStr = dateStr.replace(' ', 'T');
    }
    
    const d = new Date(safeStr);
    
    // Check if invalid
    if (isNaN(d.getTime())) {
        console.error("Invalid Date parsed:", dateStr);
        // Fallback to now to prevent crash, but log error
        return new Date();
    }
    return d;
};

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({ 
    isOpen, 
    onClose, 
    onAddEvent, 
    onDeleteEvent,
    onUpdateEvent,
    events,
    aiConfig 
}) => {
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // FIX: `SpeechRecognition` is a value (variable), not a type here. Using `any` to hold the instance.
  const recognitionRef = useRef<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  useEffect(() => {
    if (!SpeechRecognition) {
      console.warn("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-TW'; // Set language to Traditional Chinese

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setPrompt(transcript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      setIsRecording(false);
    };
    
    recognition.onend = () => {
      setIsRecording(false);
    };
    
    recognitionRef.current = recognition;

    return () => {
      recognitionRef.current?.stop();
    };
  }, []);


  if (!isOpen) return null;
  
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImages(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    // Reset input value to allow selecting the same file again if needed
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
      setImages(prev => prev.filter((_, i) => i !== index));
  };
  
  const handleToggleRecording = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (isRecording) {
      recognition.stop();
    } else {
      setPrompt(''); // Clear prompt before starting new recording
      recognition.start();
      setIsRecording(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRecording) {
        recognitionRef.current?.stop();
    }

    const hasPrompt = prompt.trim().length > 0;
    const hasImages = images.length > 0;

    // Allow submit if prompt OR images exist
    if ((!hasPrompt && !hasImages) || isLoading) return;

    // If only images are provided, provide a default instruction
    const effectivePrompt = hasPrompt ? prompt : "請幫我分析這些圖片內容並建立對應的行事曆行程。";

    const userMessage: Message = { role: 'user', content: effectivePrompt };
    setMessages(prev => [...prev, userMessage]);
    
    // Capture current state before clearing
    const currentImages = [...images];

    setPrompt('');
    setImages([]);
    setIsLoading(true);

    try {
      // Pass current events for context (Read/Delete/Update)
      const response = await createEventViaAi(effectivePrompt, currentImages, aiConfig, events);
      const functionCalls = response.functionCalls;
      
      let actionTaken = false;

      if (functionCalls && functionCalls.length > 0) {
        functionCalls.forEach((call) => {
            if (call.name === 'createCalendarEvent') {
                try {
                    const eventDetails = call.args as any;
                    // Use shared normalizer to ensure identical behavior with server
                    const norm = normalizeEventTimesFromText({
                      startTime: eventDetails.startTime,
                      endTime: eventDetails.endTime,
                      allDay: eventDetails.allDay,
                    });
                    const injectMultiStops = (desc: string): string => {
                      if (!desc) return desc;
                      const lines = desc.split(/\n+/);
                      const addrToken = (s: string) => s
                        .replace(/^\s*(上車地址|下車地址)[:：]\s*/,'')
                        .trim();
                      // collect existing structured addresses
                      let pu: string[] = [];
                      let dof: string[] = [];
                      lines.forEach(l => {
                        if (/^\s*上車地址[:：]/.test(l)) {
                          const body = addrToken(l);
                          const md = [...body.matchAll(/\[([^\]]+)\]\(([^\)]+)\)/g)].map(m=>m[1].trim());
                          if (md.length) pu.push(...md);
                          else pu.push(...body.split(/[、，,；;]/).map(s=>s.trim()).filter(Boolean));
                        }
                        if (/^\s*下車地址[:：]/.test(l)) {
                          const body = addrToken(l);
                          const md = [...body.matchAll(/\[([^\]]+)\]\(([^\)]+)\)/g)].map(m=>m[1].trim());
                          if (md.length) dof.push(...md);
                          else dof.push(...body.split(/[、，,；;]/).map(s=>s.trim()).filter(Boolean));
                        }
                      });
                      // scan free text lines for extra address-like entries (common OCR format or remarks)
                      const looksLikeAddress = (s: string) => /[\u4e00-\u9fa50-9].*(路|街|大道|巷|弄|段|號|樓|館|站|機場|航廈)/.test(s) && !/api=1&query=|https?:|^www\./i.test(s);
                      const extras: string[] = [];
                      lines.forEach(l => {
                        // Arrow-style
                        const arrow = l.match(/^\s*(?:->|→)\s*(.+)$/);
                        if (arrow) {
                          const text = arrow[1].trim();
                          if (looksLikeAddress(text)) extras.push(text);
                          return;
                        }
                        // Remarks containing addresses (e.g., 其他備註：…、…)
                        if (/^\s*(其他備註|備註|Notes?)[:：]/i.test(l)) {
                          const body = l.replace(/^\s*(其他備註|備註|Notes?)[:：]/i,'').trim();
                          // extract from markdown first
                          const md = [...body.matchAll(/\[([^\]]+)\]\(([^\)]+)\)/g)].map(m=>m[1].trim());
                          md.forEach(x => { if (looksLikeAddress(x)) extras.push(x); });
                          // then split by common delimiters
                          body.split(/[、，,；;\s]+/).forEach(t => {
                            const x = t.trim();
                            if (looksLikeAddress(x)) extras.push(x);
                          });
                        }
                      });
                      // de-dup and limit
                      pu = [...new Set(pu.filter(Boolean))];
                      dof = [...new Set(dof.filter(Boolean))];
                      const extraClean = extras.filter(x => !pu.includes(x) && !dof.includes(x));
                      // if we already have at least 1 pickup/dropoff and extras exist, attach to the corresponding first line
                      const out: string[] = [];
                      for (let i=0;i<lines.length;i++){
                        const l = lines[i];
                        out.push(l);
                        if (/^\s*上車地址[:：]/.test(l) && pu.length >= 1 && extraClean.length > 0) {
                          // append as 中途接送 below the first pickup line
                          for (const ex of extraClean.slice(0,2)) {
                            out.push(`中途接送：${ex}`);
                          }
                        }
                        if (/^\s*下車地址[:：]/.test(l) && dof.length >= 1 && extraClean.length > 0) {
                          // keep conservative: do not auto-assign extras to dropoff to avoid misclassification
                        }
                      }
                      return out.join('\n');
                    };

                    const newEvent = {
                      title: eventDetails.title || 'New Event',
                      startTime: norm.start,
                      endTime: norm.end,
                      allDay: norm.allDay,
                      description: eventDetails.description || '',
                      location: eventDetails.location || '',
                    };
                    onAddEvent(newEvent);
                    actionTaken = true;
                } catch (error) {
                    console.error("Error parsing create event data:", error);
                }
            } else if (call.name === 'deleteCalendarEvent') {
                try {
                    const { id } = call.args;
                    if (id) {
                        onDeleteEvent(id);
                        actionTaken = true;
                    }
                } catch (error) {
                    console.error("Error parsing delete event data:", error);
                }
            } else if (call.name === 'updateCalendarEvent') {
                try {
                    const { id, ...updates } = call.args;
                    if (id) {
                        const parsedUpdates: any = { ...updates };
                        if (parsedUpdates.startTime || parsedUpdates.endTime || parsedUpdates.allDay !== undefined) {
                          const normU = normalizeEventTimesFromText({
                            startTime: parsedUpdates.startTime ?? updates.startTime,
                            endTime: parsedUpdates.endTime ?? updates.endTime,
                            allDay: parsedUpdates.allDay ?? updates.allDay ?? false,
                          });
                          parsedUpdates.startTime = normU.start;
                          parsedUpdates.endTime = normU.end;
                          parsedUpdates.allDay = normU.allDay;
                        } else {
                          if (parsedUpdates.startTime) parsedUpdates.startTime = parseModelDateTimeLocal(parsedUpdates.startTime) || safeParseDate(parsedUpdates.startTime);
                          if (parsedUpdates.endTime) parsedUpdates.endTime = parseModelDateTimeLocal(parsedUpdates.endTime) || safeParseDate(parsedUpdates.endTime);
                        }

                        onUpdateEvent(id, parsedUpdates);
                        actionTaken = true;
                    }
                } catch (error) {
                    console.error("Error parsing update event data:", error);
                }
            }
        });
      }

      // Add the single confirmation/response message from the model.
      if (response.text) {
        const botMessage: Message = { role: 'bot', content: response.text };
        setMessages(prev => [...prev, botMessage]);
      } else if (actionTaken) {
          // Fallback if model performs action but provides no summary text.
          const fallbackMessage = `好的，已為您更新行事曆。`;
          setMessages(prev => [...prev, { role: 'bot', content: fallbackMessage }]);
      } else {
          // No text and no action (rare)
          setMessages(prev => [...prev, { role: 'bot', content: "抱歉，我不太理解您的請求，或者找不到相關的行程。" }]);
      }

    } catch (error) {
      console.error("Error calling AI Service:", error);
      const errorMessageContent = error instanceof Error ? error.message : "抱歉，我遇到了一些問題，請稍後再試。";
      const errorMessage: Message = { role: 'bot', content: errorMessageContent };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-25 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2"><BotIcon/> AI Assistant</h2>
          <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-gray-100">
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role !== 'user' && msg.role !== 'function-result' && <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0"><BotIcon/></div>}
              {msg.role === 'user' && <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0"><UserIcon/></div>}
              
              <div className={`max-w-md p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
           {isLoading && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0"><BotIcon/></div>
                <div className="max-w-md p-3 rounded-lg bg-gray-100 text-gray-800">
                  <div className="animate-pulse flex space-x-2">
                      <div className="rounded-full bg-gray-400 h-2 w-2"></div>
                      <div className="rounded-full bg-gray-400 h-2 w-2"></div>
                      <div className="rounded-full bg-gray-400 h-2 w-2"></div>
                  </div>
                </div>
              </div>
            )}
          <div ref={messagesEndRef} />
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 bg-white">
            {images.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2 p-2 bg-gray-100 rounded-md max-h-32 overflow-y-auto">
                {images.map((img, idx) => (
                    <div key={idx} className="relative group">
                        <img src={URL.createObjectURL(img)} alt={`Preview ${idx}`} className="w-16 h-16 object-cover rounded border border-gray-300" />
                        <button 
                            type="button" 
                            onClick={() => removeImage(idx)} 
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 w-4 h-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <CloseIcon className="w-3 h-3" />
                        </button>
                    </div>
                ))}
              </div>
            )}
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="e.g., Schedule a meeting tomorrow... or Delete the meeting on Friday..."
              className="w-full p-3 pr-32 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 resize-none bg-white text-gray-900"
              rows={2}
              disabled={isLoading}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {/* Add 'multiple' attribute here */}
              <input type="file" accept="image/*" multiple ref={fileInputRef} onChange={handleImageChange} className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="p-2 rounded-full text-gray-500 hover:bg-gray-100">
                <ImageIcon />
              </button>
              <button type="button" onClick={handleToggleRecording} disabled={isLoading || !SpeechRecognition} className={`p-2 rounded-full transition-colors ${isRecording ? 'text-red-500 bg-red-100' : 'text-gray-500 hover:bg-gray-100'} disabled:text-gray-300 disabled:bg-transparent`}>
                <MicIcon />
              </button>
              <button type="submit" disabled={(!prompt.trim() && images.length === 0) || isLoading} className="p-2 rounded-full text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed">
                <SendIcon />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
