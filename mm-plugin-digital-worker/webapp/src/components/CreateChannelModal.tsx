import React, { useState } from 'react';
import './Modal.css';

interface CreateChannelModalProps {
  workerName: string;
  onClose: () => void;
  onCreate: (channelName: string) => void;
}

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  workerName,
  onClose,
  onCreate,
}) => {
  const [channelName, setChannelName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim()) {
      setError('请输入频道名称');
      return;
    }
    // 频道名称只能包含小写字母、数字和连字符
    if (!/^[a-z0-9-]+$/.test(channelName)) {
      setError('频道名称只能包含小写字母、数字和连字符');
      return;
    }
    onCreate(channelName.trim());
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>创建频道并添加「{workerName}」</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>频道名称</label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value.toLowerCase())}
              placeholder="例如：project-discussion"
              autoFocus
            />
            <small>只能包含小写字母、数字和连字符</small>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn-primary">
              创建并添加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
