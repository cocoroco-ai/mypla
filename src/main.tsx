import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyStyle, applyTheme, currentStyle, currentTheme } from './themes';

// 保存してあるテーマを反映（上の帯の色もそろえる）
applyTheme(currentTheme(), false);
applyStyle(currentStyle(), false);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
