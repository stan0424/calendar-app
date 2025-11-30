// FIX: Correctly import Request and Response from firebase-functions/v2/https to resolve compilation errors.
import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { messagingApi, WebhookEvent } from "@line/bot-sdk";
import { GoogleGenAI, FunctionDeclaration, Type, Part } from "@google/genai";
import Flightaware from "flightaware";
import type { FlightRetrieveResponse as FlightRetrieveResponseType } from "flightaware/resources/flights/flights";
import { format, addMonths, isAfter, isBefore } from 'date-fns';
import { parseTransportDateTimeV2, normalizeEventTimesFromText as sharedNormalize } from '../../shared/datetime';
import type { FlightStatusPayload } from "../../shared/flightStatus";
import { Readable } from 'stream';
// FIX: Import Buffer to resolve type errors when @types/node is not available.
import { Buffer } from "buffer";
type FlightRetrieveResponse = FlightRetrieveResponseType;
type FlightRecord = FlightRetrieveResponse['flights'][number];
type FlightEndpoint = FlightRecord['destination'] | FlightRecord['origin'] | null | undefined;

// 1. Initialize Firebase Admin to access Firestore
admin.initializeApp();
const db = admin.firestore();

// 2. LINE Channel Configuration
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

const client = new messagingApi.MessagingApiClient(lineConfig);
const blobClient = new messagingApi.MessagingApiBlobClient(lineConfig);

// 3. Gemini Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const FLIGHTAWARE_API_KEY = process.env.FLIGHTAWARE_API_KEY || '';
const flightawareClient = FLIGHTAWARE_API_KEY
  ? new Flightaware({ apiKey: FLIGHTAWARE_API_KEY })
  : null;
const TAIWAN_TIMEZONE = 'Asia/Taipei';
const TAIWAN_AIRPORT_CODES = new Set([
  'TPE',
  'TSA',
  'KHH',
  'RMQ',
  'TTT',
  'HUN',
  'KNH',
  'MZG',
  'LZN',
  'GNI',
  'MFK',
  'KYD',
  'CYI',
  'TNN',
  'PIF',
  'RCTP',
  'RCSS',
  'RCKH',
  'RCMQ',
  'RCNN',
  'RCYU',
  'RCFN',
  'RCQC',
  'RCBS',
  'RCMT',
  'RCFG',
  'RCGI',
  'RCLY',
]);

// Debug controls via env
const DEBUG_REPLY = (process.env.DEBUG_REPLY || '').toLowerCase() === 'true' || process.env.DEBUG_REPLY === '1';
const DEBUG_LOG_TO_FIRESTORE = (process.env.DEBUG_LOG_TO_FIRESTORE || '1') !== '0';

function newTraceId(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `lw-${Date.now()}-${rnd}`; // lw: line webhook
}

async function writeDebugLog(traceId: string, payload: any) {
  if (!DEBUG_LOG_TO_FIRESTORE) return;
  try {
    await db.collection('logs').add({ traceId, ts: new Date(), ...payload });
  } catch (e) {
    logger.warn('Failed to write debug log', { traceId, err: String(e) });
  }
}

// --- Tool Definitions (Matching Frontend) ---

const createEventTool: FunctionDeclaration = {
  name: "createCalendarEvent",
  description: "Creates a new calendar event.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      startTime: { type: Type.STRING },
      endTime: { type: Type.STRING },
      description: { type: Type.STRING },
      location: { type: Type.STRING },
      allDay: { type: Type.BOOLEAN }
    },
    required: ["title", "startTime", "endTime", "allDay"],
  },
};

const deleteEventTool: FunctionDeclaration = {
    name: "deleteCalendarEvent",
    description: "Deletes an event by ID.",
    parameters: {
        type: Type.OBJECT,
        properties: { id: { type: Type.STRING } },
        required: ["id"],
    }
};

const updateEventTool: FunctionDeclaration = {
    name: "updateCalendarEvent",
    description: "Updates an event.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            id: { type: Type.STRING },
            title: { type: Type.STRING },
            startTime: { type: Type.STRING },
            endTime: { type: Type.STRING },
            description: { type: Type.STRING },
            location: { type: Type.STRING },
            allDay: { type: Type.BOOLEAN }
        },
        required: ["id"],
    }
};

