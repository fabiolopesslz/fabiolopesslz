from __future__ import annotations

import os
from flask import Flask, jsonify, render_template

from collector import NginxMetricsCollector


APP_VERSION = "1.0"
DEFAULT_HOST = os.getenv("APP_HOST", "0.0.0.0")
DEFAULT_PORT = int(os.getenv("APP_PORT", "5999"))
DEFAULT_STATUS_URL = os.getenv("NGINX_STATUS_URL", "http://127.0.0.1/nginx_status")
DEFAULT_ACCESS_LOG = os.getenv("NGINX_ACCESS_LOG", "/var/log/nginx/access.log")
DEFAULT_ERROR_LOG = os.getenv("NGINX_ERROR_LOG", "/var/log/nginx/error.log")

app = Flask(__name__)
collector = NginxMetricsCollector(
    status_url=DEFAULT_STATUS_URL,
    access_log_path=DEFAULT_ACCESS_LOG,
    error_log_path=DEFAULT_ERROR_LOG,
)


@app.route("/")
def index() -> str:
    return render_template("index.html", app_version=APP_VERSION)


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "version": APP_VERSION})


@app.route("/api/metrics")
def metrics():
    payload = collector.collect_snapshot()
    payload["version"] = APP_VERSION
    return jsonify(payload)


if __name__ == "__main__":
    app.run(host=DEFAULT_HOST, port=DEFAULT_PORT, debug=False)
