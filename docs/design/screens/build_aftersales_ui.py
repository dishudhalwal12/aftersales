#!/usr/bin/env python3
"""AfterSales AI — the product screens, drawn in the landing page's own material.

Skin: the landing page. White paper, jet-black type, PP Editorial New for display, Telegraf for
UI, and the petrol-teal inside the hero flower as the only accent.
Structure: the dashboard reference — a left rail, a thin top bar, bento cards, big roomy
numerals, pill controls, tape meters and a marker on everything a developer must build.

Every screen sits at 812x540 with a 148pt spec strip on the right: the strip carries the route,
the micro-specs and the numbered markers on the screen, so the slide doubles as a build sheet.

    python3 build_aftersales_ui.py --render out/screens --save out/aftersales-ui.pptx
"""

import argparse
import base64
import math
import os
import pathlib
import sys

TOOLS = pathlib.Path(os.environ.get("DECKCRAFT_TOOLS", pathlib.Path(__file__).parent / "tools"))
sys.path.insert(0, str(TOOLS))
import deck_template as T  # noqa: E402

# ---------------------------------------------------------------------------------------------
# tokens — the landing page's material, not a mood board
# ---------------------------------------------------------------------------------------------

INK      = "#0A0A0A"   # jet black: type, primary buttons
PAPER    = "#FFFFFF"   # the ground
WASH     = "#F4F4F1"   # warm off-white: secondary surfaces
CARD     = "#FBFBF9"
LINE     = "#E4E4DD"   # hairline on paper
LINE2    = "#EFEFE9"   # hairline inside cards
MUTED    = "#67676E"
FAINT    = "#A2A2A8"

TEAL     = "#0E6B5F"   # the flower's shadow — large accent, big numerals
SIGNAL   = "#12A594"   # live state, meters, arcs
MINT     = "#8FE0CE"   # highlight dot, ink on petrol
TINT     = "#EAF4F1"   # teal wash for selected rows and tones
DEEP     = "#073B37"   # petrol ground

GREEN, GREEN_T, GREEN_I = "#10B981", "#E7F6EF", "#0B5C44"
AMBER, AMBER_T, AMBER_I = "#F59E0B", "#FDF3E2", "#8A4B08"
RED,   RED_T,   RED_I   = "#EF4444", "#FBEAEA", "#99201C"
SLATE, SLATE_T, SLATE_I = "#8A8A90", "#F1F1EE", "#50505A"
BLUE,  BLUE_T,  BLUE_I  = "#1E63D6", "#EAF0FC", "#1B3F9E"

SERIF = "PP Editorial New Ultralight"
SANS = "Telegraf"

PAGE_W, PAGE_H = 960.0, 540.0
SR_W = 812.0                  # the screen viewport
NAV_W, TOP_H, PAD = 44.0, 40.0, 16.0
CX = NAV_W + PAD              # content left edge
CR = SR_W - PAD               # content right edge
RAIL_X = SR_W                 # spec strip
RAIL_W = PAGE_W - SR_W        # 148

BADGE = {
    "answered": (GREEN, GREEN_T, GREEN_I),
    "replied": (GREEN, GREEN_T, GREEN_I),
    "resolved": (GREEN, GREEN_T, GREEN_I),
    "sent": (GREEN, GREEN_T, GREEN_I),
    "draft": (AMBER, AMBER_T, AMBER_I),
    "escalated": (RED, RED_T, RED_I),
    "failed": (RED, RED_T, RED_I),
    "closed": (SLATE, SLATE_T, SLATE_I),
    "new": (BLUE, BLUE_T, BLUE_I),
    "triaged": (SIGNAL, TINT, TEAL),
    "live": (SIGNAL, TINT, TEAL),
    "test": (AMBER, AMBER_T, AMBER_I),
    "connected": (GREEN, GREEN_T, GREEN_I),
    "unavailable": (SLATE, SLATE_T, SLATE_I),
}


class UI(T.Deck):
    """Deck plus the handful of primitives a product screen is made of."""

    # -- shapes -------------------------------------------------------------------------------

    def rrect(self, rect, r=10.0, fill=PAPER, line=None, width=0.9, dash=None, smooth=100):
        sid = self.c.cmd("shape.insert", {"preset": "roundRect",
                                          "rect": [round(v, 2) for v in rect]})["id"]
        if r > 0:
            self.c.cmd("shape.smoothCorners", {"smoothing": smooth, "radius": float(r)})
        self.c.cmd("shape.fill", {"none": True} if fill is None else {"color": fill})
        if line is None:
            self.c.cmd("shape.line", {"none": True})
        else:
            spec = {"color": line, "width": width}
            if dash:
                spec["dash"] = dash
            self.c.cmd("shape.line", spec)
        return sid

    def seg(self, x1, y1, x2, y2, color=LINE, width=0.9):
        if abs(y2 - y1) < 0.01:
            return self.rrect((min(x1, x2), y1, abs(x2 - x1), width), r=0, fill=color)
        if abs(x2 - x1) < 0.01:
            return self.rrect((x1, min(y1, y2), width, abs(y2 - y1)), r=0, fill=color)
        raise ValueError("seg is orthogonal only")

    def tri(self, x, y, direction, color, size=5.0):
        half = size * 0.52
        if direction == "right":
            pts = [(x, y), (x - size, y - half), (x - size, y + half)]
        elif direction == "left":
            pts = [(x, y), (x + size, y - half), (x + size, y + half)]
        elif direction == "down":
            pts = [(x, y), (x - half, y - size), (x + half, y - size)]
        else:
            pts = [(x, y), (x - half, y + size), (x + half, y + size)]
        return self.freeform(pts, fill=color, smooth=False)

    def poly(self, points, color=FAINT, width=1.0, closed=False, fill=None):
        pts = [[round(float(x), 2), round(float(y), 2)] for x, y in points]
        sid = self.c.cmd("shape.freeform", {"points": pts, "closed": closed,
                                            "smooth": False})["id"]
        self.c.cmd("shape.fill", {"none": True} if fill is None else {"color": fill})
        self.c.cmd("shape.line", {"none": True} if color is None
                   else {"color": color, "width": width, "cap": "round", "join": "round"})
        return sid

    def chevron(self, x, y, color=FAINT, size=3.2, width=0.9):
        return self.poly([(x - size, y - size / 2), (x, y + size / 2), (x + size, y - size / 2)],
                         color, width)

    def check(self, cx, cy, color=PAPER, size=3.4, width=1.2):
        return self.poly([(cx - size, cy), (cx - size * 0.25, cy + size * 0.7),
                          (cx + size, cy - size * 0.75)], color, width)

    def hline(self, x, y, w, color=LINE, weight=0.9):
        return self.rrect((x, y, w, weight), r=0, fill=color)

    def vline(self, x, y, h, color=LINE, weight=0.9):
        return self.rrect((x, y, weight, h), r=0, fill=color)

    def arc_band(self, cx, cy, r, a0, a1, w, color, steps=56):
        """A solid arc segment: outer edge forward, inner edge back."""
        a0, a1 = math.radians(a0), math.radians(a1)
        outer, inner = [], []
        for i in range(steps + 1):
            t = a0 + (a1 - a0) * i / steps
            outer.append((cx + (r + w / 2) * math.cos(t), cy + (r + w / 2) * math.sin(t)))
            inner.append((cx + (r - w / 2) * math.cos(t), cy + (r - w / 2) * math.sin(t)))
        return self.freeform(outer + inner[::-1], fill=color, smooth=False)

    def wedge(self, cx, cy, r_in, r_out, a0, a1, color, steps=40):
        a0, a1 = math.radians(a0), math.radians(a1)
        pts = []
        for i in range(steps + 1):
            t = a0 + (a1 - a0) * i / steps
            pts.append((cx + r_out * math.cos(t), cy + r_out * math.sin(t)))
        if r_in > 0:
            for i in range(steps, -1, -1):
                t = a0 + (a1 - a0) * i / steps
                pts.append((cx + r_in * math.cos(t), cy + r_in * math.sin(t)))
        else:
            pts.append((cx, cy))
        return self.freeform(pts, fill=color, smooth=False)

    # -- type --------------------------------------------------------------------------------

    def text(self, rect, body, size=9.5, color=None, bold=False, italic=False, tracking=0.0,
             line=1.55, align="left", anchor="top", family=None, underline=False):
        c = self.c
        color = INK if color is None else color
        sid = c.cmd("insert.textBox", {"rect": [round(v, 2) for v in rect], "text": body})["id"]
        c.cmd("format.autofit", {"mode": "none"})
        c.cmd("format.font", {"family": family or SANS})
        c.cmd("format.size", {"size": size})
        if bold:
            c.cmd("format.bold", {"on": True})
        if italic:
            c.cmd("format.italic", {"on": True})
        c.cmd("format.color", {"color": color})
        c.cmd("format.spacing", {"pt": tracking})
        if line:
            c.cmd("format.lineSpacing", {"lines": line})
        if align != "left":
            c.cmd("format.align", {"align": align})
        if anchor != "top":
            c.cmd("format.anchor", {"anchor": anchor})
        c.cmd("format.margins", {"left": 0, "top": 0, "right": 0, "bottom": 0})
        c.cmd("shape.setBounds", {"x": round(rect[0], 2), "y": round(rect[1], 2),
                                  "w": round(rect[2], 2), "h": round(rect[3], 2)})
        return sid

    def txt(self, rect, body, size=7.0, color=INK, bold=False, italic=False,
            tracking=0.0, line=1.35, align="left", anchor="top", family=None):
        return self.text(rect, body, size=size, color=color, bold=bold, italic=italic,
                         tracking=tracking, line=line, align=align, anchor=anchor, family=family)

    def serif(self, rect, body, size=22, color=INK, tracking=-0.9, line=1.02, align="left",
              anchor="top", italic=False):
        return self.text(rect, body, size=size, color=color, italic=italic, tracking=tracking,
                         line=line, align=align, anchor=anchor, family=SERIF)

    def fitserif(self, rect, body, size=22, color=INK, tracking=-0.9, line=1.02,
                 align="left", anchor="top", floor=0.6):
        """Step the display size down until the block fits its box — serif is narrow (~0.45em)."""
        candidate = size
        while candidate > size * floor:
            rendered = 0
            for paragraph in body.split("\n"):
                drawn = len(paragraph) * 0.45 * candidate + len(paragraph) * min(0.0, tracking)
                rendered += max(1, math.ceil(drawn / max(1.0, rect[2])))
            if candidate * (1.0 + (rendered - 1) * line * 1.2) <= rect[3]:
                break
            candidate -= 0.5
        return self.serif(rect, body, size=round(candidate, 1), color=color, tracking=tracking,
                          line=line, align=align, anchor=anchor)

    def caps(self, rect, body, size=5.2, color=FAINT, tracking=1.2, align="left", bold=True):
        return self.text(rect, body.upper(), size=size, color=color, bold=bold,
                         tracking=tracking, align=align, line=None)

    def label_value(self, x, y, label, value, w=120, size=5.4, color=MUTED, vcolor=INK,
                    vsize=7.0, gap=9):
        self.caps((x, y, w, 8), label, size=size, color=color)
        self.txt((x, y + gap, w, vsize * 1.5), value, size=vsize, color=vcolor, line=1.25)

    # -- components --------------------------------------------------------------------------

    def card(self, rect, r=12.0, fill=PAPER, line=LINE, width=0.8):
        return self.rrect(rect, r=r, fill=fill, line=line, width=width)

    def pill(self, rect, label, fill=INK, ink=PAPER, size=6.0, bold=True, dot=None,
             line=None, width=0.9, glyph=None):
        self.rrect(rect, r=rect[3] / 2, fill=fill, line=line, width=width)
        x, y, w, h = rect
        lead = 7.0 if dot else 0.0
        if dot:
            self.dot(x + 6.4, y + h / 2, 1.5, dot)
        if glyph:
            self.channel(x + 8.0, y + h / 2, glyph, ink, 4.6)
            lead += 6.0
        self.txt((x + 6.0 + lead, y, w - 10.0 - lead, h), label, size=size, color=ink,
                 bold=bold, anchor="middle", tracking=0.1)

    def badge(self, x, y, label, kind="answered", size=5.2, h=12.5):
        dot_color, tint, ink = BADGE[kind]
        w = 16 + len(label) * size * 0.58
        self.rrect((x, y, w, h), r=h / 2, fill=tint)
        self.dot(x + 5.8, y + h / 2, 1.7, dot_color)
        self.txt((x + 10.2, y, w - 12, h), label, size=size, color=ink, bold=True,
                 anchor="middle")
        return w

    def meter(self, rect, pct, color=SIGNAL, track=LINE2, height=None):
        x, y, w, h = rect
        h = height or h
        self.rrect((x, y, w, h), r=h / 2, fill=track)
        if pct > 0:
            self.rrect((x, y, max(h, w * pct / 100.0), h), r=h / 2, fill=color)

    def field(self, rect, label, value, placeholder=False, focus=False, trailing=None,
              multi=False, size=6.6):
        x, y, w, h = rect
        if label:
            self.caps((x, y - 9, w, 8), label, size=4.9, color=FAINT, tracking=1.0)
        self.rrect((x, y, w, h), r=7, fill=PAPER, line=TEAL if focus else LINE,
                   width=1.1 if focus else 0.8)
        if focus:
            self.rrect((x, y, 1.8, h), r=1.8, fill=SIGNAL)
        if multi:
            self.text((x + 8, y + 5, w - 16, h - 8), value, size=size,
                      color=FAINT if placeholder else INK, anchor="top", line=1.45)
        else:
            self.txt((x + 8, y, w - (26 if trailing else 14), h), value, size=size,
                     color=FAINT if placeholder else INK, anchor="middle", line=1.4)
        if trailing:
            self.txt((x + w - 22, y, 16, h), trailing, size=5.4, color=MUTED,
                     anchor="middle", align="right")

    def chip(self, rect, label, active=False, dot=None, size=5.6, count=None, line=LINE):
        fill = INK if active else PAPER
        ink = PAPER if active else MUTED
        self.rrect(rect, r=rect[3] / 2, fill=fill, line=None if active else line)
        x, y, w, h = rect
        if dot:
            self.dot(x + 7.4, y + h / 2, 1.6, dot if not active else MINT)
            x += 5
            w -= 5
        text = label
        if count is not None:
            text = f"{label}  {count}"
        self.txt((x + 7, y, w - 12, h), text, size=size, color=ink, bold=active,
                 anchor="middle")

    def toggle(self, x, y, on=True, w=22.0, h=11.5):
        self.rrect((x, y, w, h), r=h / 2, fill=INK if on else "#DCDCD5")
        knob = h - 3.0
        cx = x + (w - knob / 2 - 1.5) if on else (x + knob / 2 + 1.5)
        self.dot(cx, y + h / 2, knob / 2, PAPER)

    def avatar(self, cx, cy, r, initials, fill=TINT, ink=TEAL, size=None):
        self.dot(cx, cy, r, fill)
        self.txt((cx - r, cy - r, r * 2, r * 2), initials, size=size or r * 0.78, color=ink,
                 bold=True, anchor="middle", align="center")

    def channel(self, cx, cy, kind, color=INK, r=5.0):
        """A channel mark at 10pt: recognisable silhouette, not a tracing."""
        if kind == "whatsapp":
            self.dot(cx, cy - 0.4, r * 0.92, color)
            self.tri(cx - r * 0.55, cy + r * 0.95, "left", color, size=r * 0.85)
        elif kind == "instagram":
            self.rrect((cx - r, cy - r, r * 2, r * 2), r=r * 0.62, fill=None, line=color,
                       width=0.9)
            self.dot(cx, cy, r * 0.34, color)
            self.dot(cx + r * 0.55, cy - r * 0.55, 0.9, color)
        elif kind == "gmail":
            self.rrect((cx - r, cy - r * 0.72, r * 2, r * 1.44), r=0.8, fill=None,
                       line=color, width=0.85)
            self.poly([(cx - r, cy - r * 0.66), (cx, cy + r * 0.30), (cx + r, cy - r * 0.66)],
                      color, 0.85)
        elif kind == "voice":
            self.dot(cx, cy - r * 0.55, r * 0.30, color)
            self.rrect((cx - 0.45, cy - r * 0.12, 0.9, r * 0.72), r=0.4, fill=color)
            self.rrect((cx - r * 0.66, cy + r * 0.42, r * 1.32, 0.85), r=0.4, fill=color)
        elif kind == "search":
            self.dot(cx - r * 0.22, cy - r * 0.22, r * 0.62, color)
            self.poly([(cx + r * 0.28, cy + r * 0.28), (cx + r * 0.86, cy + r * 0.86)],
                      color, 0.95)
        elif kind == "plus":
            self.seg(cx - r * 0.7, cy, cx + r * 0.7, cy, color, 0.9)
            self.seg(cx, cy - r * 0.7, cx, cy + r * 0.7, color, 0.9)
        elif kind == "play":
            self.poly([(cx - r * 0.5, cy - r * 0.72), (cx + r * 0.8, cy),
                       (cx - r * 0.5, cy + r * 0.72)], None, 0, closed=True, fill=color)
        elif kind == "menu":
            for i in range(2):
                self.seg(cx - r * 0.8, cy - r * 0.28 + i * r * 0.62, cx + r * 0.8, cy - r * 0.28 + i * r * 0.62, color, 0.9)
        elif kind == "google":
            self.dot(cx, cy, r * 0.95, color)
        elif kind == "arrow":
            self.seg(cx - r, cy, cx + r * 0.55, cy, color, 0.9)
            self.poly([(cx + r * 0.2, cy - r * 0.42), (cx + r * 0.72, cy),
                       (cx + r * 0.2, cy + r * 0.42)], color, 0.9)
        elif kind == "check":
            self.check(cx, cy, color, size=r * 0.7, width=1.1)
        elif kind == "bolt":
            self.poly([(cx + r * 0.2, cy - r), (cx - r * 0.55, cy + r * 0.12),
                       (cx - r * 0.02, cy + r * 0.12), (cx - r * 0.2, cy + r),
                       (cx + r * 0.6, cy - r * 0.16), (cx + r * 0.05, cy - r * 0.16)],
                      None, 0, closed=True, fill=color)
        elif kind == "dots":
            for i in range(3):
                self.dot(cx, cy - r * 0.6 + i * r * 0.6, 0.85, color)
        else:
            self.dot(cx, cy, r * 0.8, color)

    def glyph(self, cx, cy, kind, color=INK):
        """Abstract 11pt nav icon, drawn with the primitives only."""
        if kind == "queue":
            for i in range(3):
                self.rrect((cx - 5.4, cy - 4.6 + i * 3.9, 10.8 - i * 2.6, 1.9), r=0.95,
                           fill=color)
        elif kind == "voice":
            self.channel(cx, cy, "voice", color, 4.6)
        elif kind == "brain":
            for dx, dy in ((-3.1, -2.2), (3.1, -2.2), (0, 2.7)):
                self.dot(cx + dx, cy + dy, 2.0, color)
            self.poly([(cx - 2.2, cy - 0.9), (cx - 0.4, cy + 1.5)], color, 0.75)
            self.poly([(cx + 2.2, cy - 0.9), (cx + 0.4, cy + 1.5)], color, 0.75)
        elif kind == "channels":
            for dx, dy in ((-2.9, -2.9), (2.9, -2.9), (-2.9, 2.9)):
                self.rrect((cx + dx - 2.4, cy + dy - 2.4, 4.8, 4.8), r=1.4, fill=color)
        else:
            self.dot(cx, cy, 3.4, color)

    # -- furniture ---------------------------------------------------------------------------

    def spec_strip(self, n, section, name, notes, route, components, states=None, ground=INK):
        """The right-hand build sheet: number, screen name, markers, states, route, components."""
        x = RAIL_X
        self.rrect((x, 0, RAIL_W, PAGE_H), r=0, fill=ground)
        self.caps((x + 14, 18, 120, 8), f"{n:02d}  —  {section}", size=4.9, color=MINT,
                  tracking=1.2)
        self.fitserif((x + 13, 28, RAIL_W - 24, 56), name, size=16.5, color=PAPER,
                      tracking=-0.5, line=1.05, floor=0.62)
        self.hline(x + 14, 92, RAIL_W - 28, "#2C2C2C")
        y = 102.0
        for i, (label, detail) in enumerate(notes):
            self.txt((x + 14, y, 12, 9), f"{i + 1}", size=5.6, color=MINT, bold=True)
            self.txt((x + 25, y - 0.6, RAIL_W - 38, 10), label, size=5.9, color=PAPER,
                     bold=True)
            self.txt((x + 25, y + 9.6, RAIL_W - 38, 30), detail, size=5.5, color="#A8A8A8",
                     line=1.36)
            y += 46.0
        if states:
            self.caps((x + 14, 286, 110, 8), "States", size=4.5, color=MINT, tracking=1.1)
            self.txt((x + 14, 295, RAIL_W - 26, 46), states, size=5.4, color="#CFCFCF",
                     line=1.4)
        self.caps((x + 14, 362, 110, 8), "Route", size=4.5, color=MINT, tracking=1.1)
        self.txt((x + 14, 371, RAIL_W - 26, 24), route, size=5.6, color=PAPER, line=1.35)
        self.caps((x + 14, 404, 110, 8), "Components", size=4.5, color=MINT, tracking=1.1)
        self.txt((x + 14, 413, RAIL_W - 26, 84), components, size=5.3, color="#CFCFCF",
                 line=1.4)
        self.hline(x + 14, 508, RAIL_W - 28, "#2C2C2C")
        self.txt((x + 14, 514, RAIL_W - 24, 8), "AfterSales AI  ·  screens", size=4.5,
                 color="#7C7C7C", tracking=0.2)

    def mark(self, x, y, n, dark=False):
        """A numbered marker on the screen, read against the spec strip."""
        halo = DEEP if dark else PAPER
        self.dot(x, y, 6.8, halo)
        self.dot(x, y, 4.9, PAPER if dark else INK)
        self.txt((x - 4.9, y - 4.9, 9.8, 9.8), str(n), size=4.4,
                 color=INK if dark else PAPER, bold=True, anchor="middle", align="center")

    def nav_rail(self, active="queue"):
        self.rrect((0, 0, NAV_W, PAGE_H), r=0, fill=PAPER)
        self.vline(NAV_W - 0.8, 0, PAGE_H, LINE)
        self.rrect((12, 12, 20, 20), r=6.4, fill=DEEP)
        self.serif((12, 12, 20, 20), "a", size=11.5, color=MINT, anchor="middle", align="center")
        for kind, y in (("queue", 62), ("voice", 92), ("brain", 122), ("channels", 152)):
            on = kind == active
            if on:
                self.rrect((7, y - 13, 30, 26), r=9, fill=TINT)
                self.rrect((0, y - 8, 2.0, 16), r=1, fill=SIGNAL)
            self.glyph(22, y, kind, TEAL if on else FAINT)
        self.channel(22, 498, "menu", FAINT, 4.4)
        self.avatar(22, 520, 8.5, "PN", fill=WASH, ink=MUTED, size=4.6)

    def topbar(self, business="CloudPulse CRM", cta="Test my AI agent", meta=None):
        self.rrect((NAV_W, 0, SR_W - NAV_W, TOP_H), r=0, fill=PAPER)
        self.hline(NAV_W, TOP_H - 0.8, SR_W - NAV_W, LINE)
        x = CX - 4
        self.rrect((x, 9, 128, 23), r=7.5, fill=WASH)
        self.txt((x + 9, 9, 96, 23), business, size=6.6, color=INK, bold=True, anchor="middle")
        self.chevron(x + 116, 20.5, FAINT, 2.8)
        right = CR
        self.avatar(right - 10, 20, 9.5, "PN", fill=TINT, ink=TEAL, size=5.0)
        self.rrect((right - 30, 10, 16, 20), r=5, fill=WASH)
        self.txt((right - 30, 10, 16, 20), "\u21ba", size=6.4, color=MUTED,
                 anchor="middle", align="center")
        pw = 8 + len(cta) * 6.0 * 0.54 + 18
        self.pill((right - 40 - pw, 9, pw, 23), cta, fill=INK, ink=PAPER, size=5.8, dot=MINT)
        sx = right - 54 - pw
        self.rrect((sx - 96, 9, 92, 23), r=11.5, fill=PAPER, line=LINE)
        self.channel(sx - 88, 20.5, "search", FAINT, 3.8)
        self.txt((sx - 80, 9, 70, 23), "Search tickets", size=5.6, color=FAINT,
                 anchor="middle")
        if meta:
            self.txt((NAV_W + 150, 9, 240, 23), meta, size=5.6, color=FAINT, anchor="middle")

    def screen_head(self, title, sub=None, right=None, y=58, size=25):
        self.fitserif((CX, y, 380, 34), title, size=size, color=INK, tracking=-0.9, line=1.0)
        if sub:
            self.txt((CX + 1, y + 30, 360, 14), sub, size=6.2, color=MUTED, line=1.3)
        if right:
            self.txt((CR - 300, y + 4, 300, 30), right, size=5.6, color=FAINT, align="right",
                     line=1.4)


