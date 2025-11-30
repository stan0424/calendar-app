
import React, { useState, useEffect, useMemo } from 'react';
import { format, differenceInMinutes } from 'date-fns';
import { CloseIcon, CalendarIcon, SendIcon } from './icons/Icons';
import type { CalendarEvent } from '../types';
import { fetchFlightAwareStatus, FlightAwareStatus } from '../services/flightStatus';

interface EventDetailModalProps {
  event: CalendarEvent;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<CalendarEvent>) => void;
}

const DEFAULT_TAIWAN_TZ = 'Asia/Taipei';

const formatFlightDateParts = (iso?: string | null, tz?: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const zone = tz || DEFAULT_TAIWAN_TZ;
  const dateLabel = new Intl.DateTimeFormat('zh-TW', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: zone,
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat('zh-TW', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: zone,
  }).format(date);
  return { dateLabel, timeLabel };
};

const formatDurationText = (minutes?: number | null) => {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hourText = h > 0 ? `${h}小時` : '';
  const minuteText = `${m}分鐘`;
  return `${hourText}${minuteText}`;
};

// Helper component to parse text and auto-link Markdown links, URLs, and Phone numbers
const TextWithSmartLinks: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;

  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  const phoneRegex =
    /((?:\+|00)\d{1,3}[-\s]?\d{1,4}[-\s]?\d{3,4}[-\s]?\d{3,4}|\b09\d{2}(?:-?\d{3}-?\d{3}|\d{6})\b|\b0\d{1,2}-?\d{3,4}-?\d{4}\b|\b8869\d{7,8}\b)/g;
  const addressLabelRegex =
    /^\s*(上車地址|下車地址|中途停靠|集合地點|集合地址|司機地址|乘客地址|終點地址|起點地址|地址|地點)[:：]\s*(.+)$/i;
  const phoneLabelRegex =
    /^\s*((?:聯絡|乘客|司機|客服|報到)?(?:電話|tel|phone)|聯絡電話|Contact|TEL)[:：]\s*(.+)$/i;

  const normalizePhoneNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const hasPlus = trimmed.startsWith('+');
    let digitsOnly = trimmed.replace(/[^\d]/g, '');
    if (!digitsOnly) return null;
    if (hasPlus) {
      return `+${digitsOnly}`;
    }
    if (digitsOnly.startsWith('00') && digitsOnly.length > 2) {
      return `+${digitsOnly.slice(2)}`;
    }
    if (digitsOnly.startsWith('886')) {
      return `+${digitsOnly}`;
    }
    return digitsOnly;
  };

  const renderAddressLine = (label: string, body: string, key: React.Key) => {
    const addresses = body
      .split(/[、，,；;\/]/)
      .map(s => s.trim())
      .filter(Boolean);
    if (addresses.length === 0) {
      return (
        <p key={key}>
          {label}：—
        </p>
      );
    }
    return (
      <p key={key}>
        {label}：
        {addresses.map((addr, idx) => {
          const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
          return (
            <React.Fragment key={`${key}-${idx}`}>
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {addr}
              </a>
              {idx < addresses.length - 1 ? '、' : null}
            </React.Fragment>
          );
        })}
      </p>
    );
  };

  const renderPhoneLine = (label: string, body: string, key: React.Key) => {
    const numbers = body
      .split(/[、，,；;\/]/)
      .map(s => s.trim())
      .filter(Boolean);
    if (!numbers.length) {
      return (
        <p key={key}>
          {label}：—
        </p>
      );
    }
    return (
      <p key={key}>
        {label}：
        {numbers.map((num, idx) => {
          const normalized = normalizePhoneNumber(num);
          const content = normalized ? (
            <a href={`tel:${normalized}`} className="text-blue-600 hover:underline">
              {num}
            </a>
          ) : (
            num
          );
          return (
            <React.Fragment key={`${key}-ph-${idx}`}>
              {content}
              {idx < numbers.length - 1 ? '、' : null}
            </React.Fragment>
          );
        })}
      </p>
    );
  };

  return (
    <>
      {text.split('\n').map((line, lineIndex) => {
        const trimmedLine = line.trim();
        const addressMatch = trimmedLine.match(addressLabelRegex);
        if (addressMatch) {
          return renderAddressLine(addressMatch[1], addressMatch[2], `addr-${lineIndex}`);
        }
        const phoneMatch = trimmedLine.match(phoneLabelRegex);
        if (phoneMatch) {
          return renderPhoneLine(phoneMatch[1], phoneMatch[2], `phone-${lineIndex}`);
        }
        const mdParts = line.split(markdownLinkRegex);
        return (
          <React.Fragment key={lineIndex}>
            {mdParts.map((mdPart, mdIndex) => {
               if (mdIndex % 3 === 1) return null;
               if (mdIndex % 3 === 2) {
                   const label = mdParts[mdIndex - 1];
                   return (
                       <a key={`md-${mdIndex}`} href={mdPart} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                           {label}
                       </a>
                   );
               }
               const urlParts = mdPart.split(urlRegex);
               return (
                   <React.Fragment key={`text-${mdIndex}`}>
                       {urlParts.map((urlPart, urlIndex) => {
                           if (urlIndex % 2 === 1) {
                               return (
                                   <a key={`url-${urlIndex}`} href={urlPart} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                                       {urlPart}
                                   </a>
                               );
                           }
                           const phoneParts = urlPart.split(phoneRegex);
                           return (
                               <React.Fragment key={`inner-${urlIndex}`}>
                                   {phoneParts.map((phonePart, phoneIndex) => {
                                       if (phoneIndex % 2 === 1) {
                                           const normalized = normalizePhoneNumber(phonePart);
                                           if (normalized && normalized.replace(/[^\d]/g, '').length >= 6) {
                                               return (
                                                   <a key={`phone-${phoneIndex}`} href={`tel:${normalized}`} className="text-blue-600 hover:underline">
                                                       {phonePart}
                                                   </a>
                                               );
                                           }
                                           return phonePart;
                                       }
                                       return phonePart;
                                   })}
                               </React.Fragment>
                           );
                       })}
                   </React.Fragment>
               );
            })}
            {lineIndex < text.split('\n').length - 1 && <br />}
          </React.Fragment>
        );
      })}
    </>
  );
};

