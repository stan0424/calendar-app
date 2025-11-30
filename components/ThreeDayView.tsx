import React from 'react';
import {
  format,
  addDays,
  eachDayOfInterval,
  isToday,
  isSameDay,
  addHours,
} from 'date-fns';
import type { CalendarEvent } from '../types';

interface ThreeDayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

export const ThreeDayView: React.FC<ThreeDayViewProps> = ({ currentDate, events, onEventClick }) => {
  const days = eachDayOfInterval({ start: currentDate, end: addDays(currentDate, 2) });
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const hasAllDayEvent = events.some(e => e.allDay && days.some(d => isSameDay(e.startTime, d)));

  const getEventPosition = (event: CalendarEvent) => {
    const startHour = event.startTime.getHours() + event.startTime.getMinutes() / 60;
    const endHour = event.endTime.getHours() + event.endTime.getMinutes() / 60;
    // Set a minimum duration of 30 minutes (0.5 hours) for visibility
    const duration = Math.max(0.5, endHour - startHour);
    return {
      top: `${startHour * 4}rem`, // 4rem per hour
      height: `${duration * 4}rem`,
    };
  };

  return (
    <div className="h-full overflow-y-auto bg-white">
      {/* Sticky Header Container: Holds both day headers and all-day events */}
      <div className="sticky top-0 bg-white z-10">
        {/* Day Headers */}
        <div className="grid grid-cols-[auto_repeat(3,1fr)] border-b border-gray-100">
          <div className="w-14 border-r border-gray-100"></div> {/* Time column placeholder */}
          {days.map(day => (
            <div key={day.toString()} className="text-center py-2 border-r border-gray-100 flex flex-col items-center justify-center min-w-0">
              <div className="text-xs font-medium text-gray-500 truncate w-full">
                <span className="hidden sm:inline">{format(day, 'EEE')}</span>
                <span className="sm:hidden">{format(day, 'EEEEE')}</span>
              </div>
              <div className={`mt-1 text-xl font-medium flex items-center justify-center w-8 h-8 ${
                isToday(day) 
                  ? 'bg-blue-600 text-white rounded-full' 
                  : 'text-gray-800'
              }`}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>

        {/* All-day Events Section */}
        <div className="grid grid-cols-[auto_repeat(3,1fr)] border-b border-gray-100">
          <div className="w-14 border-r border-gray-100 flex items-center justify-center">
            {hasAllDayEvent && (
              <span className="text-xs font-medium text-gray-500">整日</span>
            )}
          </div>
          {days.map(day => {
              const allDayEvents = events.filter(e => e.allDay && isSameDay(e.startTime, day));
              return (
                  <div key={day.toString()} className="border-r border-gray-100 p-1 min-h-[2.5rem]">
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
              )
          })}
        </div>
      </div>

      {/* Time Grid */}
      <div className="grid grid-cols-[auto_repeat(3,1fr)] relative">
        <div className="w-14 border-r border-gray-100">
          {hours.map(hour => (
            <div key={hour} className="h-16 text-right pr-2 text-xs text-gray-400 pt-1">
              {hour === 0 ? '' : format(addHours(new Date(2000, 0, 1, 0), hour), 'HH:00')}
            </div>
          ))}
        </div>
        {days.map(day => (
          <div key={day.toString()} className="relative border-r border-gray-100">
            {hours.map(hour => (
              <div key={hour} className="h-16 border-b border-gray-100"></div>
            ))}
            {events
              .filter(event => !event.allDay && isSameDay(event.startTime, day)) // Only timed events
              .map(event => (
                <div
                  key={event.id}
                  onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
                  className="absolute left-2 right-2 p-1 bg-blue-100 text-blue-800 rounded-md text-xs overflow-hidden cursor-pointer hover:bg-blue-200 transition-colors hover:z-10"
                  style={getEventPosition(event)}
                  title={event.title}
                >
                  <p className="font-semibold truncate">{event.title}</p>
                  <p className="truncate">{format(event.startTime, 'HH:mm')} - {format(event.endTime, 'HH:mm')}</p>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
};