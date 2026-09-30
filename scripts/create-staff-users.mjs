/**
 * Batch User Creation Script for Email Rakyat Secure
 * Uses Supabase Admin Auth API.
 * 
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" node scripts/create-staff-users.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || 'https://whqnbxywpplalmddsjwe.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_PASSWORD = process.env.DEFAULT_STAFF_PASSWORD || 'ERakyat@2026!';

if (!SERVICE_ROLE_KEY) {
  console.error('\x1b[31m[ERROR] SUPABASE_SERVICE_ROLE_KEY environment variable is required to create users via Admin API.\x1b[0m');
  console.log('\x1b[33mAlternatively, you can run the SQL script in your Supabase SQL Editor:');
  console.log('database/CREATE_STAFF_USERS_BATCH.sql\x1b[0m\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const STAFF_LIST = [
  { name: 'Mohd Shahril Bin Abd Rani', email: 'aduan@e-rakyat.com' },
  { name: 'Muhammad Jazli Bin Jalaluddin', email: 'jazz.erasb@gmail.com' },
  { name: 'Muhammad Azizul Harith Bin Azm', email: 'azizul.erasb@gmail.com' },
  { name: 'Muhammad Hafiz Bin Hashim', email: 'muhammad.erasb@gmail.com' },
  { name: 'Shahniza Binti Midi', email: 'shazzmidi.erasb@gmail.com' },
  { name: 'Arif Wafiyuddin Bin Mohd Fuad', email: 'arifw.erasb@gmail.com' },
  { name: 'Wai Yan Bo', email: 'shoaiev126.wyb@gmail.com' },
  { name: 'Mohd Badlyshah Bin Amiruddin', email: 'shahani310@gmail.com' },
  { name: 'Akmar Syahnizam binti Midi', email: 'midiakma.erasb@gmail.com' },
  { name: 'Norsyuhada binti Othman', email: 'syuhada.erasb@gmail.com' },
  { name: 'Shahrizul Azri Bin Rosdi', email: 'shahrizul.erasb@gmail.com' },
  { name: 'Nurul Azra Syafiqka bt Rosliza @ Rosli', email: 'azrasyafiqkarosli@gmail.com' },
  { name: 'Daniel Abdillah', email: 'matdaniel.erasb@gmail.com' },
  { name: 'Nursyaqira Izwani Binti Abdullah', email: 'ira.erasb@gmail.com' },
];

const READ_ONLY_PERMISSIONS = {
  view_clients: true,
  edit_clients: false,
  view_lod: true,
  manage_lod: false,
  view_potential_clients: true,
  manage_potential_clients: false,
  view_appointments: true,
  manage_appointments: false,
  export_data: false,
  view_staff: true,
  edit_staff: false,
  view_attendance: true,
  edit_attendance: false,
  view_snapshot: true,
  manage_access_control: false,
  manage_drive: false,
  manage_hr: false,
  view_claims: true,
  manage_claims: false,
  view_leave: true,
  manage_leave: false,
};

async function main() {
  console.log('====================================================');
  console.log(' Starting Staff Creation & Permission Configuration');
  console.log(' Default Password:', DEFAULT_PASSWORD);
  console.log('====================================================\n');

  // 1. Fetch all existing users to avoid touching already registered users
  const { data: userListData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) {
    console.error('Failed to list users:', listError);
    process.exit(1);
  }

  const existingEmails = new Map();
  for (const u of userListData.users) {
    if (u.email) existingEmails.set(u.email.toLowerCase(), u.id);
  }

  for (const staff of STAFF_LIST) {
    const trimmedEmail = staff.email.toLowerCase().trim();

    if (existingEmails.has(trimmedEmail)) {
      console.log(`\x1b[33m[SKIPPED - ALREADY REGISTERED]\x1b[0m ${staff.name} (${staff.email}) - Untouched.`);
      continue;
    }

    // Create user in Auth
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: trimmedEmail,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: staff.name }
    });

    if (createError) {
      console.error(`\x1b[31m[FAILED]\x1b[0m Could not create ${staff.name}: ${createError.message}`);
      continue;
    }

    const userId = newUser.user.id;

    // Upsert Profile
    await supabase.from('profiles').upsert({
      id: userId,
      full_name: staff.name,
      email: trimmedEmail,
      status: 'Active'
    });

    // Set Permissions
    await supabase.from('access_permissions').upsert({
      target_type: 'user',
      target_id: userId,
      permissions: READ_ONLY_PERMISSIONS
    });

    // Also set by full_name for backward compatibility
    await supabase.from('access_permissions').upsert({
      target_type: 'user',
      target_id: staff.name,
      permissions: READ_ONLY_PERMISSIONS
    });

    console.log(`\x1b[32m[CREATED]\x1b[0m ${staff.name} (${staff.email}) [ID: ${userId}]`);
  }

  console.log('\n====================================================');
  console.log(' Process Finished!');
  console.log('====================================================');
}

main();
