import React from 'react';
import { format } from 'date-fns';
import { SettingsIcon, ChevronLeftIcon, ChevronRightIcon, ArrowDropDownIcon, CalendarIcon } from './icons/Icons';
import type { ViewOption } from '../types';

interface CalendarHeaderProps {
  currentDate: Date;
  currentView: ViewOption;
  onViewChange: (view: ViewOption) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onOpenSettings: () => void;
}

const viewOptions: ViewOption[] = ['Day', '3-Day', 'Week', 'Month', 'Schedule'];

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  currentDate,
  currentView,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onOpenSettings,
}) => {
  const [isViewDropdownOpen, setIsViewDropdownOpen] = React.useState(false);

  const getDateFormat = () => {
    switch (currentView) {
      case 'Month':
      case 'Schedule':
      case 'Week':
      case 'Day':
      case '3-Day':
        return 'MMMM yyyy';
      default:
        return 'MMMM yyyy';
    }
  };

  return (
    <header className="relative flex items-center justify-between px-1.5 py-2 sm:px-3 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
      {/* Left Group */}
      <div className="flex items-center space-x-1 sm:space-x-2">
        <div className="hidden sm:flex items-center gap-2">
          <CalendarIcon />
          <span className="text-xl font-semibold text-gray-700">Calendar</span>
        </div>
        <button onClick={onToday} className="px-2 py-1 sm:px-3 sm:py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition flex-shrink-0">
          Today
        </button>
      </div>

      {/* Mobile-only Date Navigator */}
      <div className="flex sm:hidden items-center justify-center">
         <button onClick={onPrev} className="p-2 rounded-full hover:bg-gray-100 transition">
          <ChevronLeftIcon />
        </button>
        <h2 className="text-base font-semibold text-gray-800 text-center whitespace-nowrap mx-1">
          {format(currentDate, getDateFormat())}
        </h2>
        <button onClick={onNext} className="p-2 rounded-full hover:bg-gray-100 transition">
          <ChevronRightIcon />
        </button>
      </div>
      
      {/* Tablet/Desktop-only (absolutely centered) Date Navigator */}
      <div className="hidden sm:flex items-center justify-center absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <button onClick={onPrev} className="p-2 rounded-full hover:bg-gray-100 transition">
          <ChevronLeftIcon />
        </button>
        <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-800 text-center whitespace-nowrap mx-1 sm:mx-2">
          {format(currentDate, getDateFormat())}
        </h2>
        <button onClick={onNext} className="p-2 rounded-full hover:bg-gray-100 transition">
          <ChevronRightIcon />
        </button>
      </div>

      {/* Right Section */}
      <div className="flex items-center justify-end">
        <div className="flex items-center space-x-1 sm:space-x-2">
          <div className="relative">
            <button
              onClick={() => setIsViewDropdownOpen(!isViewDropdownOpen)}
              className="flex items-center px-2 py-1 sm:px-3 sm:py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <span className="truncate">{currentView}</span>
              <ArrowDropDownIcon />
            </button>
            {isViewDropdownOpen && (
              <div className="absolute right-0 mt-2 w-36 bg-white rounded-md shadow-lg border border-gray-200 z-30">
                {viewOptions.map(view => (
                  <button
                    key={view}
                    onClick={() => {
                      onViewChange(view);
                      setIsViewDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    {view}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={onOpenSettings} className="p-2 rounded-full hover:bg-gray-100 transition">
            <SettingsIcon />
          </button>
        </div>
      </div>
    </header>
  );
};