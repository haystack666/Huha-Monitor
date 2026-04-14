import type { FastifyInstance, FastifyRequest } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import type { AppEnv } from "../../config/env.js";
import { buildInstallCommands, buildUninstallCommands } from "../../services/agent-commands.js";
import type { RequireAdminAuth } from "../../services/auth.js";

function resolveBaseUrl(request: FastifyRequest): string {
  const protoHeader = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader ?? "http";
  const host = request.headers.host ?? "localhost:4000";
  return `${protocol}://${host}`;
}

function resolveDownloadBaseUrl(request: FastifyRequest, env: AppEnv): string {
  if (
    env.probeDownloadBaseUrl &&
    !env.probeDownloadBaseUrl.includes("downloads.example.com")
  ) {
    return env.probeDownloadBaseUrl;
  }

  return `${resolveBaseUrl(request)}/downloads/probes`;
}

function buildInstallScript(serverWsUrl: string, downloadBaseUrl: string): string {
  return `#!/bin/sh
set -eu

SERVER_URL="\${HUHA_SERVER_URL:-${serverWsUrl}}"
AGENT_ID="\${HUHA_AGENT_ID:-}"
DOWNLOAD_BASE_URL="\${HUHA_PROBE_DOWNLOAD_BASE_URL:-${downloadBaseUrl}}"
INSTALL_DIR="\${HUHA_INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="\${HUHA_BINARY_NAME:-huha-probe}"
RUN_IMMEDIATELY="\${HUHA_RUN_IMMEDIATELY:-1}"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)
    echo "unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

case "$OS" in
  linux|darwin) ;;
  *)
    echo "unsupported operating system: $OS" >&2
    exit 1
    ;;
esac

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PROBE_URL="$DOWNLOAD_BASE_URL/huha-probe-$OS-$ARCH"
echo "downloading $PROBE_URL"
curl -fsSL "$PROBE_URL" -o "$TMP_DIR/$BINARY_NAME"
chmod +x "$TMP_DIR/$BINARY_NAME"

if [ -w "$INSTALL_DIR" ]; then
  cp "$TMP_DIR/$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
else
  sudo mkdir -p "$INSTALL_DIR"
  sudo cp "$TMP_DIR/$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"
fi

CONFIG_DIR="\${HOME}/.config/huha"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/probe.env" <<EOF
HUHA_SERVER_URL=$SERVER_URL
HUHA_AGENT_ID=$AGENT_ID
EOF

echo "installed to $INSTALL_DIR/$BINARY_NAME"

if [ "$RUN_IMMEDIATELY" = "1" ]; then
  nohup env HUHA_SERVER_URL="$SERVER_URL" HUHA_AGENT_ID="$AGENT_ID" "$INSTALL_DIR/$BINARY_NAME" >/tmp/huha-probe.log 2>&1 &
  echo "probe started in background. log: /tmp/huha-probe.log"
else
  echo "set HUHA_SERVER_URL=$SERVER_URL HUHA_AGENT_ID=$AGENT_ID and run: $INSTALL_DIR/$BINARY_NAME"
fi
`;
}

function buildUninstallScript(): string {
  return `#!/bin/sh
set -eu

INSTALL_DIR="\${HUHA_INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="\${HUHA_BINARY_NAME:-huha-probe}"
CONFIG_DIR="\${HOME}/.config/huha"

if command -v pkill >/dev/null 2>&1; then
  pkill -x "$BINARY_NAME" >/dev/null 2>&1 || true
fi

if [ -f "$INSTALL_DIR/$BINARY_NAME" ]; then
  if [ -w "$INSTALL_DIR/$BINARY_NAME" ] || [ -w "$INSTALL_DIR" ]; then
    rm -f "$INSTALL_DIR/$BINARY_NAME"
  else
    sudo rm -f "$INSTALL_DIR/$BINARY_NAME"
  fi
fi

rm -rf "$CONFIG_DIR"
echo "HUHA probe removed"
`;
}

