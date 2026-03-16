import { Worker, CreateWorkerRequest, CreateChannelRequest } from '../types';

// 获取插件配置
function getPluginApiUrl(): string {
  // 从 Mattermost 全局对象获取配置
  const config = (window as any).MM_PLUGIN_CONFIG;
  return config?.PlatformAPIUrl || 'http://localhost:3000';
}

// 获取 Mattermost token
function getMattermostToken(): string | null {
  // 从 Mattermost 全局对象获取 token
  const mm = (window as any).MM;
  return mm?.getClient()?.getToken() || localStorage.getItem('MMTOKEN');
}

// 通用请求方法
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getPluginApiUrl();
  const token = getMattermostToken();

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: '请求失败' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Mattermost 认证
export async function authenticateWithMattermost(): Promise<{
  userId: string;
  isNewUser: boolean;
}> {
  return request('/api/auth/mattermost', { method: 'POST' });
}

// 获取数字员工列表
export async function getWorkers(teamId: string): Promise<Worker[]> {
  return request(`/api/workers?teamId=${teamId}`);
}

// 创建数字员工
export async function createWorker(data: CreateWorkerRequest): Promise<Worker> {
  return request('/api/workers', {
    method: 'POST',
    body: JSON.stringify({
      tenantId: 'auto', // 由后端从 token 获取
      ...data,
    }),
  });
}

// 激活数字员工
export async function activateWorker(workerId: string): Promise<Worker> {
  return request(`/api/workers/${workerId}/activate`, { method: 'POST' });
}

// 停用数字员工（通过删除 API 或状态更新）
export async function deactivateWorker(workerId: string): Promise<void> {
  // 暂时用删除代替，后续可以添加专门的停用 API
  return request(`/api/workers/${workerId}`, { method: 'DELETE' });
}

// 删除数字员工
export async function deleteWorker(workerId: string): Promise<void> {
  return request(`/api/workers/${workerId}`, { method: 'DELETE' });
}

// 一键拉群
export async function createChannelWithWorker(
  workerId: string,
  data: CreateChannelRequest
): Promise<{ channelId: string; channelName: string; workerAdded: boolean }> {
  return request(`/api/workers/${workerId}/create-channel`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
