<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h1 class="logo">NextLevel Insights</h1>
      <!-- Role badge -->
      <div v-if="isLoggedIn" class="role-badge" :class="userRole">
        <span class="role-dot"></span>
        {{ userRole === 'admin' ? 'Admin' : 'Student' }}
      </div>
    </div>

    <!-- Auth status -->
    <div class="auth-controls">
      <template v-if="!isLoggedIn">
        <div class="not-logged-in">
          <span class="not-logged-hint">← Sign In via header to access your dashboard</span>
        </div>
      </template>
      <template v-else>
        <div class="user-info">
          <span class="user-email">{{ userEmail }}</span>
        </div>
      </template>
    </div>

    <nav class="nav-links">
      <!-- Student Section -->
      <div class="section-label">My Account</div>

      <router-link to="/connected-services" class="nav-item">
        <LayoutGrid class="icon" />
        <span class="text">Connected Services</span>
      </router-link>

      <!-- Data Resources Section -->
      <div class="nav-group">
        <div class="nav-item group-header" @click="toggleResources" :class="{ active: isResourcesOpen }">
          <Database class="icon" />
          <span class="text">Data Resources</span>
          <ChevronDown class="chevron" :class="{ rotated: isResourcesOpen }" />
        </div>
        <div class="sub-menu" v-show="isResourcesOpen">
          <router-link to="/resources/whoop" class="nav-item sub-item">
            <span class="dot"></span>
            Whoop
          </router-link>
          <router-link to="/resources/apple-health" class="nav-item sub-item">
            <span class="dot"></span>
            Apple Watch
          </router-link>
          <router-link to="/resources/fitbit" class="nav-item sub-item">
            <span class="dot"></span>
            Fitbit
          </router-link>
          <router-link to="/resources/moodle" class="nav-item sub-item">
            <span class="dot"></span>
            Moodle
          </router-link>
          <router-link to="/resources/canvas" class="nav-item sub-item">
            <span class="dot"></span>
            Canvas
          </router-link>
        </div>
      </div>

      <router-link to="/data-permissions" class="nav-item">
        <Shield class="icon" />
        <span class="text">Data Permissions</span>
      </router-link>

      <router-link to="/data-insights" class="nav-item">
        <BarChart3 class="icon" />
        <span class="text">Data Insights</span>
      </router-link>

      <router-link to="/data-retention" class="nav-item">
        <Database class="icon" />
        <span class="text">Data Retention</span>
      </router-link>

      <router-link to="/ai-chat" class="nav-item">
        <MessageSquare class="icon" />
        <span class="text">AI Chat</span>
      </router-link>

      <!-- ─────────────────────────────────────────────────── -->
      <!-- ADMIN SECTION — only visible to admin role         -->
      <!-- ─────────────────────────────────────────────────── -->
      <template v-if="isAdmin">
        <div class="section-divider"></div>
        <div class="section-label admin-label">
          <ShieldCheck class="section-icon" />
          Admin Session
        </div>

        <!-- Data Dashboard sub-group -->
        <div class="nav-group">
          <div class="nav-item group-header admin-group" @click="toggleAdminDash" :class="{ active: isAdminDashOpen }">
            <LayoutDashboard class="icon" />
            <span class="text">Data Dashboard</span>
            <ChevronDown class="chevron" :class="{ rotated: isAdminDashOpen }" />
          </div>
          <div class="sub-menu" v-show="isAdminDashOpen">
            <router-link to="/admin/dashboard" class="nav-item sub-item admin-sub-item">
              <span class="dot admin-dot"></span>
              Student Analytics
            </router-link>
          </div>
        </div>
      </template>

    </nav>
  </aside>
</template>

<script setup>
import { ref } from 'vue'
import {
  LayoutGrid, Shield, BarChart3, Database, MessageSquare,
  ChevronDown, ShieldCheck, LayoutDashboard
} from 'lucide-vue-next'
import { useAuth } from '../composables/useAuth'

const { userRole, userEmail, isAdmin, isLoggedIn } = useAuth()

