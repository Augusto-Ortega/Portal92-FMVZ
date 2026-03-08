import { useState, useEffect } from 'react';

// --- IMPORTAÇÃO DOS COMPONENTES ---
import Quiz from './Quiz'; 
import AdminPanel from './components/AdminPanel';
import FlashcardGame from './components/FlashcardGame';

// --- FIREBASE ---
import { auth, db, storage } from './firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { 
  doc, setDoc, collection, addDoc, query, orderBy, onSnapshot 
} from "firebase/firestore";
import { 
  ref, uploadBytes, getDownloadURL 
} from "firebase/storage";

// --- ESTILOS ---
import './App.css';

// --- CONSTANTE DE SEGURANÇA ---
const DOMINIO_INTERNO = "@portal92.fmvz";

// --- LISTA 1: MATÉRIAS COMPLEXAS (USP) ---
const MATERIAS_RAW = [
  "VNP0418 Agrostologia",
  "VCI0215 Anatomia Aplicada",
  "VCI0419 Anestesiologia e Técnicas de Terapia Intensiva no Paciente Cirúrgico",
  "VPS0427 Avaliação Científica de Bem-estar Animal",
  "VNP0330 Bioclimatologia Animal",
  "BMC0115 Biologia Celular, Tecidual I e do Desenvolvimento",
  "BMC0121 Biologia Celular, Tecidual II e do Desenvolvimento",
  "QBQ0116 Bioquímica: Estrutura de Biomoléculas e Metabolismo",
  "VRA0414 Biotecnologia da Reprodução",
  "VCI0516 Clínica Cirúrgica de Grandes Animais",
  "VCI0518 Clínica Cirúrgica de Pequenos Animais",
  "VCM0515 Clínica das Doenças Nutricionais e Metabólicas",
  "VCM0341 Clínica Médica de Eqüideos",
  "VCM0315 Clínica Médica de Pequenos Animais",
  "VCM0318 Clínica Médica de Ruminantes",
  "0100317 Deontologia em Medicina Veterinária",
  "VCI0513 Diagnóstico Por Imagem",
  "VNP0416 Economia Aplicada",
  "VPS0422 Epidemiologia das Doenças Infecciosas dos Animais Domésticos",
  "VPS0423 Epidemiologia das Doenças Parasitárias dos Animais Domésticos",
  "VPS0415 Epidemiologia Veterinária I",
  "VPS0418 Epidemiologia Veterinária II",
  "0100318 Estágio Curricular Obrigatório",
  "BMF0217 Farmacologia",
  "VPT0224 Farmacologia Aplicada à Medicina Veterinária",
  "VRA0222 Fisiologia da Reprodução",
  "BMB0127 Fisiologia I",
  "BMB0212 Fisiologia II",
  "BIO0225 Genética e Evolução",
  "VPS0425 Gerenciamento em Saúde Animal e Saúde Pública",
  "VPS0518 Higiene e Segurança Alimentar",
  "BMI0214 Imunologia",
  "VPS0520 Inspeção Sanitária dos Produtos de Origem Animal",
  "VRA0415 Manejo Reprodutivo em Animais Domésticos",
  "VNP0329 Melhoramento Animal",
  "BMM0412 Microbiologia Aplicada à Medicina Veterinária",
  "MAE0116 Noções de Estatística",
  "VNP0334 Nutrição Animal",
  "VRA0511 Obstetrícia",
  "VPT0317 Ornitopatologia",
  "Outros / Diversos",
  "BMP0222 Parasitologia Veterinária",
  "VPT0403 Patologia Animal",
  "VRA0413 Patologia Clínica da Reprodução",
  "VCM0311 Patologia Clínica Veterinária",
  "VPT0211 Patologia Geral",
  "VCM0316 Patologia Médica",
  "VNP0326 Produção de Aves",
  "VNP0338 Produção de Bovinos de Corte",
  "VNP0337 Produção de Bovinos de Leite",
  "VNP0336 Produção de Bufalos, Caprinos e Ovinos",
  "VNP0332 Produção de Eqüinos",
  "VNP0327 Produção de Suínos",
  "VNP0335 Programa de Alimentação Animal",
  "VPS0426 Sanidade Suína",
  "VCM0226 Semiologia",
  "VNP0415 Sociologia e Extensão",
  "VCI0421 Técnica Cirúrgica",
  "VNP0325 Tecnologia de Produtos de Origem Animal",
  "VPT0316 Toxicologia",
  "VPS0424 Zoonoses (saúde Pública Veterinária)"
].sort();

