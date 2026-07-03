const techStack = [
  "Gemini AI", "React", "Tailwind CSS", "Framer Motion", "TypeScript", "Supabase", "FFmpeg", "TipTap Editor",
];

export const PoweredBySection = () => {
  return (
    <section className="py-10 lg:py-16 relative overflow-hidden section-fade-top">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 mb-4">
        <h2 className="text-sm sm:text-base font-bold text-muted-foreground/60">
          <span className="text-primary/60 mr-2">&gt;</span>
          Powered By
        </h2>
      </div>

      {/* Fix 2: Pure CSS marquee instead of JS-driven Framer Motion */}
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]">
        <div
          className="flex gap-8 sm:gap-12 whitespace-nowrap animate-scroll"
          style={{ width: 'max-content' }}
        >
          {[...techStack, ...techStack, ...techStack].map((tech, i) => (
            <span
              key={`${tech}-${i}`}
              className="text-sm sm:text-base font-medium text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};
