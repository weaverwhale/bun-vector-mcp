import type { QueryMode } from '../../types/index';

interface QueryInputProps {
  mode: QueryMode;
  setMode: (mode: QueryMode) => void;
  streamingEnabled: boolean;
  setStreamingEnabled: (enabled: boolean) => void;
  query: string;
  setQuery: (query: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function QueryInput({
  mode,
  setMode,
  streamingEnabled,
  setStreamingEnabled,
  query,
  setQuery,
  onSubmit,
  isLoading,
}: QueryInputProps) {
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      onSubmit();
    }
  };

  return (
    <div>
      <div className="flex gap-4 mb-5 p-4 bg-gray-50 rounded-md">
        <label className="flex items-center cursor-pointer">
          <input
            type="radio"
            name="mode"
            value="ask"
            checked={mode === 'ask'}
            onChange={e => setMode(e.currentTarget.value as QueryMode)}
            className="mr-1.5 cursor-pointer"
          />
          🤖 Ask (RAG)
        </label>
        <label className="flex items-center cursor-pointer">
          <input
            type="radio"
            name="mode"
            value="search"
            checked={mode === 'search'}
            onChange={e => setMode(e.currentTarget.value as QueryMode)}
            className="mr-1.5 cursor-pointer"
          />
          🔍 Search (Similarity)
        </label>
      </div>

      {mode === 'ask' && (
        <div className="flex gap-4 mb-5 p-4 bg-gray-50 rounded-md">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={streamingEnabled}
              onChange={e => setStreamingEnabled(e.currentTarget.checked)}
              className="mr-1.5 cursor-pointer"
            />
            ⚡ Enable Streaming
          </label>
        </div>
      )}

      <div className="mb-5">
        <label
          htmlFor="question"
          className="block mb-1.5 text-gray-700 font-medium"
        >
          {mode === 'ask' ? 'Your Question:' : 'Search Query:'}
        </label>
        <input
          type="text"
          id="question"
          value={query}
          onChange={e => setQuery(e.currentTarget.value)}
          onKeyPress={handleKeyPress}
          placeholder={
            mode === 'ask'
              ? 'e.g., What is the conjugate method?'
              : 'e.g., conjugate method'
          }
          className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="flex gap-2.5 mb-5">
        <button
          onClick={onSubmit}
          disabled={isLoading}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-md text-base font-medium transition-colors hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {mode === 'ask'
            ? streamingEnabled
              ? '⚡ Ask Question (Streaming)'
              : '🤖 Ask Question'
            : '🔍 Search Documents'}
        </button>
      </div>
    </div>
  );
}
