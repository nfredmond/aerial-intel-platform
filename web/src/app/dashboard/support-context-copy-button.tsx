"use client";

import { useEffect, useRef, useState } from "react";

type SupportContextCopyButtonProps = {
  text: string;
  buttonLabel?: string;
  successMessage?: string;
  fallbackStatusMessage?: string;
  fallbackAriaLabel?: string;
  fallbackHintMessage?: string;
};

type CopyState = "idle" | "copied" | "error";

export function SupportContextCopyButton({
  text,
  buttonLabel = "Copy support context",
  successMessage = "Support context copied. Paste it into support chat or email.",
  fallbackStatusMessage = "Couldn’t access your clipboard. Use the ready-to-copy text below.",
  fallbackAriaLabel = "Support context text",
  fallbackHintMessage = "Press Ctrl/Cmd+C, then paste into support chat or email.",
}: SupportContextCopyButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTextRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (copyState !== "error") {
      return;
    }

    fallbackTextRef.current?.focus();
    fallbackTextRef.current?.select();
  }, [copyState]);

  async function handleCopy() {
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setCopyState("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");

      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }

      resetTimeoutRef.current = setTimeout(() => {
        setCopyState("idle");
      }, 4000);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="stack-xs">
      <button className="button button-secondary" type="button" onClick={handleCopy}>
        {buttonLabel}
      </button>

      {copyState === "copied" ? (
        <p className="helper-copy muted" role="status">
          {successMessage}
        </p>
      ) : null}

      {copyState === "error" ? (
        <div className="stack-xs">
          <p className="helper-copy" role="status">
            {fallbackStatusMessage}
          </p>
          <textarea
            ref={fallbackTextRef}
            aria-label={fallbackAriaLabel}
            className="support-context-manual-copy"
            readOnly
            rows={Math.min(12, Math.max(4, text.split("\n").length + 1))}
            value={text}
          />
          <p className="helper-copy muted">{fallbackHintMessage}</p>
        </div>
      ) : null}
    </div>
  );
}
