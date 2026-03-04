<template>
  <header class="header">
    <div class="header-content">

      <!-- ── Left: User Identity Pill (shown when logged in) ── -->
      <div v-if="isLoggedIn" class="user-identity">
        <div class="role-pill" :class="userRole">
          <span class="role-icon">{{ userRole === 'admin' ? '💼' : '🎓' }}</span>
          <span class="role-label">{{ userRole === 'admin' ? 'Admin' : 'Student' }}</span>
        </div>
        <span class="user-email-pill">{{ userEmail }}</span>
      </div>

      <!-- ── Right: Nav + Auth controls ── -->
      <div class="right-section">
        <router-link to="/about" class="header-link">About Us</router-link>

        <!-- Shown when NOT logged in -->
        <template v-if="!isLoggedIn">
          <a href="#" class="header-link" @click.prevent="openAuth('signin')">Sign In</a>
          <button class="header-link account-btn" @click="openAuth('signup')">Sign Up</button>
        </template>

        <!-- Shown when logged in -->
        <template v-else>
          <button class="logout-btn" @click="handleLogout">
            <LogOut class="logout-icon" />
            Logout
          </button>
        </template>
      </div>
    </div>

    <!-- Auth Modal -->
    <transition name="modal">
      <AuthModal
        v-if="showAuth"
        :initial-mode="authMode"
        @close="showAuth = false"
        @success="handleAuthSuccess"
      />
    </transition>
  </header>
</template>

<script setup>
import { ref } from 'vue'
import { LogOut } from 'lucide-vue-next'
import AuthModal from './AuthModal.vue'
import { useAuth } from '../composables/useAuth'
import { useRouter } from 'vue-router'

const { isLoggedIn, userRole, userEmail, logout } = useAuth()
const router = useRouter()

const showAuth = ref(false)
const authMode = ref('signin')

const openAuth = (mode) => {
  authMode.value = mode
  showAuth.value = true
}

const handleAuthSuccess = () => {
  showAuth.value = false
}

const handleLogout = () => {
  logout()
  router.push('/connected-services')
}
</script>

<style scoped>
.header {
  height: 4rem;
  background-color: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
  position: sticky;
  top: 0;
  z-index: 5;
  padding: 0 2rem;
}

.header-content {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ── User identity (left side when logged in) ── */
.user-identity {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.role-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: rgba(62, 175, 124, 0.12);
  color: var(--c-brand);
  border: 1px solid rgba(62, 175, 124, 0.25);
  transition: all 0.2s;
}
.role-pill.admin {
  background: rgba(139, 92, 246, 0.12);
  color: #8b5cf6;
  border-color: rgba(139, 92, 246, 0.25);
}

.role-icon { font-size: 0.9rem; }
.role-label { text-transform: uppercase; }

.user-email-pill {
  font-size: 0.8rem;
  color: var(--c-text-light);
  font-weight: 500;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Right section ── */
.right-section {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.header-link {
  color: var(--c-text);
  font-weight: 500;
  font-size: 0.9rem;
  text-decoration: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  transition: color 0.2s;
}
.header-link:hover { color: var(--c-brand); }

.account-btn {
  padding: 0.45rem 1rem;
  background-color: var(--c-brand);
  color: white;
  border-radius: 6px;
}
.account-btn:hover { background-color: var(--c-brand-light); color: white; }

/* ── Logout button ── */
.logout-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.9rem;
  border-radius: 6px;
  border: 1px solid var(--c-border);
  background: transparent;
  color: var(--c-text-light);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.2s, border-color 0.2s;
}
.logout-btn:hover { color: #ef4444; border-color: #ef4444; }
.logout-icon { width: 14px; height: 14px; }

/* Modal Transition */
.modal-enter-active, .modal-leave-active { transition: opacity 0.3s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
