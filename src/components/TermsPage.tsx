interface TermsPageProps {
  onBack: () => void;
}

export function TermsPage({ onBack }: TermsPageProps) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-gray-800 dark:text-gray-200">
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h1 className="text-2xl font-bold mb-6">About &amp; Terms</h1>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">About This Site</h2>
          <p>
            Chess Problems is a free, open-source web application for solving chess
            compositions interactively. It features over 36,000 problems across five
            categories: Direct Mate, Helpmate, Selfmate, Study, and Retro. All problem
            data is sourced from{' '}
            <a href="https://www.yacpdb.org/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              YACPDB (Yet Another Chess Problem Database)
            </a>.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Operator</h2>
          <p>Ushiyutvj</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Donations</h2>
          <p>
            This site is entirely free to use. If you enjoy it and wish to support
            its development, you may make a voluntary donation via{' '}
            <a href="https://ko-fi.com/A0A21W2W51" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              Ko-fi
            </a>.
            Donations are optional tips to show appreciation — they do not constitute
            a purchase of any product or service, and no goods or services are
            provided in return.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Refund Policy</h2>
          <p>
            All donations are voluntary and non-refundable. Since no product or
            service is sold, there are no refunds. If you believe a payment was
            made in error, please contact Ko-fi support directly.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Privacy</h2>
          <p>
            This site does not collect personal data. Problem progress and
            preferences are stored locally in your browser (localStorage) and are
            never transmitted to any server. No cookies are used. No analytics
            or tracking scripts are included.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Contact</h2>
          <p>
            For questions or issues, please open an issue on the project's GitHub
            repository or reach out via Ko-fi.
          </p>
        </div>
      </section>
    </div>
  );
}
