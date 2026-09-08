import { useState } from 'react';
import { submitProblemFeedback } from '../services/api';

interface ReportIssueProps {
  problemId: number | null;
  /** Filled in by the app and sent as-is: the position as it was shown, the
   *  moves played, the mode, the build, the browser. Summed up for the sender
   *  in one line rather than printed. */
  context: Record<string, unknown>;
  onClose: () => void;
}

/** What actually goes wrong, in the words of someone who just hit it. Ticking
 *  is one tap where writing a sentence in a second language is not. */
const ISSUES = [
  "The solution doesn't work",
  'My move was refused',
  'The solution stops early',
  'Another move also solves it',
  'The position looks wrong',
  'Something else',
];
const OTHER = 'Something else';

/**
 * The sheet behind "Bug report", offered once a problem is decided — before
 * that nobody can tell a broken problem from a hard one.
 *
 * Saying anything is optional: a report that is just a tap still carries the
 * id, the position and the moves, which is what makes a fault that only
 * happens to one person reproducible. So the list stays folded away, Send is
 * never disabled, and the box for words appears only for the one tick that
 * needs it.
 */
export function ReportIssue({ problemId, context, onClose }: ReportIssueProps) {
  const [listOpen, setListOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = (label: string) =>
    setPicked(prev => (prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]));

  const send = async () => {
    setSending(true);
    setFailed(false);
    const ok = await submitProblemFeedback({
      problemId,
      categories: picked,
      comment: comment.trim(),
      context,
    });
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
          <h3 className="text-lg font-extrabold text-[var(--ink)]">Bug report</h3>
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
            {/* The title names the sheet, this line says what it does. Someone
                who arrives with nothing to add should still reach Send. */}
            <p className="text-sm text-[var(--ink)]">
              Something looks wrong with this problem? Send it over.
            </p>

            {/* Folded, but as a full-width button rather than a line of text:
                a fold nobody notices is a fold nobody opens. Closing it keeps
                what was ticked, and the count stays on the button, so nothing
                travels that the sender cannot see. */}
            <button
              onClick={() => setListOpen(o => !o)}
              className="nb-btn w-full px-3 py-2 text-sm flex items-center justify-between gap-2"
              aria-expanded={listOpen}
            >
              <span>
                What happened? <span className="font-normal">(optional)</span>
                {picked.length > 0 && (
                  <span className="font-normal"> · {picked.length} selected</span>
                )}
              </span>
              <span aria-hidden="true">{listOpen ? '▴' : '▾'}</span>
            </button>

            {listOpen && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {ISSUES.map(label => (
                    <button
                      key={label}
                      onClick={() => toggle(label)}
                      className={`nb-chip px-2.5 py-1 text-xs ${picked.includes(label) ? 'nb-chip-on' : ''}`}
                      aria-pressed={picked.includes(label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Only "Something else" leaves nothing said, so only it asks
                    for words. */}
                {picked.includes(OTHER) && (
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    autoFocus
                    placeholder="What happened?"
                    className="nb-input w-full text-sm px-3 py-2 focus:outline-none resize-none"
                  />
                )}
              </div>
            )}

            {/* Said, not shown: the snapshot is JSON, which is unreadable to
                most of the people this sheet is for, and one sentence covers
                what is in it. */}
            <p className="text-xs text-[var(--faint)]">
              Sent with this: {problemId != null ? `D${problemId}` : 'this page'}, the position,
              the moves you played, and your browser version.
            </p>

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
