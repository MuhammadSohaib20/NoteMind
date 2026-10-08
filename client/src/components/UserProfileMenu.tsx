import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ViewMode } from '../types';
import { Settings, LogOut, ChevronDown } from 'lucide-react';

interface UserProfileMenuProps {
  onNavigate: (view: ViewMode) => void;
  align?: 'right' | 'left';
}

export const UserProfileMenu: React.FC<UserProfileMenuProps> = ({
  onNavigate,
  align = 'right',
}) => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = user?.fullName || (user?.email ? user.email.split('@')[0] : 'My Profile');
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'NM';

  const avatarUrl = user?.avatarUrl;
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 p-1.5 sm:px-3 sm:py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-800 transition shadow-2xs group"
        aria-label="User account menu"
      >
        {avatarUrl && !imgError ? (
          <img
            src={avatarUrl}
            alt={displayName}
            onError={() => setImgError(true)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border-2 border-blue-500/40 shrink-0 group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
            {initials}
          </div>
        )}
        <div className="flex flex-col text-left hidden sm:flex leading-tight">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 max-w-[150px] truncate">
            {displayName}
          </span>
          {user?.email && (
            <span className="text-[10px] text-slate-500 dark:text-slate-400 max-w-[150px] truncate font-normal">
              {user.email}
            </span>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition shrink-0" />
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-800 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150`}
        >
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            {avatarUrl && !imgError ? (
              <img
                src={avatarUrl}
                alt={displayName}
                onError={() => setImgError(true)}
                className="w-10 h-10 rounded-full object-cover border border-blue-500/40 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{displayName}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>

          <div className="py-1 space-y-0.5 px-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onNavigate('settings');
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <Settings className="w-4 h-4 text-slate-400 dark:text-slate-400" />
              <span>Profile &amp; Settings</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
