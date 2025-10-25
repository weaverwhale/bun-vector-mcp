import type { Source } from '../../types/index';

interface SourcesListProps {
  sources: Source[];
  hasMarkdown: boolean;
  mode: 'ask' | 'search';
  took_ms: number | null;
}

export function SourcesList({
  sources,
  hasMarkdown,
  mode,
  took_ms,
}: SourcesListProps) {
  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div
      className={hasMarkdown ? 'mt-6 pt-6' : ''}
      style={
        hasMarkdown
          ? {
              borderTop: '1px solid var(--border-primary)',
            }
          : {}
      }
    >
      <h3
        className="text-sm font-semibold mb-4 uppercase tracking-wider flex items-center gap-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
        </svg>
        {mode === 'search' ? 'Search Results' : 'Sources'} ({sources.length})
      </h3>
      <div className="space-y-3">
        {sources.map((source, idx) => (
          <div
            key={idx}
            className="p-4 rounded-lg transition-all duration-200"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-secondary)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-1">
                <span
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                    color: 'var(--bg-secondary)',
                  }}
                >
                  {idx + 1}
                </span>
                <strong
                  className="font-semibold text-sm break-all"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {source.filename}
                </strong>
              </div>
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-accent)',
                  color: 'var(--text-primary)',
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                {(source.similarity * 100).toFixed(1)}%
              </div>
            </div>
            {mode === 'search' && (
              <blockquote
                className="text-sm leading-relaxed mt-3 pl-3 py-2"
                style={{
                  color: 'var(--text-secondary)',
                  borderLeft: '3px solid var(--accent-primary)',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                  padding: '8px 12px',
                }}
              >
                {source.chunk_text}
              </blockquote>
            )}
          </div>
        ))}
      </div>
      {took_ms !== null && (
        <div
          className="text-xs mt-5 text-right flex items-center justify-end gap-1.5"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          {mode === 'search' ? 'Search time:' : 'Response time:'} {took_ms}ms
        </div>
      )}
    </div>
  );
}
