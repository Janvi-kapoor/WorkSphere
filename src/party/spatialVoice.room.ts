/**
 * spatialVoice.room.ts
 * Real-time low-latency audio transmission room built on PartyKit.
 * Supports binary Opus packet interleaving, spatial vector routing,
 * and JSON coordinate signaling for synchronized 3D spatial audio.
 * Prevents split-brain duplicate peer entries on network reconnections (#5612).
 */

import type * as Party from "partykit/server";

export interface SpatialVector {
  x: number;
  y: number;
  z: number;
}

export interface SpatialUpdate {
  peerId: string;
  userId?: string;
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

export interface PeerAudioState {
  peerId: string;
  userId?: string;
  position: SpatialVector;
  lastSequence: number;
  lastTimestamp: number;
  packetsReceived: number;
  packetsLost: number;
}

/**
 * Binary Packet Header Layout (32 Bytes total):
 * Offset  0 -  7: uint64 timestamp
 * Offset  8 - 11: uint32 sequenceNumber
 * Offset 12 - 15: float32 x coordinate
 * Offset 16 - 19: float32 y coordinate
 * Offset 20 - 23: float32 z coordinate
 * Offset 24 - 31: 8-byte peerId prefix or hash
 * Offset 32+: Opus encoded audio frame payload
 */
export const PACKET_HEADER_SIZE = 32;

export default class SpatialVoiceRoom implements Party.Server {
  private peers: Map<string, PeerAudioState> = new Map();
  private positions: Map<string, SpatialUpdate> = new Map();

  // Mapping to track and prevent duplicate connections for the same user (#5612)
  private userToConnection: Map<string, string> = new Map();
  private connectionToUser: Map<string, string> = new Map();

  constructor(readonly room: Party.Room) {}

  /**
   * Registers a user connection and evicts any existing stale connection for the same user.
   */
  public handleUserConnect(userId: string, conn: Party.Connection): void {
    const existingConnId = this.userToConnection.get(userId);
    if (existingConnId && existingConnId !== conn.id) {
      console.log(`[SpatialVoiceRoom] Split-brain detected for user ${userId}. Evicting stale connection ${existingConnId}`);

      // Attempt to close stale connection cleanly
      try {
        const staleConn = this.room.getConnection ? this.room.getConnection(existingConnId) : null;
        if (staleConn) {
          staleConn.send(
            JSON.stringify({
              type: "SESSION_REPLACED",
              reason: "Duplicate connection detected for the same userId",
            })
          );
          staleConn.close();
        }
      } catch (err) {
        console.warn(`Error closing stale connection ${existingConnId}:`, err);
      }

      // Immediately unregister stale connection from internal state
      this.peers.delete(existingConnId);
      this.positions.delete(existingConnId);
      this.connectionToUser.delete(existingConnId);

      // Broadcast PEER_LEFT for the stale connection
      this.room.broadcast(
        JSON.stringify({
          type: "PEER_LEFT",
          peerId: existingConnId,
          userId,
          reason: "SESSION_REPLACED",
        }),
        [conn.id]
      );
    }

    // Register active mapping
    this.userToConnection.set(userId, conn.id);
    this.connectionToUser.set(conn.id, userId);

    const peer = this.peers.get(conn.id);
    if (peer) {
      peer.userId = userId;
    }
  }

  public getActiveConnectionForUser(userId: string): string | undefined {
    return this.userToConnection.get(userId);
  }

  public getUserForConnection(connId: string): string | undefined {
    return this.connectionToUser.get(connId);
  }

