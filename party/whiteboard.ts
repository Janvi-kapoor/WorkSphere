
import type * as Party from "partykit/server";

interface WhiteboardMessage {
  type: string;
  payload?: any;
  userId?: string;
  userName?: string;
  timestamp?: number;
}

export default class WhiteboardPartyServer implements Party.Server {
  private state: Map<string, any> = new Map();
  private activeUsers: Map<string, { userId: string; userName: string; joinedAt: number }> = new Map();

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log(`[PartyKit Whiteboard] Client connected: ${conn.id} in session room: ${this.room.id}`);

    // FIX 1: Send existing board shapes/state to the newly joined user immediately (Hydration)
    const currentCanvasState = Object.fromEntries(this.state.entries());
    conn.send(JSON.stringify({
      type: "WHITEBOARD_HYDRATE",
      payload: currentCanvasState,
      timestamp: Date.now()
    }));

    // Broadcast updated presence
    this.broadcastPresence();
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const msg: WhiteboardMessage = JSON.parse(message);
      msg.timestamp = Date.now();

      // User presence status join track krna
      if (msg.type === "PRESENCE_JOIN" && msg.userId) {
        this.activeUsers.set(sender.id, {
          userId: msg.userId,
          userName: msg.userName || "Collaborator",
          joinedAt: Date.now(),
        });
        this.broadcastPresence();
        return;
      }

      // FIX 2: Handle Shape/Sticky deletion if requested from frontend client
      if (msg.type === "ELEMENT_DELETE" && msg.payload?.id) {
        this.state.delete(msg.payload.id);
        this.room.broadcast(JSON.stringify(msg), [sender.id]);
        return;
      }

      // Store state items for conflict-free CRDT / shape sync merging (LWW Strategy)
      if (msg.payload?.id) {
        this.state.set(msg.payload.id, {
          ...msg.payload,
          lastModifiedBy: msg.userId || sender.id,
          updatedAt: msg.timestamp,
        });
      }

      // High-performance broadcast to all other session participants (sub-100ms requirement)
      this.room.broadcast(JSON.stringify(msg), [sender.id]);
    } catch (err) {
      console.error("[PartyKit Whiteboard] Critical error parsing synchronization message:", err);
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

Server.Default = WhiteboardPartyServer;

