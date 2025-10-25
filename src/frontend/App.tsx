import { useState } from 'react';
import type { QueryMode } from '../types/index';
import { QueryInput } from './components/QueryInput';
import { ResponseDisplay } from './components/ResponseDisplay';
import { useQuery } from './hooks/useQuery';

export function App() {
  const [mode, setMode] = useState<QueryMode>('ask');
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [query, setQuery] = useState('What is the conjugate method?');

  const {
    isLoading,
    answer,
    sources,
    results,
    took_ms,
    error,
    askQuestionStream,
    askQuestion,
    searchDocuments,
  } = useQuery();

  const handleSubmit = () => {
    if (!query.trim()) {
      alert(
        mode === 'ask'
          ? 'Please enter a question'
          : 'Please enter a search query'
      );
      return;
    }

    if (mode === 'ask') {
      if (streamingEnabled) {
        askQuestionStream(query);
      } else {
        askQuestion(query);
      }
    } else {
      searchDocuments(query);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-5">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-semibold text-gray-800 mb-2.5">
          Vector Database RAG
        </h1>
        <p className="text-gray-600 mb-8">
          Ask questions and get answers from your document collection
        </p>

        <QueryInput
          mode={mode}
          setMode={setMode}
          streamingEnabled={streamingEnabled}
          setStreamingEnabled={setStreamingEnabled}
          query={query}
          setQuery={setQuery}
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />

        <ResponseDisplay
          isLoading={isLoading}
          error={error}
          answer={answer}
          sources={sources}
          results={results}
          took_ms={took_ms}
          mode={mode}
        />
      </div>
    </div>
  );
}
