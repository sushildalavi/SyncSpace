"use client";

import { LoginPanel } from "@/components/login-panel";
import { HaikeiBackdrop } from "@/components/haikei-backdrop";
import { motion } from "motion/react";

export default function Page() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl items-start px-4 py-6 sm:px-6">
      <HaikeiBackdrop />

      <div className="relative grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.section initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="surface p-8">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">SyncSpace</p>
          <h1 className="mt-6 max-w-2xl text-5xl font-semibold leading-tight text-white md:text-7xl">
            A calmer collaboration workspace for docs, decisions, and team alignment.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
            Built for teams that want a beautiful doc surface, live presence, and channel updates that feel integrated rather than bolted on.
          </p>
          <div className="mt-10 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
            <Feature title="Docs-like canvas" text="A clean writing surface with live collaboration and focused navigation." />
            <Feature title="Slack and Teams" text="Publish summaries and updates to the channels your team already uses." />
            <Feature title="Decision memory" text="Capture decisions, action items, and history without extra busywork." />
            <Feature title="Offline-safe sync" text="Pending updates survive reconnects and continue when the network returns." />
          </div>
        </motion.section>

        <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05 }}>
          <LoginPanel />
        </motion.div>
      </div>
    </main>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-5">
      <p className="font-medium text-white">{title}</p>
      <p className="mt-2 leading-6 text-slate-400">{text}</p>
    </div>
  );
}
