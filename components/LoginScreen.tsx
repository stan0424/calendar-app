import React, { useState } from 'react';
import { auth, googleProvider, signInWithPopup, signInAnonymously } from '../services/firebaseConfig';
import { CalendarIcon } from './icons/Icons';

interface LoginScreenProps {
  onLoginSuccess?: () => void;
  onEnterOfflineMode: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, onEnterOfflineMode }) => {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
      if (onLoginSuccess) onLoginSuccess();
    } catch (err: any) {
      console.error("Google login error:", err);
      if (err.code === 'auth/configuration-not-found' || err.code === 'auth/unauthorized-domain') {
          setError("Google Sign-In is not enabled in Firebase Console. Please use Guest Mode.");
      } else if (err.code === 'auth/popup-blocked') {
          setError("Popup blocked. Please allow popups for this site.");
      } else {
          setError("Failed to sign in with Google. Try Guest Mode.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
        // Try real anonymous login first to get DB permissions
        await signInAnonymously(auth);
        if (onLoginSuccess) onLoginSuccess();
    } catch (err: any) {
        console.warn("Anonymous auth failed, falling back to offline mode:", err);
        // If Firebase fails (e.g. config issue, network, blocked), fallback to offline mode
        onEnterOfflineMode();
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-blue-50 rounded-full">
             <CalendarIcon />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Gemini AI Calendar</h1>
        <p className="text-gray-500 mb-8">Sign in to sync your schedule across devices.</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-md text-left">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition bg-white text-gray-700 font-medium disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 4.66c1.61 0 3.09.55 4.25 1.66l3.18-3.18C17.46 1.34 14.96 0 12 0 7.7 0 3.99 2.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </button>
          
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or</span>
            </div>
          </div>

          <button
            onClick={handleGuestLogin}
            disabled={isLoading}
            className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition font-medium disabled:opacity-50"
          >
            Continue as Guest / Offline
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Guest mode saves data to your device if cloud login fails.
          </p>
        </div>
      </div>
    </div>
  );
};