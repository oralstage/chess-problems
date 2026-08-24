import { useState } from 'react';
import { fetchMySnapshot, getSessionId, type MySnapshot } from '../services/api';
import type { Glicko2Rating } from '../utils/glicko2';

interface RatingSyncModalProps {
  open: boolean;
  onClose: () => void;
  currentRating: Glicko2Rating;
  onRestore: (code: string, snapshot: MySnapshot) => void;
}

export function RatingSyncModal({ open, onClose, currentRating, onRestore }: RatingSyncModalProps) {
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MySnapshot | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  if (!open) return null;

  const myCode = (() => {
    try { return getSessionId(); } catch { return ''; }
  })();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(myCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — user can still select & copy manually
    }
  };

  const handleSync = async () => {
    setError(null);
    setPreview(null);
    setConfirmReplace(false);
    const code = pasted.trim();
    if (!code) {
      setError('Please paste a code.');
      return;
    }
    setBusy(true);
    try {
      const snapshot = await fetchMySnapshot(code);
      if (!snapshot) {
        setError('No data found for this code. Double-check the code or try a different one.');
      } else {
        setPreview(snapshot);
        setConfirmReplace(true);
      }
    } catch {
      setError('Could not connect to the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmRestore = () => {
    if (!preview) return;
    const code = pasted.trim();
    onRestore(code, preview);
  };

  // Aggregate counts for the confirmation summary
  const previewCounts = preview
    ? {
        progress: Object.values(preview.progress).reduce((sum, g) => sum + Object.keys(g).length, 0),
        bookmarks: Object.values(preview.bookmarks).reduce((sum, g) => sum + g.length, 0),
        review: Object.keys(preview.reviewQueue).length,
      }
    : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[var(--ink)]/45"
      onClick={onClose}
    >
      <div
        className="nb-card nb-shadow-nudge relative w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="nb-icon absolute top-3 right-3 w-8 h-8"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="px-6 py-5">
          <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)] mb-1">Sync</h2>
          <p className="text-xs font-medium text-[var(--muted)] mb-5">
            Save your code so you can recover your rating, history, bookmarks and review queue on any device.
          </p>

          {/* Backup section */}
          <div className="mb-6">
            <div className="nb-panel-label mb-2">
              Your code
            </div>
            <div className="nb-plate nb-shadow-room-sm px-3 py-3">
              <code className="block text-xs sm:text-sm font-mono font-semibold text-[var(--ink)] break-all select-all">
                {myCode || '—'}
              </code>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={handleCopy}
                disabled={!myCode}
                className="nb-btn nb-btn-key px-3 py-1.5 text-xs"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              <p className="text-xs font-medium text-[var(--muted)] leading-tight">
                Take a screenshot or save it in your notes. You'll need this if your browser data is cleared.
              </p>
            </div>
          </div>

          <div className="h-0.5 bg-[var(--hairline)] my-5" />

          {/* Restore section */}
          <div>
            <div className="nb-panel-label mb-2">
              Restore from another device
            </div>
            <p className="text-xs font-medium text-[var(--muted)] mb-2 leading-tight">
              Paste a code from another device to load that account onto this device.{' '}
              <span className="text-[var(--bad)] dark:text-[var(--bad)] font-medium">
                Warning: this device's current rating, history, bookmarks and review queue will be lost and cannot be recovered.
              </span>
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={pasted}
                onChange={(e) => { setPasted(e.target.value); setPreview(null); setConfirmReplace(false); setError(null); }}
                placeholder="Paste code here"
                className="nb-input flex-1 min-w-0 px-4 py-2 text-sm font-mono focus:outline-none"
                disabled={busy}
              />
              <button
                onClick={handleSync}
                disabled={busy || !pasted.trim()}
                className="nb-btn px-3 py-2 text-sm"
              >
                {busy ? '…' : 'Check'}
              </button>
            </div>

            {error && (
              <p className="mt-3 text-xs text-[var(--bad)] dark:text-[var(--bad)]">{error}</p>
            )}

            {/* Confirmation step */}
            {confirmReplace && preview && previewCounts && (
              <div className="nb-panel nb-shadow-room-sm mt-4 p-3">
                <div className="text-sm font-semibold text-[var(--ink)] dark:text-[var(--ink)] mb-2">
                  Replace this device with the synced account?
                </div>
                <div className="text-xs text-[var(--ink)] dark:text-[var(--ink)] space-y-1 mb-3">
                  <div>
                    <span className="font-medium">Current rating:</span>{' '}
                    {Math.round(currentRating.rating)}
                    {' '}
                    <span className="opacity-70">(RD {Math.round(currentRating.rd)})</span>
                  </div>
                  <div className="pt-1 border-t border-[var(--ink)] dark:border-[var(--ink)]">
                    <span className="font-medium">Restore to:</span>
                  </div>
                  <ul className="list-disc list-inside opacity-90 space-y-0.5">
                    <li>
                      Rating{' '}
                      {preview.rating ? (
                        <>
                          {Math.round(preview.rating.rating)}
                          {' '}
                          <span className="opacity-70">({preview.rating.solveCount} rated solves)</span>
                        </>
                      ) : (
                        <span className="opacity-70">(none)</span>
                      )}
                    </li>
                    <li>{previewCounts.progress.toLocaleString()} solved/failed entries</li>
                    <li>{previewCounts.bookmarks.toLocaleString()} bookmarks</li>
                    <li>{previewCounts.review.toLocaleString()} review queue cards</li>
                  </ul>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setConfirmReplace(false); setPreview(null); }}
                    className="nb-btn px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmRestore}
                    className="nb-btn nb-btn-key px-3 py-1.5 text-xs"
                  >
                    Replace
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
