#!/bin/bash

# Configuration
PORT=3000
# Note: Duration is currently controlled inside main.go (default 60s)
# If you want to change it, edit const Duration in main.go
RESULTS_FILE="results.json"
TEMP_RESULTS="temp_results.jsonl"
GO_CLIENT_DIR="./bench_client_go"
BENCH_BIN="./bench_client_bin"

# --- 1. Tool Setup ---

build_go_client() {
    echo "Building Go Client..."
    if [ ! -d "$GO_CLIENT_DIR" ]; then
        echo "Error: Directory $GO_CLIENT_DIR not found."
        exit 1
    fi

    cd $GO_CLIENT_DIR
    # Ensure dependencies are clean
    if [ ! -f "go.mod" ]; then
        go mod init bench_client
        go get github.com/gorilla/websocket
        go get github.com/vmihailenco/msgpack/v5
    fi

    go build -o ../bench_client_bin main.go
    if [ $? -ne 0 ]; then
        echo "Build failed."
        exit 1
    fi
    cd ..
    echo "Go Client built successfully."
}

# --- 2. Helper Functions ---

cleanup_port() {
    # Find PID using port 3000
    PID=$(lsof -ti:$PORT)
    if [ ! -z "$PID" ]; then
        kill $PID 2>/dev/null
        # Wait for it to actually die
        tail --pid=$PID -f /dev/null 2>/dev/null
    fi
}

wait_for_port_open() {
    local retries=0
    local max_retries=50
    while ! nc -z localhost $PORT 2>/dev/null; do
        sleep 0.1
        retries=$((retries+1))
        if [ $retries -ge $max_retries ]; then return 1; fi
    done
    return 0
}

# --- 3. Define Benchmarks ---

declare -A COMMANDS
COMMANDS["nmn"]="node nmn/index.js"
COMMANDS["wpn"]="node wpn/index.js"
COMMANDS["sn"]="node sn/index.js"
COMMANDS["smn"]="node smn/index.js"
COMMANDS["bh"]="bun run bh/index.ts"
COMMANDS["dd"]="deno run --allow-net --allow-read --allow-env --allow-sys dd/main.ts"
COMMANDS["wmb"]="bun run wmb/index.ts"
COMMANDS["sb"]="bun run sb/index.js"
COMMANDS["dh"]="deno run --allow-net --allow-read --allow-env --allow-sys dh/main.ts"
COMMANDS["sd"]="deno run --allow-net --allow-read --allow-env --allow-sys sd/main.ts"

TARGETS=("nmn" "wpn" "sn" "bh" "dd" "wmb" "sb" "dh" "sd")

# --- 4. Execution Logic ---

run_target() {
    local TARGET=$1
    local CMD=${COMMANDS[$TARGET]}
    local PHASE=$2

    echo "------------------------------------------------"
    echo "Target: $TARGET | Phase: $PHASE"
    echo "Command: $CMD"

    cleanup_port

    # Start Server
    $CMD > /dev/null 2>&1 &
    SERVER_PID=$!

    if wait_for_port_open; then
        # Run the Go Client
        # The Go client handles the progress bar (stderr) and output (stdout)
        OUTPUT=$($BENCH_BIN "$TARGET")

        # Extract PPM (Packets Per Minute / Total Count) from JSON output
        # Example output: {"target":"nmn","ppm":150000}
        PPM=$(echo $OUTPUT | grep -o '"ppm": *[0-9]*' | awk -F: '{print $2}')

        if [ -z "$PPM" ]; then PPM=0; fi

        echo "Result: $PPM total packets"

        # Save to temp file
        echo "{\"target\": \"$TARGET\", \"phase\": \"$PHASE\", \"ppm\": $PPM}" >> $TEMP_RESULTS

    else
        echo "  FAILED: Server did not start on port $PORT"
        echo "{\"target\": \"$TARGET\", \"phase\": \"$PHASE\", \"ppm\": 0}" >> $TEMP_RESULTS
    fi

    # Cleanup
    kill -SIGTERM $SERVER_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null
    cleanup_port

    # Cool down
    echo "  Cooling down (2s)..."
    sleep 2
}

# --- 5. Main Script ---

build_go_client
echo "" > $TEMP_RESULTS

echo "=================================="
echo "PHASE 1: Forward Order"
echo "=================================="

for TARGET in "${TARGETS[@]}"; do
    run_target "$TARGET" "1"
done

echo ""
echo "=================================="
echo "PHASE 2: Reverse Order"
echo "=================================="

# Loop backwards
for (( i=${#TARGETS[@]}-1; i>=0; i-- )); do
    TARGET=${TARGETS[$i]}
    run_target "$TARGET" "2"
done

# --- 6. Python Analysis ---

echo ""
echo "=================================="
echo "Generating Final Leaderboard"
echo "=================================="

python3 << 'EOF'
import json
import sys

results = {}

try:
    with open('temp_results.jsonl', 'r') as f:
        for line in f:
            if not line.strip(): continue
            data = json.loads(line)
            name = data['target']
            phase = data['phase']
            ppm = int(data['ppm'])

            if name not in results:
                results[name] = {'p1': 0, 'p2': 0}

            if phase == "1": results[name]['p1'] = ppm
            if phase == "2": results[name]['p2'] = ppm
except FileNotFoundError:
    print("No results found.")
    sys.exit(1)

final_list = []
for name, scores in results.items():
    p1 = scores['p1']
    p2 = scores['p2']
    avg = (p1 + p2) / 2

    final_list.append({
        'name': name,
        'p1': p1,
        'p2': p2,
        'avg': avg
    })

final_list.sort(key=lambda x: x['avg'], reverse=True)

print(f"{'Rank':<6}{'Target':<8}{'Phase 1':<12}{'Phase 2':<12}{'Average':<12}{'Diff %':<10}")
print("-" * 60)

for i, r in enumerate(final_list, 1):
    if r['avg'] > 0:
        diff = abs(r['p1'] - r['p2'])
        diff_pct = (diff / r['avg']) * 100
        print(f"{i:<6}{r['name']:<8}{r['p1']:<12}{r['p2']:<12}{r['avg']:<12.0f}{diff_pct:>5.1f}%")
    else:
        print(f"{'--':<6}{r['name']:<8}{'FAILED':<24}")
EOF