// --- Helper Functions ---

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

function detectImageMime(buffer: Buffer): string {
    if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }
    if (
        buffer.length > 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
    ) {
        return 'image/png';
    }
    if (
        buffer.length > 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
        return 'image/webp';
    }
    return 'application/octet-stream';
}

function parseModelDateTimeLocal(value: string): Date | null {
    if (!value) return null;
    // If already ISO with timezone, let JS parse it directly
    if (/T.*[Z\+\-]\d{0,2}:?\d{0,2}$/.test(value)) {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }
    // yyyy-MM-dd HH:mm -> assume Asia/Taipei +08:00
    const m = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/);
    if (m) {
        const s = `${m[1]}T${m[2]}+08:00`;
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    // yyyy-MM-dd -> start of day +08:00
    const m2 = value.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (m2) {
        const s = `${m2[1]}T00:00+08:00`;
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

function normalizeEventTimesFromText(args: any, _userText: string): { start: Date; end: Date; allDay: boolean } {
    const allDay = !!args.allDay;
    let start = parseModelDateTimeLocal(args.startTime);
    let end = parseModelDateTimeLocal(args.endTime);

    if (!start && args.startTime) start = new Date(args.startTime);
    if (!end && args.endTime) end = new Date(args.endTime);

    // If only a date was provided and allDay is true, set start at 00:00 +08 and end = start + 1 day
    if (!start && typeof args.startTime === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.startTime)) {
        const s = parseModelDateTimeLocal(args.startTime);
        if (s) start = s;
    }

    if (!start) {
        // As a minimal fallback, use now; but do not impose 09:00 defaults
        const now = new Date();
        start = now;
    }
    if (!end) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
    }

    if (allDay) {
        // Normalize all-day to start of day +08 and end = start + 24h
        const y = start.getUTCFullYear();
        const m = start.getUTCMonth();
        const d = start.getUTCDate();
        const startUtc = Date.UTC(y, m, d, 0, 0);
        start = new Date(startUtc);
        end = new Date(startUtc + 24 * 60 * 60 * 1000);
    }

    // Ensure end after start
    if (end <= start) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
    }

    return { start, end, allDay };
}

async function getContextEvents() {
    const now = new Date();
    const pastLimit = addMonths(now, -12);
    const futureLimit = addMonths(now, 6);

    try {
        const snapshot = await db.collection('events').get();
        const events = snapshot.docs.map(doc => {
            const d = doc.data();
            const start = d.startTime?.toDate ? d.startTime.toDate() : new Date(d.startTime);
            const end = d.endTime?.toDate ? d.endTime.toDate() : new Date(d.endTime);
            
            return {
                id: doc.id,
                title: d.title,
                startTime: start,
                endTime: end,
                description: d.description,
                location: d.location
            };
        }).filter(e => isAfter(e.endTime, pastLimit) && isBefore(e.startTime, futureLimit));

        return JSON.stringify(events.map(e => ({
            id: e.id,
            title: e.title,
            start: format(e.startTime, "yyyy-MM-dd HH:mm"),
            end: format(e.endTime, "yyyy-MM-dd HH:mm"),
            description: e.description,
            location: e.location
        })));
    } catch (error) {
        logger.error("Error fetching context events:", error);
        return "[]";
    }
}

