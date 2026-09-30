import type { Step } from "../types";
import { STEP_DURATION } from "./animate";

const W = 1280;
const H = 720;
const FPS = 30;
const TITLE_SECONDS = 2.5;
const HOLD_SECONDS = 1.2;

export interface ExportOptions {
  /** The WebGL canvas (needs preserveDrawingBuffer). */
  canvas: HTMLCanvasElement;
  title: string;
  steps: Step[];
  /** Narration per step (falls back to step.text). */
  texts: string[];
  /** Move the player to step `idx` at progress `t`. */
  drive: (idx: number, t: number) => void;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export function canExportVideo(): boolean {
  return typeof MediaRecorder !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;
}

function pickMime(): string {
  for (const m of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "video/webm";
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawTitle(ctx: CanvasRenderingContext2D, title: string, steps: number) {
  ctx.fillStyle = "#faf7f0";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(0, H - 12, W, 12);
  ctx.fillStyle = "#2b2622";
  ctx.textAlign = "center";
  ctx.font = "bold 64px Georgia, serif";
  ctx.fillText(title, W / 2, H / 2 - 20);
  ctx.font = "28px Georgia, serif";
  ctx.fillStyle = "#6b625a";
  ctx.fillText(`${steps} steps · a CreaseLens guide`, W / 2, H / 2 + 40);
  ctx.textAlign = "left";
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  gl: HTMLCanvasElement,
  step: Step,
  total: number,
  text: string,
  t: number,
) {
  ctx.fillStyle = "#faf7f0";
  ctx.fillRect(0, 0, W, H);
  // 3D view on the left, square
  const s = H;
  const src = Math.min(gl.width, gl.height);
  ctx.drawImage(gl, (gl.width - src) / 2, (gl.height - src) / 2, src, src, 0, 0, s, s);
  // text panel
  const x = s + 40;
  const maxW = W - x - 40;
  ctx.fillStyle = "#6b625a";
  ctx.font = "24px Georgia, serif";
  ctx.fillText(`Step ${step.index + 1} of ${total}`, x, 70);
  ctx.fillStyle = "#2b2622";
  ctx.font = "bold 32px Georgia, serif";
  let y = 120;
  for (const line of wrap(ctx, step.title, maxW).slice(0, 4)) {
    ctx.fillText(line, x, y);
    y += 40;
  }
  y += 16;
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillStyle = "#3d3630";
  for (const line of wrap(ctx, text, maxW).slice(0, 12)) {
    ctx.fillText(line, x, y);
    y += 32;
  }
  // progress bar
  ctx.fillStyle = "#e7e1d6";
  ctx.fillRect(x, H - 60, maxW, 8);
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(x, H - 60, maxW * ((step.index + Math.min(1, t)) / total), 8);
}

/** Record the guide as a webm Blob by playing every step in real time. */
export async function recordGuide(opts: ExportOptions): Promise<Blob> {
  const { canvas, title, steps, texts, drive, onProgress, signal } = opts;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d")!;
  const stream = out.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: pickMime(), videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));

  const perStep = STEP_DURATION + HOLD_SECONDS;
  const total = TITLE_SECONDS + steps.length * perStep;

  drive(0, 0);
  rec.start(250);
  const start = performance.now();
  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      const el = (performance.now() - start) / 1000;
      onProgress?.(Math.min(1, el / total));
      if (el < TITLE_SECONDS) {
        drawTitle(ctx, title, steps.length);
      } else {
        const k = el - TITLE_SECONDS;
        const idx = Math.min(steps.length - 1, Math.floor(k / perStep));
        const t = Math.min(1, (k - idx * perStep) / STEP_DURATION);
        drive(idx, t);
        drawFrame(ctx, canvas, steps[idx], steps.length, texts[idx] ?? steps[idx].text, t);
      }
      if (el >= total) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }).finally(() => {
    if (rec.state !== "inactive") rec.stop();
  });
  await stopped;
  return new Blob(chunks, { type: "video/webm" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
