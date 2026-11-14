import { useEffect, useRef } from 'react';
import type { DonkiLevel } from '../../types/index.ts';

interface AmbientCanvasLayerProps {
  readonly isLunarNight: boolean;
  readonly weatherLevel: DonkiLevel;
  readonly reducedMotion: boolean;
}

export function AmbientCanvasLayer({ isLunarNight, weatherLevel, reducedMotion }: AmbientCanvasLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const staticMode = reducedMotion || media?.matches === true;
    let frame = 0;
    let animationId = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);
      const severity = weatherLevel === 'extreme' ? 1 : weatherLevel === 'storm' ? 0.72 : weatherLevel === 'moderate' ? 0.34 : 0.12;
      const time = staticMode ? 0 : frame / 60;
      if (isLunarNight) {
        ctx.fillStyle = 'rgba(18, 33, 66, 0.18)';
        ctx.fillRect(0, 0, width, height);
      }
      const count = Math.round(8 + severity * 30);
      for (let index = 0; index < count; index += 1) {
        const baseX = ((index * 47.3) % 100) / 100;
        const baseY = ((index * 29.7 + 11) % 100) / 100;
        const drift = staticMode ? 0 : Math.sin(time * (0.25 + severity) + index) * 0.035;
        const x = ((baseX + drift + time * severity * 0.008) % 1) * width;
        const y = baseY * height;
        const radius = 0.45 + ((index * 13) % 7) * 0.12 + severity * 0.7;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = weatherLevel === 'quiet'
          ? 'rgba(225, 238, 245, 0.46)'
          : `rgba(255, 197, 143, ${0.16 + severity * 0.24})`;
        ctx.fill();
      }
      if (severity >= 0.7) {
        const flare = ctx.createLinearGradient(0, 0, width, height);
        flare.addColorStop(0, 'rgba(255, 136, 91, 0)');
        flare.addColorStop(0.5, `rgba(255, 136, 91, ${0.05 + severity * 0.07})`);
        flare.addColorStop(1, 'rgba(255, 136, 91, 0)');
        ctx.fillStyle = flare;
        ctx.fillRect(0, 0, width, height);
      }
    };

    const animate = () => {
      frame += 1;
      draw();
      animationId = window.requestAnimationFrame(animate);
    };

    resize();
    draw();
    if (!staticMode) animationId = window.requestAnimationFrame(animate);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (animationId) window.cancelAnimationFrame(animationId);
    };
  }, [isLunarNight, weatherLevel, reducedMotion]);

  return <canvas ref={canvasRef} className="hail-ambient-canvas" aria-hidden="true" />;
}
