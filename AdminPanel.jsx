import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, query, orderBy, onSnapshot, 
  doc, updateDoc, deleteDoc, writeBatch 
} from "firebase/firestore";

export default function AdminPanel({ userProfile }) {
  // --- CONFIGURAÇÃO ---
  // A aba 'usuarios' é especial e só aparece para Admin Supremo
  const isSupremeAdmin = userProfile.role === 'admin';
  
  // Lista de todas as coleções do sistema
  const ALL_TABS = [
    { id: 'usuarios', label: '👥 Usuários', restricted: true },
    { id: 'provas', label: '📂 Provas' },
    { id: 'quizzes', label: '🧠 Quizzes' },
    { id: 'flashcards', label: '🗂️ Flashcards' },
    { id: 'resumos', label: '📝 Resumos' },
    { id: 'slides', label: '📽️ Slides' },
    { id: 'links', label: '🔗 Links' }
  ];

  // Define a aba inicial (se for operador, pula 'usuarios')
  const [currentTab, setCurrentTab] = useState(isSupremeAdmin ? 'usuarios' : 'provas');
  
  // Dados
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]); 

  // --- SINAPSES (CARREGAMENTO EM TEMPO REAL) ---
  useEffect(() => {
    // Segurança: Se tentar acessar aba restrita sendo operador, joga para provas
    if (currentTab === 'usuarios' && !isSupremeAdmin) {
      setCurrentTab('provas');
      return;
    }

    setLoading(true);
    setSelectedIds([]); // Limpa seleção ao trocar de aba

    // Listener do Firestore
    const q = query(collection(db, currentTab), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setData(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentTab, isSupremeAdmin]);

  // --- AÇÕES GERAIS ---
  
  // Seleção Individual (Checkbox)
  const handleSelect = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Selecionar Tudo
  const handleSelectAll = () => {
    if (selectedIds.length === data.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data.map(item => item.id));
    }
  };

  // Deletar Único
  const handleDelete = async (id) => {
    if(!window.confirm("Tem certeza que deseja excluir permanentemente?")) return;
    try {
      await deleteDoc(doc(db, currentTab, id));
    } catch (error) {
      alert("Erro ao deletar: " + error.message);
    }
  };

  // Deletar em Massa (Bulk Delete)
  const handleBulkDelete = async () => {
    if(!window.confirm(`ATENÇÃO: Você está prestes a deletar ${selectedIds.length} itens. Isso não pode ser desfeito.`)) return;
    
    const batch = writeBatch(db);
    selectedIds.forEach(id => {
      const ref = doc(db, currentTab, id);
      batch.delete(ref);
    });

    try {
      await batch.commit();
      setSelectedIds([]); // Limpa seleção
      alert("Limpeza concluída com sucesso.");
    } catch (error) {
      console.error(error);
      alert("Erro ao processar lote.");
    }
  };

  // --- AÇÕES DE USUÁRIO (RH) ---
  
  const handleApproveUser = async (id) => {
    await updateDoc(doc(db, "usuarios", id), { status: "aprovado" });
  };

  const handleChangeRole = async (id, newRole) => {
    if(!window.confirm(`Alterar cargo deste usuário para ${newRole.toUpperCase()}?`)) return;
    await updateDoc(doc(db, "usuarios", id), { role: newRole });
  };

  // --- RENDERIZADORES DE CÉLULA (HELPER) ---
  
  // Renderiza a informação principal dependendo do tipo de dado
  const renderMainInfo = (item) => {
    if (currentTab === 'usuarios') {
      return (
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
          <div style={{width:'35px', height:'35px', borderRadius:'50%', background:'#eee', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold', color:'#555'}}>
            {item.nickname.substring(0,2).toUpperCase()}
          </div>
          <div>
            <div style={{fontWeight:'bold', color:'#333'}}>{item.nickname}</div>
            <div style={{fontSize:'0.8rem', color: item.status==='aprovado'?'green':'orange'}}>
              {item.status.toUpperCase()}
            </div>
          </div>
        </div>
      );
    }
    
    // Para conteúdo (Provas, Slides, etc)
    return (
      <div>
        <div style={{fontWeight:'bold', color:'var(--usp-green)'}}>
          {item.materia || item.title || item.front || "Sem Título"}
        </div>
        <div style={{fontSize:'0.8rem', color:'#666'}}>
          {item.pergunta ? (item.pergunta.substring(0, 50) + "...") : ""} 
          {item.professor ? `Prof. ${item.professor} • ${item.ano}` : ""}
          {item.description ? item.description : ""}
          {item.back ? `Resp: ${item.back.substring(0,30)}...` : ""}
          {item.url ? item.url : ""}
        </div>
      </div>
    );
  };

  return (
    <div className="card">
      {/* 1. BARRA DE ABAS (Navegação) */}
      <div style={{display:'flex', gap:'5px', borderBottom:'1px solid #eee', paddingBottom:'10px', marginBottom:'20px', overflowX:'auto'}}>
        {ALL_TABS.map(tab => {
          // Esconde aba restrita se não for Admin Supremo
          if (tab.restricted && !isSupremeAdmin) return null;
          
          const isActive = currentTab === tab.id;
          return (
            <button 
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              style={{
                padding: '8px 15px',
                border: 'none',
                background: isActive ? 'rgba(0, 92, 62, 0.1)' : 'transparent',
                borderBottom: isActive ? '3px solid var(--usp-green)' : '3px solid transparent',
                color: isActive ? 'var(--usp-green)' : '#888',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 2. BARRA DE AÇÕES EM MASSA */}
      {selectedIds.length > 0 && (
        <div style={{
          background: '#ffebee', border: '1px solid #ef9a9a', color: '#c62828', 
          padding: '10px 15px', borderRadius: '6px', marginBottom: '20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          animation: 'slideDown 0.3s ease'
        }}>
          <span style={{fontWeight:'bold'}}>
            {selectedIds.length} item(s) selecionado(s)
          </span>
          <button 
            onClick={handleBulkDelete}
            style={{
              background: '#c62828', color: 'white', border: 'none', 
              padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
            }}
          >
            DELETAR SELEÇÃO
          </button>
        </div>
      )}

      {/* 3. TABELA DE DADOS */}
      {loading ? (
        <div style={{padding:'20px', textAlign:'center', color:'#888'}}>Carregando dados...</div>
      ) : data.length === 0 ? (
        <div style={{padding:'40px', textAlign:'center', color:'#aaa', background:'#f9f9f9', borderRadius:'8px'}}>
          Nenhum registro encontrado nesta coleção.
        </div>
      ) : (
        <div style={{overflowX: 'auto'}}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{width: '40px', textAlign:'center'}}>
                  <input 
                    type="checkbox" 
                    checked={data.length > 0 && selectedIds.length === data.length} 
                    onChange={handleSelectAll} 
                    style={{cursor:'pointer'}}
                  />
                </th>
                <th>Informação Principal</th>
                {currentTab === 'usuarios' && <th>Cargo (Permissão)</th>}
                <th>{currentTab === 'usuarios' ? 'Entrou em' : 'Autor / Data'}</th>
                <th style={{textAlign:'right'}}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.map(item => (
                <tr key={item.id} style={{background: selectedIds.includes(item.id) ? '#fff8e1' : 'transparent'}}>
                  <td style={{textAlign:'center'}}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(item.id)} 
                      onChange={() => handleSelect(item.id)}
                      style={{cursor:'pointer'}}
                    />
                  </td>
                  
                  {/* COLUNA 1: INFO PRINCIPAL */}
                  <td>{renderMainInfo(item)}</td>

                  {/* COLUNA 2: CARGO (Só Usuários) */}
                  {currentTab === 'usuarios' && (
                    <td>
                      {isSupremeAdmin ? (
                        <select 
                          value={item.role || 'student'} 
                          onChange={(e) => handleChangeRole(item.id, e.target.value)}
                          style={{
                            padding: '5px', borderRadius: '4px', border: '1px solid #ccc',
                            background: item.role === 'admin' ? '#fff3cd' : item.role === 'operator' ? '#e3f2fd' : '#fff'
                          }}
                        >
                          <option value="student">Estudante (Leitor)</option>
                          <option value="operator">Operador (Editor)</option>
                          <option value="admin">Admin (Supremo)</option>
                        </select>
                      ) : (
                        <span style={{fontSize:'0.9rem'}}>{item.role || 'Student'}</span>
                      )}
                    </td>
                  )}

                  {/* COLUNA 3: DATA/AUTOR */}
                  <td style={{fontSize:'0.8rem', color:'#666'}}>
                    {currentTab !== 'usuarios' && <div style={{fontWeight:'bold'}}>{item.autor || item.uploadedBy || 'Desconhecido'}</div>}
                    <div>
                      {item.createdAt?.seconds 
                        ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() 
                        : 'Data N/A'}
                    </div>
                  </td>

                  {/* COLUNA 4: BOTÕES */}
                  <td style={{textAlign: 'right'}}>
                    <div style={{display:'flex', justifyContent:'flex-end', gap:'5px'}}>
                      {currentTab === 'usuarios' && item.status === 'pendente' && (
                        <button 
                          onClick={() => handleApproveUser(item.id)} 
                          title="Aprovar Usuário"
                          style={{background:'#27ae60', color:'white', border:'none', width:'30px', height:'30px', borderRadius:'4px', cursor:'pointer'}}
                        >
                          ✓
                        </button>
                      )}
                      
                      <button 
                        onClick={() => handleDelete(item.id)} 
                        title="Excluir Permanentemente"
                        style={{background:'transparent', border:'1px solid #c0392b', color:'#c0392b', width:'30px', height:'30px', borderRadius:'4px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}