import { useEffect, useState } from "react";
const authStorageKey = "huha_admin_token";
export const apiBaseUrl = import.meta.env.VITE_HUHA_API_BASE_URL ?? "http://localhost:4000";
const wsUrl = import.meta.env.VITE_HUHA_DASHBOARD_WS_URL ?? "ws://localhost:4000/ws/dashboard";
function createAuthHeaders(token) {
    if (!token) {
        return undefined;
    }
    return {
        Authorization: `Bearer ${token}`
    };
}
function createDashboardWsUrl(token) {
    const url = new URL(wsUrl);
    url.searchParams.set("token", token);
    return url.toString();
}
export function getStoredAdminToken() {
    return window.localStorage.getItem(authStorageKey);
}
export function storeAdminToken(token) {
    window.localStorage.setItem(authStorageKey, token);
}
export function clearStoredAdminToken() {
    window.localStorage.removeItem(authStorageKey);
}
export async function fetchSetupStatus() {
    const response = await fetch(`${apiBaseUrl}/api/setup/status`);
    if (!response.ok) {
        throw new Error("failed to load setup status");
    }
    return response.json();
}
export async function createAdminAccount(input) {
    const response = await fetch(`${apiBaseUrl}/api/setup/admin`, {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify(input)
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => null));
        throw new Error(payload?.message ?? "failed to create admin");
    }
    return response.json();
}
export async function loginAdmin(input) {
    const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify(input)
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => null));
        throw new Error(payload?.message ?? "failed to login");
    }
    return response.json();
}
export async function fetchCurrentSession(token) {
    const response = await fetch(`${apiBaseUrl}/api/auth/session`, {
        headers: createAuthHeaders(token)
    });
    if (!response.ok) {
        throw new Error("invalid session");
    }
    return response.json();
}
export async function logoutAdmin(token) {
    await fetch(`${apiBaseUrl}/api/auth/logout`, {
        method: "POST",
        headers: createAuthHeaders(token)
    });
}
export async function fetchAdminProfile(token) {
    const response = await fetch(`${apiBaseUrl}/api/admin/profile`, {
        headers: createAuthHeaders(token)
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => null));
        throw new Error(payload?.message ?? "failed to load admin profile");
    }
    return response.json();
}
export async function updateAdminProfile(token, input) {
    const response = await fetch(`${apiBaseUrl}/api/admin/profile`, {
        method: "PUT",
        headers: {
            "content-type": "application/json",
            ...createAuthHeaders(token)
        },
        body: JSON.stringify(input)
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => null));
        throw new Error(payload?.message ?? "failed to update admin profile");
    }
    return response.json();
}
export async function updateAdminPassword(token, input) {
    const response = await fetch(`${apiBaseUrl}/api/admin/password`, {
        method: "PUT",
        headers: {
            "content-type": "application/json",
            ...createAuthHeaders(token)
        },
        body: JSON.stringify(input)
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => null));
        throw new Error(payload?.message ?? "failed to update password");
    }
}
export async function createProvisionedHost(token, input) {
    const response = await fetch(`${apiBaseUrl}/api/agents/provision`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...createAuthHeaders(token)
        },
        body: JSON.stringify(input)
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => null));
        throw new Error(payload?.message ?? "failed to provision host");
    }
    return response.json();
}
export async function updateAgentDisplayName(token, agentId, input) {
    const response = await fetch(`${apiBaseUrl}/api/agents/${agentId}/display-name`, {
        method: "PUT",
        headers: {
            "content-type": "application/json",
            ...createAuthHeaders(token)
        },
        body: JSON.stringify(input)
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => null));
        throw new Error(payload?.message ?? "failed to update display name");
    }
    return response.json();
}
export async function regenerateAgentInstallCommand(token, agentId) {
    const response = await fetch(`${apiBaseUrl}/api/agents/${agentId}/install-command/regenerate`, {
        method: "POST",
        headers: createAuthHeaders(token)
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => null));
        throw new Error(payload?.message ?? "failed to regenerate install command");
    }
    return response.json();
}
export async function deleteAgent(token, agentId) {
    const response = await fetch(`${apiBaseUrl}/api/agents/${agentId}`, {
        method: "DELETE",
        headers: createAuthHeaders(token)
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => null));
        throw new Error(payload?.message ?? "failed to delete agent");
    }
}
export async function fetchNotificationSettings(token) {
    const response = await fetch(`${apiBaseUrl}/api/admin/notifications/settings`, {
        headers: createAuthHeaders(token)
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => null));
        throw new Error(payload?.message ?? "failed to load notification settings");
    }
    return response.json();
}
export async function updateNotificationSettings(token, settings) {
    const response = await fetch(`${apiBaseUrl}/api/admin/notifications/settings`, {
        method: "PUT",
        headers: {
            "content-type": "application/json",
            ...createAuthHeaders(token)
        },
        body: JSON.stringify(settings)
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => null));
        throw new Error(payload?.message ?? "failed to update notification settings");
    }
    return response.json();
}
export async function fetchNotificationActivity(token, query) {
    const searchParams = new URLSearchParams();
    if (typeof query?.page === "number") {
        searchParams.set("page", String(query.page));
    }
    if (typeof query?.pageSize === "number") {
        searchParams.set("pageSize", String(query.pageSize));
    }
    if (query?.status) {
        searchParams.set("status", query.status);
    }
    if (query?.eventType) {
        searchParams.set("eventType", query.eventType);
    }
    if (query?.channelType) {
        searchParams.set("channelType", query.channelType);
    }
    if (query?.keyword?.trim()) {
        searchParams.set("keyword", query.keyword.trim());
    }
    const response = await fetch(`${apiBaseUrl}/api/admin/notifications/activity?${searchParams.toString()}`, {
        headers: createAuthHeaders(token)
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => null));
        throw new Error(payload?.message ?? "failed to load notification activity");
    }
    return response.json();
}
export function useDashboardData(token) {
    const [agents, setAgents] = useState([]);
    const [connected, setConnected] = useState(false);
    const upsertAgent = (incomingAgent) => {
        setAgents((current) => {
            const next = current.filter((item) => item.agentId !== incomingAgent.agentId);
            next.push(incomingAgent);
            return next.sort((a, b) => a.agentId.localeCompare(b.agentId));
        });
    };
    const removeAgent = (agentId) => {
        setAgents((current) => current.filter((item) => item.agentId !== agentId));
    };
    useEffect(() => {
        if (!token) {
            setAgents([]);
            return;
        }
        let cancelled = false;
        fetch(`${apiBaseUrl}/api/agents`, {
            headers: createAuthHeaders(token)
        })
            .then((response) => {
            if (!response.ok) {
                throw new Error("failed to load agents");
            }
            return response.json();
        })
            .then((payload) => {
            if (!cancelled && Array.isArray(payload.items)) {
                setAgents(payload.items);
            }
        })
            .catch(() => {
            if (!cancelled) {
                setAgents([]);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [token]);
    useEffect(() => {
        if (!token) {
            setConnected(false);
            return;
        }
        const socket = new WebSocket(createDashboardWsUrl(token));
        socket.onopen = () => {
            setConnected(true);
        };
        socket.onclose = () => {
            setConnected(false);
        };
        socket.onmessage = (event) => {
            const payload = JSON.parse(event.data);
            if (payload.type === "dashboard.snapshot" && Array.isArray(payload.items)) {
                setAgents(payload.items);
                return;
            }
            if ((payload.type === "agent.updated" || payload.type === "agent.status.changed") && payload.agent) {
                upsertAgent(payload.agent);
                return;
            }
            if (payload.type === "agent.deleted" && payload.agentId) {
                removeAgent(payload.agentId);
            }
        };
        return () => {
            socket.close();
        };
    }, [token]);
    const online = agents.filter((item) => item.status === "online");
    const averageCPU = online.length > 0
        ? online.reduce((sum, item) => sum + (item.fastMetrics?.cpuUsage ?? 0), 0) / online.length
        : 0;
    const averageMemory = online.length > 0
        ? online.reduce((sum, item) => sum + (item.fastMetrics?.memoryUsage ?? 0), 0) / online.length
        : 0;
    return {
        agents,
        connected,
        summary: {
            totalAgents: agents.length,
            onlineAgents: online.length,
            averageCPU,
            averageMemory
        },
        upsertAgent,
        removeAgent
    };
}
export function useAgentTimeseries(agentId, token) {
    const [items, setItems] = useState([]);
    useEffect(() => {
        if (!agentId || !token) {
            setItems([]);
            return;
        }
        let disposed = false;
        const load = () => {
            fetch(`${apiBaseUrl}/api/agents/${agentId}/timeseries?limit=60`, {
                headers: createAuthHeaders(token)
            })
                .then((response) => {
                if (!response.ok) {
                    throw new Error("failed to load timeseries");
                }
                return response.json();
            })
                .then((payload) => {
                if (!disposed && Array.isArray(payload.items)) {
                    setItems(payload.items);
                }
            })
                .catch(() => {
                if (!disposed) {
                    setItems([]);
                }
            });
        };
        load();
        const timer = window.setInterval(load, 3000);
        return () => {
            disposed = true;
            window.clearInterval(timer);
        };
    }, [agentId, token]);
    return items;
}
export function useInstallerInfo() {
    const [info, setInfo] = useState(null);
    useEffect(() => {
        let disposed = false;
        fetch(`${apiBaseUrl}/api/installers`)
            .then((response) => response.json())
            .then((payload) => {
            if (!disposed) {
                setInfo(payload);
            }
        })
            .catch(() => {
            if (!disposed) {
                setInfo(null);
            }
        });
        return () => {
            disposed = true;
        };
    }, []);
    return info;
}
//# sourceMappingURL=use-dashboard-data.js.map
