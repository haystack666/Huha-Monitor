package config

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"time"
)

type Config struct {
	ServerURL     string
	AgentID       string
	Version       string
	FastInterval  time.Duration
	SlowInterval  time.Duration
	InfoInterval  time.Duration
	ReconnectWait time.Duration
}

func Load() Config {
	return Config{
		ServerURL:     readString("HUHA_SERVER_URL", "ws://localhost:4000/ws/agent"),
		AgentID:       readString("HUHA_AGENT_ID", "agent-"+randomSuffix(6)),
		Version:       readString("HUHA_PROBE_VERSION", "0.1.0"),
		FastInterval:  readDuration("HUHA_FAST_INTERVAL", time.Second),
		SlowInterval:  readDuration("HUHA_SLOW_INTERVAL", 5*time.Second),
		InfoInterval:  readDuration("HUHA_INFO_INTERVAL", 60*time.Second),
		ReconnectWait: readDuration("HUHA_RECONNECT_WAIT", 3*time.Second),
	}
}

func readString(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func readDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	duration, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return duration
}

func randomSuffix(size int) string {
	raw := make([]byte, size)
	if _, err := rand.Read(raw); err != nil {
		return "local"
	}
	return hex.EncodeToString(raw)[:size]
}
