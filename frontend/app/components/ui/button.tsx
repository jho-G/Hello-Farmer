import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest-700 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        default:
          'bg-brand-forest-800 text-white hover:bg-brand-forest-700 active:scale-[0.98] shadow-sm',
        gold:
          'bg-brand-gold-600 text-white hover:bg-brand-gold-700 active:scale-[0.98] shadow-sm font-semibold',
        secondary:
          'bg-brand-forest-50 text-brand-forest-800 hover:bg-brand-forest-100 border border-brand-forest-100 active:scale-[0.98]',
        outline:
          'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98] shadow-xs',
        ghost:
          'text-slate-700 hover:bg-brand-forest-50 hover:text-brand-forest-800 active:scale-[0.98]',
        destructive:
          'bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] shadow-sm',
        link:
          'text-brand-forest-700 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-xl px-6 text-base font-semibold',
        icon: 'h-10 w-10 p-0',
        iconSm: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-current" />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
