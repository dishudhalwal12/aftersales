"use client";

import { useState } from "react";

/**
 * The PRD's hero video slot. If `public/videos/hero-demo.mp4` is missing (it is,
 * until the After Effects cut lands), the fallback below is what a judge sees —
 * a truthful, animated version of the decision path rather than a broken player.
 */
export function HeroStage() {
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <div className="hero-stage">
      <div className="stage-chrome">
        <span>Live queue · 4 channels</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="dot dot-live" style={{ color: "#10B981" }} />
          listening
        </span>
      </div>

      {!videoFailed && (
        <video
          autoPlay
          muted
          loop
          playsInline
          poster=""
          onError={() => setVideoFailed(true)}
          aria-hidden="true"
        >
          <source src="/videos/hero-demo.mp4" type="video/mp4" />
        </video>
      )}

      {videoFailed && (
        <div className="stage-fallback">
          <p className="bubble bubble-in">
            <b>WhatsApp · 18:42</b>
            <br />
            What is the price of the Pro Plan, and does it include WhatsApp invoicing?
          </p>
          <p className="bubble bubble-out">
            ₹1,499/month, five users, WhatsApp invoicing included.
            <br />
            <span style={{ opacity: 0.7 }}>R6 · confidence 94 · cited chk_cp_02</span>
          </p>
          <p className="bubble bubble-in">
            <b>Gmail · 18:44</b>
            <br />
            Can I sync this with my Tally ledger?
          </p>
          <p className="bubble bubble-esc">
            Not going to guess. A human is being pulled in.
            <br />
            <span style={{ opacity: 0.75 }}>R2 · confidence 44 · no grounded chunk</span>
          </p>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 14,
          right: 14,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span className="badge" style={{ background: "rgba(255,255,255,0.12)", color: "#F4F4F1", borderColor: "rgba(255,255,255,0.16)" }}>
          WhatsApp
        </span>
        <span className="badge" style={{ background: "rgba(255,255,255,0.12)", color: "#F4F4F1", borderColor: "rgba(255,255,255,0.16)" }}>
          Instagram
        </span>
        <span className="badge" style={{ background: "rgba(255,255,255,0.12)", color: "#F4F4F1", borderColor: "rgba(255,255,255,0.16)" }}>
          Gmail
        </span>
        <span className="badge" style={{ background: "rgba(255,255,255,0.12)", color: "#F4F4F1", borderColor: "rgba(255,255,255,0.16)" }}>
          Voice
        </span>
      </div>
    </div>
  );
}
