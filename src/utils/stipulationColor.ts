import type { Genre } from '../types';

export function getStipulationColorClasses(stipulation: string, genre: Genre): string {
  if (genre !== 'direct' || !stipulation.startsWith('#')) {
    return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300';
  }
  const mc = parseInt(stipulation.slice(1), 10);
  switch (mc) {
    case 2: return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300';
    case 3: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300';
    case 4: return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300';
    case 5: return 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300';
    case 6: return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300';
    case 7: return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300';
    default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}

export function getStipulationToastClasses(moveCount: number): string {
  switch (moveCount) {
    case 2: return 'bg-green-700/90';
    case 3: return 'bg-blue-700/90';
    case 4: return 'bg-amber-600/90';
    case 5: return 'bg-pink-700/90';
    case 6: return 'bg-purple-700/90';
    case 7: return 'bg-cyan-700/90';
    default: return 'bg-black/70';
  }
}

export function getStipulationTextColorClasses(stipulation: string, genre: Genre): string {
  if (genre !== 'direct' || !stipulation.startsWith('#')) {
    return 'text-gray-500 dark:text-gray-400';
  }
  const mc = parseInt(stipulation.slice(1), 10);
  switch (mc) {
    case 2: return 'text-green-600 dark:text-green-400';
    case 3: return 'text-blue-600 dark:text-blue-400';
    case 4: return 'text-amber-600 dark:text-amber-400';
    case 5: return 'text-pink-600 dark:text-pink-400';
    case 6: return 'text-purple-600 dark:text-purple-400';
    case 7: return 'text-cyan-600 dark:text-cyan-400';
    default: return 'text-gray-500 dark:text-gray-400';
  }
}
