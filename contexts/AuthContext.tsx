"use client";

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
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
  signUp: (data: SignUpData) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfile: (updates: Partial<User>) => Promise<{ error?: string }>
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

  // Function to fetch user profile
  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('🔍 Fetching profile for user:', userId);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('❌ Error fetching user profile:', error);
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
          await fetchUserProfile(user.id);
        }
       
      } catch (error) {
        console.error('❌ Error getting initial user:', error);
      } finally {
        setLoading(false);
      }
    };

    getInitialUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 Auth state change:', event);
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        
        if (currentUser) {
          console.log('✅ User session updated:', currentUser.email);
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
        // Sign out the user since we can't verify their status
        await supabase.auth.signOut();
        return { error: 'Unable to verify account status' };
      }

      // Check if user is suspended
      if (userProfile.status === 'suspended') {
        console.warn('🚫 Suspended user attempted login:', email);
        // Sign out the user immediately
        await supabase.auth.signOut();
        return { 
          error: 'Your account has been suspended. Please contact support for assistance.' 
        };
      }

      // Check if user is inactive
      if (userProfile.status === 'inactive') {
        console.warn('⚠️ Inactive user attempted login:', email);
        await supabase.auth.signOut();
        return { 
          error: 'Your account is inactive. Please contact support to reactivate your account.' 
        };
      }

      // Only allow active users to proceed
      if (userProfile.status !== 'active') {
        console.warn('⚠️ User with invalid status attempted login:', email, userProfile.status);
        await supabase.auth.signOut();
        return { 
          error: 'Your account status does not allow access. Please contact support.' 
        };
      }

      // Update last login timestamp for active users
      try {
        await supabase
          .from('users')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', authData.user.id);
      } catch (updateError) {
        console.warn('⚠️ Failed to update last login timestamp:', updateError);
        // Don't fail the login for this
      }

      console.log('✅ Successfully signed in with active account');
      return {};
    } catch (err) {
      console.error('❌ Unexpected sign in error:', err);
      return { error: 'An unexpected error occurred' };
    }
  };

  const signUp = async (data: SignUpData) => {
    try {
      console.log('📝 Starting signup process...', data.accountType);

      // Step 1: Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
      });

      if (authError) {
        console.error('❌ Auth signup error:', authError.message);
        return { error: authError.message };
      }

      if (!authData.user) {
        return { error: 'Failed to create user account' };
      }

      console.log('✅ Auth user created:', authData.user.id);

      // Step 2: Create user profile
      const profileData: Partial<User> = {
        id: authData.user.id,
        email: data.email,
        role: 'applicant',
        status: 'active',
        account_type: data.accountType,
        applications_count: 0,
        reviews_count: 0,
        inspections_count: 0,
      };

      // Add account-specific fields
      if (data.accountType === 'individual') {
        profileData.first_name = data.firstName;
        profileData.last_name = data.lastName;
        profileData.phone = data.phone;
        profileData.id_number = data.identification?.number || data.idNumber;
        profileData.id_type = 'national_id'; // Individual accounts use National ID
      } else {
        profileData.company_name = data.companyName;
        profileData.company_tin = data.companyTIN;
        profileData.company_address = data.companyAddress;
        profileData.company_phone = data.companyPhone;
        profileData.id_type = 'tin'; // Company accounts use TIN
        profileData.id_number = data.companyTIN; // Use TIN as the ID number for companies
      }

      console.log('💾 Creating user profile...');

      const { error: profileError } = await supabase
        .from('users')
        .insert([profileData]);

      if (profileError) {
        console.error('❌ Profile creation error:', profileError.message);
        // Clean up auth user if profile creation fails
        await supabase.auth.signOut();
        return { error: profileError.message };
      }

      console.log('✅ User profile created successfully');
      return {};
    } catch (err) {
      console.error('❌ Unexpected signup error:', err);
      return { error: 'An unexpected error occurred during signup' };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setUserProfile(null);
      console.log('✅ Successfully signed out');
    } catch (err) {
      console.error('❌ Error signing out:', err);
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

      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (error) {
        console.error('❌ Profile update error:', error.message);
        return { error: error.message };
      }

      await refreshProfile();
      console.log('✅ Profile updated successfully');
      return {};
    } catch (err) {
      console.error('❌ Unexpected profile update error:', err);
      return { error: 'An unexpected error occurred' };
    }
  };

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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 