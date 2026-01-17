package main

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"net/url"
	"os"
	"reflect"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/vmihailenco/msgpack/v5"
)

// --- Configuration ---
const (
	Port     = "3000"
	Duration = 60 * time.Second
)

// --- Data Structures ---

type Result struct {
	Target           string `json:"target"`
	PPM              int64  `json:"ppm"`
	Verified         int64  `json:"verified,omitempty"`
	VerificationRate string `json:"verificationRate,omitempty"`
}

type PayloadContainer struct {
	Payload  interface{} `json:"payload,omitempty" msgpack:"payload,omitempty"`
	Original interface{} `json:"original,omitempty" msgpack:"original,omitempty"`
	Echo     interface{} `json:"echo,omitempty" msgpack:"echo,omitempty"`
	Test     bool        `json:"_test,omitempty" msgpack:"_test,omitempty"`
}

// --- Main Logic ---

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run main.go <target> [--serialize-test]")
		os.Exit(1)
	}

	target := os.Args[1]
	isSerializeTest := len(os.Args) > 2 && os.Args[2] == "--serialize-test"

	// Determine Protocol
	mode := "json"
	if contains([]string{"sb", "sd", "sn"}, target) {
		mode = "socketio"
	} else if contains([]string{"nmn", "wmb"}, target) {
		mode = "msgpack"
	} else if contains([]string{"wpn"}, target) {
		mode = "proto"
	}

	// We print initial log to Stderr so it doesn't break JSON piping
	fmt.Fprintf(os.Stderr, "⚡ Bombarding target: %s (Mode: %s) for %s...\n", target, mode, Duration)

	// Run Benchmark
	count, verified := runBenchmark(target, mode, isSerializeTest)

	// Clear progress bar line
	fmt.Fprintf(os.Stderr, "\r%s\r", strings.Repeat(" ", 80))

	// Output JSON result to Stdout
	res := Result{
		Target: target,
		PPM:    count,
	}

	if isSerializeTest {
		res.Verified = verified
		rate := 0.0
		if count > 0 {
			rate = (float64(verified) / float64(count)) * 100
		}
		res.VerificationRate = fmt.Sprintf("%.2f%%", rate)
	}

	jsonBytes, _ := json.Marshal(res)
	fmt.Println(string(jsonBytes))
}

func runBenchmark(target, mode string, isSerializeTest bool) (int64, int64) {
	interrupt := make(chan struct{})

	// Atomic counters for thread-safe access by UI
	var count int64
	var verified int64

	// Start Progress Bar UI in background
	go startProgressBar(&count, Duration, interrupt)

	// Timer
	go func() {
		time.Sleep(Duration)
		close(interrupt)
	}()

	// Socket IO setup
	u := url.URL{Scheme: "ws", Host: "localhost:" + Port, Path: "/"}
	if mode == "socketio" {
		u.Path = "/socket.io/"
		q := u.Query()
		q.Set("EIO", "4")
		q.Set("transport", "websocket")
		u.RawQuery = q.Encode()
	}

	c, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "\nConnection error: %v\n", err)
		return 0, 0
	}
	defer c.Close()

	// Handle Socket.IO Handshake
	if mode == "socketio" {
		_, _, err := c.ReadMessage()
		if err != nil {
			return 0, 0
		}
		c.WriteMessage(websocket.TextMessage, []byte("40"))
		_, _, err = c.ReadMessage()
		if err != nil {
			return 0, 0
		}
	}

	for {
		select {
		case <-interrupt:
			return atomic.LoadInt64(&count), atomic.LoadInt64(&verified)
		default:
			// 1. Prepare Payload
			var msgData []byte
			var originalData interface{}

			if isSerializeTest {
				originalData = generateRandomData(0, 4)

				if mode == "msgpack" {
					msgData, _ = msgpack.Marshal(PayloadContainer{Original: originalData, Echo: originalData, Test: true})
				} else if mode == "proto" {
					jsonInner, _ := json.Marshal(PayloadContainer{Original: originalData, Echo: originalData, Test: true})
					msgData = encodeProto(string(jsonInner))
				} else if mode == "socketio" {
					payload := PayloadContainer{Payload: originalData, Test: true}
					jsonBytes, _ := json.Marshal(payload)
					msgData = []byte(fmt.Sprintf(`42["message",%s]`, string(jsonBytes)))
				} else {
					msgData, _ = json.Marshal(PayloadContainer{Original: originalData, Echo: originalData, Test: true})
				}
			} else {
				if mode == "msgpack" {
					msgData, _ = msgpack.Marshal(PayloadContainer{Payload: "benchmark"})
				} else if mode == "proto" {
					msgData = encodeProto("benchmark")
				} else if mode == "socketio" {
					msgData = []byte(`42["message",{"payload":"benchmark"}]`)
				} else {
					msgData, _ = json.Marshal(PayloadContainer{Payload: "benchmark"})
				}
			}

			// 2. Send
			msgType := websocket.BinaryMessage
			if mode == "json" || mode == "socketio" {
				msgType = websocket.TextMessage
			}

			err := c.WriteMessage(msgType, msgData)
			if err != nil {
				return atomic.LoadInt64(&count), atomic.LoadInt64(&verified)
			}

			// 3. Receive
			_, message, err := c.ReadMessage()
			if err != nil {
				return atomic.LoadInt64(&count), atomic.LoadInt64(&verified)
			}

			// Atomic increment
			atomic.AddInt64(&count, 1)

			// 4. Verify (if needed)
			if isSerializeTest {
				var echoData interface{}

				// Decoding logic...
				if mode == "msgpack" {
					var decoded PayloadContainer
					msgpack.Unmarshal(message, &decoded)
					if decoded.Original != nil {
						echoData = decoded.Echo
					} else {
						echoData = decoded.Payload
					}
				} else if mode == "proto" {
					innerJson := decodeProto(message)
					var decoded PayloadContainer
					json.Unmarshal([]byte(innerJson), &decoded)
					if decoded.Original != nil {
						echoData = decoded.Echo
					} else {
						echoData = decoded.Payload
					}
				} else if mode == "socketio" {
					strMsg := string(message)
					if strings.HasPrefix(strMsg, "42") {
						jsonPart := strMsg[2:]
						var frame []interface{}
						json.Unmarshal([]byte(jsonPart), &frame)
						if len(frame) > 1 {
							dataMap := frame[1].(map[string]interface{})
							if val, ok := dataMap["original"]; ok {
								echoData = val
								if e, ok := dataMap["echo"]; ok {
									echoData = e
								}
							} else if val, ok := dataMap["payload"]; ok {
								echoData = val
								if e, ok := dataMap["echo"]; ok {
									echoData = e
								}
							}
						}
					}
				} else {
					var decoded PayloadContainer
					json.Unmarshal(message, &decoded)
					if decoded.Original != nil {
						echoData = decoded.Echo
					} else {
						echoData = decoded.Payload
					}
				}

				if reflect.DeepEqual(originalData, echoData) {
					atomic.AddInt64(&verified, 1)
				}
			}
		}
	}
}

