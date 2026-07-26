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
      
      // Variable para guardar la ruta física de la comunidad del usuario
      let communityPath = ""; 
      
      // Procesamos los permisos extrayendo la clave de la comunidad (ej: pst_001 o pst_001_cap_01)
      Object.entries(perms).forEach(([id, p]) => { 
        if (p.musica || p.admin) canS = true; 
        if (p.anuncios || p.admin) {
            canA = true;
            // Si el ID tiene guiones bajos, es una capilla y armamos la subruta
            if (id.includes('_cap_')) {
                const parts = id.split('_cap_');
                communityPath = `comunidades/${parts[0]}/sub_nodos/${id}`;
            } else {
                // Es una parroquia principal
                communityPath = `comunidades/${id}`;
            }
        }
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

        // --- INICIO INTEGRACIÓN DE ANUNCIOS ---
        if (canA) {
          try {
            if (typeof loadAnnouncementsModule === "function") {
               // Disparamos el módulo pasándole la ruta exacta que calculamos arriba
               loadAnnouncementsModule(communityPath);
            }
          } catch (error) {
            console.error("Error al cargar módulo de anuncios:", error);
          }
        }
        // --- FIN INTEGRACIÓN DE ANUNCIOS ---

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
