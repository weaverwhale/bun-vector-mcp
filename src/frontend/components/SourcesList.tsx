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
    <div className={hasMarkdown ? 'mt-5 pt-5 border-t border-gray-300' : ''}>
      <h3 className="text-sm font-medium text-gray-600 mb-2.5 uppercase tracking-wide">
        {mode === 'search' ? 'Search Results' : 'Sources'} ({sources.length})
      </h3>
      <div className="space-y-2">
        {sources.map((source, idx) => (
          <div
            key={idx}
            className="bg-white p-2.5 rounded border border-gray-200 text-xs text-gray-700"
          >
            <strong className="text-gray-900">
              {idx + 1}. {source.filename}
            </strong>
            <br />
            {mode === 'search' && (
              <blockquote className="text-gray-800 leading-relaxed my-2 border-l-2 border-gray-300 pl-2">
                {source.chunk_text}
              </blockquote>
            )}
            <em className="text-gray-600">
              Similarity: {(source.similarity * 100).toFixed(1)}%
            </em>
          </div>
        ))}
      </div>
      {took_ms !== null && (
        <div className="text-xs text-gray-500 mt-4 text-right">
          {mode === 'search' ? 'Search time:' : 'Response time:'} {took_ms}ms
        </div>
      )}
    </div>
  );
}
