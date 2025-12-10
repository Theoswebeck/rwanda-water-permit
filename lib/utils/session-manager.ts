import { createClient } from '@/lib/supabase/client'

interface SessionManager {
  initialize: () => void
  updateLastActivity: () => void
  detectColdStart: () => boolean
  invalidateSession: () => Promise<void>
}

// ⚡ PERFORMANCE: Throttle function to limit how often activity is updated
function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  return function (this: unknown, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

class SessionManagerImpl implements SessionManager {
  private supabase = createClient()
  private lastActivity: Date = new Date()
  private sessionTimeout = 30 * 60 * 1000 // 30 minutes
  // ⚡ PERFORMANCE: Increased heartbeat from 30s to 5 minutes
  private heartbeatInterval = 5 * 60 * 1000 // 5 minutes
  private intervalId: NodeJS.Timeout | null = null
  private initialized = false

  initialize() {
    // ⚡ PERFORMANCE: Prevent multiple initializations
    if (this.initialized) return
    this.initialized = true
    
    // Set up activity listeners
    this.setupActivityListeners()
    
    // Start heartbeat
    this.startHeartbeat()
    
    // Check for cold start only once on init
    if (this.detectColdStart()) {
      this.handleColdStart()
    }
  }

  updateLastActivity() {
    this.lastActivity = new Date()
    // ⚡ PERFORMANCE: Use try-catch for localStorage (may fail in some contexts)
    try {
      localStorage.setItem('lastActivity', this.lastActivity.toISOString())
    } catch {
      // localStorage may not be available
    }
  }

  detectColdStart(): boolean {
    try {
      const storedActivity = localStorage.getItem('lastActivity')
      if (!storedActivity) return false

      const lastStoredActivity = new Date(storedActivity)
      const now = new Date()
      const timeDiff = now.getTime() - lastStoredActivity.getTime()

      // Consider it a cold start if more than session timeout has passed
      return timeDiff > this.sessionTimeout
    } catch {
      return false
    }
  }

  async invalidateSession() {
    await this.supabase.auth.signOut()
    try {
      localStorage.removeItem('lastActivity')
    } catch {
      // localStorage may not be available
    }
    this.clearHeartbeat()
  }

  private setupActivityListeners() {
    // ⚡ PERFORMANCE: Throttle activity updates to max once per 30 seconds
    const throttledUpdate = throttle(() => this.updateLastActivity(), 30000)
    
    // ⚡ PERFORMANCE: Only listen to essential events, not mousemove
    const events = ['mousedown', 'keypress', 'touchstart']
    
    events.forEach(event => {
      document.addEventListener(event, throttledUpdate, { passive: true })
    })

    // Handle visibility changes - check session when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.updateLastActivity()
        // ⚡ PERFORMANCE: Only check validity on visibility change, not every event
        this.checkSessionValidity()
      }
    })
  }

  private startHeartbeat() {
    this.intervalId = setInterval(() => {
      this.checkSessionValidity()
    }, this.heartbeatInterval)
  }

  private clearHeartbeat() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async checkSessionValidity() {
    const now = new Date()
    const timeDiff = now.getTime() - this.lastActivity.getTime()

    if (timeDiff > this.sessionTimeout) {
      await this.invalidateSession()
      
      // Only redirect if we're not already on the login page
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login?error=session_timeout'
      }
    }
  }

  private async handleColdStart() {
    try {
      // ⚡ PERFORMANCE: Use getSession instead of getUser (cached, no network call)
      const { data: { session }, error } = await this.supabase.auth.getSession()
      
      if (error || !session) {
        await this.invalidateSession()
        return
      }

      // Only refresh if session exists but might be stale
      const { error: refreshError } = await this.supabase.auth.refreshSession()
      
      if (refreshError) {
        await this.invalidateSession()
        return
      }

      this.updateLastActivity()
    } catch {
      await this.invalidateSession()
    }
  }
}

// Export singleton instance
export const sessionManager = new SessionManagerImpl()

// Auth utilities for cache management
export const authUtils = {
  clearAuthCache: () => {
    // Clear localStorage
    const authKeys = Object.keys(localStorage).filter(key => 
      key.startsWith('supabase.') || 
      key.includes('auth') || 
      key.includes('session') ||
      key === 'lastActivity'
    )
    
    authKeys.forEach(key => localStorage.removeItem(key))
    
    // Clear sessionStorage
    const sessionKeys = Object.keys(sessionStorage).filter(key => 
      key.startsWith('supabase.') || 
      key.includes('auth') || 
      key.includes('session')
    )
    
    sessionKeys.forEach(key => sessionStorage.removeItem(key))
    
    console.log('🧹 Auth cache cleared')
  },

  forceAuthRefresh: () => {
    authUtils.clearAuthCache()
    window.location.reload()
  },

  detectAuthConflicts: () => {
    // Check for multiple auth sessions indicators
    const authKeys = Object.keys(localStorage).filter(key => 
      key.startsWith('supabase.auth.token')
    )
    
    return authKeys.length > 1
  },

  prepareForLogin: () => {
    authUtils.clearAuthCache()
    sessionManager.updateLastActivity()
  }
}