# ---------------------------------------------------------------------------------------------
# 01 — cover
# ---------------------------------------------------------------------------------------------


def s_cover(d):
    d.ground(PAPER)
    # the hero flower, abstracted: one petrol seed-head, a pale crescent behind it, a mint thread
    d.dot(1120, 180, 330, TINT)
    d.dot(1084, 236, 250, DEEP)
    d.arc_band(1084, 236, 272, 112, 248, 3.0, MINT)
    d.dot(818, 300, 3.0, SIGNAL)

    d.serif((56, 32, 260, 24), "AfterSales.", size=15, color=INK, tracking=-0.4)
    d.caps((56, 58, 320, 10), "Design reference  \u00b7  v1  \u00b7  team 41", size=5.2,
           color=FAINT, tracking=1.3)

    d.serif((52, 140, 560, 160), "Every screen,\none language.", size=64, color=INK,
            tracking=-2.6, line=0.98)
    d.txt((56, 322, 346, 54),
          "Onboarding, the live queue, voice and the business brain \u2014 drawn in the landing "
          "page\u2019s own serif, its paper white, and the petrol teal inside its hero flower.",
          size=8.2, color=MUTED, line=1.66)
    d.txt((56, 390, 330, 30),
          "A build sheet, not a mood board: every screen carries its route, its components and "
          "its states.", size=7.0, color=FAINT, line=1.6)

    d.hline(56, 462, 848, LINE)
    d.caps((56, 474, 300, 10), "Sphinx \u201926  \u00b7  PS 2.5  \u00b7  omnichannel triage",
           size=5.4, color=MUTED, tracking=1.2)
    d.caps((520, 474, 384, 10), "18 screens  \u00b7  4 panels  \u00b7  7 routing rules", size=5.4,
           color=TEAL, align="right", tracking=1.2)
    d.notes("The promise of the deck: one visual language across every surface. The skin is the "
            "landing page \u2014 PP Editorial New display, Telegraf UI, white paper, jet ink \u2014 "
            "and the structure is the dashboard reference: left rail, thin top bar, bento cards, "
            "big roomy numerals. Every screen slide is a build sheet with a route and markers.")


def s_material(d):
    d.ground(PAPER)
    d.caps((56, 54, 300, 10), "01  \u2014  Material", size=5.4, color=FAINT, tracking=1.4)
    d.serif((52, 70, 360, 150), "White paper,\nblack ink,\none teal.", size=40, color=INK,
            tracking=-1.7, line=1.02)
    d.txt((56, 226, 320, 62),
          "The landing page is mostly empty page. Type carries it; a single petrol teal does the "
          "marking. Nothing else \u2014 no gradients, no glass, no shadow above 8%.",
          size=7.6, color=MUTED, line=1.62)

    rules = [
        ("Ground", "Paper #FFFFFF, wash #F4F4F1"),
        ("Ink", "Jet #0A0A0A \u00b7 muted #67676E \u00b7 faint #A2A2A8"),
        ("Accent", "Petrol #0E6B5F, signal #12A594, mint #8FE0CE"),
        ("Hairlines", "0.8pt #E4E4DD \u00b7 inside cards #EFEFE9"),
        ("Radius", "Cards 12 \u00b7 fields 7 \u00b7 controls 999"),
        ("Motion", "160ms in, 220ms out \u00b7 one property at a time"),
    ]
    y = 300.0
    for label, value in rules:
        d.txt((56, y, 58, 10), label, size=6.0, color=INK, bold=True)
        d.txt((118, y, 246, 10), value, size=5.8, color=MUTED)
        d.hline(56, y + 15, 308, LINE2)
        y += 30.0

    # colour swatches
    x = 452.0
    d.caps((x, 54, 200, 10), "Colour  \u00b7  six values, nothing else", size=5.0, color=FAINT,
           tracking=1.2)
    swatches = [("Paper", PAPER, "#FFFFFF"), ("Wash", WASH, "#F4F4F1"), ("Line", LINE, "#E4E4DD"),
                ("Ink", INK, "#0A0A0A"), ("Petrol", TEAL, "#0E6B5F"), ("Signal", SIGNAL, "#12A594")]
    for i, (name, hexv, code) in enumerate(swatches):
        sx = x + i * 76
        d.rrect((sx, 70, 68, 58), r=8, fill=hexv, line=None if hexv != PAPER else LINE)
        d.txt((sx, 133, 68, 8), name, size=5.4, color=INK, bold=True)
        d.txt((sx, 142, 68, 8), code, size=4.8, color=FAINT, tracking=0.3)

    # type specimen
    ty = 178.0
    d.caps((x, ty, 260, 10), "Type  \u00b7  PP Editorial New + Telegraf", size=5.0, color=FAINT,
           tracking=1.2)
    d.serif((x - 2, ty + 16, 450, 44), "The unsure ones.", size=38, color=INK, tracking=-1.5)
    d.txt((x, ty + 62, 300, 12), "Display \u00b7 PP Editorial New Ultralight \u00b7 \u22121.6 tracking",
          size=5.6, color=MUTED)
    d.txt((x, ty + 78, 220, 10), "Live queue  \u00b7  42 open  \u00b7  94%", size=8.6, color=INK)
    d.txt((x, ty + 94, 300, 10), "UI \u00b7 Telegraf Regular \u00b7 7.0 / 1.55 body", size=5.6,
          color=MUTED)
    d.caps((x, ty + 112, 300, 10), "Micro caps \u00b7 5.0 \u00b7 1.2 tracking \u00b7 uppercase",
           size=5.0, color=INK, tracking=1.2)
    d.caps((700, ty + 18, 190, 10), "Size ladder 38 \u2192 5", size=4.3, color=FAINT,
           tracking=1.0, align="right")
    for i, tick in enumerate((38, 22, 14, 9, 7, 5)):
        d.hline(700 + i * 31, ty + 34, 24, LINE)
        d.txt((700 + i * 31, ty + 38, 26, 9), str(tick), size=4.2, color=FAINT)

    # form
    fy = 344.0
    d.caps((x, fy, 300, 10), "Form  \u00b7  card, pill, field, marker", size=5.0, color=FAINT,
           tracking=1.2)
    d.rrect((x, fy + 18, 168, 92), r=12, fill=PAPER, line=LINE)
    d.caps((x + 14, fy + 30, 120, 8), "Card", size=4.6, color=FAINT, tracking=1.1)
    d.txt((x + 14, fy + 42, 140, 10), "12 radius \u00b7 0.8 hairline", size=5.6, color=INK)
    d.meter((x + 14, fy + 62, 140, 4), 68, SIGNAL)
    d.txt((x + 14, fy + 74, 140, 24), "One hairline, one tint, one meter. No stacked borders.",
          size=5.2, color=MUTED, line=1.4)

    d.pill((x + 186, fy + 18, 96, 24), "Primary", fill=INK, ink=PAPER, size=6.0)
    d.pill((x + 290, fy + 18, 88, 24), "Ghost", fill=PAPER, ink=INK, size=6.0, line=LINE)
    d.pill((x + 186, fy + 50, 112, 24), "Disabled", fill=WASH, ink=FAINT, size=6.0)
    d.mark(x - 8, fy - 8, 1)
    d.txt((x + 186, fy + 84, 200, 24),
          "Marker 1 ties a pixel to the spec strip on the right.", size=5.2, color=MUTED, line=1.4)

    d.hline(56, 502, 848, LINE)
    d.caps((56, 512, 360, 10), "Everything on the following screens is drawn from these six values",
           size=5.2, color=FAINT, tracking=1.1)
    d.notes("Six colours, two faces, three radii. The landing page's own TTFs are loaded into the "
            "deck so the specimen is the real font, not a stand-in. Teal is a marking colour: it "
            "appears on live state, on the confidence meter and on selection \u2014 never as a "
            "background wash behind body copy.")


# ---------------------------------------------------------------------------------------------
# 03 — the kit
# ---------------------------------------------------------------------------------------------


