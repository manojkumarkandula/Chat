export interface FileAttachment {
  name: string;
  type: string; // mimetypes
  size: number;
  url: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  type: "text" | "file";
  text?: string;
  file?: FileAttachment;
  timestamp: string; // ISO string
  status: "sent" | "delivered" | "read";
  replyTo?: {
    id: string;
    senderName: string;
    type: "text" | "file";
    text?: string;
  };
  reactions?: Record<string, string>;
}

export interface Participant {
  id: string;
  name: string;
  joinedAt: string;
  isOnline: boolean;
  isTyping: boolean;
}

export interface Room {
  id: string;
  participants: Participant[];
  messages: Message[];
  maxParticipants?: number;
}

export interface RoomStatusResponse {
  id: string;
  participantCount: number;
  maxParticipants?: number;
  isFull: boolean;
  participants: { id: string; name: string; isOnline: boolean }[];
}
