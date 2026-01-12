"use client";

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { User } from '@/types/database'

interface SignUpData {
  email: string;
  password: string;
  accountType: 'individual' | 'company';
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  companyName?: string;
  companyTIN?: string;
  companyAddress?: string;
  companyPhone?: string;
  phone?: string;
  idNumber?: string;
  idType?: string;
  identification?: { number: string; type: string };
}

interface AuthContextType {
  user: SupabaseUser | null
  userProfile: User | null
  loading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string; mustChangePassword?: boolean }>
  signUp: (data: SignUpData & { emailCode?: string }) => Promise<{ error?: string, userId?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfile: (updates: Partial<User>) => Promise<{ error?: string }>
  resetPassword: (email: string) => Promise<{ error?: string }>
  changePassword: (newPassword: string) => Promise<{ error?: string }>
  isApplicant: boolean
  isAdmin: boolean
  isReviewer: boolean
  isInspector: boolean
  isApprover: boolean
}

// Create auth context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Custom hook for using auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Auth provider component
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Create Supabase client instance
  const supabase = createClient();

  const withTimeout = async <T,>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> => {
    const timeoutError = new Error(`timeout:${label}`);
    return (await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => setTimeout(() => reject(timeoutError), timeoutMs)),
    ])) as T;
  };

  const isProtectedPath = (pathname: string) => {
    return (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/review') ||
      pathname.startsWith('/inspection') ||
      pathname.startsWith('/assessment') ||
      pathname.startsWith('/approver') ||
      pathname.startsWith('/technical-assessment') ||
      pathname.startsWith('/management') ||
      pathname.startsWith('/verifier')
    );
  };

  const getUserWithTimeout = async (timeoutMs = 8000) => {
    // Supabase's getUser() can hang indefinitely on bad networking/DNS.
    // We use a timeout to ensure UI isn't blocked forever.
    const timeoutResult = {
      data: { user: null as SupabaseUser | null },
      error: { message: 'timeout', status: 0 },
    };

    try {
      return (await Promise.race([
        supabase.auth.getUser(),
        new Promise<any>((resolve) => setTimeout(() => resolve(timeoutResult), timeoutMs)),
      ])) as { data: { user: SupabaseUser | null }; error: any };
    } catch (e: any) {
      return {
        data: { user: null },
        error: { message: e?.message || 'Network error', status: e?.status || 0 },
      };
    }
  };

  // Function to fetch user profile
  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('🔍 Fetching profile for user:', userId);
      
      if (!userId) {
        console.error('❌ No user ID provided to fetchUserProfile');
        return null;
      }

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (data) {
        console.log('🔍 Fetched profile data:', {
          id: data.id,
          account_type: data.account_type,
          company_name: data.company_name,
          first_name: data.first_name,
          last_name: data.last_name
        });
      }
      
      if (error) {
        console.error('❌ Error fetching user profile:', error);
        console.log('Error details:', {
          code: error.code,
          message: error.message,
          hint: error.hint,
          details: error.details
        });
        
        // If profile doesn't exist, check if this is a deleted user
        if (error.code === 'PGRST116') {
          // For security: If user exists in auth but not in our users table,
          // it could mean they were deleted by admin - sign them out
          console.log('🚨 User profile not found in database');
          console.log('🔒 Signing out for security (user may have been deleted)...');
          
          try {
            await supabase.auth.signOut();
            setUser(null);
            setUserProfile(null);
            // ⚡ FIX: Redirect to login immediately after signout
            if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
              window.location.href = '/login?error=account_deleted';
            }
            return null;
          } catch (signOutError) {
            console.error('❌ Error during security sign out:', signOutError);
            return null;
          }
          
          // Note: Code below only runs if signOut fails
          console.log('📝 Profile not found, creating basic profile...');
          
          // Get the current user's email from auth
          const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
          
          if (userError) {
            console.error('❌ Error getting current user:', userError);
            return null;
          }
          
          const email = authUser?.email;
          if (authUser && email) {
            console.log('📧 Creating profile for user:', email);
            
            const basicProfile = {
              id: userId,
              email,
              role: 'applicant' as const,
              status: 'active' as const,
              account_type: 'individual' as const,
              first_name: 'User', // Required by check constraint
              last_name: 'Profile', // Required by check constraint
              applications_count: 0,
              reviews_count: 0,
              inspections_count: 0,
              profile_completed: false, // Mark as incomplete so user can update
              phone_verified: false, // Phone verification status
              phone_verification_attempts: 0, // Verification attempts
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            const { data: insertData, error: createError } = await supabase
              .from('users')
              .insert([basicProfile])
              .select()
              .single();

            if (createError != null) {
              const err = createError as NonNullable<typeof createError>;
              console.error('❌ Error creating profile during fetch:', err);
              console.log('Create error details:', {
                code: err.code,
                message: err.message,
                hint: err.hint,
                details: err.details
              });
              
              // Try one more time to fetch in case it was created by trigger
              await new Promise(resolve => setTimeout(resolve, 1000));
              const { data: retryData, error: retryError } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();
                
              if (!retryError && retryData) {
                console.log('✅ Profile found on retry');
                setUserProfile(retryData);
                return retryData;
              }
              
              return null;
            } else {
              console.log('✅ Profile created successfully during fetch');
              const newProfile = insertData || basicProfile;
              setUserProfile(newProfile);
              return newProfile;
            }
          } else {
            console.error('❌ No authenticated user found for profile creation');
            return null;
          }
        }
        return null;
      }
      
      console.log('✅ Profile loaded successfully');
      setUserProfile(data);
      return data;
    } catch (err) {
      console.error('❌ Unexpected error fetching profile:', err);
      return null;
    }
  };

  useEffect(() => {
    // Get initial user
    const getInitialUser = async () => {
      try {
        setLoading(true);

        // Fast-path: getSession() is local and does not require a network round-trip.
        // This prevents "infinite loading" when Supabase auth endpoints are slow/unreachable.
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData?.session?.user ?? null;
        setUser(sessionUser);

        if (sessionUser) {
          const metadata = sessionUser.user_metadata;
          if (metadata && metadata.role && metadata.status) {
            console.log('⚡ Using cached metadata for fast load');
            const fastProfile = {
              id: sessionUser.id,
              email: sessionUser.email || '',
              role: metadata.role as any,
              status: metadata.status as any,
              account_type: (metadata.account_type || 'individual') as any,
              first_name: metadata.first_name || 'User',
              last_name: metadata.last_name || 'Profile',
              applications_count: 0,
              reviews_count: 0,
              inspections_count: 0,
              profile_completed: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as User;

            setUserProfile(fastProfile);
          }
        } else {
          setUserProfile(null);
        }

        // Unblock UI immediately; validation happens after.
        setLoading(false);

        // Validate in background via getUser() (network) with timeout.
        let user = sessionUser;
        let userError: any = null;
        try {
          const result = await getUserWithTimeout(8000);
          user = result.data?.user ?? null;
          userError = result.error;
        } catch (fetchError: any) {
          console.error('❌ Network error getting user:', fetchError?.message || fetchError);
          userError = { message: fetchError?.message || 'Network error', status: 0 };
        }
        
        // ⚡ FIX: Handle auth errors (403 Forbidden, network errors, timeouts)
        // Note: "Auth session missing!" is expected when the user is logged out.
        if (userError) {
          const message = userError.message || '';
          const status = (userError as any).status;

        // #region agent log
        // Disabled: writing debug logs during dev can create rebuild loops.
        // #endregion

          const isMissingSession =
            message.includes('Auth session missing') ||
            message.includes('No session') ||
            message.includes('session missing');

          if (isMissingSession) {
            // Treat as a normal logged-out state: no error, no signOut, no redirect
            console.log('ℹ️ No active auth session (logged out).');
            setUser(null);
            setUserProfile(null);
            setLoading(false);
            return;
          }

          console.error('❌ Error getting user from auth:', message);
          
          const isNetworkError =
            status === 0 ||
            message.includes('Failed to fetch') ||
            message.includes('Network') ||
            message.includes('timeout');

          const isAuthError =
            status === 403 ||
            status === 401 ||
            message.includes('Forbidden');

          // If we can't validate due to network issues, don't force sign-out / redirects.
          if (isNetworkError && !isAuthError) {
            console.warn('⚠️ Auth validation unavailable (network/timeout). Continuing unauthenticated for now.');
            setUser(null);
            setUserProfile(null);
            return;
          }
          
          if (isAuthError) {
            console.log('🚨 Auth error detected. Clearing session and redirecting...');
            
            try {
              await supabase.auth.signOut();
            } catch (signOutError) {
              console.error('❌ Error signing out:', signOutError);
            }
            
            setUser(null);
            setUserProfile(null);
            
            // Redirect to login if on a protected page
            if (typeof window !== 'undefined' && 
                isProtectedPath(window.location.pathname)) {
              window.location.href = '/login?error=session_expired';
            }
            return;
          }
        }
        
        setUser(user);
        
        if (user) {
          console.log('✅ Initial user loaded:', user.email);

          // OPTIMIZATION: Use metadata for instant profile availability
          // This prevents UI blocking while waiting for DB query
          const metadata = user.user_metadata;
          if (metadata && metadata.role && metadata.status) {
            console.log('⚡ Using cached metadata for fast load');
            const fastProfile = {
              id: user.id,
              email: user.email,
              role: metadata.role as any,
              status: metadata.status as any,
              account_type: (metadata.account_type || 'individual') as any,
              first_name: metadata.first_name || 'User',
              last_name: metadata.last_name || 'Profile',
              // Default values for required fields
              applications_count: 0,
              reviews_count: 0,
              inspections_count: 0,
              profile_completed: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as User;
            
            setUserProfile(fastProfile);
          }
          
          try {
            const profile = await fetchUserProfile(user.id);
            if (!profile) {
              console.error('🚨 User has auth session but NO profile in DB. Force signing out.');
              try { await supabase.auth.signOut(); } catch {}
              setUser(null);
              setUserProfile(null);
              window.location.href = '/login?error=account_not_found';
              return;
            }
          } catch (profileError) {
            console.error('❌ Error fetching initial profile:', profileError);
          }
        }
       
      } catch (error: any) {
        console.error('❌ Error getting initial user:', error);
        
        // ⚡ FIX: Also handle network errors or unexpected auth failures
        if (error?.status === 403 || error?.message?.includes('Forbidden')) {
          console.log('🚨 Clearing invalid session...');
          await supabase.auth.signOut();
          setUser(null);
          setUserProfile(null);
        }
      } finally {
        // Ensure loading is false (should already be false from fast-path)
        setLoading(false);
      }
    };

    getInitialUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: any, session: any) => {
        console.log('🔄 Auth state change:', event);

        // IMPORTANT: never trust `session.user` from storage/cookies.
        // Always hydrate the user via getUser() which validates with Supabase Auth.
        if (event === 'SIGNED_OUT' || !session) {
          console.log('🚪 No active session.');
          setUser(null);
          setUserProfile(null);
          setLoading(false);
          return;
        }

        console.log('🔍 Fetching verified user from auth server...');
        let currentUser: SupabaseUser | null = null;
        try {
          const { data, error: userError } = await getUserWithTimeout(8000);

          if (userError) {
            const msg = userError.message || '';
            const status = (userError as any).status;
            const isNetworkError =
              status === 0 ||
              msg.includes('Failed to fetch') ||
              msg.includes('Network') ||
              msg.includes('timeout');

            const isMissingSession =
              msg.includes('Auth session missing') ||
              msg.includes('No session') ||
              msg.includes('session missing');

            if (isMissingSession) {
              console.log('ℹ️ No active auth session (logged out).');
              setUser(null);
              setUserProfile(null);
              setLoading(false);
              return;
            }

            if (isNetworkError) {
              console.warn('⚠️ Auth state validation unavailable (network/timeout). Keeping current state.');
              setLoading(false);
              return;
            }

            console.error('❌ Session validation failed:', msg);

            // Clear invalid session and redirect if needed
            try { await supabase.auth.signOut(); } catch {}
            setUser(null);
            setUserProfile(null);
            setLoading(false);

            if (
              typeof window !== 'undefined' &&
              isProtectedPath(window.location.pathname) &&
              (status === 401 || status === 403 || msg.includes('Forbidden'))
            ) {
              window.location.href = '/login?error=session_expired';
            }
            return;
          }

          currentUser = data?.user ?? null;
        } catch (fetchError: any) {
          console.error('❌ Network error validating session:', fetchError?.message);

          // Only sign out on errors that indicate auth failure
          if (fetchError?.message?.includes('Forbidden') || fetchError?.status === 403) {
            console.log('🚨 Clearing session due to Forbidden error...');
            try { await supabase.auth.signOut(); } catch {}
            setUser(null);
            setUserProfile(null);
            setLoading(false);
            if (typeof window !== 'undefined') {
              window.location.href = '/login?error=session_expired';
            }
            return;
          }

          // On transient network errors, keep existing auth state.
          console.warn('⚠️ Skipping auth state update due to network error.');
          setLoading(false);
          return;
        }

        setUser(currentUser);

        if (currentUser) {
          console.log('✅ User session updated (verified):', currentUser.email);

          // OPTIMIZATION: Use metadata for instant profile availability
          const metadata = currentUser.user_metadata;
          if (metadata && metadata.role && metadata.status) {
            const fastProfile = {
              id: currentUser.id,
              email: currentUser.email,
              role: metadata.role as any,
              status: metadata.status as any,
              account_type: (metadata.account_type || 'individual') as any,
              first_name: metadata.first_name || 'User',
              last_name: metadata.last_name || 'Profile',
              applications_count: 0,
              reviews_count: 0,
              inspections_count: 0,
              profile_completed: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as User;
            setUserProfile(fastProfile);
            setLoading(false);
          }
          
          try {
            const profile = await fetchUserProfile(currentUser.id);
            
            // ⚡ FIX: If profile is missing (deleted from DB), sign out immediately
            if (!profile) {
              console.error('🚨 User has auth session but NO profile in DB. Force signing out.');
              try { await supabase.auth.signOut(); } catch {}
              setUser(null);
              setUserProfile(null);
              if (typeof window !== 'undefined') {
                window.location.href = '/login?error=account_not_found';
              }
              return;
            }
            
            // Check if user is suspended even during session restoration
            if (profile.status === 'suspended') {
              console.warn('🚫 Suspended user session detected, signing out:', currentUser.email);
              await supabase.auth.signOut();
              setUser(null);
              setUserProfile(null);
              return;
            }
            
            // Check if user is inactive
            if (profile && profile.status === 'inactive') {
              console.warn('⚠️ Inactive user session detected, signing out:', currentUser.email);
              await supabase.auth.signOut();
              setUser(null);
              setUserProfile(null);
              return;
            }
            
            // If profile creation/fetching failed, don't sign out immediately
            if (!profile) {
              console.warn('⚠️ Could not load/create user profile, but keeping session active');
            }
          } catch (profileError) {
            console.error('❌ Error during profile handling in auth state change:', profileError);
          }
        } else {
          console.log('🚪 No active session.');
          setUserProfile(null);
        }

        setLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data: authData, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        20000,
        'signInWithPassword'
      );
      if (error) {
        console.error('❌ Sign in error:', error.message);
        return { error: error.message };
      }

      if (!authData.user) {
        return { error: 'Authentication failed' };
      }

      // Immediately set local auth state (prevents UI blocking on slow profile/auth verification)
      setUser(authData.user);

      // Fast-path: use JWT metadata if present (no DB call)
      const meta = authData.user.user_metadata || {};
      const metaStatus = meta.status as string | undefined;
      const metaRole = meta.role as string | undefined;
      if (metaStatus === 'suspended' || metaStatus === 'inactive') {
        try { await withTimeout(supabase.auth.signOut(), 5000, 'signOutSuspendedUser'); } catch {}
        setUser(null);
        setUserProfile(null);
        return { error: metaStatus === 'suspended'
          ? 'Your account has been suspended. Please contact support for assistance.'
          : 'Your account is inactive. Please contact support to reactivate your account.' };
      }

      // If metadata has role/status, hydrate a fast profile so guards can proceed even if DB is blocked.
      if (metaRole && metaStatus) {
        const fastProfile = {
          id: authData.user.id,
          email: authData.user.email || email,
          role: metaRole as any,
          status: metaStatus as any,
          account_type: (meta.account_type || 'individual') as any,
          first_name: meta.first_name || 'User',
          last_name: meta.last_name || 'Profile',
          applications_count: 0,
          reviews_count: 0,
          inspections_count: 0,
          profile_completed: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as User;
        setUserProfile(fastProfile);
      }

      console.log('✅ Authentication successful, checking user status...');

      // Fetch user profile to check status
      let userProfile: User | null = null;
      let profileError: any = null;
      try {
        const res = await withTimeout(
          supabase.from('users').select('*').eq('id', authData.user.id).single(),
          12000,
          'fetchUserProfileForSignIn'
        );
        userProfile = (res as any).data ?? null;
        profileError = (res as any).error ?? null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // If the profile fetch times out (common with stale browser state or extensions),
        // do not block login — allow the session and let the app continue.
        if (msg === 'timeout:fetchUserProfileForSignIn') {
          console.warn('⚠️ Profile fetch timed out during login; proceeding without DB verification.');
          return {};
        }
        throw err;
      }

      if (profileError) {
        console.error('❌ Error fetching user profile:', profileError);
        
        // If profile doesn't exist, create a basic one for the authenticated user
        if (profileError.code === 'PGRST116') { // No rows returned
          console.log('📝 Creating missing user profile for:', authData.user.email);
          
          const basicProfile = {
            id: authData.user.id,
            email: authData.user.email,
            role: 'applicant' as const,
            status: 'active' as const,
            account_type: 'individual' as const,
            first_name: 'User', // Required by check constraint
            last_name: 'Profile', // Required by check constraint
            applications_count: 0,
            reviews_count: 0,
            inspections_count: 0,
            profile_completed: false, // Mark as incomplete so user can update
            phone_verified: false, // Phone verification status
            phone_verification_attempts: 0, // Verification attempts
          };

          let createError: any = null;
          try {
            const createRes = await withTimeout(
              supabase.from('users').insert([basicProfile]),
              12000,
              'createUserProfileForSignIn'
            );
            createError = (createRes as any).error ?? null;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg === 'timeout:createUserProfileForSignIn') {
              console.warn('⚠️ Profile creation timed out during login; proceeding without DB verification.');
              return {};
            }
            throw err;
          }

          if (createError) {
            console.error('❌ Error creating user profile:', createError);
            console.error('❌ Create error details:', {
              code: createError.code,
              message: createError.message,
              details: createError.details,
              hint: createError.hint
            });
            
            // Don't sign out immediately, try to continue if it's just a permission issue
            if (createError.code === '42501') { // Insufficient privilege
              console.warn('⚠️ Profile creation failed due to permissions. User may need manual profile creation.');
              return { error: 'Account setup incomplete. Please contact support to complete your profile setup.' };
            } else {
              await supabase.auth.signOut();
              return { error: `Unable to create user profile: ${createError.message}` };
            }
          }

          console.log('✅ Basic user profile created');
          // Continue with login using the basic profile
        } else {
          // Other database errors
          console.error('❌ Profile fetch error details:', {
            code: profileError.code,
            message: profileError.message,
            details: profileError.details
          });
          try {
            await withTimeout(supabase.auth.signOut(), 5000, 'signOutAfterProfileFetchError');
          } catch {}
          return { error: `Unable to verify account status: ${profileError.message}` };
        }
      }

      // Get the final user profile (either existing or newly created)
      let finalProfile = userProfile;
      if (profileError && profileError.code === 'PGRST116') {
        // Fetch the newly created profile
        try {
          const refetchRes = await withTimeout(
            supabase.from('users').select('*').eq('id', authData.user.id).single(),
            12000,
            'refetchUserProfileForSignIn'
          );
          finalProfile = (refetchRes as any).data ?? null;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === 'timeout:refetchUserProfileForSignIn') {
            console.warn('⚠️ Profile refetch timed out during login; proceeding without DB verification.');
            return {};
          }
          throw err;
        }
      }

      // If profile fetch couldn't complete (network/timeout), do not block login.
      // Middleware/ProtectedRoute will handle profile-required screens gracefully.
      if (!finalProfile) {
        console.warn('⚠️ Could not verify profile status during login (network/timeout). Proceeding.');
        return {};
      }

      // Cache profile locally for immediate route guards
      setUserProfile(finalProfile);

      // Check if user is suspended
      if (finalProfile && finalProfile.status === 'suspended') {
        console.warn('🚫 Suspended user attempted login:', email);
        // Sign out the user immediately
        await supabase.auth.signOut();
        return { 
          error: 'Your account has been suspended. Please contact support for assistance.' 
        };
      }

      // Check if user is inactive
      if (finalProfile && finalProfile.status === 'inactive') {
        console.warn('⚠️ Inactive user attempted login:', email);
        await supabase.auth.signOut();
        return { 
          error: 'Your account is inactive. Please contact support to reactivate your account.' 
        };
      }

      // Only allow active users to proceed
      if (finalProfile && finalProfile.status !== 'active') {
        console.warn('⚠️ User with invalid status attempted login:', email, finalProfile.status);
        await supabase.auth.signOut();
        return { 
          error: 'Your account status does not allow access. Please contact support.' 
        };
      }

      // Note: Removed last login timestamp update for faster login

      console.log('✅ Successfully signed in with active account');
      
      // Check if user must change password (admin-created staff accounts)
      if (finalProfile && finalProfile.must_change_password) {
        console.log('🔐 User must change password before continuing');
        return { mustChangePassword: true };
      }
      
      return {};
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.startsWith('timeout:');
      if (isTimeout) {
        // Only fail login if the credential exchange timed out.
        // Timeouts during DB/profile checks should not block login.
        if (msg === 'timeout:signInWithPassword') {
          console.warn('⚠️ Login timed out:', msg);
          try {
            await withTimeout(supabase.auth.signOut(), 5000, 'signOutAfterSignInTimeout');
          } catch {}
          return { error: 'Login is taking too long (network timeout). Please try again.' };
        }
        console.warn('⚠️ Non-fatal login timeout:', msg);
        return {};
      }
      console.error('❌ Unexpected sign in error:', err);
      return { error: 'An unexpected error occurred' };
    }
  };

  const signUp = async (data: SignUpData & { emailCode?: string }) => {
    try {
      console.log('📝 Starting signup process (custom API)...', data.accountType);
      // DEBUG: Log what AuthContext receives and sends
      console.log('📨 AuthContext signUp data:', JSON.stringify({
        accountType: data.accountType,
        companyPhone: data.companyPhone,
        keys: Object.keys(data)
      }));

      // Call our server route which validates email code, creates user, and profile
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        const msg = result.message || 'Signup failed';

        // #region agent log
        // Disabled: writing debug logs during dev can create rebuild loops.
        // #endregion

        // We intentionally do NOT fall back to client-side `supabase.auth.signUp()`:
        // that path triggers Supabase's built-in email confirmation flow, but this app uses Resend OTP codes instead.
        if (msg.includes('SUPABASE_SERVICE_ROLE_KEY is missing')) {
          return { error: 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local to create users without Supabase email confirmation.' };
        }

        return { error: msg };
      }

      return { userId: result.userId };
    } catch (err) {
      console.error('❌ Unexpected signup error:', err);
      return { error: 'An unexpected error occurred during signup' };
    }
  };

  const signOut = async () => {
    try {
      // Clear local state immediately for faster UI response
      setUser(null);
      setUserProfile(null);
      
      // Sign out from Supabase (this can happen in background)
      await supabase.auth.signOut();
      console.log('✅ Successfully signed out');
    } catch (err) {
      console.error('❌ Error signing out:', err);
      // Even if signOut fails, we've cleared local state
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchUserProfile(user.id);
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    try {
      if (!user?.id) {
        return { error: 'No authenticated user' };
      }

      const { data: updatedUser, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        console.error('❌ Profile update error:', error.message);
        return { error: error.message };
      }

      // Update local state immediately instead of making another DB call
      if (updatedUser) {
        setUserProfile(updatedUser);
        console.log('✅ Profile updated successfully');
      }
      
      return {};
    } catch (err) {
      console.error('❌ Unexpected profile update error:', err);
      return { error: 'An unexpected error occurred' };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        console.error('❌ Password reset error:', error.message);
        return { error: error.message };
      }

      console.log('✅ Password reset email sent');
      return {};
    } catch (err) {
      console.error('❌ Unexpected password reset error:', err);
      return { error: 'An unexpected error occurred' };
    }
  };

  const changePassword = async (newPassword: string) => {
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newPassword
        })
      });

      const data = await response.json();

      if (!data.success) {
        return { error: data.message };
      }

      return {};
    } catch (err) {
      console.error('❌ Change password error:', err);
      return { error: 'An unexpected error occurred' };
    }
  };

  // Role-based helper properties
  const isApplicant = userProfile?.role === 'applicant';
  const isAdmin = userProfile?.role === 'admin';
  const isReviewer = userProfile?.role === 'reviewer';
  const isInspector = userProfile?.role === 'inspector';
  const isApprover = userProfile?.role === 'approver';

  const value = {
    user,
    userProfile,
    loading,
    isAuthenticated: !!user,
    signIn,
    signOut,
    signUp,
    refreshProfile,
    updateProfile,
    resetPassword,
    changePassword,
    isApplicant,
    isAdmin,
    isReviewer,
    isInspector,
    isApprover,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 