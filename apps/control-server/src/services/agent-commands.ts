export interface PlatformCommands {
  linux: string;
  macos: string;
  windows: string;
}

export interface AgentCommandSet {
  installScriptUrl: string;
  installScriptPs1Url: string;
  uninstallScriptUrl: string;
  uninstallScriptPs1Url: string;
  installCommand: string;
  installCommands: PlatformCommands;
  uninstallCommands: PlatformCommands;
}

export function publicBaseUrlFromServerUrl(serverWsUrl: string): string {
  return serverWsUrl.replace(/^ws/, "http").replace(/\/ws\/agent$/, "");
}

export function buildInstallCommands(
  serverWsUrl: string,
  baseUrl: string,
  agentId?: string
): PlatformCommands {
  const shellPrefix = agentId ? `HUHA_SERVER_URL=${serverWsUrl} HUHA_AGENT_ID=${agentId} ` : "";
  const powerShellEnv = agentId
    ? `$env:HUHA_SERVER_URL='${serverWsUrl}'; $env:HUHA_AGENT_ID='${agentId}'; `
    : `$env:HUHA_SERVER_URL='${serverWsUrl}'; `;

  return {
    linux: `curl -fsSL ${baseUrl}/install/huha.sh | ${shellPrefix}sh`,
    macos: `curl -fsSL ${baseUrl}/install/huha.sh | ${shellPrefix}sh`,
    windows: `powershell -ExecutionPolicy Bypass -Command "${powerShellEnv}iwr ${baseUrl}/install/huha.ps1 -UseBasicParsing | iex"`
  };
}

export function buildUninstallCommands(baseUrl: string): PlatformCommands {
  return {
    linux: `curl -fsSL ${baseUrl}/install/huha-uninstall.sh | sh`,
    macos: `curl -fsSL ${baseUrl}/install/huha-uninstall.sh | sh`,
    windows: `powershell -ExecutionPolicy Bypass -Command "iwr ${baseUrl}/install/huha-uninstall.ps1 -UseBasicParsing | iex"`
  };
}

export function buildAgentCommandSet(serverWsUrl: string, agentId: string): AgentCommandSet {
  const baseUrl = publicBaseUrlFromServerUrl(serverWsUrl);
  const installCommands = buildInstallCommands(serverWsUrl, baseUrl, agentId);
  const uninstallCommands = buildUninstallCommands(baseUrl);

  return {
    installScriptUrl: `${baseUrl}/install/huha.sh`,
    installScriptPs1Url: `${baseUrl}/install/huha.ps1`,
    uninstallScriptUrl: `${baseUrl}/install/huha-uninstall.sh`,
    uninstallScriptPs1Url: `${baseUrl}/install/huha-uninstall.ps1`,
    installCommand: installCommands.linux,
    installCommands,
    uninstallCommands
  };
}
