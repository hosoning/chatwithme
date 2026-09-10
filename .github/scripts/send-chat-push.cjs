const admin = require('firebase-admin');

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT secret');
const credential = JSON.parse(raw);
admin.initializeApp({
  credential: admin.credential.cert(credential),
  databaseURL: 'https://chatwithme-6238a-default-rtdb.firebaseio.com'
});

const db = admin.database();
const now = Date.now();
const forcePush = process.env.FORCE_PUSH === 'true';
const hongKongHour = Number(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Hong_Kong', hour: '2-digit', hour12: false
}).format(new Date(now)));

function nextDelayMs() {
  return (45 + Math.floor(Math.random() * 136)) * 60 * 1000;
}

async function run() {
  if (!forcePush && hongKongHour >= 2 && hongKongHour < 8) return;
  const snapshot = await db.ref('push_devices').once('value');
  const devices = snapshot.val() || {};
  console.log(`Found ${Object.keys(devices).length} registered push device(s).`);
  let sent = 0;
  for (const [uid, device] of Object.entries(devices)) {
    if (!device?.enabled || !device?.autoMsg || !device?.token || (!forcePush && Number(device.nextPushAt || 0) > now)) continue;
    const contacts = Array.isArray(device.contacts) ? device.contacts.filter(c => c?.id) : [];
    if (!contacts.length) continue;
    const contact = contacts[Math.floor(Math.random() * contacts.length)];
    const triggerId = db.ref(`push_devices/${uid}/pending`).push().key;
    try {
      await admin.messaging().send({
        token: device.token,
        notification: { title: contact.name || '新消息', body: '发来一条消息' },
        data: { contactId: String(contact.id), triggerId: String(triggerId) },
        webpush: {
          notification: {
            icon: 'https://hosoning.github.io/chatwithme/icon/wechat-app-icon-192.png',
            badge: 'https://hosoning.github.io/chatwithme/icon/wechat-app-icon-192.png',
            tag: `chat-${contact.id}`
          },
          fcmOptions: { link: 'https://hosoning.github.io/chatwithme/?push=1' }
        }
      });
      await db.ref(`push_devices/${uid}`).update({
        [`pending/${triggerId}`]: { contactId: String(contact.id), createdAt: now },
        nextPushAt: now + nextDelayMs(),
        lastPushAt: now
      });
      sent += 1;
    } catch (error) {
      const code = String(error?.code || '');
      console.error(`Push failed for ${uid}:`, code || error?.message || error);
      if (/registration-token-not-registered|invalid-registration-token/.test(code)) {
        await db.ref(`push_devices/${uid}`).update({ enabled: false, disabledAt: now });
      }
    }
  }
  console.log(`Sent ${sent} proactive push notification(s).`);
}

run().then(() => process.exit(0)).catch(error => {
  console.error(error);
  process.exit(1);
});
