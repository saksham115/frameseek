import { useEffect, useRef } from "react";

const AmbientBackground = () => {
  const particlesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = particlesRef.current;
    if (!container) return;

    for (let i = 0; i < 16; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      const s = 2 + Math.random() * 3;
      p.style.width = s + "px";
      p.style.height = s + "px";
      p.style.left = Math.random() * 100 + "%";
      p.style.animationDuration = 14 + Math.random() * 18 + "s";
      p.style.animationDelay = Math.random() * 15 + "s";
      container.appendChild(p);
    }

    return () => {
      container.innerHTML = "";
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      document.querySelectorAll(".ambient-glow").forEach((g, i) => {
        (g as HTMLElement).style.transform = `translate(${x * (i + 1) * 12}px, ${y * (i + 1) * 12}px)`;
      });
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <>
      <div className="ambient">
        <div className="ambient-glow ambient-glow-1" />
        <div className="ambient-glow ambient-glow-2" />
      </div>
      <div className="grain" />
      <div className="particles" ref={particlesRef} />
    </>
  );
};

export default AmbientBackground;
