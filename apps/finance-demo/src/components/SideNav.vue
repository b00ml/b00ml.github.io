<script setup>
import { useRoute, useRouter } from 'vue-router'

import { useConnectionStore } from '../stores/connection'

const route = useRoute()
const router = useRouter()
const connStore = useConnectionStore()

const navItems = [
  { path: '/m2', name: 'M2 合规审核', icon: 'Document' },
  { path: '/m3', name: 'M3 异常检测', icon: 'Warning' },
  { path: '/m4', name: 'M4 银行对账', icon: 'DataAnalysis' },
  { path: '/settings', name: '系统设置', icon: 'Setting' }
]

function navigate(path) {
  router.push(path)
}
</script>

<template>
  <aside class="side-nav">
    <div class="logo-section">
      <span class="logo-title">AI 财务审核</span>
    </div>

    <nav class="nav-items">
      <button
        v-for="item in navItems"
        :key="item.path"
        :class="['nav-item', { active: route.path.startsWith(item.path) }]"
        @click="navigate(item.path)"
      >
        <el-icon class="nav-icon">
          <component :is="item.icon" />
        </el-icon>
        <span class="nav-label">{{ item.name }}</span>
      </button>
    </nav>

    <div class="status-section">
      <div :class="['connection-status', { connected: connStore.connected }]">
        <span class="status-dot"></span>
        <span class="status-text"> 本地虚拟数据 · 未连接 ERP </span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.side-nav {
  width: var(--sidebar-width);
  height: 100%;
  background: #ffffff;
  border-right: 1px solid #e5e8ec;
  display: flex;
  flex-direction: column;
  padding: 20px 16px;
  position: relative;
  z-index: 10;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 12px 28px;
  border-bottom: 1px solid var(--glass-border);
  margin-bottom: 16px;
}

.logo-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary);
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  width: 100%;
}

.nav-item:hover {
  background: rgba(10, 143, 117, 0.05);
  color: var(--text-primary);
}

.nav-item.active {
  background: rgba(10, 143, 117, 0.08);
  color: var(--brand);
  box-shadow: inset 3px 0 var(--brand);
}

.nav-icon {
  font-size: 18px;
  width: 20px;
}

.status-section {
  padding-top: 16px;
  border-top: 1px solid var(--glass-border);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--border-radius-sm);
  background: var(--bg-tertiary);
}

.connection-status .status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  animation: pulse 2s infinite;
}

.connection-status.connected .status-dot {
  background: var(--success);
}

.status-text {
  font-size: 12px;
  color: var(--text-muted);
}

.connection-status.connected .status-text {
  color: var(--success);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
