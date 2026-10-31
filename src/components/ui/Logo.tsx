/**
 * The landing page's wordmark, reused everywhere the product signs itself in.
 * Display serif, black ink, one electric-blue period — no icon, no gradient.
 */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }} aria-hidden="true">
      AfterSales<span>.</span>
    </span>
  );
}
