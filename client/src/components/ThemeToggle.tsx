import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, ThemeMode } from '../context/ThemeContext';

interface ThemeToggleProps {
  variant?: 'pill' | 'button' | 'cards';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'pill', className = '' }) => {
  const { theme, effectiveTheme, toggleTheme, setTheme, isDark } = useTheme();

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`p-2 rounded-xl border transition-all duration-300 flex items-center justify-center ${
          isDark
            ? 'bg-slate-800/80 border-slate-700/80 text-amber-400 hover:bg-slate-700 hover:text-amber-300 hover:border-amber-500/40 shadow-sm'
            : 'bg-amber-50/80 border-amber-200 text-amber-600 hover:bg-amber-100 hover:text-amber-700 shadow-xs'
        } ${className}`}
        title={isDark ? 'Switch to Day View (Light)' : 'Switch to Night View (Dark)'}
        aria-label="Toggle Day and Night View"
      >
        {isDark ? (
          <Sun className="w-4 h-4 transition-transform duration-300 rotate-0 hover:rotate-45" />
        ) : (
          <Moon className="w-4 h-4 transition-transform duration-300 -rotate-12 hover:rotate-0" />
        )}
      </button>
    );
  }

  if (variant === 'cards') {
    const options: { id: ThemeMode; label: string; icon: React.ReactNode; desc: string }[] = [
      {
        id: 'light',
        label: 'Day View (Light)',
        icon: <Sun className="w-5 h-5 text-amber-500" />,
        desc: 'Crisp light interface for daytime reading and clear visibility',
      },
      {
        id: 'dark',
        label: 'Night View (Dark)',
        icon: <Moon className="w-5 h-5 text-indigo-400" />,
        desc: 'Sleek dark interface reduced eye strain in low light',
      },
      {
        id: 'system',
        label: 'System Preference',
        icon: <Monitor className="w-5 h-5 text-slate-400" />,
        desc: 'Automatically sync with your operating system appearance',
      },
    ];

    return (
      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${className}`}>
        {options.map((opt) => {
          const isSelected = theme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTheme(opt.id)}
              className={`flex flex-col text-left p-4 rounded-2xl border transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 ring-2 ring-blue-500/30'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800">{opt.icon}</div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    isSelected
                      ? 'border-blue-600 bg-blue-600'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                {opt.label}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Pill variant (default)
  return (
    <div
      className={`inline-flex items-center p-1 rounded-full bg-slate-200/80 dark:bg-slate-800/80 border border-slate-300/60 dark:border-slate-700/60 shadow-inner ${className}`}
    >
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
          effectiveTheme === 'light'
            ? 'bg-white text-amber-600 shadow-md shadow-amber-500/10'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
        }`}
        title="Day View (Light)"
      >
        <Sun className="w-3.5 h-3.5" />
        <span>Day</span>
      </button>

      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
          effectiveTheme === 'dark'
            ? 'bg-slate-900 text-indigo-300 shadow-md shadow-indigo-500/20 border border-slate-700/60'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
        }`}
        title="Night View (Dark)"
      >
        <Moon className="w-3.5 h-3.5" />
        <span>Night</span>
      </button>
    </div>
  );
};
