"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { SupportDiagnosticsPacket } from "@/lib/auth/access-insights";

export type SupportDiagnosticsPanelProps = {
  packet: SupportDiagnosticsPacket;
};

type TabKey = "summary" | "email" | "json" | "markdown";
type CopyState = "idle" | "copied" | "error";

const TABS: Array<{ key: TabKey; label: string; hint: string; ariaLabel: string }> = [
  {
    key: "summary",
    label: "Summary",
    hint: "Short triage block — paste into support chat, ticket bodies, or call notes.",
    ariaLabel: "Support triage summary text",
  },
  {
    key: "email",
    label: "Email draft",
    hint: "Subject + body ready to paste into your email client.",
    ariaLabel: "Support email draft text",
  },
  {
    key: "json",
    label: "JSON",
    hint: "Structured payload for ticket forms that accept JSON.",
    ariaLabel: "Support context JSON text",
  },
  {
    key: "markdown",
    label: "Markdown",
    hint: "Markdown list for rich-text tickets, docs, and chat.",
    ariaLabel: "Support context markdown text",
  },
];

export function SupportDiagnosticsPanel({ packet }: SupportDiagnosticsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTextRef = useRef<HTMLTextAreaElement | null>(null);

  const tabContent = useMemo<Record<TabKey, string>>(
    () => ({
      summary: packet.summary,
      email: packet.emailDraft,
      json: packet.json,
      markdown: packet.markdown,
    }),
    [packet]
  );

  const activeText = tabContent[activeTab];
  const activeTabMeta = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (copyState !== "error") return;
    fallbackTextRef.current?.focus();
    fallbackTextRef.current?.select();
  }, [copyState]);

  function selectTab(tab: TabKey) {
    setActiveTab(tab);
    setCopyState("idle");
  }

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
      await navigator.clipboard.writeText(activeText);
      setCopyState("copied");
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = setTimeout(() => setCopyState("idle"), 4000);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="support-diagnostics-panel stack-sm">
      <div className="support-diagnostics-tablist" role="tablist" aria-label="Support diagnostics format">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`button ${isActive ? "button-primary" : "button-secondary"}`}
              onClick={() => selectTab(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <p className="helper-copy muted">{activeTabMeta.hint}</p>

      <textarea
        aria-label={activeTabMeta.ariaLabel}
        className="support-context-manual-copy"
        readOnly
        rows={Math.min(14, Math.max(5, activeText.split("\n").length + 1))}
        value={activeText}
      />

      <button className="button button-secondary" type="button" onClick={handleCopy}>
        Copy {activeTabMeta.label.toLowerCase()}
      </button>

      {copyState === "copied" && (
        <p className="helper-copy muted" role="status">
          Copied. Paste it into support chat, tickets, or your email client.
        </p>
      )}

      {copyState === "error" && (
        <div className="stack-xs">
          <p className="helper-copy" role="status">
            Couldn’t access your clipboard. Select the text above and press Ctrl/Cmd+C.
          </p>
          <textarea
            ref={fallbackTextRef}
            aria-label={`${activeTabMeta.ariaLabel} (fallback)`}
            className="support-context-manual-copy"
            readOnly
            rows={Math.min(14, Math.max(5, activeText.split("\n").length + 1))}
            value={activeText}
          />
        </div>
      )}
    </div>
  );
}
