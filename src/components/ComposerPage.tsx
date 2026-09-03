import { useEffect, useState } from 'react';
import { useTileGrid } from '../hooks/useTileGrid';
import { ProblemTile } from './ProblemTile';
import { fetchAuthorProblems } from '../services/api';
import type { SearchResult } from '../services/api';

interface ComposerPageProps {
  name: string;
  onClose: () => void;
  onSelectResult: (result: SearchResult) => void;
}

/**
 * Everything one composer has in the database, a page at a time.
 *
 * Author search stops at 200 hits, which is most of the database's weight cut
 * off: 683 composers have more than 200 problems and between them hold 58% of
 * it, and Јаневски, Живко alone has 3,202. Most composers need no paging at
 * all — 37% have a single problem and 62% four or fewer — so the controls only
 * appear when there is a second page.
 */
const PAGE_SIZE = 24;

export function ComposerPage({ name, onClose, onSelectResult }: ComposerPageProps) {
  const { columns, boardSize } = useTileGrid(672);
  const [page, setPage] = useState(0);
  // Which name and page the loaded set belongs to is part of the state, so a
  // mismatch with what is being shown is what "still loading" means. Clearing
  // the results in the effect instead would set state during the effect and
  // cascade a render.
  const [loaded, setLoaded] = useState<{
    key: string; results: SearchResult[]; total: number; failed: boolean;
  } | null>(null);
  const key = `${name}\u0000${page}`;

  useEffect(() => {
    let cancelled = false;
    fetchAuthorProblems(name, page, PAGE_SIZE)
      .then(data => {
        if (!cancelled) setLoaded({ key, results: data.results, total: data.total, failed: false });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, results: [], total: 0, failed: true });
      });
    return () => { cancelled = true; };
  }, [name, page, key]);

  const current = loaded?.key === key ? loaded : null;
  const results = current?.results ?? null;
  const total = current?.total ?? 0;
  const failed = current?.failed ?? false;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = page * PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div className="nb-ground fixed inset-0 z-50 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full min-h-0">
        <div className="flex items-start justify-between gap-2 px-4 py-3 border-b-2 border-[var(--ink)] shrink-0">
          <div className="min-w-0">
            {/* Never clipped — a composer's own page is the last place to cut
                their name short. */}
            <h2 className="text-lg font-bold text-gray-900 dark:text-white break-words">{name}</h2>
            <p className="text-xs text-[var(--faint)]">
              {total > 0
                ? `${total.toLocaleString()} problem${total === 1 ? '' : 's'}`
                + (pages > 1 ? ` — showing ${first}–${last}` : '')
                : failed ? 'Could not load this composer' : ''}
            </p>
          </div>
          <button onClick={onClose} className="nb-disc shrink-0" aria-label="Close">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {results == null && (
            <div className="text-center py-12 text-[var(--faint)] text-sm">Loading…</div>
          )}
          {results != null && results.length === 0 && (
            <div className="text-center py-12 text-[var(--faint)] text-sm">
              {failed ? 'Nothing came back for this name.' : 'No problems on this page.'}
            </div>
          )}
          {results != null && results.length > 0 && (
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {results.map(r => (
                <ProblemTile
                  key={r.id}
                  result={r}
                  boardSize={boardSize}
                  onSelect={onSelectResult}
                  omitAuthor={name}
                />
              ))}
            </div>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 px-4 py-3 border-t-2 border-[var(--ink)] shrink-0">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="nb-btn px-3 py-1.5 text-sm disabled:opacity-40"
            >
              ‹ Prev
            </button>
            <span className="text-xs text-[var(--faint)] tabular-nums">
              {page + 1} / {pages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
              disabled={page >= pages - 1}
              className="nb-btn px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Next ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
