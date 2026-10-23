<script setup>
import { ElMessage } from 'element-plus'
import { ref } from 'vue'

import api from '../api'
import { demoState } from '../demo/state'

const enabled = ref(demoState.settings.enabled)
const engine = ref(demoState.settings.ocrEngine)
const saving = ref(false)
async function toggle(value) {
  saving.value = true
  try {
    await api.put('/settings/llm-review', { enabled: value })
    ElMessage.success(
      value ? '预设 AI 已开启，下次模拟审核时显示 AI 意见' : '预设 AI 已关闭；既有审核记录保留'
    )
  } catch (e) {
    enabled.value = !value
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}
async function save() {
  saving.value = true
  try {
    await api.put('/settings/ocr', { ocrEngine: engine.value })
    ElMessage.success('演示选项已保存到当前会话；OCR 转录仍使用预设数据')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <div class="settings-page">
    <header class="page-header">
      <h1 class="page-title">系统设置</h1>
      <p class="page-subtitle">虚构配置展示 · 刷新恢复默认 · 无真实服务连接</p>
    </header>
    <div class="settings-sections">
      <section class="section glass-card">
        <div class="section-header">
          <el-icon class="section-icon"><MagicStick /></el-icon>
          <div>
            <h3>AI 复核助手</h3>
            <p>展示规则与 AI 复核的协作流程，所有意见均为预设</p>
          </div>
        </div>
        <div class="section-body">
          <div class="switch-row">
            <div class="switch-text">
              <span class="switch-title">启用预设 AI 复核</span
              ><span class="switch-desc"
                >影响后续 M2 模拟审核是否附带 AI 意见，以及 M3
                预设复核和巡检是否可运行。既有记录保留。</span
              >
            </div>
            <el-switch
              v-model="enabled"
              aria-label="启用预设 AI 复核"
              :disabled="saving"
              @change="toggle"
            />
          </div>
        </div>
      </section>
      <section class="section glass-card">
        <div class="section-header">
          <el-icon class="section-icon"><Key /></el-icon>
          <div>
            <h3>API 配置</h3>
            <p>以下为固定虚构占位，无法填写真实密钥</p>
          </div>
        </div>
        <div class="section-body">
          <div class="form-item">
            <label for="demo-erp">ERP 地址（虚构）</label
            ><el-input id="demo-erp" model-value="https://erp.example.invalid" disabled />
          </div>
          <div class="form-item">
            <label for="demo-key">API Key（占位）</label
            ><el-input id="demo-key" model-value="DEMO-ONLY-NO-REAL-KEY" disabled />
          </div>
          <p class="demo-note">不连接 ERP、模型或 OCR 服务，也不发送业务数据。</p>
        </div>
      </section>
      <section class="section glass-card">
        <div class="section-header">
          <el-icon class="section-icon"><Picture /></el-icon>
          <div>
            <h3>OCR 引擎</h3>
            <p>仅展示原系统的引擎选择，不执行识别</p>
          </div>
        </div>
        <div class="section-body">
          <el-radio-group v-model="engine" aria-label="演示 OCR 引擎"
            ><el-radio value="paddle">本地 PaddleOCR（演示）</el-radio
            ><el-radio value="qwen">千问 VL（演示）</el-radio></el-radio-group
          >
          <p class="demo-note">票据示意图和 OCR 转录均为合成材料；缺附件案例保持空白。</p>
        </div>
      </section>
      <button class="btn-primary" :disabled="saving" @click="save">
        {{ saving ? '保存中…' : '保存演示选项' }}
      </button>
    </div>
  </div>
</template>
<style scoped>
.settings-page {
  max-width: 900px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}
.page-title {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}
.page-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin-top: 4px;
}

.settings-sections {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 80px;
}

.section {
  padding: 0;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--glass-border);
}

.section-icon {
  width: 40px;
  height: 40px;
  background: rgba(10, 143, 117, 0.1);
  color: var(--brand);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.section-header h3 {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.section-header p {
  font-size: 13px;
  color: var(--text-muted);
  margin: 4px 0 0;
}

.section-body {
  padding: 24px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.form-item:last-child {
  margin-bottom: 0;
}

.form-item label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.radio-item {
  display: flex;
  cursor: pointer;
  padding: 16px 20px;
  background: var(--bg-tertiary);
  border: 2px solid var(--glass-border);
  border-radius: var(--border-radius);
  transition: all 0.2s;
}

.radio-item.active {
  border-color: var(--brand);
  background: rgba(10, 143, 117, 0.05);
}

.radio-item input {
  display: none;
}

.radio-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.radio-title {
  font-weight: 600;
  font-size: 14px;
}
.radio-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.switch-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.switch-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.switch-title {
  font-weight: 600;
  font-size: 14px;
}
.switch-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}
.switch-warn {
  font-size: 12px;
  color: var(--danger);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px 32px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--glass-border);
}

.info-label {
  font-size: 13px;
  color: var(--text-muted);
}
.info-value {
  font-size: 13px;
  color: var(--text-primary);
}

.actions-bar {
  position: fixed;
  bottom: 0;
  left: var(--sidebar-width);
  right: 0;
  padding: 16px 32px;
  background: linear-gradient(180deg, transparent, var(--bg-primary) 20%);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.save-msg {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--success);
  font-size: 14px;
}
</style>
