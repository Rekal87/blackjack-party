import * as THREE from "three";
import type { Card, Suit } from "../shared/cards";

const SUIT_SYMBOL: Record<Suit, string> = {
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
  spades: "\u2660",
};

const SUIT_COLOR: Record<Suit, string> = {
  hearts: "#d2232a",
  diamonds: "#d2232a",
  clubs: "#16212e",
  spades: "#16212e",
};

const RANK_LABEL: Record<Card["rank"], string> = {
  A: "A",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  J: "J",
  Q: "Q",
  K: "K",
};

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const W = 256;
const H = 360;

const faceCache = new Map<string, THREE.CanvasTexture>();
const backCache = new Map<string, THREE.CanvasTexture>();

function drawFace(ctx: CanvasRenderingContext2D, card: Card): void {
  const symbol = SUIT_SYMBOL[card.suit];
  const color = SUIT_COLOR[card.suit];
  const label = RANK_LABEL[card.rank];

  ctx.fillStyle = "#faf8f3";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#c9c2b4";
  ctx.lineWidth = 6;
  roundedRect(ctx, 6, 6, W - 12, H - 12, 18);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.save();
  ctx.translate(W - 52, H - 52);
  ctx.font = "bold 58px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(label, 0, 0);
  ctx.font = "44px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(symbol, 0, 46);
  ctx.restore();

  ctx.font = "bold 58px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(label, 52, 52);
  ctx.font = "44px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(symbol, 52, 98);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.font = "190px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(symbol, 0, 8);
  ctx.restore();

  ctx.strokeStyle = "#e3ddcf";
  ctx.lineWidth = 3;
  roundedRect(ctx, 12, 12, W - 24, H - 24, 12);
  ctx.stroke();
}

function drawBack(ctx: CanvasRenderingContext2D, seed: number): void {
  ctx.fillStyle = "#1d2a45";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#e8c46a";
  ctx.lineWidth = 8;
  roundedRect(ctx, 8, 8, W - 16, H - 16, 20);
  ctx.stroke();

  const inner = 34;
  ctx.strokeStyle = "#e8c46a";
  ctx.lineWidth = 3;
  roundedRect(ctx, inner, inner, W - inner * 2, H - inner * 2, 14);
  ctx.stroke();

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = "#e8c46a";
  ctx.lineWidth = 4;
  ctx.strokeRect(-70, -90, 140, 180);
  ctx.rotate(Math.PI / 2);
  ctx.strokeRect(-70, -90, 140, 180);
  ctx.restore();

  ctx.fillStyle = "#e8c46a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "60px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(String(seed), W / 2, H / 2);
}

function makeTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function cardFaceTexture(card: Card): THREE.CanvasTexture {
  const key = `${card.rank}-${card.suit}`;
  let tex = faceCache.get(key);
  if (!tex) {
    tex = makeTexture((ctx) => drawFace(ctx, card));
    faceCache.set(key, tex);
  }
  return tex;
}

export function cardBackTexture(seed = 0): THREE.CanvasTexture {
  const key = `back-${seed}`;
  let tex = backCache.get(key);
  if (!tex) {
    tex = makeTexture((ctx) => drawBack(ctx, seed));
    backCache.set(key, tex);
  }
  return tex;
}

export function feltTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    40,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "#1c5e4a");
  gradient.addColorStop(0.7, "#14503e");
  gradient.addColorStop(1, "#0e3f31");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const shade = 0.55 + Math.random() * 0.12;
    ctx.fillStyle = `rgba(${Math.floor(30 * shade)}, ${Math.floor(110 * shade)}, ${Math.floor(90 * shade)}, 0.5)`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}