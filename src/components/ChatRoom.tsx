import React, { useState, useEffect, useRef, DragEvent, ChangeEvent, FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Paperclip, Copy, Check, Users, LogOut, Send, 
  Image as ImageIcon, FileText, Video as VideoIcon, Download, X, Eye
} from "lucide-react";
import { Room, Message, Participant } from "../types";
import { formatBytes, formatTime } from "../utils";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface ChatRoomProps {
  roomId: string;
  room: Room;
  currentUserId: string;
  onSendMessage: (text: string) => Promise<void>;
  onSendFile: (name: string, base64: string, mimeType: string) => Promise<void>;
  onSendTyping: (isTyping: boolean) => Promise<void>;
  onMarkAsRead: () => Promise<void>;
  onLeaveRoom: () => void;
  isSendingMessage: boolean;
  isUploadingFile: boolean;
  uploadProgress: string;
  replyingToMessage: Message | null;
  onSetReplyingToMessage: (msg: Message | null) => void;
  onDeleteMessage: (msgId: string) => Promise<void>;
  onReactToMessage: (messageId: string, reaction: string) => Promise<void>;
}

export default function ChatRoom({
  roomId,
  room,
  currentUserId,
  onSendMessage,
  onSendFile,
  onSendTyping,
  onMarkAsRead,
  onLeaveRoom,
  isSendingMessage,
  isUploadingFile,
  uploadProgress,
  replyingToMessage,
  onSetReplyingToMessage,
  onDeleteMessage,
  onReactToMessage
}: ChatRoomProps) {
  const [inputText, setInputText] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxName, setLightboxName] = useState<string>("");
  const [multiUploadProgress, setMultiUploadProgress] = useState<string>("");
  const [isScreenSuspended, setIsScreenSuspended] = useState(false);
  const [activeContextMenu, setActiveContextMenu] = useState<{
    messageId: string;
    x: number;
    y: number;
    isMobile: boolean;
  } | null>(null);

  const getGroupedReactions = (reactions?: Record<string, string>) => {
    if (!reactions) return [];
    const counts: Record<string, number> = {};
    for (const emoji of Object.values(reactions)) {
      counts[emoji] = (counts[emoji] || 0) + 1;
    }
    return Object.entries(counts).map(([emoji, count]) => ({ emoji, count }));
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingStateRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    if (!activeContextMenu) return;
    const handleClose = () => setActiveContextMenu(null);
    document.addEventListener("click", handleClose);
    return () => document.removeEventListener("click", handleClose);
  }, [activeContextMenu]);

  // Screen recording and screenshot protection
  useEffect(() => {
    const handleBlur = () => setIsScreenSuspended(true);
    const handleFocus = () => setIsScreenSuspended(false);
    const handleVisibility = () => {
      if (document.hidden) {
        setIsScreenSuspended(true);
      } else {
        setIsScreenSuspended(false);
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    // Block keyboard print / screen grab shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        e.preventDefault();
        setIsScreenSuspended(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        alert("Printing is disabled to protect content privacy.");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
      }
      // Inspect element key blocks
      if (e.key === "F12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "C" || e.key === "c"))) {
        e.preventDefault();
        alert("Developer mode is restricted for privacy safety.");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        navigator.clipboard.writeText(""); // clear clipboard
        setIsScreenSuspended(true);
        alert("Screenshots are blocked. Clipboard cleared.");
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, []);

  // Scroll to Replied Message & highlight briefly
  const scrollToMessage = (id: string) => {
    const element = document.getElementById(`msg-bubble-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("ring-2", "ring-brand-accent", "transition-all", "duration-500");
      setTimeout(() => {
        element.classList.remove("ring-2", "ring-brand-accent");
      }, 1500);
    }
  };

  // Context Menu handlers
  const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    setActiveContextMenu({
      messageId: msg.id,
      x: e.clientX,
      y: e.clientY,
      isMobile: false
    });
  };

  const handleTouchStart = (e: React.TouchEvent, msg: Message) => {
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);

    touchTimerRef.current = setTimeout(() => {
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      setActiveContextMenu({
        messageId: msg.id,
        x: 0,
        y: 0,
        isMobile: true
      });
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPosRef.current.x;
    const dy = touch.clientY - touchStartPosRef.current.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  // Derive other participant
  const currentParticipant = room.participants.find(p => p.id === currentUserId);
  const otherParticipant = room.participants.find(p => p.id !== currentUserId);

  // Auto scroll to bottom
  const scrollToBottom = (behavior: "smooth" | "auto" = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom("smooth");
  }, [room.messages.length]);

  // Mark all messages as read once loaded or whenever a new message arrives of other sender
  useEffect(() => {
    const unreadFromOther = room.messages.some(
      m => m.senderId !== currentUserId && m.status !== "read"
    );
    if (unreadFromOther) {
      onMarkAsRead();
    }
  }, [room.messages, currentUserId, onMarkAsRead]);

  // Handle Clipboard Copy
  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}/#room/${roomId}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  // Handle typing state emission on key presses
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    if (!isTypingStateRef.current) {
      isTypingStateRef.current = true;
      onSendTyping(true);
    }

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = setTimeout(() => {
      isTypingStateRef.current = false;
      onSendTyping(false);
    }, 2000);
  };

  const handleSendText = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSendingMessage) return;

    const msg = inputText.trim();
    setInputText("");

    // Keep active focus on input to maintain keyboard state on mobile devices
    const chatInput = document.getElementById("chat-input");
    if (chatInput) {
      chatInput.focus();
    }

    // Clear typing states
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    isTypingStateRef.current = false;
    onSendTyping(false);

    await onSendMessage(msg);

    // Refocus again after send API returns to ensure keyboard is persistent
    if (chatInput) {
      chatInput.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      processSelectedFiles(files);
    }
  };

  // Process File Buffer uploading (Handles multiple files sequentially)
  const processSelectedFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const total = fileArray.length;
    if (total === 0) return;

    if (total === 1) {
      const file = fileArray[0];
      if (file.size > 25 * 1024 * 1024) {
        alert("Privacy Safe limit: Files must be under 25 megabytes.");
        return;
      }
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        if (base64) {
          await onSendFile(file.name, base64, file.type);
        }
      };
      reader.readAsDataURL(file);
    } else {
      setMultiUploadProgress(`Preparing ${total} files...`);
      for (let i = 0; i < total; i++) {
        const file = fileArray[i];
        if (file.size > 25 * 1024 * 1024) {
          alert(`Privacy Safe limit: File "${file.name}" is over 25 megabytes and was skipped.`);
          continue;
        }

        setMultiUploadProgress(`Uploading file ${i + 1} of ${total}: "${file.name}"`);
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = async (e) => {
            const base64 = e.target?.result as string;
            if (base64) {
              try {
                await onSendFile(file.name, base64, file.type);
              } catch (err) {
                console.error("Error uploading file segment:", err);
              }
            }
            resolve();
          };
          reader.onerror = () => {
            resolve();
          };
          reader.readAsDataURL(file);
        });
      }
      setMultiUploadProgress("");
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFiles(e.target.files);
    }
  };

  // Drag and drop events
  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFiles(e.dataTransfer.files);
    }
  };

  // Media render functions
  const renderMessageContent = (msg: Message) => {
    if (msg.type === "text") {
      return (
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words font-light">
          {msg.text}
        </p>
      );
    }

    if (msg.type === "file" && msg.file) {
      const f = msg.file;
      const isImg = f.type.startsWith("image/");
      const isVid = f.type.startsWith("video/");

      if (isImg) {
        return (
          <div className="space-y-2">
            <div className="relative group max-w-sm rounded-lg overflow-hidden border border-brand-border bg-brand-accent-light/50">
              <img
                src={f.url}
                alt={f.name}
                referrerPolicy="no-referrer"
                className="max-h-60 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity duration-200"
                onClick={() => {
                  setLightboxUrl(f.url);
                  setLightboxName(f.name);
                }}
              />
              <div className="absolute right-2 top-2 p-1.5 bg-brand-text/75 rounded-full text-brand-bg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <Eye className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-center space-x-1.5 text-[10px] text-brand-muted font-mono">
              <span className="truncate max-w-xs">{f.name}</span>
              <span>·</span>
              <span>{formatBytes(f.size)}</span>
              <a
                href={f.url}
                download={f.name}
                className="p-1 hover:text-brand-text hover:bg-brand-accent-light rounded transition-all ml-auto"
                title="Download Image"
              >
                <Download className="w-3 h-3" />
              </a>
            </div>
          </div>
        );
      }

      if (isVid) {
        return (
          <div className="space-y-2 max-w-sm">
            <div className="rounded-lg overflow-hidden border border-brand-border bg-black">
              <video
                src={f.url}
                controls
                referrerPolicy="no-referrer"
                className="max-h-60 w-full"
              />
            </div>
            <div className="flex items-center space-x-1.5 text-[10px] text-brand-muted font-mono">
              <span className="truncate max-w-xs">{f.name}</span>
              <span>·</span>
              <span>{formatBytes(f.size)}</span>
              <a
                href={f.url}
                download={f.name}
                className="p-1 hover:text-brand-text hover:bg-brand-accent-light rounded transition-all ml-auto"
                title="Download Video"
              >
                <Download className="w-3 h-3" />
              </a>
            </div>
          </div>
        );
      }

      // Default Document template
      return (
        <div className="flex items-center space-x-3 bg-brand-bg hover:bg-brand-accent-light/50 border border-brand-border rounded-xl p-3.5 transition-all w-full max-w-xs select-none">
          <div className="p-2.5 bg-brand-card border border-brand-border rounded-lg text-brand-accent shadow-sm">
            <FileText className="w-5 h-5 stroke-[1.5]" />
          </div>
          <div className="flex-1 min-w-0 pr-1">
            <p className="text-xs font-medium text-brand-text truncate" title={f.name}>
              {f.name}
            </p>
            <p className="text-[10px] font-mono text-brand-muted mt-0.5">
              {formatBytes(f.size)}
            </p>
          </div>
          <a
            href={f.url}
            download={f.name}
            className="p-2 h-9 w-9 bg-brand-card hover:bg-brand-accent hover:text-brand-bg rounded-lg border border-brand-border flex items-center justify-center transition-all cursor-pointer"
            title="Download Document"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
      );
    }
  };

  // Render Status labels (Sent, Delivered, Read)
  const renderMessageMetadata = (msg: Message) => {
    const isMe = msg.senderId === currentUserId;
    const timeStr = formatTime(msg.timestamp);

    if (!isMe) {
      return (
        <span className="text-[9px] font-mono text-brand-muted/70 tracking-tight uppercase">
          {timeStr}
        </span>
      );
    }

    let statusDisplay = "···";
    if (msg.status === "sent") statusDisplay = "Sent";
    if (msg.status === "delivered") statusDisplay = "Delivered";
    if (msg.status === "read") statusDisplay = "Read";

    return (
      <span className="text-[9px] font-mono text-brand-muted/70 tracking-tight uppercase flex items-center justify-end space-x-1.5 select-none">
        <span>{timeStr}</span>
        <span className="text-brand-border select-none">·</span>
        <span className={msg.status === "read" ? "text-emerald-600 font-medium" : ""}>
          {statusDisplay}
        </span>
      </span>
    );
  };

  const getRoleLabel = (pid: string) => {
    const idx = room.participants.findIndex(p => p.id === pid);
    if (idx === 0) return "Host";
    return idx >= 0 ? `Resident ${idx + 1}` : "Guest";
  };

  return (
    <div 
      className="h-screen flex flex-col justify-between relative bg-brand-bg/40"
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      {/* Top Header Bar */}
      <header className="px-6 py-4 bg-brand-card border-b border-brand-border flex items-center justify-between z-10 shadow-xs">
        {/* Participants States */}
        <div className="flex items-center space-x-4">
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="font-display font-medium text-sm text-brand-text">
                {room.participants.length > 1 ? `Channel Chat (${room.participants.length}/${room.maxParticipants || 10})` : "Awaiting Guest..."}
              </span>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            </div>
            <div className="text-[10px] font-mono text-brand-muted hover:text-brand-text transition-colors mt-0.5 select-none flex items-center space-x-1.5">
              <span>{room.participants.filter(p => p.isOnline).length} online</span>
              <span>·</span>
              <span>{room.participants.length > 1 ? (room.maxParticipants === 2 ? "Secure Private Pair" : "Secure Deca Group") : "Awaiting participants to enter"}</span>
            </div>
          </div>
        </div>

        {/* Action Tray */}
        <div className="flex items-center space-x-2">
          {/* Active room indicator & invite copying */}
          <button
            onClick={handleCopyLink}
            className="flex items-center space-x-1.5 bg-brand-bg hover:bg-brand-accent-light text-brand-text hover:text-brand-text px-3 py-1.5 rounded-lg border border-brand-border text-xs transition-colors cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-mono text-emerald-600 font-medium">Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 stroke-[1.5]" />
                <span className="font-mono text-brand-muted select-none">Copy Invitation</span>
              </>
            )}
          </button>

          <button
            onClick={onLeaveRoom}
            title="Leave and close chat channel"
            className="p-1.5 text-brand-muted hover:text-brand-text bg-brand-bg hover:bg-brand-accent-light rounded-lg border border-brand-border transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 stroke-[1.5]" />
          </button>
        </div>
      </header>

      {/* Messages Board */}
      <main className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
        <div className="max-w-2xl mx-auto space-y-6">
          
          {/* Privacy Welcome banner */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border border-dashed border-brand-border rounded-xl p-5 text-center space-y-2 bg-brand-card/35 max-w-lg mx-auto"
          >
            <p className="text-xs font-mono tracking-wider text-brand-muted uppercase">
              {room.maxParticipants === 2 ? "Secure Private Pair" : "Secure Multi-User Channel"}
            </p>
            <p className="text-xs font-light text-brand-muted leading-relaxed">
              This space functions entirely in memory and locally. No logs are held. Invite links expire when all participants disconnect.
            </p>
            {room.participants.length < (room.maxParticipants || 10) && (
              <div className="pt-2">
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-brand-accent text-brand-bg hover:bg-brand-text transition-colors duration-150 rounded-lg font-display font-medium text-[10px] tracking-wide uppercase cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Share invitation to join ({room.participants.length}/{room.maxParticipants || 10})</span>
                </button>
              </div>
            )}
          </motion.div>

          {/* Active room residents listing */}
          <div className="flex justify-center flex-wrap gap-2 text-[10px] font-mono text-brand-muted/75 uppercase select-none">
            {room.participants.map((p) => (
              <div key={p.id} className="flex items-center space-x-1 border border-brand-border rounded-full px-2 py-0.5 bg-brand-card">
                <span className={`w-1 h-1 rounded-full ${p.isOnline ? "bg-emerald-500" : "bg-neutral-400"}`} />
                <span>{p.name} ({getRoleLabel(p.id)})</span>
              </div>
            ))}
          </div>

          <div className="space-y-4 pt-4">
            {room.messages.map((msg) => {
              const isMe = msg.senderId === currentUserId;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? "items-end" : "items-start"} animate-msg-fade`}
                >
                  <div className="max-w-[85%] md:max-w-[70%] space-y-1">
                    {/* Speaker name */}
                    <p className={`text-[10px] font-mono text-brand-muted/70 tracking-wide uppercase px-1.5 ${isMe ? "text-right" : "text-left"}`}>
                      {isMe ? "You" : msg.senderName} <span className="text-neutral-300">·</span> {getRoleLabel(msg.senderId)}
                    </p>

                    {/* Speech bubble */}
                    <motion.div
                      id={`msg-bubble-${msg.id}`}
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={{ left: 0, right: 0.35 }}
                      onDragEnd={(e, info) => {
                        if (info.offset.x > 60) {
                          if (navigator.vibrate) navigator.vibrate(15);
                          onSetReplyingToMessage(msg);
                        }
                      }}
                      onContextMenu={(e) => handleContextMenu(e, msg)}
                      onTouchStart={(e) => handleTouchStart(e, msg)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      className={`px-4 py-3.5 rounded-2xl shadow-xs border cursor-grab active:cursor-grabbing relative select-none ${
                        isMe
                          ? "bg-brand-accent/50 text-brand-text border-brand-border rounded-tr-none"
                          : "bg-brand-card text-brand-text border-brand-border rounded-tl-none"
                      }`}
                    >
                      {msg.replyTo && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            scrollToMessage(msg.replyTo!.id);
                          }}
                          className="mb-2.5 p-2 bg-brand-bg/40 hover:bg-brand-bg/60 border-l-2 border-brand-accent rounded text-[10px] leading-snug text-brand-muted cursor-pointer transition-colors text-left"
                        >
                          <p className="font-mono font-medium text-[8px] uppercase text-brand-text">
                            {msg.replyTo.senderName}
                          </p>
                          <p className="truncate font-light">
                            {msg.replyTo.type === "text" ? msg.replyTo.text : "📎 Attached Media File"}
                          </p>
                        </div>
                      )}
                      {renderMessageContent(msg)}
                    </motion.div>

                    {/* Reactions Display */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className={`flex items-center -mt-1.5 px-1.5 relative z-10 select-none ${isMe ? "justify-end" : "justify-start"}`}>
                        <div className="flex items-center space-x-1.5 bg-brand-card hover:bg-brand-accent-light border border-brand-border px-2 py-0.5 rounded-full text-[10px] shadow-xs transition-colors">
                          {getGroupedReactions(msg.reactions).map(({ emoji, count }) => (
                            <span key={emoji} className="inline-flex items-center space-x-0.5" title={`${count} user(s)`}>
                              <span>{emoji}</span>
                              {count > 1 && <span className="text-[8px] font-mono text-brand-muted">{count}</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata line (Status / Time) */}
                    <div className="px-1.5">
                      {renderMessageMetadata(msg)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>

      {/* Footer Area with Input, Typing awareness & File Uploader progress */}
      <footer className="bg-brand-card border-t border-brand-border p-4 sticky bottom-0">
        <div className="max-w-2xl mx-auto space-y-2">
          
          {/* Bottom Indicators Row (Files uploading, typing) */}
          <div className="h-4 flex items-center justify-between text-[11px] font-mono text-brand-muted">
            <div className="select-none">
              <AnimatePresence>
                {(() => {
                  const typingParticipants = room.participants.filter(p => p.id !== currentUserId && p.isTyping);
                  if (typingParticipants.length === 0) return null;
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 3 }}
                      className="flex items-center space-x-1.5 text-brand-muted"
                    >
                      <span className="flex space-x-1 items-center py-0.5">
                        <span className="w-1 h-1 bg-brand-muted rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1 h-1 bg-brand-muted rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1 h-1 bg-brand-muted rounded-full animate-bounce" />
                      </span>
                      <span>
                        {typingParticipants.length === 1
                          ? `${typingParticipants[0].name} is drafting...`
                          : typingParticipants.length === 2
                          ? `${typingParticipants[0].name} and ${typingParticipants[1].name} are drafting...`
                          : `${typingParticipants.length} people are drafting...`}
                      </span>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </div>

            <div>
              {(isUploadingFile || !!multiUploadProgress) && (
                <div className="flex items-center space-x-2 text-brand-accent font-medium">
                  <span className="w-3 h-3 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
                  <span>{multiUploadProgress || uploadProgress || "Encrypting file upload..."}</span>
                </div>
              )}
            </div>
          </div>

          {/* Reply Target Preview */}
          {replyingToMessage && (
            <div className="bg-brand-accent-light border border-brand-border rounded-xl p-3 flex items-center justify-between animate-msg-fade">
              <div className="border-l-2 border-brand-accent pl-3 min-w-0 flex-1">
                <p className="text-[9px] font-mono text-brand-muted uppercase">
                  Replying to {replyingToMessage.senderName}
                </p>
                <p className="text-xs text-brand-text truncate font-light mt-0.5">
                  {replyingToMessage.type === "text" ? replyingToMessage.text : "📎 Attached Media File"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSetReplyingToMessage(null)}
                className="p-1 text-brand-muted hover:text-brand-text hover:bg-brand-bg rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Core Chat Box Bar */}
          <form onSubmit={handleSendText} className="relative flex items-center space-x-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              id="file-element"
              multiple
              accept="image/*,video/*,application/pdf,text/*,.zip,.rar,.doc,.docx"
            />
            {/* Attachment Button */}
            <button
              type="button"
              id="clip-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingFile || !!multiUploadProgress}
              title="Attach media secure files"
              className="flex items-center justify-center p-3 bg-brand-bg hover:bg-brand-accent-light text-brand-muted hover:text-brand-text rounded-xl border border-brand-border transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Paperclip className="w-4 h-4 stroke-[1.5]" />
            </button>

            {/* Main input string */}
            <input
              type="text"
              id="chat-input"
              value={inputText}
              onChange={handleInputChange}
              onPaste={handlePaste}
              disabled={isSendingMessage || isUploadingFile || !!multiUploadProgress}
              placeholder={room.participants.length > 1 ? "Formulate a message..." : "Share link above to invite guests..."}
              className="flex-1 bg-brand-bg outline-none border border-brand-border focus:border-brand-text/50 text-sm py-3 px-4 rounded-xl font-light transition-all disabled:opacity-50"
              autoComplete="off"
            />

            {/* Send Button */}
            <AnimatePresence>
              {inputText.trim() && (
                <motion.button
                  type="submit"
                  id="send-msg-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  disabled={isSendingMessage}
                  className="p-3 bg-brand-accent hover:bg-brand-text text-brand-bg rounded-xl flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <Send className="w-4 h-4 stroke-[1.5]" />
                </motion.button>
              )}
            </AnimatePresence>
          </form>
        </div>
      </footer>

      {/* Drag & Drop Overlay */}
      <AnimatePresence>
        {dragActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-brand-text/70 backdrop-blur-xs flex flex-col items-center justify-center space-y-4 z-50 p-6 text-brand-bg border-4 border-dashed border-brand-border/40 m-4 rounded-2xl pointer-events-none"
          >
            <div className="p-4 bg-brand-bg/10 rounded-full border border-brand-bg/20">
              <Paperclip className="w-8 h-8 animate-pulse text-brand-bg" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-display text-lg font-light tracking-wide">
                Drop files privately here
              </p>
              <p className="text-xs font-mono text-brand-bg/60 uppercase">
                Up to 25 Megabytes
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive Lightbox Overlay */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-neutral-950/95 backdrop-blur-sm z-50 flex flex-col justify-between p-6 overflow-hidden select-none"
          >
            {/* Lightbox Header */}
            <div className="flex items-center justify-between text-white border-b border-white/5 pb-3">
              <span className="text-xs font-mono truncate max-w-lg tracking-wide">{lightboxName}</span>
              <button
                onClick={() => setLightboxUrl(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-white/80 hover:text-white"
              >
                <X className="w-5 h-5 stroke-[1.5]" />
              </button>
            </div>

            {/* Lightbox Container */}
            <div className="flex-1 flex items-center justify-center min-h-0 py-6">
              <motion.img
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                src={lightboxUrl}
                alt={lightboxName}
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full object-contain select-none"
              />
            </div>

            {/* Lightbox Footer */}
            <div className="flex justify-center pt-2">
              <a
                href={lightboxUrl}
                download={lightboxName}
                className="flex items-center space-x-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-display px-6 py-2.5 rounded-full text-xs font-medium cursor-pointer transition-colors shadow-lg"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save to device</span>
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context Menu (Web - Right Click) */}
      {activeContextMenu && !activeContextMenu.isMobile && (
        <div
          className="fixed z-50 bg-brand-card border border-brand-border rounded-xl shadow-xl py-1.5 min-w-[170px] animate-msg-fade"
          style={{ left: activeContextMenu.x, top: activeContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Reactions bar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-brand-border/40 mb-1">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onReactToMessage(activeContextMenu.messageId, emoji);
                  setActiveContextMenu(null);
                }}
                className="text-base hover:scale-125 active:scale-95 transition-transform duration-100 p-1 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              const msg = room.messages.find(m => m.id === activeContextMenu.messageId);
              if (msg) onSetReplyingToMessage(msg);
              setActiveContextMenu(null);
            }}
            className="w-full text-left px-4 py-2.5 text-xs text-brand-text hover:bg-brand-accent-light hover:text-white flex items-center space-x-2 transition-colors cursor-pointer"
          >
            <span>Reply</span>
          </button>

          {room.messages.find(m => m.id === activeContextMenu.messageId)?.type === "text" && (
            <button
              onClick={() => {
                const msg = room.messages.find(m => m.id === activeContextMenu.messageId);
                if (msg?.text) {
                  navigator.clipboard.writeText(msg.text);
                }
                setActiveContextMenu(null);
              }}
              className="w-full text-left px-4 py-2.5 text-xs text-brand-text hover:bg-brand-accent-light hover:text-white flex items-center space-x-2 transition-colors cursor-pointer"
            >
              <span>Copy Text</span>
            </button>
          )}

          <button
            onClick={() => {
              if (confirm("Delete this message for everyone?")) {
                onDeleteMessage(activeContextMenu.messageId);
              }
              setActiveContextMenu(null);
            }}
            className="w-full text-left px-4 py-2.5 text-xs text-rose-500 hover:bg-brand-accent-light flex items-center space-x-2 transition-colors cursor-pointer border-t border-brand-border/40 mt-1"
          >
            <span>Delete for Everyone</span>
          </button>
        </div>
      )}

      {/* Context Menu (Mobile - Bottom Sheet) */}
      <AnimatePresence>
        {activeContextMenu && activeContextMenu.isMobile && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveContextMenu(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-brand-card border-t border-brand-border rounded-t-3xl px-6 py-5 pb-9 space-y-4 shadow-2xl"
            >
              <div className="w-12 h-1 bg-brand-border rounded-full mx-auto" />

              {/* Reactions bar */}
              <div className="flex items-center justify-between px-2 py-2 border-b border-brand-border/40 pb-3 mb-1">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onReactToMessage(activeContextMenu.messageId, emoji);
                      setActiveContextMenu(null);
                    }}
                    className="text-xl hover:scale-125 active:scale-95 transition-transform duration-100 p-1 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <button
                  onClick={() => {
                    const msg = room.messages.find(m => m.id === activeContextMenu.messageId);
                    if (msg) onSetReplyingToMessage(msg);
                    setActiveContextMenu(null);
                  }}
                  className="w-full text-left py-4 text-sm font-medium text-brand-text hover:bg-brand-accent-light flex items-center space-x-3 transition-colors cursor-pointer"
                >
                  <span>Reply</span>
                </button>

                {room.messages.find(m => m.id === activeContextMenu.messageId)?.type === "text" && (
                  <button
                    onClick={() => {
                      const msg = room.messages.find(m => m.id === activeContextMenu.messageId);
                      if (msg?.text) {
                        navigator.clipboard.writeText(msg.text);
                      }
                      setActiveContextMenu(null);
                    }}
                    className="w-full text-left py-4 text-sm font-medium text-brand-text hover:bg-brand-accent-light flex items-center space-x-3 transition-colors cursor-pointer"
                  >
                    <span>Copy Text</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    if (confirm("Delete this message for everyone?")) {
                      onDeleteMessage(activeContextMenu.messageId);
                    }
                    setActiveContextMenu(null);
                  }}
                  className="w-full text-left py-4 text-sm font-medium text-rose-500 hover:bg-brand-accent-light flex items-center space-x-3 transition-colors cursor-pointer border-t border-brand-border/40 mt-2"
                >
                  <span>Delete for Everyone</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Screen Protection Overlay */}
      {isScreenSuspended && (
        <div className="fixed inset-0 z-[999] bg-brand-bg/95 backdrop-blur-xl flex flex-col items-center justify-center space-y-4 p-6 select-none pointer-events-auto">
          <div className="w-16 h-16 rounded-full bg-brand-accent-light flex items-center justify-center border border-brand-border text-brand-accent">
            <svg
              className="w-8 h-8 animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <div className="text-center space-y-2 max-w-xs">
            <h3 className="font-display text-lg font-medium text-brand-text">
              Visual Capture Blocked
            </h3>
            <p className="text-xs font-light text-brand-muted leading-relaxed">
              Tenfold security active. Visual interface is hidden when screen capture tool is active or window focus is lost.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
