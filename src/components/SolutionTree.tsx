import { useEffect } from 'react';
import type { SolutionNode } from '../types';

interface SolutionTreeProps {
  nodes: SolutionNode[];
  solutionText: string;
  playback: {
    positions: { fen: string; lastMove: { from: string; to: string } | null; san: string }[];
    mainLine: SolutionNode[];
    moveIndex: number;
    exploring: boolean;
  } | null;
  onGoTo: (index: number) => void;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
}

function SolutionNodeView({ node, depth }: { node: SolutionNode; depth: number }) {
  const moveClasses = node.color === 'w'
    ? 'font-bold text-gray-900 dark:text-gray-100'
    : 'italic text-gray-700 dark:text-gray-300';

  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <span className={moveClasses}>
        {node.moveSan}
      </span>
      {node.isKey && <span className="text-red-500 ml-1 font-bold">!</span>}
      {node.isMate && <span className="text-red-600 ml-1">#</span>}
      {node.isThreat && <span className="text-orange-500 ml-1 text-xs">(threat)</span>}
      {node.annotation && (
        <span className="text-gray-400 ml-1 text-xs">({node.annotation})</span>
      )}
      {node.children.map((child, i) => (
        <SolutionNodeView key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function SolutionTree({ nodes, solutionText, playback, onGoTo, onFirst, onPrev, onNext, onLast }: SolutionTreeProps) {
  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
      if (e.key === 'Home') { e.preventDefault(); onFirst(); }
      if (e.key === 'End') { e.preventDefault(); onLast(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onFirst, onPrev, onNext, onLast]);

  const moveIndex = playback?.moveIndex ?? -1;
  const positions = playback?.positions ?? [];
  const mainLine = playback?.mainLine ?? [];
  const exploring = playback?.exploring ?? false;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Solution</h3>
        {exploring && (
          <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            Exploring — click a move or press ← to return
          </span>
        )}
      </div>

      {/* Move display */}
      {positions.length > 1 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1 flex-wrap text-sm">
            {mainLine.map((node, i) => (
              <button
                key={i}
                onClick={() => onGoTo(i)}
                className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                  !exploring && i === moveIndex
                    ? 'bg-cp-primary text-white'
                    : node.color === 'w'
                      ? 'font-bold text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700'
                      : 'italic text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : ''}{positions[i + 1]?.san || node.moveSan}
              </button>
            ))}
          </div>

        </div>
      )}

      {/* Full variation tree */}
      <details className="text-xs" open>
        <summary className="text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 text-sm font-medium">
          All variations
        </summary>
        <div className="mt-2 text-sm font-mono bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-0.5">
          {nodes.map((node, i) => (
            <SolutionNodeView key={i} node={node} depth={0} />
          ))}
        </div>
      </details>

      {/* Raw solution text */}
      <details className="text-xs">
        <summary className="text-gray-400 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
          YACPDB original notation
        </summary>
        <pre className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-x-auto">
          {solutionText}
        </pre>
      </details>
    </div>
  );
}
