
import React, { useState } from 'react';
import { format, addHours } from 'date-fns';
import { CloseIcon, SendIcon } from './icons/Icons';
import type { CalendarEvent } from '../types';

interface ManualEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEvent: (event: Omit<CalendarEvent, 'id'>) => void;
}

export const ManualEventModal: React.FC<ManualEventModalProps> = ({ isOpen, onClose, onAddEvent }) => {
  const now = new Date();
  const defaultStartTime = format(now, "yyyy-MM-dd'T'HH:mm");
  const defaultEndTime = format(addHours(now, 1), "yyyy-MM-dd'T'HH:mm");

  const [title, setTitle] = useState('');
  const [start, setStart] = useState(defaultStartTime);
  const [end, setEnd] = useState(defaultEndTime);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
        setError('Title is required.');
        return;
    }
    const startTime = new Date(start);
    const endTime = new Date(end);

    if (startTime >= endTime && !allDay) {
        setError('End time must be after start time.');
        return;
    }

    onAddEvent({
        title,
        startTime,
        endTime,
        description,
        location,
        allDay
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-lg font-semibold text-gray-800">Add New Event</h2>
            <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-gray-100">
                <CloseIcon />
            </button>
        </header>
        
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700">Title</label>
              <input 
                type="text" 
                id="title"
                value={title} 
                onChange={e => setTitle(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            
             <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <label htmlFor="start" className="text-sm font-medium text-gray-700 w-12">Start</label>
                    <input 
                        type="datetime-local" 
                        id="start"
                        value={start} 
                        onChange={e => setStart(e.target.value)}
                        className="text-sm border border-gray-300 rounded p-1 flex-1"
                        disabled={allDay}
                    />
                </div>
                <div className="flex items-center gap-2">
                     <label htmlFor="end" className="text-sm font-medium text-gray-700 w-12">End</label>
                    <input 
                        type="datetime-local" 
                        id="end"
                        value={end} 
                        onChange={e => setEnd(e.target.value)}
                        className="text-sm border border-gray-300 rounded p-1 flex-1"
                        disabled={allDay}
                    />
                </div>
                <div className="flex items-center gap-2 pl-14">
                     <input 
                        type="checkbox" 
                        id="allDayManual"
                        checked={allDay} 
                        onChange={e => setAllDay(e.target.checked)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                     <label htmlFor="allDayManual" className="text-sm text-gray-700">All Day Event</label>
                </div>
            </div>

             <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700">Location</label>
              <input 
                type="text" 
                id="location"
                value={location} 
                onChange={e => setLocation(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
              <textarea 
                id="description"
                value={description} 
                onChange={e => setDescription(e.target.value)}
                rows={4}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
              />
            </div>
            
            {error && <p className="text-sm text-red-600">{error}</p>}

          </div>
        </form>

        <footer className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition border border-gray-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center gap-1"
          >
            <SendIcon /> Create
          </button>
        </footer>
      </div>
    </div>
  );
};
