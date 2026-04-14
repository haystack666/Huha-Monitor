package system

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/huha/probe-go/internal/protocol"
)

type Collector struct {
	version       string
	previousCPU   cpuSnapshot
	previousNet   netSnapshot
	previousNetAt time.Time
}

type cpuSnapshot struct {
	idle  uint64
	total uint64
}

type netSnapshot struct {
	rx uint64
	tx uint64
}

func NewCollector(version string) *Collector {
	return &Collector{
		version: version,
	}
}

func (c *Collector) CollectHello(agentID string) (protocol.HelloPayload, error) {
	hostname, err := os.Hostname()
	if err != nil {
		return protocol.HelloPayload{}, err
	}

	return protocol.HelloPayload{
		AgentID:  agentID,
		Hostname: hostname,
		Platform: runtime.GOOS,
		Arch:     runtime.GOARCH,
		Version:  c.version,
		IP:       primaryIP(),
	}, nil
}

func (c *Collector) CollectFastMetrics() (protocol.FastMetricsPayload, error) {
	switch runtime.GOOS {
	case "linux":
		return c.collectLinuxFastMetrics()
	case "darwin":
		return c.collectDarwinFastMetrics()
	case "windows":
		return c.collectWindowsFastMetrics()
	default:
		return protocol.FastMetricsPayload{}, fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
}

func (c *Collector) CollectSlowMetrics() (protocol.SlowMetricsPayload, error) {
	switch runtime.GOOS {
	case "linux":
		return collectLinuxSlowMetrics()
	case "darwin":
		return collectDarwinSlowMetrics()
	case "windows":
		return collectWindowsSlowMetrics()
	default:
		return protocol.SlowMetricsPayload{}, fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
}

func (c *Collector) CollectSystemInfo() (protocol.SystemInfoPayload, error) {
	switch runtime.GOOS {
	case "linux":
		return c.collectLinuxSystemInfo()
	case "darwin":
		return c.collectDarwinSystemInfo()
	case "windows":
		return c.collectWindowsSystemInfo()
	default:
		return protocol.SystemInfoPayload{}, fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
}

func primaryIP() string {
	interfaces, err := net.Interfaces()
	if err != nil {
		return ""
	}

	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok || ipNet.IP.IsLoopback() {
				continue
			}
			if ipv4 := ipNet.IP.To4(); ipv4 != nil {
				return ipv4.String()
			}
		}
	}

	return ""
}

func (c *Collector) collectLinuxFastMetrics() (protocol.FastMetricsPayload, error) {
	cpuUsage, err := c.linuxCPUUsage()
	if err != nil {
		return protocol.FastMetricsPayload{}, err
	}

	memTotal, memAvailable, err := linuxMemory()
	if err != nil {
		return protocol.FastMetricsPayload{}, err
	}

	load1, load5, load15, err := linuxLoad()
	if err != nil {
		return protocol.FastMetricsPayload{}, err
	}

	rxRate, txRate, err := c.linuxNetworkRate()
	if err != nil {
		return protocol.FastMetricsPayload{}, err
	}

	memUsed := memTotal - memAvailable
	memUsage := float64(0)
	if memTotal > 0 {
		memUsage = float64(memUsed) * 100 / float64(memTotal)
	}

	return protocol.FastMetricsPayload{
		CPUUsage:         cpuUsage,
		MemoryUsage:      memUsage,
		MemoryUsedBytes:  memUsed,
		MemoryTotalBytes: memTotal,
		Load1:            load1,
		Load5:            load5,
		Load15:           load15,
		RXBytesPerSec:    rxRate,
		TXBytesPerSec:    txRate,
	}, nil
}

func collectLinuxSlowMetrics() (protocol.SlowMetricsPayload, error) {
	disks, err := linuxDisks()
	if err != nil {
		return protocol.SlowMetricsPayload{}, err
	}

	processes, err := linuxTopProcesses()
	if err != nil {
		return protocol.SlowMetricsPayload{}, err
	}

	return protocol.SlowMetricsPayload{
		Disks:        disks,
		TopProcesses: processes,
	}, nil
}

func (c *Collector) collectLinuxSystemInfo() (protocol.SystemInfoPayload, error) {
	hostname, err := os.Hostname()
	if err != nil {
		return protocol.SystemInfoPayload{}, err
	}

	memTotal, _, err := linuxMemory()
	if err != nil {
		return protocol.SystemInfoPayload{}, err
	}

	kernelVersion, _ := commandOutput("uname", "-r")
	cpuModel, _ := linuxCPUModel()
	uptime, _ := linuxUptime()

	networkInterfaces, err := activeInterfaces()
	if err != nil {
		return protocol.SystemInfoPayload{}, err
	}

	return protocol.SystemInfoPayload{
		Hostname:          hostname,
		Platform:          runtime.GOOS,
		Arch:              runtime.GOARCH,
		KernelVersion:     strings.TrimSpace(kernelVersion),
		CPUModel:          cpuModel,
		CPUCores:          runtime.NumCPU(),
		TotalMemoryBytes:  memTotal,
		UptimeSeconds:     uptime,
		NetworkInterfaces: networkInterfaces,
		ProbeVersion:      c.version,
	}, nil
}

func (c *Collector) linuxCPUUsage() (float64, error) {
	file, err := os.Open("/proc/stat")
	if err != nil {
		return 0, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	if !scanner.Scan() {
		return 0, errors.New("missing /proc/stat cpu line")
	}

	fields := strings.Fields(scanner.Text())
	if len(fields) < 8 {
		return 0, errors.New("invalid /proc/stat format")
	}

	var values []uint64
	for _, field := range fields[1:] {
		value, err := strconv.ParseUint(field, 10, 64)
		if err != nil {
			return 0, err
		}
		values = append(values, value)
	}

	total := uint64(0)
	for _, value := range values {
		total += value
	}

	idle := values[3]
	if len(values) > 4 {
		idle += values[4]
	}

	if c.previousCPU.total == 0 {
		c.previousCPU = cpuSnapshot{idle: idle, total: total}
		return 0, nil
	}

	totalDelta := total - c.previousCPU.total
	idleDelta := idle - c.previousCPU.idle
	c.previousCPU = cpuSnapshot{idle: idle, total: total}
	if totalDelta == 0 {
		return 0, nil
	}

	return float64(totalDelta-idleDelta) * 100 / float64(totalDelta), nil
}

func linuxMemory() (uint64, uint64, error) {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0, err
	}
	defer file.Close()

	var total uint64
	var available uint64

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case strings.HasPrefix(line, "MemTotal:"):
			total = parseMeminfoLine(line)
		case strings.HasPrefix(line, "MemAvailable:"):
			available = parseMeminfoLine(line)
		}
	}

	if total == 0 {
		return 0, 0, errors.New("MemTotal missing")
	}

	return total, available, nil
}

