"use client";

import { motion } from "motion/react";

export function HaikeiBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="absolute -top-32 left-[-6rem] h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-3xl"
      />
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1.1, ease: "easeOut", delay: 0.1 }}
        className="absolute top-12 right-[-4rem] h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/10 blur-3xl"
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, ease: "easeOut", delay: 0.2 }}
        className="absolute bottom-0 left-1/3 h-[18rem] w-[40rem] translate-y-1/2 rounded-full bg-indigo-400/10 blur-3xl"
      />
      <svg className="absolute inset-0 h-full w-full opacity-[0.18]" viewBox="0 0 1440 1024" fill="none">
        <defs>
          <linearGradient id="noiseGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <path
          d="M-40 240C122 152 264 128 420 188c138 54 238 170 384 196 177 31 278-116 450-126 87-5 152 17 226 76V0H-40v240Z"
          fill="url(#noiseGradient)"
        />
        <path
          d="M-20 824c170-128 320-154 492-86 161 64 254 198 432 222 168 22 290-55 536-220v284H-20V824Z"
          fill="url(#noiseGradient)"
        />
      </svg>
    </div>
  );
}
