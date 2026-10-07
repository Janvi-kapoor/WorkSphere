import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MessageTranslateButton } from "@/components/chat/ChatMessages";

describe("MessageTranslateButton (#4602)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders translate button and toggles translation state", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ translatedText: "Bonjour le monde" }),
    });

    const onTranslationChange = jest.fn();

    render(
      <MessageTranslateButton
        messageId="msg-1"
        originalText="Hello world"
        targetLanguage="fr"
        onTranslationChange={onTranslationChange}
      />
    );

    const button = screen.getByTestId("translate-btn-msg-1");
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-label", "Translate message");

    // Click to translate
    fireEvent.click(button);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello world",
          targetLanguage: "fr",
        }),
      });
    });

    await waitFor(() => {
      expect(onTranslationChange).toHaveBeenCalledWith("Bonjour le monde", "Auto-detected");
      expect(button).toHaveAttribute("aria-label", "Show original text");
    });

    // Click again to toggle back to original
    fireEvent.click(button);
    expect(onTranslationChange).toHaveBeenCalledWith(null, "Original");
    expect(button).toHaveAttribute("aria-label", "Translate message");
  });

  it("uses cached translation in memory to avoid duplicate network requests", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ translatedText: "Hola mundo" }),
    });

    const onTranslationChange = jest.fn();

    const { rerender } = render(
      <MessageTranslateButton
        messageId="msg-cache"
        originalText="Hello world"
        targetLanguage="es"
        onTranslationChange={onTranslationChange}
      />
    );

    const button = screen.getByTestId("translate-btn-msg-cache");

    // First click: network fetch
    fireEvent.click(button);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // Toggle off
    fireEvent.click(button);

    // Toggle on again: should use memory cache without calling fetch a second time
    fireEvent.click(button);
    await waitFor(() => {
      expect(onTranslationChange).toHaveBeenLastCalledWith("Hola mundo", "Auto-detected");
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
