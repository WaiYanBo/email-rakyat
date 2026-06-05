# Announcement Posting Issues - Troubleshooting Guide

## Problem: Head and IT Team Cannot Post New Announcements

The "Post Notice" button should appear for users with these roles:
- Chairman
- CEO
- COO
- CFO
- General Manager
- **IT Admin** ✅
- Department Head
- Manager

## Step 1: Check Browser Console for Debug Logs

1. **Open your browser's Developer Tools** (Press `F12` or Right-click → Inspect)
2. **Go to the Console tab**
3. **Refresh the portal page** (staff dashboard)
4. **Look for these logs:**

```
✅ Final roleName for access check: [YOUR ROLE]
🔍 Announcement Access Debug: {
  userRole: "[ROLE]",
  isIT: [true/false],
  hasFullAccess: [true/false],
  canPostAnnouncements: [true/false]
}
```

### What This Tells You:
- **`userRole`**: The role being loaded from the database
- **`hasFullAccess: true`** = Button SHOULD appear
- **`hasFullAccess: false`** = Button will NOT appear

---

## Step 2: Identify the Problem

### **Issue 1: Button Not Appearing (hasFullAccess is false)**

Look for these messages in the console:

```
❌ Profile fetch error: [error details]
```

**This means the role isn't loading correctly.**

### Solution:

The component now has **3-step role loading**:

1. **Try to load role from relationship** - `profiles.roles(role_name)`
2. **Fallback to direct role query** - Query `roles` table using `role_id`
3. **Log warnings** if neither works

**Check the console for:**
```
Loaded role from array: [ROLE]
Loaded role from object: [ROLE]
Loaded role from fallback query: [ROLE]
⚠️ No roles relationship and no role_id found - user has no role assigned!
```

---

## Step 3: Database Verification

If the role still won't load, verify your Supabase database:

### Check 1: Does the user have a role assigned?

```sql
-- Replace YOUR-USER-ID with the actual user ID
SELECT p.id, p.full_name, p.role_id, r.role_name
FROM profiles p
LEFT JOIN roles r ON p.role_id = r.id
WHERE p.id = 'YOUR-USER-ID';
```

**Expected result for IT Admin:**
```
id                  | full_name | role_id              | role_name
--------------------+-----------+----------------------+----------
[user-id]           | John Doe  | [some-uuid]          | IT Admin
```

### Check 2: Does the role exist in the roles table?

```sql
SELECT * FROM roles 
WHERE role_name IN ('IT Admin', 'Chairman', 'Department Head', 'Manager');
```

**Expected results:**
- At least one row with `role_name = 'IT Admin'`

### Check 3: Verify RLS Policy on announcements table

```sql
-- Check if RLS is enabled
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'announcements';

-- View RLS policies
SELECT * FROM pg_policies 
WHERE tablename = 'announcements';
```

**Look for a policy similar to:**
```
Allow admins to create announcements
```

---

## Step 4: Manual Role Assignment (If Role is Missing)

If the user's `role_id` is NULL or missing:

```sql
-- First, get the ID of the IT Admin role
SELECT id FROM roles WHERE role_name = 'IT Admin';

-- Then assign it to the user (replace IDs with actual values)
UPDATE profiles 
SET role_id = '[IT_ADMIN_ROLE_ID]'
WHERE id = '[USER_ID]';
```

---

## Step 5: Test the Fix

1. **Hard refresh the portal** (Ctrl+Shift+R on Windows/Linux, Cmd+Shift+R on Mac)
2. **Check the console logs again** - you should now see:
   ```
   ✅ Final roleName for access check: IT Admin
   🔍 Announcement Access Debug: { hasFullAccess: true, ... }
   ```
3. **The "Post Notice" button should now appear** in the announcements section

---

## Step 6: Verify Announcement Posting Works

1. **Click "Post Notice"** button (next to "View History")
2. **Fill in:**
   - Title: "Test Announcement"
   - Content: "Testing if IT Admin can post"
   - Type: "Info"
   - Date: (today's date)
3. **Click "Post" button**
4. **You should see:**
   - Success message
   - New announcement appears immediately
   - Console shows: `Announcement posted successfully: [data]`

---

## Common Issues & Fixes

### Issue: "No Role" appears next to your name

**Cause:** User profile exists but `role_id` is NULL

**Fix:**
```sql
UPDATE profiles SET role_id = '[ROLE_ID]' WHERE id = '[USER_ID]';
```

### Issue: Wrong role name (e.g., "it admin" instead of "IT Admin")

**Cause:** Database has different casing

**Note:** The component now handles this with **case-insensitive comparison**, so this should work.

### Issue: Button appears but posting fails

**Cause:** RLS policy blocking insert

**Check console for:** `Error posting announcement: [error details]`

**Verify RLS policy** with the queries in Step 3 above

---

## Quick Diagnostic Command

Run this in the browser console while on the portal:

```javascript
// Check what the component thinks your role is
console.log('Current user role:', document.body.innerText.match(/\(([^)]+)\)$/)?.[1]);
```

Or check the welcome message - it displays your role: `Welcome back, [Name] (ROLE)`

---

## Still Having Issues?

**Collect this information:**

1. What role do you see in the "Welcome back" message?
2. What does the console say under "Announcement Access Debug"?
3. Does the database query in Step 3 show a role assigned?
4. Are there any error messages in the console?

Share these details and we can debug further!
