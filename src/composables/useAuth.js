/**
 * useAuth.js
 * ------------------------------------------------------------------
 * c3l-NLI — Role-based authentication composable (frontend)
 *
 * In production: reads role/sub from verified Cognito JWT (GET /me).
 * In development/demo: simulates login with localStorage persistence.
 *
 * Roles:
 *   admin   — sees Admin section + Data Dashboard
 *   student — sees My Data, Share Data, etc. Admin section hidden.
 * ------------------------------------------------------------------
 */

import { ref, computed } from 'vue'

// ── Shared reactive state (module-level singleton) ──────────────────
const userRole = ref(localStorage.getItem('nli_role') || null)
const userEmail = ref(localStorage.getItem('nli_email') || null)
const userSub = ref(localStorage.getItem('nli_sub') || null)

export function useAuth() {
    // ── Computed helpers ────────────────────────────────────────────────
    const isAdmin = computed(() => userRole.value === 'admin')
    const isStudent = computed(() => userRole.value === 'student')
    const isLoggedIn = computed(() => !!userRole.value)

    /**
     * Simulate a login.
     * In production, replace this with Cognito Hosted UI or Amplify Auth.
     * @param {'admin'|'student'} role
     * @param {string} email
     * @param {string} [sub] — Cognito UUID (sub). Falls back to a fake UUID.
     */
    function login(role, email, sub = null) {
        const id = sub || `${role}-${Date.now()}`
        userRole.value = role
        userEmail.value = email
        userSub.value = id
        localStorage.setItem('nli_role', role)
        localStorage.setItem('nli_email', email)
        localStorage.setItem('nli_sub', id)
    }

    function logout() {
        userRole.value = null
        userEmail.value = null
        userSub.value = null
        localStorage.removeItem('nli_role')
        localStorage.removeItem('nli_email')
        localStorage.removeItem('nli_sub')
    }

    return {
        userRole,
        userEmail,
        userSub,
        isAdmin,
        isStudent,
        isLoggedIn,
        login,
        logout,
    }
}
