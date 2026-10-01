export function LevelDots({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Level ${level} of 5`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= level ? "bg-accent" : "bg-line"}`} />
      ))}
    </span>
  );
}
