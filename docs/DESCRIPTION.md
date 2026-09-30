# Situation 141 (Builderbase description)

Kate's 140 proactive situations were each written by a person, so KBC can only understand customers as fast as people can think of the next situation. Situation 141 removes that limit. It compares every household only to its own past, detects when a household's pattern bends away from its normal, groups households that bent the same way, and names each group in plain language. It measures how early each moment was visible and blocks anything a bank must never sell against, such as separation, financial distress or an inferred pregnancy. A reviewer approves what reaches Kate, and Kate never acts on her own.

On 10,000 synthetic Belgian households with 8 hidden life patterns, the engine recovered 7 with no labels. It found households preparing for self-employment a median 56 days before the salary stopped, on households it had never seen, with 93% cohort purity. The gate handled all 7 cohorts correctly. Compared with contacting on any change, it sent 135 messages instead of 617, 96% at the right moment, and none to separating or distressed households instead of 152.

This is synthetic data we generated, so it proves the method works, not real-world accuracy. The next step is KBC's own data. Stack: Python, scikit-learn (HDBSCAN), FastAPI with role-based access, a static console, 17 tests including a leakage test and API security tests.
