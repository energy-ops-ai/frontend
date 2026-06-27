// Minimal shadcn-style primitives. Hand-rolled for P0 so we're not blocked on
// the shadcn CLI; we can adopt the full registry later (same class conventions).
import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-neutral-700/70 bg-neutral-800/60 text-neutral-100 shadow-sm',
        className
      )}
      {...props}
    />
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
};

export function Button({
  className,
  variant = 'default',
  ...props
}: ButtonProps) {
  const variants: Record<string, string> = {
    default:
      'border border-neutral-700 bg-neutral-800 hover:border-[var(--accent)]',
    primary:
      'border border-[var(--accent)] bg-[var(--accent)] text-white hover:opacity-90',
    danger:
      'border border-neutral-700 bg-neutral-800 hover:border-red-500 hover:text-red-400',
    ghost: 'border border-transparent hover:bg-neutral-800'
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-1.5 text-sm text-neutral-100 transition disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        className
      )}
      {...props}
    />
  );
}
