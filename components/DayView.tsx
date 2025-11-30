import React from 'react';
import {
  format,
  addHours,
  isToday,
  isSameDay,
} from 'date-fns';
import type { CalendarEvent } from '../types';

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

export const DayView: React.FC<DayViewProps> = ({ currentDate, events, onEventClick }) => {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const allDayEvents = events.filter(e => e.allDay && isSameDay(e.startTime, currentDate));
  const timedEvents = events.filter(e => !e.allDay && isSameDay(e.startTime, currentDate));

  const getEventPosition = (event: CalendarEvent) => {
    const startHour = event.startTime.getHours() + event.startTime.getMinutes() / 60;
    const endHour = event.endTime.getHours() + event.endTime.getMinutes() / 60;
    const duration = Math.max(0.5, endHour - startHour); // Minimum height
    return {
      top: `${startHour * 4}rem`, // 4rem per hour
      height: `${duration * 4}rem`,
    };
  };

  return (
    <div className="h-full overflow-y-auto bg-white">
      {/* Sticky Header Container: Holds both day header and all-day events */}
      <div className="sticky top-0 bg-white z-10">
        {/* Day Header */}
        <div className="grid grid-cols-[auto_1fr] border-b border-gray-100">
          <div className="w-14 border-r border-gray-100"></div> {/* Time column placeholder */}
          <div className="text-center py-2 border-r border-gray-100 flex flex-col items-center justify-center">
             <div className="text-xs font-medium text-gray-500">{format(currentDate, 'EEE')}</div>
             <div className={`mt-1 text-xl font-medium flex items-center justify-center w-8 h-8 ${
                isToday(currentDate) 
                  ? 'bg-blue-600 text-white rounded-full' 
                  : 'text-gray-800'
              }`}>
                {format(currentDate, 'd')}
              </div>
          </div>
        </div>
      
        {/* All-day Events Section */}
        <div className="grid grid-cols-[auto_1fr] border-b border-gray-100">
          <div className="w-14 border-r border-gray-100 flex items-center justify-center">
            {allDayEvents.length > 0 && (
                <span className="text-xs font-medium text-gray-500">整日</span>
            )}
          </div>
          <div className="border-r border-gray-100 p-1 min-h-[2.5rem]">
              {allDayEvents.map(event => (
                  <div 
                    key={event.id} 
                    onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
                    className="bg-blue-500 text-white rounded px-2 py-0.5 text-xs truncate mb-1 cursor-pointer hover:bg-blue-600 transition-colors" 
                    title={event.title}
                  >
                      {event.title}
                  </div>
              ))}
          </div>
        </div>
      </div>

      {/* Time Grid */}
      <div className="grid grid-cols-[auto_1fr] relative">
        <div className="w-14 border-r border-gray-100">
          {hours.map(hour => (
            <div key={hour} className="h-16 text-right pr-2 text-xs text-gray-400 pt-1">
               {hour === 0 ? '' : format(addHours(new Date(2000, 0, 1, 0), hour), 'HH:00')}
            </div>
          ))}
        </div>
        <div className="relative border-r border-gray-100">
          {hours.map(hour => (
            <div key={hour} className="h-16 border-b border-gray-100"></div>
          ))}
          {timedEvents.map(event => (
            <div
              key={event.id}
              onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
              className="absolute left-2 right-2 p-2 bg-blue-100 text-blue-800 rounded-lg text-sm overflow-hidden flex flex-col cursor-pointer hover:bg-blue-200 transition-colors hover:z-10"
              style={getEventPosition(event)}
              title={`${event.title}: ${format(event.startTime, 'HH:mm')} - ${format(event.endTime, 'HH:mm')}`}
            >
              <p className="font-bold truncate">{event.title}</p>
              {!event.allDay && <p className="truncate">{format(event.startTime, 'HH:mm')} - {format(event.endTime, 'HH:mm')}</p>}
              {event.description && <p className="text-xs truncate mt-1">{event.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};