func linuxLoad() (float64, float64, float64, error) {
	content, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return 0, 0, 0, err
	}

	fields := strings.Fields(string(content))
	if len(fields) < 3 {
		return 0, 0, 0, errors.New("invalid loadavg")
	}

	load1, _ := strconv.ParseFloat(fields[0], 64)
	load5, _ := strconv.ParseFloat(fields[1], 64)
	load15, _ := strconv.ParseFloat(fields[2], 64)
	return load1, load5, load15, nil
}

func (c *Collector) linuxNetworkRate() (float64, float64, error) {
	file, err := os.Open("/proc/net/dev")
	if err != nil {
		return 0, 0, err
	}
	defer file.Close()

	var rx uint64
	var tx uint64

	scanner := bufio.NewScanner(file)
	lineIndex := 0
	for scanner.Scan() {
		lineIndex++
		if lineIndex <= 2 {
			continue
		}

		parts := strings.Split(scanner.Text(), ":")
		if len(parts) != 2 {
			continue
		}

		iface := strings.TrimSpace(parts[0])
		if iface == "lo" {
			continue
		}

		fields := strings.Fields(parts[1])
		if len(fields) < 16 {
			continue
		}

		rxBytes, _ := strconv.ParseUint(fields[0], 10, 64)
		txBytes, _ := strconv.ParseUint(fields[8], 10, 64)
		rx += rxBytes
		tx += txBytes
	}

	now := time.Now()
	if c.previousNetAt.IsZero() {
		c.previousNet = netSnapshot{rx: rx, tx: tx}
		c.previousNetAt = now
		return 0, 0, nil
	}

	elapsed := now.Sub(c.previousNetAt).Seconds()
	rxRate := float64(0)
	txRate := float64(0)
	if elapsed > 0 {
		rxRate = float64(rx-c.previousNet.rx) / elapsed
		txRate = float64(tx-c.previousNet.tx) / elapsed
	}

	c.previousNet = netSnapshot{rx: rx, tx: tx}
	c.previousNetAt = now
	return rxRate, txRate, nil
}

