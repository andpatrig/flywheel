"""
flywheel.py — read a Flywheel session export (.json), analyse it, replay it, and write a summary for an LLM.

Use it from the notebook (flywheel_analysis.ipynb) or from the command line:

    python flywheel.py my-session.json              # writes my-session_summary.md and my-session_compact.json

Needs: numpy, pandas, matplotlib (all standard in a Jupyter install).
"""
from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

CURVE_N = 40  # samples per force curve after resampling (matches the app)


# --------------------------------------------------------------------------------------------- loading

@dataclass
class Session:
    raw: dict
    strokes: pd.DataFrame          # one row per stroke
    samples: pd.DataFrame          # ~1 per second: pace, rate, heart rate, speed
    curves: np.ndarray             # strokes × CURVE_N force curves (N), NaN where a stroke has none
    path: Path | None = None

    @property
    def summary(self) -> dict: return self.raw.get("summary") or {}
    @property
    def event(self) -> dict: return self.raw.get("event") or {"kind": "row", "label": "Just row", "target": None}
    @property
    def started(self) -> datetime: return datetime.fromisoformat(self.raw["startedAt"].replace("Z", "+00:00"))


def resample(curve, n=CURVE_N):
    c = np.asarray(curve, float)
    if len(c) < 2: return np.full(n, np.nan)
    return np.interp(np.linspace(0, len(c) - 1, n), np.arange(len(c)), c)


def load(path) -> Session:
    path = Path(path)
    raw = json.loads(path.read_text())
    if raw.get("app") != "flywheel": raise ValueError(f"{path.name} is not a Flywheel export")
    st = pd.DataFrame(raw["strokes"]).rename(columns={"n": "stroke", "t": "elapsed", "d": "distance"})
    curves = np.vstack([resample(c) if c else np.full(CURVE_N, np.nan) for c in st.pop("curve")]) if len(st) else np.zeros((0, CURVE_N))
    # derived per-stroke values
    st["ratio"] = st["recoveryTime"] / st["driveTime"]
    st["peakAt"] = [np.nanargmax(c) / (CURVE_N - 1) if np.isfinite(c).any() else np.nan for c in curves]   # 0 = catch, 1 = finish
    st["paceP"] = 500 * np.cbrt(2.8 / st["power"].where(st["power"] > 0))                                     # pace implied by the stroke's power
    st["dps"] = st["distance"].diff()                                                                       # metres run per stroke
    sm = pd.DataFrame(raw.get("samples") or [])
    return Session(raw, st, sm, curves, path)


# --------------------------------------------------------------------------------------------- formatting

def fmt_pace(s):
    if s is None or not np.isfinite(s) or s <= 0: return "–"
    d = round(s * 10); return f"{d // 600}:{(d % 600) / 10:04.1f}"


def fmt_time(s, tenths=True):
    if s is None or not np.isfinite(s): return "–"
    if tenths:
        d = round(s * 10); h, m, x = d // 36000, (d % 36000) // 600, (d % 600) / 10
        return f"{h}:{m:02d}:{x:04.1f}" if h else f"{m}:{x:04.1f}"
    s = round(s); h, m, x = s // 3600, (s % 3600) // 60, s % 60
    return f"{h}:{m:02d}:{x:02d}" if h else f"{m}:{x:02d}"


# --------------------------------------------------------------------------------------------- analysis

def total_distance(s: "Session") -> float:
    tgt = (s.event.get("target") or {}).get("distance")
    return tgt or s.summary.get("distance") or (s.strokes["distance"].iloc[-1] if len(s.strokes) else 0)


def split_length(distance: float) -> int:
    """Split length the app uses: 100 m for short pieces, 500 m up to 10k, 1000 m beyond."""
    return 100 if distance <= 1000 else 500 if distance <= 10000 else 1000


