
export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  description?: string;
  location?: string;
}

export type ViewOption = 'Day' | '3-Day' | 'Week' | 'Month' | 'Schedule';

// FIX: Updated to use the recommended model for complex text tasks.
export type GeminiModel = 'gemini-3-pro-preview' | 'gemini-2.5-flash';
export type OpenAiModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gpt-4' | 'gpt-3.5-turbo';
export type AiProvider = 'gemini' | 'openai' | 'custom';

export interface AiConfig {
  provider: AiProvider;
  keys: {
    gemini: string;
    openai: string;
    custom: string;
  };
  models: {
    gemini: GeminiModel;
    openai: OpenAiModel;
    custom: string;
  };
  customUrl: string;
}

export interface Message {
  role: 'user' | 'bot' | 'function-call' | 'function-result';
  content: string | any; // 'any' for function call args
}

export interface AiServiceResponse {
    text: string | null;
    functionCalls: {
        name: string;
        args: any;
    }[] | null;
}