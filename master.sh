#!/bin/bash

RESULTS_FILE="results.json"
echo "[]" > $RESULTS_FILE

# Function to kill anything on port 3000
cleanup_port() {
    # Kill process using port 3000
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    # Wait for it to die
    while lsof -i:3000 >/dev/null 2>&1; do
        sleep 0.1
    done
}

wait_for_port() {
    local max_retries=30 # 3 seconds roughly (0.1s * 30)
    local retries=0

    # We use nc (netcat) or bash tcp check to see if port 3000 is open
    while ! nc -z localhost 3000 2>/dev/null; do
        sleep 0.1
        retries=$((retries+1))
        if [ $retries -ge $max_retries ]; then
            echo "Timeout waiting for server on port 3000"
            return 1
        fi
    done
    return 0
}

run_benchmark() {
    KEYWORD=$1
    CMD=$2

    echo "=================================="
    echo "Running Benchmark: $KEYWORD"
    echo "Command: $CMD"
    echo "=================================="

    cleanup_port

    # Start Server in background
    $CMD > /dev/null 2>&1 &
    SERVER_PID=$!

    # Wait for server to be actually ready
    if wait_for_port; then
        # Run Client
        OUTPUT=$(node bench_client.js $KEYWORD)

        # Check if output is empty (crashed client)
        if [ -z "$OUTPUT" ]; then
            echo "Error: Client produced no output"
        else
            echo "Result: $OUTPUT"

            # JSON Formatting logic
            # Remove last line (should be ']')
            sed -i '$ d' $RESULTS_FILE
            # Add comma if file has content other than [
            if [ "$(cat $RESULTS_FILE | wc -l)" -gt 1 ]; then
                echo "," >> $RESULTS_FILE
            fi
            echo "$OUTPUT" >> $RESULTS_FILE
            echo "]" >> $RESULTS_FILE
        fi
    else
        echo "Skipping $KEYWORD (Server failed to start)"
    fi

    # Cleanup
    kill $SERVER_PID 2>/dev/null
    cleanup_port
    sleep 1
}

# 1. nmn (Node Native Msgpack)
run_benchmark "nmn" "node nmn/index.js"

# 2. sn (Socket.io Node)
run_benchmark "sn" "node sn/index.js"

# 3. wpn (WS Proto Node)
run_benchmark "wpn" "node wpn/index.js"

# 4. sb (Socket.io Bun)
run_benchmark "sb" "bun run sb/index.js"

# 5. wmb (WS Msgpack Bun)
run_benchmark "wmb" "bun run wmb/index.ts"

# 6. bh (Bun Hono)
run_benchmark "bh" "bun run bh/index.ts"

# 7. be (Bun Elysia)
run_benchmark "be" "bun run be/index.ts"

# 8. sd (Socket.io Deno)
# Use --unstable-byonm to help with node_modules resolution if needed,
# but usually explicitly allowing env/read/net is enough with the db_bench fix.
run_benchmark "sd" "deno run --allow-net --allow-read --allow-env --allow-sys sd/main.ts"

# 9. dh (Deno Hono)
run_benchmark "dh" "deno run --allow-net --allow-read --allow-env --allow-sys dh/main.ts"

# 10. dd (Deno Native)
run_benchmark "dd" "deno run --allow-net --allow-read --allow-env --allow-sys dd/main.ts"

echo "=================================="
echo "Benchmarks Complete. Results:"
cat $RESULTS_FILE
