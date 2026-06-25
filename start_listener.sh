#!/bin/bash
# Kill any existing listener instances (including orphaned ones)
pkill -f "ts-node/dist/bin.js src/index.ts" 2>/dev/null

# Kill existing pead tmux session if any
tmux kill-session -t pead 2>/dev/null

# Start a new detached tmux session named pead
tmux new-session -d -s pead

# Give tmux server a second to initialize
sleep 1

# Send command to load NVM and run the engine
tmux send-keys -t pead 'export NVM_DIR="$HOME/.nvm"' C-m
tmux send-keys -t pead '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' C-m
tmux send-keys -t pead 'nvm use default' C-m
tmux send-keys -t pead 'cd /home/pol/dev/pead-engine' C-m
tmux send-keys -t pead 'node node_modules/ts-node/dist/bin.js src/index.ts >> pead-listener.log 2>&1' C-m

echo "PEAD Engine started inside tmux session 'pead'."
