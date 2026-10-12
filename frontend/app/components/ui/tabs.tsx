import * as React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: string | number;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function TabsNavigation({
  tabs,
  activeTab,
  onChange,
  className,
}: TabsProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 p-1 rounded-xl bg-slate-100/80 border border-slate-200/80 overflow-x-auto no-scrollbar',
        className
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest-700',
              isActive
                ? 'text-brand-forest-900 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="active-tab-pill"
                className="absolute inset-0 bg-white rounded-lg shadow-xs border border-slate-200/60"
                transition={{ type: 'spring', stiffness: 450, damping: 35 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {Icon && (
                <Icon
                  className={cn(
                    'w-4 h-4 transition-colors',
                    isActive ? 'text-brand-forest-700' : 'text-slate-500'
                  )}
                />
              )}
              {tab.label}
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    'text-[10px] font-bold px-1.5 py-0.2 rounded-full',
                    isActive
                      ? 'bg-brand-forest-100 text-brand-forest-800'
                      : 'bg-slate-200 text-slate-700'
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
