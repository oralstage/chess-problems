import React from 'react';
import { createRoot } from 'react-dom/client';
import { Chessboard } from 'react-chessboard';

const fen = new URLSearchParams(window.location.search).get('fen') || '8/8/8/8/8/8/8/8 w - - 0 1';
const mateIn = new URLSearchParams(window.location.search).get('mateIn') || '';
const rating = new URLSearchParams(window.location.search).get('rating') || '';

document.documentElement.style.cssText = 'margin:0;width:1080px;height:1080px;overflow:hidden;background:#111827';
document.body.style.cssText = 'margin:0;width:1080px;height:1080px;overflow:hidden;background:#111827';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ width: 1080, height: 1080, background: '#111827' }}>
      <header style={{
        boxSizing: 'border-box', display: 'flex', alignItems: 'baseline', gap: 16,
        width: 1080, height: 120, padding: '0 42px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        <span style={{ color: '#ffffff', fontSize: 38, fontWeight: 850, letterSpacing: '0.03em' }}>
          {mateIn}
        </span>
        {rating && (
          <span style={{ color: '#86efac', fontSize: 23, fontWeight: 750, letterSpacing: '0.06em' }}>
            RATING ~{rating}
          </span>
        )}
      </header>
      <div style={{ marginLeft: 60 }}>
        <Chessboard
          position={fen}
          boardWidth={960}
          arePiecesDraggable={false}
          animationDuration={0}
          customBoardStyle={{ borderRadius: '0' }}
          customDarkSquareStyle={{ backgroundColor: '#779952' }}
          customLightSquareStyle={{ backgroundColor: '#edeed1' }}
        />
      </div>
    </div>
  </React.StrictMode>,
);
