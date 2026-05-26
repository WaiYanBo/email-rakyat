# Real-Time Announcements Setup Guide

## Step 1: Create the `announcements` Table in Supabase

Go to your Supabase dashboard and run this SQL in the SQL Editor:

```sql
-- Create the announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'Info', -- 'Urgent', 'Memo', or 'Info'
  author_name VARCHAR(255),
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT now(), -- When to publish/show this announcement
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Create indexes for faster queries
CREATE INDEX idx_announcements_scheduled_at 
ON public.announcements(scheduled_at DESC);

CREATE INDEX idx_announcements_created_at 
ON public.announcements(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read announcements
CREATE POLICY "Allow authenticated users to read announcements"
  ON public.announcements
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Allow only admins/executives to insert
CREATE POLICY "Allow admins to create announcements"
  ON public.announcements
  FOR INSERT
  WITH CHECK (auth.uid() IN (
    SELECT id FROM profiles 
    WHERE role_id IN (
      SELECT id FROM roles 
      WHERE role_name IN ('Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin')
    )
  ));

-- Policy: Allow admins to update/delete their own announcements
CREATE POLICY "Allow admins to manage announcements"
  ON public.announcements
  FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Allow admins to delete announcements"
  ON public.announcements
  FOR DELETE
  USING (auth.uid() = author_id);
```

## Step 2: Add `scheduled_at` Column to Existing Table

If you already created the table, run this to add the date scheduling feature:

```sql
-- Add scheduled_at column if it doesn't exist
ALTER TABLE public.announcements 
ADD COLUMN scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create index for faster queries
CREATE INDEX idx_announcements_scheduled_at 
ON public.announcements(scheduled_at DESC);
```

## Step 3: Insert Sample Data (Optional)

```sql
-- Insert sample announcements for testing
INSERT INTO public.announcements (title, content, type, author_name)
VALUES
  ('Server Maintenance Notice', 'Sistem pangkalan data akan ditutup sementara pada jam 12:00 AM hingga 2:00 AM malam ini.', 'Urgent', 'IT Dept'),
  ('Cuti Umum Hari Keputeraan Agong', 'Ibu pejabat akan ditutup pada hari Isnin minggu hadapan bersempena cuti umum.', 'Memo', 'HR Dept');
```

## Step 3: Enable Real-Time (if not already enabled)

1. Go to **Supabase Dashboard** → Your Project
2. Navigate to **Database** → **Replication**
3. Ensure the `announcements` table has real-time enabled

## Step 4: Verify the Component

The updated `ExecutiveOverview.tsx` now:
- ✅ Fetches announcements from Supabase on component load
- ✅ Sets up a real-time listener for instant updates
- ✅ Posts new announcements directly to the database
- ✅ Automatically syncs across all connected users
- ✅ Shows loading states while posting

## Features Implemented

| Feature | Status |
|---------|--------|
| Fetch announcements from DB | ✅ |
| Real-time sync across users | ✅ |
| Post new announcements | ✅ |
| **Schedule announcements** | ✅ NEW |
| **Past dates as records** | ✅ NEW |
| **Future dates as scheduled** | ✅ NEW |
| Format dates consistently | ✅ |
| Empty state message | ✅ |
| Loading indicators | ✅ |
| Error handling | ✅ |
| Role-based permissions | ✅ |

## How Scheduling Works

**Announcement Date Field:**
- 📋 **Past Dates** → Kept as historical records (view when it was announced)
- 📅 **Today** → Posted immediately and visible to all users
- ⏰ **Future Dates** → Scheduled announcement (only appears when that date arrives)

**Example:**
- Post an announcement with date "May 20, 2026" → Appears as a record
- Post an announcement with date "May 26, 2026" (today) → Appears immediately
- Post an announcement with date "May 30, 2026" → Hidden until May 30

## How It Works

1. When the dashboard loads, `fetchAnnouncements()` queries all announcements
2. A real-time listener is set up on the `announcements` table
3. When ANY user posts a new announcement, it's inserted into the database
4. The real-time listener detects the change and refetches all announcements
5. All connected users' UIs update instantly
6. When a user leaves, the listener is unsubscribed

## Testing

### Basic Test (Real-Time Sync)
1. Open the portal in two different browser tabs/windows
2. Post an announcement in one tab
3. Watch it appear instantly in the other tab! 🎉

### Scheduling Test
1. **Add a past date** → Post announcement with date "May 20, 2026"
   - Should appear as a record immediately
2. **Add today's date** → Post announcement with date "May 26, 2026"
   - Should appear immediately to all users
3. **Add a future date** → Post announcement with date "June 5, 2026"
   - Should be hidden now, only appear on June 5
