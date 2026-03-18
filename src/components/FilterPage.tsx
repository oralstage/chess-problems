import { useMemo, useState } from 'react';
import type { ChessProblem } from '../types';

interface GlobalFilters {
  keywords: string[];
  minPieces: number;
  maxPieces: number;
  minYear: number;
  maxYear: number;
  minMoves: number;
  maxMoves: number;
  sortBy: 'difficulty' | 'year';
  sortOrder: 'asc' | 'desc';
  stipulations: string[];
  statusFilter: 'all' | 'unsolved' | 'solved' | 'failed' | 'bookmarked';
}

interface FilterPageProps {
  allProblems: ChessProblem[];
  filters: GlobalFilters;
  onFiltersChange: (f: GlobalFilters) => void;
  onClose: () => void;
  genreStats?: { yearRange: { min: number; max: number }; pieceRange: { min: number; max: number }; moveRange: { min: number; max: number } } | null;
  hideMoveFilter?: boolean;
  moveFilterMin?: number;
}

function pieceCount(fen: string): number {
  return fen.split(' ')[0].replace(/[0-9/]/g, '').length;
}

/** Dual-thumb range slider component */
function DualRangeSlider({
  min, max, valueLow, valueHigh, onChange, label, formatValue,
}: {
  min: number; max: number;
  valueLow: number; valueHigh: number;
  onChange: (low: number, high: number) => void;
  label: string;
  formatValue?: (low: number, high: number, min: number, max: number) => string;
}) {
  const isFullRange = valueLow <= min && valueHigh >= max;
  const displayText = formatValue
    ? formatValue(valueLow, valueHigh, min, max)
    : isFullRange ? `${label}: Any` : `${label}: ${valueLow}–${valueHigh}`;

  // When both thumbs overlap, put the one that can still be dragged in the useful direction on top.
  // Upper half → min thumb on top (drag left), lower half → max thumb on top (drag right).
  const midpoint = (min + max) / 2;
  const overlapping = valueLow === valueHigh;
  const minZ = overlapping ? (valueLow >= midpoint ? 5 : 3) : (valueLow > max - 5 ? 5 : 3);
  const maxZ = overlapping ? (valueHigh >= midpoint ? 3 : 5) : 4;

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {displayText}
      </span>
      <div className="relative h-8 flex items-center">
        {/* Track background */}
        <div className="absolute inset-x-0 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
        {/* Active range */}
        <div
          className="absolute h-1.5 bg-green-500 dark:bg-green-600 rounded-full"
          style={{
            left: `${((valueLow - min) / (max - min)) * 100}%`,
            right: `${100 - ((valueHigh - min) / (max - min)) * 100}%`,
          }}
        />
        {/* Min thumb */}
        <input
          type="range"
          min={min}
          max={max}
          value={valueLow}
          onChange={e => {
            const v = Number(e.target.value);
            onChange(Math.min(v, valueHigh), valueHigh);
          }}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none
            [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-green-600 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
            [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
            [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none
            [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-green-600 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white
            [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
          style={{ zIndex: minZ }}
        />
        {/* Max thumb */}
        <input
          type="range"
          min={min}
          max={max}
          value={valueHigh}
          onChange={e => {
            const v = Number(e.target.value);
            onChange(valueLow, Math.max(v, valueLow));
          }}
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none
            [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-green-600 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
            [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
            [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none
            [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-green-600 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white
            [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
          style={{ zIndex: maxZ }}
        />
      </div>
    </div>
  );
}

export function FilterPage({ allProblems, filters, onFiltersChange, onClose, genreStats, hideMoveFilter, moveFilterMin }: FilterPageProps) {
  const [themeSearch, setThemeSearch] = useState('');

  // All unique keywords
  const allKeywords = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProblems) {
      for (const kw of p.keywords || []) {
        set.add(kw);
      }
    }
    return Array.from(set).sort();
  }, [allProblems]);

  // Piece count range
  const pieceRange = useMemo(() => {
    let min = 32, max = 2;
    for (const p of allProblems) {
      const c = pieceCount(p.fen);
      if (c < min) min = c;
      if (c > max) max = c;
    }
    return { min: Math.max(2, min), max: Math.min(32, max) };
  }, [allProblems]);

  // Year range — prefer stats from API, clamp to reasonable bounds
  const yearRange = useMemo(() => {
    const currentYear = new Date().getFullYear();
    if (genreStats?.yearRange && genreStats.yearRange.max > 0) {
      return {
        min: Math.max(1800, genreStats.yearRange.min),
        max: Math.min(currentYear, genreStats.yearRange.max),
      };
    }
    let min = 9999, max = 0;
    for (const p of allProblems) {
      if (p.sourceYear && p.sourceYear > 0) {
        const y = Math.max(p.sourceYear, 1800);
        const yc = Math.min(y, currentYear);
        if (yc < min) min = yc;
        if (yc > max) max = yc;
      }
    }
    return { min: min > max ? 1800 : min, max: max < min ? currentYear : max };
  }, [allProblems, genreStats]);

  // Move count range — prefer stats from API, clamp max to 30 for usability
  // (ultra-long problems like #450, #530 exist but are extremely rare)
  const MOVE_SLIDER_MAX = 30;
  const moveRange = useMemo(() => {
    if (genreStats?.moveRange && genreStats.moveRange.max > 0) {
      return { min: Math.max(1, genreStats.moveRange.min), max: Math.min(genreStats.moveRange.max, MOVE_SLIDER_MAX) };
    }
    let min = 999, max = 0;
    for (const p of allProblems) {
      if (p.moveCount > 0) {
        if (p.moveCount < min) min = p.moveCount;
        if (p.moveCount > max) max = p.moveCount;
      }
    }
    return { min: min > max ? 1 : min, max: Math.min(max < min ? 10 : max, MOVE_SLIDER_MAX) };
  }, [allProblems, genreStats]);

  const pieceLow = filters.minPieces || pieceRange.min;
  const pieceHigh = filters.maxPieces || pieceRange.max;
  const yearLow = filters.minYear || yearRange.min;
  const yearHigh = filters.maxYear || yearRange.max;
  const moveLow = filters.minMoves || moveRange.min;
  const moveHigh = filters.maxMoves || moveRange.max;

  const update = (patch: Partial<GlobalFilters>) => {
    onFiltersChange({ ...filters, ...patch });
  };

  const toggleKeyword = (kw: string) => {
    const current = filters.keywords;
    if (current.includes(kw)) {
      update({ keywords: current.filter(k => k !== kw) });
    } else {
      update({ keywords: [...current, kw] });
    }
  };

  const resetAll = () => {
    onFiltersChange({
      keywords: [], minPieces: 0, maxPieces: 0, minYear: 0, maxYear: 0, minMoves: 0, maxMoves: 0,
      sortBy: filters.sortBy, sortOrder: filters.sortOrder, stipulations: [], statusFilter: filters.statusFilter,
    });
  };

  const hasActiveFilters = filters.keywords.length > 0 || filters.minPieces > 0 || filters.maxPieces > 0
    || filters.minYear > 0 || filters.maxYear > 0
    || filters.minMoves > 0 || filters.maxMoves > 0;

  // Compute matching count in real-time
  const matchCount = useMemo(() => {
    let result = allProblems;
    if (filters.minPieces > 0) result = result.filter(p => pieceCount(p.fen) >= filters.minPieces);
    if (filters.maxPieces > 0) result = result.filter(p => pieceCount(p.fen) <= filters.maxPieces);
    if (filters.minYear > 0) result = result.filter(p => (p.sourceYear || 0) >= filters.minYear);
    if (filters.maxYear > 0) result = result.filter(p => (p.sourceYear || 9999) <= filters.maxYear);
    if (filters.minMoves > 0) result = result.filter(p => p.moveCount >= filters.minMoves);
    if (filters.maxMoves > 0) result = result.filter(p => p.moveCount <= filters.maxMoves);
    if (filters.keywords.length > 0) result = result.filter(p => filters.keywords.some(kw => p.keywords?.includes(kw)));
    if (filters.stipulations.length > 0) result = result.filter(p => filters.stipulations.includes(p.stipulation));
    return result.length;
  }, [allProblems, filters]);

  const filteredKeywords = themeSearch
    ? allKeywords.filter(kw => kw.toLowerCase().includes(themeSearch.toLowerCase()))
    : allKeywords;

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Filters</h2>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={resetAll}
                className="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                Reset all
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Move count range — hidden for fixed-move categories (#1, #2, #3) */}
          {!hideMoveFilter && (
          <section>
            <DualRangeSlider
              min={moveFilterMin || moveRange.min}
              max={moveRange.max}
              valueLow={Math.max(moveLow, moveFilterMin || moveRange.min)}
              valueHigh={moveHigh}
              onChange={(low, high) => {
                const effMin = moveFilterMin || moveRange.min;
                update({
                  minMoves: low <= effMin ? 0 : low,
                  maxMoves: high >= moveRange.max ? 0 : high,
                });
              }}
              label="Moves"
              formatValue={(low, high, min, max) =>
                low <= min && high >= max ? 'Moves: Any' : `Moves: ${low}–${high >= max ? `${max}+` : high}`
              }
            />
          </section>
          )}

          {/* Pieces range */}
          <section>
            <DualRangeSlider
              min={pieceRange.min}
              max={pieceRange.max}
              valueLow={pieceLow}
              valueHigh={pieceHigh}
              onChange={(low, high) => update({
                minPieces: low <= pieceRange.min ? 0 : low,
                maxPieces: high >= pieceRange.max ? 0 : high,
              })}
              label="Pieces"
              formatValue={(low, high, min, max) =>
                low <= min && high >= max ? 'Pieces: Any' : `Pieces: ${low}–${high}`
              }
            />
          </section>

          {/* Year range */}
          <section>
            <DualRangeSlider
              min={yearRange.min}
              max={yearRange.max}
              valueLow={yearLow}
              valueHigh={yearHigh}
              onChange={(low, high) => update({
                minYear: low <= yearRange.min ? 0 : low,
                maxYear: high >= yearRange.max ? 0 : high,
              })}
              label="Year"
              formatValue={(low, high, min, max) =>
                low <= min && high >= max ? 'Year: Any' : `Year: ${low}–${high}`
              }
            />
          </section>

          {/* Themes tag cloud */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Themes
                {filters.keywords.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-green-600 dark:text-green-400">
                    {filters.keywords.length} selected
                  </span>
                )}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => update({ keywords: [...allKeywords] })}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  Select all
                </button>
                {filters.keywords.length > 0 && (
                  <button
                    onClick={() => update({ keywords: [] })}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  >
                    Deselect all
                  </button>
                )}
              </div>
            </div>
            {allKeywords.length > 20 && (
              <input
                type="text"
                value={themeSearch}
                onChange={e => setThemeSearch(e.target.value)}
                placeholder="Search themes..."
                className="w-full px-3 py-1.5 mb-2 rounded-lg text-sm bg-gray-50 border border-gray-200 text-gray-700 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            )}
            <div className="flex flex-wrap gap-1.5">
              {[...filteredKeywords].sort((a, b) => {
                const aS = filters.keywords.includes(a) ? 0 : 1;
                const bS = filters.keywords.includes(b) ? 0 : 1;
                return aS - bS;
              }).map(kw => {
                const isSelected = filters.keywords.includes(kw);
                return (
                  <button
                    key={kw}
                    onClick={() => toggleKeyword(kw)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-green-600 text-white dark:bg-green-500'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    {kw}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            {hasActiveFilters ? `Done · ${matchCount.toLocaleString()} problems` : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
