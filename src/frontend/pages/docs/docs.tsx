import { createRoot } from 'react-dom/client';
import { DocsPage } from './DocsPage';
import '../../styles.css';

const root = createRoot(document.getElementById('root')!);
root.render(<DocsPage />);
