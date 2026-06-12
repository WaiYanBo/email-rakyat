import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://whqnbxywpplalmddsjwe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndocW5ieHl3cHBsYWxtZGRzandlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDg3MTEsImV4cCI6MjA5NDkyNDcxMX0.-hUQISVD55IKjOv1gKr4pJzdhH3j9LqnWL8OEgT5Wns'
);

async function checkData() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, department, roles(role_name)');
  if (error) {
    console.error(error);
    return;
  }
  console.log(data);
}

checkData();