export const EventDetailModal: React.FC<EventDetailModalProps> = ({ event, onClose, onDelete, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [start, setStart] = useState(format(event.startTime, "yyyy-MM-dd'T'HH:mm"));
  const [end, setEnd] = useState(format(event.endTime, "yyyy-MM-dd'T'HH:mm"));
  const [description, setDescription] = useState(event.description || '');
  const [location, setLocation] = useState(event.location || '');
  const [allDay, setAllDay] = useState(event.allDay);
  const [flightStatus, setFlightStatus] = useState<FlightAwareStatus | null>(null);
  const [flightStatusLoading, setFlightStatusLoading] = useState(false);
  const [flightStatusError, setFlightStatusError] = useState<string | null>(null);

  // Derived: flight info + multi-pickup
  const TPE_TERMINAL_BY_AIRLINE: Record<string, 'T1' | 'T2'> = {
    CI: 'T1', BR: 'T2', JX: 'T1', IT: 'T1', MM: 'T1', TR: 'T1', CX: 'T1', JL: 'T2', NH: 'T2', KE: 'T2', OZ: 'T2', SQ: 'T1', UA: 'T2', DL: 'T2', AA: 'T2'
  };

  const flightInfo = useMemo(() => {
    const text = `${event.title}\n${event.description || ''}`;
    const m = text.match(/\b([A-Z]{2})[ -]?(\d{2,4})\b/i);
    const flightNo = m ? `${m[1].toUpperCase()}${m[2]}` : null;
    const isPickup = /接機|入境|arrival/i.test(text);
    const isDropoff = /送機|出境|depart/i.test(text);
    const airline = flightNo ? flightNo.slice(0, 2) : null;
    const airportIsTPE = /桃園機場|TPE|Taoyuan/i.test(text);
    const terminal = airline && airportIsTPE ? (TPE_TERMINAL_BY_AIRLINE[airline] || null) : null;
    return { flightNo, kind: isPickup ? 'arr' : (isDropoff ? 'dep' : null), terminal } as { flightNo: string | null; kind: 'arr'|'dep'|null; terminal: 'T1'|'T2'|null };
  }, [event]);

  const countdownText = useMemo(() => {
    if (flightInfo.kind !== 'arr') return null;
    const now = new Date();
    const diffMs = new Date(start).getTime() - now.getTime();
    const sign = diffMs >= 0 ? 1 : -1;
    const mins = Math.floor(Math.abs(diffMs) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return sign > 0 ? `距離抵達 ${h} 小時 ${m} 分` : `已超過 ${h} 小時 ${m} 分`;
  }, [flightInfo, start]);

  const variflightHref = useMemo(() => {
    if (!flightInfo.flightNo) return null as string | null;
    // Use search endpoint for better availability; many devices still deep-link to app.
    return `https://m.variflight.com/search?key=${flightInfo.flightNo}`;
  }, [flightInfo]);

  useEffect(() => {
    let cancelled = false;
    if (!flightInfo.flightNo || flightInfo.kind !== 'arr') {
      setFlightStatus(null);
      setFlightStatusError(null);
      setFlightStatusLoading(false);
      return;
    }

    setFlightStatus(null);
    setFlightStatusError(null);
    setFlightStatusLoading(true);

    fetchFlightAwareStatus(flightInfo.flightNo, event.startTime)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setFlightStatus(data);
          setFlightStatusError(null);
        } else {
          setFlightStatus(null);
          setFlightStatusError('找不到 FlightAware 航班資料');
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setFlightStatus(null);
        setFlightStatusError(err?.message || '無法取得 FlightAware 資料');
      })
      .finally(() => {
        if (!cancelled) setFlightStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [event.id, event.startTime.getTime(), flightInfo.flightNo, flightInfo.kind]);

  const displayFlightNo = flightStatus?.flightNumber || flightInfo.flightNo;
  const arrivalTerminalText = useMemo(() => {
    const terminal = flightStatus?.terminalArrival || flightInfo.terminal;
    if (!terminal) return null;
    const normalized = terminal.toString().toUpperCase();
    if (normalized === 'T1' || normalized === '1') return '第一航廈';
    if (normalized === 'T2' || normalized === '2') return '第二航廈';
    return terminal;
  }, [flightInfo.terminal, flightStatus?.terminalArrival]);

  const flightDurationDisplay = useMemo(() => {
    if (!flightStatus) return null;
    const depIso = flightStatus.estimatedDeparture || flightStatus.scheduledDeparture;
    const arrIso = flightStatus.estimatedArrival || flightStatus.scheduledArrival;
    if (depIso && arrIso) {
      const dep = new Date(depIso);
      const arr = new Date(arrIso);
      if (!Number.isNaN(dep.getTime()) && !Number.isNaN(arr.getTime())) {
        const diff = differenceInMinutes(arr, dep);
        if (Number.isFinite(diff) && diff > 0) {
          return formatDurationText(diff);
        }
      }
    }
    return formatDurationText(flightStatus.durationMinutes);
  }, [flightStatus]);

  const arrivalDelayText = useMemo(() => {
    if (!flightStatus || flightStatus.arrivalDelayMinutes == null) return null;
    if (flightStatus.arrivalDelayMinutes === 0) return '準時';
    const mins = Math.abs(flightStatus.arrivalDelayMinutes);
    return flightStatus.arrivalDelayMinutes > 0 ? `延誤 ${mins} 分鐘` : `提前 ${mins} 分鐘`;
  }, [flightStatus]);

  const departureTimeParts = useMemo(() => {
    if (!flightStatus) return null;
    return formatFlightDateParts(
      flightStatus.estimatedDeparture || flightStatus.scheduledDeparture,
      flightStatus.origin?.timezone || undefined,
    );
  }, [flightStatus]);

  const arrivalTimeParts = useMemo(() => {
    if (!flightStatus) return null;
    return formatFlightDateParts(
      flightStatus.estimatedArrival || flightStatus.scheduledArrival,
      flightStatus.destination?.timezone || DEFAULT_TAIWAN_TZ,
    );
  }, [flightStatus]);

  const originCode = flightStatus?.origin?.code || flightStatus?.origin?.alternateCode || '—';
  const destinationCode =
    flightStatus?.destination?.code || flightStatus?.destination?.alternateCode || 'TPE';
  const providerDisplay =
    flightStatus?.provider?.toLowerCase() === 'flightaware'
      ? 'FlightAware'
      : flightStatus?.provider || '航班資訊';

  const pickupAddresses = useMemo(() => {
    const text = event.description || '';
    const lines = text.split(/\n+/).filter(l => /上車地址/.test(l));
    if (lines.length === 0) return [] as string[];
    const items: string[] = [];
    for (const rawLine of lines) {
      const body = rawLine.replace(/^.*?上車地址[:：]?\s*/, '').trim();
      const mdMatches = [...body.matchAll(/\[([^\]]+)\]\(([^\)]+)\)/g)];
      if (mdMatches.length > 0) {
        mdMatches.forEach(m => items.push(m[1].trim()));
      } else {
        body.split(/[、，,；;]/).map(s => s.trim()).filter(Boolean).forEach(s => items.push(s));
      }
    }
    // Filter obvious noise
    const cleaned = items.filter(s => !/^https?:/i.test(s) && !/^www\./i.test(s) && s.toLowerCase() !== 'search' && !/api=1&query=/i.test(s));
    return [...new Set(cleaned)].slice(0, 3);
  }, [event.description]);

  const dropoffAddresses = useMemo(() => {
    const text = event.description || '';
    const lines = text.split(/\n+/).filter(l => /下車地址/.test(l));
    if (lines.length === 0) return [] as string[];
    const items: string[] = [];
    for (const rawLine of lines) {
      const body = rawLine.replace(/^.*?下車地址[:：]?\s*/, '').trim();
      const mdMatches = [...body.matchAll(/\[([^\]]+)\]\(([^\)]+)\)/g)];
      if (mdMatches.length > 0) {
        mdMatches.forEach(m => items.push(m[1].trim()));
      } else {
        body.split(/[、，,；;]/).map(s => s.trim()).filter(Boolean).forEach(s => items.push(s));
      }
    }
    const cleaned = items.filter(s => !/^https?:/i.test(s) && !/^www\./i.test(s) && s.toLowerCase() !== 'search' && !/api=1&query=/i.test(s));
    return [...new Set(cleaned)].slice(0, 3);
  }, [event.description]);

  const midStops = useMemo(() => {
    const desc = event.description || '';
    if (!desc) return [] as string[];
    const looksLikeAddress = (s: string) =>
      /[\u4e00-\u9fa50-9].*(路|街|大道|段|巷|弄|號|樓|館|站|機場|航廈|里|社區|園區)/.test(s) &&
      !/api=1&query=|https?:|^www\./i.test(s);
    const normalize = (s: string) => {
      const md = s.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      return (md ? md[1] : s).trim();
    };

    const blockList = new Set<string>([
      ...(pickupAddresses || []),
      ...(dropoffAddresses || []),
    ]);

    const candidates: string[] = [];
    const lines = desc.split(/\n+/);
    const keywordRegex = /(第一站|第二站|第三站|先到|再到|途經|經停|途中|轉送|接續|→|->)/;
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const arrow = trimmed.match(/^(?:[-*●・\d\.]+\s*)?(?:→|->)\s*(.+)$/);
      if (arrow) {
        const val = normalize(arrow[1]);
        if (looksLikeAddress(val) && !blockList.has(val)) candidates.push(val);
        return;
      }
      if (keywordRegex.test(trimmed)) {
        const parts = trimmed.split(/[，,、\/;]/);
        parts.forEach(part => {
          const val = normalize(part.replace(/^(?:第一站|第二站|第三站|先到|再到|途經|經停|途中|轉送|接續)[:：\s-]*/,''));
          if (looksLikeAddress(val) && !blockList.has(val)) candidates.push(val);
        });
      }
      if (/^\s*(其他備註|備註|Notes?)[:：]/i.test(trimmed)) {
        const body = trimmed.replace(/^\s*(其他備註|備註|Notes?)[:：]/i,'').trim();
        const mdMatches = [...body.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(m => m[1].trim());
        mdMatches.forEach(v => { if (looksLikeAddress(v) && !blockList.has(v)) candidates.push(v); });
        body.split(/[，,、\/;]/).forEach(part => {
          const val = normalize(part);
          if (looksLikeAddress(val) && !blockList.has(val)) candidates.push(val);
        });
      }
    });

    return [...new Set(candidates)].slice(0, 3);
  }, [event.description, pickupAddresses, dropoffAddresses]);

  const descriptionWithMidStops = useMemo(() => {
    const raw = event.description || '';
    const lines = raw ? raw.split(/\n+/) : [];
    const hasManualMidLine = lines.some(line => /^\s*中途停靠[:：]/.test(line));
    if (hasManualMidLine) {
      return raw;
    }

    const ensureAfter = (idx: number) => {
      if (idx === -1) return -1;
      if (lines[idx + 1] && lines[idx + 1].startsWith('中途停靠：')) {
        return idx + 1;
      }
      lines.splice(idx + 1, 0, '中途停靠：');
      return idx + 1;
    };

    const pickupIdx = lines.findIndex(l => /^\s*上車地址[:：]/.test(l));
    let dropoffIdx = lines.findIndex(l => /^\s*下車地址[:：]/.test(l));
    let midAfterPickupIdx = -1;
    let midAfterDropoffIdx = -1;

    lines.forEach((line, idx) => {
      if (/^\s*中途停靠[:：]/.test(line)) {
        if (pickupIdx !== -1 && idx === pickupIdx + 1 && midAfterPickupIdx === -1) {
          midAfterPickupIdx = idx;
        } else if (dropoffIdx !== -1 && idx === dropoffIdx + 1 && midAfterDropoffIdx === -1) {
          midAfterDropoffIdx = idx;
        }
      }
    });

    if (pickupIdx !== -1 && midAfterPickupIdx === -1) {
      midAfterPickupIdx = ensureAfter(pickupIdx);
      if (dropoffIdx !== -1 && dropoffIdx >= midAfterPickupIdx) {
        // Adjust dropoff index since we inserted a line
        for (let i = 0; i < lines.length; i++) {
          if (/^\s*下車地址[:：]/.test(lines[i])) {
            dropoffIdx = i;
            break;
          }
        }
      }
      if (midAfterDropoffIdx !== -1 && midAfterDropoffIdx >= midAfterPickupIdx) {
        midAfterDropoffIdx += 1;
      }
    }
    if (dropoffIdx !== -1 && midAfterDropoffIdx === -1) {
      midAfterDropoffIdx = ensureAfter(dropoffIdx);
    }
    if (pickupIdx === -1 && dropoffIdx === -1 && midAfterPickupIdx === -1 && midAfterDropoffIdx === -1) {
      lines.push('中途停靠：');
      midAfterPickupIdx = lines.length - 1;
    }

    const midText = midStops.length > 0 ? `中途停靠：${midStops.join('、')}` : '中途停靠：';
    if (midAfterPickupIdx !== -1) lines[midAfterPickupIdx] = midText;
    if (midAfterDropoffIdx !== -1) lines[midAfterDropoffIdx] = midText;
    if (midAfterPickupIdx === -1 && midAfterDropoffIdx === -1) lines.push(midText);

    return lines.join('\n');
  }, [event.description, midStops]);

  const augmentedDescription = useMemo(() => {
    const desc = event.description || '';
    const lines = desc.split(/\n+/);
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      out.push(line);
      if (/^\s*上車地址[:：]/.test(line) && pickupAddresses.length > 1) {
        for (let j = 1; j < Math.min(pickupAddresses.length, 3); j++) {
          out.push(`上車地址${j + 1}：${pickupAddresses[j]}`);
        }
      }
      if (/^\s*下車地址[:：]/.test(line) && dropoffAddresses.length > 1) {
        for (let j = 1; j < Math.min(dropoffAddresses.length, 3); j++) {
          out.push(`下車地址${j + 1}：${dropoffAddresses[j]}`);
        }
      }
    }
    return out.join('\n');
  }, [event.description, pickupAddresses, dropoffAddresses]);

  useEffect(() => {
    setTitle(event.title);
    setStart(format(event.startTime, "yyyy-MM-dd'T'HH:mm"));
    setEnd(format(event.endTime, "yyyy-MM-dd'T'HH:mm"));
    setDescription(descriptionWithMidStops || '');
    setLocation(event.location || '');
    setAllDay(event.allDay);
    setIsEditing(false); // Reset editing mode when event changes
  }, [event, descriptionWithMidStops]);

  const handleSave = () => {
    onUpdate(event.id, {
        title,
        startTime: new Date(start),
        endTime: new Date(end),
        description,
        location,
        allDay
    });
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with color strip */}
        <div className="bg-blue-600 h-3 w-full flex-shrink-0"></div>
        
        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex justify-between items-start mb-4">
            {isEditing ? (
                 <input 
                    type="text" 
                    value={title} 
                    onChange={e => setTitle(e.target.value)}
                    className="text-2xl font-semibold text-gray-800 leading-tight w-full border-b border-gray-300 focus:outline-none focus:border-blue-500"
                 />
            ) : (
                <h2 className="text-2xl font-semibold text-gray-800 leading-tight select-text">{event.title}</h2>
            )}
            <button 
              onClick={onClose} 
              className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="space-y-4">
            {(displayFlightNo || arrivalTerminalText || countdownText) && !isEditing && (
              <div className="space-y-2">
                <div className="flex items-start gap-3 text-gray-700 bg-blue-50 rounded p-3">
                  <div className="mt-0.5 text-blue-600">✈️</div>
                  <div className="flex-1 text-sm space-y-1">
                    {displayFlightNo && (
                      <p>
                        航班：
                        {variflightHref ? (
                          <a
                            href={variflightHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {displayFlightNo}
                          </a>
                        ) : (
                          <span className="font-medium">{displayFlightNo}</span>
                        )}
                        {flightInfo.kind === 'arr' ? '（入境）' : flightInfo.kind === 'dep' ? '（出境）' : ''}
                      </p>
                    )}
                    {arrivalTerminalText && <p>桃園機場航廈：{arrivalTerminalText}</p>}
                    {countdownText && <p>{countdownText}（以行程時間估算）</p>}
                  </div>
                </div>
                {flightStatusLoading && (
                  <p className="pl-9 text-xs text-gray-500">正在取得 FlightAware 即時航班資訊…</p>
                )}
                {flightStatusError && (
                  <p className="pl-9 text-xs text-red-500">{flightStatusError}</p>
                )}
                {flightStatus && (
                  <div className="bg-[#0d1117] text-white rounded-xl p-4 shadow-lg border border-gray-900">
                    <div className="flex justify-between text-xs uppercase tracking-wide text-gray-400">
                      <span>{providerDisplay}</span>
                      <span className="text-right text-blue-200">
                        {flightStatus.statusText || flightStatus.status}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3 items-center">
                      <div>
                        <p className="text-xs text-gray-400">
                          {departureTimeParts?.dateLabel || '出發時間未定'}
                        </p>
                        <p className="text-2xl font-semibold tracking-wide">
                          {departureTimeParts?.timeLabel || '—'}
                        </p>
                        <p className="text-sm mt-1 font-medium">{originCode}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {flightStatus.origin?.city || flightStatus.origin?.airportName || ''}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          登機門 {flightStatus.gateDeparture || '—'} · 航廈{' '}
                          {flightStatus.terminalDeparture || '—'}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400">航程</p>
                        <p className="text-sm text-gray-100">{flightDurationDisplay || '—'}</p>
                        {arrivalDelayText && (
                          <p className="text-xs mt-1 text-amber-300">{arrivalDelayText}</p>
                        )}
                        <p className="text-lg font-semibold text-gray-200 mt-3">
                          {originCode} → {destinationCode}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">
                          {arrivalTimeParts?.dateLabel || '抵達時間未定'}
                        </p>
                        <p className="text-2xl font-semibold tracking-wide">
                          {arrivalTimeParts?.timeLabel || '—'}
                        </p>
                        <p className="text-sm mt-1 font-medium">{destinationCode}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {flightStatus.destination?.city || flightStatus.destination?.airportName || ''}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          行李 {flightStatus.baggage || '—'} · 航廈{' '}
                          {flightStatus.terminalArrival || '—'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 text-xs text-right text-blue-200">
                      {flightStatus.trackingUrl ? (
                        <a
                          href={flightStatus.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          在 FlightAware 查看完整航班
                        </a>
                      ) : (
                        <span>{providerDisplay}</span>
                      )}
                      <span className="ml-2 text-[10px] text-gray-500">
                        更新時間{' '}
                        {formatFlightDateParts(flightStatus.fetchedAt, DEFAULT_TAIWAN_TZ)?.timeLabel || ''}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Time */}
            <div className="flex items-start gap-3 text-gray-700">
              <div className="mt-0.5 text-blue-600">
                <CalendarIcon />
              </div>
              <div className="flex-1">
                {isEditing ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-gray-500 w-10">Start</label>
                            <input 
                                type="datetime-local" 
                                value={start} 
                                onChange={e => setStart(e.target.value)}
                                className="text-sm border rounded p-1"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                             <label className="text-xs font-bold text-gray-500 w-10">End</label>
                            <input 
                                type="datetime-local" 
                                value={end} 
                                onChange={e => setEnd(e.target.value)}
                                className="text-sm border rounded p-1"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                             <input 
                                type="checkbox" 
                                id="allDay"
                                checked={allDay} 
                                onChange={e => setAllDay(e.target.checked)}
                            />
                             <label htmlFor="allDay" className="text-sm">All Day</label>
                        </div>
                    </div>
                ) : (
                    <>
                        <p className="font-medium text-base select-text">
                        {format(event.startTime, 'EEEE, MMMM d')}
                        </p>
                        <p className="text-sm text-gray-600 mt-0.5 select-text">
                        {event.allDay 
                            ? 'All day' 
                            : `${format(event.startTime, 'HH:mm')} – ${format(event.endTime, 'HH:mm')}`
                        }
                        </p>
                    </>
                )}
              </div>
            </div>

            {/* Location */}
            {(isEditing || event.location) && (
              <div className="flex items-start gap-3 text-gray-700">
                <div className="mt-0.5 w-6 flex justify-center text-gray-400">
                  <span>📍</span>
                </div>
                 {isEditing ? (
                    <input 
                        type="text" 
                        value={location} 
                        onChange={e => setLocation(e.target.value)}
                        placeholder="Location"
                        className="text-sm w-full border-b border-gray-300 focus:outline-none focus:border-blue-500"
                    />
                 ) : (
                    <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline hover:text-blue-800 cursor-pointer select-text"
                    title="Open in Google Maps"
                    >
                    {event.location}
                    </a>
                 )}
              </div>
            )}


            {/* Removed extra address blocks here per user request; will append in description section */}

            {/* Description */}

            {(isEditing || event.description) && (
              <div className="flex items-start gap-3 text-gray-700">
                <div className="mt-0.5 w-6 flex justify-center text-gray-400">
                  <span>📝</span>
                </div>
                 {isEditing ? (
                    <textarea 
                        value={description} 
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Description"
                        rows={5}
                        className="text-sm w-full border border-gray-300 rounded p-2 focus:outline-none focus:border-blue-500 resize-none"
                    />
                 ) : (
                    <p className="text-sm whitespace-pre-wrap select-text w-full">
                        <TextWithSmartLinks text={descriptionWithMidStops} />
                    </p>
                 )}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between gap-3 border-t border-gray-100 flex-shrink-0">
          <div>
            {!isEditing && (
                <button
                    onClick={() => {
                        onDelete(event.id);
                        onClose();
                    }}
                    className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition"
                >
                    Delete
                </button>
            )}
          </div>
          
          <div className="flex gap-2">
            {isEditing ? (
                 <>
                    <button
                        onClick={() => setIsEditing(false)}
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-md transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition flex items-center gap-1"
                    >
                        <SendIcon /> Save
                    </button>
                 </>
            ) : (
                 <>
                    <button
                        onClick={() => setIsEditing(true)}
                        className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md transition"
                    >
                        Edit
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition border border-gray-300"
                    >
                        Close
                    </button>
                 </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

