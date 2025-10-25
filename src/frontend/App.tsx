import { useState } from 'react';
import type { QueryMode } from '../types/index';
import { QueryInput } from './components/QueryInput';
import { ResponseDisplay } from './components/ResponseDisplay';
import { ThemeToggle } from './components/ThemeToggle';
import { useQuery } from './hooks/useQuery';
import { useDarkMode } from './hooks/useDarkMode';

export function App() {
  const [mode, setMode] = useState<QueryMode>('ask');
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [query, setQuery] = useState('What is the conjugate method?');

  const { isDarkMode, toggleTheme } = useDarkMode();

  const {
    isLoading,
    isStreaming,
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
    <div
      className="min-h-screen py-12 px-5 transition-colors duration-200"
      style={{
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      <div
        className="max-w-4xl mx-auto p-8 rounded-lg transition-all duration-200"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-primary)',
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1
              className="text-3xl font-semibold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Vector Database RAG
            </h1>
            <p style={{ color: 'var(--text-tertiary)' }}>
              Ask questions and get answers from your document collection
            </p>
          </div>
          <ThemeToggle isDarkMode={isDarkMode} onToggle={toggleTheme} />
        </div>

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
          isStreaming={isStreaming}
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
