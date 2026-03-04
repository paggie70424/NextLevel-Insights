<template>
  <div class="admin-dashboard">

    <!-- ── Access Denied ───────────────────────────────────────────── -->
    <div v-if="!isAdmin" class="access-denied">
      <div class="denied-card">
        <div class="denied-icon"><ShieldOff /></div>
        <h2 class="denied-title">Admin Access Only</h2>
        <p class="denied-message">
          This section is restricted to <strong>Admin</strong> accounts.<br />
          Please log in with an admin email to access the Data Dashboard.
        </p>
        <div class="denied-warning">
          ⚠️ Your current role: <strong>{{ userRole || 'Not logged in' }}</strong>
        </div>
        <router-link to="/connected-services" class="denied-back-btn">← Go back to My Dashboard</router-link>
      </div>
    </div>

    <!-- ── Admin Dashboard ─────────────────────────────────────────── -->
    <div v-else class="dash-layout">

      <!-- ── LEFT: Data Products Sidebar ──────────────────────────── -->
      <aside class="products-sidebar">
        <div class="products-header">
          <Database class="products-header-icon" />
          <span>Data Sources</span>
        </div>
        <div v-if="loading" class="products-skeleton">
          <div v-for="i in 6" :key="i" class="skel-bar"></div>
        </div>
        <div v-else>
          <div class="source-group-label">
            <span class="source-dot whoop-dot"></span>Whoop
          </div>
          <button
            v-for="p in dataProducts"
            :key="p.id"
            class="product-btn"
            :class="{ active: activeProduct === p.id }"
            @click="selectProduct(p.id)"
          >
            <span class="product-label">{{ p.label }}</span>
            <span class="product-count">{{ p.record_count }}</span>
          </button>

          <div class="products-divider"></div>
          <div class="dz-info">
            <span class="dz-badge">DataZone</span>
            <span class="dz-domain">dzd-cv79bbxiotkqsi</span>
          </div>
          <div class="dz-note">Each product maps to a Glue table governed via Amazon DataZone.</div>
          <div v-if="activeProd" class="prod-detail">
            <div class="prod-detail-row"><span class="pd-label">Glue Table</span><code class="pd-val">{{ activeProd.glue_table }}</code></div>
            <div class="prod-detail-row"><span class="pd-label">DataZone Product</span><code class="pd-val small">{{ activeProd.datazone_product }}</code></div>
            <div class="prod-detail-row"><span class="pd-label">S3 Prefix</span><code class="pd-val small">{{ activeProd.s3_prefix }}</code></div>
            <div class="prod-detail-row"><span class="pd-label">Records</span><strong class="pd-val">{{ activeProd.record_count }}</strong></div>
          </div>
        </div>
      </aside>

      <!-- ── RIGHT: Main Content ───────────────────────────────────── -->
      <div class="dash-main">

        <!-- Header -->
        <div class="dash-header">
          <div>
            <h1 class="dash-title"><LayoutDashboard class="title-icon" />Data Dashboard</h1>
            <p class="dash-subtitle">
              Viewing Whoop data from connected students — powered by
              <span class="badge-athena">Amazon Athena</span>
            </p>
          </div>
          <div class="admin-meta">
            <div class="meta-chip"><span class="meta-label">Logged in as</span><span class="meta-value">{{ userEmail }}</span></div>
            <div class="meta-chip"><span class="meta-label">Admin ID</span><span class="meta-value mono">{{ userSub }}</span></div>
          </div>
        </div>

        <!-- AWS Services Strip -->
        <div class="aws-services-strip">
          <div class="aws-service-badge"><span class="aws-dot cognito"></span><span class="aws-label">Cognito</span><span class="aws-role">Auth / JWT</span></div>
          <span class="aws-arrow">→</span>
          <div class="aws-service-badge"><span class="aws-dot s3"></span><span class="aws-label">S3</span><span class="aws-role">raw/whoop/</span></div>
          <span class="aws-arrow">→</span>
          <div class="aws-service-badge"><span class="aws-dot glue"></span><span class="aws-label">Glue</span><span class="aws-role">c3l_nli_raw_devices</span></div>
          <span class="aws-arrow">→</span>
          <div class="aws-service-badge"><span class="aws-dot datazone"></span><span class="aws-label">DataZone</span><span class="aws-role">Data Products</span></div>
          <span class="aws-arrow">→</span>
          <div class="aws-service-badge"><span class="aws-dot athena"></span><span class="aws-label">Athena</span><span class="aws-role">SQL Query</span></div>
          <span class="aws-arrow">→</span>
          <div class="aws-service-badge"><span class="aws-dot lambda"></span><span class="aws-label">Lambda</span><span class="aws-role">AdminDashboard</span></div>
        </div>

        <div v-if="error" class="error-banner">⚠️ {{ error }}</div>

        <!-- Stats Cards -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon-wrap" style="background:rgba(62,175,124,.1)"><Users class="stat-icon" style="color:#3eaf7c"/></div>
            <div class="stat-body"><div class="stat-value">{{ loading ? '…' : rows.length }}</div><div class="stat-label">Students Connected</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon-wrap" style="background:rgba(99,102,241,.1)"><Activity class="stat-icon" style="color:#6366f1"/></div>
            <div class="stat-body"><div class="stat-value">{{ loading ? '…' : globalAvgSleep }}</div><div class="stat-label">Avg Sleep Performance %</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon-wrap" style="background:rgba(245,158,11,.1)"><TrendingUp class="stat-icon" style="color:#f59e0b"/></div>
            <div class="stat-body"><div class="stat-value">{{ loading ? '…' : globalAvgRecovery }}</div><div class="stat-label">Avg Recovery Score</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon-wrap" style="background:rgba(139,92,246,.1)"><Database class="stat-icon" style="color:#8b5cf6"/></div>
            <div class="stat-body"><div class="stat-value">{{ loading ? '…' : totalRecords }}</div><div class="stat-label">Total Records Synced</div></div>
          </div>
        </div>

        <!-- Athena Query Preview -->
        <div class="section-card">
          <div class="section-head">
            <h2 class="section-title"><BarChart3 class="s-icon" />Athena Query — {{ activeProd ? activeProd.label : 'Health Metrics' }}</h2>
            <div class="source-chip">
              <span class="source-dot-sm" :class="summaryData.source === 'athena' ? 'green' : 'amber'"></span>
              {{ summaryData.source === 'athena' ? 'Live Athena' : 'Local S3 Files (Athena-ready)' }}
            </div>
          </div>
          <pre class="sql-block">SELECT owner_id, email,
       AVG(recovery_score)          AS avg_recovery,
       AVG(sleep_performance_pct)   AS avg_sleep_perf,
       AVG(hrv_rmssd_milli)         AS avg_hrv,
       COUNT(*)                     AS records
