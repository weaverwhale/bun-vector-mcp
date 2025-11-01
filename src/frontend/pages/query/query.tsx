import { createRoot } from 'react-dom/client';
import { QueryPage } from './QueryPage';
import '../../styles.css';

const root = createRoot(document.getElementById('root')!);
root.render(<QueryPage />);
