/**
 * spatialVoice.room.ts
 * Real-time low-latency audio transmission room built on PartyKit.
 * Manages Opus audio packet interleaving, binary packet header packing/unpacking,
 * sequence tracking, spatial vector routing, and sub-50ms audio distribution (#5627).
 */

import type * as Party from "partykit/server";

export interface SpatialVector {
  x: number;
  y: number;
  z: number;
}

export interface PeerAudioState {
  peerId: string;
  position: SpatialVector;
  lastSequence: number;
  lastTimestamp: number;
  packetsReceived: number;
  packetsLost: number;
}

/**
 * Binary Packet Header Layout (32 Bytes total):
 * Offset  0 -  7: uint64 timestamp (millisecond epoch / high-precision performance.now)
 * Offset  8 - 11: uint32 sequenceNumber
 * Offset 12 - 15: float32 x coordinate (spatial position)
 * Offset 16 - 19: float32 y coordinate (spatial position)
 * Offset 20 - 23: float32 z coordinate (spatial position)
 * Offset 24 - 31: 8-byte ASCII/UTF-8 peerId short prefix or UUID hash
 * Offset 32+: Opus encoded audio frame payload
 */
export const PACKET_HEADER_SIZE = 32;

export default class SpatialVoiceRoom implements Party.Server {
  private peers: Map<string, PeerAudioState> = new Map();

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    this.peers.set(conn.id, {
      peerId: conn.id,
      position: { x: 0, y: 0, z: 0 },
      lastSequence: 0,
      lastTimestamp: Date.now(),
      packetsReceived: 0,
      packetsLost: 0,
    });

    // Notify room members of newly joined voice participant
    this.room.broadcast(
      JSON.stringify({
        type: "voice-peer-joined",
        peerId: conn.id,
      }),
      [conn.id]
    );
  }

  async onDisconnect(conn: Party.Connection) {
    this.peers.delete(conn.id);
    this.room.broadcast(
      JSON.stringify({
        type: "voice-peer-left",
        peerId: conn.id,
      })
    );
  }

  async onMessage(message: string | ArrayBuffer, sender: Party.Connection) {
    // Binary Opus Frame Fast-Path
    if (message instanceof ArrayBuffer) {
      if (message.byteLength < PACKET_HEADER_SIZE) return;

      const view = new DataView(message);
      // High-resolution timestamp & sequence
      const timestampHigh = view.getUint32(0, false);
      const timestampLow = view.getUint32(4, false);
      const timestamp = (BigInt(timestampHigh) << 32n) | BigInt(timestampLow);
      const sequenceNumber = view.getUint32(8, false);

      // Spatial coordinates
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

      // Broadcast raw binary packet to other room peers with zero memory reallocation
      this.room.broadcast(message, [sender.id]);
      return;
    }

    // JSON Control/Telemetry Signaling (position updates, mute, ping)
    try {
      const data = JSON.parse(message as string);
      if (data.type === "position-update") {
        const peer = this.peers.get(sender.id);
        if (peer && data.position) {
          peer.position = data.position;
          this.room.broadcast(
            JSON.stringify({
              type: "peer-position",
              peerId: sender.id,
              position: peer.position,
            }),
            [sender.id]
          );
        }
      }
    } catch (err) {
      console.error("Error parsing voice control message:", err);
    }
  }
}