def splits(s: Session, length: int | None = None) -> pd.DataFrame:
    """Time, pace, watts, rate, strokes and metres per stroke for each split (interpolated at the split line)."""
    st = s.strokes[s.strokes["distance"] > 0]
    if st.empty: return pd.DataFrame()
    L = length or split_length(total_distance(s))
    t = np.r_[0, st["elapsed"].to_numpy()]; d = np.r_[0, st["distance"].to_numpy()]
    end_d, end_t = s.summary.get("distance") or 0, s.summary.get("elapsed") or 0
    if end_d > d[-1] + 0.5 and end_t > t[-1]: t, d = np.r_[t, end_t], np.r_[d, end_d]   # the monitor's final numbers close the last split
    rows, prev_t = [], 0.0
    for k in range(1, int(d[-1] // L) + 1):
        tk = float(np.interp(k * L, d, t))
        seg = st[(st["distance"] > (k - 1) * L) & (st["distance"] <= k * L)]
        rows.append({"split": f"{k * L:,} m", "time": tk - prev_t, "pace": (tk - prev_t) / L * 500,
                     "watts": seg["power"].mean(), "rate": seg["spm"].mean(), "strokes": int(len(seg)),
                     "m_per_stroke": L / len(seg) if len(seg) else np.nan, "peak_force": seg["peakForce"].mean()})
        prev_t = tk
    return pd.DataFrame(rows)


def match_scores(s: Session) -> pd.Series:
    """Per-stroke match against the session-average force curve, 0–100 (100 = identical shape and size)."""
    ref = np.nanmean(s.curves, axis=0)
    rms = math.sqrt(np.nanmean(ref ** 2)) or 1.0
    diff = np.sqrt(np.nanmean((s.curves - ref) ** 2, axis=1))
    return pd.Series(np.clip(100 * (1 - diff / rms), 0, 100), index=s.strokes.index, name="match")


def thirds(s: Session) -> pd.DataFrame:
    """First, middle and last third of the strokes side by side: the quickest way to see fade."""
    st = s.strokes.assign(match=match_scores(s))
    parts = np.array_split(np.arange(len(st)), 3)
    rows = []
    for name, idx in zip(["first third", "middle third", "last third"], parts):
        p = st.iloc[idx]
        rows.append({"part": name, "pace": 500 * np.cbrt(2.8 / p["power"].mean()) if p["power"].mean() > 0 else np.nan,
                     "watts": p["power"].mean(), "rate": p["spm"].mean(), "m_per_stroke": p["dps"].mean(),
                     "peak_force": p["peakForce"].mean(), "drive_time": p["driveTime"].mean(), "ratio": p["ratio"].mean(),
                     "peak_at_%": 100 * p["peakAt"].mean(), "power_cv_%": 100 * p["power"].std() / p["power"].mean(),
                     "curve_match_%": p["match"].mean()})
    return pd.DataFrame(rows).set_index("part")


def effective_work(s: Session) -> pd.DataFrame:
    """Median joules per stroke and metres per stroke at each stroke rate (rates with 3+ strokes)."""
    g = s.strokes.dropna(subset=["spm"]).groupby("spm")
    out = pd.DataFrame({"strokes": g.size().astype(int), "J_per_stroke": g["workPerStroke"].median(), "m_per_stroke": g["dps"].median(), "watts": g["power"].median()})
    return out[out["strokes"] >= 3]


def headline(s: Session) -> dict:
    m, st = s.summary, s.strokes
    return {
        "piece": s.event.get("label"), "date": s.started.strftime("%Y-%m-%d %H:%M"),
        "time": fmt_time(m.get("elapsed")), "distance_m": round(m.get("distance") or 0),
        "avg_pace": fmt_pace(m.get("avgPace")), "avg_watts": round(m.get("avgPower") or 0), "max_watts": m.get("maxPower"),
        "avg_rate_spm": round(m.get("avgSpm") or 0, 1), "strokes": m.get("strokes"),
        "m_per_stroke": round((m.get("distance") or 0) / max(1, m.get("strokes") or 1), 2),
        "work_kJ": round((m.get("work") or 0) / 1000, 1), "avg_hr": round(m["avgHr"]) if m.get("avgHr") else None,
        "drag_factor": m.get("drag"), "avg_peak_force_N": round(m.get("avgPeakForce") or 0),
        "avg_drive_length_m": round(m.get("avgDriveLength") or 0, 2),
        "drive_recovery_ratio": f"1 : {st['ratio'].mean():.1f}" if st["ratio"].notna().any() else None,
        "power_cv_%": round(100 * (m.get("consistency") or 0), 1),
        "curve_match_%": round(float(match_scores(s).mean()), 1) if np.isfinite(s.curves).any() else None,
    }


# --------------------------------------------------------------------------------------------- plots

def _style():
    import matplotlib.pyplot as plt
    plt.rcParams.update({"figure.dpi": 110, "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                         "grid.alpha": 0.25, "axes.titleweight": "bold", "axes.titlesize": 11, "font.size": 9.5})
    return plt


ACCENT, INK, MUTED = "#0088a3", "#222428", "#8a8f98"


def plot_overview(s: Session):
    """Pace (faster up), stroke rate and power over the session."""
    plt = _style(); st = s.strokes
    fig, ax = plt.subplots(3, 1, figsize=(10, 7), sharex=True)
    ax[0].plot(st["elapsed"] / 60, st["paceP"], color=ACCENT, lw=1.4); ax[0].invert_yaxis()
    ax[0].yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: fmt_pace(v))); ax[0].set_title("Pace /500m (faster is up)")
    ax[1].plot(st["elapsed"] / 60, st["spm"], color=INK, lw=1.2, drawstyle="steps-mid"); ax[1].set_title("Stroke rate (spm)")
    ax[2].bar(st["elapsed"] / 60, st["power"], width=0.025, color=ACCENT, alpha=0.8); ax[2].set_title("Power per stroke (W)")
    ax[2].set_xlabel("minutes"); fig.tight_layout(); return fig


def plot_force(s: Session):
    """Average force curve per third of the session, with the first third's ±1σ band."""
    plt = _style(); x = np.linspace(0, 100, CURVE_N)
    fig, ax = plt.subplots(figsize=(9, 4.2))
    parts = np.array_split(np.arange(len(s.curves)), 3)
    for (name, idx), col in zip(zip(["first third", "middle third", "last third"], parts), ["#9bd3df", ACCENT, INK]):
        c = s.curves[idx]; mu = np.nanmean(c, axis=0)
        if name == "first third": ax.fill_between(x, mu - np.nanstd(c, axis=0), mu + np.nanstd(c, axis=0), color=col, alpha=0.25, lw=0)
        ax.plot(x, mu, color=col, lw=2, label=name)
    ax.set_xlabel("drive (catch → finish, %)"); ax.set_ylabel("handle force (N)"); ax.set_title("Force curve through the session"); ax.legend(frameon=False)
    fig.tight_layout(); return fig


def plot_effective(s: Session):
    """Joules per stroke against rate, with the median at each rate."""
    plt = _style(); st = s.strokes.dropna(subset=["spm", "workPerStroke"]); e = effective_work(s)
    fig, ax = plt.subplots(figsize=(8, 4.2))
    jit = (np.arange(len(st)) * 37 % 11 - 5) / 28
    sc = ax.scatter(st["spm"] + jit, st["workPerStroke"], c=st["elapsed"] / 60, cmap="viridis", s=14, alpha=0.75)
    ax.plot(e.index, e["J_per_stroke"], color=INK, lw=1.6, marker="o", ms=4, label="median")
    fig.colorbar(sc, ax=ax, label="minutes"); ax.set_xlabel("stroke rate (spm)"); ax.set_ylabel("work per stroke (J)")
    ax.set_title("Effective work"); ax.legend(frameon=False); fig.tight_layout(); return fig


def plot_consistency(s: Session):
    """Curve match and power over the session, 10-stroke rolling mean."""
    plt = _style(); st = s.strokes.assign(match=match_scores(s))
    fig, ax = plt.subplots(figsize=(10, 3.6)); ax2 = ax.twinx()
    ax.plot(st["stroke"], st["match"].rolling(10, min_periods=3).mean(), color=ACCENT, lw=1.8, label="curve match % (10-stroke mean)")
    ax2.plot(st["stroke"], st["power"].rolling(10, min_periods=3).std() / st["power"].rolling(10, min_periods=3).mean() * 100, color=MUTED, lw=1.2, label="power CV % (10 strokes)")
    ax.set_xlabel("stroke"); ax.set_ylabel("curve match %"); ax2.set_ylabel("power CV %"); ax2.spines["right"].set_visible(True); ax2.grid(False)
    h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels(); ax.legend(h1 + h2, l1 + l2, frameon=False, loc="lower left")
    ax.set_title("Consistency"); fig.tight_layout(); return fig


def replay(s: Session, every: int = 1, fps: int = 8):
    """Stroke-by-stroke replay: force curve against the session average, and where the stroke sits in the piece.
    Returns a matplotlib animation; in Jupyter, display it with HTML(anim.to_jshtml())."""
    plt = _style(); from matplotlib import animation
    st = s.strokes.reset_index(drop=True); ref = np.nanmean(s.curves, axis=0); x = np.linspace(0, 100, CURVE_N)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4), gridspec_kw={"width_ratios": [1.1, 1]})
    a1.plot(x, ref, ls="--", color=MUTED, lw=1.4, label="session average")
    (ln,) = a1.plot([], [], color=ACCENT, lw=2.4, label="this stroke"); fill = [None]
    a1.set_xlim(0, 100); a1.set_ylim(0, np.nanmax(s.curves) * 1.1); a1.set_xlabel("drive (%)"); a1.set_ylabel("force (N)"); a1.legend(frameon=False, loc="upper right")
    txt = a1.text(0.02, 0.95, "", transform=a1.transAxes, va="top", family="monospace", fontsize=9)
    a2.plot(st["elapsed"] / 60, st["paceP"], color=MUTED, lw=1); a2.invert_yaxis()
    a2.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: fmt_pace(v))); a2.set_title("pace /500m"); a2.set_xlabel("minutes")
    (dot,) = a2.plot([], [], "o", color=ACCENT, ms=8)
    def frame(i):
        r = st.iloc[i]; c = s.curves[i]
        ln.set_data(x, c)
        if fill[0] is not None: fill[0].remove()
        fill[0] = a1.fill_between(x, 0, np.nan_to_num(c), color=ACCENT, alpha=0.15, lw=0)
        dot.set_data([r["elapsed"] / 60], [r["paceP"]])
        txt.set_text(f"stroke {int(r['stroke'])}  {fmt_time(r['elapsed'])}  {r['distance']:.0f} m\n{r['power']:.0f} W  {r['spm']:.0f} spm  peak {r['peakForce']:.0f} N")
        return ln, dot, txt
    anim = animation.FuncAnimation(fig, frame, frames=range(0, len(st), every), interval=1000 / fps, blit=False)
    plt.close(fig); return anim


