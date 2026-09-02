import React from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import './AppLayout.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <Header />
        <main className="app-content">
          {children}
        </main>
      </div>
    </div>
  );
}
