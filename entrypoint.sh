#!/bin/sh
set -e

CONFIG_DIR=${MQTT_CONFIG_DIR:-/config}

echo "=== MQTT Manager v0.1.0 ==="
echo "Config directory: $CONFIG_DIR"

# ─── Generate default mosquitto.conf if absent ──────────────────────────────────

if [ ! -f "$CONFIG_DIR/mosquitto.conf" ]; then
    echo "Generating default mosquitto.conf..."
    cat > "$CONFIG_DIR/mosquitto.conf" << 'CONFEOF'
# MQTT Manager — auto-generated mosquitto.conf

# Listeners
listener 1883
protocol mqtt

listener 8883
protocol websockets

# Persistence
persistence true
persistence_location /var/lib/mosquitto

# Logging
log_dest stdout
log_type error
log_type warning
log_type notice
log_type information

# System topics ($SYS/#)
sys_interval 10

# Authentication
allow_anonymous true
password_file /config/passwd
acl_file /config/acl

# Performance
max_queued_messages 1000
max_inflight_messages 20
CONFEOF
fi

# ─── Generate default passwd if absent ──────────────────────────────────────────

if [ ! -f "$CONFIG_DIR/passwd" ]; then
    echo "Generating empty password file..."
    touch "$CONFIG_DIR/passwd"
fi

# ─── Generate default acl if absent ─────────────────────────────────────────────

if [ ! -f "$CONFIG_DIR/acl" ]; then
    echo "Generating default ACL file..."
    cat > "$CONFIG_DIR/acl" << 'ACLEOF'
# MQTT Manager — default ACL
# Format: user <username> <read|write|readwrite> <topic>

# Allow anonymous read access to public topics
user anonymous read public/#

# Allow all authenticated users read access to their own topics
pattern read %u/#
pattern write %u/#
ACLEOF
fi

# ─── Ensure Mosquitto data directory exists ─────────────────────────────────────

mkdir -p /var/lib/mosquitto
chown -R mosquitto:mosquitto /var/lib/mosquitto 2>/dev/null || true

echo "Starting services via supervisord..."
exec /usr/bin/supervisord -c /etc/supervisord.conf
