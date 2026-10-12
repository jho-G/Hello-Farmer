import React, { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { LANGUAGE_OPTIONS, SupportedLanguage } from '../i18n/translations';
import { cn } from '../utils/cn';

interface LanguageSelectorProps {
  currentLanguage: SupportedLanguage;
  onSelectLanguage: (lang: SupportedLanguage) => void;
  className?: string;
}

export function LanguageSelector({
  currentLanguage,
  onSelectLanguage,
  className,
}: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentOption =
    LANGUAGE_OPTIONS.find((opt) => opt.code === currentLanguage) || LANGUAGE_OPTIONS[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={cn('relative inline-block text-left', className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold',
          'border border-slate-200 bg-white text-slate-800 shadow-xs',
          'hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest-700',
          'transition-all duration-150'
        )}
      >
        <Globe className="h-3.5 w-3.5 text-brand-forest-700" />
        <span className="font-bold tracking-tight">{currentOption.nativeName}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-slate-400 transition-transform duration-200',
            isOpen && 'rotate-180 text-brand-forest-700'
          )}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className={cn(
            'absolute right-0 mt-1.5 w-48 rounded-xl bg-white shadow-lg border border-slate-200/90 py-1.5 z-50',
            'animate-in fade-in zoom-in-95 duration-150'
          )}
        >
          <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
            ቋንቋ ይምረጡ / Choose Language
          </div>
          {LANGUAGE_OPTIONS.map((opt) => {
            const isSelected = opt.code === currentLanguage;
            return (
              <button
                key={opt.code}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onSelectLanguage(opt.code);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3.5 py-2 text-xs text-left transition-colors',
                  isSelected
                    ? 'bg-brand-forest-50 text-brand-forest-800 font-bold'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                <div className="flex flex-col">
                  <span>{opt.nativeName}</span>
                  {opt.nativeName !== opt.label && (
                    <span className="text-[10px] text-slate-400">{opt.label}</span>
                  )}
                </div>
                {isSelected && <Check className="h-4 w-4 text-brand-forest-700 stroke-[2.5]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
