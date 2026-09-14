/**
 * Calendar export utilities for native device alarms (iOS Apple Calendar & Android Google Calendar)
 */

export interface CalendarAppointment {
  id?: string;
  client_name?: string;
  appointment_date?: string; // YYYY-MM-DD
  appointment_time?: string; // e.g. 11:30 AM, 14:00
  case_category?: string;
  pic_name?: string;
  location?: string;
  notes?: string;
  client_phone?: string;
}

function parseDateTime(dateStr?: string, timeStr?: string): { start: Date; end: Date } {
  const now = new Date();
  let d = new Date();

  if (dateStr) {
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3) {
      d = new Date(parts[0], parts[1] - 1, parts[2]);
    }
  }

  let hours = 10;
  let minutes = 0;

  if (timeStr) {
    const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm|pagi|petang|malam)?/i);
    if (match) {
      hours = parseInt(match[1], 10);
      minutes = match[2] ? parseInt(match[2], 10) : 0;
      const period = match[3]?.toLowerCase() || '';
      const isPM = period.includes('pm') || period.includes('petang') || period.includes('malam');
      const isAM = period.includes('am') || period.includes('pagi');

      if (isPM && hours < 12) hours += 12;
      else if (isAM && hours === 12) hours = 0;
    }
  }

  d.setHours(hours, minutes, 0, 0);
  const start = new Date(d.getTime());
  const end = new Date(d.getTime() + 45 * 60 * 1000); // default 45 min consultation

  return { start, end };
}

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Generates an iCalendar (.ics) string containing a 15-minute system alarm.
 * When opened on iOS (iPhone) or Android, it imports directly into the native
 * device calendar and triggers OS-level system alarms even if the browser is closed.
 */
export function generateIcs(appointment: CalendarAppointment): string {
  const { start, end } = parseDateTime(appointment.appointment_date, appointment.appointment_time);
  const client = appointment.client_name || 'Client';
  const category = appointment.case_category || 'General';
  const pic = appointment.pic_name || 'Staff';
  const location = appointment.location || 'Office Consultation';
  const notes = appointment.notes ? `Catatan: ${appointment.notes}` : '';
  const phone = appointment.client_phone ? `Tel: ${appointment.client_phone}` : '';
  const description = `Konsultasi ${category} bersama ${pic}. ${phone} ${notes}`.trim();

  const uid = `apt-${appointment.id || Date.now()}@e-rakyat.com`;
  const dtStamp = formatIcsDate(new Date());
  const dtStart = formatIcsDate(start);
  const dtEnd = formatIcsDate(end);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Email Rakyat//Staff Portal//MS',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Temujanji: ${client} (${category})`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    `LOCATION:${location.replace(/\n/g, ' ')}`,
    'STATUS:CONFIRMED',
    // 15-minute advance native phone alarm
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Peringatan: Temujanji bersama ${client} dalam 15 minit`,
    'END:VALARM',
    // 0-minute alarm (at meeting start)
    'BEGIN:VALARM',
    'TRIGGER:-PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Temujanji bermula sekarang: ${client}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

/**
 * Prompts download or native open of .ics calendar file on the user's device.
 */
export function downloadAppointmentIcs(appointment: CalendarAppointment) {
  if (typeof window === 'undefined') return;
  const icsContent = generateIcs(appointment);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const clientName = (appointment.client_name || 'client').replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `temujanji_${clientName}_${appointment.appointment_date || 'date'}.ics`;

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Generates a direct Google Calendar web / app link pre-filled with meeting details and reminders.
 */
export function getGoogleCalendarLink(appointment: CalendarAppointment): string {
  const { start, end } = parseDateTime(appointment.appointment_date, appointment.appointment_time);
  const client = appointment.client_name || 'Client';
  const category = appointment.case_category || 'General';
  const pic = appointment.pic_name || 'Staff';
  const location = appointment.location || 'Office Consultation';
  const notes = appointment.notes ? `Catatan: ${appointment.notes}` : '';
  const phone = appointment.client_phone ? `Tel: ${appointment.client_phone}` : '';
  const details = `Konsultasi ${category} bersama ${pic}. ${phone} ${notes}`.trim();

  const dtStart = formatIcsDate(start);
  const dtEnd = formatIcsDate(end);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Temujanji: ${client} (${category})`,
    dates: `${dtStart}/${dtEnd}`,
    details,
    location
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
