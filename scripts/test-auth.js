const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAuth() {
  console.log('🔍 Testing Supabase connection...');

  try {
    // Test 1: Basic connection
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (testError) {
      console.log('❌ Basic connection test failed:', testError.message);
      console.log('Error details:', testError);
    } else {
      console.log('✅ Basic connection works');
    }

    // Test 2: Check current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('Current auth user:', user ? user.email : 'None');

    // Test 3: Try to insert a test profile with all required fields
    const testProfile = {
      id: '12345678-1234-1234-1234-123456789012', // Fake UUID
      email: 'test@example.com',
      role: 'applicant',
      status: 'active',
      account_type: 'individual',
      first_name: 'Test', // Required by check constraint
      last_name: 'User',  // Required by check constraint
      applications_count: 0,
      reviews_count: 0,
      inspections_count: 0,
      profile_completed: false,
    };

    const { error: insertError } = await supabase
      .from('users')
      .insert([testProfile]);

    if (insertError) {
      console.log('❌ Test insert failed (expected):', insertError.code, insertError.message);
      console.log('Full error:', insertError);
    } else {
      console.log('✅ Test insert succeeded (unexpected - cleaning up)');
      // Clean up
      await supabase.from('users').delete().eq('id', testProfile.id);
    }

    // Test 4: Check if there are any users in the table
    const { data: userCount, error: countError } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      console.log('❌ Cannot count users:', countError.message);
    } else {
      console.log('✅ Users table query works, but may be empty due to RLS');
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testAuth().then(() => {
  console.log('\n📝 If you see RLS errors above, run the fix-auth-policies.sql file in your Supabase dashboard.');
  process.exit(0);
});
