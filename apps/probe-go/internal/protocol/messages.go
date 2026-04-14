package protocol

type Envelope struct {
	Type     string      `json:"type"`
	AgentID  string      `json:"agentId"`
	TS       int64       `json:"ts"`
	Seq      int64       `json:"seq"`
	Platform string      `json:"platform"`
	Version  string      `json:"version"`
	Payload  interface{} `json:"payload"`
}

type HelloPayload struct {
	AgentID  string   `json:"agentId"`
	Hostname string   `json:"hostname"`
	Platform string   `json:"platform"`
	Arch     string   `json:"arch"`
	Version  string   `json:"version"`
	IP       string   `json:"ip,omitempty"`
	Tags     []string `json:"tags,omitempty"`
}

type FastMetricsPayload struct {
	CPUUsage         float64 `json:"cpuUsage"`
	MemoryUsage      float64 `json:"memoryUsage"`
	MemoryUsedBytes  uint64  `json:"memoryUsedBytes"`
	MemoryTotalBytes uint64  `json:"memoryTotalBytes"`
	Load1            float64 `json:"load1,omitempty"`
	Load5            float64 `json:"load5,omitempty"`
	Load15           float64 `json:"load15,omitempty"`
	RXBytesPerSec    float64 `json:"rxBytesPerSec"`
	TXBytesPerSec    float64 `json:"txBytesPerSec"`
}

type DiskMetric struct {
	Name       string  `json:"name"`
	Mountpoint string  `json:"mountpoint"`
	TotalBytes uint64  `json:"totalBytes"`
	UsedBytes  uint64  `json:"usedBytes"`
	Usage      float64 `json:"usage"`
}

type ProcessMetric struct {
	PID         int     `json:"pid"`
	PPID        int     `json:"ppid,omitempty"`
	Name        string  `json:"name"`
	CPUUsage    float64 `json:"cpuUsage"`
	MemoryUsage float64 `json:"memoryUsage"`
	RSSBytes    uint64  `json:"rssBytes,omitempty"`
}

type SlowMetricsPayload struct {
	Disks        []DiskMetric    `json:"disks"`
	TopProcesses []ProcessMetric `json:"topProcesses"`
}

type SystemInfoPayload struct {
	Hostname          string   `json:"hostname"`
	Platform          string   `json:"platform"`
	Arch              string   `json:"arch"`
	KernelVersion     string   `json:"kernelVersion,omitempty"`
	CPUModel          string   `json:"cpuModel,omitempty"`
	CPUCores          int      `json:"cpuCores,omitempty"`
	TotalMemoryBytes  uint64   `json:"totalMemoryBytes,omitempty"`
	UptimeSeconds     uint64   `json:"uptimeSeconds,omitempty"`
	NetworkInterfaces []string `json:"networkInterfaces,omitempty"`
	ServiceName       string   `json:"serviceName,omitempty"`
	ServiceInstalled  bool     `json:"serviceInstalled"`
	ServiceState      string   `json:"serviceState,omitempty"`
	ServiceStartMode  string   `json:"serviceStartMode,omitempty"`
	ServiceLogPath    string   `json:"serviceLogPath,omitempty"`
	ProbeVersion      string   `json:"probeVersion,omitempty"`
}
