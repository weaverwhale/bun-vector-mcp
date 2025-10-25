import { useState } from 'react';
import type {
  AskResponse,
  SearchResponse,
  Source,
  StreamEvent,
} from '../../types/index';

const API_URL = 'http://localhost:1738';

interface UseQueryState {
  isLoading: boolean;
  isStreaming: boolean;
  answer: string;
  sources: Source[];
  results: Source[];
  took_ms: number | null;
  error: string | null;
}

export function useQuery() {
  const [state, setState] = useState<UseQueryState>({
    isLoading: false,
    isStreaming: false,
    answer: '',
    sources: [],
    results: [],
    took_ms: null,
    error: null,
  });

  const askQuestionStream = async (
    question: string,
    topK?: number,
    similarityThreshold?: number
  ) => {
    setState({
      isLoading: true,
      isStreaming: false,
      answer: '',
      sources: [],
      results: [],
      took_ms: null,
      error: null,
    });

    let currentAnswer = '';
    let sources: Source[] = [];

    try {
      const response = await fetch(`${API_URL}/ask/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question, topK, similarityThreshold }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6);
          try {
            const event = JSON.parse(jsonStr) as StreamEvent;

            if (event.type === 'sources') {
              sources = event.sources || [];
              setState(prev => ({
                ...prev,
                isLoading: true,
                isStreaming: false,
                sources,
                answer: '',
              }));
            } else if (event.type === 'chunk') {
              currentAnswer += event.text || '';
              setState(prev => ({
                ...prev,
                isLoading: false,
                isStreaming: true,
                answer: currentAnswer,
                sources,
              }));
            } else if (event.type === 'done') {
              setState(prev => ({
                ...prev,
                isLoading: false,
                isStreaming: false,
                answer: currentAnswer,
                sources,
                took_ms: event.took_ms || null,
              }));
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Unknown error');
            }
          } catch (e) {
            if (!(e instanceof SyntaxError)) {
              throw e;
            }
          }
        }
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        isStreaming: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const askQuestion = async (
    question: string,
    topK?: number,
    similarityThreshold?: number
  ) => {
    setState({
      isLoading: true,
      isStreaming: false,
      answer: '',
      sources: [],
      results: [],
      took_ms: null,
      error: null,
    });

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question, topK, similarityThreshold }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: AskResponse = await response.json();
      setState({
        isLoading: false,
        isStreaming: false,
        answer: data.answer,
        sources: data.sources,
        results: [],
        took_ms: data.took_ms,
        error: null,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        isStreaming: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const searchDocuments = async (
    query: string,
    topK?: number,
    similarityThreshold?: number
  ) => {
    setState({
      isLoading: true,
      isStreaming: false,
      answer: '',
      sources: [],
      results: [],
      took_ms: null,
      error: null,
    });

    try {
      const response = await fetch(`${API_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, topK, similarityThreshold }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: SearchResponse = await response.json();
      setState({
        isLoading: false,
        isStreaming: false,
        answer: '',
        sources: [],
        results: data.results,
        took_ms: data.took_ms,
        error: null,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        isStreaming: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  return {
    ...state,
    askQuestionStream,
    askQuestion,
    searchDocuments,
  };
}
