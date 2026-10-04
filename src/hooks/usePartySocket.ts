"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import usePartySocketBase from "partysocket/react";
import { useAuth } from "@clerk/nextjs";
import {
  attachJitteredBackoff,
  PARTY_SOCKET_RECONNECT_OPTIONS,
  PartyReconnectOptions,
} from "@/lib/partySocketReconnect";

type PartySocketOptions = Parameters<typeof usePartySocketBase>[0];

export interface UsePartySocketOptions extends PartySocketOptions {
  /** Base reconnection delay in ms (defaults to 1000) */
  baseDelay?: number;
  /** Maximum reconnection delay cap in ms (defaults to 30000) */
  maxDelay?: number;
  /** Callback fired when connection state changes */
  onConnectionStatusChange?: (
    status: "connected" | "reconnecting" | "offline"
  ) => void;
}

export type ConnectionStatus = "connected" | "reconnecting" | "offline";

export interface CalculateJitteredBackoffOptions {
  baseDelay?: number;
  maxDelay?: number;
  random?: () => number;
}

/**
 * Full-jitter exponential backoff formula:
 * twait = min(tmax, tbase * 2^attempt) * random(0.8, 1.2)
 *
 * @param attempt - Reconnection attempt counter (0, 1, 2, ...)
 * @param options - Configuration for base, max, and random generator
 */
export function calculateJitteredBackoff(
  attempt: number,
  options: CalculateJitteredBackoffOptions = {}
): number {
  if (attempt <= 0) return 0;

  const baseDelay = options.baseDelay ?? PARTY_SOCKET_RECONNECT_OPTIONS.minReconnectionDelay; // 1,000ms
  const maxDelay = options.maxDelay ?? PARTY_SOCKET_RECONNECT_OPTIONS.maxReconnectionDelay;   // 30,000ms
  const randomFn = options.random ?? Math.random;

  // Exponential growth capped at maxDelay: min(tmax, tbase * 2^attempt)
  // For attempt 1: base * 2^0 = base
  // For attempt 2: base * 2^1 = 2 * base
  // Using attempt - 1 for zero-indexed retry growth or attempt:
  // twait = min(tmax, tbase * 2^attempt)
  const cappedBase = Math.min(maxDelay, baseDelay * Math.pow(2, attempt - 1));
  
  // Random jitter in range [0.8, 1.2]: 0.8 + random() * 0.4
  const jitterFactor = 0.8 + randomFn() * 0.4;
  const delayWithJitter = cappedBase * jitterFactor;

  // Bound within [0, maxDelay]
  return Math.round(Math.min(maxDelay, Math.max(0, delayWithJitter)));
}

/**
 * Drop-in hook for PartyKit WebSocket connections with:
 * 1. Full-jitter exponential backoff on disconnection:
 *    twait = min(tmax, tbase * 2^attempt) * random(0.8, 1.2)
 * 2. 30s cap on reconnection delay.
 * 3. Subtle "Reconnecting..." status indicator badge in the UI.
 * 4. Automatic reset of backoff attempt counter upon successful message handshake.
 */
export default function usePartySocket(options: UsePartySocketOptions) {
  const { getToken } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("offline");
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);
  const reconnectAttemptRef = useRef<number>(0);

  const {
    baseDelay = PARTY_SOCKET_RECONNECT_OPTIONS.minReconnectionDelay,
    maxDelay = PARTY_SOCKET_RECONNECT_OPTIONS.maxReconnectionDelay,
    onConnectionStatusChange,
    ...socketOptions
  } = options;

  const socket = usePartySocketBase({
    ...PARTY_SOCKET_RECONNECT_OPTIONS,
    ...socketOptions,
  });

  const attachedSocket = attachJitteredBackoff(socket);

  // Override delay calculator to precisely follow twait = min(tmax, tbase * 2^attempt) * random(0.8, 1.2)
  if (attachedSocket) {
    (attachedSocket as any)._getNextDelay = function () {
      const attempt = (this._retryCount ?? 0) + 1;
      return calculateJitteredBackoff(attempt, { baseDelay, maxDelay });
    };
  }

  // Update status and monitor reconnection/handshake cycles
  useEffect(() => {
    if (
      !attachedSocket ||
      typeof (attachedSocket as any).addEventListener !== "function"
    ) {
      return;
    }

    const handleOpen = () => {
      // Reset backoff counter upon connection establishment
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
      setConnectionStatus("connected");
      onConnectionStatusChange?.("connected");
    };

    const handleMessage = () => {
      // Reset backoff counter upon successful message handshake
      if (reconnectAttemptRef.current > 0) {
        reconnectAttemptRef.current = 0;
        setReconnectAttempt(0);
      }
      setConnectionStatus("connected");
    };

    const handleClose = async (event: any) => {
      reconnectAttemptRef.current += 1;
      setReconnectAttempt(reconnectAttemptRef.current);
      setConnectionStatus("reconnecting");
      onConnectionStatusChange?.("reconnecting");

      // Intercept 4001 token expiration and refresh Clerk token
      if (event?.code === 4001) {
        try {
          const freshToken = await getToken({ skipCache: true });
          if (freshToken) {
            if ((attachedSocket as any).query) {
              (attachedSocket as any).query.token = freshToken;
            }
            (attachedSocket as any).__worksphereForceReconnect?.();
          }
        } catch (err) {
          console.error(
            "[PartySocket] Failed to refresh expired Clerk token:",
            err
          );
        }
      }
    };

    const handleError = () => {
      setConnectionStatus("reconnecting");
      onConnectionStatusChange?.("reconnecting");
    };

    (attachedSocket as any).addEventListener("open", handleOpen);
    (attachedSocket as any).addEventListener("message", handleMessage);
    (attachedSocket as any).addEventListener("close", handleClose);
    (attachedSocket as any).addEventListener("error", handleError);

    // Initial state check
    if ((attachedSocket as any).readyState === 1) {
      setConnectionStatus("connected");
    }

    return () => {
      if (typeof (attachedSocket as any).removeEventListener === "function") {
        (attachedSocket as any).removeEventListener("open", handleOpen);
        (attachedSocket as any).removeEventListener("message", handleMessage);
        (attachedSocket as any).removeEventListener("close", handleClose);
        (attachedSocket as any).removeEventListener("error", handleError);
      }
    };
  }, [attachedSocket, getToken, onConnectionStatusChange]);

  // Expose connection state properties directly on the socket instance
  if (attachedSocket) {
    (attachedSocket as any).connectionStatus = connectionStatus;
    (attachedSocket as any).isReconnecting = connectionStatus === "reconnecting";
    (attachedSocket as any).reconnectAttempt = reconnectAttempt;
  }

  return attachedSocket;
}
