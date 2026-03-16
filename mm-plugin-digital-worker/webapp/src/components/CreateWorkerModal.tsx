import React, { useState } from 'react';
import { createWorker } from '../actions/worker';
import './Modal.css';

interface CreateWorkerModalProps {
  teamId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateWorkerModal: React.FC<CreateWorkerModalProps> = ({
  teamId,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'assistant' | 'developer' | 'sales' | 'custom'>('assistant');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请输入名称');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await createWorker({ teamId, name: name.trim(), type });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>创建数字员工</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：小助手"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>类型</label>
            <select value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="assistant">助手</option>
              <option value="developer">开发者</option>
              <option value="sales">销售</option>
              <option value="custom">自定义</option>
            </select>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
