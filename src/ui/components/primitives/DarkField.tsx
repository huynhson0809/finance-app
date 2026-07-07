import type { ReactNode } from 'react';

export function DarkField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-300">
      <span>{label}</span>
      <div className="mt-2 [&_input]:w-full [&_input]:rounded-2xl [&_input]:border [&_input]:border-white/10 [&_input]:bg-white/[0.07] [&_input]:px-4 [&_input]:py-3 [&_input]:text-base [&_input]:text-white [&_input]:outline-none [&_input]:transition [&_input]:placeholder:text-slate-500 [&_input:focus]:border-sky-300/70">
        {children}
      </div>
    </label>
  );
}
