/**
 * Automated Database Table Backup to CSV
 * =====================================
 * Exports all database tables from Supabase into organized, timestamped CSV files.
 * Handles pagination (1000 rows per batch) to ensure no records are truncated.
 *
 * Usage:
 *   node database/backup-tables-to-csv.js
 *   npm run backup
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Parse .env file manually without external dotenv dependency
function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        env[key] = val;
      }
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || env.PUBLIC_SUPABASE_URL;
// Use SERVICE_ROLE_KEY if provided (bypasses RLS for 100% full backup), otherwise ANON_KEY
const supabaseKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.PUBLIC_SUPABASE_ANON_KEY || 
  env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Supabase URL or Key not found in .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Tables to back up
const TABLES_TO_BACKUP = [
  'clients',
  'potential_clients',
  'billing_records',
  'appointments',
  'attendance',
  'leave_requests',
  'leave_balances',
  'claims',
  'claim_entitlements',
  'profiles',
  'roles',
  'access_permissions',
  'announcements',
  'public_holidays'
];

/**
 * Convert an array of JavaScript objects into RFC 4180 compliant CSV text
 */
function jsonToCsv(data) {
  if (!data || data.length === 0) return '';

  // Collect all unique keys from all rows (accounts for sparse schemas)
  const headers = Array.from(
    new Set(data.flatMap(row => Object.keys(row)))
  );

  const escapeCell = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      val = JSON.stringify(val);
    } else {
      val = String(val);
    }
    // Escape double quotes and wrap in quotes if contains comma, quote, or newline
    if (val.includes('"') || val.includes(',') || val.includes('\n') || val.includes('\r')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csvRows = [];
  // Header row
  csvRows.push(headers.map(escapeCell).join(','));

  // Data rows
  for (const row of data) {
    const rowValues = headers.map(header => escapeCell(row[header]));
    csvRows.push(rowValues.join(','));
  }

  return csvRows.join('\r\n');
}

/**
 * Fetch all rows from a table using pagination (batches of 1000)
 */
async function fetchAllRows(tableName) {
  const allRows = [];
  const BATCH_SIZE = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, from + BATCH_SIZE - 1);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      if (data.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        from += BATCH_SIZE;
      }
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

async function runBackup() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const backupFolderName = `weekly_backup_${dateStr}_${timeStr}`;
  const backupDir = path.join(rootDir, 'backups', backupFolderName);

  fs.mkdirSync(backupDir, { recursive: true });

  console.log('====================================================');
  console.log(`📦 STARTING DATABASE BACKUP: ${backupFolderName}`);
  console.log(`📍 Output Directory: ${backupDir}`);
  console.log('====================================================\n');

  const summary = {
    timestamp: now.toISOString(),
    backup_folder: backupFolderName,
    tables: {}
  };

  for (const table of TABLES_TO_BACKUP) {
    process.stdout.write(`Fetching [${table}]... `);
    try {
      const rows = await fetchAllRows(table);
      const csvContent = jsonToCsv(rows);
      const filePath = path.join(backupDir, `${table}.csv`);
      fs.writeFileSync(filePath, csvContent, 'utf8');

      summary.tables[table] = {
        status: 'SUCCESS',
        rows_exported: rows.length,
        file_size_kb: (Buffer.byteLength(csvContent, 'utf8') / 1024).toFixed(2)
      };

      console.log(`✓ Exported ${rows.length} rows (${summary.tables[table].file_size_kb} KB)`);
    } catch (err) {
      summary.tables[table] = {
        status: 'ERROR',
        error: err.message
      };
      console.log(`❌ FAILED: ${err.message}`);
    }
  }

  // Write backup summary JSON
  fs.writeFileSync(
    path.join(backupDir, 'backup_summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8'
  );

  console.log('\n====================================================');
  console.log('✅ BACKUP COMPLETE!');
  console.log(`📁 All files saved to: ${backupDir}`);
  console.log('====================================================');
}

runBackup().catch(err => {
  console.error('\n❌ Unhandled backup error:', err);
  process.exit(1);
});