function buildWindowsInstallScript(serverWsUrl: string, downloadBaseUrl: string): string {
  return `$ErrorActionPreference = "Stop"

$ServerUrl = if ($env:HUHA_SERVER_URL) { $env:HUHA_SERVER_URL } else { "${serverWsUrl}" }
$AgentId = if ($env:HUHA_AGENT_ID) { $env:HUHA_AGENT_ID } else { "" }
$DownloadBaseUrl = if ($env:HUHA_PROBE_DOWNLOAD_BASE_URL) { $env:HUHA_PROBE_DOWNLOAD_BASE_URL } else { "${downloadBaseUrl}" }
$InstallDir = if ($env:HUHA_INSTALL_DIR) { $env:HUHA_INSTALL_DIR } elseif ($env:ProgramFiles) { Join-Path $env:ProgramFiles "HUHA" } else { Join-Path $env:LOCALAPPDATA "HUHA\\bin" }
$BinaryName = if ($env:HUHA_BINARY_NAME) { $env:HUHA_BINARY_NAME } else { "huha-probe.exe" }
$ServiceName = if ($env:HUHA_SERVICE_NAME) { $env:HUHA_SERVICE_NAME } else { "HUHAProbe" }
$ServiceDisplayName = if ($env:HUHA_SERVICE_DISPLAY_NAME) { $env:HUHA_SERVICE_DISPLAY_NAME } else { "HUHA Probe" }
$ServiceFailureActions = if ($env:HUHA_SERVICE_FAILURE_ACTIONS) { $env:HUHA_SERVICE_FAILURE_ACTIONS } else { "restart/5000/restart/15000/restart/30000" }
$RunImmediately = if ($env:HUHA_RUN_IMMEDIATELY) { $env:HUHA_RUN_IMMEDIATELY } else { "1" }

$Arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
switch ($Arch) {
  "x64" { $Arch = "amd64" }
  "arm64" { $Arch = "arm64" }
  default { throw "unsupported architecture: $Arch" }
}

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("huha-probe-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

try {
  $ProbeUrl = "$DownloadBaseUrl/huha-probe-windows-$Arch.exe"
  $ProbePath = Join-Path $TempDir $BinaryName
  Write-Host "downloading $ProbeUrl"
  Invoke-WebRequest -Uri $ProbeUrl -OutFile $ProbePath -UseBasicParsing

  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  Copy-Item -Force $ProbePath (Join-Path $InstallDir $BinaryName)

  $ConfigDir = Join-Path $env:LOCALAPPDATA "HUHA"
  New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
  $LogDir = Join-Path $ConfigDir "logs"
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $LogPath = Join-Path $LogDir "probe-service.log"
  $RunScriptPath = Join-Path $ConfigDir "run-probe.cmd"
  $BinaryPath = Join-Path $InstallDir $BinaryName
  $CmdExe = Join-Path $env:SystemRoot "System32\\cmd.exe"
  @"
HUHA_SERVER_URL=$ServerUrl
HUHA_AGENT_ID=$AgentId
HUHA_LOG_PATH=$LogPath
"@ | Set-Content -Path (Join-Path $ConfigDir "probe.env") -Encoding ascii
  @"
@echo off
set HUHA_SERVER_URL=$ServerUrl
set HUHA_AGENT_ID=$AgentId
set HUHA_LOG_PATH=$LogPath
cd /d "$InstallDir"
echo ==== [%date% %time%] starting HUHA probe ====>> "$LogPath"
"$BinaryPath" >> "$LogPath" 2>&1
"@ | Set-Content -Path $RunScriptPath -Encoding ascii

  $ExistingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($ExistingService) {
    if ($ExistingService.Status -ne "Stopped") {
      sc.exe stop $ServiceName | Out-Null
      Start-Sleep -Seconds 1
    }
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 1
  }

  $ServiceCommand = '"' + $CmdExe + '" /c "' + $RunScriptPath + '"'
  sc.exe create $ServiceName "binPath= $ServiceCommand" "start= auto" "DisplayName= $ServiceDisplayName" | Out-Null
  sc.exe description $ServiceName "HUHA probe service" | Out-Null
  sc.exe failure $ServiceName "reset= 86400" "actions= $ServiceFailureActions" | Out-Null
  sc.exe failureflag $ServiceName 1 | Out-Null

  Write-Host "installed to $BinaryPath"
  Write-Host "registered windows service: $ServiceName"
  Write-Host "service logs: $LogPath"

  if ($RunImmediately -eq "1") {
    sc.exe start $ServiceName | Out-Null
    Write-Host "service started"
  } else {
    Write-Host "service installed but not started. run: sc.exe start $ServiceName"
  }
}
finally {
  Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
}
`;
}

