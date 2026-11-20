#!/bin/sh
# Start the Ops snapshot server if nothing is listening on :8788 (cron runs this at boot and every 5 min).
PORT=8788
if ss -ltn 2>/dev/null | grep -q ":$PORT "; then exit 0; fi
mkdir -p "$HOME/logs"
echo "$(date '+%F %T') starting ops-agent" >> "$HOME/logs/ops-agent.log"
nohup /usr/bin/python3 "$HOME/projects/dashy-v2/tools/ops-agent.py" --serve >> "$HOME/logs/ops-agent.log" 2>&1 &
