'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ErpBodyPortal from './ErpBodyPortal';
import {
  ERP_BIRTHDAY_CELEBRATION,
  erpBirthdaySessionKey,
  isErpBirthdayCelebrationActive,
} from '../../lib/erp-birthday-config';

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createRocket(w, h) {
  return {
    x: randomBetween(w * 0.15, w * 0.85),
    y: h + 12,
    vx: randomBetween(-1.2, 1.2),
    vy: randomBetween(-11, -14),
    hue: randomBetween(0, 360),
    life: 0,
    exploded: false,
    particles: [],
  };
}

function explode(rocket) {
  const count = 48 + Math.floor(Math.random() * 24);
  const particles = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + randomBetween(-0.08, 0.08);
    const speed = randomBetween(1.5, 5.5);
    particles.push({
      x: rocket.x,
      y: rocket.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      decay: randomBetween(0.012, 0.022),
      hue: rocket.hue + randomBetween(-25, 25),
      size: randomBetween(1.2, 2.4),
    });
  }
  rocket.particles = particles;
  rocket.exploded = true;
}

function drawFireworks(ctx, rockets, w, h) {
  ctx.fillStyle = 'rgba(8, 12, 20, 0.18)';
  ctx.fillRect(0, 0, w, h);

  for (const rocket of rockets) {
    if (!rocket.exploded) {
      rocket.x += rocket.vx;
      rocket.y += rocket.vy;
      rocket.vy += 0.08;
      rocket.life += 1;
      ctx.beginPath();
      ctx.arc(rocket.x, rocket.y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${rocket.hue}, 95%, 70%, 0.95)`;
      ctx.fill();
      if (rocket.vy >= -1 || rocket.life > 55) explode(rocket);
      continue;
    }

    for (const p of rocket.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.045;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.alpha -= p.decay;
      if (p.alpha <= 0) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 92%, 62%, ${Math.max(0, p.alpha)})`;
      ctx.fill();
    }
    rocket.particles = rocket.particles.filter((p) => p.alpha > 0);
  }
}

export default function ErpBirthdayCelebration() {
  const canvasRef = useRef(null);
  const rocketsRef = useRef([]);
  const rafRef = useRef(0);
  const [open, setOpen] = useState(false);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      sessionStorage.setItem(erpBirthdaySessionKey(), '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isErpBirthdayCelebrationActive()) return;
    try {
      if (sessionStorage.getItem(erpBirthdaySessionKey()) === '1') return;
    } catch {
      /* show anyway */
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let lastLaunch = 0;
    const tick = (ts) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (ts - lastLaunch > 420 && rocketsRef.current.length < 6) {
        rocketsRef.current.push(createRocket(w, h));
        lastLaunch = ts;
      }
      rocketsRef.current = rocketsRef.current.filter(
        (r) => !r.exploded || r.particles.some((p) => p.alpha > 0),
      );
      drawFireworks(ctx, rocketsRef.current, w, h);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
      rocketsRef.current = [];
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismiss]);

  if (!open) return null;

  const { headline, name, note } = ERP_BIRTHDAY_CELEBRATION;

  return (
    <ErpBodyPortal>
      <div
        className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="erp-birthday-title"
      >
        <button
          type="button"
          className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
          aria-label="Close birthday celebration"
          onClick={dismiss}
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        />
        <div className="erp-birthday-pop relative z-10 w-full max-w-lg rounded-3xl border border-white/20 bg-gradient-to-br from-[#103D4D] via-[#0f766e] to-[#134e4a] p-8 text-center text-white shadow-2xl shadow-teal-900/40 ring-1 ring-white/15 sm:p-10">
          <p className="text-4xl leading-none" aria-hidden>
            🎂
          </p>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.35em] text-teal-100/90">{headline}</p>
          <h2 id="erp-birthday-title" className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {name}
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-teal-50/90 sm:text-base">{note}</p>
          <button
            type="button"
            onClick={dismiss}
            className="mt-8 inline-flex items-center justify-center rounded-xl bg-white/95 px-6 py-3 text-sm font-bold text-[#103D4D] shadow-lg transition hover:bg-white"
          >
            Continue to workspace
          </button>
        </div>
      </div>
    </ErpBodyPortal>
  );
}
