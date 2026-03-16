import React, { useState, useEffect } from 'react';
import { Worker } from '../types';
import { getWorkers, activateWorker, deleteWorker, createChannelWithWorker } from '../actions/worker';
import { WorkerCard } from './WorkerCard';
import { CreateWorkerModal } from './CreateWorkerModal';
import { CreateChannelModal } from './CreateChannelModal';
import './WorkerList.css';

interface WorkerListProps {
  teamId?: string;
}

export const WorkerList: React.FC<WorkerListProps> = ({ teamId }) => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(teamId || null);

  // 从 Redux store 获取当前 team ID
  useEffect(() => {
    if (!teamId) {
      try {
        // @ts-ignore
        const store = window.store;
        if (store) {
          const state = store.getState();
          const teams = state.entities?.teams?.teams;
          const currentTeamId = state.entities?.teams?.currentTeamId;
          
          if (currentTeamId && teams && teams[currentTeamId]) {
            // Mattermost team ID 是字符串，我们需要查找对应的平台 team ID
            console.log('Mattermost Team ID:', currentTeamId);
            console.log('Team:', teams[currentTeamId]);
            setCurrentTeamId(currentTeamId);
          }
        }
      } catch (e) {
        console.error('获取 team ID 失败:', e);
      }
    }
  }, [teamId]);

  const loadWorkers = async () => {
    if (!currentTeamId) {
      setError('未找到团队 ID');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      console.log('加载员工列表, teamId:', currentTeamId);
      const data = await getWorkers(currentTeamId);
      setWorkers(data);
    } catch (err) {
      console.error('加载失败:', err);
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentTeamId) {
      loadWorkers();
    }
  }, [currentTeamId]);

  const handleActivate = async (workerId: string) => {
    try {
      await activateWorker(workerId);
      await loadWorkers();
    } catch (err) {
      alert('激活失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const handleDelete = async (workerId: string) => {
    if (!confirm('确定要删除这个数字员工吗？')) return;
    
    try {
      await deleteWorker(workerId);
      await loadWorkers();
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  const handleCreateChannel = (worker: Worker) => {
    setSelectedWorker(worker);
    setShowChannelModal(true);
  };

  const handleCreateChannelSubmit = async (channelName: string) => {
    if (!selectedWorker) return;
    
    try {
      await createChannelWithWorker(selectedWorker.id, { channelName, channelDisplayName: channelName });
      alert(`频道 "${channelName}" 创建成功，数字员工已加入！`);
      setShowChannelModal(false);
      setSelectedWorker(null);
    } catch (err) {
      alert('创建频道失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  if (loading) {
    return <div className="worker-list-loading">加载中...</div>;
  }

  if (error) {
    return (
      <div className="worker-list-error">
        <p>{error}</p>
        <button onClick={loadWorkers}>重试</button>
      </div>
    );
  }

  return (
    <div className="worker-list">
      <div className="worker-list-header">
        <h2>数字员工</h2>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          + 创建数字员工
        </button>
      </div>

      {workers.length === 0 ? (
        <div className="worker-list-empty">
          <p>还没有数字员工</p>
          <p>点击上方按钮创建第一个数字员工</p>
        </div>
      ) : (
        <div className="worker-list-items">
          {workers.map((worker) => (
            <WorkerCard
              key={worker.id}
              worker={worker}
              onActivate={handleActivate}
              onDelete={handleDelete}
              onCreateChannel={handleCreateChannel}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateWorkerModal
          teamId={currentTeamId || ''}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadWorkers();
          }}
        />
      )}

      {showChannelModal && selectedWorker && (
        <CreateChannelModal
          workerName={selectedWorker.name}
          onClose={() => {
            setShowChannelModal(false);
            setSelectedWorker(null);
          }}
          onCreate={handleCreateChannelSubmit}
        />
      )}
    </div>
  );
};
