import { useState, useEffect } from 'react';
import { pieceCounts } from '../utils/pieceCount';
import { useTileGrid } from '../hooks/useTileGrid';
import { Chessboard } from 'react-chessboard';
import { LazyBoard } from './LazyBoard';
import type { Genre, ChessProblem, ProblemProgress } from '../types';
import { fetchDailyHistory, metaToChessProblem, type DailyHistoryEntry } from '../services/api';

interface DailyHistoryPageProps {
  progress: Record<Genre, ProblemProgress>;
  onSelectProblem: (genre: Genre, problem: ChessProblem, date: string) => void;
  onClose: () => void;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = today.getTime() - target.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return target.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: y !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function DailyHistoryPage({ progress, onSelectProblem, onClose }: DailyHistoryPageProps) {
  const [entries, setEntries] = useState<(DailyHistoryEntry & { problem: ChessProblem })[]>([]);
  const [loading, setLoading] = useState(true);
  const { columns, boardSize } = useTileGrid(768);

  useEffect(() => {
    let cancelled = false;
    fetchDailyHistory(30)
      .then(data => {
        if (cancelled) return;
        setEntries(data.map(entry => ({
          ...entry,
          problem: metaToChessProblem(entry),
        })));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const directProgress = progress.direct || {};

  return (
    <div className="nb-ground fixed inset-0 z-50 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col p-4 max-w-3xl mx-auto w-full min-h-0">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-xl font-extrabold text-[var(--ink)]">
            Daily Problems
          </h3>
          <button onClick={onClose} className="nb-disc" aria-label="Close">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* The WCSC page's arrangement: diagrams across the page, and under each
            one what a solving sheet carries — here the day it belongs to, the
            stipulation, the material count. No composer: these are the days not
            yet attempted, and naming one would hand over the clue the board stops
            showing. Every daily is a #2, so the diagram is the only thing that
            tells one tile from another, which is why it gets the room. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          {loading ? (
            <div className="text-center py-12 text-[var(--faint)]">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-[var(--faint)]">No daily problems available.</div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {entries.map((entry) => {
                const status = directProgress[String(entry.id)];
                return (
                  <button
                    key={entry.date}
                    onClick={() => onSelectProblem('direct' as Genre, entry.problem, entry.date)}
                    className="nb-tile nb-shadow-room-sm w-full p-2 flex flex-col items-center gap-1"
                  >
                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">{formatDateLabel(entry.date)}</span>
                    <LazyBoard size={boardSize} className="rounded-[6px] overflow-hidden relative border-2 border-[var(--ink)]">
                      <Chessboard
                        position={entry.problem.fen}
                        boardWidth={boardSize}
                        arePiecesDraggable={false}
                        animationDuration={0}
                        customBoardStyle={{ borderRadius: '0' }}
                        customDarkSquareStyle={{ backgroundColor: '#779952' }}
                        customLightSquareStyle={{ backgroundColor: '#edeed1' }}
                      />
                      {status && (
                        <span className={`absolute top-0 right-0 w-4 h-4 flex items-center justify-center text-[8px] font-bold text-white rounded-bl ${status === 'solved' ? 'bg-green-500' : 'bg-[var(--bad)]'}`}>
                          {status === 'solved' ? '✓' : '✗'}
                        </span>
                      )}
                    </LazyBoard>
                    <div className="flex w-full items-baseline justify-between text-sm" style={{ maxWidth: boardSize }}>
                      <span className="font-bold text-[var(--ink)]">{entry.stipulation}</span>
                      <span className="text-[var(--muted)]">{pieceCounts(entry.problem.fen)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
