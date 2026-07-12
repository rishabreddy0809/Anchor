"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type VantaEffect = { destroy: () => void };

export default function VantaRingsBackground() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let effect: VantaEffect | undefined;
    let cancelled = false;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || !hostRef.current) return;

    async function startEffect() {
      // Vanta does not publish TypeScript declarations for its individual effects.
      // @ts-expect-error -- runtime module supplied by the vanta package
      const { default: rings } = await import("vanta/dist/vanta.rings.min");

      if (!cancelled && hostRef.current) {
        effect = rings({
          el: hostRef.current,
          THREE,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          scale: 1,
          scaleMobile: 0.72,
          backgroundColor: 0x0a0806,
          color: 0xe0a94a,
        }) as VantaEffect;
      }
    }

    void startEffect();

    return () => {
      cancelled = true;
      effect?.destroy();
    };
  }, []);

  return (
    <div className="vanta-shell" aria-hidden="true">
      <div ref={hostRef} className="vanta-host" />
      <div className="vanta-veil" />
    </div>
  );
}
