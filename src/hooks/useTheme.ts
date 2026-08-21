import { useEffect } from 'react';

/* The site has one look. The restyle removed the dark palette and its toggle
   (see fairy-chess-problems' DESIGN-NOTES.md — same decision, same reason:
   `dark:` utilities left in the views that are not individually restyled are
   compiled against a selector that never matches, so they are inert). This
   hook stays so the stale `.dark` class and the old theme-color value are
   cleaned off browsers that stored them before the restyle. */
export function useTheme() {
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#93ab6a');
  }, []);
}