func linuxDisks() ([]protocol.DiskMetric, error) {
	output, err := commandOutput("df", "-kP")
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) <= 1 {
		return nil, nil
	}

	disks := make([]protocol.DiskMetric, 0, len(lines)-1)
	for _, line := range lines[1:] {
		fields := strings.Fields(line)
		if len(fields) < 6 {
			continue
		}

		totalKB, _ := strconv.ParseUint(fields[1], 10, 64)
		usedKB, _ := strconv.ParseUint(fields[2], 10, 64)
		usageText := strings.TrimSuffix(fields[4], "%")
		usage, _ := strconv.ParseFloat(usageText, 64)

		disks = append(disks, protocol.DiskMetric{
			Name:       fields[0],
			Mountpoint: fields[5],
			TotalBytes: totalKB * 1024,
			UsedBytes:  usedKB * 1024,
			Usage:      usage,
		})
	}

	return disks, nil
}

func linuxTopProcesses() ([]protocol.ProcessMetric, error) {
	output, err := commandOutput("ps", "-eo", "pid,ppid,pcpu,pmem,rss,comm", "--sort=-pcpu")
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) <= 1 {
		return nil, nil
	}

	processes := make([]protocol.ProcessMetric, 0, 5)
	for _, line := range lines[1:] {
		if len(processes) == 5 {
			break
		}

		fields := strings.Fields(line)
		if len(fields) < 6 {
			continue
		}

		pid, _ := strconv.Atoi(fields[0])
		ppid, _ := strconv.Atoi(fields[1])
		cpuUsage, _ := strconv.ParseFloat(fields[2], 64)
		memUsage, _ := strconv.ParseFloat(fields[3], 64)
		rssKB, _ := strconv.ParseUint(fields[4], 10, 64)

		processes = append(processes, protocol.ProcessMetric{
			PID:         pid,
			PPID:        ppid,
			Name:        fields[5],
			CPUUsage:    cpuUsage,
			MemoryUsage: memUsage,
			RSSBytes:    rssKB * 1024,
		})
	}

	return processes, nil
}

func linuxCPUModel() (string, error) {
	content, err := os.ReadFile("/proc/cpuinfo")
	if err != nil {
		return "", err
	}

	for _, line := range strings.Split(string(content), "\n") {
		if strings.HasPrefix(line, "model name") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1]), nil
			}
		}
	}

	return "", nil
}

func linuxUptime() (uint64, error) {
	content, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0, err
	}

	fields := strings.Fields(string(content))
	if len(fields) == 0 {
		return 0, errors.New("invalid uptime")
	}

	seconds, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0, err
	}

	return uint64(seconds), nil
}

func (c *Collector) collectDarwinFastMetrics() (protocol.FastMetricsPayload, error) {
	memTotal, memUsed, err := darwinMemory()
	if err != nil {
		return protocol.FastMetricsPayload{}, err
	}

	cpuUsage, _ := darwinCPUUsage()
	load1, load5, load15, _ := darwinLoad()
	rxRate, txRate, err := c.darwinNetworkRate()
	if err != nil {
		return protocol.FastMetricsPayload{}, err
	}

	memUsage := float64(0)
	if memTotal > 0 {
		memUsage = float64(memUsed) * 100 / float64(memTotal)
	}

	return protocol.FastMetricsPayload{
		CPUUsage:         cpuUsage,
		MemoryUsage:      memUsage,
		MemoryUsedBytes:  memUsed,
		MemoryTotalBytes: memTotal,
		Load1:            load1,
		Load5:            load5,
		Load15:           load15,
		RXBytesPerSec:    rxRate,
		TXBytesPerSec:    txRate,
	}, nil
}

func (c *Collector) darwinNetworkRate() (float64, float64, error) {
	output, err := commandOutput("netstat", "-ibn")
	if err != nil {
		return 0, 0, err
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) <= 1 {
		return 0, 0, nil
	}

	interfaceTraffic := make(map[string]netSnapshot)
	for _, line := range lines[1:] {
		fields := strings.Fields(line)
		if len(fields) < 10 {
			continue
		}

		iface := fields[0]
		if shouldSkipDarwinInterface(iface) {
			continue
		}

		if len(fields) < 11 {
			continue
		}

		ibytesIndex, obytesIndex := len(fields)-5, len(fields)-2
		rxBytes, errRx := strconv.ParseUint(fields[ibytesIndex], 10, 64)
		txBytes, errTx := strconv.ParseUint(fields[obytesIndex], 10, 64)
		if errRx != nil || errTx != nil {
			continue
		}

		current := interfaceTraffic[iface]
		if rxBytes > current.rx {
			current.rx = rxBytes
		}
		if txBytes > current.tx {
			current.tx = txBytes
		}
		interfaceTraffic[iface] = current
	}

	var rx uint64
	var tx uint64
	for _, traffic := range interfaceTraffic {
		rx += traffic.rx
		tx += traffic.tx
	}

	now := time.Now()
	if c.previousNetAt.IsZero() {
		c.previousNet = netSnapshot{rx: rx, tx: tx}
		c.previousNetAt = now
		return 0, 0, nil
	}

	elapsed := now.Sub(c.previousNetAt).Seconds()
	rxRate := float64(0)
	txRate := float64(0)
	if elapsed > 0 {
		if rx >= c.previousNet.rx {
			rxRate = float64(rx-c.previousNet.rx) / elapsed
		}
		if tx >= c.previousNet.tx {
			txRate = float64(tx-c.previousNet.tx) / elapsed
		}
	}

	c.previousNet = netSnapshot{rx: rx, tx: tx}
	c.previousNetAt = now
	return rxRate, txRate, nil
}

