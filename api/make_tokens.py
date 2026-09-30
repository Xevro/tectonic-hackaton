"""Create local demo principals and write them to a gitignored .env

    python -m api.make_tokens

Raw tokens are printed ONCE to your terminal for you to use. Only their
SHA-256 hashes are written to .env, so the file never holds a usable secret.
Never commit .env. It is listed in .gitignore.
"""

import hashlib
import json
import secrets

import pandas as pd


def main():
    dec = pd.read_parquet("out/decisions.parquet")
    spoke = dec[dec.rung.isin(["ask", "inform"])]
    customer_hh = spoke.household_id.iloc[0] if len(spoke) else dec.household_id.iloc[0]

    people = [
        ("reviewer-1", "reviewer", None),
        ("analyst-1", "analyst", None),
        ("customer-1", "customer", customer_hh),
    ]
    principals, shown = {}, []
    for sub, role, hh in people:
        tok = secrets.token_urlsafe(32)
        principals[hashlib.sha256(tok.encode()).hexdigest()] = {
            "sub": sub, "role": role, "household_id": hh}
        shown.append((sub, role, hh, tok))

    with open(".env", "w") as f:
        f.write("S141_PRINCIPALS=" + json.dumps(principals) + "\n")

    print("Wrote .env with hashed principals. Save these tokens now, they are not stored:\n")
    for sub, role, hh, tok in shown:
        print(f"  {role:9s} {sub:12s} {('household ' + hh) if hh else '':20s} {tok}")


if __name__ == "__main__":
    main()
