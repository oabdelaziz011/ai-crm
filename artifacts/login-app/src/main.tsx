import { createRoot } from 'react-dom/client';

import './i18n';
import App from './App';
import { consumePlatformAdminHandoff } from '@/lib/platform/platform-admin-context';

import './index.css';

void consumePlatformAdminHandoff().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
