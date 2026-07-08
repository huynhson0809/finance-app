import type { ReactNode } from 'react';

export function KeypadButton({
  label,
  children,
  onPress,
}: {
  label: string;
  children: ReactNode;
  onPress: (label: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="h-14 rounded-2xl border border-white/10 bg-white/[0.075] text-xl font-semibold text-white active:scale-[0.98]"
      onClick={() => onPress(label)}
    >
      {children}
    </button>
  );
}
