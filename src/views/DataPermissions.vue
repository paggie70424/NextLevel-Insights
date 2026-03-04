<template>
  <div class="data-permissions">
    <div class="page-header">
      <h1 class="page-title">Data Permissions</h1>
      <p class="page-subtitle">Control who has access to your data and how it is shared.</p>
    </div>

    <!-- Active Sharing Section -->
    <div class="section-card">
      <h2 class="section-title">
        <Shield class="section-icon" /> Service Permissions
        <span class="datazone-badge">c3l-NextLevelInsights DataZone</span>
      </h2>
      <p class="section-desc">Control which device data is shared via AWS DataZone. Changes are saved to <code>c3l-NextLevelInsights-UserDevicePermissions</code> in real time.</p>

      <!-- Loading state -->
      <div v-if="loadingPerms" class="perms-loading">
        <div class="mini-loader"></div> Loading permissions from DataZone...
      </div>

      <div v-else class="permissions-list">
        <div v-for="service in services" :key="service.id" class="permission-item">
          <div class="permission-info">
            <h3 class="permission-name">{{ service.name }}</h3>
            <p class="permission-status">
              Status: <span :class="service.allowShare ? 'text-success' : 'text-danger'">{{ service.allowShare ? 'Sharing Active' : 'Not Shared' }}</span>
            </p>
            <p class="datazone-product">DataZone Product: <code>{{ `c3l-nli_${service.id}_dev_processed` }}</code></p>
          </div>

          <div class="toggle-wrapper">
            <span v-if="service.saving" class="saving-indicator">Saving…</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="service.allowShare" @change="savePermission(service)" :disabled="service.saving">
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </div>

      <p v-if="saveError" class="save-error">⚠️ {{ saveError }}</p>
      <p v-if="saveSuccess" class="save-success">✅ {{ saveSuccess }}</p>
    </div>

    <!-- ── Per-Admin Sharing (Student Only) ───────────────────────────── -->
    <div class="section-card" v-if="isStudent">
      <h2 class="section-title">
        <UserCheck class="section-icon" />
        Share Data with Specific Admins
        <span class="dynamo-badge">DynamoDB user-consent</span>
      </h2>
      <p class="section-desc">
        Choose which admin staff can see your data — and which resource domains (Health or Academic).
        Each toggle writes a record to the <code>user-consent</code> table:
        <br />
        <code>PK = STUDENT#{{ userSub }}</code> &nbsp;/&nbsp;
        <code>SK = ADMIN#&lt;admin_id&gt;#RESOURCE#&lt;domain&gt;#&lt;device&gt;</code>
      </p>

      <div class="admin-consent-grid">
        <div class="admin-consent-card" v-for="admin in mockAdmins" :key="admin.id">
          <div class="admin-header">
            <div class="admin-avatar" :style="{ background: admin.color }">{{ admin.initials }}</div>
            <div class="admin-meta">
              <div class="admin-name">{{ admin.name }}</div>
              <div class="admin-sub mono">{{ admin.sub }}</div>
            </div>
            <div class="admin-org-badge">{{ admin.org }}</div>
          </div>

          <div class="resource-toggles">
            <div class="resource-row" v-for="res in admin.resources" :key="res.domain">
              <div class="resource-label">
                <span class="res-dot" :class="res.domain"></span>
                <span>{{ res.label }}</span>
                <code class="res-code">{{ res.dkSuffix }}</code>
              </div>
              <div class="toggle-wrapper">
                <span v-if="res.saving" class="saving-indicator">Saving…</span>
                <label class="toggle-switch" :class="res.domain">
                  <input type="checkbox" v-model="res.allowed" @change="saveConsent(admin, res)" :disabled="res.saving">
                  <span class="slider"></span>
                </label>
              </div>
            </div>
          </div>

          <div class="consent-key-preview">
            <span class="key-label">DynamoDB key:</span>
            <code>SK = ADMIN#{{ admin.id }}#RESOURCE#health#whoop</code>
          </div>

          <div v-if="admin.feedback" class="admin-feedback" :class="admin.feedbackType">{{ admin.feedback }}</div>
        </div>
      </div>
    </div>

    <!-- Admin view of this section -->
    <div class="section-card" v-if="isAdmin">
      <h2 class="section-title">
        <UserCheck class="section-icon" />
        Per-Admin Consent (Admin View)
      </h2>
      <div class="admin-info-banner">
        <div class="meta-chip">
          <span class="meta-label">Your Admin ID (sub)</span>
          <span class="meta-value mono">{{ userSub }}</span>
        </div>
        <p>Students who consent to share with your account can be queried via DynamoDB GSI1:<br />
        <code>GSI1PK = ADMIN#{{ userSub }}</code><br />
        Results are passed to Athena: <code>WHERE owner_id IN (...student_ids)</code></p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Shield, UserCheck, Trash2 } from 'lucide-vue-next'
