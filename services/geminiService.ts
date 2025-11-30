
import { GoogleGenAI, FunctionDeclaration, Type, GenerateContentResponse, Part, FunctionCall } from "@google/genai";
import { format, addMonths, isAfter, isBefore } from 'date-fns';
import type { GeminiModel, AiServiceResponse, CalendarEvent } from '../types';

const createEventFunctionDeclaration: FunctionDeclaration = {
  name: "createCalendarEvent",
  description: "Creates a new calendar event with specified details.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: "The title of the event.",
      },
      startTime: {
        type: Type.STRING,
        description: "The start time of the event in strict ISO 8601 format (e.g., '2024-08-15T14:00:00'). MUST use 'T' as separator.",
      },
      endTime: {
        type: Type.STRING,
        description: "The end time of the event in strict ISO 8601 format (e.g., '2024-08-15T15:00:00'). MUST use 'T' as separator.",
      },
      description: {
        type: Type.STRING,
        description: "A brief description of the event. If the event is related to transportation or bookings, you must follow the specific template provided in the system instructions.",
      },
      location: {
        type: Type.STRING,
        description: "The location of the event.",
      },
      allDay: {
          type: Type.BOOLEAN,
          description: "Whether the event lasts for the entire day. This MUST be true if the user specifies a date but no time."
      }
    },
    required: ["title", "startTime", "endTime", "allDay"],
  },
};

const deleteEventFunctionDeclaration: FunctionDeclaration = {
    name: "deleteCalendarEvent",
    description: "Deletes an existing calendar event by its ID.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            id: {
                type: Type.STRING,
                description: "The unique identifier (ID) of the event to delete. You must find this ID in the provided current schedule context.",
            }
        },
        required: ["id"],
    }
};

const updateEventFunctionDeclaration: FunctionDeclaration = {
    name: "updateCalendarEvent",
    description: "Updates an existing calendar event. Only provide fields that need to be changed.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            id: {
                type: Type.STRING,
                description: "The unique identifier (ID) of the event to update.",
            },
            title: { type: Type.STRING },
            startTime: { type: Type.STRING },
            endTime: { type: Type.STRING },
            description: { type: Type.STRING },
            location: { type: Type.STRING },
            allDay: { type: Type.BOOLEAN }
        },
        required: ["id"],
    }
}

const fileToGenerativePart = async (file: File): Promise<Part> => {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
};

const normalizeResponse = (response: GenerateContentResponse): AiServiceResponse => {
    const functionCalls = response.functionCalls;
    const normalizedCalls = functionCalls ? functionCalls.map((call: FunctionCall) => ({
        name: call.name || "unknown",
        args: call.args,
    })) : null;
    
    return {
        text: response.text ?? null,
        functionCalls: normalizedCalls,
    };
};