const parseMateria = (raw) => {
  const match = raw.match(/^([A-Z0-9]+)\s+(.*)$/);
  if (!match) return { original: raw, label: raw, clean: raw };
  return { 
    original: raw, 
    label: `${match[2]} (${match[1]})`, 
    clean: match[2] 
  };
};

const MATERIAS_OBJ = MATERIAS_RAW.map(parseMateria);

// --- LISTA 2: MATÉRIAS SIMPLES (GAMES) ---
const MATERIAS_SIMPLES = [
  "Anatomia", 
  "Histologia", 
  "Fisiologia", 
  "Patologia", 
  "Farmacologia", 
  "Imunologia",
  "Parasitologia",
  "Genética",
  "Microbiologia",
  "Bioquímica"
];

// =================================================================
// 1. SUB-COMPONENTE: LISTA GENÉRICA (Resumos, Slides com Paste Zone)
// =================================================================
const GenericList = ({ collectionName, title, icon, user, profile }) => {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Inputs de Upload
  const [materia, setMateria] = useState("");
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState(null);

  useEffect(() => {
    const q = query(collection(db, collectionName), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({id: d.id, ...d.data()})));
    });
    return () => unsub();
  }, [collectionName]);

  // --- NOVA FUNÇÃO: COLAR IMAGEM (CTRL+V) ---
  const handlePaste = (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      // Procura por imagem na área de transferência
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault(); // Impede colar o código binário no texto
        const blob = items[i].getAsFile();
        // Cria um nome fictício para o arquivo colado
        const pastedFile = new File([blob], `pasted_image_${Date.now()}.png`, { type: blob.type });
        setFile(pastedFile);
        // Feedback visual simples via Alert ou Toast seria ideal, mas aqui mudamos o input visualmente
        break;
      }
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if(!materia || !file) return alert("Preencha a matéria e anexe um arquivo.");
    
    setUploading(true);
    try {
       const storageRef = ref(storage, `${collectionName}/${user.uid}/${Date.now()}_${file.name}`);
       await uploadBytes(storageRef, file);
       const url = await getDownloadURL(storageRef);

       const docData = {
         materia,
         description: desc,
         fileUrl: url,
         slideUrl: url, 
         uploadedBy: profile.nickname,
         createdAt: new Date()
       };

       await addDoc(collection(db, collectionName), docData);
       
       alert("Enviado com sucesso!");
       setMateria(""); setDesc(""); setFile(null); setIsUploadOpen(false);
    } catch(err) {
       console.error(err);
       alert("Erro no upload: " + err.message);
    } finally {
       setUploading(false);
    }
  };

  return (
    <div>
       <div className="upload-accordion">
          <div className="upload-header" onClick={()=>setIsUploadOpen(!isUploadOpen)}>
             <h3>📥 Adicionar {title}</h3>
             <span className={`arrow-icon ${isUploadOpen?'open':''}`}>▶</span>
          </div>
          {isUploadOpen && (
             <div className="upload-body">
                <form onSubmit={handleUpload} style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                   <select value={materia} onChange={e=>setMateria(e.target.value)} required>
                       <option value="">Selecione a Matéria...</option>
                       {MATERIAS_OBJ.map(m=><option key={m.original} value={m.original}>{m.label}</option>)}
                   </select>
                   
                   {/* ÁREA DE TEXTO COM SUPORTE A PASTE */}
                   <textarea 
                      placeholder="Descrição... (Dica: Clique aqui e dê Ctrl+V para colar um print)" 
                      value={desc} 
                      onChange={e=>setDesc(e.target.value)}
                      onPaste={handlePaste} 
                      style={{minHeight:'80px', border: file ? '2px solid var(--usp-green)' : '1px solid #ccc'}}
                   />
                   
                   <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f9f9f9', padding:'10px', borderRadius:'4px'}}>
                      {/* INPUT DE ARQUIVO INTELIGENTE */}
                      <div style={{flex:1, marginRight:'10px'}}>
                        <input 
                          type="file" 
                          onChange={e=>setFile(e.target.files[0])} 
                          accept=".pdf,.ppt,.pptx,.doc,.docx,image/*"
                          style={{display: file ? 'none' : 'block'}} // Esconde se já tiver arquivo (ex: colado)
                        />
                        {file && (
                          <div style={{display:'flex', alignItems:'center', gap:'10px', fontSize:'0.9rem', color:'var(--usp-green)', fontWeight:'bold'}}>
                             📎 {file.name}
                             <button type="button" onClick={()=>setFile(null)} style={{background:'#e74c3c', color:'white', border:'none', borderRadius:'50%', width:'20px', height:'20px', cursor:'pointer', fontSize:'0.7rem'}}>X</button>
                          </div>
                        )}
                      </div>

                      <button className="btn-usp" disabled={uploading}>{uploading?"Enviando...":"Enviar"}</button>
                   </div>
                </form>
             </div>
          )}
       </div>

       <div style={{marginBottom:'25px'}}>
          <select value={filter} onChange={e=>setFilter(e.target.value)} style={{width:'100%', padding:'10px', borderRadius:'6px'}}>
              <option value="">Filtrar por Matéria...</option>
              {MATERIAS_OBJ.map(m=><option key={m.original} value={m.original}>{m.label}</option>)}
          </select>
       </div>

       <div className="provas-grid">
          {items.filter(i=>filter===""||i.materia===filter).map(i=>(
             <div key={i.id} className="prova-card">
                <div className="prova-img-container" style={{background:'#e3f2fd', flexDirection:'column', height:'140px'}}>
                    <span style={{fontSize:'3rem'}}>{icon}</span>
                    <a href={i.fileUrl || i.slideUrl} target="_blank" rel="noreferrer" className="btn-usp" style={{marginTop:'10px', padding:'5px 15px', fontSize:'0.8rem'}}>
                        Baixar Arquivo
                    </a>
                </div>
                <div className="prova-content">
                   <h4 style={{margin:'0 0 5px 0', color:'var(--usp-green)', fontSize:'1rem'}}>
                     {parseMateria(i.materia).label}
                   </h4>
                   {i.description && (
                      <div style={{background:'#f9f9f9', padding:'10px', borderRadius:'4px', fontSize:'0.85rem', color:'#444', marginBottom:'10px', maxHeight:'100px', overflowY:'auto'}}>
                         {i.description}
                      </div>
                   )}
                   <div style={{marginTop:'auto', paddingTop:'10px', borderTop:'1px solid #eee', fontSize:'0.75rem', color:'#aaa', textAlign:'right'}}>
                      Enviado por: <strong>{i.uploadedBy}</strong>
                   </div>
                </div>
             </div>
          ))}
          {items.length === 0 && <p style={{color:'#888', fontStyle:'italic', textAlign:'center', gridColumn:'1/-1'}}>Nenhum item encontrado.</p>}
       </div>
    </div>
  );
};

