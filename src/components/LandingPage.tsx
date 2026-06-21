import { useState } from "react";
import { motion } from "motion/react";
import { Plus, Shield, Lock, Users } from "lucide-react";

interface LandingPageProps {
  onCreateRoom: (maxParticipants: number) => Promise<void>;
  isLoading: boolean;
}

export default function LandingPage({ onCreateRoom, isLoading }: LandingPageProps) {
  return (
    <div className="min-h-screen flex flex-col justify-between p-6 md:p-12 selection:bg-brand-accent-light selection:text-brand-text">
      {/* Top corner minimal branding */}
      <div className="flex items-center space-x-2 text-xs font-mono tracking-widest text-brand-muted opacity-80 uppercase">
        <span className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-pulse" />
        <span>Secure Channel</span>
      </div>

      {/* Main Hero Container */}
      <div className="max-w-xl mx-auto my-auto w-full text-center space-y-12">
        <div className="space-y-4">
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-5xl md:text-6xl font-light tracking-tight text-brand-text"
          >
            Tenfold
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="text-sm md:text-base font-light text-brand-muted max-w-sm mx-auto leading-relaxed"
          >
            A silent, beautifully minimal space to converse. Simple, fully private, and configurable for private pairs or secure group rooms.
          </motion.p>
        </div>

        {/* Primary Action Buttons */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto"
        >
          <button
            onClick={() => onCreateRoom(2)}
            disabled={isLoading}
            id="create-private-btn"
            className="group w-full sm:w-auto flex items-center justify-center space-x-3 bg-brand-accent hover:bg-brand-text text-brand-bg hover:shadow-lg transition-all duration-300 px-6 py-3.5 rounded-full font-display font-medium tracking-wide text-xs disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center space-x-2">
                <span className="w-4 h-4 border-2 border-brand-bg/30 border-t-brand-bg rounded-full animate-spin" />
                <span>Configuring Pair...</span>
              </span>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5 transition-transform group-hover:rotate-90" />
                <span>Private Chat (2 Members)</span>
              </>
            )}
          </button>

          <button
            onClick={() => onCreateRoom(10)}
            disabled={isLoading}
            id="create-group-btn"
            className="group w-full sm:w-auto flex items-center justify-center space-x-3 bg-brand-card hover:bg-brand-accent-light border border-brand-border text-brand-text hover:text-brand-text hover:shadow-lg transition-all duration-300 px-6 py-3.5 rounded-full font-display font-medium tracking-wide text-xs disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center space-x-2">
                <span className="w-4 h-4 border-2 border-brand-text/30 border-t-brand-text rounded-full animate-spin" />
                <span>Configuring Group...</span>
              </span>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5 transition-transform group-hover:rotate-180" />
                <span>Group Chat (10 Members)</span>
              </>
            )}
          </button>
        </motion.div>

        {/* Minimalist Trust Badging */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ duration: 1, delay: 0.45 }}
          className="grid grid-cols-3 gap-4 pt-8 border-t border-brand-border text-[11px] font-mono tracking-wider text-brand-muted uppercase"
        >
          <div className="flex flex-col items-center space-y-1">
            <Lock className="w-4.5 h-4.5 stroke-[1.25] text-brand-accent/70 mb-1" />
            <span>Zero Persistence</span>
          </div>
          <div className="flex flex-col items-center space-y-1">
            <Users className="w-4.5 h-4.5 stroke-[1.25] text-brand-accent/70 mb-1" />
            <span>2 / 10 Cap</span>
          </div>
          <div className="flex flex-col items-center space-y-1">
            <Shield className="w-4.5 h-4.5 stroke-[1.25] text-brand-accent/70 mb-1" />
            <span>Direct Sync</span>
          </div>
        </motion.div>
      </div>

      {/* Footer credits with clean design */}
      <div className="text-center text-[10px] font-mono tracking-widest text-brand-muted/60 uppercase">
        No accounts · No logs · Absolute Privacy
      </div>
    </div>
  );
}
