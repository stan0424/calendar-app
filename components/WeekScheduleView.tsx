
import React, { useMemo, useRef, useEffect } from 'react';
import { format, endOfWeek, eachDayOfInterval, isToday, isBefore } from 'date-fns';
import type { CalendarEvent } from '../types';

function startOfWeek(date: Date, options?: { weekStartsOn?: number }): Date {
  const newDate = new Date(date);
  const day = newDate.getDay();
  const diff = (day < (options?.weekStartsOn || 0) ? 7 : 0) + day - (options?.weekStartsOn || 0);
  newDate.setDate(newDate.getDate() - diff);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
}

function startOfDay(date: Date): Date {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
}

interface WeekScheduleViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

export const WeekScheduleView: React.FC<WeekScheduleViewProps> = ({ currentDate, events, onEventClick }) => {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);

  const scrollToDay = (day: Date) => {
    const dayKey = format(day, 'yyyy-MM-dd');
    const targetElement = dayRefs.current[dayKey];
    const container = containerRef.current;
    
    if (targetElement && container) {
       // The sticky header height is approx 68px, so we subtract that for offset
       const topPos = targetElement.offsetTop - 68;
       container.scrollTo({ top: topPos, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const today = new Date();
    const todayKey = format(today, 'yyyy-MM-dd');
    
    // Check if today is in the current week view
    if (dayRefs.current[todayKey]) {
      const timer = setTimeout(() => {
        const targetElement = dayRefs.current[todayKey];
        const container = containerRef.current;

         if (targetElement && container) {
            const topPos = targetElement.offsetTop - 68;
            // On initial load, scroll instantly, not smoothly
            container.scrollTo({ top: topPos, behavior: 'auto' });
         }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [currentDate]); // Rerun when week changes

  const groupedEvents = useMemo(() => {
    const eventsInWeek = events.filter(e => {
        const eventTime = e.startTime.getTime();
        const weekStartTime = startOfDay(weekStart).getTime();
        const weekEndTime = endOfWeek(weekEnd).getTime();
        return eventTime >= weekStartTime && eventTime <= weekEndTime;
    });
    
    return eventsInWeek.reduce((acc, event) => {
      const dayKey = format(event.startTime, 'yyyy-MM-dd');
      if (!acc[dayKey]) acc[dayKey] = [];
      acc[dayKey].push(event);
      return acc;
    }, {} as Record<string, CalendarEvent[]>);
  }, [events, weekStart, weekEnd]);
  
  const now = useMemo(() => new Date(), []);
  const todayStart = useMemo(() => startOfDay(now), [now]);
  const hasAnyEvents = Object.keys(groupedEvents).length > 0;

  // Helper to filter description for preview
  const getPreviewDescription = (desc?: string) => {
    if (!desc) return null;
    return desc.split('\n')
        .filter(line => {
             const l = line.trim();
             // Filter out Date, Time, and Addresses as requested
             return !l.startsWith('行程日期') && 
                    !l.startsWith('行程時間') &&
                    !l.startsWith('上車地址') && 
                    !l.startsWith('下車地址') &&
                    l.length > 0;
        })
        .join('\n');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Sticky Day Header */}
      <div className="sticky top-0 bg-white shadow-sm z-20 flex-shrink-0">
        <div className="grid grid-cols-7">
          {days.map(day => (
            <button
              key={day.toString()}
              onClick={() => scrollToDay(day)}
              className="text-center py-2 flex flex-col items-center justify-center focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400"
              aria-label={`Go to ${format(day, 'EEEE, MMMM d')}`}
            >
              <div className="text-xs font-medium text-gray-500">{format(day, 'EEE')}</div>
              <div className={`mt-1 text-lg font-medium flex items-center justify-center w-7 h-7 ${
                isToday(day) 
                  ? 'bg-blue-600 text-white rounded-full' 
                  : 'text-gray-800'
              }`}>
                {format(day, 'd')}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      <div className="overflow-y-auto flex-1" ref={containerRef}>
        <div className="p-4">
            {hasAnyEvents ? days.map(day => {
                const dayKey = format(day, 'yyyy-MM-dd');
                const dayEvents = (groupedEvents[dayKey] || []).sort((a, b) => {
                    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
                    return a.startTime.getTime() - b.startTime.getTime();
                });
    
                if (dayEvents.length === 0) return null;
    
                return (
                <div key={dayKey} ref={el => { dayRefs.current[dayKey] = el; }} className="mb-4">
                    <div className="flex items-baseline mb-3 sticky top-0 bg-gray-50 py-2 z-10 pl-1">
                        <h3 className={`text-base font-bold ${isToday(day) ? 'text-blue-600' : 'text-gray-800'}`}>{format(day, 'EEEE')}</h3>
                        <p className="ml-2 text-sm text-gray-500 font-medium">{format(day, 'MMMM d')}</p>
                    </div>
                    <div className="space-y-2">
                    {dayEvents.map(event => {
                        const dayOfEvent = startOfDay(event.startTime);
                        const isPast = event.allDay 
                            ? isBefore(dayOfEvent, todayStart)
                            : isBefore(event.endTime, now);
                        
                        const previewDesc = getPreviewDescription(event.description);

                        return (
                            <div 
                                key={event.id}
                                onClick={() => onEventClick?.(event)}
                                className={`p-3 rounded-lg border flex cursor-pointer transition-colors ${
                                isPast 
                                    ? 'bg-gray-100 border-gray-200 opacity-70 hover:bg-gray-200' 
                                    : 'bg-white border-gray-200 shadow-sm hover:bg-gray-50 hover:border-blue-300'
                                }`}
                            >
                                <div className={`w-16 text-xs flex-shrink-0 flex flex-col justify-start pt-0.5 ${isPast ? 'text-gray-500' : 'text-gray-700'}`}>
                                    {event.allDay ? <span className="font-medium">整日</span> : (
                                      <>
                                        <p className="font-medium">{format(event.startTime, 'HH:mm')}</p>
                                        <p className="text-gray-400 text-[10px] mt-0.5">{format(event.endTime, 'HH:mm')}</p>
                                      </>
                                    )}
                                </div>
                                
                                <div className="flex-1 pl-3 border-l border-gray-100 relative overflow-hidden">
                                  <h4 className={`text-sm font-semibold truncate leading-tight mb-1 ${isPast ? 'text-gray-600' : 'text-gray-800'}`}>
                                    {event.title}
                                  </h4>
                                  
                                  {previewDesc && (
                                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed whitespace-pre-wrap">
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
            }) : (
                <div className="text-center py-12 text-gray-500">
                    <p>No events scheduled for this week.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
