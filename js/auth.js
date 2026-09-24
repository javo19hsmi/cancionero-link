document.getElementById('login-trigger').onclick = () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(error => {
    console.warn("⚠️ Popup bloqueado por el navegador. Redirigiendo...", error);
    auth.signInWithRedirect(provider);
  });
};
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
      let canP = userRole === 'super_admin'; // Variable para permisos de oraciones
      
      let authorizedCommunities = []; 
      
      for (const [id, p] of Object.entries(perms)) {
        if (p.musica || p.admin) canS = true; 
        if (p.guiones || p.admin) canG = true; 
        if (p.oraciones || p.admin) canP = true; // Detecta si tiene acceso a oraciones en este nodo
        
        // Ahora evalúa si tiene anuncios, oraciones, guiones O admin para cargar la comunidad
        if (p.anuncios || p.oraciones || p.guiones || p.admin) {
            canA = true;
            let path = p.ruta_base ? p.ruta_base : `comunidades/${id}`;
            
            let nombreOficial = id; 
            try {
                const nameSnap = await db.ref(`${path}/nombre`).once('value');
                if (nameSnap.exists()) {
                    nombreOficial = nameSnap.val();
                }
            } catch(e) { 
                console.warn("No se pudo cargar el nombre de", path); 
            }
            
            authorizedCommunities.push({ id: id, path: path, nombre: nombreOficial });

            // 🏛️ SI ES ADMIN DE LA SEDE PRINCIPAL (No es un sub-nodo), LE DAMOS ACCESO A SUS CAPILLAS (SUB-NODOS)
            if (!path.includes('/sub_nodos/')) {
                try {
                    const subSnap = await db.ref(`${path}/sub_nodos`).once('value');
                    if (subSnap.exists()) {
                        const subData = subSnap.val() || {};
                        for (const [subId, subVal] of Object.entries(subData)) {
                            if (subVal && subVal.nombre) {
                                authorizedCommunities.push({
                                    id: subId,
                                    path: `${path}/sub_nodos/${subId}`,
                                    nombre: `🏛️ ${subVal.nombre}`
                                });
                            }
                        }
                    }
                } catch(e) {
                    console.warn("Error leyendo sub_nodos de", path, e);
                }
            }
        }
      }

      if (canS || canA || canG || canP) {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        document.getElementById('header-email').innerText = user.email;
        
        if (canS) document.getElementById('tab-songs').style.display = 'block';
        if (canA) document.getElementById('tab-announcements').style.display = 'block';
        if (canG) document.getElementById('tab-scripts').style.display = 'block';
        if (canP) document.getElementById('tab-prayers').style.display = 'block'; 
        if (canS && document.getElementById('tab-reports')) {
            document.getElementById('tab-reports').style.display = 'block';
        }
        
        // ⚡ BOTÓN SUBIR VERSIÓN PÚBLICA (Habilitado para Súper Admin Y Músico Editor / Editor Global)
        if (canS || userRole === 'super_admin') {
            if (document.getElementById('global-pub-btn')) {
                document.getElementById('global-pub-btn').style.display = 'block';
            }
        }

        // 📥 IMPORTADOR MASIVO Y HERRAMIENTAS EXCLUSIVAS DE SÚPER ADMIN
        if (userRole === 'super_admin') {
            if (document.getElementById('pencil-btn')) document.getElementById('pencil-btn').style.display = 'block';
            if (document.getElementById('batch-import-btn')) {
                document.getElementById('batch-import-btn').style.display = 'block';
            }
        }
        
        initApp(); 

        // --- INICIO INTEGRACIÓN DE ANUNCIOS ---
        if (canA && authorizedCommunities.length > 0) {
          try {
            if (typeof loadAnnouncementsModule === "function") {
               loadAnnouncementsModule(authorizedCommunities, userRole);
            }
          } catch (error) {
            console.error("Error al cargar módulo de anuncios:", error);
          }
        }
        // --- INICIO INTEGRACIÓN DE ORACIONES ---
        if (canP) { 
          try {
            if (typeof loadPrayersModule === "function") {
              loadPrayersModule(authorizedCommunities, 
                                typeof userRole !== 'undefined' ? userRole : 'fiel');            }
          } catch (error) {
            console.error("Error al cargar módulo de oraciones:", error);
          }
        }
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
