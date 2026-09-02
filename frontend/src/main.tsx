import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider } from './core/store/context';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
