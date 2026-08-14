import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const TIMING = [
  [150, s => ({ ...s, progress: 100 })],
  [2650, s => ({ ...s, opacity: 0 })],
  [2950, s => ({ ...s, word: 'Bienvenue', progress: 0, opacity: 1 })],
  [3050, s => ({ ...s, progress: 100 })],
  [5550, s => ({ ...s, opacity: 0 })],
];
const DONE_AT = 6050;
const DURATION = 1700;

export default function WelcomeSplashPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const next = location.state?.next || '/chat';

  const [state, setState] = useState({ word: 'Welcome', progress: 0, opacity: 1 });

  useEffect(() => {
    const timers = TIMING.map(([ms, update]) => setTimeout(() => setState(update), ms));
    timers.push(setTimeout(() => navigate(next, { replace: true }), DONE_AT));
    return () => timers.forEach(clearTimeout);
  }, [navigate, next]);

  const { word, progress, opacity } = state;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#EFEDE3', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Kaushan+Script&display=swap');`}</style>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5, mixBlendMode: 'multiply' }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      <div style={{ position: 'relative', display: 'inline-block', transform: 'rotate(-3deg)' }}>
        <div
          style={{
            clipPath: `inset(0 ${100 - progress}% 0 0)`,
            transition: `clip-path ${DURATION}ms cubic-bezier(.5,0,.4,1), opacity .3s ease`,
            opacity,
          }}
        >
          <div
            style={{
              fontFamily: "'Kaushan Script', cursive",
              fontWeight: 400,
              fontSize: 'min(20vw, 190px)',
              lineHeight: 1,
              color: '#14663B',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              padding: '0 8px',
            }}
          >
            {word}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            top: '6%',
            left: `${progress}%`,
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: '#14663B',
            transform: 'translate(-50%, -50%)',
            opacity: opacity * (progress > 0 && progress < 100 ? 1 : 0),
            transition: `left ${DURATION}ms cubic-bezier(.5,0,.4,1), opacity .2s ease`,
          }}
        />
      </div>
    </div>
  );
}
