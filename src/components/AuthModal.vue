<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      
      <div class="modal-header">
        <h2>{{ headerTitle }}</h2>
        <p class="subtitle">
          {{ headerSubtitle }}
        </p>
      </div>

      <!-- Sign in with Apple (hidden on Forgot Password) -->
      <div v-if="mode !== 'forgot'" class="social-auth">
        <SignInWithAppleButton
          :type="mode === 'signup' ? 'signup' : 'signin'"
          theme="black"
          @error="onAppleSignInError"
        />
      </div>

      <div class="divider" v-if="mode !== 'forgot'">
        <span>or continue with email</span>
      </div>

      <form @submit.prevent="handleSubmit" class="auth-form">
        
        <!-- Role Selection (Visible for both Sign In and Sign Up as requested) -->
        <div class="form-group">
          <label>I am a:</label>
          <div class="role-selector">
            <label class="role-option" :class="{ active: form.role === 'Student' }">
              <input type="radio" v-model="form.role" value="Student">
              <span class="role-icon">🎓</span> 
              Student
            </label>
            <label class="role-option" :class="{ active: form.role === 'Admin' }">
              <input type="radio" v-model="form.role" value="Admin">
              <span class="role-icon">💼</span>
              Admin / Staff
            </label>
          </div>
        </div>

        <!-- Sign Up Fields -->
        <div v-if="mode === 'signup'" class="form-row">
           <div class="form-group half">
            <label>Prefix</label>
            <select v-model="form.prefix" required>
              <option value="Mr">Mr</option>
              <option value="Ms">Ms</option>
              <option value="Mrs">Mrs</option>
              <option value="Dr">Dr</option>
            </select>
          </div>
          <div class="form-group half">
            <label>Gender</label>
             <select v-model="form.gender" required>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
        </div>

        <div v-if="mode === 'signup'" class="form-row">
          <div class="form-group half">
            <label>First Name</label>
            <input type="text" v-model="form.firstName" required>
          </div>
          <div class="form-group half">
            <label>Last Name</label>
            <input type="text" v-model="form.lastName" required>
          </div>
        </div>

        <div class="form-group">
          <label>Email Address</label>
          <input type="email" v-model="form.email" required>
        </div>

        <div v-if="mode === 'signup'" class="form-group">
          <label>Phone Number</label>
          <input type="tel" v-model="form.phone" required>
        </div>

        <!-- Forgot Password does not need password field -->
        <div v-if="mode !== 'forgot'" class="form-group">
          <label>Password</label>
          <input type="password" v-model="form.password" required>
          <a v-if="mode === 'signin'" href="#" class="forgot-link" @click.prevent="switchToForgot">Forgot Password?</a>
        </div>

        <button type="submit" class="submit-btn" :disabled="loading">
          {{ loading ? 'Processing...' : submitButtonText }}
        </button>
      </form>
      
      <div v-if="statusMessage" class="status-message" :class="statusType">
        {{ statusMessage }}
      </div>

      <div class="modal-footer">
        <p v-if="mode !== 'forgot'">
          {{ mode === 'signin' ? "Don't have an account?" : "Already have an account?" }}
          <a href="#" @click.prevent="toggleMode">{{ mode === 'signin' ? 'Sign Up' : 'Sign In' }}</a>
        </p>
        <p v-else>
          <a href="#" @click.prevent="mode = 'signin'">Back to Sign In</a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import SignInWithAppleButton from './SignInWithAppleButton.vue'
import { useAuth } from '../composables/useAuth'

const props = defineProps({
  initialMode: {
    type: String,
    default: 'signin'
  }
})

const emit = defineEmits(['close', 'success'])
const { login } = useAuth()

const mode = ref(props.initialMode)
const loading = ref(false)
const statusMessage = ref('')
const statusType = ref('info')

const form = reactive({
  role: 'Student',
  prefix: 'Mr',
  firstName: '',
  lastName: '',
  gender: 'Male',
  email: '',
  phone: '',
  password: ''
})

const headerTitle = computed(() => {
  if (mode.value === 'signin') return 'Welcome Back'
  if (mode.value === 'signup') return 'Create Account'
  return 'Reset Password'
})

const headerSubtitle = computed(() => {
  if (mode.value === 'signin') return `Sign in as ${form.role} to access your dashboard.`
  if (mode.value === 'signup') return 'Enter your details to get started.'
  return 'Enter your email to receive a reset link.'
})

const submitButtonText = computed(() => {
  if (mode.value === 'signin') return 'Sign In'
  if (mode.value === 'signup') return 'Sign Up'
  return 'Send Reset Link'
})

