/* Reminder timing - pure functions, no Firebase. Israel time, no messages on Shabbat or Yom Tov. */
"use strict";
const TZ = "Asia/Jerusalem";
const SLOTS = { morning: [8, 0], noon: [13, 0], evening: [20, 30] };
// Days of week (0 = Sunday) on which each frequency sends.
const DAYS = { daily: [0, 1, 2, 3, 4, 5, 6], "2w": [0, 3], weekly: [0] };
const CAMPAIGN_END = new Date("2027-06-11T00:00:00+03:00"); // Shavuot 5787 (no reminders from erev Shavuot on)

// Yom Tov days in the campaign window (Israel). Blackout runs from 12:00 on erev Yom Tov to the end of the day.
// Dates are the Yom Tov day itself (Gregorian, Israel date).
const YOM_TOV = ["2027-04-22", "2027-04-28", "2027-06-11"]; // Pesach I, Shvi'i shel Pesach, Shavuot

/** Wall-clock parts of an instant in Israel. */
function israelParts(date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd };
}
/** The instant at which Israel wall-clock reads y-m-d h:min. */
function israelTime(y, m, d, h, min) {
  let guess = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 3; i++) {
    const p = israelParts(new Date(guess));
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    const diff = asUtc - Date.UTC(y, m - 1, d, h, min);
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}
const ymd = p => `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
function addDaysYMD(p, n) {
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n, 12));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: t.getUTCDay() };
}

/** True if this Israel wall-clock moment falls on Shabbat/Yom Tov or the afternoon before. */
function isBlackout(p) {
  // Friday from 12:00, all of Saturday
  if (p.wd === 6) return true;
  if (p.wd === 5 && p.h >= 12) return true;
  const today = ymd(p);
  if (YOM_TOV.includes(today)) return true;
  const tomorrow = ymd(addDaysYMD(p, 1));
  if (YOM_TOV.includes(tomorrow) && p.h >= 12) return true;
  return false;
}

/**
 * Next reminder time strictly after `from`, or null when the campaign is over.
 * rem = {fr: daily|2w|weekly, tm: morning|noon|evening}
 */
function nextReminder(rem, from = new Date()) {
  const [hh, mm] = SLOTS[rem && rem.tm] || SLOTS.evening;
  const days = DAYS[rem && rem.fr] || DAYS.daily;
  const start = israelParts(from);
  for (let i = 0; i < 21; i++) {
    const day = addDaysYMD(start, i);
    if (!days.includes(day.wd)) continue;
    const at = israelTime(day.y, day.m, day.d, hh, mm);
    if (at <= from) continue;
    if (at >= CAMPAIGN_END) return null;
    if (isBlackout(israelParts(at))) continue;
    return at;
  }
  return null;
}

module.exports = { nextReminder, isBlackout, israelParts, israelTime, CAMPAIGN_END };
