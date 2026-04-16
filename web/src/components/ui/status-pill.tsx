import type { ReactNode } from "react";
import { statusPillClassName, type Tone } from "@/lib/ui/tones";

export type StatusPillProps = {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
};

export function StatusPill({ tone = "neutral", children, className, title }: StatusPillProps) {
  const composed = className
    ? `${statusPillClassName(tone)} ${className}`
    : statusPillClassName(tone);
  return (
    <span className={composed} title={title}>
      {children}
    </span>
  );
}
