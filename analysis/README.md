# Analysis

Python tools for sessions exported from Flywheel (**History → open a session → Export JSON**).

- `flywheel_analysis.ipynb` — open in Jupyter (or VS Code), set `PATH` or drop your export next to it, run all.
  Result, splits, the session over time, first/middle/last third, force curve, consistency, effective work, a
  stroke-by-stroke replay, and a summary for Claude.
- `flywheel.py` — the same analysis as a module. From a terminal:

      python flywheel.py my-session.json

  writes `my-session_summary.md` (a short text summary plus a suggested coaching prompt) and
  `my-session_compact.json` (the export without per-stroke force curves). Attach either or both in a chat with
  Claude and ask for feedback.
- `sample/` — a simulated 1k with its summary and compact export, so the notebook runs before you have your own.

Needs `numpy`, `pandas` and `matplotlib` (included with Anaconda or `pip install jupyter pandas matplotlib`).