export const createEventFromPrompt = async (
    prompt: string, 
    images: File[], 
    apiKey: string,
    model: GeminiModel,
    currentEvents: CalendarEvent[] = []
): Promise<AiServiceResponse> => {
  if (!apiKey) {
    throw new Error("Gemini API key not provided");
  }

  const ai = new GoogleGenAI({ apiKey });

  const now = new Date();
  const pastLimit = addMonths(now, -12);
  const futureLimit = addMonths(now, 6);

  const relevantEvents = currentEvents.filter(e => 
    isAfter(e.endTime, pastLimit) && isBefore(e.startTime, futureLimit)
  );

  // Formatting context with 'T' separator to encourage AI to follow ISO format
  const simplifiedEvents = relevantEvents.map(e => ({
      id: e.id,
      title: e.title,
      start: format(e.startTime, "yyyy-MM-dd'T'HH:mm:ss"), 
      end: format(e.endTime, "yyyy-MM-dd'T'HH:mm:ss"),
      location: e.location,
      description: e.description 
  }));

  const eventsContext = JSON.stringify(simplifiedEvents);

  const parts: Part[] = [{ text: prompt }];

  if (images && images.length > 0) {
    const imageParts = await Promise.all(images.map(fileToGenerativePart));
    parts.unshift(...imageParts);
  }

  const systemInstruction = `You are an intelligent calendar assistant. Your primary function is to help the user manage their calendar in Traditional Chinese (Taiwan).
- The current date is ${format(new Date(), 'yyyy-MM-dd')}. ALL date calculations MUST use this as the reference.
- User Location/Timezone: Taiwan (UTC+8).

**Capabilities**
- You can create, delete, and update calendar events using the provided tools.
- You can also answer questions about the user's schedule by reading the provided context.

**[Current Schedule Context]**
(Showing events from ${format(pastLimit, 'yyyy-MM-dd')} to ${format(futureLimit, 'yyyy-MM-dd')})
${eventsContext}
**(End of Context)**

  - **Multiple Points:** If there are multiple pickup or drop-off points, list them on their respective lines separated by the Chinese delimiter '、', e.g., '上車地址：A、B' and '下車地址：C、D'.
  - **Do NOT drop any stops:** If the source contains arrows or sequence markers such as '→', '->', '第一站', '第二站', '先到', '再到', you MUST convert them into explicit extra lines right below the first address, named '中途接送：XXX' (use multiple lines if needed).
  - When both a Maps link and plain address exist, keep the plain address text (the link may be kept in Markdown). Never replace the second address with a generic word like 'search'.
  - Do NOT move extra stops to any generic note field ('備註', 'notes', '其他備註'). They MUST appear as explicit lines immediately under the first address.
  - Always keep the original '上車地址：' and '下車地址：' lines.
---
**CORE LOGIC: CATEGORIZATION FIRST**

Your most important task is to FIRST categorize the user's request into one of two types:
1.  **Transportation/Booking**: The request is explicitly about airport transfers, car services, or involves a formal booking document/image.
2.  **General Event**: Everything else. This includes meetings, appointments, reminders, birthdays, etc.

Based on the category, you MUST follow the corresponding rules below.

---
**A. Rules for "General Event"**

This is your default mode.
- **Goal**: Quickly and simply create events based on user input.
- **Title**: Use the user's own words for the title (e.g., if user says "明天下午3點跟客戶開會", the title is "跟客戶開會").
- **Description/Location**: Leave these fields BLANK unless the user explicitly provides details for them. DO NOT invent information.
- **Date & Time Parsing (CRITICAL):**
  - Use **strict ISO 8601 format** for all date strings: \`YYYY-MM-DDTHH:MM:SS\`. 
  - **You MUST use 'T' as the separator between date and time.** (e.g., \`2024-05-20T14:30:00\`). DO NOT use a space.
  - '今天' (today): Current date.
  - '明天' (tomorrow): +1 day.
  - '下週一' (next Monday): Upcoming Monday.
  - If a user mentions a date without a time (e.g., "11月30號繳電話費"), you MUST create an **All-Day** event by setting \`allDay: true\`.
  - If a user specifies a time, create a timed event. The default duration is 1 hour if not specified.
- **Past Events (History Recording):** You are ALLOWED to create events in the past. If the user specifies a past date, create it on that exact past date.
- **Recurring Events**: If the user asks for a recurring event (e.g., "Weekly meeting on Fridays"), you MUST generate multiple separate \`createCalendarEvent\` function calls for the next **8 weeks**.

---
**B. Rules for "Transportation/Booking"**

ONLY apply these rules if you categorized the request as this type.
- **Goal**: Extract details with high precision and format them strictly.
- **Title Formatting (CRITICAL):**
  1. If Pickup is an Airport: Title MUST be: **接機->[Drop-off Address]** (e.g., "接機->台北市信義區市府路45號")
  2. If Drop-off is an Airport: Title MUST be: **送機->[Pickup Address]** (e.g., "送機->新莊區復興二段167之1號")
  3. The address part in the title must be concise.
- **Description Formatting (CRITICAL):**
  You MUST format the \`description\` field using the exact template below, filling in all available information.
  行程日期：
  行程時間：
  航班編號：
  乘客姓名：
  乘客電話：
  上車地址：
  下車地址：
  乘客人數：
  行李數量：
  行程費用：
  其他備註：
- **Formatting Details:**
  - **Addresses:** Format '上車地址' and '下車地址' as a Markdown link to Google Maps Search: \`[Address Text](https://www.google.com/maps/search/?api=1&query=EncodedAddress)\`
  - **Phone Numbers:** Ensure '乘客電話' is formatted clearly.

---
**General Action Logic & Response Style**
- To **delete** or **modify** an event, scan the [Current Schedule] for a matching title or time, extract its 'id', and call the correct tool.
- If a request is ambiguous, ask the user to clarify.
- After executing a tool, provide a short, natural confirmation in Traditional Chinese (e.g., "好的，已為您安排行程。" or "已為您更新行事曆。").
- If the user provides **multiple images**, analyze EACH image, categorize it, and generate a separate \`createCalendarEvent\` call for EACH distinct event found.
`;

  const response = await ai.models.generateContent({
    model: model,
    contents: [{ parts }],
    config: {
      systemInstruction: systemInstruction,
      tools: [{ functionDeclarations: [createEventFunctionDeclaration, deleteEventFunctionDeclaration, updateEventFunctionDeclaration] }],
    },
  });

  return normalizeResponse(response);
};
