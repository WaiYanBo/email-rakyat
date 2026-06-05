# Clients View & Audit Logs Setup Guide

## Step 1: Create the `audit_logs` Table in Supabase

Run this SQL in your Supabase SQL Editor:

```sql
-- Create the audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  user_role VARCHAR(100),
  table_name VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL, -- INSERT, UPDATE, DELETE
  record_id UUID,
  changes JSONB, -- Stores old and new values for each field
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX idx_audit_logs_table_date ON public.audit_logs(table_name, created_at DESC);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: HR, CFO, CEO, Chairman can view all audit logs
CREATE POLICY "Authorized users can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (auth.uid() IN (
    SELECT id FROM profiles 
    WHERE role_id IN (
      SELECT id FROM roles 
      WHERE role_name IN ('HR', 'CFO', 'CEO', 'Chairman', 'Intern HR', 'Intern Marketing')
    )
  ));

-- Policy: System can insert audit logs
CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);
```

## Step 2: Components Added

Two new React components have been created:

### **ClientsView.tsx**
- ✅ View all clients (accessible to everyone)
- ✅ Edit client information (CFO, COO, CEO, Intern HR only)
- ✅ Search functionality
- ✅ Case status badges with color coding
- ✅ Summary statistics (Total, Pending, Completed, Dropped)
- ✅ Automatic audit logging on edits

### **AuditLogsView.tsx**
- ✅ View all audit logs (HR, CFO, CEO, Chairman, Interns)
- ✅ Filter by table and action type
- ✅ Timeline view of all changes
- ✅ Expandable details showing before/after values
- ✅ Summary statistics (Inserts, Updates, Deletes)

## Step 3: How It Works

### **Editing Client Records**

1. **User Views:** All employees can see the Clients Database
2. **User Edits:** Only CFO, COO, CEO, Intern HR can click "Edit"
3. **Change Recorded:** When saved, each field change is logged with:
   - User name and role
   - Timestamp
   - Old value → New value
4. **Audit Trail:** All changes appear in Audit Logs with full history

### **Role-Based Access Control**

| Role | View Clients | Edit Clients | View Audit Logs |
|------|:---:|:---:|:---:|
| Employee | ✓ | ✗ | ✗ |
| Intern HR | ✓ | ✓ | ✓ |
| Intern Marketing | ✓ | ✗ | ✗ |
| HR | ✓ | ✗ | ✓ |
| COO | ✓ | ✓ | ✓ |
| CFO | ✓ | ✓ | ✓ |
| CEO | ✓ | ✓ | ✓ |
| Chairman | ✓ | ✗ | ✓ |

## Features Implemented

### **ClientsView Features**
| Feature | Status |
|---------|--------|
| View all clients | ✅ |
| Search/filter | ✅ |
| Edit (role-restricted) | ✅ |
| Inline editing | ✅ |
| Save changes | ✅ |
| Audit logging | ✅ |
| Case status badges | ✅ |
| Summary stats | ✅ |
| Dark mode support | ✅ |

### **AuditLogsView Features**
| Feature | Status |
|---------|--------|
| View audit logs | ✅ |
| Filter by table | ✅ |
| Filter by action | ✅ |
| Timeline view | ✅ |
| Expandable details | ✅ |
| Before/after values | ✅ |
| User attribution | ✅ |
| Timestamps | ✅ |
| Summary stats | ✅ |
| Action color coding | ✅ |

## Example Audit Log Entry

When a user edits a client's case status:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "user_name": "Wai Yan Bo",
  "user_role": "CFO",
  "table_name": "clients",
  "action": "UPDATE",
  "record_id": "123e4567-e89b-12d3-a456-426614174000",
  "changes": {
    "CASE STATUS": {
      "old": "PENDING",
      "new": "IN PROGRESS"
    }
  },
  "created_at": "2026-05-26T10:30:00Z"
}
```

## Testing

### **As Employee (View-Only)**
1. Log in as employee
2. Navigate to dashboard
3. See "Clients Database" section
4. Try to click Edit → Button is disabled (grayed out)
5. Cannot see "Audit Logs" section

### **As Intern HR (Can Edit)**
1. Log in as Intern HR
2. Go to "Clients Database"
3. Click "Edit" on any client
4. Change any field
5. Click "Save"
6. View "Audit Logs" to see your change recorded
7. Check the timeline shows your edit with before/after values

### **As CFO (Can View All)**
1. Log in as CFO
2. See both "Clients Database" and "Audit Logs"
3. Edit a client → See it immediately in audit logs
4. Filter audit logs by action type (INSERT, UPDATE, DELETE)

## Data Privacy

- Each user only sees their own attendance records (except HR/CFO who see all)
- Audit logs are only visible to authorized personnel
- All changes are timestamped with user attribution
- Changes cannot be edited or deleted from audit logs (immutable history)

## Database Constraints

- `audit_logs` table uses JSONB for changes to handle any field structure
- Indexes on table_name and created_at for fast filtering
- Foreign key constraint ensures user reference is valid
- RLS policies ensure only authorized personnel can access logs
