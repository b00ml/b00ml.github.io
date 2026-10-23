<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import SideNav from './components/SideNav.vue'

const drawerOpen = ref(false)
const route = useRoute()
watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false
  }
)
</script>

<template>
  <div class="workbench">
    <header class="demo-banner">
      <button class="mobile-menu" aria-label="打开导航" @click="drawerOpen = true">☰</button>
      <div>
        <strong>虚拟数据演示</strong
        ><span>预设审核 / OCR / AI / 对账 · 当前会话有效，刷新重置</span>
      </div>
      <a href="/projects/finance-review-agent">返回项目 ↗</a>
    </header>
    <div class="app-layout">
      <div class="desktop-sidebar"><SideNav /></div>
      <el-drawer
        v-model="drawerOpen"
        title="工作台导航"
        direction="ltr"
        size="min(300px, 90vw)"
        class="demo-drawer"
      >
        <SideNav />
      </el-drawer>
      <main id="workbench-content" class="main-content">
        <router-view v-slot="{ Component }"
          ><component :is="Component" :key="route.path"
        /></router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
.workbench {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
}
.demo-banner {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 24px;
  color: #065f46;
  background: #ecfdf5;
  border-bottom: 1px solid #b9e7d4;
  font-size: 12px;
}
.demo-banner strong {
  margin-right: 12px;
}
.demo-banner a {
  margin-left: auto;
  color: #065f46;
  white-space: nowrap;
  font-weight: 600;
}
.mobile-menu {
  display: none;
}
.app-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}
.desktop-sidebar {
  flex-shrink: 0;
}
.main-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px 32px;
  background: var(--bg-primary);
}
@media (max-width: 767px) {
  .desktop-sidebar {
    display: none;
  }
  .mobile-menu {
    display: block;
    background: transparent;
    border: 1px solid #87bea8;
    padding: 6px 10px;
    border-radius: 6px;
  }
  .demo-banner {
    padding: 10px 12px;
    align-items: flex-start;
  }
  .demo-banner strong,
  .demo-banner span {
    display: block;
  }
  .demo-banner span {
    font-size: 10px;
    line-height: 1.5;
    margin-top: 3px;
  }
  .main-content {
    padding: 20px 12px;
  }
}
</style>
