/**
 * MY EXPO BAG — TEST-ONLY Firebase connection configuration.
 *
 * STEP 1: Create a completely separate Firebase PROJECT for testing.
 * STEP 2: Copy the WEB application config from its Firebase Console.
 * STEP 3: Replace ALL TEST_... placeholders below.
 *
 * Production connection is forbidden here by an explicit startup guard.
 * Firebase Web configuration values are public identifiers; NEVER paste
 * service-account JSON, private keys, Stripe secret keys or passwords.
 */
(function () {
  'use strict';
  
const config = {
  apiKey: 'AIzaSyBjegs2WBFIN_Lat1zXnSSMDCxk-c9SoJU',
  authDomain: 'my-expo-bag-test.firebaseapp.com',
  projectId: 'my-expo-bag-test',
  storageBucket: 'my-expo-bag-test.firebasestorage.app',
  messagingSenderId: '5179622848',
  appId: '1:5179622848:web:ec3efac8cbb9fabdd67425'
};


  const valid =
    config.apiKey.length > 15 && !config.apiKey.startsWith('TEST_') &&
    config.projectId.length > 3 && !config.projectId.startsWith('TEST_') &&
    config.appId.length > 15 && !config.appId.startsWith('TEST_') &&
    /^\d+$/.test(config.messagingSenderId) &&
    config.projectId !== 'my-expo-bag' &&
    config.apiKey !== 'AIzaSyC588bQ2a3xvoTLtTnT9OdQSHC_K2kHHfk' &&
    config.authDomain !== 'my-expo-bag.firebaseapp.com' &&
    config.authDomain === config.projectId + '.firebaseapp.com' &&
    config.storageBucket !== 'my-expo-bag.firebasestorage.app';

  if (valid) {
    window.MEB_FIREBASE_CONFIG = config;
  } else {
    window.MEB_FIREBASE_CONFIG = {};
    console.error('[MY EXPO BAG TEST] Test Firebase is not configured, or production settings were detected.');
  }

  // Permanent visible sign that users are on the test site, not production.
  document.addEventListener('DOMContentLoaded', function () {
    const flag = document.createElement('div');
    flag.id = 'meb-staging-flag';
    flag.setAttribute('aria-label', 'MY EXPO BAG テスト環境');
    flag.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:2147483000;pointer-events:none;border-radius:7px;padding:7px 10px;background:#17394a;color:white;font:700 11px/1.4 sans-serif;box-shadow:0 2px 10px #0003;opacity:.94';
    flag.textContent = 'MY EXPO BAG • TEST';
    document.body.appendChild(flag);
    const css = document.createElement('style');
    css.textContent = '@media print { #meb-staging-flag { display:none !important; } }';
    document.head.appendChild(css);
    if (!valid) {
      const warning = document.createElement('div');
      warning.setAttribute('role', 'alert');
      warning.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483001;background:#fff2e6;color:#8e300a;padding:12px;text-align:center;font:700 14px/1.6 sans-serif;border-bottom:2px solid #d46f29';
      warning.textContent = 'Firebaseテスト環境が未設定です。firebase-config.js をテスト専用の接続情報に変更してください。';
      document.body.appendChild(warning);
    }
  });
})();