func shouldSkipDarwinInterface(name string) bool {
	switch {
	case name == "lo0":
		return true
	case strings.HasPrefix(name, "bridge"):
		return true
	case strings.HasPrefix(name, "awdl"):
		return true
	case strings.HasPrefix(name, "llw"):
		return true
	default:
		return false
	}
}

func collectDarwinSlowMetrics() (protocol.SlowMetricsPayload, error) {
	disks, err := darwinDisks()
	if err != nil {
		return protocol.SlowMetricsPayload{}, err
	}

	processes, err := darwinTopProcesses()
	if err != nil {
		return protocol.SlowMetricsPayload{}, err
	}

	return protocol.SlowMetricsPayload{
		Disks:        disks,
		TopProcesses: processes,
	}, nil
}

func darwinDisks() ([]protocol.DiskMetric, error) {
	output, err := commandOutput("df", "-kP")
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) <= 1 {
		return nil, nil
	}

	disks := make([]protocol.DiskMetric, 0, len(lines)-1)
	for _, line := range lines[1:] {
		fields := strings.Fields(line)
		if len(fields) < 6 {
			continue
		}

		totalKB, _ := strconv.ParseUint(fields[1], 10, 64)
		usedKB, _ := strconv.ParseUint(fields[2], 10, 64)
		usageText := strings.TrimSuffix(fields[4], "%")
		usage, _ := strconv.ParseFloat(usageText, 64)

		disks = append(disks, protocol.DiskMetric{
			Name:       fields[0],
			Mountpoint: fields[5],
			TotalBytes: totalKB * 1024,
			UsedBytes:  usedKB * 1024,
			Usage:      usage,
		})
	}

	return disks, nil
}

func darwinTopProcesses() ([]protocol.ProcessMetric, error) {
	output, err := commandOutput("ps", "-axo", "pid,ppid,%cpu,%mem,rss,comm", "-r")
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) <= 1 {
		return nil, nil
	}

	processes := make([]protocol.ProcessMetric, 0, 5)
	for _, line := range lines[1:] {
		if len(processes) == 5 {
			break
		}

		fields := strings.Fields(line)
		if len(fields) < 6 {
			continue
		}

		pid, _ := strconv.Atoi(fields[0])
		ppid, _ := strconv.Atoi(fields[1])
		cpuUsage, _ := strconv.ParseFloat(fields[2], 64)
		memUsage, _ := strconv.ParseFloat(fields[3], 64)
		rssKB, _ := strconv.ParseUint(fields[4], 10, 64)

		processes = append(processes, protocol.ProcessMetric{
			PID:         pid,
			PPID:        ppid,
			Name:        fields[5],
			CPUUsage:    cpuUsage,
			MemoryUsage: memUsage,
			RSSBytes:    rssKB * 1024,
		})
	}

	return processes, nil
}

func (c *Collector) collectDarwinSystemInfo() (protocol.SystemInfoPayload, error) {
	hostname, err := os.Hostname()
	if err != nil {
		return protocol.SystemInfoPayload{}, err
	}

	memTotal, _, err := darwinMemory()
	if err != nil {
		return protocol.SystemInfoPayload{}, err
	}

	kernelVersion, _ := commandOutput("uname", "-r")
	cpuModel, _ := commandOutput("sysctl", "-n", "machdep.cpu.brand_string")
	uptime, _ := darwinUptime()
	networkInterfaces, _ := activeInterfaces()

	return protocol.SystemInfoPayload{
		Hostname:          hostname,
		Platform:          runtime.GOOS,
		Arch:              runtime.GOARCH,
		KernelVersion:     strings.TrimSpace(kernelVersion),
		CPUModel:          strings.TrimSpace(cpuModel),
		CPUCores:          runtime.NumCPU(),
		TotalMemoryBytes:  memTotal,
		UptimeSeconds:     uptime,
		NetworkInterfaces: networkInterfaces,
		ProbeVersion:      c.version,
	}, nil
}

