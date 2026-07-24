const firebaseConfig = {
  apiKey: "AIzaSyBYAV2LTgrNQnE3-5wafXQy7H7dj7oyWtI",
  authDomain: "cancionero-parroquial-269d0.firebaseapp.com",
  databaseURL: "https://cancionero-parroquial-269d0-default-rtdb.firebaseio.com",
  projectId: "cancionero-parroquial-269d0",
  storageBucket: "cancionero-parroquial-269d0.firebasestorage.app",
  messagingSenderId: "485257131926",
  appId: "1:485257131926:web:fb24321bad9f8dd2f00fb7",
  measurementId: "G-QJWX3YXJ9S"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// Variables globales del sistema (se usan en auth y editor)
let userRole = 'fiel';
