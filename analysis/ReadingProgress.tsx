/* Where reading a photo has got to: a line saying what is being done and a
   bar under it. The first photo loads the reader first (the bar is the
   megabytes fetched); every photo is then read in four steps (the bar is the
   steps). `fraction` null is a start with nothing yet to measure. */
export interface Progress { label: string; fraction: number | null }

export function ReadingProgress({ progress }: { progress: Progress }) {
  const pct = Math.round(Math.min(Math.max(progress.fraction ?? 0, 0), 1) * 100);
  return (
    <div className="mt-2" role="status" aria-live="polite">
      <p className="text-sm text-[var(--muted)]">{progress.label}</p>
      <div
        className="mt-1 h-2 w-full max-w-sm rounded-full bg-[var(--hairline)] overflow-hidden"
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-[#5b7a99] transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
