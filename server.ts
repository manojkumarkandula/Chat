import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// Increase payload size limit to support Base64 file uploads seamlessly
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Core Directories
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "rooms.json");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure persistence directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploaded media files statically
app.use("/uploads", express.static(UPLOADS_DIR));

// Simple persistent store
interface Message {
  id: string;
  senderId: string;
  senderName: string;
  type: "text" | "file";
  text?: string;
  file?: {
    name: string;
    type: string;
    size: number;
    url: string;
  };
  timestamp: string; // ISO String
  status: "sent" | "delivered" | "read";
  replyTo?: {
    id: string;
    senderName: string;
    type: "text" | "file";
    text?: string;
  };
  reactions?: Record<string, string>;
}

interface Participant {
  id: string;
  name: string;
  joinedAt: string;
  isOnline: boolean;
  isTyping: boolean;
}

interface Room {
  id: string;
  participants: Participant[];
  messages: Message[];
  maxParticipants: number;
}

let rooms: Record<string, Room> = {};

// Load rooms from disk if exists
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    rooms = JSON.parse(raw);
    // Reset online/typing states on server start
    for (const rid of Object.keys(rooms)) {
      rooms[rid].participants = rooms[rid].participants.map(p => ({
        ...p,
        isOnline: false,
        isTyping: false
      }));
      if (typeof rooms[rid].maxParticipants !== "number") {
        rooms[rid].maxParticipants = 2;
      }
    }
  }
} catch (err) {
  console.error("Failed to load rooms, starting fresh:", err);
  rooms = {};
}

function saveRooms() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save rooms to disk:", err);
  }
}

// Active streams for SSE real-time broadcast: roomId -> array of connections
interface StreamClient {
  userId: string;
  res: express.Response;
}
const activeStreams = new Map<string, StreamClient[]>();

// Broadcast helper to notify all subscribers in a room
function broadcastToRoom(roomId: string, event: string, data: any) {
  const clients = activeStreams.get(roomId);
  if (!clients) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => {
    try {
      c.res.write(payload);
    } catch (err) {
      console.error(`Error writing to SSE stream for user ${c.userId}:`, err);
    }
  });
}

// Generate secure room ID
function generateRoomId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const genSegment = (len: number) => {
    let s = "";
    for (let i = 0; i < len; i++) {
      s += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return s;
  };
  return `${genSegment(4)}-${genSegment(4)}-${genSegment(4)}`;
}

// --- API ENDPOINTS ---

// Create Room
app.post("/api/rooms", (req, res) => {
  const { maxParticipants } = req.body;
  const limit = typeof maxParticipants === "number" ? maxParticipants : 2;
  const roomId = generateRoomId();
  rooms[roomId] = {
    id: roomId,
    participants: [],
    messages: [],
    maxParticipants: limit
  };
  saveRooms();
  res.json({ id: roomId });
});

// Check Room Status (Fullness check)
app.get("/api/rooms/:roomId", (req, res) => {
  const { roomId } = req.params;
  const room = rooms[roomId];
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const max = room.maxParticipants || 2;
  res.json({
    id: room.id,
    participantCount: room.participants.length,
    maxParticipants: max,
    isFull: room.participants.length >= max,
    participants: room.participants.map(p => ({ id: p.id, name: p.name, isOnline: p.isOnline }))
  });
});

