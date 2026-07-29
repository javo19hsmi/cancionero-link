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
      
      // 🚀 NUEVO: Array para guardar TODAS las comunidades autorizadas
      let authorizedCommunities = []; 
      
      // Procesamos los permisos extrayendo la clave y armando la ruta
      Object.entries(perms).forEach(([id, p]) => { 
        if (p.musica || p.admin) canS = true; 
        if (p.anuncios || p.admin) {
            canA = true;
            let path = "";
            
            // 🚀 LÓGICA DIRECTA: Usamos la ruta oficial guardada por la App
            if (p.ruta_base) {
                path = p.ruta_base;
            } else {
                // Modo rescate (por si quedó algún permiso viejísimo sin actualizar en la App)
                path = `comunidades/${id}`;
            }
            
            // Agregamos la comunidad y su ruta a la lista
            authorizedCommunities.push({ id: id, path: path });
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
               // 🚀 AHORA PASAMOS EL ARRAY COMPLETO DE COMUNIDADES
               loadAnnouncementsModule(authorizedCommunities, userRole);
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
