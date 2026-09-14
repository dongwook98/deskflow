import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  /** label 의 htmlFor 와 자식 input 의 id 를 같게 맞춘다 (클릭 시 포커스, 스크린리더 연결). */
  htmlFor: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
