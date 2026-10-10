/**
 * canvasExport.ts
 * Export utilities for collaborative whiteboard canvases.
 * Converts raster/vector canvas shape state into high-resolution transparent PNG blobs or scalable vector SVGs (#5615).
 */

import type { ShapeData } from "@/hooks/useCanvasWhiteboard";

export interface CanvasExportOptions {
  width?: number;
  height?: number;
  pixelRatio?: number;
  transparentBackground?: boolean;
  backgroundColor?: string;
  padding?: number;
  embedFonts?: boolean;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Computes tight bounding box across all active shapes on the canvas.
 */
export function calculateCanvasBounds(shapes: ShapeData[], padding = 20): BoundingBox {
  if (shapes.length === 0) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const s of shapes) {
    if (s.deleted) continue;
    const pts = s.points;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (minX === Infinity) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  }

  return {
    minX: Math.max(0, minX - padding),
    minY: Math.max(0, minY - padding),
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

/**
 * Exports an HTML5 Canvas or shape array directly to a PNG Blob with optional transparency.
 */
export async function exportCanvasToBlob(
  canvasOrShapes: HTMLCanvasElement | ShapeData[],
  options: CanvasExportOptions = {}
): Promise<Blob> {
  const pixelRatio = options.pixelRatio ?? (typeof window !== "undefined" ? window.devicePixelRatio || 2 : 2);
  const isTransparent = options.transparentBackground ?? true;
  const bgColor = options.backgroundColor ?? "#1a1a2e";

  let canvas: HTMLCanvasElement;

  if (canvasOrShapes instanceof HTMLCanvasElement) {
    canvas = canvasOrShapes;
    if (isTransparent && !options.backgroundColor) {
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to export canvas to PNG blob"));
        }, "image/png");
      });
    }
  }

  // If passed shapes or custom dimensions, create offscreen canvas
  const shapes = Array.isArray(canvasOrShapes) ? canvasOrShapes : [];
  const bounds = calculateCanvasBounds(shapes, options.padding ?? 20);
  const width = options.width ?? (bounds.maxX - bounds.minX);
  const height = options.height ?? (bounds.maxY - bounds.minY);

  const offscreen = document.createElement("canvas");
  offscreen.width = width * pixelRatio;
  offscreen.height = height * pixelRatio;
  const ctx = offscreen.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D rendering context for export");

  ctx.scale(pixelRatio, pixelRatio);

  if (!isTransparent) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.translate(-bounds.minX, -bounds.minY);

  // Render shapes to offscreen context
  for (const s of shapes) {
    if (s.deleted || s.points.length < 2) continue;
    ctx.save();
    ctx.strokeStyle = s.type === "eraser" ? (isTransparent ? "rgba(0,0,0,0)" : bgColor) : s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = s.opacity ?? 1.0;

    if (s.type === "pen" || s.type === "eraser") {
      ctx.beginPath();
      ctx.moveTo(s.points[0], s.points[1]);
      for (let i = 2; i < s.points.length; i += 2) {
        ctx.lineTo(s.points[i], s.points[i + 1]);
      }
      ctx.stroke();
    } else if (s.type === "rect") {
      const x = s.points[0];
      const y = s.points[1];
      const w = s.points[2] - x;
      const h = s.points[3] - y;
      ctx.strokeRect(x, y, w, h);
    } else if (s.type === "circle") {
      const cx = s.points[0];
      const cy = s.points[1];
      const ex = s.points.length >= 4 ? s.points[2] : cx;
      const ey = s.points.length >= 4 ? s.points[3] : cy;
      const rx = Math.abs(ex - cx);
      const ry = Math.abs(ey - cy);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx || 1, ry || 1, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.type === "line") {
      ctx.beginPath();
      ctx.moveTo(s.points[0], s.points[1]);
      ctx.lineTo(s.points[2], s.points[3]);
      ctx.stroke();
    }
    ctx.restore();
  }

  return new Promise<Blob>((resolve, reject) => {
    offscreen.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to generate offscreen PNG blob"));
    }, "image/png");
  });
}

/**
 * Exports whiteboard shapes to scalable vector XML SVG with embedded font definitions.
 */
export function exportCanvasToSvg(
  shapes: ShapeData[],
  options: CanvasExportOptions = {}
): string {
  const bounds = calculateCanvasBounds(shapes, options.padding ?? 20);
  const width = options.width ?? (bounds.maxX - bounds.minX);
  const height = options.height ?? (bounds.maxY - bounds.minY);
  const isTransparent = options.transparentBackground ?? true;
  const bgColor = options.backgroundColor ?? "#1a1a2e";

  let svgElements = "";

  if (!isTransparent) {
    svgElements += `<rect width="100%" height="100%" fill="${bgColor}" />\n`;
  }

  for (const s of shapes) {
    if (s.deleted || s.points.length < 2) continue;
    const stroke = s.type === "eraser" ? "none" : s.color;
    const sw = s.width;
    const opacity = s.opacity ?? 1.0;

    if (s.type === "pen") {
      let d = `M ${s.points[0]} ${s.points[1]}`;
      for (let i = 2; i < s.points.length; i += 2) {
        d += ` L ${s.points[i]} ${s.points[i + 1]}`;
      }
      svgElements += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" />\n`;
    } else if (s.type === "rect") {
      const x = Math.min(s.points[0], s.points[2]);
      const y = Math.min(s.points[1], s.points[3]);
      const w = Math.abs(s.points[2] - s.points[0]);
      const h = Math.abs(s.points[3] - s.points[1]);
      svgElements += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" />\n`;
    } else if (s.type === "circle") {
      const cx = s.points[0];
      const cy = s.points[1];
      const ex = s.points.length >= 4 ? s.points[2] : cx;
      const ey = s.points.length >= 4 ? s.points[3] : cy;
      const rx = Math.abs(ex - cx) || 1;
      const ry = Math.abs(ey - cy) || 1;
      svgElements += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" />\n`;
    } else if (s.type === "line") {
      svgElements += `<line x1="${s.points[0]}" y1="${s.points[1]}" x2="${s.points[2]}" y2="${s.points[3]}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="${opacity}" />\n`;
    } else if (s.type === "sticky" && s.text) {
      const x = s.points[0];
      const y = s.points[1];
      svgElements += `
        <g transform="translate(${x}, ${y})">
          <rect width="180" height="120" rx="6" fill="#fef08a" stroke="#ca8a04" stroke-width="1.5" />
          <text x="12" y="24" font-family="'Inter', -apple-system, sans-serif" font-size="14" fill="#1c1917">${s.text}</text>
        </g>\n`;
    }
  }

  const fontDefs = options.embedFonts
    ? `<defs>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&amp;display=swap');
          text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        </style>
      </defs>\n`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${width} ${height}" width="${width}" height="${height}">
  ${fontDefs}
  ${svgElements}
</svg>`;
}

/**
 * Triggers instant browser client-side download for Blob or data string.
 */
export function triggerFileDownload(data: Blob | string, filename: string): void {
  const blob = typeof data === "string" ? new Blob([data], { type: "image/svg+xml;charset=utf-8" }) : data;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
