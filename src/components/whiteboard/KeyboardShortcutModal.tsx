"use client";

import React, { useEffect, useRef } from "react";

export interface KeyboardShortcut {
  category: "Tools" | "Actions" | "Navigation" | "General";
  keys: string[];
  action: string;
  description: string;
}

export const CANVAS_KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { category: "Tools", keys: ["V", "1"], action: "Select / Pointer", description: "Select and transform shapes or sticky notes" },
  { category: "Tools", keys: ["P", "2"], action: "Pen Tool", description: "Freehand drawing and sketching" },
  { category: "Tools", keys: ["E", "3"], action: "Eraser Tool", description: "Erase lines and strokes" },
  { category: "Tools", keys: ["R", "4"], action: "Rectangle Tool", description: "Draw geometric boxes and wireframe bounds" },
  { category: "Tools", keys: ["C", "5"], action: "Circle / Ellipse Tool", description: "Draw circles and flow diagram nodes" },
  { category: "Tools", keys: ["L", "6"], action: "Line Tool", description: "Draw connectors and straight vectors" },
  { category: "Tools", keys: ["S", "7"], action: "Sticky Note Tool", description: "Add editable collaborative sticky notes" },
  { category: "Actions", keys: ["Ctrl", "Z"], action: "Undo", description: "Revert the last stroke or mutation" },
  { category: "Actions", keys: ["Ctrl", "Y"], action: "Redo", description: "Reapply an undone action" },
  { category: "Actions", keys: ["Ctrl", "Shift", "E"], action: "Export PNG", description: "Export canvas as transparent high-res PNG" },
  { category: "Actions", keys: ["Ctrl", "Shift", "S"], action: "Export SVG", description: "Export canvas as scalable vector SVG" },
  { category: "Actions", keys: ["Delete"], action: "Delete Selected", description: "Remove selected shapes from the board" },
  { category: "General", keys: ["?"], action: "Toggle Shortcuts", description: "Open or close this keyboard shortcuts guide" },
  { category: "General", keys: ["Esc"], action: "Close / Deselect", description: "Close modal or cancel active tool selection" },
];

export interface KeyboardShortcutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutModal({ isOpen, onClose }: KeyboardShortcutModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation & trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      modalRef.current?.focus();
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const categories: KeyboardShortcut["category"][] = ["Tools", "Actions", "General"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-modal-title"
      aria-describedby="shortcut-modal-desc"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl text-zinc-100 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
          <div>
            <h2 id="shortcut-modal-title" className="text-xl font-bold text-white">
              Whiteboard Keyboard Shortcuts
            </h2>
            <p id="shortcut-modal-desc" className="text-sm text-zinc-400">
              Press <kbd className="px-1.5 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded font-mono">?</kbd> at any time to open this cheatsheet.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts dialog"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-2">
          {categories.map((cat) => {
            const list = CANVAS_KEYBOARD_SHORTCUTS.filter((s) => s.category === cat);
            return (
              <div key={cat} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {cat}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {list.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/50 border border-zinc-800/80 hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-zinc-200">{item.action}</span>
                        <span className="text-xs text-zinc-400">{item.description}</span>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        {item.keys.map((k, kIdx) => (
                          <React.Fragment key={kIdx}>
                            {kIdx > 0 && <span className="text-xs text-zinc-500">+</span>}
                            <kbd className="px-2 py-0.5 text-xs font-mono font-semibold bg-zinc-700 border border-zinc-600 rounded shadow-sm text-zinc-200">
                              {k}
                            </kbd>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
