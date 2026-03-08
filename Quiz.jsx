import { useState, useEffect, useRef } from 'react';
import { db, storage } from './firebase';
import { 
  collection, 
  addDoc, 
  query, 
  getDocs, 
  where, 
  serverTimestamp 
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// --- LISTA DE MATÉRIAS (Sincronizada com o App.jsx) ---
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

export default function Quiz({ user, profile }) {
  // ==================================================================================
  // 1. ESTADOS GERAIS
  // ==================================================================================
  const [view, setView] = useState('menu'); // 'menu' | 'game' | 'result' | 'create'
  const [loading, setLoading] = useState(false);
  
  // --- ESTADOS DO JOGO ---
  const [questions, setQuestions] = useState([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [score, setScore] = useState(0);
  
  // Feedback Visual (Trava o clique e mostra cor)
  const [selectedOption, setSelectedOption] = useState(null); 
  const [isProcessing, setIsProcessing] = useState(false);

  // --- ESTADOS DE CRIAÇÃO (ADMIN) ---
  const [newQuestion, setNewQuestion] = useState({
    tipo: 'multipla',
    materia: '',
    pergunta: '',
    imagemPergunta: null, // URL final
    opcoes: [
      { texto: '', correta: false },
      { texto: '', correta: false },
      { texto: '', correta: false },
      { texto: '', correta: false }
    ],
    respostaDissertativa: ''
  });
  
  // Arquivo de imagem local (antes do upload)
  const [imageFile, setImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Permissões
  const canCreate = profile?.role === 'admin' || profile?.role === 'operator';

  // ==================================================================================
  // 2. FUNÇÕES DO JOGO (GAMEPLAY)
  // ==================================================================================

  // Carregar Perguntas do Firestore
  const loadQuiz = async (materia) => {
    setLoading(true);
    try {
      const q = query(collection(db, "quizzes"), where("materia", "==", materia));
      const snap = await getDocs(q);
      
      const data = snap.docs.map(d => ({
        id: d.id, 
        ...d.data()
      }));
      
      if (data.length === 0) {
        alert(`Nenhuma pergunta encontrada para ${materia}. Crie algumas no painel!`);
        setLoading(false);
        return;
      }

      // Embaralha as perguntas
      const shuffledQuestions = data.sort(() => 0.5 - Math.random());

      // Embaralha as opções de cada pergunta também (para não decorar posição)
      const sanitizedQuestions = shuffledQuestions.map(q => {
        if(q.tipo === 'multipla' && q.opcoes) {
           return { ...q, opcoes: q.opcoes.sort(() => 0.5 - Math.random()) };
        }
        return q;
      });

      setQuestions(sanitizedQuestions);
      setCurrentQIndex(0);
      setScore(0);
      setSelectedOption(null);
      setIsProcessing(false);
      setView('game');

    } catch (err) {
      console.error(err);
      alert("Erro ao carregar o quiz.");
    } finally {
      setLoading(false);
    }
  };

  // Processar Resposta (Com delay para feedback)
  const handleAnswer = (isCorrect, optionIndex) => {
    // Se já clicou, ignora (evita duplo clique)
    if (isProcessing) return;
    
    setIsProcessing(true);
    setSelectedOption(optionIndex); // Marca qual botão foi clicado para pintar

    if (isCorrect) {
      setScore(prev => prev + 1);
    }

    // Delay de 1.5s para o usuário ver se acertou (Verde) ou errou (Vermelho)
    setTimeout(() => {
      if (currentQIndex + 1 < questions.length) {
        setCurrentQIndex(prev => prev + 1);
        setSelectedOption(null);
        setIsProcessing(false);
      } else {
        setView('result');
      }
    }, 1500);
  };

  // ==================================================================================
  // 3. FUNÇÕES DE CRIAÇÃO (ADMIN) - PASTE ZONE
  // ==================================================================================

  // Lógica inteligente para colar imagem (Ctrl+V)
  const handlePasteImage = (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault(); // Impede colar o texto binário
        const blob = items[i].getAsFile();
        
        // Cria um arquivo com nome único
        const pastedFile = new File([blob], `quiz_paste_${Date.now()}.png`, { type: blob.type });
        setImageFile(pastedFile);
        
        // Feedback visual console
        console.log("Imagem colada com sucesso:", pastedFile.name);
        break; 
      }
    }
  };

  // Atualizar texto de uma opção específica
  const handleOptionChange = (index, text) => {
    const updatedOptions = [...newQuestion.opcoes];
    updatedOptions[index].texto = text;
    setNewQuestion({ ...newQuestion, opcoes: updatedOptions });
  };

  // Definir qual é a opção correta (Radio Button logic)
  const handleCorrectChange = (index) => {
    const updatedOptions = newQuestion.opcoes.map((opt, i) => ({
      ...opt,
      correta: i === index // Só o índice clicado vira true, resto false
    }));
    setNewQuestion({ ...newQuestion, opcoes: updatedOptions });
  };

  // Salvar no Firestore
  const handleSaveQuestion = async () => {
    // Validação Básica
    if (!newQuestion.materia) return alert("Selecione a Matéria.");
    if (!newQuestion.pergunta) return alert("Digite a Pergunta.");
    
    // Validação de Opções (se for múltipla escolha)
    if (newQuestion.tipo === 'multipla') {
      const temCorreta = newQuestion.opcoes.some(o => o.correta);
      const temVazias = newQuestion.opcoes.some(o => o.texto.trim() === "");
      if (!temCorreta) return alert("Marque qual é a alternativa correta.");
      if (temVazias) return alert("Preencha todas as alternativas.");
    }

    setUploading(true);

    try {
      let finalImageUrl = null;

      // 1. Upload da Imagem (se houver)
      if (imageFile) {
        const storageRef = ref(storage, `quiz_images/${user.uid}/${Date.now()}_${imageFile.name}`);
        await uploadBytes(storageRef, imageFile);
        finalImageUrl = await getDownloadURL(storageRef);
      }

      // 2. Montar Objeto Final
      const docData = {
        ...newQuestion,
        imagemPergunta: finalImageUrl,
        author: profile.nickname,
        createdAt: serverTimestamp()
      };

      // 3. Salvar
      await addDoc(collection(db, "quizzes"), docData);

      alert("Pergunta salva com sucesso!");

      // 4. Limpar Formulário (Reset Total)
      setNewQuestion({
        tipo: 'multipla',
        materia: newQuestion.materia, // Mantém a matéria para facilitar cadastros em série
        pergunta: '',
        imagemPergunta: null,
        opcoes: [
          { texto: '', correta: false },
          { texto: '', correta: false },
          { texto: '', correta: false },
          { texto: '', correta: false }
        ],
        respostaDissertativa: ''
      });
      setImageFile(null);

    } catch (err) {
      console.error(err);
      alert("Erro ao salvar pergunta: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  // ==================================================================================
  // 4. RENDERIZAÇÃO (VIEWS)
  // ==================================================================================

  // --- MENU PRINCIPAL ---
  if (view === 'menu') {
    return (
      <div className="card" style={{maxWidth:'800px', margin:'0 auto'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'30px', borderBottom:'1px solid #eee', paddingBottom:'15px'}}>
           <div>
             <h2 style={{margin:0, color:'#005c3e', fontSize:'2rem'}}>🧠 Quiz Master</h2>
             <span style={{color:'#666', fontSize:'0.9rem'}}>Escolha um tema para treinar</span>
           </div>
           {canCreate && (
             <button onClick={()=>setView('create')} className="btn-usp" style={{background:'#d35400', padding:'10px 20px', fontSize:'1rem'}}>
               + Nova Pergunta
             </button>
           )}
        </div>
        
        {loading ? (
          <div style={{textAlign:'center', padding:'40px', color:'#666'}}>Carregando banco de questões...</div>
        ) : (
           <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:'15px'}}>
              {MATERIAS_SIMPLES.map(m => (
                 <button 
                    key={m} 
                    onClick={()=>loadQuiz(m)} 
                    className="btn-usp" 
                    style={{
                      height:'100px', 
                      fontSize:'1.1rem', 
                      background:'#fff', 
                      color:'#333', 
                      border:'2px solid #eee',
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'center',
                      fontWeight:'bold',
                      boxShadow:'0 2px 5px rgba(0,0,0,0.05)'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.borderColor = '#005c3e'; e.currentTarget.style.color = '#005c3e'; }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = '#eee'; e.currentTarget.style.color = '#333'; }}
                 >
                    {m}
                 </button>
              ))}
           </div>
        )}
      </div>
    );
  }

  // --- TELA DE CRIAÇÃO (ADMIN) ---
  if (view === 'create') {
    return (
      <div className="card" style={{maxWidth:'700px', margin:'0 auto', background:'#fff'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
          <h3 style={{color:'#005c3e', marginTop:0, fontSize:'1.5rem'}}>Cadastrar Pergunta</h3>
          <button onClick={()=>setView('menu')} style={{background:'none', border:'none', color:'#c0392b', cursor:'pointer', textDecoration:'underline'}}>Cancelar</button>
        </div>
        
        {/* SELEÇÃO DE MATÉRIA */}
        <div style={{marginBottom:'20px'}}>
          <label style={{display:'block', fontWeight:'bold', marginBottom:'8px', color:'#333'}}>Matéria:</label>
          <select 
            value={newQuestion.materia} 
            onChange={e=>setNewQuestion({...newQuestion, materia: e.target.value})}
            style={{width:'100%', padding:'12px', borderRadius:'6px', border:'1px solid #ccc', background:'#fff', color:'#333'}}
          >
            <option value="">Selecione...</option>
            {MATERIAS_SIMPLES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* TEXTO DA PERGUNTA (COM PASTE ZONE) */}
        <div style={{marginBottom:'20px'}}>
          <label style={{display:'block', fontWeight:'bold', marginBottom:'8px', color:'#333'}}>
            Enunciado <span style={{fontWeight:'normal', fontSize:'0.8rem', color:'#666'}}>(Clique aqui e tecle Ctrl+V para colar prints)</span>:
          </label>
          <textarea 
            value={newQuestion.pergunta} 
            onChange={e=>setNewQuestion({...newQuestion, pergunta: e.target.value})}
            onPaste={handlePasteImage}
            placeholder="Digite a pergunta aqui..."
            style={{
              width:'100%', minHeight:'100px', padding:'15px', borderRadius:'6px', 
              border: imageFile ? '2px solid #2ecc71' : '1px solid #ccc',
              fontSize:'1rem', fontFamily:'inherit'
            }}
          />
        </div>

        {/* INPUT DE IMAGEM MANUAL E PREVIEW */}
        <div style={{marginBottom:'25px', background:'#f8f9fa', padding:'15px', borderRadius:'8px', border:'1px dashed #ccc'}}>
           <label style={{fontWeight:'bold', display:'block', marginBottom:'10px', color:'#555'}}>Anexo de Imagem (Opcional):</label>
           <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
             <input type="file" onChange={e => setImageFile(e.target.files[0])} accept="image/*" />
             {imageFile && (
               <span style={{color:'#27ae60', fontWeight:'bold', fontSize:'0.9rem'}}>
                 ✅ {imageFile.name} pronto
               </span>
             )}
           </div>
        </div>

        {/* TIPO DE QUESTÃO */}
        <div style={{marginBottom:'20px'}}>
          <label style={{fontWeight:'bold', color:'#333'}}>Tipo:</label>
          <select 
            value={newQuestion.tipo} 
            onChange={e=>setNewQuestion({...newQuestion, tipo: e.target.value})} 
            style={{marginLeft:'10px', padding:'8px', borderRadius:'4px'}}
          >
            <option value="multipla">Múltipla Escolha</option>
            <option value="dissertativa">Dissertativa (Texto)</option>
          </select>
        </div>

        {/* ALTERNATIVAS (SÓ SE FOR MULTIPLA) */}
        {newQuestion.tipo === 'multipla' && (
          <div style={{background:'#fafafa', padding:'20px', borderRadius:'8px', border:'1px solid #eee'}}>
            <label style={{fontWeight:'bold', display:'block', marginBottom:'15px', color:'#333'}}>Alternativas (Marque a bolinha da correta):</label>
            {newQuestion.opcoes.map((op, idx) => (
              <div key={idx} style={{display:'flex', gap:'10px', marginBottom:'12px', alignItems:'center'}}>
                <input 
                  type="radio" 
                  name="correta_grp" 
                  checked={op.correta} 
                  onChange={() => handleCorrectChange(idx)}
                  style={{transform:'scale(1.5)', cursor:'pointer'}}
                />
                <input 
                  type="text" 
                  value={op.texto} 
                  onChange={e => handleOptionChange(idx, e.target.value)}
                  placeholder={`Alternativa ${idx + 1}`}
                  style={{flex:1, padding:'10px', border:'1px solid #ddd', borderRadius:'4px'}}
                />
              </div>
            ))}
          </div>
        )}

        <div style={{display:'flex', gap:'15px', marginTop:'30px'}}>
          <button onClick={handleSaveQuestion} className="btn-primary" disabled={uploading}>
            {uploading ? "Enviando..." : "💾 SALVAR QUESTÃO"}
          </button>
        </div>
      </div>
    );
  }

  // --- JOGO (GAMEPLAY) ---
  if (view === 'game') {
    const q = questions[currentQIndex];
    const progress = Math.round(((currentQIndex) / questions.length) * 100);

    return (
      <div className="card" style={{maxWidth:'650px', margin:'0 auto', padding:'0', overflow:'hidden', background:'#fff'}}>
         
         {/* BARRA DE PROGRESSO */}
         <div style={{height:'6px', width:'100%', background:'#eee'}}>
            <div style={{height:'100%', width:`${progress}%`, background:'var(--usp-green)', transition:'width 0.3s'}} />
         </div>

         <div style={{padding:'30px'}}>
            {/* CABEÇALHO */}
            <div style={{display:'flex', justifyContent:'space-between', color:'#888', fontSize:'0.9rem', marginBottom:'20px', fontWeight:'600'}}>
               <span style={{textTransform:'uppercase'}}>{q.materia}</span>
               <span>Questão {currentQIndex+1} de {questions.length}</span>
            </div>

            {/* IMAGEM DA QUESTÃO */}
            {q.imagemPergunta && (
              <div style={{textAlign:'center', marginBottom:'25px', background:'#f9f9f9', borderRadius:'8px', padding:'10px'}}>
                <img 
                  src={q.imagemPergunta} 
                  style={{maxWidth:'100%', maxHeight:'300px', objectFit:'contain', borderRadius:'4px'}} 
                  alt="Pergunta"
                />
              </div>
            )}

            {/* PERGUNTA */}
            <h3 style={{fontSize:'1.3rem', marginBottom:'30px', color:'#333', lineHeight:'1.5'}}>
              {q.pergunta}
            </h3>

            {/* OPÇÕES */}
            <div style={{display:'grid', gap:'12px'}}>
              {q.opcoes.map((op, idx) => {
                
                // Lógica de Cores para Feedback
                let bgColor = '#f8f9fa';
                let borderColor = '#e9ecef';
                let textColor = '#333';

                // Se já cliquei em alguma coisa (processando)
                if (selectedOption !== null) {
                   // Se essa é a opção correta, fica verde
                   if (op.correta) {
                      bgColor = '#d4edda'; 
                      borderColor = '#28a745';
                      textColor = '#155724';
                   }
                   // Se eu cliquei nessa e ela é errada, fica vermelha
                   else if (selectedOption === idx && !op.correta) {
                      bgColor = '#f8d7da';
                      borderColor = '#dc3545';
                      textColor = '#721c24';
                   }
                   // As outras ficam transparentes/opacas
                   else {
                      bgColor = '#fff';
                      textColor = '#aaa';
                   }
                }

                return (
                  <button 
                      key={idx}
                      disabled={isProcessing}
                      onClick={() => handleAnswer(op.correta, idx)}
                      style={{
                        background: bgColor, 
                        color: textColor, 
                        border: `2px solid ${borderColor}`, 
                        textAlign:'left', 
                        padding:'18px 20px',
                        borderRadius:'8px',
                        fontSize:'1rem',
                        cursor: isProcessing ? 'default' : 'pointer',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        pointerEvents: isProcessing ? 'none' : 'auto'
                      }}
                  >
                    {op.texto}
                  </button>
                )
              })}
            </div>
         </div>
      </div>
    )
  }

  // --- RESULTADO ---
  if (view === 'result') {
    const percentage = Math.round((score / questions.length) * 100);
    let message = "Continue estudando!";
    let color = "#e67e22";

    if (percentage === 100) { message = "Perfeito! Você é um mestre."; color = "#27ae60"; }
    else if (percentage >= 70) { message = "Muito bom! Ótimo desempenho."; color = "#2ecc71"; }
    else if (percentage < 50) { message = "Precisa revisar mais."; color = "#c0392b"; }

    return (
      <div className="card" style={{textAlign:'center', padding:'60px 30px', maxWidth:'500px', margin:'0 auto'}}>
        <h2 style={{margin:0, color:'#333'}}>Quiz Finalizado</h2>
        
        <div style={{fontSize:'5rem', fontWeight:'900', color: color, margin:'20px 0'}}>
          {percentage}%
        </div>
        
        <p style={{fontSize:'1.2rem', color:'#555', marginBottom:'10px'}}>
          Você acertou <strong>{score}</strong> de <strong>{questions.length}</strong> questões.
        </p>
        
        <div style={{fontWeight:'bold', color: color, marginBottom:'40px', fontSize:'1.1rem'}}>
          {message}
        </div>

        <button onClick={()=>setView('menu')} className="btn-primary">
          Voltar ao Menu
        </button>
      </div>
    )
  }

  return <div style={{textAlign:'center', padding:'20px'}}>Carregando...</div>;
}