// Script to fix applicant_id for existing draft applications
// This should be run in the browser console on the dashboard page

async function fixApplicantId() {
  try {
    // Get the current user from the auth context
    const authUser = window?.supabase?.auth?.getUser ? await window.supabase.auth.getUser() : null;
    
    if (!authUser?.data?.user) {
      console.error('No authenticated user found');
      return;
    }
    
    const userId = authUser.data.user.id;
    console.log('Current user ID:', userId);
    
    // Update the specific application
    const applicationId = '9892014a-cfdf-474d-844f-6f3c4b8dfc8b';
    
    const { data, error } = await window.supabase
      .from('applications')
      .update({ applicant_id: userId })
      .eq('id', applicationId)
      .select();
    
    if (error) {
      console.error('Error updating application:', error);
    } else {
      console.log('Successfully updated application:', data);
      // Refresh the page to see the changes
      window.location.reload();
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the fix
fixApplicantId();
