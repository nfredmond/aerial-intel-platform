import type { ReactNode } from "react";

export type EmptyStateProps = {
  children: ReactNode;
  className?: string;
};

export function EmptyState({ children, className }: EmptyStateProps) {
  const composed = className ? `empty-state ${className}` : "empty-state";
  return <p className={composed}>{children}</p>;
}
