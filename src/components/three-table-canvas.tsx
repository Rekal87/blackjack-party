import { useEffect, useRef } from "react";
import type { TableState } from "@/server/table";
import type { BlackjackScene } from "@/three/table-scene";
import { createBlackjackScene } from "@/three/table-scene";

export function ThreeTableCanvas({
  table,
  playerId,
}: {
  table: TableState;
  playerId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BlackjackScene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = createBlackjackScene(canvas);
    sceneRef.current = scene;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      scene.resize(parent.clientWidth, parent.clientHeight);
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    return () => {
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.update(table, playerId);
  }, [table, playerId]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}