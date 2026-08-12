import { LoginPanel } from "@/components/login-panel";

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
      <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-glow backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">SyncSpace</p>
          <h1 className="mt-6 max-w-2xl text-5xl font-semibold leading-tight text-white md:text-7xl">
            Collaborative editing that stays consistent when the network does not.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
            Workspaces, live presence, offline-safe updates, and version history in one product-grade
            workspace.
          </p>
          <div className="mt-10 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
            <Feature title="Real-time CRDT sync" text="Concurrent edits converge without last-write-wins." />
            <Feature title="Offline queue" text="Pending updates survive refresh and reconnect safely." />
            <Feature title="RBAC" text="Workspace permissions are enforced on the server." />
            <Feature title="Multi-instance ready" text="Redis Streams fan changes across API instances." />
          </div>
        </section>

        <LoginPanel />
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
