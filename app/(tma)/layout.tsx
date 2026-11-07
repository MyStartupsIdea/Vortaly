/**
 * Tenant surface: everything a salon's customer sees inside Telegram.
 *
 * Routes here are phone-width by definition, so the frame lives at this level
 * rather than in the root layout, which also serves the full-width console.
 */
export default function TmaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[460px] bg-surface">{children}</div>
  );
}
