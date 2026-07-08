import type { HTMLAttributes, ReactNode } from 'react';

interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'article';
  children: ReactNode;
}

export function GlassPanel({
  as: Component = 'section',
  className = '',
  children,
  ...props
}: GlassPanelProps) {
  return (
    <Component
      className={[
        'rounded-[1.4rem] border border-white/10 bg-white/[0.065] shadow-[0_18px_44px_rgba(0,0,0,0.25)]',
        'backdrop-blur-md',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </Component>
  );
}
