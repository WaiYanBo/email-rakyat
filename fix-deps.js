import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://whqnbxywpplalmddsjwe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndocW5ieHl3cHBsYWxtZGRzandlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDg3MTEsImV4cCI6MjA5NDkyNDcxMX0.-hUQISVD55IKjOv1gKr4pJzdhH3j9LqnWL8OEgT5Wns'
);

async function fixDepartments() {
  console.log('Fetching profiles...');
  const { data, error } = await supabase.from('profiles').select('id, department');
  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  const targets = ['Chairman', 'CEO', 'COO', 'CFO'];
  let updatedCount = 0;

  for (const profile of data) {
    if (profile.department && targets.includes(profile.department.trim())) {
      console.log(`Updating profile ${profile.id} (department: ${profile.department} -> BOD)`);
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ department: 'BOD' })
        .eq('id', profile.id);
      
      if (updateError) {
        console.error(`Error updating profile ${profile.id}:`, updateError);
      } else {
        updatedCount++;
      }
    }
  }

  console.log(`Finished. Updated ${updatedCount} profiles.`);
}

fixDepartments();
