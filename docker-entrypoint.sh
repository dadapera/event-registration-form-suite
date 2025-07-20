#!/bin/sh
set -e

# Ensure forms directory exists and has proper permissions
mkdir -p /app/forms
chown -R node:node /app/forms

# Ensure data directory exists and has proper permissions  
mkdir -p /app/data
chown -R node:node /app/data

# If running as root, switch to node user
if [ "$(id -u)" = "0" ]; then
    exec gosu node "$@"
fi

# Execute the main command
exec "$@" 