def s_kit(d):
    d.ground(WASH)
    d.caps((56, 44, 300, 10), "02  \u2014  Components", size=5.2, color=FAINT, tracking=1.4)
    d.serif((52, 58, 420, 44), "The kit.", size=34, color=INK, tracking=-1.4)
    d.txt((356, 66, 460, 30),
          "Six primitives cover every screen. Build them once in components/ui, then compose.",
          size=7.0, color=MUTED, line=1.5)

    bw, bh = 276.0, 200.0
    xs = [56.0, 354.0, 652.0]
    ys = [112.0, 322.0]

    def panel(col, row, title, note, code):
        x, y = xs[col], ys[row]
        d.rrect((x, y, bw, bh), r=12, fill=PAPER, line=LINE)
        d.caps((x + 14, y + 13, 180, 9), title, size=4.8, color=TEAL, tracking=1.2)
        d.txt((x + 14, y + 24, 220, 9), note, size=5.0, color=FAINT)
        d.rrect((x + 12, y + bh - 30, bw - 24, 18), r=6, fill=WASH)
        d.txt((x + 20, y + bh - 30, bw - 34, 18), code, size=4.9, color=MUTED,
              anchor="middle", tracking=0.15)
        return x + 14, y + 44

    # 1 - buttons
    px, py = panel(0, 0, "Buttons", "one black pill per screen",
                   '<Button variant="primary" />')
    d.pill((px, py, 84, 24), "Primary", fill=INK, ink=PAPER, size=5.8)
    d.pill((px + 92, py, 68, 24), "Ghost", fill=PAPER, ink=INK, size=5.8, line=LINE)
    d.pill((px + 168, py, 78, 24), "Disabled", fill=WASH, ink=FAINT, size=5.8)
    d.pill((px, py + 32, 108, 22), "Send", fill=INK, ink=PAPER, size=5.4, dot=MINT)
    d.pill((px + 116, py + 32, 100, 22), "Simulate", fill=TINT, ink=TEAL, size=5.4)
    d.caps((px, py + 62, 140, 8), "Icon buttons  \u00b7  24", size=4.4, color=FAINT,
           tracking=1.0)
    d.rrect((px, py + 72, 24, 24), r=12, fill=PAPER, line=LINE)
    d.channel(px + 12, py + 84, "plus", INK, 4.0)
    d.rrect((px + 32, py + 72, 24, 24), r=12, fill=PAPER, line=LINE)
    d.chevron(px + 44, py + 84, INK, 3.0)
    d.txt((px + 66, py + 72, 160, 24), "24pt, hairline, no fill until hover", size=4.7,
          color=MUTED, anchor="middle")

    # 2 - badges
    px, py = panel(1, 0, "Status badges", "the PRD's five ticket states",
                   '<Badge state={ticket.state} />')
    states = [("answered", "answered"), ("draft", "draft"), ("escalated", "escalated"),
              ("failed", "failed"), ("closed", "closed"), ("new", "new")]
    for i, (kind, text) in enumerate(states):
        d.badge(px + (i % 2) * 112, py + (i // 2) * 26, text, kind)
    d.txt((px, py + 84, 236, 26),
          "Dot + tint + ink. The tint is 15% of the dot; the ink is its darkest readable pair.",
          size=5.1, color=MUTED, line=1.45)

    # 3 - meters
    px, py = panel(2, 0, "Meters & rings", "confidence, urgency, decisions",
                   '<Meter value={conf} floor={50} />')
    for label, value, pct, color in (("Confidence", "94", 94, SIGNAL),
                                     ("Urgency", "20", 20, AMBER)):
        d.caps((px, py, 60, 8), label, size=4.6, color=FAINT, tracking=1.0)
        d.txt((px + 176, py - 2, 40, 10), value, size=6.2, color=INK, bold=True, align="right")
        d.meter((px, py + 11, 216, 4.6), pct, color)
        py += 30.0
    d.caps((px, py, 90, 8), "Below the floor", size=4.6, color=RED_I, tracking=1.0)
    d.txt((px + 176, py - 2, 40, 10), "49", size=6.2, color=RED_I, bold=True, align="right")
    d.meter((px, py + 11, 216, 4.6), 49, RED)
    d.txt((px, py + 19, 216, 9), "Nothing below 50 is ever sent, at any confidence",
          size=4.6, color=RED_I)
    for i in range(20):
        col = RED if i < 10 else SIGNAL
        d.dot(px + 6 + i * 11, py + 40, 2.6, col if i != 10 else AMBER)
    d.txt((px + 6, py + 46, 60, 9), "49", size=4.4, color=RED_I, bold=True)
    d.txt((px + 116, py + 46, 80, 9), "50  \u00b7  the floor", size=4.4, color=TEAL, bold=True)
    d.txt((px, py + 58, 216, 9), "The tape marks the boundary the router enforces; it is drawn "
          "here, not in the CSS.", size=4.3, color=FAINT)

    # 4 - fields
    px, py = panel(0, 1, "Fields", "rest, focus, error, multiline", '<Field state="focus" />')
    d.field((px, py + 7, 108, 22), "Rest", "CloudPulse CRM", size=5.6)
    d.field((px + 120, py + 7, 108, 22), "Focus", "\u20b91,499 / mo", focus=True, size=5.6)
    d.field((px, py + 44, 108, 22), "Error", "not-an-email", size=5.6)
    d.vline(px, py + 44, 22, RED, 1.1)
    d.txt((px + 120, py + 47, 120, 18), "Enter a valid email", size=4.7, color=RED_I)
    d.field((px, py + 78, 228, 30), "", "Q: How do I export GSTR-1?\nA: Reports \u203a GST \u203a "
            "Export JSON", multi=True, size=5.3)
    d.txt((px, py + 112, 230, 9), "Label sits 9pt above; the box never grows on focus.",
          size=4.7, color=FAINT)

    # 5 - row
    px, py = panel(1, 1, "Ticket row", "the queue's only repeating unit",
                   '<TicketRow ticket={t} selected />')
    d.rrect((px, py, 248, 34), r=8, fill=TINT)
    d.vline(px, py, 34, SIGNAL, 2.0)
    d.channel(px + 18, py + 17, "whatsapp", TEAL, 4.6)
    d.txt((px + 32, py + 7, 92, 10), "Aarav Mehta", size=5.8, color=INK, bold=True)
    d.txt((px + 32, py + 18, 120, 10), "Where is my crown order?", size=4.9, color=MUTED)
    d.txt((px + 158, py + 7, 34, 8), "71", size=6.0, color=INK, bold=True)
    d.meter((px + 158, py + 18, 34, 3), 71, SIGNAL)
    d.badge(px + 200, py + 10, "triaged", "triaged", size=4.4, h=11)
    d.txt((px, py + 46, 246, 46),
          "34 tall \u00b7 channel \u00b7 name \u00b7 intent \u00b7 confidence \u00b7 state. Selected "
          "rows take the teal wash and a 2pt bar, never a border.", size=5.0, color=MUTED,
          line=1.45)

    # 6 - data
    px, py = panel(2, 1, "Data & marks", "the only decorative layer",
                   '<Donut data={decisionMix} />')
    angles = [(-90, 134, SIGNAL), (134, 199, TEAL), (199, 242, AMBER), (242, 270, RED)]
    for a0, a1, col in angles:
        d.wedge(px + 34, py + 26, 14, 23, a0 + 1.5, a1 - 1.5, col)
    d.txt((px + 26, py + 19, 16, 14), "62", size=6.6, color=INK, anchor="middle",
          align="center", family=SERIF)
    for i, (label, pct, col) in enumerate((("R6", "62%", SIGNAL), ("R5", "18%", TEAL),
                                           ("R2", "12%", AMBER), ("R1", "8%", RED))):
        yy = py + 10 + i * 14
        d.dot(px + 78, yy + 3, 1.6, col)
        d.txt((px + 86, yy - 1, 40, 10), label, size=4.6, color=INK)
        d.txt((px + 176, yy - 1, 32, 10), pct, size=4.6, color=FAINT, align="right")
    d.poly([(px + i * 4.6, py + 82 - v) for i, v in enumerate(
        [10, 7, 12, 5, 9, 7, 13, 3, 6, 2, 8, 1, 5, 3, 7, 2, 4, 2, 6, 1, 3, 1, 2])], SIGNAL, 1.1)
    d.dot(px + 22 * 4.6, py + 80, 1.5, SIGNAL)
    d.txt((px, py + 90, 250, 24), "Sparkline 1.1pt \u00b7 measured, never invented. The donut takes "
          "the routing mix from the queue's own count.", size=4.7, color=MUTED, line=1.35)
    d.notes("One component panel per primitive so the React tree is obvious: Button, Badge, Meter, "
            "Field, TicketRow, Chart. Badge variants come straight from the PRD's ticket states; "
            "the meter turns crimson the moment a value could auto-send under the confidence floor.")


def s_map(d):
    d.ground(DEEP)
    d.arc_band(1000, 610, 300, 190, 300, 40, "#0B4B45")
    d.arc_band(1000, 610, 360, 188, 292, 34, "#0B4B45")
    d.arc_band(1000, 610, 420, 186, 286, 28, "#0B4B45")

    d.caps((56, 52, 300, 10), "03  \u2014  The screens", size=5.4, color=MINT, tracking=1.4)
    d.serif((52, 68, 470, 110), "Four routes.\nEvery surface.", size=42, color=PAPER,
            tracking=-1.8, line=1.0)
    d.txt((56, 196, 386, 60),
          "A judge walks the same path the code does: public site, sign-in, twelve facts, then the "
          "four dashboard panels. One shell, one component kit, one accent.",
          size=7.4, color="#BBD3CE", line=1.6)

    routes = [
        ("/", "Landing", "hero video \u00b7 3 steps \u00b7 rules", "05"),
        ("/auth", "Sign in", "tabs \u00b7 Google \u00b7 judge demo", "06"),
        ("/onboarding", "Twelve facts", "4 steps \u00b7 .md upload \u00b7 compile", "07\u201310"),
        ("/dashboard", "Four panels", "queue \u00b7 voice \u00b7 brain \u00b7 channels", "11\u201316"),
    ]
    y = 286.0
    for route, name, sub, pages in routes:
        d.hline(56, y - 12, 470, "#1F5651")
        d.txt((56, y, 96, 12), route, size=7.2, color=MINT)
        d.txt((158, y - 1, 120, 12), name, size=7.2, color=PAPER, bold=True)
        d.txt((158, y + 12, 280, 10), sub, size=5.2, color="#9FBFBA")
        d.txt((452, y, 48, 12), pages, size=5.6, color="#9FBFBA", align="right")
        y += 46.0
    d.hline(56, y - 12, 470, "#1F5651")

    # index of the eighteen
    ix = 560.0
    d.caps((ix, 60, 300, 10), "In this deck", size=5.0, color=MINT, tracking=1.2)
    items = [
        ("01", "Cover"), ("02", "Material"), ("03", "The kit"), ("04", "Route map"),
        ("05", "Landing"), ("06", "Sign in"), ("07", "Onboarding 1 \u00b7 identity"),
        ("08", "Onboarding 2 \u00b7 catalog"), ("09", "Onboarding 3 \u00b7 escalation"),
        ("10", "Onboarding 4 \u00b7 channels"), ("11", "Dashboard \u00b7 queue"),
        ("12", "Ticket detail \u00b7 trace"), ("13", "Text agent modal"),
        ("14", "Voice test"), ("15", "Brain & insights"), ("16", "Channels & readiness"),
        ("17", "States & layout"), ("18", "Build order"),
    ]
    for i, (num, label) in enumerate(items):
        col, row = divmod(i, 9)
        x = ix + col * 186
        yy = 78 + row * 21
        d.txt((x, yy, 18, 10), num, size=4.8, color=MINT)
        d.txt((x + 18, yy - 0.6, 160, 10), label, size=5.4, color="#D7E5E2")
        d.hline(x, yy + 13, 170, "#15453F")

    d.hline(56, 466, 848, "#1F5651")
    d.txt((56, 478, 380, 30), "Screens 05\u201317 are build sheets: an 812\u00d7540 viewport plus a "
          "spec strip.", size=5.6, color="#9FBFBA", line=1.5)
    d.txt((520, 478, 384, 30), "Markers on the screen match the list on the strip \u2014 read them "
          "against the route and the component names.", size=5.6, color="#9FBFBA", align="right",
          line=1.5)
    d.notes("The map is the deck's divider: four routes, eighteen screens. It also indexes the deck "
            "so a developer can jump to the screen they are building and see which panel it "
            "belongs to.")


# ---------------------------------------------------------------------------------------------
# 05 — landing
# ---------------------------------------------------------------------------------------------


def site_nav(d):
    d.serif((24, 14, 200, 20), "AfterSales.", size=12.5, color=INK, tracking=-0.3)
    links = [("How it works", 556.0), ("Rules", 616.0), ("Features", 656.0)]
    for label, x in links:
        d.txt((x, 15, 90, 16), label, size=5.4, color=MUTED)
    d.pill((724, 11, 64, 21), "Go to dashboard", fill=INK, ink=PAPER, size=5.0)


def s_landing(d):
    d.ground(PAPER)
    site_nav(d)
    d.hline(0, 44, SR_W, LINE2)

    d.caps((24, 66, 260, 10), "Sphinx \u201926  \u00b7  PS 2.5", size=4.8, color=TEAL,
           tracking=1.25)
    d.serif((23, 80, 360, 112), "Your support\nqueue, minus\nthe guessing.", size=33,
            color=INK, tracking=-1.5, line=1.0)
    d.txt((24, 200, 336, 46),
          "Every inbound message read, answered from your own business facts, and escalated below "
          "confidence 50 \u2014 with the rule and the reason attached.", size=6.6, color=MUTED,
          line=1.6)
    d.pill((24, 262, 108, 24), "Open the live demo", fill=INK, ink=PAPER, size=5.6)
    d.pill((140, 262, 96, 24), "Judge demo \u2192", fill=PAPER, ink=INK, size=5.6, line=LINE)
    d.caps((24, 300, 340, 10), "4 channels \u00b7 6 chunks \u00b7 7 rules", size=4.6,
           color=FAINT, tracking=1.1)

    # hero media: the video slot, on petrol
    d.rrect((400, 64, 388, 268), r=16, fill=DEEP)
    for r, wdt, col in ((150, 16, "#0C4C46"), (196, 13, "#0C4C46"), (240, 10, "#0F5B53")):
        d.arc_band(788, 332, r, 180, 270, wdt, col)
    d.arc_band(788, 332, 104, 180, 270, 9, TEAL)
    d.rrect((416, 80, 62, 18), r=9, fill=PAPER)
    d.txt((422, 80, 52, 18), "01 \u00b7 demo", size=4.6, color=INK, bold=True, anchor="middle")
    d.dot(582, 196, 19, PAPER)
    d.channel(585, 196, "play", INK, 6.0)
    d.txt((416, 284, 260, 12), "hero-demo.mp4  \u00b7  00:12 / 00:38", size=5.0, color="#BBD3CE")
    d.hline(416, 312, 356, "#1F5651")
    d.hline(416, 312, 112, MINT)

    # three steps
    steps = [
        ("01", "Teach it your business", "Twelve answers compile into one versioned brain."),
        ("02", "It triages every channel", "One classifier, seven ordered rules, three outcomes."),
        ("03", "You only see the unsure", "Below 50 it escalates instead of guessing."),
    ]
    x = 24.0
    for num, title, body in steps:
        d.rrect((x, 356, 244, 92), r=12, fill=PAPER, line=LINE)
        d.txt((x + 14, 368, 20, 10), num, size=5.0, color=TEAL, bold=True)
        d.txt((x + 14, 380, 210, 12), title, size=6.4, color=INK, bold=True)
        d.txt((x + 14, 396, 208, 40), body, size=5.4, color=MUTED, line=1.5)
        x += 256

    d.rrect((24, 462, 764, 40), r=10, fill=TINT)
    d.txt((40, 462, 40, 40), "R2", size=8.0, color=TEAL, bold=True, anchor="middle")
    d.txt((78, 462, 420, 40), "Confidence below 50 never auto-sends. It escalates, with the rule "
          "and the reason attached.", size=6.0, color=TEAL, anchor="middle")
    d.pill((688, 470, 84, 24), "Read the rules", fill=PAPER, ink=TEAL, size=5.2, line=TINT)

    # markers
    d.mark(780, 6, 1, dark=True)
    d.mark(16, 66, 2)
    d.mark(392, 56, 3, dark=True)
    d.mark(16, 356, 4)
    d.mark(780, 462, 5)

    d.spec_strip(5, "Landing", "The public\npromise.", [
        ("Black pill nav", "One filled control on the whole page, top right."),
        ("Serif hero", "33pt display, three short lines, left aligned, never centred."),
        ("Video slot", "16:9 petrol card; the flower whorl is the only ornament."),
        ("Proof strip", "R2 stated on the page \u2014 the product's own claim, not a testimonial."),
    ], "/", "components/landing/Navbar.tsx; HeroStage.tsx; RuleStrip.tsx")
    d.notes("The landing page is the source of the language, so it leads the screens: identical "
            "serif, identical black pill, and the hero video container the PRD asks for. Everything "
            "below inherits this page's restraint.")


# ---------------------------------------------------------------------------------------------
# 06 — auth
# ---------------------------------------------------------------------------------------------


def s_auth(d):
    d.ground(PAPER)
    site_nav(d)
    d.hline(0, 44, SR_W, LINE2)

    d.caps((24, 84, 260, 10), "Sign in", size=4.8, color=TEAL, tracking=1.25)
    d.serif((23, 98, 360, 88), "Sign in,\nor skip in.", size=32, color=INK, tracking=-1.4,
            line=1.0)
    d.txt((24, 200, 330, 46),
          "One owner per business. Judges take the seeded path; teams take Google. Customers "
          "never log in at all.", size=6.6, color=MUTED, line=1.6)

    d.rrect((24, 258, 340, 96), r=12, fill=WASH)
    d.caps((40, 270, 260, 9), "Post-auth redirect", size=4.6, color=FAINT, tracking=1.1)
    rows = [("no business", "/onboarding", "compile the brain first"),
            ("\u2265 1 business", "/dashboard", "queue is already warm")]
    for i, (cond, dest, note) in enumerate(rows):
        yy = 288 + i * 28
        d.txt((40, yy, 78, 10), cond, size=5.4, color=INK)
        d.channel(120, yy + 5, "arrow", TEAL, 4.0)
        d.txt((132, yy, 78, 10), dest, size=5.4, color=TEAL)
        d.txt((216, yy + 1, 136, 10), note, size=4.6, color=FAINT)

    d.txt((24, 370, 330, 40),
          "Session is the tenant boundary: businessId comes from here, never from the model.",
          size=5.8, color=FAINT, line=1.5)

    # card
    d.rrect((420, 60, 368, 420), r=16, fill=PAPER, line=LINE)
    d.txt((444, 82, 90, 16), "Sign in", size=6.6, color=INK, bold=True)
    d.txt((520, 82, 110, 16), "Create account", size=6.6, color=FAINT)
    d.hline(444, 104, 320, LINE2)
    d.hline(444, 104, 58, INK, 1.4)

    d.field((444, 130, 320, 26), "Email", "judge@sphinx.mnit.ac.in", size=6.0)
    d.field((444, 178, 320, 26), "Password", "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
            size=6.0, trailing="Show")
    d.pill((444, 222, 320, 26), "Sign in", fill=INK, ink=PAPER, size=6.2)
    d.hline(444, 268, 132, LINE2)
    d.txt((588, 264, 26, 10), "or", size=5.0, color=FAINT)
    d.hline(620, 268, 144, LINE2)
    d.pill((444, 284, 320, 26), "Continue with Google", fill=PAPER, ink=INK, size=5.8,
           line=LINE, glyph="google")
    d.rrect((444, 326, 320, 74), r=12, fill=TINT)
    d.txt((460, 338, 200, 10), "1-click judge demo login", size=6.2, color=TEAL, bold=True)
    d.txt((460, 352, 240, 26), "Seeds CloudPulse CRM and Jaipur Smile Studio, then lands in the "
          "queue.", size=5.0, color=TEAL, line=1.45)
    d.pill((674, 340, 74, 22), "Open \u2192", fill=TEAL, ink=PAPER, size=5.2)
    d.caps((444, 416, 200, 9), "Seeded businesses", size=4.6, color=FAINT, tracking=1.1)
    d.rrect((444, 428, 146, 22), r=11, fill=WASH)
    d.txt((454, 428, 130, 22), "CloudPulse CRM", size=5.2, color=INK, anchor="middle")
    d.rrect((598, 428, 166, 22), r=11, fill=WASH)
    d.txt((608, 428, 150, 22), "Jaipur Smile Studio", size=5.2, color=INK, anchor="middle")
    d.txt((444, 458, 320, 10), "AT-01 \u00b7 redirect rule is the acceptance test", size=4.8,
          color=FAINT)

    d.mark(436, 80, 1)
    d.mark(436, 130, 2)
    d.mark(436, 326, 3)
    d.mark(16, 258, 4)

    d.spec_strip(6, "Auth", "Two doors,\none redirect.", [
        ("Tabs", "Sign in and Create account share one card; the underline is 1.4pt ink."),
        ("Fields", "Focus turns the hairline teal and adds a 1.8pt left bar."),
        ("Judge path", "Teal tint, not black: the demo is secondary to a real sign-in."),
        ("Redirect", "The rule lives beside the form, so it cannot be forgotten in code."),
    ], "/auth", "components/auth/AuthPanel.tsx; lib/auth.ts \u00b7 getCurrentUser + ownership")
    d.notes("Auth keeps the landing page's restraint: one black pill, one teal action, two fields. "
            "The redirect contract from the PRD is printed next to the form so the frontend and "
            "backend cannot disagree about where sign-in ends.")


# ---------------------------------------------------------------------------------------------
# 07–10 — onboarding
# ---------------------------------------------------------------------------------------------


def onboarding_shell(d, step, title, sub):
    d.ground(PAPER)
    d.serif((24, 14, 200, 20), "AfterSales.", size=12.5, color=INK, tracking=-0.3)
    d.caps((300, 18, 240, 10), "Onboarding  \u00b7  CloudPulse CRM", size=4.6, color=FAINT,
           tracking=1.1)
    d.txt((690, 15, 64, 14), "Save & exit", size=5.2, color=MUTED, align="right")
    d.avatar(776, 21, 9.5, "PN", fill=TINT, ink=TEAL, size=5.0)
    d.hline(0, 44, SR_W, LINE2)

    # wizard rail
    d.caps((24, 72, 200, 9), "Set up your agent", size=4.6, color=FAINT, tracking=1.2)
    steps = [("Identity & tone", "name, type, voice"), ("Catalog & FAQs", "prices, hours, policies"),
             ("Escalation", "when a human steps in"), ("Channels", "where messages arrive")]
    y = 100.0
    for i, (name, sub2) in enumerate(steps):
        done = i < step
        active = i == step
        if i < len(steps) - 1:
            d.vline(32.0, y + 14, 34, LINE)
        if done:
            d.dot(32, y + 6, 7.4, TEAL)
            d.check(32, y + 6, PAPER, 3.0, 1.1)
        elif active:
            d.dot(32, y + 6, 7.4, INK)
            d.txt((25, y - 1.4, 14, 14), f"{i + 1:02d}", size=4.6, color=PAPER, bold=True,
                  align="center")
        else:
            d.shape("ellipse", (32 - 7, y + 6 - 7, 14, 14), fill=PAPER, line=LINE, width=0.9)
            d.txt((25, y - 0.6, 14, 12), f"{i + 1:02d}", size=4.4, color=FAINT, bold=True,
                  align="center")
        d.txt((50, y - 1, 168, 10), name, size=6.0, color=INK if (done or active) else FAINT,
              bold=active)
        d.txt((50, y + 10, 168, 10), sub2, size=4.8, color=FAINT)
        y += 48.0
    d.txt((24, 466, 210, 40),
          "Saved as you type. The brain compiles into chunks on the last step \u2014 nothing is "
          "sent before that.", size=5.0, color=FAINT, line=1.5)

    d.caps((286, 68, 240, 9), f"Step {step + 1} of 4", size=4.8, color=TEAL, tracking=1.25)
    d.fitserif((285, 80, 500, 56), title, size=26, color=INK, tracking=-1.1, line=1.02)
    d.txt((287, 142, 470, 24), sub, size=6.2, color=MUTED, line=1.5)

    d.hline(286, 452, 502, LINE2)
    d.pill((286, 464, 58, 22), "\u2190 Back", fill=PAPER, ink=MUTED, size=5.2, line=LINE)
    d.caps((430, 470, 90, 10), f"{step + 1} / 4", size=4.8, color=FAINT, align="center")
    d.pill((652, 462, 136, 26), "Continue \u2192", fill=INK, ink=PAPER, size=5.8)


def slider(d, x, y, w, pct, color=SIGNAL, knobs=True):
    d.rrect((x, y, w, 3.2), r=1.6, fill=LINE)
    d.rrect((x, y, max(3, w * pct / 100.0), 3.2), r=1.6, fill=color)
    d.dot(x + w * pct / 100.0, y + 1.6, 4.0, PAPER)
    d.dot(x + w * pct / 100.0, y + 1.6, 3.0, color)
    d.txt((x + w * pct / 100.0 - 14, y + 8, 28, 9), f"{int(pct)}", size=4.8, color=color,
          bold=True, align="center")


def s_onboard_1(d):
    onboarding_shell(d, 0, "Who are you\nanswering for?",
                     "Twelve facts become business_brain.md \u2014 the only thing the agent may "
                     "answer from.")
    d.field((286, 176, 236, 26), "Business name", "CloudPulse CRM", focus=True, size=6.2)
    d.caps((546, 167, 120, 9), "Business type", size=4.6, color=FAINT, tracking=1.0)
    for label, x, w, active in (("SaaS", 546, 46, True), ("E-commerce", 598, 72, False),
                                ("Clinic", 676, 50, False), ("Services", 732, 56, False)):
        d.chip((x, 176, w, 24), label, active=active, size=4.8)
    d.field((286, 232, 502, 44), "What do you do?",
            "Inventory & GST billing software for retail shops \u2014 Starter and Pro plans.",
            multi=True, size=5.8)

    d.caps((286, 292, 200, 9), "Agent tone  \u00b7  shapes every reply", size=4.6, color=FAINT,
           tracking=1.0)
    for label, x, w, active in (("Warm & concise", 286, 92, True), ("Professional", 384, 76, False),
                                ("Playful", 466, 54, False), ("Formal", 526, 52, False)):
        d.chip((x, 304, w, 24), label, active=active, size=4.8)

    d.rrect((286, 344, 502, 84), r=12, fill=WASH)
    d.caps((302, 356, 300, 9), "Preview  \u00b7  a customer asks about Pro pricing", size=4.6,
           color=FAINT, tracking=1.0)
    d.rrect((302, 370, 330, 42), r=10, fill=PAPER, line=LINE2)
    d.txt((316, 378, 300, 30), "Hi! CloudPulse Pro is \u20b91,499/month for 5 users \u2014 "
          "WhatsApp invoicing and the GST API are included.", size=5.2, color=INK, line=1.45)
    d.txt((650, 370, 124, 40), "Warm \u00b7 two sentences \u00b7 cites chk_cp_02 \u00b7 94 conf",
          size=4.6, color=FAINT, line=1.45)

    d.mark(278, 176, 1)
    d.mark(278, 304, 2)
    d.mark(278, 344, 3)
    d.mark(16, 96, 4)

    d.spec_strip(7, "Onboarding 1/4", "Who you\nanswer for.", [
        ("Four steps", "One rail, always visible: a form that hides its length feels endless."),
        ("Type chips", "Sets the seeded vocabulary \u2014 SaaS, e-commerce, clinic, services."),
        ("Tone", "A live preview of the same answer in the chosen voice, not a dropdown."),
        ("Persist", "Autosave every field; AT-02 proves it survives a reload."),
    ], "/onboarding  \u2192  step 1", "components/onboarding/OnboardingWizard.tsx; Wordmark on "
       "shared site nav")
    d.notes("Onboarding is the first product screen, so it must not look like a different product: "
            "the same serif for the question, the same 12pt card, the same black continue pill. The "
            "tone chips exist because they change the generated answer, and the preview proves it.")


def s_onboard_2(d):
    onboarding_shell(d, 1, "What do you sell,\nand what do you promise?",
                     "Prices, hours and one FAQ pair. This is the text the retriever will quote "
                     "verbatim.")
    d.caps((286, 167, 160, 9), "Products & prices", size=4.6, color=FAINT, tracking=1.0)
    d.caps((560, 167, 60, 9), "Price", size=4.6, color=FAINT, tracking=1.0)
    rows = [("Starter plan  \u00b7  1 user", "\u20b9499 / mo"),
            ("Pro plan  \u00b7  5 users, WhatsApp invoicing", "\u20b91,499 / mo"),
            ("Integration add-on  \u00b7  GST API", "\u20b9299 / mo")]
    y = 180.0
    for i, (name, price) in enumerate(rows):
        d.rrect((286, y, 334, 26), r=7, fill=PAPER, line=LINE if i != 1 else TEAL,
                width=0.8 if i != 1 else 1.0)
        d.channel(299, y + 13, "dots", FAINT, 3.0)
        d.txt((308, y, 178, 26), name, size=5.4, color=INK, anchor="middle")
        d.txt((494, y, 116, 26), price, size=5.4, color=INK, bold=True, anchor="middle",
              align="right")
        y += 32.0
    d.txt((286, 280, 200, 12), "+ Add another product", size=5.2, color=TEAL)

    d.field((286, 316, 250, 24), "Hours", "Mon\u2013Sat \u00b7 9:00\u201319:00 IST", size=5.4)
    d.field((286, 368, 250, 44), "Return policy",
            "7-day full refund if fewer than 10 invoices were generated.", multi=True, size=5.2)

    d.caps((286, 424, 200, 9), "One FAQ pair", size=4.6, color=FAINT, tracking=1.0)
    d.txt((286, 434, 250, 14), "Q: How do I export GSTR-1?   A: Reports \u203a GST \u203a Export "
          "JSON", size=4.9, color=MUTED)

    # right: upload + parse
    d.rrect((556, 176, 232, 64), r=10, fill=CARD, line=LINE, dash="dash", width=1.0)
    d.dot(586, 202, 9.0, WASH)
    d.channel(586, 202, "plus", INK, 4.4)
    d.txt((600, 190, 180, 12), "Drop business_brain.md", size=5.6, color=INK, bold=True)
    d.txt((600, 203, 180, 12), "or paste; we chunk it, not you", size=4.8, color=FAINT)
    d.pill((700, 216, 76, 18), "Browse files", fill=PAPER, ink=MUTED, size=4.6, line=LINE)

    d.caps((556, 254, 200, 9), "Parsed  \u00b7  6 sections", size=4.6, color=FAINT, tracking=1.0)
    sections = [("Products & pricing", "210w"), ("Hours & holidays", "90w"),
                ("Return policy", "180w"), ("Technical FAQ", "240w"),
                ("GST export steps", "160w"), ("Support & escalation", "120w")]
    yy = 268.0
    for i, (name, words) in enumerate(sections):
        d.dot(560, yy + 5, 1.6, SIGNAL)
        d.txt((568, yy, 150, 10), name, size=5.2, color=INK)
        d.txt((718, yy, 70, 10), words, size=4.8, color=FAINT, align="right")
        d.hline(556, yy + 14, 232, LINE2)
        yy += 21.0
    d.meter((556, 404, 150, 4), 100, SIGNAL)
    d.txt((712, 400, 76, 10), "4 of 4 facts", size=4.8, color=TEAL, align="right")

    d.mark(278, 180, 1)
    d.mark(548, 176, 2)
    d.mark(548, 246, 3)
    d.mark(548, 396, 4)

    d.spec_strip(8, "Onboarding 2/4", "The facts the\nagent may quote.", [
        ("Price rows", "Row edits, not a textarea: every fact gets an id the answer can cite."),
        ("Upload", "A dashed target, no spinner \u2014 the parse is synchronous and visible."),
        ("Parsed list", "Section + word count, so the owner sees exactly what was indexed."),
        ("Readiness", "The meter is the pre-flight for step 4's compile button."),
    ], "/onboarding  \u2192  step 2", "components/onboarding/CatalogStep.tsx; lib/rag.ts \u00b7 "
       "compileMarkdown()")
    d.notes("This is where hallucination is prevented on the human side: the owner can see the "
            "sections and their word counts before anything compiles. The price rows and the FAQ pair "
            "are the exact strings the retriever quotes in the answer.")


def s_onboard_3(d):
    onboarding_shell(d, 2, "When does a\nhuman step in?",
                     "Four rules escalate. One holds a draft. Only one can auto-send \u2014 and "
                     "never below 50.")
    d.field((286, 176, 252, 24), "Escalation email", "founder@cloudpulse.in", size=5.4)
    d.field((286, 224, 252, 24), "Escalation phone", "+91 98765 43210", size=5.4)

    d.rrect((286, 268, 252, 76), r=10, fill=WASH)
    d.caps((300, 278, 160, 9), "Confidence floor", size=4.6, color=FAINT, tracking=1.0)
    d.serif((300, 288, 46, 30), "50", size=24, color=INK, tracking=-1.0)
    d.txt((344, 296, 180, 20), "below this, R2 escalates\nand nothing is sent", size=4.8,
          color=MUTED, line=1.4)
    d.rrect((300, 326, 224, 2.6), r=1.3, fill=LINE)
    d.rrect((300, 326, 112, 2.6), r=1.3, fill=TEAL)
    d.dot(412, 327.3, 4.2, PAPER)
    d.dot(412, 327.3, 3.0, TEAL)
    d.txt((428, 322, 96, 10), "hard minimum", size=4.6, color=TEAL)

    d.rrect((286, 354, 252, 62), r=10, fill=PAPER, line=LINE)
    d.caps((300, 364, 160, 9), "Escalate at urgency", size=4.6, color=FAINT, tracking=1.0)
    d.txt((300, 376, 60, 18), "80", size=10.5, color=INK, bold=True)
    d.txt((322, 382, 180, 12), "R4 fires; the draft is discarded", size=4.8, color=MUTED)
    d.rrect((300, 400, 224, 2.6), r=1.3, fill=LINE)
    d.rrect((300, 400, 179, 2.6), r=1.3, fill=AMBER)
    d.dot(479, 401.3, 4.2, PAPER)
    d.dot(479, 401.3, 3.0, AMBER)

    d.txt((286, 428, 170, 12), "Auto-send grounded answers", size=5.4, color=INK)
    d.toggle(487, 428, on=True, w=24, h=12)
    d.txt((286, 440, 240, 10), "Off means every answer becomes a draft (R5).", size=4.6,
          color=FAINT)

    d.caps((556, 167, 200, 9), "Armed rules", size=4.6, color=FAINT, tracking=1.0)
    rules = [("R1", "asks for a human"), ("R2", "confidence < 50 or no chunk"),
             ("R3", "distress or judgment"), ("R4", "urgency \u2265 80"),
             ("R5", "channel is draft-only"), ("R6", "grounded \u00b7 confident"),
             ("R7", "classifier failed \u00b7 fail safe")]
    yy = 180.0
    for rule, cond in rules:
        on = rule in ("R1", "R2", "R3", "R4", "R6")
        if rule == "R2":
            d.rrect((552, yy - 3, 240, 18), r=5, fill=TINT)
        d.txt((560, yy, 22, 10), rule, size=4.8, color=TEAL if on else FAINT, bold=True)
        d.txt((586, yy, 138, 10), cond, size=4.8, color=INK if on else FAINT)
        if on:
            d.dot(772, yy + 4, 1.6, SIGNAL)
        yy += 19.0

    d.rrect((552, 330, 240, 106), r=10, fill=PAPER, line=LINE)
    d.caps((566, 340, 200, 9), "What a 49 looks like", size=4.6, color=RED_I, tracking=1.0)
    d.txt((566, 352, 212, 40),
          "Classifier returns confidence 49 with one weak chunk. The router takes R2 before it "
          "reads the reply.", size=4.9, color=MUTED, line=1.45)
    d.badge(566, 396, "escalated", "escalated", size=4.8, h=12)
    d.txt((630, 396, 150, 12), "0 auto-sends \u00b7 AT-06", size=4.6, color=FAINT)

    d.mark(278, 176, 1)
    d.mark(278, 268, 2)
    d.mark(552, 172, 3)
    d.mark(278, 428, 4)

    d.spec_strip(9, "Onboarding 3/4", "Where the\nhuman boundary is.", [
        ("Thresholds", "Two sliders, both explained by the rule they arm \u2014 not a settings dump."),
        ("Hard floor", "50 cannot be dragged: the UI says so instead of silently clamping."),
        ("Armed rules", "R1\u2013R4 and R6 on; R5 and R7 explained as conditional, never hidden."),
        ("Counterfactual", "The 49 card shows the exact failure the PRD tests for."),
    ], "/onboarding  \u2192  step 3", "components/onboarding/EscalationStep.tsx; "
       "lib/routing-engine.ts \u00b7 evaluateRoutingRules()")
    d.notes("This screen is the product's safety case made visible. A judge can see the floor, the "
            "urgency trigger and the armed rules on one panel, and the 49 card demonstrates rule R2 "
            "before they ever ask a question.")


def s_onboard_4(d):
    onboarding_shell(d, 3, "Where do messages\narrive?",
                     "Connect one channel to demo end-to-end. The rest declare an honest state.")
    cards = [
        ("whatsapp", "WhatsApp", "Cloud API \u00b7 shared number", "test", True, "2m ago"),
        ("instagram", "Instagram", "DM webhook \u00b7 sandbox", "draft", False, "no events"),
        ("gmail", "Gmail", "support@cloudpulse.in", "connected", True, "14m ago"),
        ("voice", "Sarvam voice", "shared virtual number", "connected", True, "yesterday"),
    ]
    for i, (kind, name, sub, state, on, last) in enumerate(cards):
        x = 286 + (i % 2) * 166
        y = 176 + (i // 2) * 118
        d.rrect((x, y, 158, 106), r=10, fill=PAPER, line=LINE)
        d.channel(x + 16, y + 18, kind, TEAL if kind != "voice" else DEEP, 6.2)
        d.txt((x + 28, y + 10, 100, 12), name, size=6.2, color=INK, bold=True)
        d.txt((x + 14, y + 30, 130, 10), sub, size=4.7, color=FAINT)
        d.badge(x + 14, y + 44, state if state != "draft" else "draft only",
                "test" if state == "test" else ("draft" if state == "draft" else "connected"),
                size=4.6, h=11.5)
        d.txt((x + 14, y + 62, 60, 10), "auto-send", size=4.6, color=FAINT)
        d.toggle(x + 62, y + 61, on=on, w=20, h=10.5)
        d.hline(x + 14, y + 80, 130, LINE2)
        d.txt((x + 14, y + 86, 84, 10), "Simulate inbound", size=4.5, color=TEAL)
        d.txt((x + 100, y + 86, 48, 10), last, size=4.2, color=FAINT, align="right")

    # compile card
    d.rrect((614, 176, 174, 140), r=12, fill=INK)
    d.caps((628, 188, 140, 9), "Ready to compile", size=4.5, color=MINT, tracking=1.1)
    d.serif((627, 200, 150, 40), "business_\nbrain.md", size=15.5, color=PAPER,
            tracking=-0.4, line=1.05)
    d.txt((628, 244, 148, 10), "v1  \u00b7  6 chunks  \u00b7  1,240 words", size=4.6,
          color="#A9C4BF")
    d.rrect((628, 258, 146, 3.4), r=1.7, fill="#2A514B")
    d.rrect((628, 258, 146, 3.4), r=1.7, fill=MINT)
    d.txt((628, 266, 148, 10), "indexed for retrieval", size=4.4, color="#A9C4BF")
    d.hline(628, 284, 146, "#2A514B")
    d.txt((628, 290, 148, 20), "Compiling replaces v1 and keeps the old chunks addressable.",
          size=4.3, color="#8FB2AC", line=1.4)

    d.pill((614, 326, 174, 26), "Compile & finish", fill=INK, ink=PAPER, size=5.6, dot=MINT)
    d.caps((614, 364, 160, 9), "Or start from a seeded business", size=4.4, color=FAINT,
           tracking=0.9)
    d.pill((614, 376, 174, 22), "CloudPulse CRM  \u00b7  SaaS", fill=PAPER, ink=INK, size=4.8,
           line=LINE)
    d.pill((614, 404, 174, 22), "Jaipur Smile Studio  \u00b7  clinic", fill=PAPER, ink=INK,
           size=4.8, line=LINE)
    for i, (label) in enumerate(("12 facts captured", "1 channel to demo", "brain compiles on save")):
        d.check(620, 440 + i * 12, SIGNAL, 2.6, 1.0)
        d.txt((628, 436 + i * 12, 160, 10), label, size=4.6, color=MUTED)

    d.mark(278, 176, 1)
    d.mark(444, 168, 2)
    d.mark(640, 168, 3, dark=True)
    d.mark(606, 376, 4)

    d.spec_strip(10, "Onboarding 4/4", "Channels, and\nan honest state.", [
        ("Truthful states", "connected, test mode, draft only, unavailable \u2014 never a fake "
         "green tick."),
        ("Per-channel send", "The auto-send toggle is what R5 reads; it is not decorative."),
        ("Simulator", "Every card can inject an inbound event, so AT-10 is demonstrable live."),
        ("Compile", "The one screen where the black pill finishes a flow."),
    ], "/onboarding  \u2192  step 4", "components/onboarding/ChannelCard.tsx; POST /api/businesses "
       "\u2192 compiles brain")
    d.notes("The last onboarding step hands the owner to the queue. Every channel card states what "
            "it really is: draft-only Instagram is amber, not green. The compile card is the only "
            "place the flow ends, and it shows what will be indexed.")


# ---------------------------------------------------------------------------------------------
# 11 — live queue
# ---------------------------------------------------------------------------------------------


def kpi(d, rect, label, value, foot, dark=False, donut=None):
    x, y, w, h = rect
    d.rrect(rect, r=12, fill=INK if dark else PAPER, line=None if dark else LINE)
    ink = PAPER if dark else INK
    d.caps((x + 14, y + 12, w - 28, 9), label, size=4.5, color=MINT if dark else FAINT,
           tracking=1.15)
    d.serif((x + 13, y + 21, 90, 34), value, size=23, color=ink, tracking=-1.0)
    d.txt((x + 14, y + h - 18, w - 28, 12), foot, size=4.7,
          color="#A9C4BF" if dark else MUTED, line=1.3)
    if donut is not None:
        d.arc_band(x + w - 30, y + 40, 16, -90, -90 + donut * 3.6, 5.2, SIGNAL)
        d.arc_band(x + w - 30, y + 40, 16, -90 + donut * 3.6, 270, 5.2, LINE2)


TICKETS = [
    ("whatsapp", "Aarav Mehta", "Where is my \u20b96,000 crown order?", "order_status", 71, "triaged", "2m", False),
    ("instagram", "Riya S.", "Is the \u20b9499 plan GST-inclusive?", "pricing_inquiry", 94, "replied", "4m", False),
    ("gmail", "Sameer K.", "Let me talk to a real human manager", "human_request", 12, "escalated", "6m", True),
    ("voice", "Neha Verma", "RCT price, and do you take UPI?", "pricing_inquiry", 88, "replied", "9m", False),
    ("whatsapp", "Karan D.", "Your app deleted my invoices!!", "technical_bug", 38, "escalated", "11m", False),
    ("gmail", "Divya R.", "Can I move Monday's appointment?", "reschedule", 46, "draft", "14m", False),
    ("instagram", "Arjun P.", "Does Pro include WhatsApp invoicing?", "plan_features", 91, "replied", "18m", False),
]


def conf_color(pct):
    return SIGNAL if pct >= 50 else (AMBER if pct >= 40 else RED)


def ticket_row(d, y, row, selected=False, lo=60.0, hi=588.0):
    kind, name, snippet, intent, conf, state, wait, urgent = row
    if selected:
        d.rrect((lo, y, hi - lo, 34), r=8, fill=TINT)
        d.vline(lo, y, 34, SIGNAL, 2.0)
    d.channel(lo + 18, y + 17, kind, TEAL if kind != "voice" else DEEP, 4.6)
    d.txt((lo + 32, y + 7, 110, 10), name, size=5.7, color=INK, bold=True)
    d.txt((lo + 32, y + 18, 116, 10), snippet, size=4.7, color=MUTED)
    d.txt((lo + 154, y + 12, 96, 10), intent, size=4.5, color=FAINT)
    d.txt((lo + 312, y + 8, 24, 10), str(conf), size=5.6, color=INK, bold=True)
    d.meter((lo + 312, y + 20, 34, 3), conf, conf_color(conf))
    d.badge(lo + 358, y + 10, state, state, size=4.6, h=11.5)
    d.txt((hi - 26, y + 12, 26, 10), wait, size=4.6, color=FAINT, align="right")
    if urgent:
        d.dot(lo + 8, y + 17, 1.8, RED)
    d.hline(lo, y + 34, hi - lo, LINE2)


def s_queue(d):
    d.ground(PAPER)
    d.nav_rail("queue")
    d.topbar()
    d.fitserif((CX, 54, 300, 30), "Live queue.", size=25, color=INK, tracking=-1.0)
    d.txt((CX + 1, 84, 340, 12), "42 open  \u00b7  6 need you  \u00b7  sorted by urgency, then age",
          size=5.4, color=MUTED)
    d.txt((560, 62, 236, 10), "last sync 2s ago  \u00b7  demo state", size=4.6, color=FAINT,
          align="right")
    d.pill((700, 76, 96, 18), "Realtime", fill=TINT, ink=TEAL, size=4.6, dot=SIGNAL)

    kpi(d, (60, 108, 176, 62), "Tickets today", "128", "+18 vs last Friday")
    kpi(d, (246, 108, 176, 62), "Auto-sent", "94", "R6 \u00b7 grounded and cited", donut=73)
    kpi(d, (432, 108, 176, 62), "Escalated", "12", "R2 \u00d77  \u00b7  R1 \u00d73  \u00b7  R4 \u00d72")
    d.rrect((618, 108, 178, 62), r=12, fill=INK)
    d.caps((632, 120, 120, 9), "First reply", size=4.5, color=MINT, tracking=1.15)
    d.serif((631, 129, 70, 26), "38s", size=21, color=PAPER, tracking=-0.8)
    d.txt((632, 152, 90, 10), "median \u00b7 7 days", size=4.6, color="#A9C4BF")
    d.poly([(700 + i * 6.2, 152 - v) for i, v in enumerate(
        [10, 7, 12, 5, 9, 6, 13, 4, 8, 3, 7, 2, 5])], MINT, 1.0)
    d.dot(700 + 12 * 6.2, 152 - 5, 1.4, MINT)

    chips = [("All", 38, True), ("New", 6, False), ("Triaged", 14, False),
             ("Escalated", 6, False), ("Replied", 9, False), ("Closed", 3, False)]
    x = 60.0
    widths = {"All": 40, "New": 38, "Triaged": 56, "Escalated": 64, "Replied": 52, "Closed": 44}
    for label, count, active in chips:
        d.chip((x, 184, widths[label], 19), label, active=active, size=4.8, count=count)
        x += widths[label] + 6

    d.rrect((520, 184, 132, 19), r=9.5, fill=PAPER, line=LINE)
    d.channel(530, 193.5, "search", FAINT, 3.4)
    d.txt((538, 184, 100, 19), "Search customer", size=4.6, color=FAINT, anchor="middle")
    d.pill((664, 184, 124, 19), "Urgency \u00b7 high first", fill=PAPER, ink=MUTED, size=4.5,
           line=LINE)

    # list
    d.caps((60, 216, 120, 9), "Customer", size=4.3, color=FAINT, tracking=1.0)
    d.caps((220, 216, 90, 9), "Intent", size=4.3, color=FAINT, tracking=1.0)
    d.caps((372, 216, 60, 9), "Conf", size=4.3, color=FAINT, tracking=1.0)
    d.caps((428, 216, 60, 9), "State", size=4.3, color=FAINT, tracking=1.0)
    d.caps((550, 216, 40, 9), "Wait", size=4.3, color=FAINT, tracking=1.0, align="right")
    y = 228.0
    for i, row in enumerate(TICKETS):
        ticket_row(d, y, row, selected=(i == 0))
        y += 36.0
    d.txt((60, y + 4, 300, 10), "Showing 7 of 42  \u00b7  one row per ticket, no cards inside cards",
          size=4.6, color=FAINT)

    # right column
    d.rrect((600, 212, 196, 112), r=10, fill=PAPER, line=LINE)
    d.caps((612, 222, 120, 9), "Decision mix", size=4.4, color=FAINT, tracking=1.0)
    angles = [(-90, 133, SIGNAL), (133, 198, TEAL), (198, 241, AMBER), (241, 270, RED)]
    for a0, a1, col in angles:
        d.wedge(650, 272, 16, 26, a0 + 1.5, a1 - 1.5, col)
    d.txt((632, 258, 36, 20), "42", size=8.0, color=INK, family=SERIF, anchor="middle",
          align="center")
    legend = [("R6 answered", "62%", SIGNAL), ("R5 draft", "18%", TEAL),
              ("R2 low conf", "12%", AMBER), ("R1/R4", "8%", RED)]
    for i, (label, pct, col) in enumerate(legend):
        yy = 238 + i * 19
        d.dot(690, yy + 3, 1.7, col)
        d.txt((698, yy - 3, 70, 10), label, size=4.6, color=INK)
        d.txt((760, yy - 3, 24, 10), pct, size=4.6, color=FAINT, align="right")

    d.rrect((600, 334, 196, 74), r=10, fill=PAPER, line=LINE)
    d.caps((612, 344, 140, 9), "Sentiment \u00b7 7 days", size=4.4, color=FAINT, tracking=1.0)
    segs = [("58", 58, SIGNAL), ("26", 26, "#9CC9C0"), ("12", 12, AMBER), ("4", 4, RED)]
    sx = 612.0
    for label, pct, col in segs:
        w = 172 * pct / 100.0 - 1.4
        d.rrect((sx, 356, max(1.6, w), 8), r=4, fill=col)
        sx += w + 1.4
    labels = [("positive", "58"), ("neutral", "26"), ("frustrated", "12"), ("distressed", "4")]
    for i, (label, val) in enumerate(labels):
        yy = 370 + (i // 2) * 14
        d.dot(614 + (i % 2) * 86, yy + 3, 1.5, [SIGNAL, "#9CC9C0", AMBER, RED][i])
        d.txt((621 + (i % 2) * 86, yy - 1, 54, 10), label, size=4.5, color=MUTED)
        d.txt((676 + (i % 2) * 86, yy - 1, 14, 10), val, size=4.5, color=INK, align="right")

    d.rrect((600, 418, 196, 74), r=10, fill=TINT)
    d.caps((612, 428, 160, 9), "Recurring this week", size=4.4, color=TEAL, tracking=1.0)
    d.txt((612, 438, 120, 22), "Refund policy", size=7.6, color=INK, bold=True)
    d.serif((740, 436, 44, 26), "\u00d711", size=17, color=TEAL, tracking=-0.6, align="right")
    d.txt((612, 458, 172, 26), "Same intent, eleven tickets. Grouped by intent and sentiment, "
          "not by channel.", size=4.6, color=TEAL, line=1.35)

    # markers
    d.mark(52, 108, 1)
    d.mark(52, 176, 2)
    d.mark(50, 228, 3)
    d.mark(592, 212, 4)

    d.spec_strip(11, "Dashboard \u00b7 queue", "The queue is\nthe product.", [
        ("KPI strip", "Four cards, one dark: the reference's bento, cut to what a triage owner asks."),
        ("Filters", "Status chips carry live counts; the count is the only number in the chip."),
        ("Row", "One repeating unit, 36pt tall: channel, name, intent, confidence, state, wait."),
        ("Mix & mood", "Routing mix, weekly sentiment and the recurring complaint in one column."),
    ], "/dashboard?tab=queue", "components/dashboard/LiveQueuePanel.tsx; TicketRow.tsx; "
       "DecisionMix.tsx", states="all \u00b7 new \u00b7 triaged \u00b7 replied \u00b7 escalated "
       "\u00b7 closed \u00b7 row selected \u00b7 empty")
    d.notes("The queue is the screen the judge sees most, so it carries the reference dashboard's "
            "structure: a bento KPI strip, a dense list with one repeating row, and a right column "
            "of small multiples. Confidence is the only number that changes colour.")


# ---------------------------------------------------------------------------------------------
# 12 — ticket detail + decision trace
# ---------------------------------------------------------------------------------------------


def s_ticket(d):
    d.ground(PAPER)
    d.nav_rail("queue")
    d.topbar()
    d.caps((60, 54, 260, 9), "Queue  /  tkt_cp_042  \u00b7  WhatsApp", size=4.6, color=FAINT,
           tracking=1.1)
    d.avatar(74, 84, 12, "AM", fill=TINT, ink=TEAL, size=6.0)
    d.txt((94, 72, 200, 12), "Aarav Mehta", size=7.6, color=INK, bold=True)
    d.txt((94, 85, 240, 10), "@aarav  \u00b7  +91 98123 45678  \u00b7  first contact", size=4.8,
          color=MUTED)
    d.badge(392, 74, "triaged", "triaged", size=4.6, h=12)
    d.badge(448, 74, "frustrated", "test", size=4.6, h=12)
    d.hline(60, 104, 440, LINE)

    # conversation
    d.rrect((60, 114, 306, 46), r=10, fill=WASH)
    d.txt((72, 122, 282, 30), "I ordered the ceramic crown last Tuesday and paid \u20b96,000. The "
          "tracking has not moved since.", size=5.2, color=INK, line=1.45)
    d.txt((72, 148, 120, 8), "Aarav  \u00b7  09:41", size=4.2, color=FAINT)

    d.rrect((140, 168, 360, 62), r=10, fill=PAPER, line=LINE)
    d.vline(140, 168, 62, SIGNAL, 2.2)
    d.caps((154, 176, 260, 8), "Ai draft  \u00b7  cites chk_cp_06", size=4.2, color=TEAL,
           tracking=1.0)
    d.txt((154, 188, 330, 38), "Your crown was dispatched on Tuesday and is with BlueDart \u2014 "
          "the tracking stops updating until the clinic scan is logged. It reaches you tomorrow "
          "before 6 PM.", size=5.2, color=INK, line=1.45)

    d.rrect((60, 238, 268, 34), r=10, fill=WASH)
    d.txt((72, 245, 246, 22), "ok \u2014 and does that include the follow-up visit?", size=5.2,
          color=INK, line=1.45)
    d.txt((72, 260, 120, 8), "Aarav  \u00b7  09:44", size=4.2, color=FAINT)

    d.caps((60, 286, 120, 9), "Reply", size=4.4, color=FAINT, tracking=1.0)
    d.rrect((60, 296, 440, 62), r=10, fill=PAPER, line=LINE)
    d.txt((72, 304, 400, 30), "Yes \u2014 the follow-up fitting is included in the \u20b96,000. "
          "Shall I book you for Saturday?", size=5.2, color=INK, line=1.45)
    d.hline(60, 328, 440, LINE2)
    d.pill((66, 334, 84, 18), "Approve & send", fill=INK, ink=PAPER, size=4.5)
    d.pill((156, 334, 58, 18), "Edit", fill=PAPER, ink=MUTED, size=4.5, line=LINE)
    d.txt((222, 334, 70, 18), "Escalate", size=4.5, color=RED_I, anchor="middle")
    d.txt((300, 334, 190, 18), "Adds one auto-send event, R6", size=4.3, color=FAINT,
          anchor="middle", align="right")

    # sources
    d.caps((60, 374, 100, 9), "Sources", size=4.4, color=FAINT, tracking=1.0)
    for i, (cid, section, text, score) in enumerate([
            ("chk_cp_06", "Delivery & dispatch", "Crowns ship BlueDart; tracking updates on clinic "
             "scan; next-day delivery.", "0.91"),
            ("chk_cp_02", "Products & pricing", "Ceramic crown \u20b96,000 incl. fitting and one "
             "follow-up.", "0.84")]):
        x = 60 + i * 224
        d.rrect((x, 386, 214, 76), r=10, fill=CARD, line=LINE)
        d.txt((x + 12, 396, 90, 10), cid, size=4.6, color=TEAL, bold=True)
        d.txt((x + 12, 406, 120, 10), section, size=4.5, color=INK)
        d.txt((x + 12, 418, 190, 30), text, size=4.5, color=MUTED, line=1.4)
        d.txt((x + 164, 396, 40, 10), score, size=4.5, color=FAINT, align="right")
    d.txt((60, 472, 440, 10), "Verbatim excerpt, never a paraphrase \u2014 AT-09 checks the id, "
          "not the wording.", size=4.4, color=FAINT)

    # decision trace
    d.rrect((516, 60, 280, 468), r=12, fill=CARD, line=LINE)
    d.caps((530, 72, 140, 9), "Decision trace", size=4.5, color=FAINT, tracking=1.1)
    d.txt((700, 72, 84, 9), "tkt_cp_042", size=4.4, color=FAINT, align="right")
    metrics = [("Confidence", 71, SIGNAL, "\u2265 50 \u00b7 one verified chunk"),
               ("Urgency", 62, AMBER, "< 80 \u00b7 no R4"),
               ("Sentiment", None, None, "frustrated \u00b7 not distressed"),
               ("Intent", None, None, "delivery_status \u00b7 sales")]
    y = 86.0
    for label, pct, col, note in metrics:
        d.txt((530, y, 70, 10), label, size=4.8, color=MUTED)
        if pct is not None:
            d.txt((662, y - 1, 26, 10), str(pct), size=6.0, color=INK, bold=True, align="right")
            d.meter((530, y + 10, 158, 3), pct, col)
            d.txt((694, y, 90, 10), note, size=4.3, color=FAINT)
            y += 26
        else:
            d.txt((662, y - 1, 122, 10), note, size=4.6, color=INK, align="right")
            d.hline(530, y + 13, 254, LINE2)
            y += 24

    d.caps((530, 198, 160, 9), "Routing \u00b7 first match wins", size=4.5, color=FAINT,
           tracking=1.05)
    chain = [("R1", "customer asked for a human", "no"), ("R2", "confidence < 50 or no chunk", "no"),
             ("R3", "distress or human judgment", "no"), ("R4", "urgency \u2265 80", "no"),
             ("R5", "channel is draft-only", "no"), ("R6", "grounded \u00b7 confident", "YES")]
    yy = 210.0
    for i, (rule, cond, verdict) in enumerate(chain):
        hit = verdict == "YES"
        d.txt((530, yy, 22, 10), rule, size=4.5, color=TEAL if hit else FAINT, bold=True)
        d.txt((556, yy, 150, 10), cond, size=4.6, color=INK if hit else MUTED)
        if hit:
            d.rrect((712, yy - 2, 56, 13), r=6.5, fill=TINT)
            d.txt((712, yy - 2, 56, 13), "answered", size=4.2, color=TEAL, bold=True,
                  anchor="middle", align="center")
        else:
            d.txt((744, yy, 24, 10), verdict, size=4.3, color=FAINT, align="right")
        if i < len(chain) - 1:
            d.vline(536, yy + 11, 6, LINE)
        yy += 17.0

    d.hline(530, yy + 4, 254, LINE2)
    d.txt((530, yy + 10, 254, 10), "Action", size=4.5, color=FAINT)
    d.badge(530, yy + 20, "answered", "answered", size=4.6, h=12)
    d.txt((584, yy + 20, 60, 12), "R6", size=5.0, color=TEAL, bold=True)
    d.txt((614, yy + 20, 140, 12), "auto-send allowed", size=4.5, color=MUTED)

    d.rrect((530, 400, 254, 1), r=0, fill=LINE2)
    d.caps((530, 410, 200, 9), "Sarvam / queue contract", size=4.4, color=FAINT, tracking=1.0)
    d.txt((530, 420, 254, 24), "POST /api/businesses/[id]/tickets \u2192 state, actionStatus, "
          "routingRuleHit", size=4.5, color=MUTED, line=1.4)
    d.pill((530, 452, 112, 20), "Approve & send", fill=INK, ink=PAPER, size=4.6)
    d.pill((648, 452, 62, 20), "Assign", fill=PAPER, ink=MUTED, size=4.6, line=LINE)
    d.pill((716, 452, 68, 20), "Resolve", fill=PAPER, ink=MUTED, size=4.6, line=LINE)
    d.txt((530, 478, 254, 10), "Escalated tickets get the same three actions, plus a reason field.",
          size=4.4, color=FAINT)

    d.mark(52, 72, 1)
    d.mark(52, 296, 2)
    d.mark(52, 386, 3)
    d.mark(508, 60, 4)

    d.spec_strip(12, "Dashboard \u00b7 ticket", "One ticket,\nthe whole chain.", [
        ("Conversation", "Customer and draft share one thread; the draft is the only teal edge."),
        ("Composer", "Approve & send is black because it is the irreversible action."),
        ("Sources", "Chunk id, section, excerpt, score \u2014 the citation the API returns."),
        ("Trace", "Every rule is listed with its verdict, so R6 is shown, not implied."),
    ], "/dashboard?tab=queue  \u2192  drawer", "components/dashboard/TicketDetailDrawer.tsx; "
       "SourceCard.tsx; RuleChain.tsx")
    d.notes("The drawer answers the question a judge asks next: why did the machine decide that? "
            "Rules R1 to R6 are listed with their verdicts, the confidence and urgency meters are "
            "adjacent, and the cited chunks sit under the composer they justify.")


# ---------------------------------------------------------------------------------------------
# 13 — text agent modal
# ---------------------------------------------------------------------------------------------


def faint_queue(d):
    """The queue, one layer back: same geometry, no contrast. No alpha in the format, so the
    dimming is done by drawing the lower layer in wash-on-wash."""
    d.ground(WASH)
    d.rrect((0, 0, NAV_W, PAGE_H), r=0, fill=WASH)
    d.vline(NAV_W - 0.8, 0, PAGE_H, "#E7E7E0")
    d.rrect((NAV_W, 0, SR_W - NAV_W, TOP_H), r=0, fill=WASH)
    d.hline(NAV_W, TOP_H - 0.8, SR_W - NAV_W, "#E7E7E0")
    d.txt((CX - 4, 12, 200, 18), "CloudPulse CRM", size=6.4, color="#C4C4BD", bold=True)
    d.pill((CR - 150, 9, 122, 23), "Test my AI agent", fill="#E4E4DD", ink="#B9B9B2", size=5.6)
    d.serif((CX, 54, 300, 30), "Live queue.", size=25, color="#CFCFC8", tracking=-1.0)
    for i, row in enumerate(TICKETS[:5]):
        y = 132 + i * 36
        kind, name, snippet, intent, conf, state, wait, urgent = row
        d.channel(CX + 18, y + 17, kind, "#D2D2CB", 4.6)
        d.txt((CX + 32, y + 7, 110, 10), name, size=5.7, color="#C4C4BD", bold=True)
        d.txt((CX + 32, y + 18, 150, 10), snippet, size=4.7, color="#D2D2CB")
        d.txt((CX + 322, y + 8, 24, 10), str(conf), size=5.6, color="#C4C4BD", bold=True)
        d.meter((CX + 322, y + 20, 34, 3), conf, "#DCDCD6")
        d.hline(CX, y + 34, 528, "#E7E7E0")


def s_text_modal(d):
    faint_queue(d)
    # the modal sits on a paper card with a second card peeking out as its shadow
    d.rrect((200, 66, 424, 412), r=16, fill="#E9E9E2")
    d.rrect((196, 60, 424, 412), r=16, fill=PAPER, line=LINE)

    d.caps((216, 74, 200, 9), "Test my AI agent", size=4.6, color=TEAL, tracking=1.2)
    d.serif((215, 84, 300, 26), "Ask what a judge asks.", size=17, color=INK, tracking=-0.5)
    d.txt((600, 76, 10, 10), "\u00d7", size=8.0, color=FAINT, align="right")

    d.rrect((216, 118, 384, 48), r=10, fill=WASH)
    d.caps((228, 126, 200, 8), "Customer query  \u00b7  TEXT_MODAL", size=4.2, color=FAINT,
           tracking=1.0)
    d.txt((228, 138, 360, 24), "\u201cWhat is the price of the Pro Plan and does it include "
          "WhatsApp invoicing?\u201d", size=5.6, color=INK, line=1.4)
    d.pill((216, 174, 88, 22), "Run query", fill=INK, ink=PAPER, size=5.0)
    d.pill((310, 174, 92, 22), "\u21ba Run again", fill=PAPER, ink=MUTED, size=5.0, line=LINE)
    d.txt((540, 174, 60, 22), "judge@sphinx", size=4.2, color=FAINT, anchor="middle",
          align="right")

    d.hline(216, 208, 384, LINE2)

    # result
    d.caps((216, 218, 120, 8), "Result  \u00b7  tkt_991", size=4.2, color=FAINT, tracking=1.0)
    d.badge(216, 230, "sales", "triaged", size=4.4, h=11.5)
    d.badge(266, 230, "pricing_inquiry", "new", size=4.4, h=11.5)
    d.badge(356, 230, "conf 94", "answered", size=4.4, h=11.5)
    d.badge(416, 230, "urg 20", "closed", size=4.4, h=11.5)
    d.pill((476, 229, 60, 13), "R6", fill=INK, ink=PAPER, size=4.4)
    d.badge(544, 230, "answered", "answered", size=4.4, h=11.5)

    d.txt((216, 250, 368, 40),
          "The Pro Plan is \u20b91,499/month and includes up to 5 users, WhatsApp invoicing and "
          "GST API access.", size=6.0, color=INK, line=1.5)
    d.txt((216, 286, 368, 10), "autoSend true  \u00b7  channel TEXT_MODAL  \u00b7  1 verified chunk "
          "cited", size=4.4, color=TEAL)

    d.caps((216, 302, 200, 8), "Sources  \u00b7  expandable", size=4.2, color=FAINT,
           tracking=1.0)
    for i, (cid, section, excerpt, score) in enumerate([
            ("chk_cp_02", "Products & pricing", "Pro Plan: \u20b91,499/mo (5 users, WhatsApp "
             "invoicing, API access).", "0.93"),
            ("chk_cp_05", "Plan comparison", "Starter \u20b9499 \u00b7 1 user. Pro \u20b91,499 "
             "\u00b7 5 users.", "0.71")]):
        x = 216 + i * 194
        d.rrect((x, 314, 186, 70), r=8, fill=CARD, line=LINE)
        d.txt((x + 10, 322, 80, 10), cid, size=4.4, color=TEAL, bold=True)
        d.txt((x + 10, 332, 110, 10), section, size=4.3, color=INK)
        d.txt((x + 10, 344, 166, 32), excerpt, size=4.3, color=MUTED, line=1.35)
        d.txt((x + 146, 322, 30, 10), score, size=4.2, color=FAINT, align="right")

    d.hline(216, 396, 384, LINE2)
    d.txt((216, 404, 240, 10), "Every run writes a ticket and a TicketEvent trace.", size=4.5,
          color=FAINT)
    d.pill((504, 400, 96, 20), "Open ticket", fill=PAPER, ink=TEAL, size=4.6, line=TINT)

    d.mark(208, 118, 1)
    d.mark(208, 230, 2)
    d.mark(208, 314, 3)
    d.mark(188, 60, 4)

    d.spec_strip(13, "Dashboard \u00b7 test modal", "The judge's\nfirst question.", [
        ("Payload", "The exact POST body from the PRD \u2014 query, handle, channel, businessId."),
        ("Verdict row", "Specialist, intent, confidence, urgency, rule, action: six chips, one line."),
        ("Sources", "Two-up, expandable, scored. Empty state is a red R2, never a blank card."),
        ("Persistence", "A run is a ticket: it appears in the queue behind the modal."),
    ], "POST /api/ai/text-query", "components/dashboard/AiTextModal.tsx; VerdictChips.tsx; "
       "SourceCard.tsx", states="idle \u00b7 running \u00b7 answered \u00b7 draft \u00b7 "
       "escalated \u00b7 failed (R7)")
    d.notes("The modal exists for the judge, so it shows the whole contract in one card: the exact "
            "request, the six-field verdict, and the cited chunks. The queue behind it is drawn "
            "without contrast \u2014 a scrim in spirit, honest about the format's limits.")


# ---------------------------------------------------------------------------------------------
# 14 — voice
# ---------------------------------------------------------------------------------------------


def s_voice(d):
    d.ground(PAPER)
    d.nav_rail("voice")
    d.topbar(cta="Test my AI agent")
    d.fitserif((CX, 54, 320, 30), "Call me now.", size=25, color=INK, tracking=-1.0)
    d.txt((CX + 1, 84, 360, 12), "One shared number \u00b7 context injected per call", size=5.4,
          color=MUTED)
    d.pill((700, 76, 96, 18), "02:41 live", fill=TINT, ink=TEAL, size=4.6, dot=SIGNAL)

    d.field((60, 112, 320, 24), "Business", "CloudPulse CRM", size=5.4, trailing="\u25be")
    d.field((60, 156, 320, 24), "Verified callback number", "+91 98123 45678", size=5.4)
    d.pill((60, 194, 320, 28), "Call me now", fill=INK, ink=PAPER, size=6.0, dot=MINT)
    d.txt((60, 228, 320, 10), "Sarvam dials this number and reads the four-digit session pin "
          "aloud.", size=4.6, color=FAINT)

    # stepper
    states = [("Initiated", "14:02:11", True), ("Ringing", "14:02:19", True),
              ("In progress", "14:02:31", "live"), ("Completed", "\u2014", False)]
    y = 258.0
    for i, (name, time, state) in enumerate(states):
        col = TEAL if state is True else (SIGNAL if state == "live" else LINE)
        if state is True:
            d.dot(70, y + 6, 6.4, TEAL)
            d.check(70, y + 6, PAPER, 2.6, 1.0)
        elif state == "live":
            d.dot(70, y + 6, 6.4, SIGNAL)
            d.dot(70, y + 6, 2.4, PAPER)
        else:
            d.dot(70, y + 6, 6.2, PAPER)
            d.dot(70, y + 6, 5.8, LINE)
        if i < 3:
            d.vline(69.5, y + 13, 26, LINE)
        d.txt((84, y - 1, 150, 12), name, size=6.0, color=INK if state else FAINT, bold=bool(state))
        d.txt((84, y + 10, 200, 10), ["validated ownership", "Sarvam accepted the call",
               "agent grounded in 6 chunks", "transcript saves on hang-up"][i], size=4.4,
              color=FAINT)
        d.txt((330, y, 50, 10), time, size=4.6, color=FAINT, align="right")
        y += 38.0

    # pin
    d.rrect((60, 408, 152, 90), r=12, fill=TINT)
    d.caps((74, 418, 120, 9), "Fallback pin", size=4.4, color=TEAL, tracking=1.1)
    d.serif((73, 428, 120, 40), "4821", size=30, color=TEAL, tracking=-1.6)
    d.txt((74, 470, 126, 20), "read it to the agent if\ncontext is missing", size=4.4, color=TEAL,
          line=1.35)
    d.txt((60, 506, 152, 10), "expires in 09:41", size=4.4, color=FAINT)

    # transcript
    d.rrect((400, 96, 396, 246), r=12, fill=CARD, line=LINE)
    d.caps((416, 108, 200, 9), "Live transcript  \u00b7  vsess_7721", size=4.5, color=FAINT,
           tracking=1.0)
    d.badge(716, 105, "in progress", "live", size=4.4, h=12)
    turns = [("ai", "AfterSales, CloudPulse support \u2014 how can I help?", "14:02:36"),
             ("caller", "What does the Pro plan cost?", "14:02:39"),
             ("ai", "Pro is \u20b91,499 a month for five users, and it includes WhatsApp "
              "invoicing.", "14:02:44"),
             ("caller", "Okay. What is your refund policy for annual billing?", "14:02:51")]
    y = 124.0
    for who, text, time in turns:
        ai = who == "ai"
        d.avatar(428, y + 9, 8.5, "a" if ai else "AM", fill=DEEP if ai else WASH,
                 ink=MINT if ai else MUTED, size=5.0)
        d.txt((444, y + 1, 200, 10), "Agent" if ai else "Caller", size=4.6, color=FAINT)
        d.txt((484, y + 1, 60, 10), time, size=4.2, color=FAINT)
        d.txt((444, y + 12, 330, 26), text, size=5.2, color=INK, line=1.45)
        y += 54.0

    d.rrect((400, 356, 190, 92), r=10, fill=PAPER, line=LINE)
    d.caps((414, 366, 160, 9), "Outcome", size=4.4, color=FAINT, tracking=1.0)
    d.txt((414, 376, 160, 20), "resolved_by_ai", size=6.4, color=INK, bold=True)
    d.txt((414, 394, 160, 10), "duration 01:12  \u00b7  no escalation", size=4.5, color=MUTED)
    d.badge(414, 410, "completed", "answered", size=4.4, h=11.5)
    d.txt((414, 428, 160, 10), "AT-04: business A and B differ", size=4.3, color=FAINT)

    d.rrect((600, 356, 196, 92), r=10, fill=INK)
    d.caps((614, 366, 160, 9), "Sarvam context", size=4.4, color=MINT, tracking=1.0)
    d.txt((614, 376, 168, 44), "PER_CALL_VARIABLES\nsessionId  vsess_7721\ndemoPin  4821  \u00b7  "
          "businessId  biz_cp_01", size=4.3, color="#C7DCD8", line=1.45)
    d.txt((614, 424, 168, 20), "tool-search resolves the pin to a business, never to a prompt.",
          size=4.2, color="#8FB2AC", line=1.35)

    d.mark(52, 112, 1)
    d.mark(52, 258, 2)
    d.mark(52, 408, 3)
    d.mark(592, 356, 4, dark=True)

    d.spec_strip(14, "Dashboard \u00b7 voice", "Proof that the\nvoice is this business.", [
        ("Number + pin", "The pin is the join key between the call and the tenant; it is huge."),
        ("Stepper", "Four states from the PRD, each with the sentence that explains it."),
        ("Transcript", "Agent and caller, timed; it arrives by webhook, not by polling."),
        ("Context", "The mechanism is printed on screen \u2014 judges test exactly this."),
    ], "/dashboard?tab=voice", "components/dashboard/VoiceTestPanel.tsx; CallStepper.tsx; "
       "POST /api/voice/start-session", states="initiated \u00b7 ringing \u00b7 in progress "
       "\u00b7 completed \u00b7 failed \u00b7 pin expired")
    d.notes("Voice is the demo moment. The screen has to prove two things at once: that the call is "
            "live (stepper, transcript) and that it is grounded in the right tenant (pin, business, "
            "chunk count). Same layout at 9:16 collapses to one column with the pin on top.")


# ---------------------------------------------------------------------------------------------
# 15 — brain & insights
# ---------------------------------------------------------------------------------------------


def s_brain(d):
    d.ground(PAPER)
    d.nav_rail("brain")
    d.topbar()
    d.fitserif((CX, 54, 320, 30), "Business brain.", size=25, color=INK, tracking=-1.0)
    d.txt((CX + 1, 84, 380, 12), "6 chunks  \u00b7  1,240 words  \u00b7  v1 compiled 12 minutes ago",
          size=5.4, color=MUTED)
    d.pill((700, 76, 96, 18), "v1 \u00b7 live", fill=TINT, ink=TEAL, size=4.6, dot=SIGNAL)

    d.caps((60, 112, 90, 9), "Chunk", size=4.4, color=FAINT, tracking=1.05)
    d.caps((150, 112, 140, 9), "Section", size=4.4, color=FAINT, tracking=1.05)
    d.caps((342, 112, 40, 9), "Words", size=4.4, color=FAINT, tracking=1.05, align="right")
    d.caps((410, 112, 40, 9), "Score", size=4.4, color=FAINT, tracking=1.05, align="right")
    chunks = [("chk_cp_01", "Products & pricing", "210", 0.94), ("chk_cp_02", "Pricing FAQ", "90", 0.88),
              ("chk_cp_03", "Hours & holidays", "70", 0.81), ("chk_cp_04", "Return policy", "180", 0.90),
              ("chk_cp_05", "Technical FAQ", "240", 0.76), ("chk_cp_06", "Delivery & dispatch", "160", 0.84)]
    y = 126.0
    for cid, section, words, score in chunks:
        d.txt((60, y, 80, 10), cid, size=4.6, color=TEAL, bold=True)
        d.txt((150, y, 180, 10), section, size=4.8, color=INK)
        d.txt((342, y, 40, 10), words, size=4.6, color=MUTED, align="right")
        d.txt((396, y, 24, 10), f"{score:.2f}", size=4.6, color=INK, align="right")
        d.meter((428, y + 3, 42, 3), score * 100, SIGNAL)
        d.hline(60, y + 16, 410, LINE2)
        y += 26.0

    d.rrect((60, 306, 410, 62), r=10, fill=WASH)
    d.txt((74, 316, 240, 12), "business_brain.md  \u00b7  v1", size=5.8, color=INK, bold=True)
    d.txt((74, 330, 300, 10), "Recompiled on every save. Old chunk ids stay addressable so a "
          "citation never dangles.", size=4.5, color=MUTED)
    d.meter((74, 348, 260, 3.4), 100, SIGNAL)
    d.txt((344, 342, 112, 12), "indexed 6 / 6", size=4.4, color=TEAL, align="right")
    d.pill((60, 380, 84, 20), "Edit markdown", fill=PAPER, ink=INK, size=4.6, line=LINE)
    d.pill((150, 380, 74, 20), "Re-compile", fill=PAPER, ink=MUTED, size=4.6, line=LINE)
    d.txt((60, 408, 410, 10), "The file is the source of truth; the chunks are derived, never "
          "edited by hand.", size=4.4, color=FAINT)

    # insights
    d.rrect((490, 96, 306, 136), r=12, fill=PAPER, line=LINE)
    d.caps((504, 106, 200, 9), "Sentiment this week", size=4.5, color=FAINT, tracking=1.05)
    d.pill((700, 102, 82, 16), "Week 44 \u00b7 96", fill=WASH, ink=MUTED, size=4.2)
    segs = [("positive", 58, SIGNAL), ("neutral", 26, "#9CC9C0"), ("frustrated", 12, AMBER),
            ("distressed", 4, RED)]
    sx = 504.0
    for label, pct, col in segs:
        w = 278 * pct / 100.0 - 1.6
        d.rrect((sx, 126, max(1.6, w), 10), r=5, fill=col)
        sx += w + 1.6
    for i, (label, pct, col) in enumerate(segs):
        yy = 150 + (i // 2) * 22
        d.dot(506 + (i % 2) * 142, yy + 4, 1.8, col)
        d.txt((514 + (i % 2) * 142, yy, 70, 10), label, size=4.6, color=MUTED)
        d.txt((576 + (i % 2) * 142, yy, 30, 10), f"{pct}%", size=4.8, color=INK, bold=True,
              align="right")
    d.txt((504, 200, 278, 24), "Tickets counted once by their first sentiment \u2014 a reply does "
          "not vote twice.", size=4.3, color=FAINT, line=1.35)

    d.rrect((490, 244, 306, 152), r=12, fill=PAPER, line=LINE)
    d.caps((504, 254, 220, 9), "Recurring complaints  \u00b7  by intent", size=4.5, color=FAINT,
           tracking=1.05)
    rec = [("refund_policy", 11, 100), ("delivery_eta", 8, 72), ("gst_invoice", 5, 45),
           ("reschedule", 4, 36)]
    yy = 272.0
    for name, count, pct in rec:
        d.txt((504, yy, 120, 10), name, size=4.8, color=INK)
        d.txt((620, yy, 24, 10), f"\u00d7{count}", size=4.8, color=TEAL, bold=True)
        d.meter((504, yy + 12, 278, 3), pct, SIGNAL if count > 5 else "#B9DCD4")
        yy += 30.0
    d.txt((504, 374, 278, 10), "GET /api/businesses/[id]/insights groups by intent, then "
          "sentiment.", size=4.3, color=FAINT)

    d.rrect((490, 408, 306, 88), r=12, fill=TINT)
    d.caps((504, 418, 200, 9), "Top intent this week", size=4.4, color=TEAL, tracking=1.05)
    d.serif((503, 428, 200, 30), "refund_policy", size=17, color=TEAL, tracking=-0.5)
    d.txt((504, 454, 190, 22), "\u00d711  \u00b7  26% of volume  \u00b7  8 answered, 3 escalated",
          size=4.6, color=TEAL)
    d.badge(700, 448, "answered", "answered", size=4.4, h=11.5)

    d.mark(52, 112, 1)
    d.mark(52, 306, 2)
    d.mark(482, 96, 3)
    d.mark(482, 244, 4)

    d.spec_strip(15, "Dashboard \u00b7 brain", "The file is real,\nand countable.", [
        ("Chunk table", "Id, section, words, score: the rows the retriever actually ranks."),
        ("Compile card", "Version, word count and the index meter, in one line a judge can read."),
        ("Sentiment", "Stacked bar, four buckets, counted once per ticket."),
        ("Recurring", "The bonus twist: the same complaint as a number, not a feeling."),
    ], "/dashboard?tab=brain", "components/dashboard/BrainInsightsPanel.tsx; ChunkTable.tsx; "
       "GET /api/businesses/[id]/insights")
    d.notes("The brain panel is where the abstraction becomes inspectable: six chunks with ids, "
            "word counts and retrieval scores, plus the weekly rollup. The chunk ids here are the "
            "same ids the ticket drawer cites.")


# ---------------------------------------------------------------------------------------------
# 16 — channels
# ---------------------------------------------------------------------------------------------


def s_channels(d):
    d.ground(PAPER)
    d.nav_rail("channels")
    d.topbar()
    d.fitserif((CX, 54, 300, 30), "Channels.", size=25, color=INK, tracking=-1.0)
    d.txt((CX + 1, 84, 400, 12), "Four ways in  \u00b7  one honest state each  \u00b7  every one "
          "simulatable", size=5.4, color=MUTED)

    cards = [
        ("whatsapp", "WhatsApp", "connected", "/api/channels/webhook/whatsapp", True,
         "inbound 2m ago  \u00b7  14 today"),
        ("instagram", "Instagram DM", "draft", "/api/channels/webhook/instagram", False,
         "sandbox  \u00b7  auto-send off (R5)"),
        ("gmail", "Gmail", "connected", "/api/channels/webhook/gmail", True,
         "inbound 14m ago  \u00b7  9 today"),
        ("voice", "Sarvam voice", "connected", "/api/voice/sarvam-webhook", True,
         "call completed  \u00b7  yesterday"),
    ]
    for i, (kind, name, state, path, on, meta) in enumerate(cards):
        x = 60 + (i % 2) * 240
        y = 100 + (i // 2) * 116
        d.rrect((x, y, 228, 104), r=12, fill=PAPER, line=LINE)
        d.channel(x + 18, y + 20, kind, TEAL if kind != "voice" else DEEP, 6.4)
        d.txt((x + 32, y + 10, 120, 12), name, size=6.4, color=INK, bold=True)
        d.badge(x + 14, y + 34, "draft only" if state == "draft" else state,
                "draft" if state == "draft" else "connected", size=4.4, h=11.5)
        d.txt((x + 14, y + 52, 70, 10), "auto-send", size=4.4, color=FAINT)
        d.toggle(x + 60, y + 51, on=on, w=20, h=10.5)
        d.hline(x + 14, y + 68, 200, LINE2)
        d.txt((x + 14, y + 74, 130, 10), path, size=4.1, color=TEAL)
        d.txt((x + 14, y + 86, 200, 10), meta, size=4.2, color=FAINT)
        d.pill((x + 148, y + 50, 66, 17), "Simulate \u2192", fill=PAPER, ink=MUTED, size=4.1,
               line=LINE)

    # idempotency
    d.rrect((548, 100, 248, 104), r=12, fill=INK)
    d.caps((562, 110, 200, 9), "Idempotency  \u00b7  AT-10", size=4.4, color=MINT, tracking=1.05)
    d.txt((562, 122, 220, 12), "The same webhook, twice", size=6.2, color=PAPER, bold=True)
    d.txt((562, 138, 220, 10), "externalMessageId  wamid.HBgM", size=4.2, color="#A9C4BF")
    d.txt((562, 150, 220, 10), "externalMessageId  wamid.HBgM", size=4.2, color="#A9C4BF")
    d.hline(562, 164, 220, "#2A514B")
    d.txt((562, 170, 140, 10), "1 ticket  \u00b7  1 decision", size=5.2, color=MINT, bold=True)
    d.txt((562, 184, 220, 10), "Second event is dropped before routing.", size=4.2,
          color="#8FB2AC")

    # simulator
    d.rrect((548, 216, 248, 104), r=12, fill=PAPER, line=LINE)
    d.caps((562, 226, 200, 9), "Webhook simulator", size=4.4, color=FAINT, tracking=1.05)
    for i, (label) in enumerate(("WhatsApp", "Instagram", "Gmail")):
        active = i == 0
        d.chip((562 + i * 58, 238, 54, 18), label, active=active, size=4.2)
    d.rrect((562, 264, 220, 24), r=6, fill=WASH)
    d.txt((570, 264, 200, 24), "POST /api/channels/webhook/whatsapp", size=4.1, color=MUTED,
          anchor="middle")
    d.pill((562, 294, 90, 18), "Fire event", fill=INK, ink=PAPER, size=4.4, dot=MINT)
    d.txt((660, 294, 122, 18), "runs the full pipeline", size=4.1, color=FAINT, anchor="middle")

    # readiness
    d.rrect((548, 332, 248, 170), r=12, fill=PAPER, line=LINE)
    d.caps((562, 342, 200, 9), "Readiness", size=4.4, color=FAINT, tracking=1.05)
    checks = [("One channel can demo end-to-end", True), ("Draft-only is labelled amber", True),
              ("Duplicate payload is dropped", True), ("Every path is real or says it is not", True),
              ("No secret in the client bundle", True)]
    yy = 358.0
    for label, on in checks:
        d.check(566, yy + 4, SIGNAL, 2.6, 1.0)
        d.txt((576, yy, 210, 10), label, size=4.5, color=INK)
        yy += 18.0
    d.txt((562, 462, 220, 30), "Status is derived from the adapter, never written by hand \u2014 "
          "a dead channel cannot show green.", size=4.2, color=FAINT, line=1.35)

    # event log
    d.caps((60, 334, 200, 9), "Event log  \u00b7  last five", size=4.5, color=FAINT, tracking=1.05)
    events = [("14:07:02", "INBOUND_RECEIVED", "whatsapp  \u00b7  wamid.HBgM", "new"),
              ("14:07:03", "RAG_RETRIEVED", "chk_cp_06  \u00b7  score 0.91", "new"),
              ("14:07:03", "ROUTING_DECIDED", "R6  \u00b7  conf 71  \u00b7  urgency 62", "new"),
              ("14:07:04", "DRAFT_SAVED", "awaiting owner approval", "draft"),
              ("14:06:41", "ESCALATED", "R1  \u00b7  human requested", "escalated")]
    yy = 348.0
    for time, event, detail, state in events:
        d.txt((60, yy, 40, 10), time, size=4.3, color=FAINT)
        d.txt((104, yy, 108, 10), event, size=4.4, color=INK, bold=True)
        d.txt((216, yy, 200, 10), detail, size=4.3, color=MUTED)
        d.badge(400, yy - 2, state, state, size=4.0, h=10.5)
        d.hline(60, yy + 14, 468, LINE2)
        yy += 26.0
    d.txt((60, 486, 468, 10), "TicketEvent is append-only; the drawer's trace reads this table.",
          size=4.3, color=FAINT)

    d.mark(52, 100, 1)
    d.mark(540, 100, 2, dark=True)
    d.mark(540, 332, 3)
    d.mark(52, 334, 4)

    d.spec_strip(16, "Dashboard \u00b7 channels", "Truthful\nconnection state.", [
        ("Status", "Connected is green, draft-only is amber, unavailable is grey \u2014 and derived."),
        ("Per-channel", "Auto-send is the field routing-engine reads for R5."),
        ("Idempotency", "The duplicate test is on screen: same id, one ticket."),
        ("Event log", "The append-only trace the drawer's rule chain is built from."),
    ], "/dashboard?tab=channels", "components/dashboard/ChannelsPanel.tsx; ChannelCard.tsx; "
       "POST /api/channels/webhook/[provider]", states="connected \u00b7 test mode \u00b7 draft "
       "only \u00b7 unavailable \u00b7 duplicate dropped")
    d.notes("Channels is the honesty screen. Every card shows what the adapter really supports, the "
            "idempotency test is visible rather than described, and the event log is the same "
            "TicketEvent table the trace panel reads.")


# ---------------------------------------------------------------------------------------------
# 17 — states & layout
# ---------------------------------------------------------------------------------------------


def s_states(d):
    d.ground(WASH)
    d.caps((56, 44, 300, 10), "System  \u00b7  states & layout", size=5.0, color=FAINT,
           tracking=1.3)
    d.fitserif((55, 56, 560, 34), "Four states, or it is not built.", size=27, color=INK,
               tracking=-1.1)
    d.txt((57, 90, 520, 16), "Every async surface has an empty, a loading, a failed and a success "
          "state. R7 is the failed one.", size=5.6, color=MUTED, line=1.5)

    # row A - the three async states
    cards = [
        ("Empty", "No tickets yet", "A webhook or a test run creates the first one.", "empty"),
        ("Loading", "Fetching the queue", "Skeleton rows, same 36pt rhythm as the real list.",
         "loading"),
        ("Failed  \u00b7  R7", "Classifier unavailable", "Nothing was sent. The ticket is failed.",
         "error"),
    ]
    for i, (title, head, body, kind) in enumerate(cards):
        x = 56 + i * 250
        d.rrect((x, 108, 240, 150), r=12, fill=PAPER, line=LINE)
        d.caps((x + 14, 118, 200, 9), title, size=4.4,
               color=RED_I if kind == "error" else FAINT, tracking=1.05)
        if kind == "empty":
            d.dot(x + 32, 156, 12, WASH)
            d.glyph(x + 32, 156, "queue", FAINT)
            d.txt((x + 52, 144, 160, 12), head, size=6.2, color=INK, bold=True)
            d.txt((x + 52, 156, 160, 20), body, size=4.5, color=MUTED, line=1.4)
            d.pill((x + 52, 182, 96, 20), "Test my AI agent", fill=INK, ink=PAPER, size=4.4)
            d.txt((x + 14, 226, 210, 20), "One line of copy, one action \u2014 never a shrug.",
                  size=4.3, color=FAINT, line=1.35)
        elif kind == "loading":
            d.txt((x + 14, 140, 190, 12), head, size=6.2, color=INK, bold=True)
            d.txt((x + 14, 152, 200, 10), body, size=4.5, color=MUTED)
            for j in range(3):
                yy = 172 + j * 18
                d.dot(x + 22, yy + 5, 4.2, LINE2)
                d.rrect((x + 32, yy, 78, 5), r=2.5, fill=LINE2)
                d.rrect((x + 118, yy, 42, 5), r=2.5, fill=LINE2)
                d.rrect((x + 166, yy, 52, 5), r=2.5, fill=LINE2)
            d.txt((x + 14, 232, 210, 10), "No spinner over content that already exists.", size=4.3,
                  color=FAINT)
        else:
            d.badge(x + 14, 138, "failed", "failed", size=4.4, h=11.5)
            d.txt((x + 14, 156, 190, 12), head, size=6.2, color=INK, bold=True)
            d.txt((x + 14, 168, 200, 26), body, size=4.5, color=MUTED, line=1.4)
            d.rrect((x + 14, 196, 212, 26), r=8, fill=RED_T)
            d.txt((x + 24, 196, 192, 26), "ruleHit R7  \u00b7  shouldAutoSend false", size=4.2,
                  color=RED_I, anchor="middle")
            d.pill((x + 14, 228, 62, 18), "Retry", fill=PAPER, ink=RED_I, size=4.4, line=RED_T)

    # row B - controls, badges, toasts
    d.rrect((56, 274, 340, 152), r=12, fill=PAPER, line=LINE)
    d.caps((72, 284, 200, 9), "Controls", size=4.4, color=FAINT, tracking=1.05)
    d.field((72, 306, 120, 22), "Rest", "CloudPulse CRM", size=5.0)
    d.field((204, 306, 120, 22), "Focus", "\u20b91,499 / mo", focus=True, size=5.0)
    d.field((72, 344, 120, 22), "Error", "not-an-email", size=5.0)
    d.vline(72, 344, 22, RED, 1.1)
    d.txt((204, 348, 120, 16), "Enter a valid email", size=4.3, color=RED_I)
    d.field((72, 382, 120, 22), "Disabled", "read only", size=5.0)
    d.rrect((204, 382, 120, 22), r=7, fill=WASH)
    d.txt((212, 382, 104, 22), "Disabled", size=5.0, color=FAINT, anchor="middle")
    d.txt((72, 410, 310, 10), "Focus = teal hairline + 1.8pt bar. Error = crimson hairline + "
          "helper. Disabled = wash.", size=4.1, color=FAINT)

    d.rrect((408, 274, 190, 152), r=12, fill=PAPER, line=LINE)
    d.caps((422, 284, 180, 9), "Badges", size=4.4, color=FAINT, tracking=1.05)
    for i, (kind, label) in enumerate([("answered", "answered"), ("draft", "draft"),
                                       ("escalated", "escalated"), ("failed", "failed"),
                                       ("new", "new"), ("closed", "closed")]):
        d.badge(422, 300 + i * 18, label, kind, size=4.4, h=11.5)
    d.toggle(520, 302, on=True, w=22, h=11)
    d.toggle(520, 322, on=False, w=22, h=11)
    d.chip((520, 346, 46, 16), "On", active=True, size=4.0)
    d.chip((520, 368, 46, 16), "Off", active=False, size=4.0)
    d.txt((422, 404, 160, 10), "One family, six states.", size=4.2, color=FAINT)

    d.rrect((610, 274, 186, 152), r=12, fill=PAPER, line=LINE)
    d.caps((624, 284, 160, 9), "Toasts", size=4.4, color=FAINT, tracking=1.05)
    for i, (tint, dotc, ink, label) in enumerate([
            (GREEN_T, GREEN, GREEN_I, "Answer sent  \u00b7  R6"),
            (RED_T, RED, RED_I, "Send failed  \u00b7  R7"),
            (AMBER_T, AMBER, AMBER_I, "Saved as draft  \u00b7  R5")]):
        yy = 300 + i * 34
        d.rrect((624, yy, 158, 26), r=8, fill=tint)
        d.dot(634, yy + 13, 2.0, dotc)
        d.txt((640, yy, 134, 26), label, size=4.5, color=ink, anchor="middle")
    d.txt((624, 406, 160, 10), "4s, dismissible, never modal.", size=4.2, color=FAINT)

    # row C - layout
    d.rrect((56, 436, 740, 78), r=12, fill=PAPER, line=LINE)
    d.caps((72, 446, 220, 9), "Layout  \u00b7  one shell, four widths", size=4.4, color=FAINT,
           tracking=1.05)
    cols = [("1440+", "Rail + 4 KPIs", "Right column keeps the three small multiples"),
            ("1024\u20131439", "Rail collapses to icons", "KPIs 2\u00d72, right column drops under"),
            ("768\u20131023", "Rail becomes a top bar", "List full width; drawer becomes a sheet"),
            ("<768", "Single column", "Pin above transcript; badges stay inline")]
    for i, (label, head, body) in enumerate(cols):
        x = 72 + i * 180
        d.txt((x, 462, 60, 10), label, size=5.2, color=TEAL, bold=True)
        d.txt((x, 475, 170, 10), head, size=4.9, color=INK)
        d.txt((x, 486, 168, 22), body, size=4.2, color=FAINT, line=1.35)

    d.mark(48, 108, 1)
    d.mark(298, 108, 2)
    d.mark(48, 274, 3)
    d.mark(48, 436, 4)

    d.spec_strip(17, "System \u00b7 states", "Nothing ships\nwithout its\nfourth state.", [
        ("Async trio", "Empty, loading, failed sit side by side, drawn at the real size."),
        ("R7", "The failed state names the rule, not a generic error \u2014 it is a contract."),
        ("Controls", "The three field states and the disabled treatment, on one line."),
        ("Widths", "Four breakpoints with what changes, so the CSS is not improvised."),
    ], "/dashboard  \u00b7  every panel", "components/ui/ states; EmptyState.tsx; Skeleton.tsx; "
       "ErrorState.tsx \u00b7 R7", states="default \u00b7 hover \u00b7 focus \u00b7 active \u00b7 "
       "disabled \u00b7 empty \u00b7 loading \u00b7 failed")
    d.notes("The state sheet is the coding reference that saves a review round: every async surface "
            "has four states drawn, and the failure state is labelled with rule R7 rather than a "
            "generic error. Layout rules are given per width so the breakpoints are decided here, "
            "not in the editor.")


# ---------------------------------------------------------------------------------------------
# 18# ---------------------------------------------------------------------------------------------
# 18 — build order
# ---------------------------------------------------------------------------------------------


def s_handoff(d):
    d.ground(DEEP)
    d.arc_band(980, 620, 300, 196, 296, 36, "#0B4B45")
    d.arc_band(980, 620, 366, 194, 292, 30, "#0B4B45")

    d.caps((56, 54, 300, 10), "How to build it", size=5.2, color=MINT, tracking=1.4)
    d.serif((52, 72, 340, 150), "Six files,\nin the order\nthat works.", size=36, color=PAPER,
            tracking=-1.5, line=1.02)
    d.txt((56, 232, 316, 70),
          "Each step stands on the one above it. Do not start the drawer before the row exists "
          "\u2014 the drawer is the row, opened.", size=7.0, color="#BBD3CE", line=1.6)
    d.pill((56, 470, 118, 26), "npm run dev", fill=MINT, ink=DEEP, size=5.6)
    d.txt((56, 502, 340, 10), "localhost:3000  \u00b7  1-click judge demo login", size=5.2,
          color="#9FBFBA")

    steps = [("01", "Tokens & primitives", "tokens.css \u00b7 ui/Button, Badge, Meter", "no route"),
             ("02", "Dashboard shell", "nav rail, top bar, business switcher", "/dashboard"),
             ("03", "Queue", "LiveQueuePanel, TicketRow", "?tab=queue"),
             ("04", "Ticket drawer", "TicketDetailDrawer, RuleChain", "?ticket="),
             ("05", "Text modal", "AiTextModal, VerdictChips", "POST /ai/text-query"),
             ("06", "Voice", "VoiceTestPanel, CallStepper", "?tab=voice"),
             ("07", "Brain + channels", "BrainInsightsPanel, ChannelsPanel", "?tab=brain")]
    y = 78.0
    d.hline(420, y - 10, 484, "#1F5651")
    for num, name, files, route in steps:
        d.txt((420, y + 2, 24, 10), num, size=4.8, color=MINT)
        d.txt((450, y, 168, 10), name, size=5.8, color=PAPER, bold=True)
        d.txt((450, y + 12, 300, 10), files, size=4.6, color="#9FBFBA")
        d.txt((780, y + 2, 124, 10), route, size=4.6, color="#D7E5E2", align="right")
        d.hline(420, y + 32, 484, "#16453F")
        y += 46.0

    d.txt((420, y + 8, 300, 10), "Every step is independently reviewable.", size=4.6,
          color="#7FA5A0")
    d.txt((420, 486, 484, 10), "Deck v1  \u00b7  18 screens  \u00b7  Team 41  \u00b7  SPHINX \u201926",
          size=4.8, color="#7FA5A0", align="right")
    d.notes("The closing slide is the implementation order, not a thank-you. It maps each step to "
            "the component and the route it serves, so the two developers can work in parallel "
            "after step two without touching each other's files.")


# ---------------------------------------------------------------------------------------------
# build# ---------------------------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------------------------

SLIDES = [s_cover, s_material, s_kit, s_map, s_landing, s_auth, s_onboard_1, s_onboard_2,
          s_onboard_3, s_onboard_4, s_queue, s_ticket, s_text_modal, s_voice, s_brain,
          s_channels, s_states, s_handoff]

FONT_DIR = pathlib.Path(__file__).parent / "assets" / "fonts"


def load_fonts(deck):
    for name in ("Telegraf-Regular.ttf", "Telegraf-Medium.ttf", "Telegraf-Bold.ttf",
                 "PPEditorialNew-Ultralight.ttf"):
        path = FONT_DIR / name
        if not path.exists():
            print("missing font", path, file=sys.stderr)
            continue
        data = base64.b64encode(path.read_bytes()).decode()
        try:
            deck.c.cmd("font.add", {"data": data})
        except RuntimeError as exc:
            print("font.add skipped:", name, str(exc)[:70], file=sys.stderr)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--render", metavar="DIR")
    ap.add_argument("--scale", type=float, default=2.0)
    ap.add_argument("--save", metavar="PPTX")
    ap.add_argument("--pdf", metavar="PDF")
    ap.add_argument("--only", type=int, nargs="+")
    ap.add_argument("--port", type=int, default=7990)
    args = ap.parse_args(argv)

    theme = T.Theme(dark=INK, light=PAPER, mid=WASH, deep=DEEP, accent=TEAL, soft=MINT, font=SANS)
    deck = UI(theme, args.port, body=7.0, cap=5.2, item=10.0)
    try:
        docs = deck.c.call("ui.inspect")["documents"]
        if len(docs) > 0:
            print(f"note: {len(docs)} document(s) already open", file=sys.stderr)
        deck.c.cmd("file.new", {"size": [PAGE_W, PAGE_H], "blank": True})
        load_fonts(deck)
        for fn in SLIDES:
            fn(deck)
        deck.c.cmd("file.properties", {"title": "AfterSales AI \u2014 product screens",
                                       "author": "Team 41"})
        deck.c.cmd("slide.go", {"index": 0})
        built = len(deck.c.call("document.inspect")["slides"])
        if built != len(deck.slides):
            raise RuntimeError(f"built {len(deck.slides)} slides, document holds {built}")
        print(f"built {len(deck.slides)} slides \u00b7 {deck.c.calls} control calls")
        if args.save:
            out = pathlib.Path(args.save).expanduser().absolute()
            out.parent.mkdir(parents=True, exist_ok=True)
            print("saved", deck.c.cmd("file.saveAs", {"path": str(out)})["path"])
        if args.pdf:
            out = pathlib.Path(args.pdf).expanduser().absolute()
            out.parent.mkdir(parents=True, exist_ok=True)
            print("exported", deck.c.cmd("file.export", {"path": str(out), "layout": "slides"})["path"])
        if args.render:
            folder = pathlib.Path(args.render).expanduser().absolute()
            folder.mkdir(parents=True, exist_ok=True)
            wanted = {i - 1 for i in args.only} if args.only else set(range(len(deck.slides)))
            for i in [i for i in range(len(deck.slides)) if i in wanted]:
                deck.c.call("ui.render", {"path": str(folder / f"slide-{i + 1:02d}.png"),
                                          "slide": i, "scale": args.scale})
            print("rendered", len(wanted), "slides ->", folder)
    finally:
        deck.c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
