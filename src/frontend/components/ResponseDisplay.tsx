import { marked } from 'marked';
import type { Source } from '../../types/index';
import { SourcesList } from './SourcesList';

interface ResponseDisplayProps {
  isLoading: boolean;
  error: string | null;
  answer: string;
  sources: Source[];
  results: Source[];
  took_ms: number | null;
  mode: 'ask' | 'search';
}

export function ResponseDisplay({
  isLoading,
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
      <div className="mt-5 p-5 bg-blue-50 rounded-md border-l-4 border-blue-600">
        <div className="text-blue-700 italic">
          {mode === 'ask' ? 'Generating answer...' : 'Searching documents...'}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-5 p-5 bg-red-50 rounded-md border-l-4 border-red-600">
        <strong className="text-red-900">Error:</strong>{' '}
        <span className="text-red-800">{error}</span>
      </div>
    );
  }

  if (mode === 'search' && results.length > 0) {
    return (
      <div className="mt-5 p-5 bg-gray-50 rounded-md border-l-4 border-blue-600">
        <div className="space-y-3">
          <SourcesList
            sources={results}
            hasMarkdown={false}
            mode={mode}
            took_ms={took_ms}
          />
        </div>
      </div>
    );
  }

  if (mode === 'ask' && answer) {
    const parsedAnswer = marked.parse(answer) as string;

    return (
      <div className="mt-5 p-5 bg-gray-50 rounded-md border-l-4 border-blue-600">
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