// --- UI Logic ---

func startProgressBar(count *int64, totalDuration time.Duration, interrupt chan struct{}) {
	ticker := time.NewTicker(250 * time.Millisecond)
	startTime := time.Now()

	// Colors
	reset := "\033[0m"
	cyan := "\033[36m"
	green := "\033[32m"

	var lastCount int64 = 0
	var lastTime = startTime

	for {
		select {
		case <-interrupt:
			ticker.Stop()
			return
		case <-ticker.C:
			current := atomic.LoadInt64(count)
			now := time.Now()
			elapsed := now.Sub(startTime)

			// Calculate Instant RPS (Requests per second)
			deltaCount := current - lastCount
			deltaTime := now.Sub(lastTime).Seconds()
			rps := 0.0
			if deltaTime > 0 {
				rps = float64(deltaCount) / deltaTime
			}

			// Update tracking variables
			lastCount = current
			lastTime = now

			// Calculate Progress Bar
			percent := math.Min(100, (elapsed.Seconds()/totalDuration.Seconds())*100)
			barWidth := 30
			filled := int((percent / 100) * float64(barWidth))
			bar := strings.Repeat("█", filled) + strings.Repeat("░", barWidth-filled)

			// Print to Stderr (Carriage return \r to overwrite line)
			fmt.Fprintf(os.Stderr, "\r%s[%s] %.1f%% | Total: %d | %s%0.f req/s%s   ",
				cyan, bar, percent, current, green, rps, reset)
		}
	}
}

// --- Protocol Buffers Helper (Manual) ---

func encodeProto(payload string) []byte {
	data := []byte(payload)
	length := uint64(len(data))
	buf := []byte{0x0A}
	for length >= 0x80 {
		buf = append(buf, byte(length)|0x80)
		length >>= 7
	}
	buf = append(buf, byte(length))
	buf = append(buf, data...)
	return buf
}

func decodeProto(data []byte) string {
	if len(data) == 0 {
		return ""
	}
	if data[0] != 0x0A {
		return ""
	}
	idx := 1
	var length uint64
	var shift uint
	for {
		if idx >= len(data) {
			return ""
		}
		b := data[idx]
		idx++
		length |= uint64(b&0x7F) << shift
		if b < 0x80 {
			break
		}
		shift += 7
	}
	end := idx + int(length)
	if end > len(data) {
		return ""
	}
	return string(data[idx:end])
}

// --- Helpers ---

func contains(s []string, e string) bool {
	for _, a := range s {
		if a == e {
			return true
		}
	}
	return false
}

func generateRandomData(depth, maxDepth int) interface{} {
	types := []string{"string", "number", "boolean", "array", "object"}
	typeChoice := types[rand.Intn(len(types))]
	if depth >= maxDepth {
		if rand.Float32() > 0.5 {
			return "leaf"
		}
		return 42.0
	}
	switch typeChoice {
	case "string":
		return randomString(10 + rand.Intn(20))
	case "number":
		return float64(rand.Intn(10000))
	case "boolean":
		return rand.Intn(2) == 1
	case "array":
		length := 1 + rand.Intn(5)
		arr := make([]interface{}, length)
		for i := 0; i < length; i++ {
			arr[i] = generateRandomData(depth+1, maxDepth)
		}
		return arr
	case "object":
		length := 1 + rand.Intn(5)
		obj := make(map[string]interface{})
		for i := 0; i < length; i++ {
			obj["key_"+randomString(6)] = generateRandomData(depth+1, maxDepth)
		}
		return obj
	}
	return nil
}

func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}