import { useAuth } from '../composables/useAuth'

const { isStudent, isAdmin, userSub } = useAuth()
const API_BASE = 'http://localhost:3001';

// ── Device services that map to DataZone data products ───────────────────────
// Only devices that have DataZone products need DynamoDB persistence.
// 'canvas' / 'school' are UI-only toggles (no DataZone product yet).
const DYNAMODB_DEVICES = ['whoop', 'applewatch', 'fitbit'];

const services = ref([
  { id: 'whoop',     name: 'Whoop Fitness Data',      allowShare: false, saving: false },
  { id: 'applewatch',name: 'Apple Watch / Health',     allowShare: false, saving: false },
  { id: 'fitbit',    name: 'Fitbit Activity Data',     allowShare: false, saving: false },
  { id: 'canvas',    name: 'Canvas School Records',    allowShare: false, saving: false },
  { id: 'moodle',    name: 'Moodle LMS',               allowShare: false, saving: false },
])

const loadingPerms = ref(true)
const saveError    = ref('')
const saveSuccess  = ref('')

// ── Derive a simple userId from localStorage (or create one) ─────────────────
const getUserId = () => {
  let uid = localStorage.getItem('nli_user_id')
  if (!uid) {
    uid = 'user_' + Math.random().toString(36).slice(2, 10)
    localStorage.setItem('nli_user_id', uid)
  }
  return uid
}

// ── Load permissions from c3l-NextLevelInsights-UserDevicePermissions ─────────
onMounted(async () => {
  const userId = getUserId()
  try {
    const res = await fetch(`${API_BASE}/api/permissions/${userId}`)
    if (res.ok) {
      const data = await res.json()
      // Merge DynamoDB records into services list
      data.permissions.forEach(perm => {
        const svc = services.value.find(s => s.id === perm.device_type)
        if (svc) svc.allowShare = perm.sharing_allowed
      })
    }
    // 404 just means no records yet – defaults stay false
  } catch (err) {
    console.warn('[DataPermissions] Could not load permissions from API:', err.message)
  } finally {
    loadingPerms.value = false
  }
})

