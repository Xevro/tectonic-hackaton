"""Build the self-contained console: out/console.html

    python -m app.build_console

Inlines the pipeline and evaluation outputs so the console opens with no
server, no network calls and no API keys. Safe to host as a static page.
"""
import json

OUT = "out"


def main():
    data = {
        "candidates": json.load(open(f"{OUT}/candidates.json")),
        "report": json.load(open(f"{OUT}/eval_report.json")),
        "meta": json.load(open(f"{OUT}/run_meta.json")),
        "demo": json.load(open(f"{OUT}/demo_households.json")),
    }
    blob = json.dumps(data, separators=(",", ":"))
    # prevent a stray "</script>" in data from closing the script tag
    blob = blob.replace("</", "<\\/")
    html = open("app/console.template.html").read().replace("/*__DATA__*/null", blob)
    open(f"{OUT}/console.html", "w").write(html)
    print(f"wrote {OUT}/console.html  ({len(html)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
