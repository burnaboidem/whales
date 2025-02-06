const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(require('./service-account-key.json')),
        databaseURL: "https://whales-d0eeb-default-rtdb.firebaseio.com"
    });
}

const db = admin.database();

module.exports = { admin, db }; 