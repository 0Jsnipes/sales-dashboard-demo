"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const GLYPHS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "%", "+", "-", "▲", "▼"];
const COLORS = ["#2563eb", "#0ea5e9"];
const FONT_SIZE = 15;
const COL_WIDTH = 17;
const ROW_HEIGHT = 21;
const TRAIL_LENGTH = 15;
const STEP_MS = 110;
const HEAD_ALPHA = 0.55;

function randomGlyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

export function DataRainBackground({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let columns = 0;
    let rows = 0;
    let heads: number[] = [];
    let glyphGrid: string[][] = [];
    let colColors: string[] = [];

    function resize() {
      if (!container || !canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = container.clientWidth;
      const height = container.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      columns = Math.max(1, Math.ceil(width / COL_WIDTH));
      rows = Math.max(1, Math.ceil(height / ROW_HEIGHT) + TRAIL_LENGTH);
      heads = Array.from({ length: columns }, () => -Math.floor(Math.random() * rows));
      glyphGrid = Array.from({ length: columns }, () => Array.from({ length: rows }, randomGlyph));
      colColors = Array.from({ length: columns }, () => COLORS[Math.floor(Math.random() * COLORS.length)]);
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    ctx.font = `${FONT_SIZE}px ui-monospace, "SFMono-Regular", Menlo, monospace`;
    ctx.textBaseline = "top";

    let frameId = 0;
    let lastStep = 0;

    function tick(timestamp: number) {
      frameId = requestAnimationFrame(tick);
      if (timestamp - lastStep < STEP_MS) return;
      lastStep = timestamp;
      if (!ctx || !canvas) return;

      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, width, height);

      for (let col = 0; col < columns; col += 1) {
        const head = heads[col];
        if (head - TRAIL_LENGTH >= rows) {
          heads[col] = -Math.floor(Math.random() * rows * 0.6);
          continue;
        }
        heads[col] = head + 1;

        if (head >= 0 && head < rows) glyphGrid[col][head] = randomGlyph();

        for (let offset = 0; offset < TRAIL_LENGTH; offset += 1) {
          const row = head - offset;
          if (row < 0 || row >= rows) continue;
          const alpha = HEAD_ALPHA * (1 - offset / TRAIL_LENGTH);
          if (alpha <= 0.01) continue;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = colColors[col];
          ctx.fillText(glyphGrid[col][row], col * COL_WIDTH, row * ROW_HEIGHT);
        }
      }
      ctx.globalAlpha = 1;
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden opacity-60", className)}>
      <canvas ref={canvasRef} />
    </div>
  );
}
