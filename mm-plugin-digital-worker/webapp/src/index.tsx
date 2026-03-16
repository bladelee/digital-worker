// 数字员工 Mattermost 插件
// 参考 GitHub 插件的实现

import React from 'react';
import { WorkerList } from './components/WorkerList';

// 从 manifest 获取插件 ID
const PLUGIN_ID = 'com.openclaw.digital-worker';

// 数字员工右侧边栏组件
const DigitalWorkerRHS: React.FC = () => {
  return (
    <div className="digital-worker-rhs" style={{ padding: '16px' }}>
      <h2 style={{ marginBottom: '16px' }}>数字员工管理</h2>
      <WorkerList />
    </div>
  );
};

// 右侧边栏标题组件
const RHSTitle: React.FC = () => {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '18px' }}>🤖</span>
      <span>数字员工</span>
    </span>
  );
};

// 移动端图标
const MobileIcon: React.FC = () => {
  return (
    <span style={{ fontSize: '20px' }}>🤖</span>
  );
};

// 插件主类
class Plugin {
  private store: any = null;
  private showRHSAction: any = null;

  public async initialize(registry: any, store: any) {
    console.log('=== 数字员工插件初始化 ===');
    
    this.store = store;

    // 获取当前用户
    try {
      const currentUserId = store.getState().entities.users.currentUserId;
      console.log('当前用户:', currentUserId);
    } catch (e) {
      console.warn('获取用户信息失败:', e);
    }

    // 1. 注册右侧边栏（主要 UI）
    if (registry.registerRightHandSidebarComponent) {
      const result = registry.registerRightHandSidebarComponent(
        DigitalWorkerRHS,
        RHSTitle
      );
      
      // 保存 showRHSPlugin action
      if (result && result.showRHSPlugin) {
        this.showRHSAction = result.showRHSPlugin;
        console.log('✅ 右侧边栏已注册');
      }
    } else {
      console.warn('⚠️ registerRightHandSidebarComponent 不可用');
    }

    // 2. 注册主菜单项（打开右侧边栏的入口）
    if (registry.registerMainMenuAction) {
      registry.registerMainMenuAction(
        '数字员工',
        () => {
          console.log('数字员工菜单被点击');
          // 通过 dispatch 打开 RHS
          if (this.showRHSAction && this.store) {
            console.log('打开右侧边栏');
            this.store.dispatch(this.showRHSAction);
          } else {
            console.warn('showRHSAction 不可用');
          }
        },
        <MobileIcon />
      );
      console.log('✅ 主菜单项已注册');
    } else {
      console.warn('⚠️ registerMainMenuAction 不可用');
    }

    console.log('=== 数字员工插件初始化完成 ===');
  }

  public uninitialize() {
    console.log('数字员工插件已卸载');
  }
}

// 声明全局类型
declare global {
  interface Window {
    registerPlugin?: (pluginId: string, plugin: Plugin) => void;
  }
}

// 立即执行注册
console.log('=== 数字员工插件脚本加载 ===');
console.log('window.registerPlugin:', typeof window.registerPlugin);

if (typeof window !== 'undefined' && window.registerPlugin) {
  window.registerPlugin(PLUGIN_ID, new Plugin());
  console.log('✅ 插件已注册');
} else {
  console.error('❌ window.registerPlugin 不存在');
  if (typeof window !== 'undefined') {
    console.log('可用的 window 属性:', Object.keys(window).filter((k: string) => k.toLowerCase().includes('plugin')));
  }
}

export default Plugin;
