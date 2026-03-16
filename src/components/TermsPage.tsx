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

      <h1 className="text-2xl font-bold mb-6">Commerce Disclosure</h1>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">Business Name</h2>
          <p>Chess Problems (chess-problems.pages.dev)</p>
          <p className="mt-1">Operated by: Ushiyutvj</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Product / Service Description</h2>
          <p>
            Chess Problems is a free, open-source web application for solving chess
            compositions interactively. Users can solve over 36,000 curated chess problems
            across five categories: Direct Mate, Helpmate, Selfmate, Study, and Retro.
            The application includes features such as move validation, hints powered by
            Stockfish, solution playback, and progress tracking. All problem data is
            sourced from{' '}
            <a href="https://www.yacpdb.org/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              YACPDB (Yet Another Chess Problem Database)
            </a>.
          </p>
          <p className="mt-2">
            <strong>The core service is entirely free.</strong> No registration, login,
            or payment is required to use the application.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Donations / Payments</h2>
          <p>
            Users may optionally support the project through voluntary donations via{' '}
            <a href="https://ko-fi.com/A0A21W2W51" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              Ko-fi
            </a>.
            Donations are processed in <strong>USD</strong> through Stripe (via Ko-fi).
          </p>
          <p className="mt-2">
            Donations are voluntary tips to show appreciation for the project. They do
            not constitute a purchase of any product or service. No goods, services,
            premium features, or additional content are provided in exchange for donations.
            All users receive the same experience regardless of donation status.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Refund &amp; Cancellation Policy</h2>
          <p>
            All donations are voluntary and <strong>non-refundable</strong>. Since no
            product or service is sold and no goods are delivered, refunds are not
            applicable. If you believe a payment was made in error, please contact
            Ko-fi support at{' '}
            <a href="https://help.ko-fi.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              help.ko-fi.com
            </a>{' '}
            or reach out to the operator using the contact information below.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Privacy Policy</h2>
          <p>
            This site does not collect, store, or transmit any personal data. Specifically:
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700 dark:text-gray-300">
            <li>No user accounts or registration</li>
            <li>No cookies</li>
            <li>No analytics or tracking scripts</li>
            <li>No data sent to any server</li>
          </ul>
          <p className="mt-2">
            Problem-solving progress and user preferences (such as theme and bookmarks)
            are stored locally in your browser using localStorage. This data never leaves
            your device.
          </p>
          <p className="mt-2">
            Donation payments are processed by{' '}
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              Stripe
            </a>{' '}
            through Ko-fi. The operator does not have access to your payment card details.
            Please refer to Stripe's and Ko-fi's privacy policies for information on how
            they handle payment data.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Payment Security</h2>
          <p>
            All payment processing is handled securely by{' '}
            <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              Stripe
            </a>{' '}
            through{' '}
            <a href="https://ko-fi.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              Ko-fi
            </a>.
            Stripe is PCI DSS Level 1 certified — the highest level of certification
            in the payment industry. This site does not store, process, or have access
            to any credit card or financial information. All transactions are encrypted
            via HTTPS/TLS.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Contact Information</h2>
          <p>For questions, issues, or refund inquiries, you can reach the operator through:</p>
          <p className="mt-2 text-gray-700 dark:text-gray-300">
            Ko-fi:{' '}
            <a href="https://ko-fi.com/A0A21W2W51" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              ko-fi.com/ushiyutvj
            </a>{' '}
            (use the message feature)
          </p>
        </div>
      </section>

      <footer className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
        <p>Last updated: March 2026</p>
      </footer>
    </div>
  );
}
