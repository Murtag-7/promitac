#!/usr/bin/env python
"""Generic mechanical checks for any verify-loop artifact.

Deterministic only. Every rule here is something a grep can settle, so the
judge never has to spend attention on it.

Usage:
    python check_common.py FILE [FILE ...]
        [--max-words N] [--min-words N]
        [--banned "a,b,c"] [--banned-file PATH]
        [--allow-placeholders] [--json]

Exit: 0 all pass, 1 one or more failures, 2 usage error.
"""

import argparse
import json
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

PLACEHOLDERS = [
    r"\bTODO\b", r"\bTBD\b", r"\bFIXME\b", r"\bXXX\b",
    r"lorem ipsum", r"\[insert[^\]]*\]", r"<insert[^>]*>",
    r"\bPLACEHOLDER\b", r"your text here", r"\.\.\.\s*$",
    r"\[your [^\]]*\]", r"\bLOREM\b",
]

DEAD_LINKS = [
    r"\]\(\s*\)", r"\]\(#\)", r"\]\(url\)", r"\]\(link\)",
    r"\]\(https?://example\.com[^)]*\)",
]


class Report:
    def __init__(self, tool, target, meta=""):
        self.tool, self.target, self.meta = tool, target, meta
        self.rows = []

    def add(self, status, rule, detail):
        self.rows.append({"status": status, "rule": rule, "detail": detail})

    def counts(self):
        c = {"FAIL": 0, "WARN": 0, "PASS": 0, "INFO": 0}
        for r in self.rows:
            c[r["status"]] = c.get(r["status"], 0) + 1
        return c

    def failed(self):
        return self.counts()["FAIL"] > 0

    def render(self):
        head = f"=== {self.tool} :: {self.target}"
        if self.meta:
            head += f" :: {self.meta}"
        out = [head + " ==="]
        width = max((len(r["rule"]) for r in self.rows), default=4)
        for r in self.rows:
            out.append(f"[{r['status']:<4}] {r['rule']:<{width}} : {r['detail']}")
        c = self.counts()
        out.append("---")
        out.append(f"{c['FAIL']} FAIL, {c['WARN']} WARN, {c['PASS']} PASS")
        return "\n".join(out)


def read(path):
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        return fh.read()


def line_of(text, idx):
    return text.count("\n", 0, idx) + 1


def snippet(text, start, end, pad=34):
    lo = max(0, start - pad)
    hi = min(len(text), end + pad)
    frag = text[lo:hi].replace("\n", " ")
    return re.sub(r"\s+", " ", frag).strip()


def word_count(text):
    stripped = re.sub(r"^---.*?^---", "", text, flags=re.S | re.M)   # frontmatter
    stripped = re.sub(r"```.*?```", " ", stripped, flags=re.S)        # code fences
    stripped = re.sub(r"[#*_>`\[\]()|-]", " ", stripped)
    return len(re.findall(r"\b[\w']+\b", stripped, flags=re.UNICODE))


def scan(rep, text, patterns, rule, status="FAIL", label=None):
    hits = []
    for pat in patterns:
        for m in re.finditer(pat, text, flags=re.I | re.M):
            hits.append((m.start(), m.end(), m.group(0)))
    if not hits:
        rep.add("PASS", rule, label or "none found")
        return
    hits.sort()
    for start, end, found in hits[:6]:
        rep.add(status, rule,
                f'"{found.strip()}" (line {line_of(text, start)}) -> ...{snippet(text, start, end)}...')
    if len(hits) > 6:
        rep.add(status, rule, f"...and {len(hits) - 6} more")


def check_file(path, args):
    rep = Report("check_common.py", os.path.basename(path))
    if not os.path.exists(path):
        rep.add("FAIL", "exists", f"file not found: {path}")
        return rep
    text = read(path)

    if not text.strip():
        rep.add("FAIL", "non-empty", "file is empty")
        return rep

    words = word_count(text)
    rep.add("INFO", "word-count", f"{words} words")

    if args.max_words is not None:
        if words > args.max_words:
            rep.add("FAIL", "max-words", f"{words} > {args.max_words}")
        else:
            rep.add("PASS", "max-words", f"{words} <= {args.max_words}")

    if args.min_words is not None:
        if words < args.min_words:
            rep.add("FAIL", "min-words", f"{words} < {args.min_words}")
        else:
            rep.add("PASS", "min-words", f"{words} >= {args.min_words}")

    if not args.allow_placeholders:
        scan(rep, text, PLACEHOLDERS, "placeholder")

    scan(rep, text, DEAD_LINKS, "dead-link")

    banned = []
    if args.banned:
        banned += [t.strip() for t in args.banned.split(",") if t.strip()]
    if args.banned_file and os.path.exists(args.banned_file):
        banned += [ln.strip() for ln in read(args.banned_file).splitlines()
                   if ln.strip() and not ln.strip().startswith("#")]
    if banned:
        scan(rep, text, [r"\b" + re.escape(t) + r"\b" for t in banned], "banned-term")

    return rep


def main():
    p = argparse.ArgumentParser(description="Generic mechanical checks.")
    p.add_argument("files", nargs="+")
    p.add_argument("--max-words", type=int, default=None)
    p.add_argument("--min-words", type=int, default=None)
    p.add_argument("--banned", default=None, help="comma-separated terms")
    p.add_argument("--banned-file", default=None, help="one term per line")
    p.add_argument("--allow-placeholders", action="store_true")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    reports = [check_file(f, args) for f in args.files]

    if args.json:
        print(json.dumps([{"target": r.target, "rows": r.rows} for r in reports],
                         ensure_ascii=False, indent=2))
    else:
        print("\n\n".join(r.render() for r in reports))

    return 1 if any(r.failed() for r in reports) else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:
        print(f"[FAIL] check_common.py crashed: {exc}", file=sys.stderr)
        sys.exit(2)
