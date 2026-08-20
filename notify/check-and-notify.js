// Runs on a schedule (GitHub Actions cron, see ../.github/workflows/notify.yml).
// Checks every Daybreak user's alarms/reminders/tasks in Firestore and sends a
// push notification for anything due in the last LOOKBACK_MINUTES.
//
// This exists instead of a Firebase Cloud Function because Cloud Functions
// require the Blaze (pay-as-you-go) billing plan. Firestore reads/writes and
// sending FCM messages are both free regardless of plan — only the *compute*
// that runs the check needs a home, so GitHub Actions' free scheduler does it.

var admin = require("firebase-admin");

var LOOKBACK_MINUTES = 6; // a little more than the 5-min cron interval, to absorb scheduling delays
var TIMEZONE = "Asia/Kolkata";
var DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function initAdmin() {
  var raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY env var is not set.");
  var serviceAccount = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }

function nowInTZ() {
  var fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short"
  });
  var parts = {};
  fmt.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
  var hour = parts.hour === "24" ? "00" : parts.hour;
  var weekdayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return {
    date: parts.year + "-" + parts.month + "-" + parts.day,
    hhmm: hour + ":" + parts.minute,
    dayIdx: weekdayMap[parts.weekday]
  };
}

function minutesSinceMidnight(hhmm) {
  var p = String(hhmm).split(":");
  return (+p[0]) * 60 + (+p[1]);
}

function isDueNow(itemHHMM, nowHHMM) {
  var due = minutesSinceMidnight(itemHHMM);
  var now = minutesSinceMidnight(nowHHMM);
  var delta = now - due;
  return delta >= 0 && delta <= LOOKBACK_MINUTES;
}

async function getAppStateValue(userRef, key) {
  var snap = await userRef.collection("appState").doc(key).get();
  if (!snap.exists) return null;
  var data = snap.data();
  return { ref: snap.ref, value: data.value };
}

async function sendToUser(userRef, title, body) {
  var tokensSnap = await userRef.collection("fcmTokens").get();
  if (tokensSnap.empty) return;
  var deletions = [];
  for (var i = 0; i < tokensSnap.docs.length; i++) {
    var tokenDoc = tokensSnap.docs[i];
    try {
      await admin.messaging().send({
        token: tokenDoc.id,
        notification: { title: title, body: body },
        webpush: {
          notification: {
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 200, 100, 400],
            tag: "daybreak-alarm"
          },
          fcmOptions: { link: "https://daybreak-36be5.web.app/" }
        }
      });
    } catch (err) {
      var code = err && err.errorInfo && err.errorInfo.code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        deletions.push(tokenDoc.ref.delete());
      } else {
        console.error("send failed for", userRef.id, code || err.message);
      }
    }
  }
  await Promise.all(deletions);
}

async function processAlarms(userRef, now) {
  var doc = await getAppStateValue(userRef, "daybreak.alarms");
  if (!doc || !Array.isArray(doc.value)) return;
  var changed = false;
  for (var i = 0; i < doc.value.length; i++) {
    var a = doc.value[i];
    if (!a.enabled || !a.time) continue;
    var days = a.days && a.days.length ? a.days : null;
    var dueToday = days ? days.indexOf(now.dayIdx) !== -1 : true;
    if (!dueToday || !isDueNow(a.time, now.hhmm)) continue;
    var pushKey = now.date + "|" + a.time;
    if (a._pushSent === pushKey) continue;
    await sendToUser(userRef, "Alarm: " + (a.label || "Alarm"), a.time);
    a._pushSent = pushKey;
    changed = true;
  }
  if (changed) await doc.ref.update({ value: doc.value });
}

async function processReminders(userRef, now) {
  var doc = await getAppStateValue(userRef, "daybreak.reminders");
  if (!doc || !Array.isArray(doc.value)) return;
  var changed = false;
  for (var i = 0; i < doc.value.length; i++) {
    var r = doc.value[i];
    if (r.completed || r.skipped || !r.time || r.date !== now.date) continue;
    if (!isDueNow(r.time, now.hhmm)) continue;
    var pushKey = now.date + "|" + r.time;
    if (r._pushSent === pushKey) continue;
    await sendToUser(userRef, "Reminder: " + (r.title || "Reminder"), r.time);
    r._pushSent = pushKey;
    changed = true;
  }
  if (changed) await doc.ref.update({ value: doc.value });
}

async function processTasks(userRef, now) {
  var doc = await getAppStateValue(userRef, "daybreak.tasks");
  if (!doc || !Array.isArray(doc.value)) return;
  var changed = false;
  for (var i = 0; i < doc.value.length; i++) {
    var t = doc.value[i];
    if (!t.reminder || t.day !== now.dayIdx || !t.start) continue;
    if (!isDueNow(t.start, now.hhmm)) continue;
    var pushKey = now.date + "|" + t.start;
    if (t._pushSent === pushKey) continue;
    await sendToUser(userRef, "Task starting: " + (t.title || "Task"), DAY_NAMES[now.dayIdx] + " " + t.start);
    t._pushSent = pushKey;
    changed = true;
  }
  if (changed) await doc.ref.update({ value: doc.value });
}

async function main() {
  initAdmin();
  var db = admin.firestore();
  var now = nowInTZ();
  console.log("Checking at", now.date, now.hhmm, DAY_NAMES[now.dayIdx]);

  var userRefs = await db.collection("users").listDocuments();
  console.log("Users found:", userRefs.length);

  for (var i = 0; i < userRefs.length; i++) {
    var userRef = userRefs[i];
    try {
      await processAlarms(userRef, now);
      await processReminders(userRef, now);
      await processTasks(userRef, now);
    } catch (err) {
      console.error("Failed processing user", userRef.id, err);
    }
  }
  console.log("Done.");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
