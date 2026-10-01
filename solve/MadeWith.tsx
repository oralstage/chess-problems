const SITE = 'https://arcade.chessproblem.org';

/* One line under the sheet of the full-page board, for whoever wonders how a
   page like this is made. The same line however the page was opened -- an
   address from /make, a YACPDB id or the daily -- since /make makes all of
   them. Not in the embed: a line there is taken from the diagram. */
export function MadeWith() {
  return (
    <p className="text-center text-xs text-[var(--faint)] pb-6">
      Made with{' '}
      <a className="underline" href={`${SITE}/make`}>chessproblem.org/make</a>
    </p>
  );
}
