import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';

interface VoiceWaveformProps {
  isActive: boolean;
  barsCount?: number;
  color?: string;
  className?: string;
}

export function VoiceWaveform({
  isActive,
  barsCount = 14,
  color = 'bg-brand-forest-700',
  className,
}: VoiceWaveformProps) {
  // Height variations to simulate speech formant frequencies
  const heights = [12, 24, 38, 20, 48, 30, 16, 42, 28, 52, 22, 34, 18, 26];

  return (
    <div
      className={cn('flex items-center justify-center gap-1 h-12 px-2', className)}
      aria-label={isActive ? 'Voice activity active' : 'Voice activity idle'}
    >
      {Array.from({ length: barsCount }).map((_, i) => {
        const targetHeight = heights[i % heights.length];
        return (
          <motion.span
            key={i}
            className={cn('w-1 rounded-full transition-colors', color)}
            animate={
              isActive
                ? {
                    height: [6, targetHeight, 8, targetHeight * 0.7, 6],
                  }
                : { height: 6 }
            }
            transition={
              isActive
                ? {
                    repeat: Infinity,
                    duration: 0.9 + (i % 5) * 0.15,
                    ease: 'easeInOut',
                    delay: (i * 0.06) % 0.4,
                  }
                : { duration: 0.2 }
            }
            style={{ minHeight: '4px' }}
          />
        );
      })}
    </div>
  );
}