const isResourcesOpen = ref(true)
const isAdminDashOpen = ref(true)

const toggleResources = () => {
  isResourcesOpen.value = !isResourcesOpen.value
}
const toggleAdminDash = () => {
  isAdminDashOpen.value = !isAdminDashOpen.value
}
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  background-color: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  z-index: 10;
  overflow-y: auto;
}

.sidebar-header {
  padding: 1.2rem 1.5rem 0.8rem;
  border-bottom: 1px solid var(--sidebar-border);
}

.logo {
  font-size: 1.25rem;
  color: var(--c-brand);
  margin: 0 0 0.4rem;
  font-weight: bold;
}

/* Role Badge */
.role-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  margin-bottom: 0.2rem;
  background: rgba(62, 175, 124, 0.12);
  color: var(--c-brand);
}
.role-badge.admin {
  background: rgba(139, 92, 246, 0.12);
  color: #8b5cf6;
}
.role-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* Auth controls */
.auth-controls {
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.not-logged-in {
  padding: 0.5rem 0;
}
.not-logged-hint {
  font-size: 0.7rem;
  color: var(--c-text-light);
  font-style: italic;
  line-height: 1.4;
}
.user-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.user-email {
  font-size: 0.72rem;
  color: var(--c-text-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
}
.logout-btn {
  font-size: 0.72rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  border: 1px solid var(--sidebar-border);
  background: transparent;
  color: var(--c-text-light);
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s, border-color 0.2s;
}
.logout-btn:hover { color: #ef4444; border-color: #ef4444; }

/* Section labels */
.section-label {
  padding: 0.5rem 1.5rem 0.25rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-text-light);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.admin-label { color: #8b5cf6; }
.section-icon { width: 12px; height: 12px; }
.section-divider {
  margin: 0.75rem 1rem;
  border-top: 1px solid var(--sidebar-border);
}

/* Nav */
.nav-links {
  padding: 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 0.65rem 1.5rem;
  color: var(--c-text);
  transition: color 0.2s, background-color 0.2s;
  gap: 0.85rem;
  cursor: pointer;
  text-decoration: none;
}
.nav-item:hover { color: var(--c-brand); background-color: var(--c-bg-light); }
.nav-item.router-link-active:not(.group-header) {
  color: var(--c-brand);
  border-right: 3px solid var(--c-brand);
  background-color: rgba(62, 175, 124, 0.1);
}

/* Admin active state uses purple */
.admin-sub-item.router-link-active {
  color: #8b5cf6 !important;
  border-right-color: #8b5cf6 !important;
  background-color: rgba(139, 92, 246, 0.08) !important;
}

.icon { width: 18px; height: 18px; }
.text { font-weight: 500; flex: 1; font-size: 0.9rem; }

/* Sub-menu */
.nav-group { display: flex; flex-direction: column; }
.group-header { justify-content: space-between; }
.group-header.active { color: var(--c-text); }
.admin-group:hover { color: #8b5cf6 !important; background-color: rgba(139, 92, 246, 0.06) !important; }

.chevron { width: 14px; height: 14px; transition: transform 0.3s ease; }
.chevron.rotated { transform: rotate(180deg); }

.sub-menu { display: flex; flex-direction: column; background-color: rgba(0,0,0,0.02); }
.sub-item { padding-left: 2.75rem; font-size: 0.875rem; padding-top: 0.45rem; padding-bottom: 0.45rem; }

.dot {
  width: 5px; height: 5px;
  background-color: var(--c-text-light);
  border-radius: 50%;
  margin-right: 0.7rem;
  flex-shrink: 0;
  transition: background-color 0.2s;
}
.admin-dot { background-color: rgba(139, 92, 246, 0.4); }
.sub-item:hover .dot { background-color: var(--c-brand); }
.sub-item.router-link-active .dot { background-color: var(--c-brand); }
.admin-sub-item:hover .admin-dot { background-color: #8b5cf6; }
.admin-sub-item.router-link-active .admin-dot { background-color: #8b5cf6; }
</style>