# --------------------------------------------------------------------------------------------- outputs for an LLM

def _md_table(df: pd.DataFrame, fmt: dict | None = None) -> str:
    fmt = fmt or {}
    cols = [df.index.name or ""] + list(df.columns) if df.index.name else list(df.columns)
    lines = ["| " + " | ".join(str(c) for c in cols) + " |", "|" + "---|" * len(cols)]
    for idx, row in df.iterrows():
        cells = ([str(idx)] if df.index.name else []) + [fmt.get(c, lambda v: f"{v:.1f}" if isinstance(v, float) else str(v))(row[c]) for c in df.columns]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def summary_markdown(s: Session) -> str:
    """A compact, self-contained description of the session (~1–2 k tokens) for an LLM to give feedback on."""
    h, sp, th, ew = headline(s), splits(s), thirds(s), effective_work(s)
    pace_fmt = {"pace": fmt_pace, "time": fmt_time}
    peak = 100 * s.strokes["peakAt"].mean()
    parts = [
        "# Rowing session — summary for feedback",
        "",
        "Recorded on a Concept2 rowing machine (PM5 monitor) with the Flywheel app. All values come from the monitor.",
        "Units: pace = time per 500 m (min:s); power in watts; force in newtons; rate in strokes per minute (spm).",
        "",
        "## Result",
        *[f"- **{k.replace('_', ' ')}**: {v}" for k, v in h.items() if v is not None],
        "",
        f"## Splits ({split_length(total_distance(s))} m)",
        _md_table(sp.set_index("split"), {**pace_fmt, "strokes": lambda v: f"{int(v)}", "watts": lambda v: f"{v:.0f}", "peak_force": lambda v: f"{v:.0f}"}) if not sp.empty else "_too short for splits_",
        "",
        "## First / middle / last third of the strokes",
        _md_table(th, {"pace": fmt_pace, "watts": lambda v: f"{v:.0f}", "peak_force": lambda v: f"{v:.0f}", "drive_time": lambda v: f"{v:.2f}", "ratio": lambda v: f"1 : {v:.1f}"}),
        "",
        "## Force curve",
        f"- Peak force arrives on average at {peak:.0f}% of the drive (0% = catch, 100% = finish).",
        f"- Average curve (N, 10 points catch → finish): {', '.join(f'{v:.0f}' for v in resample(np.nanmean(s.curves, axis=0), 10))}",
        "- Curve match % compares each stroke's force curve with the session average (100 = identical).",
        "",
        "## Work per stroke by rate",
        _md_table(ew.rename_axis("rate_spm"), {"strokes": lambda v: f"{int(v)}", "J_per_stroke": lambda v: f"{v:.0f}", "watts": lambda v: f"{v:.0f}", "m_per_stroke": lambda v: f"{v:.2f}"}) if not ew.empty else "_only one rate used_",
        "",
        "## How to read these numbers",
        "- Even splits mean even pacing; a slower last third with a lower peak force or curve match usually means fatigue.",
        "- Power CV % is the stroke-to-stroke variation of power: lower is more consistent.",
        "- Metres per stroke at the same rate: higher means each stroke moved the boat further.",
        "- A higher drag factor feels heavier per stroke; it is a machine setting, not effort.",
    ]
    return "\n".join(parts) + "\n"


