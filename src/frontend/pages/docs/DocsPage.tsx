import { useEffect, useState } from 'react';
import { marked } from 'marked';
import { ThemeToggle } from '../../components/ThemeToggle';
import { HomeButton } from '../../components/HomeButton';
import { useDarkMode } from '../../hooks/useDarkMode';

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

export function DocsPage() {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const { isDarkMode, toggleTheme } = useDarkMode();

  useEffect(() => {
    // Fetch the markdown content
    fetch('/docs/content')
      .then(res => res.text())
      .then(text => {
        setContent(text);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load documentation:', err);
        setContent('# Error\n\nFailed to load documentation.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    // Initialize mermaid after content is loaded
    if (!loading && content) {
      // Dynamically load mermaid from CDN
      const script = document.createElement('script');
      script.type = 'module';
      script.textContent = `
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({
          startOnLoad: true,
          theme: ${isDarkMode ? "'dark'" : "'default'"},
        });
        mermaid.run({
          querySelector: '.language-mermaid',
        });
      `;
      document.body.appendChild(script);

      return () => {
        document.body.removeChild(script);
      };
    }
  }, [loading, content, isDarkMode]);

  const htmlContent = content
    ? (marked.parse(content, { async: false }) as string)
    : '';

  return (
    <div
      className="min-h-screen transition-colors duration-200"
      style={{
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 transition-all duration-200"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-primary)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1
              className="text-2xl font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Architecture Documentation
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <HomeButton />
            <ThemeToggle isDarkMode={isDarkMode} onToggle={toggleTheme} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-8 py-8">
        {loading ? (
          <div
            className="text-center py-12"
            style={{ color: 'var(--text-secondary)' }}
          >
            Loading documentation...
          </div>
        ) : (
          <div
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
      </div>

      <style>{`
        /* Documentation-specific enhancements */
        .markdown-content h1 {
          font-size: 2.25em;
          border-bottom: 2px solid var(--border-primary);
          padding-bottom: 0.3em;
          margin-top: 0;
        }
        
        .markdown-content h2 {
          font-size: 1.75em;
          margin-top: 2em;
          border-bottom: 1px solid var(--border-primary);
          padding-bottom: 0.3em;
        }
        
        .markdown-content h3 {
          font-size: 1.375em;
          margin-top: 1.6em;
        }
        
        .markdown-content hr {
          margin: 3em 0;
          border: 0;
          border-top: 1px solid var(--border-primary);
        }
        
        /* Mermaid diagrams */
        .markdown-content .language-mermaid {
          display: flex;
          justify-content: center;
          margin: 2em 0;
          padding: 2em;
          background-color: var(--bg-secondary);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-primary);
        }
        
        .markdown-content .mermaid {
          display: flex;
          justify-content: center;
        }
      `}</style>
    </div>
  );
}
