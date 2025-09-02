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
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (data: SignUpData & { emailCode?: string }) => Promise<{ error?: string, needsEmailVerification?: boolean, email?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfile: (updates: Partial<User>) => Promise<{ error?: string }>
  resetPassword: (email: string) => Promise<{ error?: string }>
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
            return null;
          } catch (signOutError) {
            console.error('❌ Error during security sign out:', signOutError);
          }
          
          console.log('📝 Profile not found, creating basic profile...');
          
          // Get the current user's email from auth
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          
          if (userError) {
            console.error('❌ Error getting current user:', userError);
            return null;
          }
          
          if (user && user.email) {
            console.log('📧 Creating profile for user:', user.email);
            
            const basicProfile = {
              id: userId,
              email: user.email,
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

            if (createError) {
              console.error('❌ Error creating profile during fetch:', createError);
              console.log('Create error details:', {
                code: createError.code,
                message: createError.message,
                hint: createError.hint,
                details: createError.details
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
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        
        if (user) {
          console.log('✅ Initial user loaded:', user.email);
          
          try {
            await fetchUserProfile(user.id);
          } catch (profileError) {
            console.error('❌ Error fetching initial profile:', profileError);
            // Don't fail the entire auth process if profile fetch fails
            // The user can still be authenticated even without a complete profile
          }
        }
       
      } catch (error) {
        console.error('❌ Error getting initial user:', error);
      } finally {
        setLoading(false);
      }
    };

    getInitialUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: any, session: any) => {
        console.log('🔄 Auth state change:', event);
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        
        if (currentUser) {
          console.log('✅ User session updated:', currentUser.email);
          
          try {
            const profile = await fetchUserProfile(currentUser.id);
            
            // Check if user is suspended even during session restoration
            if (profile && profile.status === 'suspended') {
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
            // User might be able to continue with limited functionality
            if (!profile) {
              console.warn('⚠️ Could not load/create user profile, but keeping session active');
            }
          } catch (profileError) {
            console.error('❌ Error during profile handling in auth state change:', profileError);
            // Don't sign out on profile errors during session restoration
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
      const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('❌ Sign in error:', error.message);
        return { error: error.message };
      }

      if (!authData.user) {
        return { error: 'Authentication failed' };
      }

      console.log('✅ Authentication successful, checking user status...');

      // Fetch user profile to check status
      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

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

          const { error: createError } = await supabase
            .from('users')
            .insert([basicProfile]);

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
          await supabase.auth.signOut();
          return { error: `Unable to verify account status: ${profileError.message}` };
        }
      }

      // Get the final user profile (either existing or newly created)
      let finalProfile = userProfile;
      if (profileError && profileError.code === 'PGRST116') {
        // Fetch the newly created profile
        const { data: newProfile } = await supabase
          .from('users')
          .select('*')
          .eq('id', authData.user.id)
          .single();
        finalProfile = newProfile;
      }

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
      return {};
    } catch (err) {
      console.error('❌ Unexpected sign in error:', err);
      return { error: 'An unexpected error occurred' };
    }
  };

  const signUp = async (data: SignUpData & { emailCode?: string }) => {
    try {
      console.log('📝 Starting signup process (custom API)...', data.accountType);

      // Call our server route which validates email code, creates user, and profile
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        return { error: result.message || 'Signup failed' };
      }

      return {};
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