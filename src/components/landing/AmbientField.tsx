/** Grid, film grain, scanlines and a slow scan sweep. Pure CSS so it costs nothing to keep running. */
export function AmbientField({ intense = false }: { intense?: boolean }) {
  return (
    <div className="ambient" aria-hidden>
      <div className="ambient__glow" />
      <div className="ambient__glow ambient__glow--infra" />
      <div className="ambient__grid" style={{ opacity: intense ? 1 : 0.8 }} />
      <div className="ambient__sweep" />
      <div className="ambient__noise" />
      <div className="ambient__scanlines" />
      <div className="ambient__vignette" />
    </div>
  );
}