const toggleMode = () => {
  mode.value = mode.value === 'signin' ? 'signup' : 'signin'
  statusMessage.value = ''
}

const switchToForgot = () => {
  mode.value = 'forgot'
  statusMessage.value = ''
}

const onAppleSignInError = (err) => {
  statusMessage.value = err?.message || 'Sign in with Apple is not configured.'
  statusType.value = 'error'
}

const handleSubmit = async () => {
  if (mode.value === 'signin') {
      // Map UI role label → internal role key
      // 'Admin' maps to the 'admin' Cognito group (staff group deleted)
      const roleKey = form.role === 'Admin' ? 'admin' : 'student'
      // Update global auth state immediately
      login(roleKey, form.email)
      statusMessage.value = `Welcome back! Signed in as ${form.role}.`
      statusType.value = 'success'
      setTimeout(() => emit('success', { email: form.email, role: roleKey }), 800)
      return;
  }

  if (mode.value === 'forgot') {
      loading.value = true
      statusMessage.value = ''
      
      try {
        const response = await fetch('http://localhost:3001/api/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: form.email })
        })
        const data = await response.json()
        
        if (response.ok) {
             statusMessage.value = data.message
             statusType.value = 'success'
        } else {
             throw new Error(data.error || 'Request failed')
        }
      } catch (err) {
          statusMessage.value = err.message
          statusType.value = 'error'
      } finally {
          loading.value = false
      }
      return;
  }

  // Sign Up Logic
  loading.value = true
  statusMessage.value = ''
  
  try {
    const response = await fetch('http://localhost:3001/api/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(form)
    })

    const data = await response.json()

    if (response.ok) {
      statusMessage.value = 'Account created! Data saved to S3.'
      statusType.value = 'success'
      setTimeout(() => emit('success', form), 1500)
    } else {
      // Handle Conflict (Duplicate User)
      if (response.status === 409) {
          statusMessage.value = data.message || 'User already exists.'
          statusType.value = 'error'
          // Optional: automatically switch to signin after a delay, but let the user read the message first
      } else {
          throw new Error(data.error || 'Registration failed')
      }
    }
  } catch (err) {
    statusMessage.value = err.message
    statusType.value = 'error'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  width: 100%;
  max-width: 450px;
  position: relative;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #888;
}

.modal-header {
  text-align: center;
  margin-bottom: 2rem;
}

.modal-header h2 {
  font-size: 1.75rem;
  color: var(--c-text);
  margin-bottom: 0.5rem;
}

.subtitle {
  color: var(--c-text-light);
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-row {
  display: flex;
  gap: 1rem;
}

.half {
  flex: 1;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  font-size: 0.9rem;
}

input, select {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--c-border);
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.2s;
}

input:focus, select:focus {
  outline: none;
  border-color: var(--c-brand);
}

.role-selector {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
}

.role-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--c-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 600;
}

.role-option:hover {
  background-color: var(--c-bg-light);
}

.role-option.active {
  border-color: var(--c-brand);
  background-color: rgba(62, 175, 124, 0.1); /* Assuming var(--c-brand) uses main green color */
  color: var(--c-brand);
}

.role-option input[type="radio"] {
  display: none;
}

.role-icon {
  font-size: 1.2em;
}

.social-auth {
  margin-bottom: 1rem;
}

.social-auth :deep(.sign-in-with-apple) {
  width: 100%;
}

.divider {
  display: flex;
  align-items: center;
  margin: 1.25rem 0;
  color: var(--c-text-light);
  font-size: 0.9rem;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--c-border);
}

.divider span {
  padding: 0 1rem;
}

.submit-btn {
  width: 100%;
  padding: 0.875rem;
  background-color: var(--c-brand);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  margin-top: 1rem;
  transition: background-color 0.2s;
}

.submit-btn:hover {
  background-color: var(--c-brand-light);
}

.submit-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.modal-footer {
  text-align: center;
  margin-top: 1.5rem;
  font-size: 0.9rem;
  color: var(--c-text-light);
}

.modal-footer a, .forgot-link {
  color: var(--c-brand);
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}

.forgot-link {
    display: block;
    text-align: right;
    font-size: 0.85rem;
    margin-top: 0.25rem;
    font-weight: 400;
}

.modal-footer a:hover, .forgot-link:hover {
    text-decoration: underline;
}

.status-message {
  margin-top: 1rem;
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.9rem;
  text-align: center;
}

.status-message.error {
  background-color: #fdezea;
  color: #e74c3c;
}

.status-message.success {
  background-color: rgba(62, 175, 124, 0.1);
  color: var(--c-brand);
}
</style>