  public getPeerCount(): number {
    return this.peers.size;
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    let userId: string | null = null;
    try {
      if (ctx?.request?.url) {
        const url = new URL(ctx.request.url);
        userId = url.searchParams.get("userId") || url.searchParams.get("user");
      }
    } catch {
      // Ignore URL parsing errors
    }

    this.peers.set(conn.id, {
      peerId: conn.id,
      userId: userId || undefined,
      position: { x: 0, y: 0, z: 0 },
      lastSequence: 0,
      lastTimestamp: Date.now(),
      packetsReceived: 0,
      packetsLost: 0,
    });

    if (userId) {
      this.handleUserConnect(userId, conn);
    }

    // Send initial state of all users to the newly connected peer
    const initialState = Array.from(this.positions.values());
    conn.send(
      JSON.stringify({
        type: "INITIAL_STATE",
        peers: initialState,
      })
    );

    // Notify room members of newly joined voice participant
    this.room.broadcast(
      JSON.stringify({
        type: "voice-peer-joined",
        peerId: conn.id,
        userId: userId || undefined,
      }),
      [conn.id]
    );
  }

  async onDisconnect(conn: Party.Connection) {
    const userId = this.connectionToUser.get(conn.id);
    if (userId) {
      if (this.userToConnection.get(userId) === conn.id) {
        this.userToConnection.delete(userId);
      }
      this.connectionToUser.delete(conn.id);
    }

    this.peers.delete(conn.id);
    this.positions.delete(conn.id);
    this.room.broadcast(
      JSON.stringify({
        type: "PEER_LEFT",
        peerId: conn.id,
        userId,
      })
    );
  }

  async onMessage(message: string | ArrayBuffer, sender: Party.Connection) {
    // 1. Binary Opus Frame Fast-Path
    if (message instanceof ArrayBuffer) {
      if (message.byteLength < PACKET_HEADER_SIZE) return;

      const view = new DataView(message);
      const timestampHigh = view.getUint32(0, false);
      const timestampLow = view.getUint32(4, false);
      const timestamp = (BigInt(timestampHigh) << 32n) | BigInt(timestampLow);
      const sequenceNumber = view.getUint32(8, false);

      const x = view.getFloat32(12, false);
      const y = view.getFloat32(16, false);
      const z = view.getFloat32(20, false);

      const peerState = this.peers.get(sender.id);
      if (peerState) {
        if (peerState.lastSequence > 0 && sequenceNumber > peerState.lastSequence + 1) {
          peerState.packetsLost += sequenceNumber - peerState.lastSequence - 1;
        }
        peerState.lastSequence = sequenceNumber;
        peerState.lastTimestamp = Number(timestamp);
        peerState.packetsReceived++;
        peerState.position = { x, y, z };
      }

      this.positions.set(sender.id, {
        peerId: sender.id,
        userId: this.connectionToUser.get(sender.id),
        x,
        y,
        z,
        timestamp: Number(timestamp),
      });

      // Blind binary broadcast to other peers
      this.room.broadcast(message, [sender.id]);
      return;
    }

    // 2. JSON Signaling Fast-Path
    try {
      const parsed = JSON.parse(message as string);

      if (
        parsed.type === "AUTH" ||
        parsed.type === "JOIN" ||
        parsed.type === "IDENTIFY" ||
        parsed.type === "AUTHENTICATE"
      ) {
        const userId = parsed.userId || parsed.payload?.userId;
        if (userId) {
          this.handleUserConnect(userId, sender);
        }
        return;
      }

      if (parsed.type === "POSITION_UPDATE" || parsed.type === "position-update") {
        const x = parsed.x ?? parsed.position?.x ?? 0;
        const y = parsed.y ?? parsed.position?.y ?? 0;
        const z = parsed.z ?? parsed.position?.z ?? 0;

        const update: SpatialUpdate = {
          peerId: sender.id,
          userId: this.connectionToUser.get(sender.id),
          x,
          y,
          z,
          timestamp: Date.now(),
        };

        this.positions.set(sender.id, update);

        const peer = this.peers.get(sender.id);
        if (peer) {
          peer.position = { x, y, z };
        }

        // Broadcast to all other peers
        this.room.broadcast(
          JSON.stringify({
            type: "PEER_MOVED",
            payload: update,
          }),
          [sender.id]
        );
      }
    } catch (error) {
      console.error("Error processing spatial voice message:", error);
    }
  }
}