// Join Room (restricted to custom room limit)
app.post("/api/rooms/:roomId/join", (req, res) => {
  const { roomId } = req.params;
  const { userId, name } = req.body;

  if (!userId || !name) {
    res.status(400).json({ error: "Missing userId or name" });
    return;
  }

  const room = rooms[roomId];
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  // Find if user is already a participant
  const existingIndex = room.participants.findIndex(p => p.id === userId);

  if (existingIndex >= 0) {
    // Already registered, let them re-join
    res.json({ message: "Welcome back", room });
    return;
  }

  // Room space check
  const max = room.maxParticipants || 2;
  if (room.participants.length >= max) {
    res.status(403).json({ error: `Room is full. At most ${max} participants are allowed.` });
    return;
  }

  // Accept registration
  const newParticipant: Participant = {
    id: userId,
    name: name.trim().substring(0, 32) || `Guest ${room.participants.length + 1}`,
    joinedAt: new Date().toISOString(),
    isOnline: false,
    isTyping: false
  };

  room.participants.push(newParticipant);
  saveRooms();

  // Notify other participant of metadata changes
  broadcastToRoom(roomId, "room_joined", {
    participantCount: room.participants.length,
    participants: room.participants.map(p => ({ id: p.id, name: p.name, isOnline: p.isOnline }))
  });

  res.json({ message: "Successfully joined", room });
});

