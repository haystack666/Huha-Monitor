package main

import (
	"log"
	"time"

	"github.com/huha/probe-go/internal/config"
	"github.com/huha/probe-go/internal/reporter"
	"github.com/huha/probe-go/internal/system"
)

func main() {
	cfg := config.Load()
	collector := system.NewCollector(cfg.Version)

	for {
		client := reporter.New(cfg)
		if err := client.Connect(); err != nil {
			log.Printf("probe connect failed: %v", err)
			time.Sleep(cfg.ReconnectWait)
			continue
		}

		if err := sendHello(client, collector, cfg.AgentID); err != nil {
			log.Printf("probe hello failed: %v", err)
			_ = client.Close()
			time.Sleep(cfg.ReconnectWait)
			continue
		}

		if err := runLoop(client, collector, cfg); err != nil {
			log.Printf("probe loop failed: %v", err)
		}

		_ = client.Close()
		time.Sleep(cfg.ReconnectWait)
	}
}

func sendHello(client *reporter.Reporter, collector *system.Collector, agentID string) error {
	hello, err := collector.CollectHello(agentID)
	if err != nil {
		return err
	}

	return client.Send("agent.hello", hello)
}

func runLoop(client *reporter.Reporter, collector *system.Collector, cfg config.Config) error {
	fastTicker := time.NewTicker(cfg.FastInterval)
	slowTicker := time.NewTicker(cfg.SlowInterval)
	infoTicker := time.NewTicker(cfg.InfoInterval)
	defer fastTicker.Stop()
	defer slowTicker.Stop()
	defer infoTicker.Stop()

	if err := emitSystemInfo(client, collector); err != nil {
		return err
	}

	for {
		select {
		case <-fastTicker.C:
			if err := emitFastMetrics(client, collector); err != nil {
				return err
			}
		case <-slowTicker.C:
			if err := emitSlowMetrics(client, collector); err != nil {
				return err
			}
		case <-infoTicker.C:
			if err := emitSystemInfo(client, collector); err != nil {
				return err
			}
		}
	}
}

func emitFastMetrics(client *reporter.Reporter, collector *system.Collector) error {
	payload, err := collector.CollectFastMetrics()
	if err != nil {
		return err
	}
	return client.Send("agent.metrics.fast", payload)
}

func emitSlowMetrics(client *reporter.Reporter, collector *system.Collector) error {
	payload, err := collector.CollectSlowMetrics()
	if err != nil {
		return err
	}
	return client.Send("agent.metrics.slow", payload)
}

func emitSystemInfo(client *reporter.Reporter, collector *system.Collector) error {
	payload, err := collector.CollectSystemInfo()
	if err != nil {
		return err
	}
	return client.Send("agent.info.full", payload)
}
