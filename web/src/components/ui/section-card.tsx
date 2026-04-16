import type { ReactNode } from "react";

export type SectionCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
};

export function SectionCard({
  title,
  description,
  aside,
  footer,
  children,
  className,
  as = "section",
}: SectionCardProps) {
  const Tag = as;
  const composed = className ? `section-card ${className}` : "section-card";
  return (
    <Tag className={composed}>
      {(title || aside || description) && (
        <header className="section-card__header">
          <div className="section-card__heading">
            {title && <h2 className="section-card__title">{title}</h2>}
            {description && <p className="section-card__description">{description}</p>}
          </div>
          {aside && <div className="section-card__aside">{aside}</div>}
        </header>
      )}
      <div className="section-card__body">{children}</div>
      {footer && <footer className="section-card__footer">{footer}</footer>}
    </Tag>
  );
}
