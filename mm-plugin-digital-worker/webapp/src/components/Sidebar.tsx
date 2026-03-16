import React from 'react';
import './Sidebar.css';

interface SidebarProps {
  onClick: () => void;
  active: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ onClick, active }) => {
  return (
    <div
      className={`digital-worker-sidebar ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="sidebar-icon">
        <i className="icon icon-robot" />
      </div>
      <span className="sidebar-title">数字员工</span>
    </div>
  );
};
