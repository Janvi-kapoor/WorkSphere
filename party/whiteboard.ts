
import type * as Party from "partykit/server";

export default class WhiteboardPartyServer implements Party.Server {
  private roomDoc: Uint8Array | null = null;
  private activeUsers: Map<string, { userId: string; userName: string; joinedAt: number }> = new Map();

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log(`[PartyKit Whiteboard] Client connected: ${conn.id} in room: ${this.room.id}`);
    
    // Send existing Yjs binary document snapshot to newly joined user for instant hydration
    if (this.roomDoc) {
      conn.send(this.roomDoc);
    }
    this.broadcastPresence();
  }

  onMessage(message: string | Uint8Array, sender: Party.Connection) {
    try {
      // Handle native Yjs binary update chunks for sub-100ms CRDT merging
      if (message instanceof Uint8Array) {
        this.roomDoc = message;
        this.room.broadcast(message, [sender.id]);
        return;
      }

      // Handle custom signaling messages (e.g., Presence tracking)
      const msg = JSON.parse(message as string);
      if (msg.type === "PRESENCE_JOIN" && msg.userId) {
        this.activeUsers.set(sender.id, {
          userId: msg.userId,
          userName: msg.userName || "Collaborator",
          joinedAt: Date.now(),
        });
        this.broadcastPresence();
      }
    } catch (err) {
      console.error("[PartyKit Whiteboard] Synchronization message handling error:", err);
    }
  }

  onClose(conn: Party.Connection) {
    console.log(`[PartyKit Whiteboard] Client disconnected: ${conn.id}`);
    this.activeUsers.delete(conn.id);
    this.broadcastPresence();
  }

  private broadcastPresence() {
    const usersList = Array.from(this.activeUsers.values());
    this.room.broadcast(
      JSON.stringify({
        type: "PRESENCE_STATE_UPDATE",
        activeParticipants: usersList,
        totalActive: usersList.length,
        timestamp: Date.now(),
      })
    );
  }
}

