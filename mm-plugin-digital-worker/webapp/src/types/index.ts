// Mattermost 类型定义

export interface MattermostUser {
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  nickname: string;
}

export interface Worker {
  id: string;
  tenantId: string;
  teamId: string;
  name: string;
  type: 'assistant' | 'developer' | 'sales' | 'custom';
  mattermostUserId?: string;
  status: 'pending' | 'active' | 'inactive' | 'error';
  createdAt: string;
}

export interface CreateWorkerRequest {
  teamId: string;
  name: string;
  type: 'assistant' | 'developer' | 'sales' | 'custom';
}

export interface CreateChannelRequest {
  channelName: string;
  channelDisplayName?: string;
  memberUserIds?: string[];
}

export interface PlatformConfig {
  platformApiUrl: string;
}
