import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p style={{ padding: 16 }}>Drum Machine</p>
  </StrictMode>,
);
