
import React, { useMemo, useRef, useEffect } from 'react';
import { format, endOfMonth, isBefore } from 'date-fns';
import type { CalendarEvent } from '../types';

function startOfMonth(date: Date): Date {
  const newDate = new Date(date);
  newDate.setDate(1);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
}

function startOfDay(date: Date): Date {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
}

interface ScheduleViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({ currentDate, events, onEventClick }) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const todayRef = useRef<HTMLDivElement>(null);
  const todayKey = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    // Use a small timeout to ensure the DOM is painted before scrolling
    const timer = setTimeout(() => {
      if (todayRef.current) {
        todayRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [currentDate]); // Rerun when the month changes

  const groupedEvents = useMemo(() => {
    const eventsInMonth = events.filter(e => e.startTime >= monthStart && e.startTime <= monthEnd);
    
    return eventsInMonth.reduce((acc, event) => {
      const dayKey = format(event.startTime, 'yyyy-MM-dd');
      if (!acc[dayKey]) {
        acc[dayKey] = [];
      }
      acc[dayKey].push(event);
      return acc;
    }, {} as Record<string, CalendarEvent[]>);
  }, [events, monthStart, monthEnd]);

  const sortedGroupKeys = Object.keys(groupedEvents).sort();
  const now = useMemo(() => new Date(), []);
  const todayStart = useMemo(() => startOfDay(now), [now]);

  // Helper to filter description for preview
  const getPreviewDescription = (desc?: string) => {
    if (!desc) return null;
    return desc.split('\n')
        .filter(line => {
             const l = line.trim();
             // Filter out Date, Time, and Addresses as requested to show only Passenger info/Flight info
             return !l.startsWith('行程日期') && 
                    !l.startsWith('行程時間') &&
                    !l.startsWith('上車地址') && 
                    !l.startsWith('下車地址') &&
                    l.length > 0;
        })
        .join('\n');
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">{format(currentDate, 'MMMM yyyy')}</h2>
      {sortedGroupKeys.length > 0 ? (
        sortedGroupKeys.map(dayKey => {
          const day = new Date(dayKey + 'T00:00:00'); // Ensure correct date object
          const dayEvents = groupedEvents[dayKey].sort((a,b) => {
             if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
             return a.startTime.getTime() - b.startTime.getTime();
          });
          const isToday = dayKey === todayKey;

          return (
            <div key={dayKey} ref={isToday ? todayRef : null} className="flex mb-6 scroll-mt-4">
              <div className="w-20 md:w-24 flex-shrink-0 text-right pr-4">
                <div className={`text-3xl font-light ${isToday ? 'text-blue-600' : 'text-gray-800'}`}>{format(day, 'd')}</div>
                <div className={`text-sm ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>{format(day, 'EEE')}</div>
              </div>
              <div className="flex-1 border-l border-gray-300 pl-4">
                {dayEvents.map(event => {
                  const dayOfEvent = startOfDay(event.startTime);
                  const isPast = event.allDay 
                      ? isBefore(dayOfEvent, todayStart)
                      : isBefore(event.endTime, now);

                  const previewDesc = getPreviewDescription(event.description);

                  return (
                    <div key={event.id} className="flex gap-4 mb-3 group">
                        {/* Time Column */}
                        <div className={`w-12 text-right pt-1 flex-shrink-0 ${isPast ? 'text-gray-400' : 'text-gray-600'}`}>
                            {event.allDay ? (
                                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-1 rounded">整日</span>
                            ) : (
                                <>
                                <div className="text-sm font-semibold leading-none">{format(event.startTime, 'HH:mm')}</div>
                                <div className="text-[10px] text-gray-400 leading-tight mt-0.5">{format(event.endTime, 'HH:mm')}</div>
                                </>
                            )}
                        </div>

                        {/* Event Card */}
                        <div 
                        onClick={() => onEventClick?.(event)}
                        className={`flex-1 p-3 rounded-lg border transition-all duration-300 cursor-pointer flex flex-col gap-1 ${
                            isPast 
                            ? 'bg-gray-100 border-gray-200 opacity-70 hover:bg-gray-200' 
                            : 'bg-white border-gray-200 hover:shadow-md hover:border-blue-300 hover:bg-gray-50'
                        }`}
                        >
                        {/* Header: Title */}
                        <h3 className={`font-semibold text-base ${isPast ? 'text-gray-600' : 'text-gray-800'} leading-tight`}>
                            {event.title}
                        </h3>

                        {/* Description - Filtered & Truncated */}
                        {previewDesc && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed overflow-hidden whitespace-pre-wrap">
                            {previewDesc}
                            </p>
                        )}
                        </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      ) : (
        <div className="text-center py-12 text-gray-500">
          <p>No events scheduled for {format(currentDate, 'MMMM')}.</p>
        </div>
      )}
    </div>
  );
};
