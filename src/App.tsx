import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { generateFallbackName } from "./utils";
import { Room, RoomStatusResponse, Message, Participant } from "./types";
import LandingPage from "./components/LandingPage";
import JoinPage from "./components/JoinPage";
import ChatRoom from "./components/ChatRoom";

export default function App() {
  // Navigation & Location state matching hashes (e.g. #room/abcd-efgh-ijkl)
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);

  // Participant Identity session configuration
  const [userId, setUserId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [isJoined, setIsJoined] = useState<boolean>(false);
  const [isRoomFull, setIsRoomFull] = useState<boolean>(false);
  const [activeParticipantNames, setActiveParticipantNames] = useState<string[]>([]);
  const [maxParticipants, setMaxParticipants] = useState<number>(2);

  // Status/Interactions flags
  const [pageLoading, setPageLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  
  // Media uploads indicators
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Initialize or fetch secure ID from persistence
  useEffect(() => {
    let storedUid = localStorage.getItem("twofold_user_id");
    if (!storedUid) {
      storedUid = `usr-${Math.random().toString(36).substring(2, 12)}`;
      localStorage.setItem("twofold_user_id", storedUid);
    }
    setUserId(storedUid);

    const storedName = localStorage.getItem("twofold_user_name") || "";
    setUserName(storedName);

    // Initial hash routing parse
    parseRoute();

    window.addEventListener("hashchange", parseRoute);
    return () => {
      window.removeEventListener("hashchange", parseRoute);
    };
  }, []);

  // Sync state on hash updates
  const parseRoute = () => {
    const hash = window.location.hash || "";
    const match = hash.match(/^#room\/([a-z0-9-]+)$/);
    if (match && match[1]) {
      const rid = match[1];
      setCurrentRoomId(rid);
    } else {
      setCurrentRoomId(null);
      setRoom(null);
      setIsJoined(false);
      setIsRoomFull(false);
      setActiveParticipantNames([]);
    }
    setPageLoading(false);
  };

  // Fetch Room status from server to verify availability
  useEffect(() => {
    if (!currentRoomId || !userId) return;

    let active = true;
    const checkRoomAvailability = async () => {
      try {
        const response = await fetch(`/api/rooms/${currentRoomId}`);
        if (!response.ok) {
          if (response.status === 404) {
            alert("This private chat room does not exist or has expired.");
            window.location.hash = "";
          }
          return;
        }

        const data: RoomStatusResponse = await response.json();
        if (!active) return;

        setActiveParticipantNames(data.participants.map(p => p.name));
        setMaxParticipants(data.maxParticipants || 2);

        // Check if I am already registered in this room
        const amIParticipant = data.participants.some(p => p.id === userId);

        if (amIParticipant) {
          setIsJoined(true);
          // If already registered, load the nickname
          const savedName = localStorage.getItem("twofold_user_name") || "";
          if (savedName) {
            setUserName(savedName);
          }
          establishRealtimeStream(currentRoomId, userId);
        } else {
          setIsJoined(false);
          setIsRoomFull(data.isFull);
        }
      } catch (err) {
        console.error("Failed to connect with room services:", err);
      }
    };

    checkRoomAvailability();

    return () => {
      active = false;
      closeStream();
    };
  }, [currentRoomId, userId]);

  // Clean-up Stream connection hook
  const closeStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  // Connect to SSE real-time sync endpoints
  const establishRealtimeStream = (rid: string, uid: string) => {
    closeStream();

    const streamUrl = `/api/rooms/${rid}/stream?userId=${uid}`;
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    // Direct room download payload on connection
    es.addEventListener("welcome", (event) => {
      try {
        const loadedRoom: Room = JSON.parse(event.data);
        setRoom(loadedRoom);
      } catch (err) {
        console.error("Payload breakdown on join:", err);
      }
    });

    // Handle single new message append
    es.addEventListener("message", (event) => {
      try {
        const newMsg: Message = JSON.parse(event.data);
        setRoom((prev) => {
          if (!prev) return null;
          // De-duplicate in case of network bursts
          if (prev.messages.some(m => m.id === newMsg.id)) return prev;
          return {
            ...prev,
            messages: [...prev.messages, newMsg]
          };
        });
      } catch (err) {
        console.error("Unable to parse inbound message:", err);
      }
    });

    // Handle participant counts joined event
    es.addEventListener("room_joined", (event) => {
      try {
        const update = JSON.parse(event.data);
        setActiveParticipantNames(update.participants.map((p: any) => p.name));
        setRoom((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            participants: prev.participants.map(p => {
              const remote = update.participants.find((rp: any) => rp.id === p.id);
              if (remote) return { ...p, name: remote.name, isOnline: remote.isOnline };
              return p;
            })
          };
        });
      } catch (err) {
        console.error(err);
      }
    });

    // Handle online/offline presence modifications
    es.addEventListener("presence_update", (event) => {
      try {
        const presence = JSON.parse(event.data);
        setRoom((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            participants: prev.participants.map(p =>
              p.id === presence.userId ? { ...p, isOnline: presence.isOnline } : p
            )
          };
        });
      } catch (err) {
        console.error("Invalid presence payload package:", err);
      }
    });

    // Handle typing animations sync
    es.addEventListener("typing_update", (event) => {
      try {
        const typing = JSON.parse(event.data);
        setRoom((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            participants: prev.participants.map(p =>
              p.id === typing.userId ? { ...p, isTyping: typing.isTyping } : p
            )
          };
        });
      } catch (err) {
        console.error("Failed to parse typing state stream:", err);
      }
    });

    // Handle state mark as read sweeps
    es.addEventListener("read_update", (event) => {
      try {
        const readSync = JSON.parse(event.data);
        setRoom((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            messages: readSync.messages
          };
        });
      } catch (err) {
        console.error("Failed to sync read check indicators:", err);
      }
    });

    // Handle message deletions
    es.addEventListener("message_deleted", (event) => {
      try {
        const { messageId } = JSON.parse(event.data);
        setRoom((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            messages: prev.messages.filter(m => m.id !== messageId)
          };
        });
      } catch (err) {
        console.error("Failed to parse message deletion:", err);
      }
    });

    // Handle message reactions
    es.addEventListener("message_reacted", (event) => {
      try {
        const { messageId, userId, reaction } = JSON.parse(event.data);
        setRoom((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            messages: prev.messages.map(m => {
              if (m.id === messageId) {
                const updatedReactions = { ...(m.reactions || {}) };
                if (reaction) {
                  updatedReactions[userId] = reaction;
                } else {
                  delete updatedReactions[userId];
                }
                return {
                  ...m,
                  reactions: updatedReactions
                };
              }
              return m;
            })
          };
        });
      } catch (err) {
        console.error("Failed to parse message reaction:", err);
      }
    });

    es.onerror = () => {
      console.warn("SSE interface intermittent loss. Re-buffering stream connection...");
    };
  };

  // LandPage Trigger -> Create room
  const handleCreateRoom = async (limit: number) => {
    setActionLoading(true);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxParticipants: limit })
      });
      if (!response.ok) throw new Error("Could not construct room session");
      const data = await response.json();
      // Route hash directly to enter the join flow
      window.location.hash = `room/${data.id}`;
    } catch (err) {
      console.error(err);
      alert("Platform server busy. Please check connection and retry.");
    } finally {
      setActionLoading(false);
    }
  };

  // JoinPage Trigger -> Register and enter chat room
  const handleJoinRoom = async (name: string) => {
    if (!currentRoomId) return;
    setActionLoading(true);

    try {
      // Store name
      localStorage.setItem("twofold_user_name", name);
      setUserName(name);

      const response = await fetch(`/api/rooms/${currentRoomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, name })
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 403) {
          setIsRoomFull(true);
        } else {
          alert(data.error || "Failed to successfully enter the room.");
        }
        return;
      }

      const data = await response.json();
      setRoom(data.room);
      setIsJoined(true);
      establishRealtimeStream(currentRoomId, userId);
    } catch (err) {
      console.error(err);
      alert("Internal communication breakdown. Re-attempting connection.");
    } finally {
      setActionLoading(false);
    }
  };

  // Send single text message
  const handleSendMessage = async (text: string) => {
    if (!currentRoomId) return;
    try {
      const payload: any = {
        senderId: userId,
        senderName: userName,
        type: "text",
        text
      };
      if (replyingToMessage) {
        payload.replyTo = {
          id: replyingToMessage.id,
          senderName: replyingToMessage.senderName,
          type: replyingToMessage.type,
          text: replyingToMessage.text
        };
        setReplyingToMessage(null);
      }
      await fetch(`/api/rooms/${currentRoomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error("Message delivery failed:", err);
    }
  };

  // Upload/Send File attachment payload
  const handleSendFile = async (name: string, base64: string, mimeType: string) => {
    if (!currentRoomId) return;
    setIsUploadingFile(true);
    setUploadProgress("Shredding upload bytes...");

    try {
      setUploadProgress("Transporting to secure stream...");
      const payload: any = {
        senderId: userId,
        senderName: userName,
        type: "file",
        file: {
          name,
          base64,
          mimeType
        }
      };
      if (replyingToMessage) {
        payload.replyTo = {
          id: replyingToMessage.id,
          senderName: replyingToMessage.senderName,
          type: replyingToMessage.type,
          text: replyingToMessage.text
        };
        setReplyingToMessage(null);
      }
      const response = await fetch(`/api/rooms/${currentRoomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Server transmission error");
    } catch (err) {
      console.error("File sharing broke down:", err);
      alert("Attachment upload failed. Please verify files are under 25MB.");
    } finally {
      setIsUploadingFile(false);
      setUploadProgress("");
    }
  };

  // Delete message
  const handleDeleteMessage = async (messageId: string) => {
    if (!currentRoomId) return;
    try {
      await fetch(`/api/rooms/${currentRoomId}/messages/${messageId}`, {
        method: "DELETE"
      });
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  };

  // React to message
  const handleReactToMessage = async (messageId: string, reaction: string) => {
    if (!currentRoomId) return;
    try {
      await fetch(`/api/rooms/${currentRoomId}/messages/${messageId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, reaction })
      });
    } catch (err) {
      console.error("Failed to react to message:", err);
    }
  };

  // Emit typing indicators states
  const handleSendTyping = async (isTyping: boolean) => {
    if (!currentRoomId) return;
    try {
      await fetch(`/api/rooms/${currentRoomId}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isTyping })
      });
    } catch (err) {
      // Passive logging to keep connection smooth
    }
  };

  // Mark all unread other's messages as read
  const handleMarkAsRead = async () => {
    if (!currentRoomId) return;
    try {
      await fetch(`/api/rooms/${currentRoomId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
    } catch (e) {
      // Passive read marks error ignored
    }
  };

  // Leave active session and return to Landing Page
  const handleLeaveRoom = () => {
    if (confirm("Are you sure you want to disconnect from this private channel?")) {
      closeStream();
      window.location.hash = "";
    }
  };

  // Loader shell screen
  if (pageLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-brand-bg relative">
        <div className="space-y-4 text-center">
          <div className="w-6 h-6 border-2 border-brand-accent/20 border-t-brand-accent rounded-full animate-spin mx-auto" />
          <p className="text-[10px] font-mono tracking-widest text-brand-muted uppercase">
            Establishing Secure Crypts...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg transition-colors duration-300 antialiased font-sans text-brand-text">
      <AnimatePresence mode="wait">
        {!currentRoomId ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <LandingPage onCreateRoom={handleCreateRoom} isLoading={actionLoading} />
          </motion.div>
        ) : !isJoined ? (
          <motion.div
            key="join"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <JoinPage
              roomId={currentRoomId}
              isFull={isRoomFull}
              activeParticipantNames={activeParticipantNames}
              maxParticipants={maxParticipants}
              onJoin={handleJoinRoom}
              onGoHome={() => {
                window.location.hash = "";
              }}
              isLoading={actionLoading}
            />
          </motion.div>
        ) : (
          room && (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <ChatRoom
                roomId={currentRoomId}
                room={room}
                currentUserId={userId}
                onSendMessage={handleSendMessage}
                onSendFile={handleSendFile}
                onSendTyping={handleSendTyping}
                onMarkAsRead={handleMarkAsRead}
                onLeaveRoom={handleLeaveRoom}
                isSendingMessage={actionLoading}
                isUploadingFile={isUploadingFile}
                uploadProgress={uploadProgress}
                replyingToMessage={replyingToMessage}
                onSetReplyingToMessage={setReplyingToMessage}
                onDeleteMessage={handleDeleteMessage}
                onReactToMessage={handleReactToMessage}
              />
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}
