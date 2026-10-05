'use client';

import { useState, useEffect } from 'react';
import { getUsers, getRoles, createUser, updateUser, deleteUser, getUsersStats } from '../lib/usersAPI';

export default function MultasUsers() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'viewer',
    is_active: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, rolesData, statsData] = await Promise.all([
        getUsers(),
        getRoles(),
        getUsersStats()
      ]);
      setUsers(usersData.data || []);
      setRoles(rolesData.data || []);
      setStats(statsData.data);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          is_active: formData.is_active
        });
      } else {
        await createUser(formData);
      }
      setShowModal(false);
      setEditingUser(null);
      resetForm();
      loadData();
    } catch (err) {
      console.error('Erro ao salvar usuário:', err);
      setError(err.message);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'viewer',
      is_active: user.is_active !== false
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (confirm('Tem certeza que deseja excluir este usuário?')) {
      try {
        await deleteUser(id);
        loadData();
      } catch (err) {
        console.error('Erro ao deletar usuário:', err);
        setError(err.message);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'viewer',
      is_active: true
    });
  };

  const openNewUserModal = () => {
    setEditingUser(null);
    resetForm();
    setShowModal(true);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getRoleBadgeClass = (role) => {
    const roleMap = {
      'admin': 'role-admin',
      'manager': 'role-manager',
      'operator': 'role-operator',
      'viewer': 'role-viewer'
    };
    return roleMap[role] || 'role-default';
  };

  const getRoleLabel = (role) => {
    const labels = {
      'admin': 'Administrador',
      'manager': 'Gerente',
      'operator': 'Operador',
      'viewer': 'Visualizador'
    };
    return labels[role] || role;
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Carregando usuários...</p>
      </div>
    );
  }

  return (
    <div className="multas-users">
      {/* Estatísticas */}
      {stats && (
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Total de Usuários</span>
          </div>
          {stats.stats?.map((stat) => (
            <div key={stat.role} className="stat-card">
              <span className="stat-value">{stat.count}</span>
              <span className="stat-label">{getRoleLabel(stat.role)}s</span>
            </div>
          ))}
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Header com botão */}
      <div className="page-header">
        <h2>Gerenciamento de Usuários</h2>
        <button onClick={openNewUserModal} className="btn-primary">
          + Novo Usuário
        </button>
      </div>

      {/* Tabela de Usuários */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Função</th>
              <th>Status</th>
              <th>Criado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty-state">
                  Nenhum usuário encontrado
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="user-info">
                      <span className="user-avatar">
                        {user.name?.charAt(0).toUpperCase() || 'U'}
                      </span>
                      <strong>{user.name}</strong>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`role-badge ${getRoleBadgeClass(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${user.is_active ? 'status-active' : 'status-inactive'}`}>
                      {user.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>{formatDate(user.created_at)}</td>
                  <td className="actions-cell">
                    <button 
                      onClick={() => handleEdit(user)}
                      className="btn-icon"
                      title="Editar"
                    >
                      [Editar]
                    </button>
                    <button 
                      onClick={() => handleDelete(user.id)}
                      className="btn-icon danger"
                      title="Excluir"
                    >
                      [Excluir]
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Usuário */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-close">[X]</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label>Nome *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
                />
              </div>
              {!editingUser && (
                <div className="form-group">
                  <label>Senha *</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    required={!editingUser}
                    minLength={6}
                  />
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>Função *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                    required
                  >
                    {roles.map((role) => (
                      <option key={role.name} value={role.name}>
                        {role.name.charAt(0).toUpperCase() + role.name.slice(1)} - {role.description}
                      </option>
                    ))}
                  </select>
                </div>
                {editingUser && (
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={formData.is_active ? 'true' : 'false'}
                      onChange={(e) => setFormData({...formData, is_active: e.target.value === 'true'})}
                    >
                      <option value="true">Ativo</option>
                      <option value="false">Inativo</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  {editingUser ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

