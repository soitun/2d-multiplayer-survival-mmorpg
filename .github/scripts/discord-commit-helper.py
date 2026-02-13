#!/usr/bin/env python3
"""Helper script for Discord commit notifications. Run with: get_commits | post_webhook."""
import json
import os
import sys
import urllib.request


def get_commits():
    """Read event payload and output formatted commit list (max 5)."""
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        print("- (no commits found)")
        return
    with open(event_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    commits = data.get("commits", [])[:5]
    lines = []
    for c in commits:
        msg = (c.get("message", "").split("\n")[0])[:120]
        url = (
            c.get("url", "")
            .replace("api.github.com/repos", "github.com")
            .replace("/commits/", "/commit/")
        )
        sha = c.get("id", "")[:7]
        lines.append(f"- [`{sha}`]({url}) {msg}")
    print("\n".join(lines) if lines else "- (no commits found)")


def post_webhook():
    """Post CONTENT env var to Discord webhook."""
    webhook = os.environ.get("DISCORD_WEBHOOK_URL")
    content = os.environ.get("CONTENT", "")
    if not webhook:
        print("::error::DISCORD_WEBHOOK_URL secret not set", file=sys.stderr)
        sys.exit(1)
    payload = json.dumps({"content": content}).encode("utf-8")
    req = urllib.request.Request(
        webhook, data=payload, headers={"Content-Type": "application/json"}
    )
    urllib.request.urlopen(req).read()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "post":
        post_webhook()
    else:
        get_commits()
