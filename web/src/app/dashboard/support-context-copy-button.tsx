"use client";

import { useEffect, useRef, useState } from "react";

type SupportContextCopyButtonProps = {
  text: string;
};

type CopyState = "idle" | "copied" | "error";

export function SupportContextCopyButton({
  text,
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
        Copy support context
      </button>

      {copyState === "copied" ? (
        <p className="helper-copy muted" role="status">
          Support context copied. Paste it into support chat or email.
        </p>
      ) : null}

      {copyState === "error" ? (
        <div className="stack-xs">
          <p className="helper-copy" role="status">
            Couldn’t access your clipboard. Use the ready-to-copy text below.
          </p>
          <textarea
            ref={fallbackTextRef}
            aria-label="Support context text"
            className="support-context-manual-copy"
            readOnly
            rows={Math.min(12, Math.max(4, text.split("\n").length + 1))}
            value={text}
          />
          <p className="helper-copy muted">
            Press Ctrl/Cmd+C, then paste into support chat or email.
          </p>
        </div>
      ) : null}
    </div>
  );
}
