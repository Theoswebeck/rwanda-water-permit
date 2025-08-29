import { createClient } from '@/lib/supabase/client'

interface SessionManager {
  initialize: () => void
  updateLastActivity: () => void
  detectColdStart: () => boolean
  invalidateSession: () => Promise<void>
}

class SessionManagerImpl implements SessionManager {
  private supabase = createClient()
  private lastActivity: Date = new Date()
  private sessionTimeout = 30 * 60 * 1000 // 30 minutes
  private heartbeatInterval = 30 * 1000 // 30 seconds
  private intervalId: NodeJS.Timeout | null = null

  initialize() {
    console.log('🚀 Session manager initialized')
    
    // Set up activity listeners
    this.setupActivityListeners()
    
    // Start heartbeat
    this.startHeartbeat()
    
    // Check for cold start
    if (this.detectColdStart()) {
      console.log('❄️ Cold start detected')
      this.handleColdStart()
    }
  }

  updateLastActivity() {
    this.lastActivity = new Date()
    localStorage.setItem('lastActivity', this.lastActivity.toISOString())
  }

  detectColdStart(): boolean {
    const storedActivity = localStorage.getItem('lastActivity')
    if (!storedActivity) return false

    const lastStoredActivity = new Date(storedActivity)
    const now = new Date()
    const timeDiff = now.getTime() - lastStoredActivity.getTime()

    // Consider it a cold start if more than session timeout has passed
    return timeDiff > this.sessionTimeout
  }

  async invalidateSession() {
    console.log('🔄 Invalidating session')
    await this.supabase.auth.signOut()
    localStorage.removeItem('lastActivity')
    this.clearHeartbeat()
  }

  private setupActivityListeners() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    
    events.forEach(event => {
      document.addEventListener(event, () => this.updateLastActivity(), { passive: true })
    })

    // Handle visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.updateLastActivity()
        this.checkSessionValidity()
      }
    })

    // Handle page unload
    window.addEventListener('beforeunload', () => {
      this.updateLastActivity()
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
      console.log('⏰ Session timeout detected')
      await this.invalidateSession()
      
      // Only redirect if we're not already on the login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login?error=session_timeout'
      }
    }
  }

  private async handleColdStart() {
    try {
      // Check if current session is still valid
      const { data: { user }, error } = await this.supabase.auth.getUser()
      
      if (error || !user) {
        console.log('❌ Invalid session on cold start')
        await this.invalidateSession()
        return
      }

      // Refresh the session
      const { error: refreshError } = await this.supabase.auth.refreshSession()
      
      if (refreshError) {
        console.log('❌ Failed to refresh session on cold start')
        await this.invalidateSession()
        return
      }

      console.log('✅ Session refreshed successfully')
      this.updateLastActivity()
    } catch (error) {
      console.error('❌ Cold start error:', error)
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
