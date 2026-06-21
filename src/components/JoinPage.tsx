import { useState, FormEvent } from "react";
import { motion } from "motion/react";
import { User, Sparkles, AlertCircle, ArrowRight, Home } from "lucide-react";
import { generateFallbackName } from "../utils";

interface JoinPageProps {
  roomId: string;
  isFull: boolean;
  activeParticipantNames: string[];
  maxParticipants: number;
  onJoin: (name: string) => void;
  onGoHome: () => void;
  isLoading: boolean;
}

export default function JoinPage({
  roomId,
  isFull,
  activeParticipantNames,
  maxParticipants,
  onJoin,
  onGoHome,
  isLoading
}: JoinPageProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isLoading || isFull) return;
    const finalName = name.trim() || generateFallbackName();
    onJoin(finalName);
  };

  const handleGeneratePseudonym = () => {
    const generated = generateFallbackName();
    setName(generated);
  };

  if (isFull) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center p-6 bg-brand-bg selection:bg-brand-accent-light selection:text-brand-text">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-md w-full bg-brand-card border border-brand-border rounded-2xl p-8 shadow-sm text-center space-y-6"
        >
          <div className="mx-auto w-12 h-12 rounded-full bg-brand-accent-light flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-brand-text" />
          </div>

          <div className="space-y-2">
            <h2 className="font-display text-2xl font-light tracking-tight text-brand-text">
              Room is full
            </h2>
            <p className="text-sm font-light text-brand-muted leading-relaxed">
              This private conversation channel is strictly limited to exactly {maxParticipants} participants. All positions are currently occupied.
            </p>
          </div>

          {activeParticipantNames.length > 0 && (
            <div className="bg-brand-bg rounded-lg p-3 text-xs font-mono text-brand-muted">
              Current residents: {activeParticipantNames.join(", ")}
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={onGoHome}
              className="w-full flex items-center justify-center space-x-2 bg-brand-accent hover:bg-brand-text text-brand-bg transition-colors duration-200 py-3 rounded-full font-display text-xs font-medium tracking-wide cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Create your own room</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-6 bg-brand-bg selection:bg-brand-accent-light selection:text-brand-text">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full bg-brand-card border border-brand-border rounded-2xl p-8 shadow-sm space-y-8"
      >
        <div className="text-center space-y-2">
          <span className="text-[10px] font-mono tracking-widest text-brand-muted uppercase">
            Private Invitation
          </span>
          <h2 className="font-display text-2xl font-light tracking-tight text-brand-text">
            Join the conversation
          </h2>
          {activeParticipantNames.length > 0 ? (
            <p className="text-xs font-light text-brand-muted">
              You are entering as occupant ({activeParticipantNames.length + 1}/{maxParticipants}), joining{" "}
              <span className="font-medium text-brand-text">
                {activeParticipantNames.join(", ")}
              </span>
              .
            </p>
          ) : (
            <p className="text-xs font-light text-brand-muted">
              You will be the first participant (1/{maxParticipants}). Share the secure invitation link once inside.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-mono tracking-wider text-brand-muted uppercase block">
              Your Identifier/Nickname
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={32}
                placeholder="Name or Pseudonym"
                className="w-full bg-brand-bg border border-brand-border focus:border-brand-text/50 outline-none text-sm transition-all duration-200 px-4 py-3 pl-10 rounded-xl font-light"
                required
              />
              <User className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-brand-muted/70 stroke-[1.25]" />

              <button
                type="button"
                onClick={handleGeneratePseudonym}
                title="Generate an elegant private alias"
                className="absolute right-3.5 top-3.5 text-brand-muted hover:text-brand-text transition-colors duration-150 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 stroke-[1.5]" />
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center space-x-2 bg-brand-accent hover:bg-brand-text text-brand-bg disabled:opacity-50 transition-colors duration-200 py-3.5 rounded-full font-display text-xs font-medium tracking-wide cursor-pointer"
            >
              <span>{isLoading ? "Preparing entry..." : "Enter Channel"}</span>
              {!isLoading && <ArrowRight className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={onGoHome}
              className="w-full text-center text-[10px] font-mono tracking-wider text-brand-muted hover:text-brand-text transition-colors duration-200 uppercase py-1"
            >
              Cancel and Exit
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