// ── Save a permission change to DynamoDB ─────────────────────────────────────
const savePermission = async (service) => {
  // Only persist devices that have a DataZone product
  if (!DYNAMODB_DEVICES.includes(service.id)) return

  service.saving = true
  saveError.value = ''
  saveSuccess.value = ''

  const userId = getUserId()
  try {
    const res = await fetch(`${API_BASE}/api/permissions/${userId}/${service.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sharing_allowed: service.allowShare,
        data_stage: 'processed',
        consent_version: 'v1.0'
      })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const result = await res.json()
    saveSuccess.value = `Saved: ${result.datazone_product}`
    setTimeout(() => saveSuccess.value = '', 3000)
  } catch (err) {
    saveError.value = `Failed to save ${service.name}: ${err.message}`
    service.allowShare = !service.allowShare // revert toggle
  } finally {
    service.saving = false
  }
}

// ── Per-admin consent (student-only) ─────────────────────────────────────────
const mockAdmins = reactive([
  {
    id: 'uuid-a2-admin2', name: 'Dr. Sarah Chen', initials: 'SC', org: 'Health Faculty',
    sub: 'uuid-a2-admin2', color: 'linear-gradient(135deg,#8b5cf6,#6366f1)',
    feedback: '', feedbackType: 'success',
    resources: [
      { domain: 'health', label: 'Health Data', dkSuffix: 'health#whoop', allowed: false, saving: false },
      { domain: 'academic', label: 'Academic Data', dkSuffix: 'academic#canvas', allowed: false, saving: false },
    ]
  },
  {
    id: 'uuid-a4-admin4', name: 'Prof. James Wright', initials: 'JW', org: 'Sports Science',
    sub: 'uuid-a4-admin4', color: 'linear-gradient(135deg,#3eaf7c,#059669)',
    feedback: '', feedbackType: 'success',
    resources: [
      { domain: 'health', label: 'Health Data', dkSuffix: 'health#whoop', allowed: false, saving: false },
      { domain: 'academic', label: 'Academic Data', dkSuffix: 'academic#canvas', allowed: false, saving: false },
    ]
  },
  {
    id: 'uuid-a7-admin7', name: 'Ms. Tanya Ross', initials: 'TR', org: 'Wellbeing Centre',
    sub: 'uuid-a7-admin7', color: 'linear-gradient(135deg,#f59e0b,#d97706)',
    feedback: '', feedbackType: 'success',
    resources: [
      { domain: 'health', label: 'Health Data', dkSuffix: 'health#whoop', allowed: false, saving: false },
      { domain: 'academic', label: 'Academic Data', dkSuffix: 'academic#canvas', allowed: false, saving: false },
    ]
  },
])

const saveConsent = async (admin, res) => {
  res.saving = true
  admin.feedback = ''
  // Simulate POST /consent → Lambda → DynamoDB
  await new Promise(r => setTimeout(r, 600))
  const action = res.allowed ? 'Shared' : 'Revoked'
  admin.feedback = `✅ ${action}: ${res.label} with ${admin.name}`
  admin.feedbackType = 'success'
  setTimeout(() => admin.feedback = '', 3000)
  res.saving = false
}

// ── Share-with-user section (kept for compatibility) ──────────────────────────
const emailInput  = ref('')
const inviteStatus = ref('')
const sharedUsers = ref([])

const inviteUser = () => {
  if (emailInput.value) {
    setTimeout(() => {
      sharedUsers.value.push(emailInput.value)
      inviteStatus.value = `Invitation sent to ${emailInput.value}`
      emailInput.value = ''
      setTimeout(() => inviteStatus.value = '', 3000)
    }, 500)
  }
}

const removeUser = (index) => {
  sharedUsers.value.splice(index, 1)
}
</script>

<style scoped>
.page-header {
  margin-bottom: 2rem;
}

.page-title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--c-text);
}

.page-subtitle {
  color: var(--c-text-light);
  font-size: 1.1rem;
}

.section-card {
  background: var(--c-bg);
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  border: 1px solid var(--c-border);
  margin-bottom: 2rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--c-text);
}

.section-icon {
  color: var(--c-brand);
}

.section-desc {
  color: var(--c-text-light);
  margin-bottom: 2rem;
}

/* Permissions List */
.permissions-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.permission-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background-color: var(--c-bg-light);
  border-radius: 8px;
}

.permission-name {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.permission-status {
  font-size: 0.9rem;
  color: var(--c-text-light);
}

.text-success { color: var(--c-brand); font-weight: 500; }
.text-danger { color: #e74c3c; font-weight: 500; }

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 26px;
}

.toggle-switch input { 
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: .4s;
  border-radius: 34px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: .2s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: var(--c-brand);
}

input:checked + .slider:before {
  transform: translateX(24px);
}

/* Share Form */
.share-form {
  margin-bottom: 2rem;
}

.input-group {
  display: flex;
  gap: 1rem;
}

.form-input {
  flex: 1;
  padding: 0.75rem 1rem;
  border: 1px solid var(--c-border);
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--c-brand);
}

.btn-primary {
  padding: 0 1.5rem;
  background-color: var(--c-brand);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-primary:hover {
  background-color: var(--c-brand-light);
}

.btn-primary:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.status-message {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: var(--c-brand);
}

/* Shared Users List */
.subsection-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--c-text);
}

.users-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  background-color: var(--c-bg-light);
  border-radius: 8px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  background-color: var(--c-brand);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.9rem;
}

.user-email {
  flex: 1;
  font-weight: 500;
}

.btn-icon {
  background: none;
  border: none;
  color: #e74c3c;
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.btn-icon:hover {
  opacity: 1;
}

.icon-sm {
  width: 18px;
  height: 18px;
}

/* DataZone-specific UI */
.datazone-badge {
  font-size: 0.7rem;
  font-weight: 600;
  background: linear-gradient(135deg, #ff9900, #c45500);
  color: white;
  padding: 0.2rem 0.6rem;
  border-radius: 50px;
  letter-spacing: 0.3px;
  margin-left: 0.75rem;
  vertical-align: middle;
}

.datazone-product {
  font-size: 0.78rem;
  color: var(--c-text-light);
  margin: 0.25rem 0 0;
}

.datazone-product code {
  background: rgba(0,0,0,0.06);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.perms-loading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
  color: var(--c-text-light);
}

.mini-loader {
  width: 18px;
  height: 18px;
  border: 2px solid #eee;
  border-top-color: var(--c-brand);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.toggle-wrapper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.saving-indicator {
  font-size: 0.78rem;
  color: var(--c-text-light);
  font-style: italic;
}

.save-success {
  margin-top: 0.75rem;
  font-size: 0.9rem;
  color: #2e7d32;
  font-weight: 500;
}

/* ── Per-admin sharing grid ── */
.admin-consent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 1.25rem;
  margin-top: 1rem;
}
.admin-consent-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  transition: box-shadow 0.2s;
}
.admin-consent-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.06); }

.admin-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.admin-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  color: #fff; font-weight: 700; font-size: 0.82rem;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.admin-meta { flex: 1; min-width: 0; }
.admin-name { font-weight: 700; font-size: 0.9rem; color: #1e1e2e; }
.admin-sub { font-size: 0.68rem; color: #94a3b8; font-family: monospace; }
.admin-org-badge {
  font-size: 0.68rem; font-weight: 600;
  padding: 0.15rem 0.5rem; border-radius: 999px;
  background: rgba(99,102,241,0.08); color: #6366f1;
  white-space: nowrap;
}

.resource-toggles { display: flex; flex-direction: column; gap: 0.6rem; }
.resource-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.5rem 0.75rem; background: #fff;
  border: 1px solid #f1f5f9; border-radius: 8px;
}
.resource-label {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.82rem; font-weight: 500; color: #334155;
}
.res-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.res-dot.health { background: #3eaf7c; }
.res-dot.academic { background: #6366f1; }
.res-code {
  font-size: 0.68rem; background: rgba(0,0,0,0.05);
  padding: 0.1rem 0.3rem; border-radius: 3px; color: #64748b;
}

/* Coloured toggle: health=green, academic=indigo */
.toggle-switch.health input:checked + .slider { background-color: #3eaf7c; }
.toggle-switch.academic input:checked + .slider { background-color: #6366f1; }

.consent-key-preview {
  font-size: 0.68rem; color: #94a3b8;
  background: #f1f5f9; border-radius: 6px;
  padding: 0.4rem 0.65rem;
  display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
}
.key-label { font-weight: 600; color: #64748b; }
.consent-key-preview code { font-size: 0.65rem; color: #7c3aed; }

.admin-feedback {
  font-size: 0.78rem; padding: 0.4rem 0.65rem;
  border-radius: 6px; font-weight: 500;
}
.admin-feedback.success { background: rgba(62,175,124,0.1); color: #2e7d32; }

/* DynamoDB badge */
.dynamo-badge {
  font-size: 0.7rem; font-weight: 600;
  background: linear-gradient(135deg,#ff9900,#c45500);
  color: white; padding: 0.2rem 0.6rem;
  border-radius: 50px; margin-left: 0.75rem;
}

/* Admin consent info banner */
.admin-info-banner {
  background: rgba(139,92,246,0.06);
  border: 1px solid rgba(139,92,246,0.2);
  border-radius: 10px; padding: 1.25rem;
  font-size: 0.87rem; color: #4c1d95; line-height: 1.7;
  display: flex; flex-direction: column; gap: 0.75rem;
}
.admin-info-banner code {
  background: rgba(139,92,246,0.1); border-radius: 3px;
  padding: 0 4px; font-size: 0.82rem;
}
.meta-chip {
  display: flex; gap: 0.5rem; align-items: center;
  font-size: 0.78rem; width: fit-content;
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 6px; padding: 0.3rem 0.7rem;
}
.meta-label { color: #94a3b8; }
.meta-value { color: #334155; font-weight: 600; }
.mono { font-family: 'JetBrains Mono','Fira Code',monospace; font-size: 0.75rem !important; }
</style>
