// Script to revert the overly aggressive applicant_id fix
// This should be run in the browser console on the dashboard page

async function revertApplicantIdFix() {
  try {
    // Get the current user from the auth context
    const authUser = window?.supabase?.auth?.getUser ? await window.supabase.auth.getUser() : null;
    
    if (!authUser?.data?.user) {
      console.error('No authenticated user found');
      return;
    }
    
    const currentUserId = authUser.data.user.id;
    console.log('Current user ID:', currentUserId);
    
    // We need to identify which applications actually belong to this user
    // For now, let's revert all applications back to the hardcoded ID except for the specific one we know about
    const knownUserApplicationId = '9892014a-cfdf-474d-844f-6f3c4b8dfc8b';
    
    // Get all applications currently assigned to this user
    const { data: currentUserApps, error: fetchError } = await window.supabase
      .from('applications')
      .select('id, project_title, created_at')
      .eq('applicant_id', currentUserId);
    
    if (fetchError) {
      console.error('Error fetching current user applications:', fetchError);
      return;
    }
    
    console.log('Applications currently assigned to you:', currentUserApps);
    
    // Ask user which applications are actually theirs
    const actualUserApps = prompt(
      `You have ${currentUserApps?.length || 0} applications assigned to you.\n\n` +
      'Please enter the IDs of applications that are actually yours, separated by commas.\n' +
      'Known application: ' + knownUserApplicationId + '\n\n' +
      'Application list:\n' +
      (currentUserApps || []).map(app => `${app.id}: ${app.project_title} (${new Date(app.created_at).toLocaleDateString()})`).join('\n') +
      '\n\nEnter IDs (comma-separated):'
    );
    
    if (!actualUserApps) {
      console.log('Operation cancelled');
      return;
    }
    
    const userAppIds = actualUserApps.split(',').map(id => id.trim());
    console.log('User confirmed these applications are theirs:', userAppIds);
    
    // Revert all other applications back to the hardcoded sample ID
    const appsToRevert = (currentUserApps || []).filter(app => !userAppIds.includes(app.id));
    
    if (appsToRevert.length > 0) {
      console.log('Reverting these applications back to sample user:', appsToRevert.map(app => app.id));
      
      const { error: revertError } = await window.supabase
        .from('applications')
        .update({ applicant_id: '550e8400-e29b-41d4-a716-446655440001' })
        .in('id', appsToRevert.map(app => app.id));
      
      if (revertError) {
        console.error('Error reverting applications:', revertError);
      } else {
        console.log('Successfully reverted applications');
      }
    }
    
    // Refresh the page to see the changes
    window.location.reload();
    
  } catch (error) {
    console.error('Error:', error);
  }
}

console.log('Run revertApplicantIdFix() to clean up the applicant_id mess');
