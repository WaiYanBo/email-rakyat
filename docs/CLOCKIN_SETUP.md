# Clock-In/Clock-Out System Setup Guide

## Step 1: Create the `attendance` Table in Supabase

Run this SQL in your Supabase SQL Editor:

```sql
-- Create the attendance table
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name VARCHAR(255),
  date DATE NOT NULL,
  
  -- Clock In Data
  clock_in_time TIMESTAMP WITH TIME ZONE,
  clock_in_latitude DECIMAL(10, 8),
  clock_in_longitude DECIMAL(11, 8),
  clock_in_distance INTEGER, -- Distance in meters from office
  clock_in_within_zone BOOLEAN DEFAULT false,
  clock_in_accuracy INTEGER, -- GPS accuracy in meters
  
  -- Clock Out Data
  clock_out_time TIMESTAMP WITH TIME ZONE,
  clock_out_latitude DECIMAL(10, 8),
  clock_out_longitude DECIMAL(11, 8),
  clock_out_distance INTEGER,
  clock_out_within_zone BOOLEAN DEFAULT false,
  clock_out_accuracy INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Late clockout flags
  is_late_clockout BOOLEAN DEFAULT false,
  late_clockout_flagged BOOLEAN DEFAULT false,
  late_clockout_reported_at TIMESTAMP WITH TIME ZONE,
  
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
CREATE POLICY "Users can record their clock-in/clock-out"
  ON public.attendance FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own attendance"
  ON public.attendance FOR UPDATE
  USING (auth.uid() = user_id);
```

## Step 2: Add Components to Dashboard

The components are already created:
- **ClockInClockOut.tsx** - For employees to clock in/out
- **AttendanceView.tsx** - For HR/CFO to view attendance records

Add them to your dashboard page (`src/pages/portal/dashboard.astro` or index):

```astro
---
// In your dashboard page:
import ClockInClockOut from '../components/ClockInClockOut.tsx';
import AttendanceView from '../components/AttendanceView.tsx';
---

<client:load>
  <ClockInClockOut client:load />
  <AttendanceView client:load />
</client:load>
```

Or in a React component:

```tsx
import ClockInClockOut from './ClockInClockOut';
import AttendanceView from './AttendanceView';

export default function Dashboard() {
  return (
    <>
      <ClockInClockOut />
      <AttendanceView />
    </>
  );
}
```

## How It Works

### Clock-In/Clock-Out Component
1. ✅ **Location Permission** - Requests user permission once per clock-in/out
2. ✅ **GPS Coordinates** - Records latitude, longitude, and accuracy
3. ✅ **Distance Calculation** - Uses Haversine formula to calculate distance from office
4. ✅ **Zone Detection** - Flags if within 200m (green) or outside (red)
5. ✅ **Real-Time Status** - Shows clock-in/out time and location status

### Attendance View Component (HR/CFO Only)
1. ✅ **Date Filtering** - View records for any date
2. ✅ **Employee Records** - See all employees' clock-in/clock-out
3. ✅ **Location Verification** - Green badge for in-zone, red warning for outside
4. ✅ **Distance Display** - Shows distance in meters
5. ✅ **Statistics** - Counts of clocked-in, in-zone, outside zone

## Office Location Configuration

**Current Office Location:**
- Latitude: 3.0750624396122763
- Longitude: 101.61250689446412
- Zone Radius: 200 meters

**To change location:** Edit the constants in `ClockInClockOut.tsx`:
```tsx
const OFFICE_LAT = 3.0750624396122763;
const OFFICE_LNG = 101.61250689446412;
const ZONE_RADIUS_METERS = 200;
```

## Features

| Feature | Status | Details |
|---------|--------|---------|
| Clock-in button | ✅ | Records time + location |
| Clock-out button | ✅ | Records time + location |
| Location permission | ✅ | One-time request per action |
| GPS coordinates | ✅ | Latitude, longitude, accuracy |
| Distance calculation | ✅ | Haversine formula (meters) |
| Zone detection | ✅ | 200m radius from office |
| In-zone badge | ✅ | Green when within zone |
| Outside zone flag | ✅ | Red when outside zone |
| Daily status | ✅ | Shows today's clock-in/out |
| Attendance view | ✅ | HR/CFO only |
| Date filtering | ✅ | View any date's records |
| Statistics | ✅ | Total, in-zone, outside |
| User restrictions | ✅ | No clock-in for Chairman/CEO |
| Data privacy | ✅ | Users see own, HR/CFO see all |

## Testing

### Employee Test
1. Log in as an employee (not Chairman/CEO)
2. Click **Clock In** button
3. Allow location access when prompted
4. See clock-in time with location status (green/red)
5. Click **Clock Out** to finish

### HR/CFO Test
1. Log in as HR or CFO
2. View **Attendance Records** section
3. Filter by date
4. See all employees' clock-in/out with location badges
5. Identify those who clocked in outside the zone

## Distance Calculation

The system uses the **Haversine formula** to calculate great-circle distances between points on Earth:

```
Distance = 2 * R * atan2(√a, √(1-a))

where:
- R = Earth's radius (6,371,000 meters)
- a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlng/2)
```

This provides accurate distance calculations up to ±200 meters precision.
