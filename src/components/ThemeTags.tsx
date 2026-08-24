import { useState } from 'react';
import { findTheme } from '../data/themes';

interface ThemeTagsProps {
  keywords: string[];
}

/**
 * The problem's themes, with a description under whichever one is open.
 *
 * These belong below the board, next to the solution. They are hidden while
 * solving because a theme name gives the answer away, which makes them part of
 * the answer rather than part of the problem's identity — and anything that
 * appears above the board when a problem is solved pushes the board down at
 * the exact moment the reader is looking at it.
 */
export function ThemeTags({ keywords }: ThemeTagsProps) {
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  if (keywords.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {/* Same heading as Solution: the tags sit directly under the button row
          and wear the same outlined pill, so without a break between them the
          two read as one continuous strip of controls. */}
      <h3 className="nb-panel-label text-[0.7rem]">Themes</h3>
      <div className="flex flex-wrap gap-1">
        {keywords.map(kw => {
          const theme = findTheme(kw);
          const isExpanded = expandedTag === kw;
          // Every theme is equally a property of the problem, so they all wear
          // the same chip. What used to separate them — an outline against
          // grey text — encoded whether the word appears in this site's
          // hand-written glossary, which covers 91 of the roughly 3,700
          // keywords in the database. Read off the page that said "this theme
          // matters less", which is not what it meant. The triangle says the
          // only true thing: there is something to open here. It points the
          // same way as the disclosure under the solution.
          return theme?.description ? (
            <button
              key={kw}
              onClick={() => setExpandedTag(isExpanded ? null : kw)}
              className={`nb-chip px-2.5 py-0.5 text-xs ${isExpanded ? 'nb-chip-on' : ''}`}
            >
              {kw}
              <span className="ml-1">{isExpanded ? '▾' : '▸'}</span>
            </button>
          ) : (
            <span key={kw} className="nb-chip px-2.5 py-0.5 text-xs">
              {kw}
            </span>
          );
        })}
      </div>
      {expandedTag && (() => {
        const theme = findTheme(expandedTag);
        if (!theme?.description) return null;
        return (
          <div className="text-sm font-medium text-[var(--muted)] bg-[var(--surface-2)] rounded-lg px-3 py-2 leading-relaxed">
            {theme.description}
          </div>
        );
      })()}
    </div>
  );
}
