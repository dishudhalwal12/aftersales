export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="row" style={{ gap: 10 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        role="img"
        aria-label="AfterSales AI"
        style={{ flex: "none" }}
      >
        <rect width="32" height="32" rx="9" fill="#0A0A0A" />
        <path
          d="M9 21.5 14.6 10h2.8L23 21.5h-3l-1.2-2.7h-5.6L12 21.5H9Zm4.9-5.1h4.2L16 11.9l-2.1 4.5Z"
          fill="#F8F8F6"
        />
        <circle cx="23" cy="9.4" r="1.6" fill="#10B981" />
      </svg>
      <span style={{ fontWeight: 660, letterSpacing: "-0.02em", fontSize: 16 }}>
        AfterSales<span style={{ color: "var(--muted)" }}> AI</span>
      </span>
    </span>
  );
}
