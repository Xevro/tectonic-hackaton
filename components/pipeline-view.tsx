"use client";

import { useEffect, useRef, useState } from "react";
import type { PipelineSample } from "@/lib/situations/evaluate";

const DURATION = 20000;
const CLUSTER_COLORS = ["#7fd4f5", "#f3d19c", "#9ad8bf", "#d7c4f5", "#f0b4a8", "#c5d4e8"];

const PHASES = [
  { until: 0.28, text: "Start with one household’s own past. We do not tell it what a life event is." },
  { until: 0.5, text: "Most people keep the rhythm of their own history." },
  { until: 0.72, text: "When that household bends away from its own normal, it lights up." },
  {
    until: 1,
    text: "Other people who bent the same way gather around it. That group is the situation. Nobody wrote it.",
  },
];

function clusterTarget(cluster: number) {
  const angle = (cluster / 8) * Math.PI * 2 - Math.PI / 2;
  return { x: 0.5 + Math.cos(angle) * 0.34, y: 0.5 + Math.sin(angle) * 0.34 };
}

export function PipelineView({ pipeline }: { pipeline: PipelineSample }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      setProgress(1);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      setProgress(Math.min(1, (now - started) / DURATION));
      if (now - started < DURATION) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);

    const gather = progress < 0.5 ? 0 : progress < 0.72 ? (progress - 0.5) / 0.22 : 1;
    const light = progress < 0.4 ? 0 : Math.min(1, (progress - 0.4) / 0.18);

    pipeline.dots.forEach((dot, index) => {
      const orbit = progress < 0.72 ? Math.sin(progress * 18 + index) * 0.012 : 0;
      let x = dot.x + orbit;
      let y = dot.y + Math.cos(progress * 14 + index) * (progress < 0.72 ? 0.01 : 0);
      if (dot.bent && dot.cluster !== null) {
        const target = clusterTarget(dot.cluster);
        x = dot.x + (target.x - dot.x) * gather;
        y = dot.y + (target.y - dot.y) * gather;
      }
      const px = x * rect.width;
      const py = y * rect.height;
      context.beginPath();
      context.arc(px, py, dot.bent ? 3.2 : 2.1, 0, Math.PI * 2);
      if (!dot.bent) {
        context.fillStyle = "rgba(127, 212, 245, 0.45)";
      } else {
        const color = CLUSTER_COLORS[(dot.cluster ?? 0) % CLUSTER_COLORS.length];
        context.fillStyle = light > 0.2 ? color : "rgba(255,255,255,0.85)";
        context.globalAlpha = 0.45 + light * 0.55;
      }
      context.fill();
      context.globalAlpha = 1;
    });
  }, [pipeline, progress]);

  const caption = PHASES.find((phase) => progress <= phase.until) ?? PHASES[PHASES.length - 1];

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4.25rem)] max-w-[1100px] flex-col px-4 py-8 text-white">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-kbc-blue">How it builds</p>
      <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-tight">
        It builds itself from the past, then from other people.
      </h1>
      <p className="mt-3 max-w-2xl text-white/70">
        {pipeline.households.toLocaleString("en-GB")} synthetic households. First, each one against its
        own history. Then the ones that bent alike become a situation no one authored.
      </p>
      <canvas ref={canvasRef} className="mt-8 h-[560px] w-full rounded-3xl bg-[#07233a]" />
      <div className="mt-5 flex items-end justify-between gap-6">
        <p className="max-w-2xl text-xl leading-snug">{caption.text}</p>
        <button
          type="button"
          onClick={() => {
            setProgress(0);
            setRun((value) => value + 1);
          }}
          className="shrink-0 rounded-full border border-white/30 px-4 py-2 text-sm font-semibold"
        >
          Play again
        </button>
      </div>
    </div>
  );
}
