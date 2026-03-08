import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc } from "firebase/firestore";

export default function FlashcardGame({ user, profile, materiasObj }) {
  // --- ESTADOS DO JOGO ---
  const [mode, setMode] = useState('menu'); // menu | game | create | result
  const [deck, setDeck] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });
  const [loading, setLoading] = useState(false);

  // --- ESTADOS DE CRIAÇÃO ---
  const [newMateria, setNewMateria] = useState("");
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");

  // --- FÍSICA E GESTOS (SWIPE) ---
  const [swipeX, setSwipeX] = useState(0); // Posição horizontal
  const [isDragging, setIsDragging] = useState(false); // Se está arrastando
  const startX = useRef(0); // Onde o toque começou
  const startTime = useRef(0); // Quando o toque começou (para detectar clique rápido)

  // Permissões
  const canCreate = profile?.role === 'admin' || profile?.role === 'operator';

  // --- LÓGICA: CARREGAR BARALHO ---
  const loadDeck = async (materiaOriginal) => {
    setLoading(true);
    try {
      // Busca no banco pela string original (ex: "VCI0215 Anatomia")
      const q = query(collection(db, "flashcards"), where("materia", "==", materiaOriginal));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({id: d.id, ...d.data()}));
      
      if (data.length === 0) {
        alert("Nenhum card encontrado para esta matéria.");
        setLoading(false);
        return;
      }
      
      // Embaralha
      setDeck(data.sort(() => Math.random() - 0.5));
      setCurrentIndex(0);
      setStats({ correct: 0, wrong: 0 });
      setIsFlipped(false);
      setSwipeX(0);
      setMode('game');
    } catch (err) {
      console.error(err);
      alert("Erro ao carregar baralho.");
    } finally {
      setLoading(false);
    }
  };

  // --- LÓGICA: RESPONDER ---
  const handleAnswer = (isCorrect) => {
    // Computa estatística
    setStats(prev => ({
      correct: isCorrect ? prev.correct + 1 : prev.correct,
      wrong: !isCorrect ? prev.wrong + 1 : prev.wrong
    }));

    // Animação de saída (joga o card longe)
    setSwipeX(isCorrect ? 600 : -600); 
    
    // Pequeno delay para o próximo card
    setTimeout(() => {
      setIsFlipped(false); // Reseta o giro
      setSwipeX(0);        // Reseta a posição
      
      if (currentIndex + 1 < deck.length) {
        setCurrentIndex(curr => curr + 1);
      } else {
        setMode('result');
      }
    }, 250);
  };

  // --- LÓGICA: CRIAR NOVO CARD ---
  const handleCreate = async () => {
    if(!newFront || !newBack || !newMateria) return alert("Preencha todos os campos.");
    setLoading(true);
    try {
      await addDoc(collection(db, "flashcards"), {
        front: newFront, 
        back: newBack, 
        materia: newMateria,
        createdAt: new Date(), 
        author: profile.nickname
      });
      alert("Card criado com sucesso!");
      setNewFront(""); setNewBack(""); // Limpa campos
    } catch(err) {
      alert("Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  };

  // --- ENGINE DE FÍSICA UNIFICADA (Touch & Mouse) ---
  
  const handleStart = (clientX) => {
    setIsDragging(true);
    startX.current = clientX;
    startTime.current = Date.now();
  };

  const handleMove = (clientX) => {
    if (!isDragging) return;
    const currentX = clientX;
    const delta = currentX - startX.current;
    setSwipeX(delta);
  };

  const handleEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const distance = swipeX;
    const timeTaken = Date.now() - startTime.current;

    // 1. SWIPE (Arraste Longo)
    if (Math.abs(distance) > 100) {
      // Direita (>100) = Acerto, Esquerda (<-100) = Erro
      handleAnswer(distance > 0);
    } 
    // 2. CLIQUE (Movimento curto e rápido)
    else if (Math.abs(distance) < 10 && timeTaken < 300) {
      setIsFlipped(prev => !prev);
      setSwipeX(0); // Garante que volta pro centro exato
    } 
    // 3. ARRASTE INCOMPLETO (Volta pro meio)
    else {
      setSwipeX(0);
    }
  };

  // Eventos de Mouse (PC)
  const onMouseDown = (e) => handleStart(e.clientX);
  const onMouseMove = (e) => handleMove(e.clientX);
  const onMouseUp = () => handleEnd();
  const onMouseLeave = () => { if(isDragging) handleEnd(); }; 

  // Eventos de Toque (Celular)
  const onTouchStart = (e) => handleStart(e.targetTouches[0].clientX);
  const onTouchMove = (e) => handleMove(e.targetTouches[0].clientX);
  const onTouchEnd = () => handleEnd();

  // --- ATALHOS DE TECLADO ---
  useEffect(() => {
    if (mode !== 'game') return;
    const handleKey = (e) => {
      if (e.code === 'Space') setIsFlipped(p => !p);
      if (e.code === 'ArrowRight') handleAnswer(true);
      if (e.code === 'ArrowLeft') handleAnswer(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, currentIndex]);

  // =========================================================
  // RENDERIZAÇÃO
  // =========================================================

  // 1. MENU
  if (mode === 'menu') {
    return (
      <div className="card">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
          <div>
            <h2 style={{margin:0, color:'var(--usp-green)'}}>🗂️ Flashcards</h2>
            <p style={{margin:0, color:'#666', fontSize:'0.9rem'}}>Treino de Memória Ativa</p>
          </div>
          {canCreate && (
            <button onClick={()=>setMode('create')} className="btn-usp" style={{background:'#d35400'}}>
              + Criar
            </button>
          )}
        </div>

        {loading ? <div style={{textAlign:'center', padding:'20px'}}>Carregando baralhos...</div> : (
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:'15px'}}>
            {materiasObj.map(m => (
              <button 
                key={m.original} 
                onClick={()=>loadDeck(m.original)} 
                style={{
                  padding:'25px', background:'#fff', border:'1px solid #e0e0e0', borderRadius:'8px', 
                  cursor:'pointer', fontSize:'1rem', fontWeight:'600', color:'#333',
                  boxShadow:'0 2px 5px rgba(0,0,0,0.05)', transition:'all 0.2s', textAlign:'center'
                }}
                onMouseOver={e => {e.currentTarget.style.borderColor='#005c3e'; e.currentTarget.style.transform='translateY(-2px)'}}
                onMouseOut={e => {e.currentTarget.style.borderColor='#e0e0e0'; e.currentTarget.style.transform='translateY(0)'}}
              >
                {/* MOSTRA O NOME LIMPO (Sem código) */}
                {m.clean}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 2. CRIAÇÃO
  if (mode === 'create') {
    return (
      <div className="card" style={{maxWidth:'600px', margin:'0 auto'}}>
        <h3 style={{color:'var(--usp-green)', marginTop:0}}>Novo Flashcard</h3>
        
        <label style={{fontSize:'0.8rem', fontWeight:'bold', color:'#666'}}>MATÉRIA</label>
        <select value={newMateria} onChange={e=>setNewMateria(e.target.value)} style={{marginBottom:'15px'}}>
          <option value="">Selecione...</option>
          {materiasObj.map(m=><option key={m.original} value={m.original}>{m.label}</option>)}
        </select>

        <label style={{fontSize:'0.8rem', fontWeight:'bold', color:'#666'}}>FRENTE (PERGUNTA)</label>
        <textarea 
          value={newFront} onChange={e=>setNewFront(e.target.value)} 
          style={{minHeight:'100px', marginBottom:'15px', fontSize:'1.1rem'}} 
          placeholder="Digite a pergunta ou termo..."
        />

        <label style={{fontSize:'0.8rem', fontWeight:'bold', color:'#666'}}>VERSO (RESPOSTA)</label>
        <textarea 
          value={newBack} onChange={e=>setNewBack(e.target.value)} 
          style={{minHeight:'100px', marginBottom:'20px', fontSize:'1.1rem'}} 
          placeholder="Digite a resposta ou definição..."
        />

        <div style={{display:'flex', gap:'10px'}}>
          <button onClick={handleCreate} className="btn-usp" style={{flex:1}} disabled={loading}>
            {loading ? "Salvando..." : "Salvar Card"}
          </button>
          <button onClick={()=>setMode('menu')} className="btn-usp" style={{background:'#ccc', color:'#333'}}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // 3. RESULTADO
  if (mode === 'result') {
    const total = stats.correct + stats.wrong;
    const percentage = total === 0 ? 0 : Math.round((stats.correct / total) * 100);
    
    return (
      <div className="card" style={{textAlign:'center', padding:'50px'}}>
        <h2 style={{color:'#333'}}>Sessão Finalizada</h2>
        <div style={{fontSize:'5rem', fontWeight:'bold', color: percentage >= 70 ? '#27ae60' : '#e74c3c', margin:'20px 0'}}>
          {percentage}%
        </div>
        <p style={{fontSize:'1.2rem', color:'#555'}}>
          Você acertou <strong>{stats.correct}</strong> de <strong>{total}</strong> cards.
        </p>
        <button onClick={()=>setMode('menu')} className="btn-usp" style={{marginTop:'30px', fontSize:'1.1rem'}}>
          Voltar ao Menu
        </button>
      </div>
    );
  }

  // 4. JOGO (GAMEPLAY)
  const card = deck[currentIndex];
  // Pega o nome limpo da matéria atual para exibir no topo
  const cleanTitle = materiasObj.find(m => m.original === card.materia)?.clean || card.materia;

  // Cor de fundo dinâmica baseada no arraste
  let bgStatus = 'transparent';
  if (swipeX > 50) bgStatus = 'rgba(46, 204, 113, 0.2)'; // Verde (Direita)
  if (swipeX < -50) bgStatus = 'rgba(231, 76, 60, 0.2)'; // Vermelho (Esquerda)

  return (
    <div style={{maxWidth:'500px', margin:'0 auto', userSelect:'none'}}>
      
      {/* CABEÇALHO DO JOGO */}
      <div style={{marginBottom:'20px'}}>
        <div style={{display:'flex', justifyContent:'space-between', color:'#888', fontSize:'0.85rem', marginBottom:'5px', fontWeight:'600'}}>
          <span>{cleanTitle.toUpperCase()}</span>
          <span>{currentIndex + 1} / {deck.length}</span>
        </div>
        {/* Barra de Progresso */}
        <div style={{width:'100%', height:'6px', background:'#e0e0e0', borderRadius:'3px', overflow:'hidden'}}>
          <div style={{
            width: `${((currentIndex + 1) / deck.length) * 100}%`, 
            height:'100%', 
            background:'var(--usp-green)',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* ÁREA DO CARD (CENA 3D) */}
      <div className="flashcard-scene" style={{position:'relative', height:'380px'}}>
        
        {/* Fundo colorido que aparece ao arrastar */}
        <div style={{
          position:'absolute', top:0, left:0, width:'100%', height:'100%', 
          background: bgStatus, borderRadius:'15px', transition:'background 0.2s', pointerEvents:'none'
        }} />

        <div 
          className={`flashcard-inner ${isFlipped ? 'flipped' : ''}`}
          style={{
            transform: `translateX(${swipeX}px) rotate(${swipeX * 0.05}deg) ${isFlipped ? 'rotateY(180deg)' : ''}`,
            cursor: isDragging ? 'grabbing' : 'grab',
            transition: isDragging ? 'none' : 'transform 0.4s ease-out' // Sem delay se estiver arrastando
          }}
          // Eventos PC
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          // Eventos Mobile
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* FRENTE DO CARD */}
          <div className="flashcard-front">
            <span style={{fontSize:'2.5rem', color:'var(--usp-green)', marginBottom:'20px'}}>?</span>
            <div style={{fontSize:'1.4rem', lineHeight:'1.5', color:'#333'}}>{card.front}</div>
            <span style={{position:'absolute', bottom:'20px', fontSize:'0.75rem', color:'#aaa', textTransform:'uppercase', letterSpacing:'1px', fontWeight:'600'}}>
              Toque ou Clique para Girar
            </span>
          </div>

          {/* VERSO DO CARD */}
          <div className="flashcard-back">
            <span style={{fontSize:'2.5rem', marginBottom:'20px'}}>💡</span>
            <div style={{fontSize:'1.3rem', lineHeight:'1.5'}}>{card.back}</div>
          </div>
        </div>
      </div>

      {/* BOTÕES DE CONTROLE */}
      <div className="flashcard-controls">
        <button 
          className="btn-fc miss" 
          onClick={() => handleAnswer(false)} 
          title="Não sei (Esquerda)"
        >
          ✕
        </button>
        
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontSize:'0.75rem', color:'#999'}}>
          <span className="desktop-only">Setas ou Mouse</span>
          <span className="mobile-only">Deslize o Card</span>
        </div>

        <button 
          className="btn-fc hit" 
          onClick={() => handleAnswer(true)} 
          title="Sei (Direita)"
        >
          ✓
        </button>
      </div>

    </div>
  );
}