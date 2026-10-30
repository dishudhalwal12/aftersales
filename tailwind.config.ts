import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#F8F8F6",
        ink: "#0A0A0A",
        muted: "#52525B",
        sent: { bg: "#10B98126", text: "#065F46" },
        draft: { bg: "#F59E0B26", text: "#92400E" },
        urgent: { bg: "#EF444426", text: "#991B1B" },
      },
      boxShadow: {
        glass: "0 1px 0 rgba(10,10,10,0.04), 0 12px 32px rgba(10,10,10,0.06)",
      },
      backdropBlur: {
        glass: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
