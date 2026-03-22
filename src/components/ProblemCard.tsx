import { useState } from 'react';
import type { ChessProblem } from '../types';
import { findTheme } from '../data/themes';

interface ProblemCardProps {
  problem: ChessProblem;
  showThemes?: boolean;
  problemNumber?: number;
  genrePrefix?: string;
  ratedMode?: boolean;
}

function pieceCounts(fen: string): string {
  const board = fen.split(' ')[0];
  let white = 0, black = 0;
  for (const ch of board) {
    if (ch >= 'A' && ch <= 'Z') white++;
    else if (ch >= 'a' && ch <= 'z') black++;
  }
  return `${white}+${black}`;
}

function stipulationDisplay(stip: string): string {
  if (stip.startsWith('h#')) return `h#${stip.slice(2)}`;
  if (stip.startsWith('s#')) return `s#${stip.slice(2)}`;
  if (stip.startsWith('#')) return `#${stip.slice(1)}`;
  if (stip === '+') return 'Win';
  if (stip === '=') return 'Draw';
  return stip;
}

export function ProblemCard({ problem, showThemes, problemNumber, genrePrefix, ratedMode }: ProblemCardProps) {
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        {problemNumber !== undefined && (
          <span className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {genrePrefix || ''}{problemNumber}
          </span>
        )}
        <span className={`rounded-md font-bold font-mono px-2 py-0.5 text-sm ${ratedMode ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'}`}>
          {stipulationDisplay(problem.stipulation)}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
          {pieceCounts(problem.fen)}
        </span>
      </div>

      <div className="text-gray-600 dark:text-gray-400">
        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
          {problem.authors.join(', ')}
        </div>
        <div className="text-sm truncate">
          {problem.sourceName}
          {problem.sourceYear && `, ${problem.sourceYear}`}
        </div>
      </div>

      {showThemes && problem.keywords.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex flex-wrap gap-1">
            {problem.keywords.map(kw => {
              const theme = findTheme(kw);
              const hasDescription = !!theme?.description;
              const isExpanded = expandedTag === kw;
              return hasDescription ? (
                <button
                  key={kw}
                  onClick={() => setExpandedTag(isExpanded ? null : kw)}
                  className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                    isExpanded
                      ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  {kw}
                </button>
              ) : (
                <span
                  key={kw}
                  className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                >
                  {kw}
                </span>
              );
            })}
          </div>
          {expandedTag && (() => {
            const theme = findTheme(expandedTag);
            if (!theme?.description) return null;
            return (
              <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2 leading-relaxed">
                {theme.description}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
