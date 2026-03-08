import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { 
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, 
  query, where, getDocs, orderBy, serverTimestamp 
} from "firebase/firestore";

export default function BattleArena({ user, profile, materiasSimples }) {
  // --- ESTADOS ---
  const [view, setView] = useState('lobby'); 
  const [battles, setBattles] = useState([]);
  const [currentBattle, setCurrentBattle] = useState(null);
  
  // Config
  const [config, setConfig] = useState({ materia: "", qtd: 5 });
  const [isCreating, setIsCreating] = useState(false);

  // --- ESTADOS VISUAIS (Sem lógica pesada) ---
  // null = não respondeu, true = acertou, false = errou
  const [localFeedback, setLocalFeedback] = useState(null); 
  const [timerDisplay, setTimerDisplay] = useState(20);

  // --- TRAVA DE SEGURANÇA (Ref não causa re-render) ---
  const isProcessingClick = useRef(false);

  // Permissões
  const isAdmin = profile?.role === 'admin' || profile?.role === 'operator';

  // =================================================================
  // 1. LISTENERS
  // =================================================================

  // Listener do Lobby
  useEffect(() => {
    if (view !== 'lobby') return;
    
    // Query simples e direta
    const q = query(
      collection(db, "battles"), 
      where("status", "in", ["waiting", "active"]), 
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setBattles(snap.docs.map(d => ({id: d.id, ...d.data()})));
    }, (error) => {
      console.log("Aviso: Se a lista não aparecer, verifique o índice no console.", error);
    });
    
    return () => unsub();
  }, [view]);

  // Listener da Sala (Gameplay)
  useEffect(() => {
    if (!currentBattle?.id) return;

    const unsub = onSnapshot(doc(db, "battles", currentBattle.id), (docSnap) => {
      if(!docSnap.exists()) {
        alert("Batalha encerrada.");
        handleExit();
        return;
      }
      
      const data = docSnap.data();
      
      // Atualiza dados
      setCurrentBattle(prev => ({ id: docSnap.id, ...data }));

      // Fim de jogo
      if (data.status === 'finished') setView('result');

      // Nova Pergunta Detectada? Destrava tudo.
      if (currentBattle && data.currentQIndex !== currentBattle.currentQIndex) {
        isProcessingClick.current = false;
        setLocalFeedback(null);
        setTimerDisplay(20);
      }
    });
    return () => unsub();
  }, [currentBattle?.id]);

  // Timer Otimizado (Roda a cada 1s apenas para evitar travamento)
  useEffect(() => {
    if (view === 'room' && currentBattle?.status === 'active' && !localFeedback) {
      const interval = setInterval(() => {
        const now = Date.now();
        const start = currentBattle.questionStartTime || now;
        const diff = Math.floor((now - start) / 1000);
        const val = Math.max(10, 20 - diff);
        setTimerDisplay(val);
      }, 1000); // Atualiza só 1 vez por segundo
      return () => clearInterval(interval);
    }
  }, [view, currentBattle, localFeedback]);

  // =================================================================
  // 2. AÇÕES
  // =================================================================

  const handleCreate = async () => {
    if (!config.materia) return alert("Selecione a matéria!");
    setIsCreating(true);
    try {
      // Busca perguntas
      const q = query(collection(db, "quizzes"), where("materia", "==", config.materia));
      const snap = await getDocs(q);
      const allQs = snap.docs.map(d => d.data()).filter(q => q.tipo === 'multipla');

      if (allQs.length < config.qtd) {
        alert(`Erro: Apenas ${allQs.length} questões encontradas. Crie mais.`);
        setIsCreating(false); return;
      }

      // Sorteia
      const selectedQs = allQs.sort(() => 0.5 - Math.random()).slice(0, parseInt(config.qtd));

      const roomData = {
        hostId: user.uid, hostName: profile.nickname, materiaName: config.materia,
        status: 'waiting', createdAt: serverTimestamp(),
        questions: selectedQs, totalQuestions: selectedQs.length,
        currentQIndex: 0, scores: { [user.uid]: 0 }, answers: {},
        questionStartTime: Date.now()
      };

      const ref = await addDoc(collection(db, "battles"), roomData);
      
      // Reseta local
      isProcessingClick.current = false;
      setLocalFeedback(null);
      
      // Entra forçado
      setCurrentBattle({ id: ref.id, ...roomData });
      setView('room');

    } catch (e) { alert("Erro ao criar."); } finally { setIsCreating(false); }
  };

  const handleJoin = async (battleId) => {
    try {
      await updateDoc(doc(db, "battles", battleId), {
        guestId: user.uid, guestName: profile.nickname, status: 'active',
        [`scores.${user.uid}`]: 0, questionStartTime: Date.now()
      });
      isProcessingClick.current = false;
      setLocalFeedback(null);
      setCurrentBattle({ id: battleId }); setView('room');
    } catch (e) { alert("Erro ao entrar."); }
  };

  const handleDelete = async (battleId, e) => {
    e.stopPropagation();
    if(confirm("Excluir sala?")) await deleteDoc(doc(db, "battles", battleId));
  };

  const handleExit = () => {
    setCurrentBattle(null); setLocalFeedback(null); isProcessingClick.current = false; setView('lobby');
  };

  // =================================================================
  // 3. ENGINE DE RESPOSTA (BLINDADA)
  // =================================================================

  const handleAnswer = async (isCorrect) => {
    // 1. TRAVA IMEDIATA (Ref)
    if (isProcessingClick.current) return; // Se já clicou, ignora
    isProcessingClick.current = true; // Trava

    // 2. Feedback Visual Imediato
    setLocalFeedback(isCorrect); 

    try {
      const battleRef = doc(db, "battles", currentBattle.id);
      const myId = user.uid;
      const oppId = currentBattle.hostId === myId ? currentBattle.guestId : currentBattle.hostId;

      // 3. Cálculo de Pontos
      const now = Date.now();
      const start = currentBattle.questionStartTime || now;
      const diff = (now - start) / 1000;
      const points = isCorrect ? Math.max(10, Math.round(20 - diff)) : 0;

      // 4. Envia ao Banco
      await updateDoc(battleRef, { [`answers.${myId}`]: { correct: isCorrect, points } });

      // 5. Verifica Oponente (Sincronia)
      const currentAns = currentBattle.answers || {};
      const allAns = { ...currentAns, [myId]: { correct: isCorrect, points } };

      if (oppId && allAns[oppId]) {
        // Ambos responderam -> Calcula próxima fase
        const myTotal = (currentBattle.scores[myId] || 0) + allAns[myId].points;
        const oppTotal = (currentBattle.scores[oppId] || 0) + allAns[oppId].points;
        const nextScores = { ...currentBattle.scores, [myId]: myTotal, [oppId]: oppTotal };

        // Delay de 1s para ver o resultado
        setTimeout(async () => {
          if (currentBattle.currentQIndex + 1 < currentBattle.questions.length) {
            await updateDoc(battleRef, {
              scores: nextScores, answers: {}, 
              currentQIndex: currentBattle.currentQIndex + 1,
              questionStartTime: Date.now()
            });
          } else {
            await updateDoc(battleRef, { scores: nextScores, status: 'finished' });
          }
        }, 1000);
      }
    } catch (err) {
      console.error(err);
      isProcessingClick.current = false; // Destrava em caso de erro
      setLocalFeedback(null);
    }
  };

  // =================================================================
  // 4. RENDERIZAÇÃO COM ESTILOS FORÇADOS (FIX MOBILE)
  // =================================================================

  // --- LOBBY ---
  if (view === 'lobby') {
    return (
      <div style={{maxWidth:'600px', margin:'0 auto', padding:'20px'}}>
        <h1 style={{color:'#005c3e', textAlign:'center', marginBottom:'20px'}}>⚔️ Arena 1v1</h1>
        <div style={{textAlign:'center', marginBottom:'30px'}}>
          <button onClick={() => { setView('setup'); setConfig({ materia: "", qtd: 5 }); }} className="btn-primary">
            CRIAR NOVA SALA
          </button>
        </div>

        <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
          {battles.length === 0 && <p style={{textAlign:'center', color:'#666'}}>Nenhuma sala disponível.</p>}
          {battles.map(b => (
            <div key={b.id} style={{background:'white', padding:'15px', borderRadius:'8px', border:'1px solid #ddd', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div>
                <strong style={{color:'#005c3e', display:'block'}}>{b.materiaName}</strong>
                <span style={{fontSize:'0.8rem', color:'#555'}}>Host: {b.hostName}</span>
              </div>
              <div style={{display:'flex', gap:'10px'}}>
                {b.status === 'waiting' && b.hostId !== user.uid ? (
                  <button onClick={() => handleJoin(b.id)} className="btn-usp" style={{background:'#d35400'}}>LUTAR</button>
                ) : (
                  <span style={{fontSize:'0.8rem', fontWeight:'bold', color:'#888'}}>
                    {b.hostId === user.uid ? 'SUA SALA' : 'JOGANDO'}
                  </span>
                )}
                {(b.hostId === user.uid || isAdmin) && (
                  <button onClick={(e) => handleDelete(b.id, e)} style={{background:'none', border:'none', fontSize:'1.2rem'}}>🗑️</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- SETUP ---
  if (view === 'setup') {
    return (
      <div className="card" style={{maxWidth:'500px', margin:'0 auto', padding:'20px', background:'white'}}>
        <h2 style={{color:'#005c3e', marginTop:0}}>Configurar</h2>
        <select 
          value={config.materia} 
          onChange={e => setConfig({...config, materia: e.target.value})} 
          style={{width:'100%', padding:'12px', marginBottom:'20px', border:'1px solid #ccc', borderRadius:'4px', background:'white', color:'#333'}}
        >
          <option value="">Selecione a Matéria...</option>
          {materiasSimples.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <div style={{display:'flex', gap:'10px'}}>
          <button onClick={handleCreate} className="btn-primary" disabled={isCreating}>
            {isCreating ? "Criando..." : "INICIAR"}
          </button>
          <button onClick={() => setView('lobby')} className="btn-usp" style={{background:'#ccc', color:'#333'}}>Voltar</button>
        </div>
      </div>
    );
  }

  // --- ROOM ---
  if (view === 'room' && currentBattle) {
    if (currentBattle.status === 'waiting') {
      return (
        <div className="card" style={{textAlign:'center', padding:'40px', background:'white'}}>
          <h2 style={{color:'#005c3e'}}>⏳ Aguardando Oponente...</h2>
          <p style={{color:'#333'}}>Sala de <strong>{currentBattle.materiaName}</strong></p>
          <div style={{fontSize:'3rem', margin:'20px'}}>🛡️</div>
          <button onClick={handleExit} style={{background:'none', border:'none', color:'#c0392b', textDecoration:'underline'}}>Cancelar</button>
        </div>
      );
    }

    const question = currentBattle.questions && currentBattle.questions[currentBattle.currentQIndex];
    if (!question) return <div className="card" style={{padding:'20px', textAlign:'center'}}>Carregando...</div>;

    const isHost = user.uid === currentBattle.hostId;
    const oppId = isHost ? currentBattle.guestId : currentBattle.hostId;
    const oppName = isHost ? currentBattle.guestName : currentBattle.hostName;
    const oppAnswered = currentBattle.answers && currentBattle.answers[oppId] !== undefined;

    const myScore = currentBattle.scores ? (currentBattle.scores[user.uid] || 0) : 0;
    const oppScore = currentBattle.scores ? (currentBattle.scores[oppId] || 0) : 0;

    return (
      <div style={{maxWidth:'600px', margin:'0 auto', padding:'10px'}}>
        
        {/* PLACAR */}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'white', padding:'15px', borderRadius:'10px', marginBottom:'20px', boxShadow:'0 2px 5px rgba(0,0,0,0.1)'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontWeight:'bold', color:'#005c3e'}}>EU</div>
            <div style={{fontSize:'1.5rem', fontWeight:'bold'}}>{myScore}</div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:'0.7rem', color:'#888'}}>VALENDO</div>
            <div style={{fontSize:'2rem', fontWeight:'bold', color: timerDisplay > 15 ? '#27ae60' : '#e74c3c'}}>{timerDisplay}</div>
          </div>
          <div style={{textAlign:'center', opacity: oppAnswered ? 1 : 0.5}}>
            <div style={{fontWeight:'bold', color:'#c0392b'}}>{oppName?.substring(0,8) || 'OP'}</div>
            <div style={{fontSize:'1.5rem', fontWeight:'bold'}}>{oppScore}</div>
          </div>
        </div>

        {/* QUESTÃO - ESTILOS FORÇADOS PARA MOBILE */}
        <div style={{background:'white', padding:'20px', borderRadius:'10px', boxShadow:'0 2px 5px rgba(0,0,0,0.1)'}}>
          <div style={{display:'flex', justifyContent:'space-between', color:'#888', fontSize:'0.8rem', marginBottom:'10px'}}>
            <span>{currentBattle.materiaName}</span>
            <span>{currentBattle.currentQIndex + 1} / {currentBattle.totalQuestions}</span>
          </div>

          {question.imagemPergunta && (
            <img src={question.imagemPergunta} style={{maxHeight:'200px', maxWidth:'100%', objectFit:'contain', borderRadius:'8px', display:'block', margin:'0 auto 15px'}} alt="Pergunta" />
          )}

          <h3 style={{color:'#333', fontSize:'1.2rem', margin:'0 0 20px 0', lineHeight:'1.4', background:'white'}}>
            {question.pergunta}
          </h3>

          <div style={{display:'grid', gap:'12px'}}>
            {question.opcoes && question.opcoes.map((op, idx) => {
              // Lógica de Cor do Botão
              let bgColor = '#f8f9fa'; // Padrão
              let borderColor = '#e9ecef';
              let textColor = '#333';

              if (localFeedback !== null) {
                if (localFeedback === true && op.correta) {
                  bgColor = '#d4edda'; borderColor = '#28a745'; // Acertei e é essa
                } else if (localFeedback === false && op.correta) {
                  bgColor = '#d4edda'; borderColor = '#28a745'; // Errei, mas essa era a certa (mostra gabarito)
                } else if (localFeedback === false && !op.correta) {
                   // Se eu cliquei nessa e errei
                   // (Precisaria saber qual cliquei, mas simplificando: deixa opaco se não for a certa)
                   bgColor = '#f8d7da'; borderColor = '#dc3545';
                }
              }

              return (
                <button 
                  key={idx}
                  disabled={isProcessingClick.current || localFeedback !== null}
                  onClick={() => handleAnswer(op.correta)}
                  style={{
                    padding:'15px', 
                    background: bgColor, 
                    border: `2px solid ${borderColor}`, 
                    borderRadius:'8px', 
                    color: textColor,
                    fontSize:'1rem', 
                    fontWeight:'600',
                    cursor:'pointer',
                    width:'100%',
                    textAlign:'left',
                    opacity: (localFeedback !== null && !op.correta) ? 0.6 : 1 // Opacidade nas irrelevantes
                  }}
                >
                  {op.texto}
                </button>
              );
            })}
          </div>

          {localFeedback !== null && (
            <div style={{textAlign:'center', marginTop:'15px', fontWeight:'bold', color:'#005c3e'}}>
              {oppAnswered ? "Calculando..." : "Aguardando oponente..."}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- RESULT ---
  if (view === 'result' && currentBattle) {
    const myId = user.uid;
    const oppId = myId === currentBattle.hostId ? currentBattle.guestId : currentBattle.hostId;
    const myScore = currentBattle.scores[myId] || 0;
    const oppScore = currentBattle.scores[oppId] || 0;
    const iWon = myScore > oppScore;

    return (
      <div className="card" style={{textAlign:'center', padding:'40px', background:'white'}}>
        <div style={{fontSize:'4rem'}}>{iWon ? '👑' : myScore===oppScore ? '🤝' : '💀'}</div>
        <h1 style={{color: iWon?'#27ae60':'#333', margin:'10px 0'}}>
          {iWon ? 'VITÓRIA!' : myScore===oppScore ? 'EMPATE!' : 'DERROTA'}
        </h1>
        <div style={{fontSize:'3rem', fontWeight:'bold', color:'#333', margin:'20px 0'}}>
          {myScore} <span style={{fontSize:'1.5rem', color:'#ccc'}}>x</span> {oppScore}
        </div>
        <button onClick={handleExit} className="btn-primary">VOLTAR AO LOBBY</button>
      </div>
    );
  }

  return <div>Carregando...</div>;
}