import { useState } from 'react';
import { submitProblemFeedback } from '../services/api';

interface ReportIssueProps {
  problemId: number | null;
  /** Filled in by the app: the position as it was shown, the moves played,
   *  the mode, the build. Shown in full behind "Sent with this". */
  context: Record<string, unknown>;
  onClose: () => void;
}

/**
 * The sheet behind "Something looks wrong", offered once a problem is decided
 * — before that nobody can tell a broken problem from a hard one.
 *
 * Writing anything is optional: a report that is just a tap still carries the
 * id, the position and the moves, which is what makes a one-person-only fault
 * reproducible. So Send is never disabled for an empty comment, and there is
 * no list of categories to work through — the placeholder does that job
 * without costing a choice.
 */
export function ReportIssue({ problemId, context, onClose }: ReportIssueProps) {
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showContext, setShowContext] = useState(false);

  const send = async () => {
    setSending(true);
    setFailed(false);
    const ok = await submitProblemFeedback({ problemId, comment: comment.trim(), context });
    setSending(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setSent(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="nb-sheet relative max-w-sm w-full mx-4 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-[var(--ink)]">Something looks wrong</h3>
          <button onClick={onClose} className="nb-disc" aria-label="Close">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {sent ? (
          <p className="text-sm text-[var(--ink)] py-4 font-semibold">Thanks — sent.</p>
        ) : (
          <>
            <label className="block">
              <span className="text-sm text-[var(--faint)] font-semibold">What happened? (optional)</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="e.g. the solution doesn't mate"
                className="nb-input mt-1 w-full text-sm px-3 py-2 focus:outline-none resize-none"
              />
            </label>

            <div className="text-xs text-[var(--faint)]">
              <button
                onClick={() => setShowContext(v => !v)}
                className="underline decoration-dotted underline-offset-2"
              >
                Sent with this: {problemId != null ? `D${problemId}` : 'this page'}, the position,
                and the moves you played {showContext ? '▾' : '▸'}
              </button>
              {showContext && (
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-[var(--surface-2)] p-2 text-[10px] leading-snug whitespace-pre-wrap break-all">
                  {JSON.stringify(context, null, 1)}
                </pre>
              )}
            </div>

            {failed && (
              <p className="text-xs text-[var(--bad)] font-semibold">Couldn't send. Try again in a moment.</p>
            )}

            <div className="flex justify-end">
              <button
                onClick={send}
                disabled={sending}
                className="nb-btn nb-btn-key px-5 py-2 text-sm disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