func darwinMemory() (uint64, uint64, error) {
	totalOutput, err := commandOutput("sysctl", "-n", "hw.memsize")
	if err != nil {
		return 0, 0, err
	}

	totalBytes, err := strconv.ParseUint(strings.TrimSpace(totalOutput), 10, 64)
	if err != nil {
		return 0, 0, err
	}

	vmStatOutput, err := commandOutput("vm_stat")
	if err != nil {
		return 0, 0, err
	}

	pageSize := uint64(4096)
	var active uint64
	var wired uint64
	var compressed uint64

	for _, line := range strings.Split(vmStatOutput, "\n") {
		if strings.Contains(line, "page size of") {
			fields := strings.Fields(line)
			if len(fields) >= 8 {
				if value, parseErr := strconv.ParseUint(fields[7], 10, 64); parseErr == nil {
					pageSize = value
				}
			}
			continue
		}

		switch {
		case strings.HasPrefix(line, "Pages active:"):
			active = parseVMStatPages(line)
		case strings.HasPrefix(line, "Pages wired down:"):
			wired = parseVMStatPages(line)
		case strings.HasPrefix(line, "Pages occupied by compressor:"):
			compressed = parseVMStatPages(line)
		}
	}

	usedBytes := (active + wired + compressed) * pageSize
	return totalBytes, usedBytes, nil
}

func darwinCPUUsage() (float64, error) {
	output, err := commandOutput("top", "-l", "1", "-n", "0")
	if err != nil {
		return 0, err
	}

	for _, line := range strings.Split(output, "\n") {
		if !strings.Contains(line, "CPU usage:") {
			continue
		}

		parts := strings.Split(line, ":")
		if len(parts) != 2 {
			break
		}

		segments := strings.Split(parts[1], ",")
		if len(segments) < 3 {
			break
		}

		userValue, _ := parseLeadingFloat(segments[0])
		systemValue, _ := parseLeadingFloat(segments[1])
		return userValue + systemValue, nil
	}

	return 0, nil
}

func darwinLoad() (float64, float64, float64, error) {
	output, err := commandOutput("sysctl", "-n", "vm.loadavg")
	if err != nil {
		return 0, 0, 0, err
	}

	trimmed := strings.Trim(strings.TrimSpace(output), "{}")
	fields := strings.Fields(trimmed)
	if len(fields) < 3 {
		return 0, 0, 0, nil
	}

	load1, _ := strconv.ParseFloat(fields[0], 64)
	load5, _ := strconv.ParseFloat(fields[1], 64)
	load15, _ := strconv.ParseFloat(fields[2], 64)
	return load1, load5, load15, nil
}

func darwinUptime() (uint64, error) {
	output, err := commandOutput("sysctl", "-n", "kern.boottime")
	if err != nil {
		return 0, err
	}

	start := strings.Index(output, "sec = ")
	if start == -1 {
		return 0, nil
	}

	start += len("sec = ")
	end := strings.Index(output[start:], ",")
	if end == -1 {
		return 0, nil
	}

	bootSec, err := strconv.ParseInt(output[start:start+end], 10, 64)
	if err != nil {
		return 0, err
	}

	return uint64(time.Now().Unix() - bootSec), nil
}

func (c *Collector) collectWindowsFastMetrics() (protocol.FastMetricsPayload, error) {
	output, err := commandOutput("powershell", "-NoProfile", "-Command", "(Get-Counter '\\Processor(_Total)\\% Processor Time').CounterSamples[0].CookedValue")
	if err != nil {
		return protocol.FastMetricsPayload{}, err
	}

	cpuUsage, _ := strconv.ParseFloat(strings.TrimSpace(output), 64)

	memOutput, err := commandOutput("powershell", "-NoProfile", "-Command", "$os=Get-CimInstance Win32_OperatingSystem; \"$($os.TotalVisibleMemorySize),$($os.FreePhysicalMemory)\"")
	if err != nil {
		return protocol.FastMetricsPayload{}, err
	}

	memParts := strings.Split(strings.TrimSpace(memOutput), ",")
	if len(memParts) < 2 {
		return protocol.FastMetricsPayload{}, errors.New("invalid windows memory response")
	}

	totalKB, _ := strconv.ParseUint(memParts[0], 10, 64)
	freeKB, _ := strconv.ParseUint(memParts[1], 10, 64)
	totalBytes := totalKB * 1024
	usedBytes := (totalKB - freeKB) * 1024
	memUsage := float64(0)
	if totalBytes > 0 {
		memUsage = float64(usedBytes) * 100 / float64(totalBytes)
	}

	rxRate, txRate, err := c.windowsNetworkRate()
	if err != nil {
		return protocol.FastMetricsPayload{}, err
	}

	return protocol.FastMetricsPayload{
		CPUUsage:         cpuUsage,
		MemoryUsage:      memUsage,
		MemoryUsedBytes:  usedBytes,
		MemoryTotalBytes: totalBytes,
		RXBytesPerSec:    rxRate,
		TXBytesPerSec:    txRate,
	}, nil
}

