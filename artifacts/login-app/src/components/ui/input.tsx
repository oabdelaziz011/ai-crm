import * as React from 'react';
import { cn } from '@/lib/utils';

const LTR_INPUT_TYPES = new Set([
  'date',
  'datetime-local',
  'email',
  'month',
  'number',
  'tel',
  'time',
  'url',
  'week',
]);

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, dir, ...props }, ref) => {
    const resolvedDir = dir ?? (type && LTR_INPUT_TYPES.has(type) ? 'ltr' : undefined);

    return (
      <input
        type={type}
        dir={resolvedDir}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base text-start shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          resolvedDir === 'ltr' && 'text-left',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
