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
    if (code === myCode) {
      setError('That is already this device\'s code.');
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
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="px-6 py-5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Sync</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
            Save your code so you can recover your rating, history, bookmarks and review queue on any device.
          </p>

          {/* Backup section */}
          <div className="mb-6">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Your code
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-3">
              <code className="block text-xs sm:text-sm font-mono text-gray-900 dark:text-gray-100 break-all select-all">
                {myCode || '—'}
              </code>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={handleCopy}
                disabled={!myCode}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
                Take a screenshot or save it in your notes. You'll need this if your browser data is cleared.
              </p>
            </div>
          </div>

          <div className="h-px bg-gray-200 dark:bg-gray-700 my-5" />

          {/* Restore section */}
          <div>
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Restore from another device
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 leading-tight">
              Paste a code from another device to load that account onto this device.{' '}
              <span className="text-red-600 dark:text-red-400 font-medium">
                Warning: this device's current rating, history, bookmarks and review queue will be lost and cannot be recovered.
              </span>
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={pasted}
                onChange={(e) => { setPasted(e.target.value); setPreview(null); setConfirmReplace(false); setError(null); }}
                placeholder="Paste code here"
                className="flex-1 min-w-0 px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                disabled={busy}
              />
              <button
                onClick={handleSync}
                disabled={busy || !pasted.trim()}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? '…' : 'Check'}
              </button>
            </div>

            {error && (
              <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
            )}

            {/* Confirmation step */}
            {confirmReplace && preview && previewCounts && (
              <div className="mt-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-3">
                <div className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                  Replace this device with the synced account?
                </div>
                <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1 mb-3">
                  <div>
                    <span className="font-medium">Current rating:</span>{' '}
                    {Math.round(currentRating.rating)}
                    {' '}
                    <span className="opacity-70">(RD {Math.round(currentRating.rd)})</span>
                  </div>
                  <div className="pt-1 border-t border-amber-200 dark:border-amber-800/60">
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
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-amber-300 dark:border-amber-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmRestore}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
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
