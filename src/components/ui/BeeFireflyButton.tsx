import { ReactNode, useMemo } from "react";

const FIREFLY_COUNT = 6;

function generateFireflyKeyframes() {
  return Array.from({ length: FIREFLY_COUNT }, (_, i) => {
    const xMid = (i % 2 === 0 ? 1 : -1) * (6 + i * 3);
    const yMid = -(8 + i * 2);
    const xEnd = (i % 2 === 0 ? -1 : 1) * (3 + i * 2);
    const yEnd = 4 + i * 1.5;
    return `
      @keyframes firefly-${i} {
        0%, 100% { opacity: 0; transform: translate(0, 0) scale(0.4); }
        15% { opacity: 0.9; box-shadow: 0 0 6px 2px hsl(var(--primary) / 0.5); }
        50% { opacity: 0.5; transform: translate(${xMid}px, ${yMid}px) scale(1); }
        85% { opacity: 0.2; transform: translate(${xEnd}px, ${yEnd}px) scale(0.6); }
      }
    `;
  }).join("\n");
}

const fireflyStyles = generateFireflyKeyframes();

export const BeeFireflyButton = ({ children }: { children: ReactNode }) => {
  const particles = useMemo(
    () =>
      Array.from({ length: FIREFLY_COUNT }, (_, i) => ({
        key: i,
        size: 2 + (i % 3),
        left: `${15 + i * 13}%`,
        top: `${25 + (i % 2) * 45}%`,
        duration: `${2.8 + i * 0.6}s`,
        delay: `${i * 0.45}s`,
      })),
    []
  );

  return (
    <div className="relative inline-flex items-center justify-center group">
      {/* Glow aura */}
      <div className="absolute inset-[-12px] rounded-full bg-primary/10 blur-xl pointer-events-none animate-pulse" />

      {/* Firefly particles */}
      {particles.map((p) => (
        <span
          key={p.key}
          className="absolute rounded-full bg-primary pointer-events-none"
          style={{
            width: p.size,
            height: p.size,
            left: p.left,
            top: p.top,
            opacity: 0,
            animation: `firefly-${p.key} ${p.duration} ease-in-out ${p.delay} infinite`,
          }}
        />
      ))}

      {/* Button content */}
      <div className="relative z-10">{children}</div>

      <style>{fireflyStyles}</style>
    </div>
  );
};