// =================================================================
// 2. SUB-COMPONENTE: REPOSITÓRIO DE LINKS
// =================================================================
const LinkRepo = ({ user, profile }) => {
   const [links, setLinks] = useState([]);
   const [filter, setFilter] = useState("");
   const [openId, setOpenId] = useState(null); 
   const [isUploadOpen, setIsUploadOpen] = useState(false);
   const [newLink, setNewLink] = useState({title:"", url:"", category:"site", materia:""});

   useEffect(() => {
      const q = query(collection(db, "links"), orderBy("createdAt", "desc"));
      const unsub = onSnapshot(q, (snap) => setLinks(snap.docs.map(d => ({id: d.id, ...d.data()}))));
      return () => unsub();
   }, []);

   const saveLink = async () => {
      if(!newLink.title || !newLink.url || !newLink.materia) return alert("Preencha todos os campos.");
      
      let urlFinal = newLink.url; 
      if (!urlFinal.startsWith('http')) urlFinal = 'https://' + urlFinal;

      try {
        await addDoc(collection(db, "links"), {
            ...newLink, 
            url: urlFinal,
            uploadedBy: profile.nickname, 
            createdAt: new Date()
        });
        alert("Link Salvo!"); 
        setIsUploadOpen(false); 
        setNewLink({title:"", url:"", category:"site", materia:""});
      } catch (err) {
        alert("Erro ao salvar link.");
      }
   };

   return (
      <div>
         <div className="upload-accordion">
            <div className="upload-header" onClick={()=>setIsUploadOpen(!isUploadOpen)}>
               <h3>🔗 Adicionar Link Útil</h3>
               <span className={`arrow-icon ${isUploadOpen?'open':''}`}>▶</span>
            </div>
            {isUploadOpen && (
               <div className="upload-body" style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                  <input placeholder="Título (Ex: Livro de Anatomia PDF)" value={newLink.title} onChange={e=>setNewLink({...newLink, title:e.target.value})} />
                  <input placeholder="URL (ex: www.site.com/livro)" value={newLink.url} onChange={e=>setNewLink({...newLink, url:e.target.value})} />
                  <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
                     <select value={newLink.materia} onChange={e=>setNewLink({...newLink, materia:e.target.value})} style={{flex:1, minWidth:'200px'}}>
                        <option value="">Matéria...</option>
                        {MATERIAS_OBJ.map(m=><option key={m.original} value={m.original}>{m.label}</option>)}
                     </select>
                     <select value={newLink.category} onChange={e=>setNewLink({...newLink, category:e.target.value})} style={{width:'150px'}}>
                        <option value="livro">📚 Livro</option>
                        <option value="video">🎥 Vídeo</option>
                        <option value="site">🌐 Site</option>
                        <option value="artigo">📑 Artigo</option>
                     </select>
                  </div>
                  <button className="btn-usp" onClick={saveLink}>Salvar Link</button>
               </div>
            )}
         </div>

         <div style={{marginBottom:'20px'}}>
            <select value={filter} onChange={e=>setFilter(e.target.value)} style={{width:'100%', padding:'10px'}}>
               <option value="">Filtrar Matéria...</option>
               {MATERIAS_OBJ.map(m=><option key={m.original} value={m.original}>{m.label}</option>)}
            </select>
         </div>
         
         {links.filter(l => filter === "" || l.materia === filter).map(l => (
            <div key={l.id} className="link-item">
               <div className="link-header" onClick={()=>setOpenId(openId===l.id?null:l.id)}>
                  <div style={{display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap'}}>
                     <span className={`link-tag tag-${l.category}`}>{l.category}</span>
                     <span>{l.title}</span>
                  </div>
                  <span>{openId===l.id?'▼':'▶'}</span>
               </div>
               {openId===l.id && (
                  <div className="link-content">
                     <p style={{margin:'0 0 10px 0', fontSize:'0.9rem', color:'#555'}}>Acesse:</p>
                     <a href={l.url} target="_blank" rel="noreferrer" style={{color:'var(--usp-green)', fontWeight:'bold', wordBreak:'break-all', textDecoration:'underline'}}>
                        {l.url}
                     </a>
                     <div style={{fontSize:'0.75rem', color:'#aaa', marginTop:'15px', borderTop:'1px solid #eee', paddingTop:'5px'}}>
                        Matéria: {parseMateria(l.materia).clean} • Por: {l.uploadedBy}
                     </div>
                  </div>
               )}
            </div>
         ))}
      </div>
   )
};

// =================================================================
// 3. APP PRINCIPAL
// =================================================================
function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("resumos"); 
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        onSnapshot(doc(db, "usuarios", currentUser.uid), (docSnap) => {
          if (docSnap.exists()) setProfile(docSnap.data());
          else setProfile(null); 
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleRegister = async (e) => {
      e.preventDefault();
      setAuthError("");
      const cleanNick = nickname.trim().replace(/\s/g, '');
      try {
          if(cleanNick.length < 4) throw new Error("Codinome curto demais (min 4 letras).");
          const email = `${cleanNick}${DOMINIO_INTERNO}`;
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          const newUserData = { nickname: cleanNick, status: "pendente", createdAt: new Date(), role: "student" };
          await setDoc(doc(db, "usuarios", userCredential.user.uid), newUserData);
          setProfile(newUserData); 
      } catch(err) {
          let msg = "Erro no registro.";
          if(err.message.includes("email-already")) msg = "Este Codinome já está em uso.";
          if(err.message.includes("weak-password")) msg = "A senha deve ter 6+ caracteres.";
          setAuthError(msg);
      }
  };

  const handleLogin = async (e) => {
      e.preventDefault(); setAuthError("");
      try {
          const email = `${nickname.trim()}${DOMINIO_INTERNO}`;
          await signInWithEmailAndPassword(auth, email, password);
      } catch(err) { setAuthError("Dados incorretos ou usuário inexistente."); }
  };

  const handleLogout = () => { signOut(auth); setProfile(null); };

  if(loading) return <div className="login-wrapper"><div style={{color:'white', fontWeight:'bold', fontSize:'1.2rem'}}>Carregando...</div></div>;

  if(!user) {
      return (
         <div className="login-wrapper">
            <div className="login-box">
               <img src="/logo.png" onError={(e)=>e.target.src='https://portal.fmvz.usp.br/images/logo_fmvz_usp.png'} alt="Logo" style={{maxWidth:'160px', marginBottom:'20px'}} />
               <h1 style={{color:'var(--usp-green)', margin:'0 0 10px 0', fontSize:'1.8rem'}}>Portal 92</h1>
               <p style={{color:'#333', marginBottom:'30px'}}>{isRegistering ? "Novo Agente" : "Área Restrita"}</p>
               <form onSubmit={isRegistering ? handleRegister : handleLogin}>
                   <div style={{textAlign:'left', marginBottom:'15px'}}>
                       <label style={{fontSize:'0.8rem', fontWeight:'bold', color:'#333'}}>CODINOME</label>
                       <input type="text" value={nickname} onChange={e=>setNickname(e.target.value)} required placeholder="Seu identificador" />
                   </div>
                   <div style={{textAlign:'left', marginBottom:'20px'}}>
                       <label style={{fontSize:'0.8rem', fontWeight:'bold', color:'#333'}}>SENHA</label>
                       <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="******" />
                   </div>
                   {authError && <div style={{color:'red', fontSize:'0.9rem', marginBottom:'15px', background:'#ffebee', padding:'10px', borderRadius:'4px'}}>{authError}</div>}
                   <button className="btn-primary">{isRegistering ? "CRIAR ACESSO" : "ENTRAR"}</button>
               </form>
               <p onClick={()=>setIsRegistering(!isRegistering)} style={{cursor:'pointer', marginTop:'20px', textDecoration:'underline', color:'var(--usp-green)', fontSize:'0.9rem'}}>{isRegistering ? "Voltar ao Login" : "Não tenho acesso"}</p>
            </div>
         </div>
      )
  }

  if(profile?.status === 'pendente') {
      return (
          <div className="login-wrapper">
              <div className="login-box">
                  <h1 style={{fontSize:'3rem', margin:0}}>🔒</h1>
                  <h2 style={{color:'#d35400'}}>Acesso em Análise</h2>
                  <p style={{color:'#333'}}>Olá, <strong>{profile.nickname}</strong>. Sua conta aguarda liberação dos administradores.</p>
                  <button className="btn-logout" onClick={handleLogout} style={{marginTop:'20px', width:'100%', justifyContent:'center'}}>Sair</button>
              </div>
          </div>
      )
  }

  const isAdmin = profile?.role === 'admin' || profile?.role === 'operator';

  return (
    <div style={{minHeight:'100vh', display:'flex', flexDirection:'column'}}>
      <header className="header-bg">
         <div className="center-wrapper header-content">
            <div className="logo-container">
               <img className="logo-fmvz" src="/logo.png" onError={(e)=>e.target.src='https://portal.fmvz.usp.br/images/logo_fmvz_usp.png'} alt="Logo" />
               <div className="logo-title"><h1>Portal 92</h1><span>FMVZ USP</span></div>
            </div>
            <div className="user-info">
               <div style={{textAlign:'right', marginRight:'15px'}}>
                   <strong>{profile?.nickname}</strong>
                   <div style={{fontSize:'0.7rem', color:'#666', textTransform:'uppercase'}}>{profile?.role}</div>
               </div>
               <button className="btn-logout" onClick={handleLogout}>SAIR</button>
            </div>
         </div>
      </header>

      <nav className="nav-bg">
         <div className="center-wrapper nav-content">
            <button className={`nav-btn ${view==='resumos'?'active':''}`} onClick={()=>setView('resumos')}>Resumos</button>
            <button className={`nav-btn ${view==='slides'?'active':''}`} onClick={()=>setView('slides')}>Slides</button>
            <button className={`nav-btn ${view==='flashcards'?'active':''}`} onClick={()=>setView('flashcards')}>Flashcards</button>
            <button className={`nav-btn ${view==='links'?'active':''}`} onClick={()=>setView('links')}>Links Úteis</button>
            <button className={`nav-btn ${view==='quiz'?'active':''}`} onClick={()=>setView('quiz')}>Quiz</button>
            
            {isAdmin && <button className={`nav-btn ${view==='admin'?'active':''}`} onClick={()=>setView('admin')} style={{marginLeft:'auto', color:'white', opacity:0.8}}>Admin</button>}
         </div>
      </nav>

      <div className="main-content">
         <div className="center-wrapper">
            {view === 'admin' && isAdmin && <AdminPanel userProfile={profile} />}
            {view === 'quiz' && <Quiz user={user} profile={profile} />}
            {view === 'flashcards' && <FlashcardGame user={user} profile={profile} materiasObj={MATERIAS_SIMPLES.map(m=>({original:m, label:m, clean:m}))} />}
            {view === 'links' && <LinkRepo user={user} profile={profile} />}
            {view === 'resumos' && <GenericList collectionName="resumos" title="Resumo" icon="📝" user={user} profile={profile} />}
            {view === 'slides' && <GenericList collectionName="slides" title="Slide" icon="📽️" user={user} profile={profile} />}
         </div>
      </div>
    </div>
  );
}

export default App;