function buildWindowsUninstallScript(): string {
  return `$ErrorActionPreference = "Stop"

$InstallDir = if ($env:HUHA_INSTALL_DIR) { $env:HUHA_INSTALL_DIR } elseif ($env:ProgramFiles) { Join-Path $env:ProgramFiles "HUHA" } else { Join-Path $env:LOCALAPPDATA "HUHA\\bin" }
$BinaryName = if ($env:HUHA_BINARY_NAME) { $env:HUHA_BINARY_NAME } else { "huha-probe.exe" }
$ServiceName = if ($env:HUHA_SERVICE_NAME) { $env:HUHA_SERVICE_NAME } else { "HUHAProbe" }
$ConfigDir = Join-Path $env:LOCALAPPDATA "HUHA"

$ExistingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($ExistingService) {
  if ($ExistingService.Status -ne "Stopped") {
    sc.exe stop $ServiceName | Out-Null
    Start-Sleep -Seconds 1
  }
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 1
}

Get-Process -Name "huha-probe" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$BinaryPath = Join-Path $InstallDir $BinaryName
if (Test-Path $BinaryPath) {
  Remove-Item -Force $BinaryPath
}

if (Test-Path $ConfigDir) {
  Remove-Item -Recurse -Force $ConfigDir
}

Write-Host "HUHA probe removed"
`;
}

export async function registerInstallerRoutes(
  app: FastifyInstance,
  env: AppEnv,
  requireAdminAuth: RequireAdminAuth
): Promise<void> {
  app.get(
    "/api/installers",
    {
      preHandler: requireAdminAuth
    },
    async (request) => {
      const baseUrl = resolveBaseUrl(request);
      const installScriptUrl = `${baseUrl}/install/huha.sh`;
      const installScriptPs1Url = `${baseUrl}/install/huha.ps1`;
      const uninstallScriptUrl = `${baseUrl}/install/huha-uninstall.sh`;
      const uninstallScriptPs1Url = `${baseUrl}/install/huha-uninstall.ps1`;
      const downloadBaseUrl = resolveDownloadBaseUrl(request, env);
      const commands = buildInstallCommands(env.publicServerUrl, baseUrl);
      const uninstallCommands = buildUninstallCommands(baseUrl);

      return {
        projectName: "HUHA",
        serverUrl: env.publicServerUrl,
        dashboardWsUrl: env.publicDashboardWsUrl,
        installScriptUrl,
        installScriptPs1Url,
        uninstallScriptUrl,
        uninstallScriptPs1Url,
        probeDownloadBaseUrl: downloadBaseUrl,
        commands,
        uninstallCommands
      };
    }
  );

  app.get("/install/huha.sh", async (request, reply) => {
    const baseUrl = resolveBaseUrl(request);
    const serverWsUrl =
      process.env.HUHA_PUBLIC_SERVER_URL && process.env.HUHA_PUBLIC_SERVER_URL.includes("localhost")
        ? process.env.HUHA_PUBLIC_SERVER_URL
        : `${baseUrl.replace(/^http/, "ws")}/ws/agent`;
    const downloadBaseUrl = resolveDownloadBaseUrl(request, env);

    reply.header("content-type", "text/x-shellscript; charset=utf-8");
    reply.header("content-disposition", 'inline; filename="huha.sh"');

    return buildInstallScript(serverWsUrl, downloadBaseUrl);
  });

  app.get("/install/huha.ps1", async (request, reply) => {
    const baseUrl = resolveBaseUrl(request);
    const serverWsUrl =
      process.env.HUHA_PUBLIC_SERVER_URL && process.env.HUHA_PUBLIC_SERVER_URL.includes("localhost")
        ? process.env.HUHA_PUBLIC_SERVER_URL
        : `${baseUrl.replace(/^http/, "ws")}/ws/agent`;
    const downloadBaseUrl = resolveDownloadBaseUrl(request, env);

    reply.header("content-type", "text/plain; charset=utf-8");
    reply.header("content-disposition", 'inline; filename="huha.ps1"');

    return buildWindowsInstallScript(serverWsUrl, downloadBaseUrl);
  });

  app.get("/install/huha-uninstall.sh", async (_request, reply) => {
    reply.header("content-type", "text/x-shellscript; charset=utf-8");
    reply.header("content-disposition", 'inline; filename="huha-uninstall.sh"');

    return buildUninstallScript();
  });

  app.get("/install/huha-uninstall.ps1", async (_request, reply) => {
    reply.header("content-type", "text/plain; charset=utf-8");
    reply.header("content-disposition", 'inline; filename="huha-uninstall.ps1"');

    return buildWindowsUninstallScript();
  });

  app.get<{ Params: { filename: string } }>("/downloads/probes/:filename", async (request, reply) => {
    if (!/^[a-z0-9._-]+$/i.test(request.params.filename)) {
      reply.status(400);
      return {
        message: "invalid filename"
      };
    }

    const filePath = join(process.cwd(), "assets/probes", request.params.filename);
    if (!existsSync(filePath)) {
      reply.status(404);
      return {
        message: "probe binary not found"
      };
    }

    reply.header("content-type", "application/octet-stream");
    reply.header("content-disposition", `attachment; filename="${request.params.filename}"`);
    return reply.send(createReadStream(filePath));
  });
}
