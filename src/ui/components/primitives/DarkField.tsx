import {
  Children,
  cloneElement,
  useId,
  type ReactElement,
} from 'react';

type LabelableControlProps = {
  id?: string;
};

type DarkFieldControl = ReactElement<LabelableControlProps>;

export function DarkField({
  id,
  label,
  children,
}: {
  id?: string;
  label: string;
  children: DarkFieldControl;
}) {
  const generatedId = useId();
  const child = Children.only(children) as DarkFieldControl;
  const childId = child.props.id;
  const controlId = childId ?? id ?? generatedId;
  const control = childId == null ? cloneElement(child, { id: controlId }) : child;

  return (
    <div className="block text-sm font-medium text-slate-300">
      <label htmlFor={controlId}>{label}</label>
      <div className="mt-2 [&_input]:w-full [&_input]:rounded-2xl [&_input]:border [&_input]:border-white/10 [&_input]:bg-white/[0.07] [&_input]:px-4 [&_input]:py-3 [&_input]:text-base [&_input]:text-white [&_input]:outline-none [&_input]:transition [&_input]:placeholder:text-slate-500 [&_input:focus]:border-sky-300/70">
        {control}
      </div>
    </div>
  );
}
