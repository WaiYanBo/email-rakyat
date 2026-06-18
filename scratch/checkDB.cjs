const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/PUBLIC_SUPABASE_URL=(.*)/)[1].replace(/['"]/g, '').trim();
const key = env.match(/PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].replace(/['"]/g, '').trim();
const supabase = createClient(url, key);

async function check() {
  const { data: profiles, error: prErr } = await supabase.from('profiles').select('id, full_name, department, role_id').limit(10);
  console.log('Profiles:', profiles || prErr);
}
check();
