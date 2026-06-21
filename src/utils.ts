// Format bytes to a human-readable size
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["KB", "MB", "GB", "TB"];
  
  // Start division at KB
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i >= sizes.length) return "Large File";
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i - 1 || 0];
}

// Minimal, elegant time format
export function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    return `${hours}:${minutes} ${ampm}`;
  } catch (e) {
    return "";
  }
}

// Pre-defined elegant pseudonymous suggestions for user convenience
const ELEGANT_NOUNS = [
  "Scribbler",
  "Thinker",
  "Observer",
  "Listener",
  "Dreamer",
  "Wanderer",
  "Philosopher",
  "Seeker",
  "Writer",
  "Creator"
];

const ELEGANT_ADJECTIVES = [
  "Quiet",
  "Calm",
  "Patient",
  "Thoughtful",
  "Silent",
  "Serene",
  "Gentle",
  "Mindful",
  "Steady",
  "Curious"
];

export function generateFallbackName(): string {
  const adj = ELEGANT_ADJECTIVES[Math.floor(Math.random() * ELEGANT_ADJECTIVES.length)];
  const noun = ELEGANT_NOUNS[Math.floor(Math.random() * ELEGANT_NOUNS.length)];
  return `${adj} ${noun}`;
}
