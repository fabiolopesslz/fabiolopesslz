from __future__ import annotations

import re
import time
from collections import Counter, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests


STATUS_RE = {
    "active": re.compile(r"Active connections:\s*(\d+)"),
    "reading_writing_waiting": re.compile(r"Reading:\s*(\d+)\s*Writing:\s*(\d+)\s*Waiting:\s*(\d+)"),
    "accepts_handled_requests": re.compile(r"\n\s*(\d+)\s+(\d+)\s+(\d+)\s*\n"),
}

ACCESS_LOG_RE = re.compile(
    r'(?P<ip>\S+)\s+\S+\s+\S+\s+\[(?P<ts>[^\]]+)\]\s+"(?P<method>[A-Z]+)\s+(?P<path>[^\s]+)[^"]*"\s+(?P<status>\d{3})\s+(?P<size>\d+|-)'
)


@dataclass
class LogCursor:
    path: Path
    offset: int = 0

    def tail(self, max_lines: int = 400) -> list[str]:
        if not self.path.exists():
            return []

        file_size = self.path.stat().st_size
        if file_size < self.offset:
            self.offset = 0

        with self.path.open("r", encoding="utf-8", errors="replace") as file:
            file.seek(self.offset)
            chunk = file.read()
            self.offset = file.tell()

        lines = [line for line in chunk.splitlines() if line.strip()]
        if len(lines) > max_lines:
            return lines[-max_lines:]
        return lines


class NginxMetricsCollector:
    def __init__(self, status_url: str, access_log_path: str, error_log_path: str):
        self.status_url = status_url
        self.access_cursor = LogCursor(Path(access_log_path))
        self.error_cursor = LogCursor(Path(error_log_path))
        self.history: deque[dict[str, Any]] = deque(maxlen=120)

    def _parse_stub_status(self, raw: str) -> dict[str, int | None]:
        metrics: dict[str, int | None] = {
            "active_connections": None,
            "accepted_connections": None,
            "handled_connections": None,
            "total_requests": None,
            "reading": None,
            "writing": None,
            "waiting": None,
        }

        active = STATUS_RE["active"].search(raw)
        if active:
            metrics["active_connections"] = int(active.group(1))

        ahr = STATUS_RE["accepts_handled_requests"].search(raw)
        if ahr:
            metrics["accepted_connections"] = int(ahr.group(1))
            metrics["handled_connections"] = int(ahr.group(2))
            metrics["total_requests"] = int(ahr.group(3))

        rww = STATUS_RE["reading_writing_waiting"].search(raw)
        if rww:
            metrics["reading"] = int(rww.group(1))
            metrics["writing"] = int(rww.group(2))
            metrics["waiting"] = int(rww.group(3))

        return metrics

    def _fetch_stub_status(self) -> dict[str, int | None]:
        try:
            response = requests.get(self.status_url, timeout=2)
            response.raise_for_status()
            return self._parse_stub_status(response.text)
        except requests.RequestException:
            return {
                "active_connections": None,
                "accepted_connections": None,
                "handled_connections": None,
                "total_requests": None,
                "reading": None,
                "writing": None,
                "waiting": None,
            }

    def _summarize_access(self, lines: list[str]) -> dict[str, Any]:
        statuses = Counter()
        routes = Counter()
        methods = Counter()
        bytes_sent = 0

        for line in lines:
            match = ACCESS_LOG_RE.search(line)
            if not match:
                continue

            status = match.group("status")
            statuses[status] += 1

            path = match.group("path").split("?")[0]
            routes[path] += 1
            methods[match.group("method")] += 1

            size = match.group("size")
            if size.isdigit():
                bytes_sent += int(size)

        total_requests = sum(statuses.values())
        error_rate = (
            (sum(v for code, v in statuses.items() if int(code) >= 400) / total_requests) * 100
            if total_requests
            else 0
        )

        return {
            "requests_window": total_requests,
            "error_rate_pct": round(error_rate, 2),
            "bytes_sent_window": bytes_sent,
            "status_codes": dict(statuses),
            "top_routes": routes.most_common(5),
            "methods": dict(methods),
        }

    def _summarize_errors(self, lines: list[str]) -> dict[str, Any]:
        return {
            "error_lines_window": len(lines),
            "last_errors": lines[-10:],
        }

    def collect_snapshot(self) -> dict[str, Any]:
        status_metrics = self._fetch_stub_status()
        access_summary = self._summarize_access(self.access_cursor.tail())
        error_summary = self._summarize_errors(self.error_cursor.tail())

        now = int(time.time())
        point = {
            "ts": now,
            "active_connections": status_metrics["active_connections"],
            "requests_window": access_summary["requests_window"],
            "error_rate_pct": access_summary["error_rate_pct"],
        }
        self.history.append(point)

        return {
            "timestamp": now,
            "status": status_metrics,
            "access": access_summary,
            "errors": error_summary,
            "history": list(self.history),
            "sources": {
                "status_url": self.status_url,
                "access_log": str(self.access_cursor.path),
                "error_log": str(self.error_cursor.path),
            },
        }
