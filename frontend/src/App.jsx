import React from 'react';
import MapView from './Map';

export default function App() {
  return (
    <div className="app-root">
      <header className="topbar">
        <h1>MRMS — Reflectivity At Lowest Altitude (RALA)</h1>
        <div className="controls">
          <small>Auto-refresh every 2 minutes • Data from MRMS</small>
        </div>
      </header>
      <main>
        <MapView />
      </main>
      <footer className="footer">Built with MRMS • Live updates</footer>
    </div>
  );
}