FROM   {{ activeProd ? activeProd.glue_table : 'whoop_recovery_recovery' }}
WHERE  owner_id IN ({{ ownerIdList }})
  AND  date >= date('2026-01-01')
GROUP  BY owner_id, email;</pre>
        </div>

        <!-- Analytics Table -->
        <div class="section-card">
          <div class="section-head">
            <h2 class="section-title"><BarChart3 class="s-icon" />Analytics Results — {{ activeProd ? activeProd.label : 'All Products' }}</h2>
            <button class="export-btn" @click="exportCSV" :disabled="loading || rows.length === 0">
              <Download class="export-icon" />Export CSV
            </button>
          </div>
          <div v-if="loading" class="loading-wrap"><div class="spinner"></div><span>Fetching Whoop data…</span></div>
          <div v-else-if="rows.length === 0" class="empty-state">No Whoop data found. Connect via Connected Services first.</div>
          <div v-else class="table-wrap">
            <table class="analytics-table">
              <thead>
                <tr>
                  <th>User ID</th><th>Email</th><th>Display Name</th>
                  <th>Avg Recovery</th><th>Avg Sleep %</th>
                  <th>Avg HRV</th><th>Avg RHR</th>
                  <th>Recovery Records</th><th>Sleep Records</th><th>Last Synced</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.owner_id">
                  <td class="mono td-id">{{ row.owner_id }}</td>
                  <td class="td-email">{{ row.email }}</td>
                  <td>{{ row.display_name }}</td>
                  <td><div class="score-bar"><div class="bar-fill recovery" :style="{width:(row.avg_recovery_score||0)+'%'}"></div><span>{{ row.avg_recovery_score ?? '—' }}</span></div></td>
                  <td><div class="score-bar"><div class="bar-fill sleep" :style="{width:(row.avg_sleep_performance||0)+'%'}"></div><span>{{ row.avg_sleep_performance ?? '—' }}</span></div></td>
                  <td>{{ row.avg_hrv_rmssd ?? '—' }}</td>
                  <td>{{ row.avg_resting_hr ?? '—' }}</td>
                  <td>{{ row.recovery_records }}</td>
                  <td>{{ row.sleep_records }}</td>
                  <td class="td-date">{{ row.last_synced ? row.last_synced.slice(0,10) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════════════════ -->
        <!--  DATA PREVIEW — tabbed per product, dataframe-style        -->
        <!-- ══════════════════════════════════════════════════════════ -->
        <div class="section-card preview-card">
          <div class="section-head">
            <h2 class="section-title"><TableIcon class="s-icon" />Data Preview — Raw Records</h2>
            <div class="preview-meta" v-if="previewData">
              <span class="meta-file">📄 {{ previewData.sources.map(s=>s.filename).join(', ') }}</span>
              <span class="meta-rows">Showing {{ previewData.showing }} of {{ previewData.total }} rows · {{ (previewData.columns||[]).length }} columns</span>
            </div>
          </div>

          <!-- Product Tabs -->
          <div class="preview-tabs">
            <button
              v-for="p in dataProducts"
              :key="p.id"
              class="preview-tab"
              :class="{ active: previewProduct === p.id }"
              @click="loadPreview(p.id)"
            >
              {{ p.label }}
              <span class="tab-count">{{ p.record_count }}</span>
            </button>
          </div>

          <!-- Loading -->
          <div v-if="previewLoading" class="loading-wrap" style="padding:2.5rem">
            <div class="spinner"></div>
            <span>Loading {{ activeProdLabel }} records…</span>
          </div>

          <!-- No data -->
          <div v-else-if="!previewData" class="empty-state">
            Click a data product tab above to preview its raw records.
          </div>

          <!-- Dataframe table -->
          <div v-else class="df-wrapper">
            <!-- Filename / source info bar -->
            <div class="df-sourcebar">
              <span class="df-product-badge">{{ previewData.product_id }}</span>
              <span v-for="s in previewData.sources" :key="s.filename" class="df-file-chip">
                <span class="file-icon">📄</span>{{ s.filename }}<span class="file-recs">{{ s.records }} rows</span>
              </span>
            </div>

            <div class="df-table-wrap">
              <table class="df-table">
                <thead>
                  <tr>
                    <th class="df-rownum">#</th>
                    <th v-for="col in previewData.columns" :key="col" :title="col">
                      <span class="col-name">{{ col }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in previewData.rows" :key="idx">
                    <td class="df-rownum">{{ idx + 1 }}</td>
                    <td v-for="col in previewData.columns" :key="col" :title="String(row[col] ?? '')">
                      <span class="cell-val" :class="getCellClass(col, row[col])">
                        {{ formatCell(row[col]) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- CSV download for this product -->
            <div class="df-footer">
              <span class="df-note">🔗 Athena table: <code>{{ activeProd?.glue_table }}</code></span>
              <button class="export-btn small" @click="exportPreviewCSV">
                <Download class="export-icon" />Download {{ previewData.product_id }}.csv
              </button>
            </div>
          </div>
        </div>

        <!-- Architecture Steps -->
        <div class="section-card arch-note">
          <h2 class="section-title"><Shield class="s-icon" />Pipeline: Whoop → S3 → Glue → DataZone → Athena → Admin</h2>
          <div class="arch-steps">
            <div class="arch-step" v-for="(step, i) in archSteps" :key="i">
              <div class="step-num">{{ i + 1 }}</div>
              <div class="step-body">
                <div class="step-title">{{ step.title }}</div>
                <div class="step-desc">{{ step.desc }}</div>
              </div>
            </div>
          </div>
        </div>

      </div><!-- end dash-main -->
    </div><!-- end dash-layout -->
  </div>
</template>

<script setup>
import { ref, computed, onMounted, shallowRef } from 'vue'
import {
  LayoutDashboard, ShieldOff, Shield, Users, BarChart3,
  Activity, TrendingUp, Database, Download, Table as TableIcon
} from 'lucide-vue-next'
import { useAuth } from '../composables/useAuth'

const { isAdmin, userRole, userEmail, userSub } = useAuth()

// ── Summary state ────────────────────────────────────────────────────
const loading     = ref(false)
const error       = ref('')
const summaryData = ref({ source: 'local_files', rows: [], data_products: [] })
const rows         = computed(() => summaryData.value.rows || [])
const dataProducts = computed(() => summaryData.value.data_products || [])
const activeProduct = ref(null)
const activeProd    = computed(() => dataProducts.value.find(p => p.id === activeProduct.value) || null)

function selectProduct(id) {
  activeProduct.value = activeProduct.value === id ? null : id
  loadPreview(id)
}

// ── Aggregates ───────────────────────────────────────────────────────
const globalAvgRecovery = computed(() => {
  const vals = rows.value.map(r => r.avg_recovery_score).filter(v => v != null)
  return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : '—'
})
const globalAvgSleep = computed(() => {
  const vals = rows.value.map(r => r.avg_sleep_performance).filter(v => v != null)
  return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : '—'
})
const totalRecords = computed(() =>
  rows.value.reduce((acc,r) => acc + (r.recovery_records||0) + (r.sleep_records||0), 0)
)
const ownerIdList = computed(() =>
  rows.value.map(r => `'${r.owner_id}'`).join(', ') || "'—'"
)

// ── Fetch summary ────────────────────────────────────────────────────
async function fetchSummary() {
  loading.value = true; error.value = ''
  try {
    const res = await fetch('http://localhost:3001/api/admin/whoop-summary')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    summaryData.value = await res.json()
    if (summaryData.value.data_products?.length) {
      const first = summaryData.value.data_products[0].id
      activeProduct.value = first
      loadPreview(first)
    }
  } catch (err) {
    error.value = `Could not load Whoop summary: ${err.message}. Is the backend running on port 3001?`
  } finally { loading.value = false }
}

// ── Preview state ────────────────────────────────────────────────────
const previewLoading = ref(false)
const previewData    = ref(null)
const previewProduct = ref(null)
const activeProdLabel = computed(() => dataProducts.value.find(p=>p.id===previewProduct.value)?.label || '…')

async function loadPreview(productId) {
  if (previewProduct.value === productId && previewData.value) return // already loaded
  previewProduct.value = productId
  previewLoading.value = true
  previewData.value = null
  try {
    const res = await fetch(`http://localhost:3001/api/admin/whoop-raw/${productId}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    previewData.value = await res.json()
  } catch (e) {
    console.error('[Preview]', e)
  } finally { previewLoading.value = false }
}

// ── CSV Export (analytics table) ─────────────────────────────────────
function exportCSV() {
  const headers = [
    'owner_id','email','display_name','avg_recovery_score','avg_sleep_performance',
    'avg_sleep_consistency','avg_sleep_efficiency','avg_hrv_rmssd','avg_resting_hr',
    'recovery_records','sleep_records','cycle_records','workout_records',
    'profile_records','body_records','last_synced'
  ]
  const csvRows = [headers.join(',')]
  rows.value.forEach(r => {
    csvRows.push(headers.map(h=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(','))
  })
  downloadBlob(csvRows.join('\n'), `whoop_analytics_${today()}.csv`)
}

// ── CSV Export (raw preview table) ───────────────────────────────────
function exportPreviewCSV() {
  if (!previewData.value) return
  const cols = previewData.value.columns
  const csvRows = [cols.join(',')]
  previewData.value.rows.forEach(r => {
    csvRows.push(cols.map(c=>`"${String(r[c]??'').replace(/"/g,'""')}"`).join(','))
  })
  downloadBlob(csvRows.join('\n'), `whoop_${previewData.value.product_id}_${today()}.csv`)
}

function downloadBlob(content, filename) {
  const blob = new Blob([content], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function today() { return new Date().toISOString().slice(0,10) }

// ── Cell rendering helpers ────────────────────────────────────────────
function formatCell(val) {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (typeof val === 'number') return Number.isInteger(val) ? val : parseFloat(val.toFixed(4))
  const s = String(val)
  return s.length > 40 ? s.slice(0,40) + '…' : s
}

function getCellClass(col, val) {
  if (col === '_email') return 'cell-email'
  if (col === '_user_id') return 'cell-id'
  if (typeof val === 'number') return 'cell-num'
  if (typeof val === 'boolean') return val ? 'cell-true' : 'cell-false'
  if (col.endsWith('_at') || col === 'start' || col === 'end') return 'cell-date'
  if (col === 'score_state') return val === 'SCORED' ? 'cell-scored' : 'cell-na'
  return ''
}

onMounted(() => { if (isAdmin.value) fetchSummary() })

const archSteps = shallowRef([
  { title:'1. Whoop OAuth → Local S3 Files', desc:'Student clicks Connect Whoop. Backend fetches 6 data types and uploads each as JSON to S3.' },
  { title:'2. Glue Crawlers → Schema Catalog', desc:'6 crawlers scan S3 prefixes, auto-create table definitions in Glue DB c3l_nli_raw_devices.' },
  { title:'3. DataZone Data Source Sync', desc:'Lambda triggers DataZone sync. Glue tables appear as governed Data Products.' },
  { title:'4. Admin Login → JWT Verified', desc:'Admin JWT from Cognito pool verified. cognito:groups must include "admin".' },
  { title:'5. c3l-nli-AdminDashboard Lambda', desc:'Validates JWT, queries DynamoDB consent GSI, runs scoped Athena query.' },
  { title:'6. Frontend Renders', desc:'AdminDashboard.vue shows analytics table, data preview tabs, and CSV exports.' }
])
</script>

<style scoped>
.admin-dashboard { max-width:1400px; margin:0 auto; }

/* denied */
.access-denied { min-height:70vh; display:flex; align-items:center; justify-content:center; }
.denied-card { background:#fff; border:1px solid #fecaca; border-radius:16px; padding:3rem 3.5rem; max-width:520px; text-align:center; box-shadow:0 8px 40px rgba(239,68,68,.08); }
.denied-icon { width:72px;height:72px;border-radius:50%;background:rgba(239,68,68,.08);display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;color:#ef4444; }
.denied-icon svg { width:36px;height:36px; }
.denied-title { font-size:1.6rem;font-weight:700;color:#1e1e2e;margin:0 0 .75rem; }
.denied-message { color:#64748b;line-height:1.6;margin:0 0 1.25rem; }
.denied-warning { background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:.7rem 1rem;font-size:.88rem;color:#92400e;margin-bottom:1.5rem; }
.denied-back-btn { display:inline-block;padding:.65rem 1.5rem;background:var(--c-brand);color:#fff;border-radius:8px;text-decoration:none;font-weight:600; }

/* layout */
.dash-layout { display:flex; gap:1.5rem; align-items:flex-start; }
.dash-main   { flex:1; min-width:0; }

/* sidebar */
.products-sidebar { width:220px;flex-shrink:0;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1rem;position:sticky;top:1.5rem;box-shadow:0 1px 6px rgba(0,0,0,.04); }
.products-header { display:flex;align-items:center;gap:.5rem;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;margin-bottom:.75rem; }
.products-header-icon { width:14px;height:14px; }
.source-group-label { display:flex;align-items:center;gap:.4rem;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:.4rem; }
.source-dot { width:7px;height:7px;border-radius:50%;flex-shrink:0; }
.whoop-dot { background:#e74c3c; }
.product-btn { display:flex;justify-content:space-between;align-items:center;width:100%;padding:.45rem .6rem;border-radius:7px;background:transparent;border:1px solid transparent;cursor:pointer;transition:all .15s;margin-bottom:.25rem;text-align:left; }
.product-btn:hover { background:#f8fafc;border-color:#e2e8f0; }
.product-btn.active { background:rgba(139,92,246,.08);border-color:rgba(139,92,246,.3); }
.product-label { font-size:.8rem;font-weight:500;color:#334155; }
.product-btn.active .product-label { color:#7c3aed;font-weight:700; }
.product-count { font-size:.7rem;font-weight:700;background:#f1f5f9;color:#64748b;padding:.1rem .4rem;border-radius:999px; }
.product-btn.active .product-count { background:rgba(139,92,246,.15);color:#7c3aed; }
.products-divider { margin:.75rem 0;border-top:1px solid #f1f5f9; }
.dz-badge { font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;background:rgba(62,175,124,.1);color:#3eaf7c;padding:.15rem .45rem;border-radius:4px; }
.dz-domain { font-size:.65rem;color:#94a3b8;font-family:monospace;margin-left:.3rem; }
.dz-note { font-size:.68rem;color:#94a3b8;line-height:1.4;margin-top:.3rem;margin-bottom:.75rem; }
.prod-detail { background:#f8fafc;border-radius:8px;padding:.6rem .75rem; }
.prod-detail-row { margin-bottom:.4rem; }
.pd-label { font-size:.65rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;display:block; }
.pd-val { font-size:.72rem;color:#334155;font-family:monospace;word-break:break-all; }
.pd-val.small { font-size:.62rem; }
.products-skeleton { display:flex;flex-direction:column;gap:.4rem; }
.skel-bar { height:32px;border-radius:7px;background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite; }
@keyframes shimmer { 0%{background-position:-200% 0}100%{background-position:200% 0} }

/* header */
.dash-header { display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.25rem;gap:1rem;flex-wrap:wrap; }
.dash-title { font-size:1.6rem;font-weight:700;color:#1e1e2e;margin:0 0 .3rem;display:flex;align-items:center;gap:.6rem; }
.title-icon { width:26px;height:26px;color:#8b5cf6; }
.dash-subtitle { color:#64748b;font-size:.88rem;margin:0; }
.badge-athena { font-size:.7rem;font-weight:700;background:rgba(59,130,246,.1);color:#3b82f6;padding:.1rem .45rem;border-radius:4px;text-transform:uppercase;letter-spacing:.05em; }
.admin-meta { display:flex;flex-direction:column;gap:.4rem;align-items:flex-end; }
.meta-chip { display:flex;gap:.5rem;align-items:center;font-size:.78rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:.3rem .7rem; }
.meta-label { color:#94a3b8; }
.meta-value { color:#334155;font-weight:600; }
.mono { font-family:monospace;font-size:.72rem; }

/* aws strip */
.aws-services-strip { display:flex;align-items:center;gap:.4rem;margin-bottom:1.25rem;flex-wrap:wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:.6rem 1rem; }
.aws-service-badge { display:flex;align-items:center;gap:.3rem;background:#fff;border:1px solid #e2e8f0;border-radius:7px;padding:.3rem .6rem;cursor:default; }
.aws-dot { width:7px;height:7px;border-radius:50%;flex-shrink:0; }
.aws-dot.cognito  { background:#7c3aed; }
.aws-dot.s3       { background:#e67e22; }
.aws-dot.glue     { background:#16a34a; }
.aws-dot.datazone { background:#3eaf7c; }
.aws-dot.athena   { background:#3b82f6; }
.aws-dot.lambda   { background:#f59e0b; }
.aws-label { font-weight:700;font-size:.75rem;color:#1e1e2e; }
.aws-role  { font-size:.64rem;color:#94a3b8;font-style:italic; }
.aws-arrow { color:#cbd5e1;font-size:.9rem; }

/* error / loading */
.error-banner { background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.3);color:#dc2626;border-radius:8px;padding:.75rem 1rem;font-size:.88rem;margin-bottom:1rem; }
.loading-wrap { display:flex;align-items:center;gap:.75rem;padding:2rem;color:#64748b;font-size:.9rem; }
.spinner { width:20px;height:20px;border:2px solid #e2e8f0;border-top-color:#8b5cf6;border-radius:50%;animation:spin .7s linear infinite; }
@keyframes spin { to{transform:rotate(360deg)} }
.empty-state { padding:2rem;text-align:center;color:#94a3b8;font-size:.9rem; }

/* stats */
.stats-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:1.25rem; }
.stat-card { background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1.1rem;display:flex;align-items:center;gap:.9rem;box-shadow:0 1px 4px rgba(0,0,0,.04); }
.stat-icon-wrap { width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
.stat-icon { width:20px;height:20px; }
.stat-value { font-size:1.4rem;font-weight:700;color:#1e1e2e;line-height:1; }
.stat-label { font-size:.72rem;color:#64748b;margin-top:.15rem; }

/* sections */
.section-card { background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin-bottom:1.25rem;box-shadow:0 1px 4px rgba(0,0,0,.04); }
.section-head { display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem; }
.section-title { font-size:.95rem;font-weight:700;color:#1e1e2e;margin:0;display:flex;align-items:center;gap:.5rem; }
.s-icon { width:16px;height:16px;color:#8b5cf6; }
.source-chip { display:flex;align-items:center;gap:.4rem;font-size:.75rem;font-weight:600;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:.25rem .6rem;color:#64748b; }
.source-dot-sm { width:7px;height:7px;border-radius:50%; }
.source-dot-sm.green { background:#22c55e; }
.source-dot-sm.amber { background:#f59e0b; }

/* query */
.sql-block { background:#1e1e2e;color:#a5b4fc;border-radius:8px;padding:.9rem 1.1rem;font-size:.75rem;line-height:1.6;font-family:'JetBrains Mono','Fira Code',monospace;overflow-x:auto;margin:0; }

/* export btn */
.export-btn { display:flex;align-items:center;gap:.4rem;padding:.45rem .9rem;background:rgba(139,92,246,.1);color:#7c3aed;border:1px solid rgba(139,92,246,.25);border-radius:7px;font-size:.8rem;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap; }
.export-btn:hover:not(:disabled) { background:rgba(139,92,246,.2); }
.export-btn:disabled { opacity:.4;cursor:not-allowed; }
.export-btn.small { font-size:.75rem;padding:.35rem .7rem; }
.export-icon { width:14px;height:14px; }

/* analytics table */
.table-wrap { overflow-x:auto; }
.analytics-table { width:100%;border-collapse:collapse;font-size:.82rem;white-space:nowrap; }
.analytics-table th { text-align:left;padding:.55rem .75rem;color:#94a3b8;font-size:.7rem;font-weight:700;border-bottom:1px solid #e2e8f0;letter-spacing:.04em; }
.analytics-table td { padding:.7rem .75rem;border-bottom:1px solid #f1f5f9;color:#334155;vertical-align:middle; }
.analytics-table tr:last-child td { border-bottom:none; }
.td-id   { font-size:.7rem;color:#94a3b8;font-family:monospace; }
.td-email{ font-size:.78rem;color:#3b82f6;font-weight:600; }
.td-date { font-size:.72rem;color:#94a3b8; }
.score-bar { display:flex;align-items:center;gap:.6rem; }
.bar-fill  { height:5px;border-radius:999px;flex-shrink:0;min-width:4px;max-width:80px; }
.bar-fill.sleep    { background:linear-gradient(90deg,#6366f1,#a5b4fc); }
.bar-fill.recovery { background:linear-gradient(90deg,#3eaf7c,#86efac); }
.score-bar span { font-weight:700;font-size:.82rem;color:#1e1e2e; }

/* ──── DATA PREVIEW / DATAFRAME ────────────────────────────────────── */
.preview-card { overflow:hidden; }
.preview-meta { display:flex;flex-direction:column;align-items:flex-end;gap:.2rem; }
.meta-file { font-size:.7rem;color:#94a3b8;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px; }
.meta-rows { font-size:.72rem;color:#64748b;font-weight:600; }

/* tabs */
.preview-tabs { display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:1rem;padding-bottom:.75rem;border-bottom:1px solid #f1f5f9; }
.preview-tab { padding:.35rem .7rem;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;font-size:.75rem;font-weight:600;color:#64748b;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:.4rem; }
.preview-tab:hover { border-color:#c4b5fd;color:#7c3aed;background:rgba(139,92,246,.04); }
.preview-tab.active { background:rgba(139,92,246,.1);border-color:rgba(139,92,246,.4);color:#7c3aed; }
.tab-count { font-size:.65rem;background:rgba(139,92,246,.15);color:#7c3aed;padding:.05rem .35rem;border-radius:999px;font-weight:700; }

/* sourcebar */
.df-sourcebar { display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem; }
.df-product-badge { font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;background:rgba(139,92,246,.1);color:#7c3aed;padding:.2rem .6rem;border-radius:5px; }
.df-file-chip { display:inline-flex;align-items:center;gap:.3rem;font-size:.68rem;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:5px;padding:.15rem .5rem;color:#64748b;font-family:monospace; }
.file-icon { font-size:.8rem; }
.file-recs { background:#e2e8f0;border-radius:3px;padding:.05rem .3rem;font-size:.62rem;font-weight:700;color:#64748b; }

/* dataframe table */
.df-wrapper { overflow:hidden; }
.df-table-wrap { overflow:auto;max-height:420px;border:1px solid #e2e8f0;border-radius:8px;font-size:.76rem; }
.df-table { border-collapse:collapse;white-space:nowrap;width:100%; }
.df-table thead { position:sticky;top:0;z-index:2;background:#f8fafc; }
.df-table th { padding:.45rem .65rem;color:#64748b;font-size:.68rem;font-weight:700;border-bottom:2px solid #e2e8f0;border-right:1px solid #e2e8f0;text-align:left;vertical-align:bottom;letter-spacing:.03em; }
.df-table th:last-child { border-right:none; }
.col-name { max-width:120px;display:block;overflow:hidden;text-overflow:ellipsis; }
.df-rownum { color:#94a3b8!important;font-weight:400!important;font-size:.65rem!important;text-align:center!important;background:#fafafa!important;border-right:1px solid #e2e8f0!important;min-width:32px; }
.df-table td { padding:.38rem .65rem;border-bottom:1px solid #f1f5f9;border-right:1px solid #f1f5f9;max-width:180px;overflow:hidden;text-overflow:ellipsis;vertical-align:middle; }
.df-table td:last-child { border-right:none; }
.df-table tbody tr:hover td { background:rgba(139,92,246,.035); }
.df-table tbody tr:last-child td { border-bottom:none; }

/* cell value classes */
.cell-val { display:block;overflow:hidden;text-overflow:ellipsis; }
.cell-email  { color:#3b82f6;font-weight:600;font-size:.72rem; }
.cell-id     { color:#94a3b8;font-family:monospace;font-size:.68rem; }
.cell-num    { color:#1e1e2e;font-family:monospace;text-align:right;display:block; }
.cell-date   { color:#64748b;font-size:.7rem; }
.cell-scored { color:#16a34a;font-weight:700;font-size:.68rem; }
.cell-na     { color:#f59e0b;font-size:.68rem; }
.cell-true   { color:#16a34a;font-size:.7rem; }
.cell-false  { color:#94a3b8;font-size:.7rem; }

/* df footer */
.df-footer { display:flex;justify-content:space-between;align-items:center;margin-top:.75rem;flex-wrap:wrap;gap:.5rem; }
.df-note { font-size:.72rem;color:#94a3b8; }
.df-note code { font-family:monospace;background:#f1f5f9;padding:.1rem .35rem;border-radius:4px;color:#64748b; }

/* arch */
.arch-note { border-color:rgba(139,92,246,.15); }
.arch-steps { display:flex;flex-direction:column;gap:.7rem;margin-top:.9rem; }
.arch-step { display:flex;gap:1rem;align-items:flex-start; }
.step-num { width:26px;height:26px;border-radius:50%;background:#8b5cf6;color:#fff;font-size:.72rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
.step-title { font-weight:700;font-size:.85rem;color:#1e1e2e;margin-bottom:.1rem; }
.step-desc  { font-size:.78rem;color:#64748b;line-height:1.5; }
</style>
