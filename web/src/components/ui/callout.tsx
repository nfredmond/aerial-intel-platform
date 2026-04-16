import type { ReactNode } from "react";
import { calloutClassName, type Tone } from "@/lib/ui/tones";

export type CalloutProps = {
  tone?: Tone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Callout({ tone = "info", title, children, className }: CalloutProps) {
  const composed = className ? `${calloutClassName(tone)} ${className}` : calloutClassName(tone);
  return (
    <div className={composed} role={tone === "warning" || tone === "danger" ? "alert" : undefined}>
      {title && <strong className="callout__title">{title}</strong>}
      <div className="callout__body">{children}</div>
    </div>
  );
}
