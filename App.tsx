
import React, { useState, useCallback, useEffect, useRef } from 'react';
import firebase from 'firebase/compat/app';
import { addMonths, addWeeks, addDays, differenceInMinutes } from 'date-fns';
import { CalendarHeader } from './components/CalendarHeader';
import { MonthView } from './components/MonthView';
import { WeekView } from './components/WeekView';
import { DayView } from './components/DayView';
import { ThreeDayView } from './components/ThreeDayView';
import { ScheduleView } from './components/ScheduleView';
import { AiAssistantModal } from './components/AiAssistantModal';
import { ManualEventModal } from './components/ManualEventModal';
import { SettingsModal } from './components/SettingsModal';
import { EventDetailModal } from './components/EventDetailModal';
import type { CalendarEvent, ViewOption, AiConfig } from './types';
import { CreateIcon, AiIcon, ManualIcon } from './components/icons/Icons';
import { db, auth } from './services/firebaseConfig';
// Removed modular imports as they are not available in the current environment's Firebase version

const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'gemini',
  keys: {
    gemini: '',
    openai: '',
    custom: '',
  },
  models: {
    gemini: 'gemini-2.5-flash',
    openai: 'gpt-4o',
    custom: 'custom-model-name'
  },
  customUrl: '',
};

const App: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentView, setCurrentView] = useState<ViewOption>('Month');
  const [isAssistantModalOpen, setAssistantModalOpen] = useState(false);
  const [isManualModalOpen, setManualModalOpen] = useState(false);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [aiConfig, setAiConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFabMenuOpen, setFabMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  const notifiedEventsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const storedConfig = localStorage.getItem('aiConfig');
      if (storedConfig) {
        const parsedConfig = JSON.parse(storedConfig);
        setAiConfig(prev => ({ ...prev, ...parsedConfig }));
      }
    } catch (error) {
      console.error("Failed to load config from localStorage", error);
    }
  }, []);

  // Handle Authentication
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((currentUser) => {
        if (currentUser) {
            setUser(currentUser);
        } else {
            // Attempt to sign in anonymously. 
            // IMPORTANT: Make sure "Anonymous" provider is enabled in Firebase Console -> Authentication -> Sign-in method.
            auth.signInAnonymously().catch((error) => {
                console.error("Anonymous auth failed", error);
                // Even if auth fails, we will try to load events (rules might be public)
                setIsLoaded(true); 
            });
        }
    });

    return () => unsubscribeAuth();
  }, []);

  // Handle Data Sync
  useEffect(() => {
    // REMOVED: if (!user) return; 
    // We allow the snapshot listener to attach immediately. 
    // If rules are public (Test Mode), it works immediately.
    // If rules require Auth, it will fail first, then retry automatically when 'user' state updates.
    
    const unsubscribeSnapshot = db.collection('events').onSnapshot((snapshot) => {
        const loadedEvents = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                startTime: data.startTime?.toDate ? data.startTime.toDate() : new Date(data.startTime),
                endTime: data.endTime?.toDate ? data.endTime.toDate() : new Date(data.endTime),
            } as CalendarEvent;
        });
        setEvents(loadedEvents);
        setIsLoaded(true);
    }, (error) => {
        console.error("Firestore sync error:", error);
        if ((error as any).code === 'permission-denied') {
             // Only alert if we really can't read. Note: If waiting for auth, this might trigger once briefly.
             console.warn("Database permission denied. Waiting for auth or check security rules.");
        }
        setIsLoaded(true);
    });

    try {
      if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission().catch(err => console.log("Notification permission request failed", err));
      }
    } catch (e) {
      // Ignore errors in environments that don't support this
    }

    return () => unsubscribeSnapshot();
  }, [user]); // Re-subscribe when user status changes (e.g. from null to authenticated)

  useEffect(() => {
    const checkReminders = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      const now = new Date();
      events.forEach(event => {
        if (event.allDay) return;

        const diff = differenceInMinutes(event.startTime, now);

        if (diff >= 0 && diff <= 15 && !notifiedEventsRef.current.has(event.id)) {
          try {
            new Notification(`📅 即將開始: ${event.title}`, {
                body: `${event.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${event.location || '無地點'}\n${event.description || ''}`,
                icon: '/favicon.svg'
            });
            notifiedEventsRef.current.add(event.id);
          } catch (e) {
            console.error("Notification failed", e);
          }
        }
      });
    };

    checkReminders();
    const intervalId = setInterval(checkReminders, 60000);

    return () => clearInterval(intervalId);
  }, [events]);

  const handleAiConfigChange = (newConfig: AiConfig) => {
    setAiConfig(newConfig);
    try {
      localStorage.setItem('aiConfig', JSON.stringify(newConfig));
    } catch (error) {
       console.error("Failed to save AI config to localStorage", error);
    }
  };

  const handlePrev = useCallback(() => {
    switch (currentView) {
      case 'Month':
      case 'Schedule':
        setCurrentDate(prev => addMonths(prev, -1));
        break;
      case 'Week':
        setCurrentDate(prev => addWeeks(prev, -1));
        break;
      case 'Day':
        setCurrentDate(prev => addDays(prev, -1));
        break;
      case '3-Day':
        setCurrentDate(prev => addDays(prev, -3));
        break;
    }
  }, [currentView]);

  const handleNext = useCallback(() => {
    switch (currentView) {
      case 'Month':
      case 'Schedule':
        setCurrentDate(prev => addMonths(prev, 1));
        break;
      case 'Week':
        setCurrentDate(prev => addWeeks(prev, 1));
        break;
      case 'Day':
        setCurrentDate(prev => addDays(prev, 1));
        break;
      case '3-Day':
        setCurrentDate(prev => addDays(prev, 3));
        break;
    }
  }, [currentView]);

  const handleToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const addEvent = async (event: Omit<CalendarEvent, 'id'>) => {
    try {
        // Normalize payload to Firestore-friendly values (no undefined, Dates -> Timestamp)
        const payload: any = {
          title: event.title ?? '',
          description: event.description ?? '',
          location: event.location ?? '',
          allDay: !!event.allDay,
          startTime: (event as any)?.startTime?.toDate
            ? (event as any).startTime
            : (event.startTime instanceof Date
                ? firebase.firestore.Timestamp.fromDate(event.startTime)
                : undefined),
          endTime: (event as any)?.endTime?.toDate
            ? (event as any).endTime
            : (event.endTime instanceof Date
                ? firebase.firestore.Timestamp.fromDate(event.endTime)
                : undefined),
        };
        Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
        if (!payload.startTime || !payload.endTime) {
          alert('Failed to add event to cloud database.\nmessage: Invalid start/end time');
          return;
        }
        await db.collection('events').add(payload);
    } catch (error: any) {
        console.error("Error adding document: ", error);
        let msg = "Failed to add event to cloud database.";
        
        if (error.code === 'permission-denied') {
            msg += "\n權限不足。請確認 Firebase Console Authentication 已啟用「匿名登入 (Anonymous)」。";
        } else if (error.code === 'unavailable') {
             // Offline: Firestore cues it automatically, but sometimes throws if network is hard down initially
             return; 
        } else if (error.message) {
            msg += `\nError: ${error.message}`;
        }
        alert(msg);
    }
  };

  const updateEvent = async (id: string, updates: Partial<CalendarEvent>) => {
    try {
        // Normalize updates: convert Date to Timestamp, drop undefined
        const clean: any = { ...updates };
        if (clean.startTime) {
            if ((clean.startTime as any)?.toDate) {
                // already a Timestamp
            } else if (clean.startTime instanceof Date) {
                clean.startTime = firebase.firestore.Timestamp.fromDate(clean.startTime);
            } else {
                const d = new Date(clean.startTime as any);
                if (!isNaN(d.getTime())) clean.startTime = firebase.firestore.Timestamp.fromDate(d); else delete clean.startTime;
            }
        }
        if (clean.endTime) {
            if ((clean.endTime as any)?.toDate) {
                // already a Timestamp
            } else if (clean.endTime instanceof Date) {
                clean.endTime = firebase.firestore.Timestamp.fromDate(clean.endTime);
            } else {
                const d = new Date(clean.endTime as any);
                if (!isNaN(d.getTime())) clean.endTime = firebase.firestore.Timestamp.fromDate(d); else delete clean.endTime;
            }
        }
        if ('allDay' in clean) clean.allDay = !!clean.allDay;
        if ('title' in clean) clean.title = clean.title ?? '';
        if ('description' in clean) clean.description = clean.description ?? '';
        if ('location' in clean) clean.location = clean.location ?? '';
        Object.keys(clean).forEach(k => clean[k] === undefined && delete clean[k]);

        await db.collection('events').doc(id).update(clean);
        
        if (selectedEvent && selectedEvent.id === id) {
            setSelectedEvent(prev => prev ? { ...prev, ...updates } : null);
        }

        if (updates.startTime) {
            notifiedEventsRef.current.delete(id);
        }
    } catch (error: any) {
        console.error("Error updating document: ", error);
        let msg = "Failed to update event in cloud database.";
        if (error?.code) msg += `\ncode: ${error.code}`;
        if (error?.message) msg += `\nmessage: ${error.message}`;
        alert(msg);
    }
  };

  const deleteEvent = async (id: string) => {
    try {
        await db.collection('events').doc(id).delete();
        notifiedEventsRef.current.delete(id);
    } catch (error: any) {
        console.error("Error deleting document: ", error);
        let msg = "Failed to delete event from cloud database.";
        if (error?.code) msg += `\ncode: ${error.code}`;
        if (error?.message) msg += `\nmessage: ${error.message}`;
        alert(msg);
    }
  };

  // Guarded add: ensure anonymous auth is established before writing
  const addEventGuarded = async (event: Omit<CalendarEvent, 'id'>) => {
    if (!auth.currentUser) {
      try {
        await auth.signInAnonymously();
      } catch (e: any) {
        console.error('Anonymous auth failed before add:', e);
        const msg = e?.message || 'Unknown auth error';
        alert(`Failed to authenticate (anonymous).\n${msg}`);
        return;
      }
    }

    try {
      await addEvent(event);
    } catch (e) {
      // addEvent already logs and alerts detailed error
    }
  };
  
  // Guarded update: ensure auth before updating
  const updateEventGuarded = async (id: string, updates: Partial<CalendarEvent>) => {
    if (!auth.currentUser) {
      try {
        await auth.signInAnonymously();
      } catch (e: any) {
        console.error('Anonymous auth failed before update:', e);
        const msg = e?.message || 'Unknown auth error';
        alert(`Failed to authenticate (anonymous).\n${msg}`);
        return;
      }
    }
    try {
      await updateEvent(id, updates);
    } catch (e) {
      // updateEvent already handles alert
    }
  };

  // Guarded delete: ensure auth before deleting
  const deleteEventGuarded = async (id: string) => {
    if (!auth.currentUser) {
      try {
        await auth.signInAnonymously();
      } catch (e: any) {
        console.error('Anonymous auth failed before delete:', e);
        const msg = e?.message || 'Unknown auth error';
        alert(`Failed to authenticate (anonymous).\n${msg}`);
        return;
      }
    }
    try {
      await deleteEvent(id);
    } catch (e) {
      // deleteEvent already handles alert
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'Month':
        return <MonthView currentDate={currentDate} events={events} onEventClick={setSelectedEvent} />;
      case 'Week':
        return <WeekView currentDate={currentDate} events={events} onEventClick={setSelectedEvent} />;
      case 'Day':
        return <DayView currentDate={currentDate} events={events} onEventClick={setSelectedEvent} />;
      case '3-Day':
        return <ThreeDayView currentDate={currentDate} events={events} onEventClick={setSelectedEvent} />;
      case 'Schedule':
        return <ScheduleView currentDate={currentDate} events={events} onEventClick={setSelectedEvent} />;
      default:
        return <MonthView currentDate={currentDate} events={events} onEventClick={setSelectedEvent} />;
    }
  };

  if (!isLoaded && !user) {
      return (
        <div className="flex flex-col h-[100dvh] items-center justify-center gap-4">
             <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
             <div className="text-gray-500">Connecting to cloud database...</div>
        </div>
      );
  }

  return (
    <>
      <div className="flex flex-col h-[100dvh] w-full max-w-[100vw] overflow-hidden font-sans bg-gray-100 touch-pan-y overscroll-none">
        <CalendarHeader
          currentDate={currentDate}
          currentView={currentView}
          onViewChange={setCurrentView}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}
          onOpenSettings={() => setSettingsModalOpen(true)}
        />
        <main className="flex-1 overflow-y-auto w-full">
          {renderView()}
        </main>
      </div>
      
      {isFabMenuOpen && <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setFabMenuOpen(false)}></div>}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-3">
        <div className={`transition-all duration-300 ease-in-out flex flex-col items-center gap-3 ${isFabMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
            <button
                onClick={() => { setManualModalOpen(true); setFabMenuOpen(false); }}
                className="bg-white text-gray-700 p-3 rounded-full shadow-lg hover:bg-gray-100 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Manual Add Event"
                title="手動新增"
            >
                <ManualIcon />
            </button>
            <button
                onClick={() => { setAssistantModalOpen(true); setFabMenuOpen(false); }}
                className="bg-white text-gray-700 p-3 rounded-full shadow-lg hover:bg-gray-100 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Open AI Assistant"
                title="AI 新增"
            >
                <AiIcon />
            </button>
        </div>
        <button
            onClick={() => setFabMenuOpen(!isFabMenuOpen)}
            className="bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 active:scale-90"
            aria-label="Create Event"
        >
            <CreateIcon className={`transition-transform duration-300 ${isFabMenuOpen ? 'rotate-45' : ''}`} />
        </button>
      </div>

      {isAssistantModalOpen && (
        <AiAssistantModal
          isOpen={isAssistantModalOpen}
          onClose={() => setAssistantModalOpen(false)}
          onAddEvent={addEventGuarded}
          onDeleteEvent={deleteEventGuarded}
          onUpdateEvent={updateEventGuarded}
          events={events}
          aiConfig={aiConfig}
        />
      )}

      {isManualModalOpen && (
        <ManualEventModal
            isOpen={isManualModalOpen}
            onClose={() => setManualModalOpen(false)}
            onAddEvent={addEventGuarded}
        />
      )}
      
      {isSettingsModalOpen && (
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          currentConfig={aiConfig}
          onConfigChange={handleAiConfigChange}
        />
      )}

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDelete={deleteEventGuarded}
          onUpdate={updateEventGuarded}
        />
      )}
    </>
  );
};

export default App;