func (c *Collector) windowsNetworkRate() (float64, float64, error) {
	script := strings.Join([]string{
		"$items = Get-NetAdapterStatistics |",
		"Where-Object { $_.ReceivedBytes -ne $null -and $_.SentBytes -ne $null } |",
		"Where-Object { $_.Name -notmatch 'Loopback|Teredo|isatap|6to4' } |",
		"Select-Object Name, ReceivedBytes, SentBytes",
		"if ($items) { $items | ConvertTo-Json -Compress } else { '[]' }",
	}, " ")

	output, err := commandOutput("powershell", "-NoProfile", "-Command", script)
	if err != nil {
		return 0, 0, err
	}

	var items []windowsNetworkJSON
	if err := decodeJSONArray(output, &items); err != nil {
		return 0, 0, err
	}

	var rx uint64
	var tx uint64
	for _, item := range items {
		rx += item.RX
		tx += item.TX
	}

	now := time.Now()
	if c.previousNetAt.IsZero() {
		c.previousNet = netSnapshot{rx: rx, tx: tx}
		c.previousNetAt = now
		return 0, 0, nil
	}

	elapsed := now.Sub(c.previousNetAt).Seconds()
	rxRate := float64(0)
	txRate := float64(0)
	if elapsed > 0 {
		if rx >= c.previousNet.rx {
			rxRate = float64(rx-c.previousNet.rx) / elapsed
		}
		if tx >= c.previousNet.tx {
			txRate = float64(tx-c.previousNet.tx) / elapsed
		}
	}

	c.previousNet = netSnapshot{rx: rx, tx: tx}
	c.previousNetAt = now
	return rxRate, txRate, nil
}

func collectWindowsSlowMetrics() (protocol.SlowMetricsPayload, error) {
	disks, err := windowsDisks()
	if err != nil {
		return protocol.SlowMetricsPayload{}, err
	}

	processes, err := windowsTopProcesses()
	if err != nil {
		return protocol.SlowMetricsPayload{}, err
	}

	return protocol.SlowMetricsPayload{
		Disks:        disks,
		TopProcesses: processes,
	}, nil
}

func (c *Collector) collectWindowsSystemInfo() (protocol.SystemInfoPayload, error) {
	hostname, err := os.Hostname()
	if err != nil {
		return protocol.SystemInfoPayload{}, err
	}

	details, err := windowsSystemDetails()
	if err != nil {
		return protocol.SystemInfoPayload{}, err
	}

	cpuCores := details.CPUCores
	if cpuCores == 0 {
		cpuCores = runtime.NumCPU()
	}

	return protocol.SystemInfoPayload{
		Hostname:          hostname,
		Platform:          runtime.GOOS,
		Arch:              runtime.GOARCH,
		KernelVersion:     strings.TrimSpace(details.KernelVersion),
		CPUModel:          strings.TrimSpace(details.CPUModel),
		CPUCores:          cpuCores,
		TotalMemoryBytes:  details.TotalMemoryBytes,
		UptimeSeconds:     details.UptimeSeconds,
		NetworkInterfaces: details.NetworkInterfaces,
		ServiceName:       strings.TrimSpace(details.ServiceName),
		ServiceInstalled:  details.ServiceInstalled,
		ServiceState:      strings.TrimSpace(details.ServiceState),
		ServiceStartMode:  strings.TrimSpace(details.ServiceStartMode),
		ServiceLogPath:    strings.TrimSpace(details.ServiceLogPath),
		ProbeVersion:      c.version,
	}, nil
}

type windowsDiskJSON struct {
	DeviceID  string `json:"DeviceID"`
	Volume    string `json:"VolumeName"`
	Size      uint64 `json:"Size"`
	FreeSpace uint64 `json:"FreeSpace"`
}

type windowsProcessJSON struct {
	PID         int     `json:"PID"`
	PPID        int     `json:"PPID"`
	Name        string  `json:"Name"`
	CPUUsage    float64 `json:"CPUUsage"`
	MemoryUsage float64 `json:"MemoryUsage"`
	RSSBytes    uint64  `json:"RssBytes"`
}

