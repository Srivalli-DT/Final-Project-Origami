const PIPELINE = [
  {
    title: "1. Detect",
    text: "The screenshot is straightened, split into colour masks (red mountains, blue valleys, black edge, grey references) and scanned with a multi-scale Hough transform. Collinear pieces are merged, angles snapped to multiples of 22.5°, and endpoints snapped to the detected grid.",
  },
  {
    title: "2. Validate",
    text: "At every interior vertex CreaseLens checks Maekawa's theorem (mountains and valleys differ by two) and Kawasaki's theorem (alternate angles sum to 180°). These are local, necessary conditions; deciding global flat-foldability is NP-hard, so layer order is not checked.",
  },
  {
    title: "3. Sequence",
    text: "Full edge-to-edge lines become reference folds and precreases, ordered from the centre outward by grid level, with instructions written in reference-finding language. Everything else is folded in a final collapse.",
  },
  {
    title: "4. Animate",
    text: "Faces form a tree rooted at the centre. Each face rotates about its hinge crease relative to its parent (valleys toward you, mountains away), which gives a simplified 3D preview. The flat-folded state is computed by composing reflections along the tree.",
  },
  {
    title: "5. Narrate",
    text: "Each step can be rewritten for beginners by Gemini, with a template fallback so the guide works without it. “I'm stuck” asks for a simpler explanation with what the paper should look like and a common mistake.",
  },
];

export default function About() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-serif text-3xl">How it works</h1>
      <p className="mt-2 text-stone-600">
        Crease patterns are the blueprint language of modern origami, but they show the finished creases, not the
        order to fold them in. CreaseLens turns a crease pattern into a guided lesson.
      </p>
      <ol className="mt-6 space-y-4">
        {PIPELINE.map((p) => (
          <li key={p.title} className="card p-4">
            <h2 className="font-serif text-lg">{p.title}</h2>
            <p className="mt-1 text-sm text-stone-700">{p.text}</p>
          </li>
        ))}
      </ol>
      <h2 className="mt-8 font-serif text-xl">Colour key</h2>
      <ul className="mt-2 text-sm text-stone-700">
        <li><span className="font-bold text-[#e53935]">Red solid</span>: mountain fold (the paper moves away from you)</li>
        <li><span className="font-bold text-[#1e88e5]">Blue dashed</span>: valley fold (the paper moves toward you)</li>
        <li><span className="font-bold text-stone-500">Grey</span>: reference crease</li>
      </ul>
      <h2 className="mt-8 font-serif text-xl">References</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700">
        <li>
          E. Demaine, J. Ku, R. Lang. <em>FOLD: a file format for origami</em>.{" "}
          <a className="text-accent underline" href="https://github.com/edemaine/fold" target="_blank" rel="noreferrer">
            github.com/edemaine/fold
          </a>
        </li>
        <li>T. Hull. On the mathematics of flat origamis (Maekawa and Kawasaki theorems). <em>Congressus Numerantium</em> 100, 1994.</li>
        <li>M. Bern, B. Hayes. The complexity of flat origami. <em>SODA</em> 1996.</li>
        <li>
          H. Akitaya, J. Mitani, Y. Kanamori, Y. Fukui. Generating folding sequences from crease patterns of flat-foldable
          origami. <em>SIGGRAPH Posters</em> 2013.
        </li>
      </ul>
      <h2 className="mt-8 font-serif text-xl">Limitations</h2>
      <p className="mt-2 text-sm text-stone-700">
        The 3D preview folds every crease at once and does not solve layer order, so layers can pass through each
        other. Detection is tuned for clean digital crease patterns; photos of paper work less reliably.
      </p>
    </main>
  );
}
