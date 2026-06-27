import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--secondary)] text-[var(--secondary-foreground)]',
        success:
          'bg-emerald-950 text-emerald-400',
        warning:
          'bg-amber-950 text-amber-300',
        danger:
          'bg-red-950 text-red-400',
        outline:
          'border border-[var(--border)] text-[var(--muted-foreground)]'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge };
