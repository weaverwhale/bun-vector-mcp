export function HomeButton() {
  return (
    <a
      href="/"
      className="p-3 rounded-lg transition-all duration-200 hover:scale-105 cursor-pointer inline-block"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-primary)',
      }}
      aria-label="Go to home page"
      title="Back to app"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
      </svg>
    </a>
  );
}

