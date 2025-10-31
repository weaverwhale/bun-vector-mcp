import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import type { Source } from '../../types/index';
import { SourcesList } from './SourcesList';

// Configure marked to use KaTeX for math expressions
// Supports: $inline math$ and $$display math$$
marked.use(
  markedKatex({
    throwOnError: false,
    output: 'html',
  })
);

interface ResponseDisplayProps {
  isLoading: boolean;
  isStreaming?: boolean;
  error: string | null;
  answer: string;
  sources: Source[];
  results: Source[];
  took_ms: number | null;
  mode: 'ask' | 'search';
}

export function ResponseDisplay({
  isLoading,
  isStreaming,
  error,
  answer,
  sources,
  results,
  took_ms,
  mode,
}: ResponseDisplayProps) {
  if (!isLoading && !error && !answer && results.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div
        className="mt-6 p-6 rounded-lg fade-in"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-primary)',
          borderLeft: '4px solid var(--info)',
        }}
      >
        <div className="flex items-center gap-3">
          <svg
            className="spinner"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--info)' }}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span
            className="font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            {mode === 'ask' ? 'Generating answer...' : 'Searching documents...'}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          <div
            className="h-2 rounded"
            style={{
              backgroundColor: 'var(--bg-accent)',
              width: '100%',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
          <div
            className="h-2 rounded"
            style={{
              backgroundColor: 'var(--bg-accent)',
              width: '85%',
              animation: 'pulse 1.5s ease-in-out infinite',
              animationDelay: '0.1s',
            }}
          />
          <div
            className="h-2 rounded"
            style={{
              backgroundColor: 'var(--bg-accent)',
              width: '90%',
              animation: 'pulse 1.5s ease-in-out infinite',
              animationDelay: '0.2s',
            }}
          />
        </div>
        {/* Show sources while loading if available (streaming mode) */}
        {sources.length > 0 && (
          <div
            className="mt-6 pt-6"
            style={{ borderTop: '1px solid var(--border-primary)' }}
          >
            <SourcesList
              sources={sources}
              hasMarkdown={false}
              mode={mode}
              took_ms={null}
            />
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="mt-6 p-6 rounded-lg fade-in"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-primary)',
          borderLeft: '4px solid var(--error)',
        }}
      >
        <div className="flex items-start gap-3">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--error)', marginTop: '2px' }}
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div>
            <strong style={{ color: 'var(--error)' }}>Error:</strong>{' '}
            <span style={{ color: 'var(--text-secondary)' }}>{error}</span>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'search' && results.length > 0) {
    return (
      <div
        className="mt-6 p-6 rounded-lg fade-in"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-primary)',
          borderLeft: '4px solid var(--success)',
        }}
      >
        <SourcesList
          sources={results}
          hasMarkdown={false}
          mode={mode}
          took_ms={took_ms}
        />
      </div>
    );
  }

  if (mode === 'ask' && answer) {
    const parsedAnswer = marked.parse(answer) as string;

    return (
      <div
        className="mt-6 p-6 rounded-lg fade-in"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-primary)',
          borderLeft: `4px solid ${isStreaming ? 'var(--info)' : 'var(--success)'}`,
        }}
      >
        <div
          className="markdown-content mb-4"
          dangerouslySetInnerHTML={{ __html: parsedAnswer }}
        />
        <SourcesList
          sources={sources}
          hasMarkdown={true}
          mode={mode}
          took_ms={took_ms}
        />
      </div>
    );
  }

  return null;
}