type windowsNetworkJSON struct {
	Name string `json:"Name"`
	RX   uint64 `json:"ReceivedBytes"`
	TX   uint64 `json:"SentBytes"`
}

type windowsSystemInfoJSON struct {
	KernelVersion     string   `json:"KernelVersion"`
	CPUModel          string   `json:"CPUModel"`
	CPUCores          int      `json:"CPUCores"`
	TotalMemoryBytes  uint64   `json:"TotalMemoryBytes"`
	UptimeSeconds     uint64   `json:"UptimeSeconds"`
	NetworkInterfaces []string `json:"NetworkInterfaces"`
	ServiceName       string   `json:"ServiceName"`
	ServiceInstalled  bool     `json:"ServiceInstalled"`
	ServiceState      string   `json:"ServiceState"`
	ServiceStartMode  string   `json:"ServiceStartMode"`
	ServiceLogPath    string   `json:"ServiceLogPath"`
}

func windowsSystemDetails() (windowsSystemInfoJSON, error) {
	script := strings.Join([]string{
		"$os = Get-CimInstance Win32_OperatingSystem",
		"$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name, NumberOfLogicalProcessors",
		"$boot = $os.LastBootUpTime",
		"$uptime = 0",
		"if ($boot) { $uptime = [math]::Max(0, [int64]((Get-Date).ToUniversalTime().Subtract($boot.ToUniversalTime())).TotalSeconds) }",
		"$serviceName = if ($env:HUHA_SERVICE_NAME) { $env:HUHA_SERVICE_NAME } else { 'HUHAProbe' }",
		"$logPath = if ($env:HUHA_LOG_PATH) { [string]$env:HUHA_LOG_PATH } else { '' }",
		"$configDir = ''",
		"if ($logPath) {",
		"  $logDir = Split-Path -Parent $logPath",
		"  if ($logDir) { $configDir = Split-Path -Parent $logDir }",
		"} elseif ($env:LOCALAPPDATA) {",
		"  $configDir = Join-Path $env:LOCALAPPDATA 'HUHA'",
		"}",
		"$runScriptPath = if ($configDir) { Join-Path $configDir 'run-probe.cmd' } else { '' }",
		"$service = Get-CimInstance Win32_Service | Where-Object {",
		"  $_.Name -eq $serviceName -or ($runScriptPath -and $_.PathName -match [Regex]::Escape($runScriptPath))",
		"} | Select-Object -First 1 Name, State, StartMode",
		"$ifaces = Get-CimInstance Win32_NetworkAdapter |",
		"Where-Object { $_.NetEnabled -eq $true -and $_.Name -notmatch 'Loopback|Teredo|isatap|6to4' } |",
		"ForEach-Object { if ($_.NetConnectionID) { [string]$_.NetConnectionID } else { [string]$_.Name } }",
		"$item = [PSCustomObject]@{",
		"  KernelVersion = [string]$os.Version;",
		"  CPUModel = [string]$cpu.Name;",
		"  CPUCores = [int]$cpu.NumberOfLogicalProcessors;",
		"  TotalMemoryBytes = [uint64]([double]$os.TotalVisibleMemorySize * 1024);",
		"  UptimeSeconds = [uint64]$uptime;",
		"  NetworkInterfaces = @($ifaces);",
		"  ServiceName = if ($service) { [string]$service.Name } else { [string]$serviceName };",
		"  ServiceInstalled = [bool]($null -ne $service);",
		"  ServiceState = if ($service) { [string]$service.State } else { '' };",
		"  ServiceStartMode = if ($service) { [string]$service.StartMode } else { '' };",
		"  ServiceLogPath = if ($logPath) { $logPath } else { '' }",
		"}",
		"$item | ConvertTo-Json -Compress -Depth 3",
	}, " ")

	output, err := commandOutput("powershell", "-NoProfile", "-Command", script)
	if err != nil {
		return windowsSystemInfoJSON{}, err
	}

	var item windowsSystemInfoJSON
	if err := json.Unmarshal([]byte(strings.TrimSpace(output)), &item); err != nil {
		return windowsSystemInfoJSON{}, err
	}

	return item, nil
}

