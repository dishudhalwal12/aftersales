// Placeholder shell so the app boots. The landing page (hero video, features,
// CTAs) is Developer A's Phase 1 deliverable and should replace this file.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-6">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">SPHINX &apos;26 · PS 2.5</p>
      <h1 className="text-4xl font-semibold tracking-tight">AfterSales AI</h1>
      <p className="max-w-xl text-base text-muted">
        Phase 1 backend is live: multi-tenant onboarding, versioned Business Brain
        compilation, and session-guarded APIs. The landing page will be built by
        the frontend track.
      </p>
      <div className="glass-card w-full max-w-xl px-5 py-4 text-sm text-muted">
        <p className="font-medium text-ink">Backend status</p>
        <p className="mt-1">
          Health check:{" "}
          <a className="underline decoration-ink/30 underline-offset-4" href="/api/health">
            /api/health
          </a>
        </p>
      </div>
    </main>
  );
}
