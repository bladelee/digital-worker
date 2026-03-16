import React from 'react';
import { Worker } from '../types';
import './WorkerCard.css';

interface WorkerCardProps {
  worker: Worker;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateChannel: (worker: Worker) => void;
}

export const WorkerCard: React.FC<WorkerCardProps> = ({
  worker,
  onActivate,
  onDelete,
  onCreateChannel,
}) => {
  const statusClass = {
    pending: 'status-pending',
    active: 'status-active',
    inactive: 'status-inactive',
    error: 'status-error',
  }[worker.status];

  const statusText = {
    pending: '待激活',
    active: '已激活',
    inactive: '已停用',
    error: '错误',
  }[worker.status];

  const typeText = {
    assistant: '助手',
    developer: '开发者',
    sales: '销售',
    custom: '自定义',
  }[worker.type];

  return (
    <div className="worker-card">
      <div className="worker-card-header">
        <div className="worker-avatar">🤖</div>
        <div className="worker-info">
          <h3 className="worker-name">{worker.name}</h3>
          <div className="worker-meta">
            <span className="worker-type">{typeText}</span>
            <span className={`worker-status ${statusClass}`}>{statusText}</span>
          </div>
        </div>
      </div>

      <div className="worker-card-actions">
        {worker.status === 'pending' && (
          <button
            className="btn-activate"
            onClick={() => onActivate(worker.id)}
          >
            激活
          </button>
        )}
        {worker.status === 'active' && (
          <>
            <button
              className="btn-channel"
              onClick={() => onCreateChannel(worker)}
            >
              拉群
            </button>
            <button className="btn-secondary">停用</button>
          </>
        )}
        <button
          className="btn-delete"
          onClick={() => onDelete(worker.id)}
        >
          删除
        </button>
      </div>

      <div className="worker-card-footer">
        <span className="worker-created">
          创建于 {new Date(worker.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
};
