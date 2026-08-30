import { useEffect, useState } from 'react';

/** The WCSC page's arrangement, shared by the lists that copied it: diagrams
    three across, two on a phone where a third would leave each board too small
    to read. The board takes a pixel width, so it is measured off the column
    rather than left to CSS.

    `maxContainer` is the page's own max-width, `pagePadding` the horizontal
    padding inside it; the rest is the gap between tiles and each tile's padding. */
export function useTileGrid(maxContainer: number, pagePadding = 32) {
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const columns = viewportWidth < 640 ? 2 : 3;
  const contentWidth = Math.min(viewportWidth, maxContainer) - pagePadding;
  const boardSize = Math.max(80, Math.floor((contentWidth - 8 * (columns - 1) - 16 * columns) / columns));
  return { columns, boardSize };
}