// Send Message (Text or Media File)
app.post("/api/rooms/:roomId/messages", (req, res) => {
  const { roomId } = req.params;
  const { senderId, senderName, type, text, file, replyTo } = req.body;

  const room = rooms[roomId];
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  // Access Control: Validate that the sender is an authorized participant
  const isAuthorized = room.participants.some(p => p.id === senderId);
  if (!isAuthorized) {
    res.status(403).json({ error: "Access denied: You are not a participant in this room" });
    return;
  }

  const messageId = `msg-${Math.random().toString(36).substring(2, 10)}`;
  const timestamp = new Date().toISOString();

  // Determine if other participant is online to mark status correctly
  const otherParticipant = room.participants.find(p => p.id !== senderId);
  let status: "sent" | "delivered" | "read" = "sent";
  if (otherParticipant && otherParticipant.isOnline) {
    status = "delivered";
  }

  let finalFileConfig = undefined;

  if (type === "file" && file) {
    const { name, base64, mimeType } = file;
    if (name && base64) {
      try {
        // Strip prefix if exists e.g. "data:image/png;base64,"
        const base64Data = base64.replace(/^data:.*?;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const fileExt = path.extname(name) || "";
        const cleanName = path.basename(name, fileExt).replace(/[^a-zA-Z0-9_-]/g, "");
        const finalFilename = `${Date.now()}-${cleanName}${fileExt}`;
        const finalPath = path.join(UPLOADS_DIR, finalFilename);

        fs.writeFileSync(finalPath, buffer);

        finalFileConfig = {
          name,
          type: mimeType || "application/octet-stream",
          size: buffer.length,
          url: `/uploads/${finalFilename}`
        };
      } catch (err) {
        console.error("Failed to process file upload:", err);
        res.status(500).json({ error: "File upload failed" });
        return;
      }
    }
  }

  const newMessage: Message = {
    id: messageId,
    senderId,
    senderName,
    type,
    text: type === "text" ? text : (text || ""),
    file: finalFileConfig,
    timestamp,
    status,
    replyTo: replyTo ? {
      id: replyTo.id,
      senderName: replyTo.senderName,
      type: replyTo.type,
      text: replyTo.text
    } : undefined,
    reactions: {}
  };

  room.messages.push(newMessage);
  saveRooms();

  // Broadcast to other client
  broadcastToRoom(roomId, "message", newMessage);

  res.json(newMessage);
});

// Delete Message (Hard delete from room session)
app.delete("/api/rooms/:roomId/messages/:messageId", (req, res) => {
  const { roomId, messageId } = req.params;
  const room = rooms[roomId];
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const index = room.messages.findIndex(m => m.id === messageId);
  if (index >= 0) {
    room.messages.splice(index, 1);
    saveRooms();
    // Broadcast deletion event to all connected devices in the room
    broadcastToRoom(roomId, "message_deleted", { messageId });
  }

  res.json({ ok: true });
});

// React to Message (Toggle reaction emoji)
app.post("/api/rooms/:roomId/messages/:messageId/react", (req, res) => {
  const { roomId, messageId } = req.params;
  const { userId, reaction } = req.body;

  const room = rooms[roomId];
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const message = room.messages.find(m => m.id === messageId);
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  if (!message.reactions) {
    message.reactions = {};
  }

  // Toggle reaction: if same reaction exists, delete it. Otherwise overwrite/set.
  if (message.reactions[userId] === reaction) {
    delete message.reactions[userId];
  } else {
    message.reactions[userId] = reaction;
  }

  saveRooms();

  // Broadcast reaction change to all devices
  broadcastToRoom(roomId, "message_reacted", {
    messageId,
    userId,
    reaction: message.reactions[userId] || null
  });

  res.json({ ok: true, reactions: message.reactions });
});

// Update Typing Indicator
app.post("/api/rooms/:roomId/typing", (req, res) => {
  const { roomId } = req.params;
  const { userId, isTyping } = req.body;

  const room = rooms[roomId];
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const p = room.participants.find(p => p.id === userId);
  if (p) {
    p.isTyping = !!isTyping;
    // Broadcast changed typing status immediately
    broadcastToRoom(roomId, "typing_update", {
      userId,
      isTyping: !!isTyping
    });
  }
  res.json({ ok: true });
});

// Mark messages as read
app.post("/api/rooms/:roomId/read", (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;

  const room = rooms[roomId];
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  let mutated = false;
  room.messages.forEach(msg => {
    // If sent by someone else and not already read, mark as read
    if (msg.senderId !== userId && msg.status !== "read") {
      msg.status = "read";
      mutated = true;
    }
  });

  if (mutated) {
    saveRooms();
    // Broadcast message status updates
    broadcastToRoom(roomId, "read_update", {
      readerId: userId,
      messages: room.messages
    });
  }

  res.json({ ok: true });
});

// SSE Connection for real-time streaming & auto-presence handling
app.get("/api/rooms/:roomId/stream", (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.query;

  if (!userId || typeof userId !== "string") {
    res.status(400).send("Missing userId parameter");
    return;
  }

  const room = rooms[roomId];
  if (!room) {
    res.status(404).send("Room not found");
    return;
  }

  // Access Control: Validate that the streamer is a registered participant of the room
  const isAuthorized = room.participants.some(p => p.id === userId);
  if (!isAuthorized) {
    res.status(403).send("Access denied");
    return;
  }

  // Configure SSE response headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

  res.write(":\n\n"); // Establish stream connection

  // Register client
  if (!activeStreams.has(roomId)) {
    activeStreams.set(roomId, []);
  }
  const streams = activeStreams.get(roomId)!;
  streams.push({ userId, res });

  // Update online presence
  const participant = room.participants.find(p => p.id === userId);
  if (participant) {
    participant.isOnline = true;
    saveRooms();
    // Broadcast user online visual indicator
    broadcastToRoom(roomId, "presence_update", {
      userId,
      isOnline: true
    });
  }

  // Push immediate initial room payload so client connects effortlessly
  res.write(`event: welcome\ndata: ${JSON.stringify(room)}\n\n`);

  // Handle stream interruption (socket closed / close tab)
  req.on("close", () => {
    const list = activeStreams.get(roomId);
    if (list) {
      const idx = list.findIndex(c => c.res === res);
      if (idx >= 0) {
        list.splice(idx, 1);
      }
      activeStreams.set(roomId, list);
    }

    // Check if user has other open tabs/connections before setting offline
    const userStillConnected = activeStreams.get(roomId)?.some(c => c.userId === userId);
    if (!userStillConnected) {
      const p = room.participants.find(p => p.id === userId);
      if (p) {
        p.isOnline = false;
        p.isTyping = false;
        saveRooms();
        // Broadcast presence update
        broadcastToRoom(roomId, "presence_update", {
          userId,
          isOnline: false
        });
      }
    }
  });
});

// --- VITE DEV SETUP OR PRODUCTION serving ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    console.log("Serving application in Development Mode (Vite Middleware Active)");
  } else {
    // Production Mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving application in Production Mode (Precompiled SPA assets)");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
