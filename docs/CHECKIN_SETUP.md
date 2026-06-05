# Check-In/Check-Out System Setup Guide

## Step 1: Create the `attendance` Table in Supabase

Run this SQL in your Supabase SQL Editor:

```sql
-- Create the attendance table
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name VARCHAR(255),
  date DATE NOT NULL,
  
  -- Check In Data
  check_in_time TIMESTAMP WITH TIME ZONE,
  check_in_latitude DECIMAL(10, 8),
  check_in_longitude DECIMAL(11, 8),
  check_in_distance INTEGER, -- Distance in meters from office
  check_in_within_zone BOOLEAN DEFAULT false,
  check_in_accuracy INTEGER, -- GPS accuracy in meters
  
  -- Check Out Data
  check_out_time TIMESTAMP WITH TIME ZONE,
  check_out_latitude DECIMAL(10, 8),
  check_out_longitude DECIMAL(11, 8),
  check_out_distance INTEGER,
  check_out_within_zone BOOLEAN DEFAULT false,
  check_out_accuracy INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(user_id, date)
);

-- Create indexes for faster queries
CREATE INDEX idx_attendance_user_date ON public.attendance(user_id, date);
CREATE INDEX idx_attendance_date ON public.attendance(date DESC);

-- Enable Row Level Security
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own records + HR/CFO can read all
CREATE POLICY "Users can view their own attendance"
  ON public.attendance FOR SELECT
  USING (auth.uid() = user_id OR 
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role_id IN (
        SELECT id FROM roles 
        WHERE role_name IN ('HR', 'CFO')
      )
    )
  );

-- Policy: Users can insert/update their own records
CREATE POLICY "Users can record their check-in/check-out"
  ON public.attendance FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own attendance"
  ON public.attendance FOR UPDATE
  USING (auth.uid() = user_id);
```

## Step 2: Add Components to Dashboard

The components are already created:
- **CheckInCheckOut.tsx** - For employees to check in/out
- **AttendanceView.tsx** - For HR/CFO to view attendance records

Add them to your dashboard page (`src/pages/portal/dashboard.astro` or index):

```astro
---
// In your dashboard page:
import CheckInCheckOut from '../components/CheckInCheckOut.tsx';
import AttendanceView from '../components/AttendanceView.tsx';
---

<client:load>
  <CheckInCheckOut client:load />
  <AttendanceView client:load />
</client:load>
```

Or in a React component:

```tsx
import CheckInCheckOut from './CheckInCheckOut';
import AttendanceView from './AttendanceView';

export default function Dashboard() {
  return (
    <>
      <CheckInCheckOut />
      <AttendanceView />
    </>
  );
}
```

## How It Works

### Check-In/Check-Out Component
1. ✅ **Location Permission** - Requests user permission once per check-in/out
2. ✅ **GPS Coordinates** - Records latitude, longitude, and accuracy
3. ✅ **Distance Calculation** - Uses Haversine formula to calculate distance from office
4. ✅ **Zone Detection** - Flags if within 200m (green) or outside (red)
5. ✅ **Real-Time Status** - Shows check-in/out time and location status

### Attendance View Component (HR/CFO Only)
1. ✅ **Date Filtering** - View records for any date
2. ✅ **Employee Records** - See all employees' check-in/check-out
3. ✅ **Location Verification** - Green badge for in-zone, red warning for outside
4. ✅ **Distance Display** - Shows distance in meters
5. ✅ **Statistics** - Counts of checked-in, in-zone, outside zone

## Office Location Configuration

**Current Office Location:**
- Latitude: 3.0750624396122763
- Longitude: 101.61250689446412
- Zone Radius: 200 meters

**To change location:** Edit the constants in `CheckInCheckOut.tsx`:
```tsx
const OFFICE_LAT = 3.0750624396122763;
const OFFICE_LNG = 101.61250689446412;
const ZONE_RADIUS_METERS = 200;
```

## Features

| Feature | Status | Details |
|---------|--------|---------|
| Check-in button | ✅ | Records time + location |
| Check-out button | ✅ | Records time + location |
| Location permission | ✅ | One-time request per action |
| GPS coordinates | ✅ | Latitude, longitude, accuracy |
| Distance calculation | ✅ | Haversine formula (meters) |
| Zone detection | ✅ | 200m radius from office |
| In-zone badge | ✅ | Green when within zone |
| Outside zone flag | ✅ | Red when outside zone |
| Daily status | ✅ | Shows today's check-in/out |
| Attendance view | ✅ | HR/CFO only |
| Date filtering | ✅ | View any date's records |
| Statistics | ✅ | Total, in-zone, outside |
| User restrictions | ✅ | No check-in for Chairman/CEO |
| Data privacy | ✅ | Users see own, HR/CFO see all |

## Testing

### Employee Test
1. Log in as an employee (not Chairman/CEO)
2. Click **Check In** button
3. Allow location access when prompted
4. See check-in time with location status (green/red)
5. Click **Check Out** to finish

### HR/CFO Test
1. Log in as HR or CFO
2. View **Attendance Records** section
3. Filter by date
4. See all employees' check-in/out with location badges
5. Identify those who checked in outside the zone

## Distance Calculation

The system uses the **Haversine formula** to calculate great-circle distances between points on Earth:

```
Distance = 2 * R * atan2(√a, √(1-a))

where:
- R = Earth's radius (6,371,000 meters)
- a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlng/2)
```

This provides accurate distance calculations up to ±200 meters precision.
