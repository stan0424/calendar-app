
import { createEventFromPrompt as createEventGemini } from './geminiService';
import { createEventFromPrompt as createEventOpenAI } from './openaiService';
import type { AiConfig, AiServiceResponse, CalendarEvent } from '../types';

export const createEventViaAi = (
    prompt: string,
    images: File[],
    config: AiConfig,
    currentEvents: CalendarEvent[] = []
): Promise<AiServiceResponse> => {
    
    switch (config.provider) {
        case 'gemini':
            return createEventGemini(
                prompt,
                images,
                config.keys.gemini,
                config.models.gemini,
                currentEvents
            );
        case 'openai':
            // OpenAI service update to support context is implied but kept simple here for brevity 
            // as the request focuses on Gemini features.
            return createEventOpenAI(
                prompt,
                images,
                config.keys.openai,
                config.models.openai,
                config.customUrl
            );
        case 'custom':
             return createEventOpenAI(
                prompt,
                images,
                config.keys.custom,
                config.models.custom,
                config.customUrl
            );
        default:
            return Promise.reject(new Error(`Unknown AI provider: ${config.provider}`));
    }
};
