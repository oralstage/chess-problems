/** The 49th World Chess Solving Championship, Magdeburg, 11-12.08.2026.
 *
 * Round structure and problem credits transcribed from the official WFCC
 * problem set (wfcc.ch → WCCC 2026 Magdeburg: 49.WCSC). YACPDB ids were
 * matched by author + source + year + stipulation + piece count (the Loyd,
 * which YACPDB holds twice, was disambiguated by its diagram position).
 * `yacpdbId: null` marks the two problems YACPDB does not hold, both composed
 * for 2026 events; they may appear there later.
 *
 * Two more had been marked null by a search that missed them. YACPDB files a
 * problem composed for a competition under the event's own name, so Minski's
 * study (no. 8) is there as "World Chess Solving Championship 2026" rather than
 * under the source the sheet prints; and Janevski (no. 17) is entered in
 * Macedonian Cyrillic as "Јаневски, Живко", which no Latin-script lookup finds.
 * Both were then confirmed square by square against the official diagram.
 */
export interface WcscProblem {
  no: number;
  author: string;
  source: string;
  stipulation: string;
  yacpdbId: number | null;
}

export interface WcscRound {
  round: number;
  title: string;
  minutes: number;
  problems: WcscProblem[];
}

export const WCSC_2026_TITLE = '49th WCSC 2026';
export const WCSC_2026_SUBTITLE = 'Magdeburg, 11–12 August 2026';

export const WCSC_2026_ROUNDS: WcscRound[] = [
  {
    round: 1, title: 'Twomovers', minutes: 20,
    problems: [
      { no: 1, author: 'Touw Hian Bwee', source: 'Neue Zürcher Zeitung 1979-1980, 1st Pr.', stipulation: '#2', yacpdbId: 3684 },
      { no: 2, author: 'Santi Pirrone', source: 'Thèmes-64, 1960', stipulation: '#2', yacpdbId: 170595 },
      { no: 3, author: 'Waclaw Gebelt', source: 'Hungary-Poland 1935, 1st Pl.', stipulation: '#2', yacpdbId: 40016 },
    ],
  },
  {
    round: 2, title: 'Threemovers', minutes: 60,
    problems: [
      { no: 4, author: 'László Lindner', source: 'The Western Morning News and Daily Gazette 1934', stipulation: '#3', yacpdbId: 213464 },
      { no: 5, author: 'Touw Hian Bwee', source: 'British Chess Federation Tourney 1974-1975, 1st HM.', stipulation: '#3', yacpdbId: 229209 },
      { no: 6, author: 'Tony Lewis', source: 'The Problemist 1997, 3rd Pr.', stipulation: '#3', yacpdbId: 226987 },
    ],
  },
  {
    round: 3, title: 'Endgame studies', minutes: 100,
    problems: [
      { no: 7, author: 'Vladislav V. Tarasyuk', source: 'Peremoga-45 JT Sportiva Gazeta 1991, 2nd Pr.', stipulation: '+', yacpdbId: 682853 },
      { no: 8, author: 'Martin Minski', source: 'Original for Polish Chess Federation 2026', stipulation: '+', yacpdbId: 683286 },
      { no: 9, author: 'Nikolai G. Ryabinin & Valery Kirillov', source: 'Europa Rochade 1992-1993, Pr.', stipulation: '=', yacpdbId: 682854 },
    ],
  },
  {
    round: 4, title: 'Helpmates', minutes: 50,
    problems: [
      { no: 10, author: 'László Talabér', source: 'Tipográfia Testedző Egyesület, 3rd Pr.', stipulation: 'h#2', yacpdbId: 44829 },
      { no: 11, author: 'Christopher Jones', source: 'Original for WCSC 2026', stipulation: 'h#3', yacpdbId: null },
      { no: 12, author: 'Yuri G. Fokin', source: 'Die Schwalbe 1983', stipulation: 'h#4', yacpdbId: 682852 },
    ],
  },
  {
    round: 5, title: 'Moremovers', minutes: 80,
    problems: [
      { no: 13, author: 'Samuel Loyd', source: 'The Mirror of American Sports 1885 (v)', stipulation: '#4', yacpdbId: 191957 },
      { no: 14, author: 'Mikhailo N. Marandyuk', source: 'The Macedonian Problemist 2009, Pr.', stipulation: '#5', yacpdbId: 682851 },
      { no: 15, author: 'Manfred Zucker', source: 'Schach 1984, 1st Pr.', stipulation: '#7', yacpdbId: 101802 },
    ],
  },
  {
    round: 6, title: 'Selfmates', minutes: 50,
    problems: [
      { no: 16, author: 'Constantin G. Pochtaryov & Yuri G. Fokin', source: 'Revista Română de Şah 1983, 1st HM.', stipulation: 's#2', yacpdbId: 88417 },
      { no: 17, author: 'Zivko Janevski', source: 'Schach 1992, 1st-2nd HM.', stipulation: 's#3', yacpdbId: 379084 },
      { no: 18, author: 'Mirko Degenkolbe & Nikolaj Zujev', source: 'Original for Schach 2026', stipulation: 's#5', yacpdbId: null },
    ],
  },
];
