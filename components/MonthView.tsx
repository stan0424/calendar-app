
import React from 'react';
import {
  format,
  endOfMonth,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  isSameDay
} from 'date-fns';
import type { CalendarEvent } from '../types';

function startOfMonth(date: Date): Date {
  const newDate = new Date(date);
  newDate.setDate(1);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
}

function startOfWeek(date: Date, options?: { weekStartsOn?: number }): Date {
  const newDate = new Date(date);
  const day = newDate.getDay();
  const diff = (day < (options?.weekStartsOn || 0) ? 7 : 0) + day - (options?.weekStartsOn || 0);
  newDate.setDate(newDate.getDate() - diff);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
}

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

const DayCell: React.FC<{ day: Date; isCurrentMonth: boolean; events: CalendarEvent[]; onEventClick?: (event: CalendarEvent) => void }> = ({ day, isCurrentMonth, events, onEventClick }) => {
  const dayEvents = events
    .filter(event => isSameDay(event.startTime, day))
    .sort((a, b) => {
        // Sort all-day events to the top
        if (a.allDay !== b.allDay) {
            return a.allDay ? -1 : 1;
        }
        // Then sort by start time
        return a.startTime.getTime() - b.startTime.getTime();
    });
    
  return (
    <div className={`border-r border-b border-gray-200 p-1.5 flex flex-col min-h-24 ${isCurrentMonth ? 'bg-white' : 'bg-gray-50'}`}>
      <div
        className={`text-xs text-right mb-1 ${
          isToday(day)
            ? 'bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold self-end'
            : isCurrentMonth ? 'text-gray-700 self-end' : 'text-gray-400 self-end'
        }`}
      >
        {format(day, 'd')}
      </div>
      <div className="flex-1 overflow-y-auto text-xs space-y-1">
        {dayEvents.slice(0, 3).map(event => (
          <button
            key={event.id}
            onClick={(e) => {
              e.stopPropagation();
              onEventClick?.(event);
            }}
            className={`w-full text-left ${
              event.allDay ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-800'
            } p-1 rounded overflow-hidden hover:opacity-80 transition cursor-pointer`}
            title={`${event.title} (${
              event.allDay
                ? '整日'
                : `${format(event.startTime, 'HH:mm')} - ${format(event.endTime, 'HH:mm')}`
            })`}
          >
            {event.allDay ? (
              <span className="truncate pl-1 block">整日 {event.title}</span>
            ) : (
              <div className="flex items-baseline">
                <span className="font-semibold flex-shrink-0 whitespace-nowrap">
                  {format(event.startTime, 'HH:mm')}
                </span>
                <span className="ml-1 truncate">{event.title}</span>
              </div>
            )}
          </button>
        ))}
        {dayEvents.length > 3 && (
          <div className="text-gray-500 text-center pt-1 cursor-default">
            + {dayEvents.length - 3} more
          </div>
        )}
      </div>
    </div>
  );
};


export const MonthView: React.FC<MonthViewProps> = ({ currentDate, events, onEventClick }) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-7 bg-white border-b border-gray-200">
        {weekdays.map(day => (
          <div key={day} className="text-center py-2 text-sm font-medium text-gray-500 border-r border-gray-200 last:border-r-0">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1">
        {days.map(day => (
          <DayCell 
            key={day.toString()}
            day={day}
            isCurrentMonth={isSameMonth(day, currentDate)}
            events={events}
            onEventClick={onEventClick}
          />
        ))}
      </div>
    </div>
  );
};
