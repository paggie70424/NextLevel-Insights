import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/connected-services'
    },
    {
      path: '/connected-services',
      name: 'connected-services',
      component: () => import('../views/ConnectedServices.vue')
    },
    {
      path: '/data-permissions',
      name: 'data-permissions',
      component: () => import('../views/DataPermissions.vue')
    },
    {
      path: '/data-insights',
      name: 'data-insights',
      component: () => import('../views/DataInsights.vue')
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutUs.vue')
    },
    {
      path: '/data-retention',
      name: 'data-retention',
      component: () => import('../views/DataRetention.vue')
    },
    // Data Resources Routes
    {
      path: '/resources/whoop',
      name: 'resources-whoop',
      component: () => import('../views/DataResources/WhoopView.vue')
    },
    {
      path: '/resources/apple-health',
      name: 'resources-apple',
      component: () => import('../views/DataResources/AppleWatchView.vue')
    },
    {
      path: '/resources/fitbit',
      name: 'resources-fitbit',
      component: () => import('../views/DataResources/FitbitView.vue')
    },
    {
      path: '/resources/moodle',
      name: 'resources-moodle',
      component: () => import('../views/DataResources/MoodleView.vue')
    },
    {
      path: '/resources/canvas',
      name: 'resources-canvas',
      component: () => import('../views/DataResources/CanvasView.vue')
    },
    {
      path: '/whoop-consent',
      name: 'whoop-consent',
      component: () => import('../views/WhoopConsent.vue'),
      meta: { layout: 'empty' }
    },
    {
      path: '/apple-consent',
      name: 'apple-consent',
      component: () => import('../views/AppleConsent.vue'),
      meta: { layout: 'empty' }
    },
    {
      path: '/ai-chat',
      name: 'ai-chat',
      component: () => import('../views/AIChat.vue')
    },
    // ─── Admin Routes ───────────────────────────────────────────────
    {
      path: '/admin/dashboard',
      name: 'admin-dashboard',
      component: () => import('../views/AdminDashboard.vue'),
      meta: { requiresAdmin: true }
    }
  ]
})

// ── Navigation Guard: role-based access control ─────────────────────
router.beforeEach((to) => {
  const { isAdmin, isLoggedIn } = useAuth()

  if (to.meta.requiresAdmin) {
    // Not logged in or not admin → redirect to home
    if (!isLoggedIn.value || !isAdmin.value) {
      return { name: 'connected-services' }
    }
  }
})

export default router
