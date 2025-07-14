"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { updateUser } from '@/lib/supabase';

export function TestSuspension() {
  const [isTesting, setIsTesting] = useState(false);
  const { userProfile, refreshProfile } = useAuth();

  const handleSuspendCurrentUser = async () => {
    if (!userProfile) return;
    
    setIsTesting(true);
    try {
      // Update current user's status to suspended
      await updateUser(userProfile.id, { status: 'suspended' });
      
      // Refresh the profile to trigger suspension check
      await refreshProfile();
      
      alert('✅ User suspended! The suspension UI should appear now.');
    } catch (error) {
      console.error('Error suspending user:', error);
      alert('❌ Failed to suspend user');
    } finally {
      setIsTesting(false);
    }
  };

  const handleReactivateUser = async () => {
    if (!userProfile) return;
    
    setIsTesting(true);
    try {
      // Update current user's status back to active
      await updateUser(userProfile.id, { status: 'active' });
      
      // Refresh the profile
      await refreshProfile();
      
      alert('✅ User reactivated!');
    } catch (error) {
      console.error('Error reactivating user:', error);
      alert('❌ Failed to reactivate user');
    } finally {
      setIsTesting(false);
    }
  };

  if (!userProfile) {
    return null;
  }

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader>
        <CardTitle className="text-orange-800">🧪 Suspension Testing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            <strong>Testing Tool:</strong> Use these buttons to test the suspension functionality. 
            Current status: <span className="font-mono bg-white px-2 py-1 rounded">{userProfile.status}</span>
          </AlertDescription>
        </Alert>
        
        <div className="flex gap-2">
          <Button 
            onClick={handleSuspendCurrentUser}
            disabled={isTesting || userProfile.status === 'suspended'}
            variant="destructive"
            size="sm"
          >
            {isTesting ? 'Processing...' : 'Test Suspension'}
          </Button>
          
          <Button 
            onClick={handleReactivateUser}
            disabled={isTesting || userProfile.status === 'active'}
            variant="outline"
            size="sm"
          >
            {isTesting ? 'Processing...' : 'Reactivate'}
          </Button>
        </div>
        
        <div className="text-xs text-orange-700">
          <p><strong>Note:</strong> This is for testing purposes only.</p>
          <p>• Click "Test Suspension" to see the suspension UI</p>
          <p>• The page will show the suspension notice</p>
          <p>• Use "Reactivate" to return to normal state</p>
        </div>
      </CardContent>
    </Card>
  );
} 