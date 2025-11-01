export function DocsButton() {
  return (
    <a
      href="/docs"
      className="p-3 rounded-lg transition-all duration-200 hover:scale-105 cursor-pointer inline-block"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-primary)',
      }}
      aria-label="View documentation"
      title="View architecture documentation"
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
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
      </svg>
    </a>
  );
}

