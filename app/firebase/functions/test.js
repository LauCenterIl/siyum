/* Logic tests that run without Firebase:  node test.js */
"use strict";
const assert = require("assert");
const { nextReminder, isBlackout, israelParts } = require("./schedule");
const { buildReminder } = require("./messages");
const { normalizePhone } = require("./providers");
const fmt = d => d ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d) : "null";

// Israel wall clock incl. DST change (Israel DST 2027 starts Fri 26 Mar)
let n = nextReminder({ fr: "daily", tm: "evening" }, new Date("2026-11-10T10:00:00Z"));
assert.strictEqual(fmt(n), "Tue, 10 Nov 2026, 20:30"); console.log("daily evening      ", fmt(n));
// Thursday night -> next is Sunday (skips Friday evening and Shabbat)
n = nextReminder({ fr: "daily", tm: "evening" }, new Date("2026-11-12T19:00:00Z"));
assert.strictEqual(fmt(n), "Sun, 15 Nov 2026, 20:30"); console.log("skip Shabbat       ", fmt(n));
// Friday morning is allowed
n = nextReminder({ fr: "daily", tm: "morning" }, new Date("2026-11-12T19:00:00Z"));
assert.strictEqual(fmt(n), "Fri, 13 Nov 2026, 08:00"); console.log("Friday morning ok  ", fmt(n));
// twice a week -> Sun & Wed
n = nextReminder({ fr: "2w", tm: "noon" }, new Date("2026-11-15T12:00:00Z"));
assert.strictEqual(fmt(n), "Wed, 18 Nov 2026, 13:00"); console.log("twice a week       ", fmt(n));
// erev Pesach afternoon blocked (Pesach 22 Apr 2027 = Thursday)
n = nextReminder({ fr: "daily", tm: "evening" }, new Date("2027-04-21T05:00:00Z"));
assert.strictEqual(fmt(n), "Sun, 25 Apr 2027, 20:30"); console.log("skip erev/Yom Tov  ", fmt(n));
// DST: after 26 Mar 2027 still 20:30 local
n = nextReminder({ fr: "daily", tm: "evening" }, new Date("2027-03-28T05:00:00Z"));
assert.strictEqual(fmt(n), "Sun, 28 Mar 2027, 20:30"); console.log("after DST          ", fmt(n));
// campaign end
n = nextReminder({ fr: "daily", tm: "evening" }, new Date("2027-06-10T05:00:00Z"));
assert.strictEqual(n, null); console.log("after erev Shavuot ", fmt(n));
assert.ok(isBlackout(israelParts(new Date("2026-11-14T10:00:00Z"))));

assert.strictEqual(normalizePhone("050-123-4567"), "+972501234567");
assert.strictEqual(normalizePhone("+972 50 123 4567"), "+972501234567");
assert.strictEqual(normalizePhone("123"), null);

const m = buildReminder({ name: "שרה כהן", lang: "he" },
  [{ id: "a", n: 150, done: 30, label: { he: "כל 150 פרקי תהילים" } }, { id: "b", n: 4, done: 4, label: { he: "מגילת רות" } }],
  { siteUrl: "https://example.org", unsubUrl: "https://example.org/unsubscribe?u=1&t=x", now: new Date("2026-12-01T10:00:00Z"), seq: 2 });
assert.strictEqual(m.commitmentId, "a"); assert.deepStrictEqual(m.params.slice(0, 3), ["שרה", "כל 150 פרקי תהילים", "20"]);
console.log("\n--- sample WhatsApp/SMS text ---\n" + m.smsText);
assert.strictEqual(buildReminder({ name: "x" }, [{ id: "a", n: 1, done: 1, label: { he: "x" } }], { siteUrl: "s", unsubUrl: "u" }), null);
console.log("\nall tests passed");