PROMPT = """I'm attaching a summary of one rowing session on a Concept2 erg (and optionally the full export).
Please act as an experienced rowing coach. Based only on the data:
1. How was my pacing? Point to specific splits.
2. What does the force curve and its change over the session suggest about technique and fatigue?
3. How consistent were my strokes, and where did it break down?
4. Two or three concrete things to try in my next session of this piece.
Say which conclusions are uncertain because the data can't show them (e.g. posture or sequencing)."""


def compact_json(s: Session) -> dict:
    """The export without per-stroke force curves (the bulk of the file), plus one average curve per third:
    small enough to paste whole into a chat."""
    r = {k: v for k, v in s.raw.items() if k not in ("strokes", "samples", "avgCurve")}
    keep = ["stroke", "elapsed", "distance", "power", "spm", "hr", "driveLength", "driveTime", "recoveryTime", "peakForce", "workPerStroke"]
    r["strokes"] = s.strokes[[c for c in keep if c in s.strokes]].round(2).replace({np.nan: None}).to_dict("records")
    r["curveByThird_N"] = {name: [round(float(v)) for v in np.nanmean(s.curves[idx], axis=0)]
                            for name, idx in zip(["first", "middle", "last"], np.array_split(np.arange(len(s.curves)), 3))}
    r["note"] = "Per-stroke force curves removed; curveByThird_N has the average curve (40 points, catch→finish) for each third."
    return r


def write_outputs(s: Session, folder=None) -> tuple[Path, Path]:
    """Writes <name>_summary.md (summary + a ready prompt) and <name>_compact.json next to the export."""
    folder = Path(folder or (s.path.parent if s.path else "."))
    stem = s.path.stem if s.path else f"flywheel-{s.started:%Y-%m-%d-%H-%M}"
    md = folder / f"{stem}_summary.md"; cj = folder / f"{stem}_compact.json"
    md.write_text(summary_markdown(s) + "\n---\n\n## Suggested prompt\n\n" + PROMPT + "\n")
    cj.write_text(json.dumps(compact_json(s), indent=1))
    return md, cj


if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit("usage: python flywheel.py session.json")
    sess = load(sys.argv[1]); md, cj = write_outputs(sess)
    print(summary_markdown(sess)); print(f"wrote {md}\nwrote {cj}")
