"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

export function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Draw subtle mesh gradient
    let time = 0;
    const animate = () => {
      time += 0.002;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Aurora-like gradients
      const gradient1 = ctx.createRadialGradient(
        canvas.width * 0.2 + Math.sin(time * 0.3) * 100,
        canvas.height * 0.3 + Math.cos(time * 0.2) * 80,
        0,
        canvas.width * 0.2,
        canvas.height * 0.3,
        Math.max(canvas.width, canvas.height) * 0.6
      );
      gradient1.addColorStop(0, "rgba(0, 229, 255, 0.03)");
      gradient1.addColorStop(0.5, "rgba(0, 229, 255, 0.01)");
      gradient1.addColorStop(1, "rgba(5, 7, 10, 0)");
      ctx.fillStyle = gradient1;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const gradient2 = ctx.createRadialGradient(
        canvas.width * 0.8 + Math.cos(time * 0.25) * 120,
        canvas.height * 0.6 + Math.sin(time * 0.35) * 100,
        0,
        canvas.width * 0.8,
        canvas.height * 0.6,
        Math.max(canvas.width, canvas.height) * 0.5
      );
      gradient2.addColorStop(0, "rgba(124, 58, 237, 0.03)");
      gradient2.addColorStop(1, "rgba(5, 7, 10, 0)");
      ctx.fillStyle = gradient2;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      {/* Grid pattern overlay */}
      <div className="fixed inset-0 z-0 bg-grid pointer-events-none" />
      {/* Animated canvas */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 z-0 pointer-events-none"
      />
    </>
  );
}
