# Enhanced Attendance Records Component

## New Features Added

### 1. 🔍 Filter by Employee Name
- **Real-time search** as you type
- Case-insensitive matching
- Searches across all attendance records
- Shows results instantly

### 2. 📅 Filter by Date
- Select a specific date to view clock-in/clock-out records for that day
- Shows all employees who clocked in/out on that date
- Default shows today's date

### 3. 📆 Filter by Month
- Toggle between date and month view
- Select any month to see all attendance records for that month
- Useful for generating monthly reports

### 4. 📊 Export to Excel
- **One-click export** of filtered records
- Automatically formatted with:
  - Employee Name
  - Date
  - Clock In Time
  - Clock In Location (distance)
  - Clock In Status (In Zone / Outside Zone)
  - Clock Out Time
  - Clock Out Location (distance)
  - Clock Out Status (In Zone / Outside Zone)
- Optimized column widths for readability
- Filename includes filter type and current date
  - Example: `Attendance_2026-05-26_2026-05-26.xlsx`

## How to Use

### Searching by Name
1. Type any part of an employee's name in the **"Search by Employee Name"** field
2. Results update automatically as you type

### Filtering by Date
1. Click the **"By Date"** button to enable date filtering
2. Select the desired date using the date picker
3. Table updates to show only records for that date

### Filtering by Month
1. Click the **"By Month"** button to enable month filtering
2. Select the desired month using the month picker
3. Table updates to show all records for that month

### Combining Filters
You can combine multiple filters:
- Search by name AND filter by date
- Search by name AND filter by month
- Use any combination for precise results

### Exporting Data
1. Apply your desired filters
2. Click the **"Export to Excel"** button showing the record count
3. Excel file automatically downloads with the filtered data

## Technical Details

### Dependencies
- `xlsx` library (v0.20.2) for Excel export functionality
- React hooks: `useState`, `useEffect`
- Supabase client for database queries

### File Location
- `src/components/AttendanceView.tsx`

### Required Permissions
- HR or CFO role (same as before)
- Access to attendance database table

## Example Export Format

| Employee Name | Date       | Clock In Time | Clock In Location | Clock In Status | Clock Out Time | Clock Out Location | Clock Out Status |
|---------------|------------|---------------|-------------------|-----------------|----------------|--------------------|------------------|
| John Doe      | 2026-05-26 | 09:00:15      | 150m              | In Zone         | 17:30:45       | 160m               | In Zone          |
| Jane Smith    | 2026-05-26 | 08:55:30      | 120m              | In Zone         | 17:45:20       | 140m               | In Zone          |

## Benefits

✅ **Flexible Filtering** - Multiple ways to find the records you need
✅ **Easy Export** - Generate reports in seconds
✅ **Real-time Search** - Instant results as you type
✅ **Professional Format** - Excel files are professionally formatted
✅ **Role-based Access** - Maintains security with HR/CFO restriction

## Version
Last Updated: May 26, 2026
