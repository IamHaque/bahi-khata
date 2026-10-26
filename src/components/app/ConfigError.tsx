/**
 * S-47 - shown instead of the app when the Supabase environment is
 * missing or malformed. Full-page, centered, no navigation: the reader
 * must be able to fix the problem without guessing.
 *
 * The PRD (v3.1 section 5.2) prescribes panel surfaces as
 * `bg-card border border-border` with no shadow or ring; there is no
 * shared Card component in this codebase yet (it arrives with L-04), so
 * the panel below uses those classes directly.
 */
export function ConfigError({ problems }: { problems: string[] }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div
        role="alert"
        className="w-full max-w-lg rounded-lg border border-border bg-card p-6"
      >
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          This app is not configured
        </h1>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Copy .env.example to .env and fill in your Supabase project URL and
          anon key, then restart.
        </p>
      </div>
    </div>
  );
}
