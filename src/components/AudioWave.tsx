import { motion } from "motion/react";

interface AudioWaveProps {
  active: boolean;
  color?: string;
}

export default function AudioWave({ active, color = "bg-neutral-600" }: AudioWaveProps) {
  const bars = Array.from({ length: 15 }, (_, i) => i);

  return (
    <div id="audio-wave-container" className="flex items-end gap-[3px] h-8 px-2 py-1 justify-center">
      {bars.map((bar) => {
        // Generates natural harmonic wave heights
        const delay = bar * 0.08;
        return (
          <motion.div
            key={bar}
            id={`wave-bar-${bar}`}
            className={`w-[3px] rounded-full ${color}`}
            initial={{ height: 4 }}
            animate={
              active
                ? {
                    height: [4, 16 + (bar % 3) * 5, 4],
                  }
                : { height: 4 }
            }
            transition={
              active
                ? {
                    duration: 0.8,
                    repeat: Infinity,
                    delay: delay,
                    ease: "easeInOut",
                  }
                : { duration: 0.3 }
            }
          />
        );
      })}
    </div>
  );
}