// Try to extract explicit date/time from transportation-style description
// New robust parser that understands Chinese labels and punctuation.
// Legacy parser retained for backward-compatibility (may fail due to encoding).
function parseTransportDateTime(text: string): Date | null {
    if (!text) return null;
    try {
        const dateMatch = text.match(/行程日期[:：]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
        const timeMatch = text.match(/行程時間[:：]\s*([0-2]?\d:[0-5]\d)/);
        if (!dateMatch || !timeMatch) return null;
        const y = parseInt(dateMatch[1], 10);
        const m = parseInt(dateMatch[2], 10) - 1; // JS month 0-based
        const d = parseInt(dateMatch[3], 10);
        const [hh, mm] = timeMatch[1].split(":").map(v => parseInt(v, 10));
        // Construct as +08:00 local time -> convert to UTC
        const utc = Date.UTC(y, m, d, hh - 8, mm, 0);
        return new Date(utc);
    } catch {
        return null;
    }
}

async function handleEvent(event: WebhookEvent): Promise<null> {
    const traceId = newTraceId();
    if (event.type !== 'message' || (event.message.type !== 'text' && event.message.type !== 'image')) {
        return Promise.resolve(null);
    }

    const replyToken = event.replyToken;

    try {
        const userParts: Part[] = [];
        let imageInfo: { mime?: string; bytes?: number } | undefined;
        
        const isImage = event.message.type === 'image'; if (event.message.type === 'text') { userParts.push({ text: (event.message as any).text });
        } else if (event.message.type === 'image') {
            const stream = await blobClient.getMessageContent(event.message.id);
            const buffer = await streamToBuffer(stream);
            const base64Image = buffer.toString('base64');
            const mimeType = detectImageMime(buffer);
            imageInfo = { mime: mimeType, bytes: buffer.length };
            
            userParts.push({ 
                inlineData: { 
                    mimeType: mimeType, 
                    data: base64Image 
                } 
            });
            userParts.push({ text: "請解析這張圖片中的行程資訊，並建立或更新行事曆事件。若圖片包含日期與時間，請轉換為事件；若只有日期則建立整天行程；時區以台灣 UTC+8 為準。" });
        }

        // Ensure the model has an explicit instruction when handling images
        userParts.push({ text: isImage ? "若上方包含圖片，請從圖片擷取行程資訊並建立或更新行事曆事件。" : "" });
        const eventsContext = isImage ? "[]" : await getContextEvents();
        const now = new Date();
        const pastLimit = addMonths(now, -12);
        const futureLimit = addMonths(now, 6);

        const SYSTEM_INSTRUCTION = `You are an intelligent calendar assistant. Your primary function is to help the user manage their calendar in Traditional Chinese (Taiwan).
- The current date is ${format(new Date(), 'yyyy-MM-dd')}. ALL date calculations MUST use this as the reference.
- User Location/Timezone: Taiwan (UTC+8).

**Capabilities**
- You can create, delete, and update calendar events using the provided tools.
- You can also answer questions about the user's schedule by reading the provided context.

**[Current Schedule Context]**
(Showing events from ${format(pastLimit, 'yyyy-MM-dd')} to ${format(futureLimit, 'yyyy-MM-dd')})
${eventsContext}
**(End of Context)**

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
- **Date & Time Parsing:**
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
        
        // Log input summary for debugging image/text handling
        logger.info("LINE input prepared", {
            type: event.message.type,
            textLen: (event.message as any).text ? (event.message as any).text.length : undefined,
            image: imageInfo,
            partsCount: userParts.length,
        });
        async function generateWithFallback() {
            let lastErr: any = null;
            const models = [
                'gemini-1.5-flash',
                'gemini-2.0-flash',
                'gemini-2.5-flash',
                'gemini-3-pro-preview',
            ];
            for (const m of models) {
                for (let i = 0; i < 2; i++) {
                    try {
                        logger.info('Calling Gemini', { model: m, attempt: i + 1 });
                        return await genAI.models.generateContent({
                            model: m,
                            contents: [{ parts: userParts }],
                            config: {
                                systemInstruction: SYSTEM_INSTRUCTION,
                                tools: [{ functionDeclarations: [createEventTool, deleteEventTool, updateEventTool] }]
                            }
                        });
                    } catch (e: any) {
                        const status = e?.error?.status || e?.response?.status;
                        logger.warn('Gemini call failed', { model: m, attempt: i + 1, status });
                        lastErr = e;
                        if (status !== 'UNAVAILABLE' && status !== 503) break;
                        await new Promise(res => setTimeout(res, 600 * (i + 1)));
                    }
                }
            }
            throw lastErr;
        }

        const response = await generateWithFallback();

        const fc = response.functionCalls;
        const replyText = response.text;
        let actionResultText = "";

        try {
            const calls = (fc || []).map(c => ({
                name: c.name,
                argsPreview: JSON.stringify(c.args).slice(0, 400)
            }));
            logger.info("Gemini response summary", { traceId, textLen: replyText?.length || 0, functionCalls: calls });
            await writeDebugLog(traceId, { level: 'info', phase: 'gemini', calls, replyTextLen: replyText?.length || 0 });
        } catch (logErr) {
            logger.warn("Failed to log Gemini response", { traceId, err: logErr as any });
        }

        if (fc && fc.length > 0) {
            for (const call of fc) {
                if (call.name === 'createCalendarEvent') {
                    const args = call.args as any;
                    let __norm = sharedNormalize(args);
                    // If description contains explicit transport date/time (e.g., 行程日期/行程時間), prefer it
                    const dt = parseTransportDateTimeV2(args.description || '') || parseTransportDateTime(args.description || '');
                    if (dt) {
                        const end = new Date(dt.getTime() + 60 * 60 * 1000);
                        __norm = { start: dt, end, allDay: false };
                    }
                    // Ensure all-day events use local midnight boundaries
                    if (args.allDay) {
                        const yy = __norm.start.getFullYear();
                        const mm = __norm.start.getMonth();
                        const dd = __norm.start.getDate();
                        const startLocal = new Date(yy, mm, dd, 0, 0, 0, 0);
                        __norm.start = startLocal;
                        __norm.end = new Date(startLocal.getTime() + 24 * 60 * 60 * 1000);
                        __norm.allDay = true;
                    }
                    await db.collection('events').add({
                        title: args.title,
                        startTime: __norm.start,
                        endTime: __norm.end,
                        description: args.description || '',
                        location: args.location || '',
                        allDay: args.allDay || false
                    });
                    if (!replyText) actionResultText = "已建立行程。";
                } else if (call.name === 'deleteCalendarEvent') {
                    const args = call.args as any;
                    if (args.id) {
                        await db.collection('events').doc(args.id).delete();
                        if (!replyText) actionResultText = "已建立行程。";
                    }
                } else if (call.name === 'updateCalendarEvent') {
                     const { id, ...updates } = call.args as any;
                     if (id) {
                        const parsedUpdates: any = { ...updates };
                        if (parsedUpdates.startTime || parsedUpdates.endTime || parsedUpdates.allDay !== undefined) {
                            let __norm = sharedNormalize({
                                startTime: parsedUpdates.startTime ?? updates.startTime,
                                endTime: parsedUpdates.endTime ?? updates.endTime,
                                allDay: parsedUpdates.allDay ?? updates.allDay ?? false,
                            });
                            // Prefer explicit transport date/time if present in description updates
                            const dt2 = parseTransportDateTimeV2(parsedUpdates.description || updates.description || '') || parseTransportDateTime(parsedUpdates.description || updates.description || '');
                            if (dt2) {
                                const end2 = new Date(dt2.getTime() + 60 * 60 * 1000);
                                __norm = { start: dt2, end: end2, allDay: false };
                            }
                            if (parsedUpdates.allDay ?? updates.allDay) {
                                const yy = __norm.start.getFullYear();
                                const mm = __norm.start.getMonth();
                                const dd = __norm.start.getDate();
                                const startLocal = new Date(yy, mm, dd, 0, 0, 0, 0);
                                __norm.start = startLocal;
                                __norm.end = new Date(startLocal.getTime() + 24 * 60 * 60 * 1000);
                                __norm.allDay = true;
                            }
                            parsedUpdates.startTime = __norm.start;
                            parsedUpdates.endTime = __norm.end;
                            parsedUpdates.allDay = __norm.allDay;
                        } else {
                            if (parsedUpdates.startTime) parsedUpdates.startTime = new Date(parsedUpdates.startTime);
                            if (parsedUpdates.endTime) parsedUpdates.endTime = new Date(parsedUpdates.endTime);
                        }
                        await db.collection('events').doc(id).update(parsedUpdates);
                        if (!replyText) actionResultText = "已建立行程。";
                     }
                }
            }
        }

        let finalReply = replyText || actionResultText || "��p�A���٤��ӽT�w�A���ݨD�A�ЦA�����@���C";
        if (DEBUG_REPLY) finalReply += `\n[ref:${traceId}]`;
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: finalReply }]
        });

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error("Error processing LINE event", { traceId, err: errMsg });
        try { await writeDebugLog(traceId, { level: 'error', phase: 'handleEvent', error: errMsg }); } catch {}
        try {
            await client.replyMessage({
                replyToken: replyToken,
                messages: [{ type: 'text', text: "系統發生錯誤，請稍後再試。" }]
            });
        } catch (e) {
            console.error("Failed to send error reply", e);
        }
    }
    return Promise.resolve(null);
}

export const lineWebhook = onRequest(
    { 
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET", "GEMINI_API_KEY"],
        invoker: "public"
    },
    async (request: Request, response: Response) => {
        if (request.method !== "POST") {
            response.status(405).send("Method Not Allowed");
            return;
        }

        const events = request.body.events as WebhookEvent[];
        if (!events || events.length === 0) {
             response.status(200).send("No events");
             return;
        }

        await Promise.all(events.map((event) => handleEvent(event)));
        
        response.status(200).json({ status: "success" });
    }
);

function isTaiwanAirport(code?: string | null): boolean {
    if (!code) return false;
    return TAIWAN_AIRPORT_CODES.has(code.toUpperCase());
}

function pickFirstNonNull<T>(...values: Array<T | null | undefined | ''>): T | null {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '') {
            return value as T;
        }
    }
    return null;
}

function parseDate(iso?: string | null): Date | null {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateKey(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function isoStringToDateKey(iso?: string | null, timeZone: string = TAIWAN_TIMEZONE): string | null {
    const d = parseDate(iso);
    if (!d) return null;
    return formatDateKey(d, timeZone);
}

function toEndpointInfo(airport: FlightEndpoint): FlightStatusPayload['origin'] {
    if (!airport) {
        return {
            code: null,
            alternateCode: null,
            airportName: null,
            city: null,
            terminal: null,
            gate: null,
            timezone: null,
        };
    }
    return {
        code: airport.code || airport.code_iata || airport.code_icao || null,
        alternateCode: airport.code_iata || airport.code_icao || airport.code_lid || null,
        airportName: airport.name ?? null,
        city: airport.city ?? null,
        terminal: null,
        gate: null,
        timezone: airport.timezone ?? null,
    };
}

function computeDurationMinutes(depIso?: string | null, arrIso?: string | null): number | null {
    const dep = parseDate(depIso);
    const arr = parseDate(arrIso);
    if (!dep || !arr) return null;
    const diff = Math.round((arr.getTime() - dep.getTime()) / 60000);
    return Number.isFinite(diff) && diff > 0 ? diff : null;
}

function isTaiwanArrival(flight: FlightRecord): boolean {
    const dest = flight.destination;
    if (!dest) return false;
    return (
        isTaiwanAirport(dest.code) ||
        isTaiwanAirport(dest.code_iata) ||
        isTaiwanAirport(dest.code_icao) ||
        isTaiwanAirport(dest.code_lid)
    );
}

function mapFlightToStatus(flight: FlightRecord): FlightStatusPayload {
    const estDep = pickFirstNonNull(
        flight.actual_out,
        flight.estimated_out,
        flight.actual_off,
        flight.estimated_off,
        flight.scheduled_out,
        flight.scheduled_off,
    );
    const estArr = pickFirstNonNull(
        flight.actual_in,
        flight.estimated_in,
        flight.actual_on,
        flight.estimated_on,
        flight.scheduled_in,
        flight.scheduled_on,
    );

    return {
        ident: flight.ident,
        operator: flight.operator,
        flightNumber: flight.ident_iata || flight.ident_icao || flight.ident,
        status: flight.status,
        statusText: flight.status,
        origin: toEndpointInfo(flight.origin),
        destination: toEndpointInfo(flight.destination),
        scheduledDeparture: pickFirstNonNull(flight.scheduled_out, flight.scheduled_off),
        estimatedDeparture: estDep,
        scheduledArrival: pickFirstNonNull(flight.scheduled_in, flight.scheduled_on),
        estimatedArrival: estArr,
        actualArrival: pickFirstNonNull(flight.actual_in, flight.actual_on),
        gateDeparture: flight.gate_origin,
        gateArrival: flight.gate_destination,
        terminalDeparture: flight.terminal_origin,
        terminalArrival: flight.terminal_destination,
        baggage: flight.baggage_claim,
        durationMinutes: computeDurationMinutes(estDep, estArr),
        arrivalDelayMinutes:
            typeof flight.arrival_delay === 'number' ? Math.round(flight.arrival_delay / 60) : null,
        trackingUrl: `https://flightaware.com/live/flight/${encodeURIComponent(flight.ident)}`,
        provider: 'flightaware',
        fetchedAt: new Date().toISOString(),
    };
}

async function queryFlightAwareStatus(ident: string, eventDate: Date): Promise<FlightStatusPayload | null> {
    if (!flightawareClient) return null;
    const windowStart = new Date(eventDate.getTime() - 18 * 60 * 60 * 1000);
    const windowEnd = new Date(eventDate.getTime() + 18 * 60 * 60 * 1000);
    const response = await flightawareClient.flights.retrieve(ident, {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
        max_pages: 1,
    });
    const flights: FlightRecord[] = response?.flights || [];
    if (!flights.length) return null;

    const targetKey = formatDateKey(eventDate, TAIWAN_TIMEZONE);

    const matches = flights
        .filter(isTaiwanArrival)
        .map(flight => {
            const arrivalIso = pickFirstNonNull(
                flight.actual_in,
                flight.estimated_in,
                flight.actual_on,
                flight.estimated_on,
                flight.scheduled_in,
                flight.scheduled_on,
            );
            const key = isoStringToDateKey(arrivalIso, TAIWAN_TIMEZONE);
            const ts = parseDate(arrivalIso)?.getTime() ?? null;
            return { flight, key, ts };
        })
        .filter(item => item.key === targetKey);

    if (!matches.length) return null;

    matches.sort((a, b) => {
        const aDiff = a.ts == null ? Number.MAX_SAFE_INTEGER : Math.abs(a.ts - eventDate.getTime());
        const bDiff = b.ts == null ? Number.MAX_SAFE_INTEGER : Math.abs(b.ts - eventDate.getTime());
        return aDiff - bDiff;
    });

    return mapFlightToStatus(matches[0].flight);
}

function applyCorsHeaders(response: Response) {
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    response.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
}

export const flightAwareStatus = onRequest(
    {
        secrets: ["FLIGHTAWARE_API_KEY"],
        invoker: "public"
    },
    async (request: Request, response: Response) => {
        applyCorsHeaders(response);
        if (request.method === "OPTIONS") {
            response.status(204).send("");
            return;
        }
        if (request.method !== "GET") {
            response.status(405).json({ error: "Method Not Allowed" });
            return;
        }
        const flightParam = request.query.flight ?? request.query.ident ?? request.query.f;
        const rawFlight = Array.isArray(flightParam) ? flightParam[0] : flightParam;
        const flight = (rawFlight ? String(rawFlight) : "").replace(/\s+/g, "").toUpperCase();
        if (!flight) {
            response.status(400).json({ error: "Missing flight parameter" });
            return;
        }
        const rawDate = Array.isArray(request.query.date) ? request.query.date[0] : request.query.date;
        const dateValue = rawDate ? String(rawDate) : "";
        const eventDate = dateValue ? new Date(dateValue) : null;
        if (!eventDate || Number.isNaN(eventDate.getTime())) {
            response.status(400).json({ error: "Invalid date parameter" });
            return;
        }
        if (!flightawareClient) {
            response.status(503).json({ error: "FlightAware API key is not configured" });
            return;
        }
        try {
            const status = await queryFlightAwareStatus(flight, eventDate);
            if (!status) {
                response.status(404).json({ error: "No Taiwan arrival found for that date" });
                return;
            }
            response.status(200).json({ flight: status });
        } catch (err) {
            logger.error("FlightAware lookup failed", {
                ident: flight,
                err: err instanceof Error ? err.message : String(err),
            });
            response.status(502).json({ error: "FlightAware lookup failed" });
        }
    }
);


















