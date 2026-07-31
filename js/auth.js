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
      // 🚀 CAMBIO: Usamos for...of para poder usar 'await' y traer el nombre real
      for (const [id, p] of Object.entries(perms)) {
        if (p.musica || p.admin) canS = true; 
        if (p.guiones || p.admin) canG = true; 
        
        if (p.anuncios || p.admin) {
            canA = true;
            let path = p.ruta_base ? p.ruta_base : `comunidades/${id}`;
            
            // 🚀 MAGIA: Buscamos el nombre oficial de la comunidad en Firebase
            let nombreOficial = id; // Dejamos el ID por defecto por si algo falla
            try {
                const nameSnap = await db.ref(`${path}/nombre`).once('value');
                if (nameSnap.exists()) {
                    nombreOficial = nameSnap.val();
                }
            } catch(e) { 
                console.warn("No se pudo cargar el nombre de", path); 
            }
            
            // Agregamos la comunidad con su nombre real
            authorizedCommunities.push({ id: id, path: path, nombre: nombreOficial });
        }
      }

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
        // 🚀 --- INICIO INTEGRACIÓN DE ORACIONES ---
        if (canG || canA || canS) { // O la validación de permisos que uses para oraciones
          try {
            if (typeof loadPrayersModule === "function") {
               loadPrayersModule(authorizedCommunities, userRole);
            }
          } catch (error) {
            console.error("Error al cargar módulo de oraciones:", error);
          }
        }
        // 🚀 --- FIN INTEGRACIÓN DE ORACIONES ---

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
