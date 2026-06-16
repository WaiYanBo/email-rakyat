const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/PUBLIC_SUPABASE_URL=(.*)/)[1].replace(/['"]/g, '').trim();
const key = env.match(/PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].replace(/['"]/g, '').trim();
const supabase = createClient(url, key);

async function check() {
  const { data: policies, error: pErr } = await supabase.from('company_drive').select('*').limit(1);
  console.log('company_drive access:', pErr || 'OK');
  
  const { data: profiles, error: prErr } = await supabase.from('profiles').select('*').limit(1);
  console.log('profiles fields:', profiles ? Object.keys(profiles[0]) : prErr);
}
check();
