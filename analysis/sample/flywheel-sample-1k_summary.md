# Rowing session — summary for feedback

Recorded on a Concept2 rowing machine (PM5 monitor) with the Flywheel app. All values come from the monitor.
Units: pace = time per 500 m (min:s); power in watts; force in newtons; rate in strokes per minute (spm).

## Result
- **piece**: 1k
- **date**: 2026-11-05 21:05
- **time**: 3:42.2
- **distance m**: 1001
- **avg pace**: 1:51.0
- **avg watts**: 257
- **max watts**: 313
- **avg rate spm**: 28.0
- **strokes**: 103
- **m per stroke**: 9.72
- **work kJ**: 56.7
- **avg hr**: 169
- **drag factor**: 118
- **avg peak force N**: 717
- **avg drive length m**: 1.41
- **drive recovery ratio**: 1 : 1.6
- **power cv %**: 8.8
- **curve match %**: 93.3

## Splits (100 m)
| split | time | pace | watts | rate | strokes | m_per_stroke | peak_force |
|---|---|---|---|---|---|---|---|
| 100 m | 0:22.5 | 1:52.7 | 250 | 28.8 | 10 | 10.0 | 701 |
| 200 m | 0:22.4 | 1:51.8 | 241 | 28.1 | 10 | 10.0 | 672 |
| 300 m | 0:22.7 | 1:53.3 | 238 | 27.2 | 11 | 9.1 | 667 |
| 400 m | 0:21.6 | 1:48.2 | 276 | 28.7 | 10 | 10.0 | 770 |
| 500 m | 0:21.8 | 1:49.0 | 274 | 28.3 | 10 | 10.0 | 760 |
| 600 m | 0:21.4 | 1:46.9 | 293 | 27.0 | 10 | 10.0 | 815 |
| 700 m | 0:22.3 | 1:51.4 | 252 | 28.5 | 11 | 9.1 | 706 |
| 800 m | 0:22.4 | 1:52.1 | 246 | 28.5 | 10 | 10.0 | 693 |
| 900 m | 0:22.9 | 1:54.3 | 242 | 27.1 | 11 | 9.1 | 671 |
| 1,000 m | 0:22.1 | 1:50.7 | 260 | 28.4 | 10 | 10.0 | 730 |

## First / middle / last third of the strokes
| part | pace | watts | rate | m_per_stroke | peak_force | drive_time | ratio | peak_at_% | power_cv_% | curve_match_% |
|---|---|---|---|---|---|---|---|---|---|---|
| first third | 1:52.5 | 246 | 28.0 | 9.6 | 686 | 0.82 | 1 : 1.6 | 38.5 | 6.1 | 94.1 |
| middle third | 1:48.2 | 276 | 28.0 | 9.9 | 769 | 0.82 | 1 : 1.6 | 38.7 | 7.4 | 91.4 |
| last third | 1:52.0 | 249 | 28.1 | 9.6 | 698 | 0.82 | 1 : 1.6 | 38.5 | 7.6 | 94.5 |

## Force curve
- Peak force arrives on average at 39% of the drive (0% = catch, 100% = finish).
- Average curve (N, 10 points catch → finish): 0, 342, 578, 698, 707, 625, 479, 302, 127, 0
- Curve match % compares each stroke's force curve with the session average (100 = identical).

## Work per stroke by rate
| rate_spm | strokes | J_per_stroke | m_per_stroke | watts |
|---|---|---|---|---|
| 27 | 32 | 534 | 9.80 | 249 |
| 28 | 35 | 555 | 10.10 | 259 |
| 29 | 36 | 552 | 9.90 | 258 |

## How to read these numbers
- Even splits mean even pacing; a slower last third with a lower peak force or curve match usually means fatigue.
- Power CV % is the stroke-to-stroke variation of power: lower is more consistent.
- Metres per stroke at the same rate: higher means each stroke moved the boat further.
- A higher drag factor feels heavier per stroke; it is a machine setting, not effort.

---

## Suggested prompt

I'm attaching a summary of one rowing session on a Concept2 erg (and optionally the full export).
Please act as an experienced rowing coach. Based only on the data:
1. How was my pacing? Point to specific splits.
2. What does the force curve and its change over the session suggest about technique and fatigue?
3. How consistent were my strokes, and where did it break down?
4. Two or three concrete things to try in my next session of this piece.
Say which conclusions are uncertain because the data can't show them (e.g. posture or sequencing).
