import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'bg-slate-100 text-slate-800 border border-slate-200/80',
        forest:
          'bg-brand-forest-50 text-brand-forest-800 border border-brand-forest-200',
        gold:
          'bg-brand-gold-50 text-brand-gold-800 border border-brand-gold-200',
        success:
          'bg-emerald-50 text-emerald-800 border border-emerald-200',
        warning:
          'bg-amber-50 text-amber-900 border border-amber-200',
        destructive:
          'bg-rose-50 text-rose-800 border border-rose-200',
        info:
          'bg-sky-50 text-sky-800 border border-sky-200',
        outline:
          'text-slate-700 border border-slate-300 bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  pulse?: boolean;
  dotColor?: string;
}

function Badge({ className, variant, dot, pulse, dotColor, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            'inline-block h-1.5 w-1.5 rounded-full',
            pulse && 'animate-pulse',
            dotColor || 'bg-current'
          )}
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
