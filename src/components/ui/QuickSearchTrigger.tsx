"use client";

import React, { useRef } from "react";
import { Search, X } from "lucide-react";
import { openCommandPalette, usePlatformModifier } from "@/hooks/usePlatformModifier";
import { KeyboardShortcutBadge } from "./KeyboardShortcutBadge";
import { ShortcutTooltip } from "./ShortcutTooltip";

export interface QuickSearchTriggerProps {
  className?: string;
  variant?: "navbar" | "compact" | "icon-only";
  value?: string;
  onChange?: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
}

/**
 * Quick search button with visual keyboard shortcut hint (Ctrl+K / ⌘K) and accessible hover tooltip.
 * If value/onChange is provided or used with an input query, renders a clear button when non-empty.
 */
export function QuickSearchTrigger({
  className = "",
  variant = "navbar",
  value,
  onChange,
  onClear,
  placeholder,
}: QuickSearchTriggerProps) {
  const { formatShortcut, getAriaKeyshortcuts } = usePlatformModifier();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    openCommandPalette();
  };

  const handleClear = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (onChange) onChange("");
    if (onClear) onClear();
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const fullLabel = `Quick search (${formatShortcut("K")})`;

  if (variant === "icon-only") {
    return (
      <ShortcutTooltip content="Quick search" shortcut="K" position="bottom">
        <button
          type="button"
          onClick={handleClick}
          aria-label={fullLabel}
          aria-keyshortcuts={getAriaKeyshortcuts("K")}
          data-testid="quick-search-trigger-icon"
          className={`p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-white/60 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors ${className}`}
        >
          <Search className="w-5 h-5" />
        </button>
      </ShortcutTooltip>
    );
  }

  // If value or onChange is provided, render an interactive input with clear search button
  if (typeof value !== "undefined" || typeof onChange !== "undefined") {
    const hasQuery = Boolean(value && value.length > 0);

    return (
      <div
        className={`group relative flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100/80 dark:bg-white/5 border border-zinc-200/80 dark:border-white/10 rounded-xl transition-all shadow-sm focus-within:ring-2 focus-within:ring-blue-500 ${className}`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={value ?? ""}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder ?? "Quick search..."}
            data-testid="quick-search-input"
            aria-label={fullLabel}
            aria-keyshortcuts={getAriaKeyshortcuts("K")}
            className="w-full bg-transparent text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none"
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasQuery ? (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              data-testid="quick-search-clear-button"
              className="p-0.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <KeyboardShortcutBadge
              shortcut="K"
              size="xs"
              variant="subtle"
              className="group-hover:border-zinc-300 dark:group-hover:border-zinc-600 transition-colors"
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <ShortcutTooltip content="Search venues, bookings, settings" shortcut="K" position="bottom">
      <button
        type="button"
        onClick={handleClick}
        aria-label={fullLabel}
        aria-keyshortcuts={getAriaKeyshortcuts("K")}
        data-testid="quick-search-trigger"
        className={`group flex items-center justify-between gap-3 px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100/80 dark:bg-white/5 hover:bg-zinc-200/80 dark:hover:bg-white/10 border border-zinc-200/80 dark:border-white/10 rounded-xl transition-all shadow-sm hover:shadow ${className}`}
      >
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
          <span className="hidden sm:inline font-medium">Quick search...</span>
          <span className="sm:hidden font-medium">Search...</span>
        </div>
        <KeyboardShortcutBadge
          shortcut="K"
          size="xs"
          variant="subtle"
          className="group-hover:border-zinc-300 dark:group-hover:border-zinc-600 transition-colors"
        />
      </button>
    </ShortcutTooltip>
  );
}
