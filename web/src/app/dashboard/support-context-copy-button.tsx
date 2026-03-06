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

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

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
        <p className="helper-copy" role="status">
          Couldn’t access your clipboard. Please copy the support fields manually.
        </p>
      ) : null}
    </div>
  );
}