func windowsDisks() ([]protocol.DiskMetric, error) {
	script := "$items = Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | " +
		"Select-Object DeviceID, VolumeName, Size, FreeSpace; " +
		"if ($items) { $items | ConvertTo-Json -Compress } else { '[]' }"

	output, err := commandOutput("powershell", "-NoProfile", "-Command", script)
	if err != nil {
		return nil, err
	}

	var items []windowsDiskJSON
	if err := decodeJSONArray(output, &items); err != nil {
		return nil, err
	}

	disks := make([]protocol.DiskMetric, 0, len(items))
	for _, item := range items {
		usedBytes := uint64(0)
		if item.Size >= item.FreeSpace {
			usedBytes = item.Size - item.FreeSpace
		}

		usage := float64(0)
		if item.Size > 0 {
			usage = float64(usedBytes) * 100 / float64(item.Size)
		}

		name := item.DeviceID
		if strings.TrimSpace(item.Volume) != "" {
			name = fmt.Sprintf("%s (%s)", item.DeviceID, item.Volume)
		}

		disks = append(disks, protocol.DiskMetric{
			Name:       name,
			Mountpoint: item.DeviceID,
			TotalBytes: item.Size,
			UsedBytes:  usedBytes,
			Usage:      usage,
		})
	}

	return disks, nil
}

func windowsTopProcesses() ([]protocol.ProcessMetric, error) {
	script := strings.Join([]string{
		"$os = Get-CimInstance Win32_OperatingSystem",
		"$totalMem = [double]$os.TotalVisibleMemorySize * 1024",
		"$parents = @{}",
		"Get-CimInstance Win32_Process | ForEach-Object { $parents[[string]$_.ProcessId] = [int]$_.ParentProcessId }",
		"$items = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |",
		"Where-Object { $_.IDProcess -gt 0 -and $_.Name -ne '_Total' -and $_.Name -ne 'Idle' } |",
		"Sort-Object PercentProcessorTime -Descending |",
		"Select-Object -First 5",
		"@{Name='PID';Expression={[int]$_.IDProcess}},",
		"@{Name='PPID';Expression={ if ($parents.ContainsKey([string]$_.IDProcess)) { [int]$parents[[string]$_.IDProcess] } else { 0 } }},",
		"@{Name='Name';Expression={$_.Name}},",
		"@{Name='CPUUsage';Expression={[double]$_.PercentProcessorTime}},",
		"@{Name='MemoryUsage';Expression={ if ($totalMem -gt 0) { ([double]$_.WorkingSet / $totalMem) * 100 } else { 0 } }},",
		"@{Name='RssBytes';Expression={[uint64]$_.WorkingSet}}",
		"if ($items) { $items | ConvertTo-Json -Compress } else { '[]' }",
	}, " ")

	output, err := commandOutput("powershell", "-NoProfile", "-Command", script)
	if err != nil {
		return nil, err
	}

	var items []windowsProcessJSON
	if err := decodeJSONArray(output, &items); err != nil {
		return nil, err
	}

	processes := make([]protocol.ProcessMetric, 0, len(items))
	for _, item := range items {
		processes = append(processes, protocol.ProcessMetric{
			PID:         item.PID,
			PPID:        item.PPID,
			Name:        item.Name,
			CPUUsage:    item.CPUUsage,
			MemoryUsage: item.MemoryUsage,
			RSSBytes:    item.RSSBytes,
		})
	}

	return processes, nil
}

func activeInterfaces() ([]string, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}

	names := make([]string, 0, len(interfaces))
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		names = append(names, iface.Name)
	}

	return names, nil
}

func commandOutput(command string, args ...string) (string, error) {
	cmd := exec.Command(command, args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%s %v failed: %w: %s", command, args, err, stderr.String())
	}

	return stdout.String(), nil
}

func parseMeminfoLine(line string) uint64 {
	fields := strings.Fields(line)
	if len(fields) < 2 {
		return 0
	}

	value, _ := strconv.ParseUint(fields[1], 10, 64)
	return value * 1024
}

func parseVMStatPages(line string) uint64 {
	cleaned := strings.ReplaceAll(line, ".", "")
	fields := strings.Fields(cleaned)
	if len(fields) == 0 {
		return 0
	}

	value, _ := strconv.ParseUint(fields[len(fields)-1], 10, 64)
	return value
}

func parseLeadingFloat(input string) (float64, error) {
	fields := strings.Fields(strings.TrimSpace(input))
	if len(fields) == 0 {
		return 0, errors.New("missing numeric field")
	}

	candidate := strings.TrimSpace(fields[0])
	candidate = strings.TrimSuffix(candidate, "%")
	candidate = strings.TrimSuffix(candidate, ",")
	return strconv.ParseFloat(candidate, 64)
}

func decodeJSONArray[T any](input string, out *[]T) error {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" || trimmed == "null" {
		*out = []T{}
		return nil
	}

	if strings.HasPrefix(trimmed, "[") {
		return json.Unmarshal([]byte(trimmed), out)
	}

	var single T
	if err := json.Unmarshal([]byte(trimmed), &single); err != nil {
		return err
	}

	*out = []T{single}
	return nil
}
