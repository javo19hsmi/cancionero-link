document.getElementById('login-trigger').onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
const logout = () => auth.signOut();

auth.onAuthStateChanged(async user => {
  if (user) {
    setBusy(true, "Validando...");
    const snap = await db.ref(`usuarios/${user.email.replace(/\./g, '_')}`).get();
    
    if (snap.exists()) {
      const data = snap.val();
      const perms = data.accesos || {};
      userRole = data.rol || 'fiel';
      
      let canS = data.es_editor_global || userRole === 'super_admin';
      let canA = userRole === 'super_admin';
      let canG = userRole === 'super_admin';
      
      Object.values(perms).forEach(p => { 
        if (p.musica || p.admin) canS = true; 
        if (p.anuncios || p.admin) canA = true; 
        if (p.guiones || p.admin) canG = true; 
      });

      if (canS || canA || canG) {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        document.getElementById('header-email').innerText = user.email;
        
        if (canS) document.getElementById('tab-songs').style.display = 'block';
        if (canA) document.getElementById('tab-announcements').style.display = 'block';
        if (canG) { 
          document.getElementById('tab-prayers').style.display = 'block'; 
          document.getElementById('tab-scripts').style.display = 'block'; 
        }
        
        if (userRole === 'super_admin') { 
          document.getElementById('pencil-btn').style.display = 'block'; 
          document.getElementById('global-pub-btn').style.display = 'block'; 
        }
        
        initApp(); // Llamada a la función principal del editor
      } else { 
        alert("Sin permisos."); 
        auth.signOut(); 
      }
    } else { 
      alert("No registrado."); 
      auth.signOut(); 
    }
    setBusy(false);
  } else { 
    document.getElementById('login-overlay').style.display = 'flex'; 
    document.getElementById('app').style.display = 'none'; 
  }
});
