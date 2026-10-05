"use client";

import { useEffect, useState, useCallback } from "react";
import { leadsAPI } from "@/app/lib/leadsAPI";
import { getSellers, createSeller, updateSeller, deleteSeller } from "@/app/lib/sellersAPI";

// Componente de KPIs globais
function GlobalKPIs({ leads }) {
  const totalLeads = leads.length;
  const gainedLeads = leads.filter(l => l.status === "ganho").length;
  const totalRevenue = leads
    .filter(l => l.status === "ganho")
    .reduce((acc, l) => acc + Number(l.value || 0), 0);
  const conversionRate = totalLeads > 0 ? ((gainedLeads / totalLeads) * 100).toFixed(1) : 0;

  return (
    <div style={{ 
      display: "grid", 
      gridTemplateColumns: "repeat(4, 1fr)", 
      gap: "16px",
      marginBottom: "24px"
    }}>
      <KPICard label="Total de Leads" value={totalLeads} icon="📊" />
      <KPICard label="Leads Ganhos" value={gainedLeads} icon="🤝" />
      <KPICard label="Receita Total" value={`R$ ${totalRevenue.toLocaleString()}`} icon="💰" />
      <KPICard label="Taxa de Conversão" value={`${conversionRate}%`} icon="⚡" />
    </div>
  );
}

function KPICard({ label, value, icon }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e0e0e0",
      borderRadius: "12px",
      padding: "16px",
      textAlign: "center",
      boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
    }}>
      <div style={{ fontSize: "24px", marginBottom: "8px" }}>{icon}</div>
      <div style={{ fontSize: "24px", fontWeight: "bold", color: "#333" }}>{value}</div>
      <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>{label}</div>
    </div>
  );
}

// Modal para adicionar/editar vendedor
function SellerModal({ isOpen, onClose, onSave, seller, isEditing }) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    monthly_target: 50000
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (seller && isEditing) {
      setFormData({
        name: seller.name || "",
        email: seller.email || "",
        monthly_target: seller.monthly_target || 50000
      });
    } else {
      setFormData({ name: "", email: "", monthly_target: 50000 });
    }
    setError("");
  }, [seller, isEditing, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError("Nome é obrigatório");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        background: "#fff",
        borderRadius: "12px",
        padding: "24px",
        width: "400px",
        maxWidth: "90%"
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: "20px" }}>
          {isEditing ? "✏️ Editar Vendedor" : "➕ Adicionar Vendedor"}
        </h3>
        
        {error && (
          <div style={{ 
            background: "#fee", 
            color: "#c00", 
            padding: "10px", 
            borderRadius: "6px",
            marginBottom: "16px",
            fontSize: "14px"
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500" }}>
              Nome *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px"
              }}
              placeholder="Nome do vendedor"
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500" }}>
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px"
              }}
              placeholder="email@exemplo.com"
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500" }}>
              Meta Mensal (R$)
            </label>
            <input
              type="number"
              value={formData.monthly_target}
              onChange={e => setFormData({ ...formData, monthly_target: Number(e.target.value) })}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px"
              }}
              min="0"
              step="100"
            />
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 20px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                background: "#fff",
                cursor: "pointer"
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "10px 20px",
                border: "none",
                borderRadius: "6px",
                background: "#0070f3",
                color: "#fff",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Card de vendedor na lista
function SellerCard({ seller, stats, onEdit, onDelete }) {
  const progress = seller.monthly_target > 0 
    ? Math.min((stats.revenue / seller.monthly_target) * 100, 100) 
    : 0;

  return (
    <div style={{
      border: "1px solid #e0e0e0",
      borderRadius: "12px",
      padding: "20px",
      background: "#fff",
      boxShadow: "0 2px 6px rgba(0,0,0,0.05)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "18px", color: "#333" }}>{seller.name}</h3>
          {seller.email && <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#666" }}>{seller.email}</p>}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => onEdit(seller)}
            style={{
              padding: "6px 12px",
              border: "1px solid #ddd",
              borderRadius: "6px",
              background: "#fff",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            ✏️ Editar
          </button>
          <button
            onClick={() => onDelete(seller)}
            style={{
              padding: "6px 12px",
              border: "1px solid #fcc",
              borderRadius: "6px",
              background: "#fff",
              color: "#c00",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            🗑️
          </button>
        </div>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
          <span>🎯 Meta: R$ {Number(seller.monthly_target || 0).toLocaleString()}</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div style={{ 
          height: "8px", 
          background: "#eee", 
          borderRadius: "4px",
          overflow: "hidden"
        }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: progress >= 100 ? "#4caf50" : progress >= 50 ? "#ff9800" : "#0070f3",
            transition: "width 0.3s ease"
          }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", textAlign: "center" }}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#333" }}>{stats.totalLeads}</div>
          <div style={{ fontSize: "11px", color: "#666" }}>Leads</div>
        </div>
        <div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#4caf50" }}>{stats.closedDeals}</div>
          <div style={{ fontSize: "11px", color: "#666" }}>Ganhos</div>
        </div>
        <div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#333" }}>R$ {stats.revenue.toLocaleString()}</div>
          <div style={{ fontSize: "11px", color: "#666" }}>Receita</div>
        </div>
        <div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#0070f3" }}>{stats.conversionRate}%</div>
          <div style={{ fontSize: "11px", color: "#666" }}>Conversão</div>
        </div>
      </div>
    </div>
  );
}

export default function Performance() {
  const [leads, setLeads] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState(null);
  const [deletingSeller, setDeletingSeller] = useState(null);

  // Função para carregar dados
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      
      const [leadsResponse, sellersResponse] = await Promise.all([
        leadsAPI.getAll(),
        getSellers()
      ]);

      // Processar leads
      let leadsData = [];
      if (Array.isArray(leadsResponse)) {
        leadsData = leadsResponse;
      } else if (leadsResponse?.data && Array.isArray(leadsResponse.data)) {
        leadsData = leadsResponse.data;
      }

      // Processar sellers
      let sellersData = [];
      if (Array.isArray(sellersResponse)) {
        sellersData = sellersResponse;
      } else if (sellersResponse?.data && Array.isArray(sellersResponse.data)) {
        sellersData = sellersResponse.data;
      }

      setLeads(leadsData);
      setSellers(sellersData);
      
    } catch (err) {
      console.error("🚨 Erro ao carregar performance:", err);
      setError(err.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  // Carregar dados na montagem
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calcular estatísticas por vendedor
  const calculateSellerStats = useCallback((seller) => {
    const sellerLeads = leads.filter(lead => lead.seller_id === seller.id);
    const totalLeads = sellerLeads.length;
    const closedLeads = sellerLeads.filter(lead => lead.status === "ganho");
    const revenue = closedLeads.reduce((acc, lead) => acc + Number(lead.value || 0), 0);
    const conversionRate = totalLeads > 0 ? ((closedLeads.length / totalLeads) * 100).toFixed(1) : 0;

    return {
      totalLeads,
      closedDeals: closedLeads.length,
      revenue,
      conversionRate
    };
  }, [leads]);

  // handlers de CRUD
  const handleAddSeller = () => {
    setEditingSeller(null);
    setModalOpen(true);
  };

  const handleEditSeller = (seller) => {
    setEditingSeller(seller);
    setModalOpen(true);
  };

  const handleSaveSeller = async (formData) => {
    try {
      if (editingSeller) {
        // Editar vendedor existente
        await updateSeller(editingSeller.id, {
          name: formData.name,
          email: formData.email,
          monthly_target: formData.monthly_target
        });
      } else {
        // Criar novo vendedor
        await createSeller({
          name: formData.name,
          email: formData.email,
          monthly_target: formData.monthly_target
        });
      }
      // Recarregar dados
      await loadData();
    } catch (err) {
      throw new Error(err.message || "Erro ao salvar vendedor");
    }
  };

  const handleDeleteSeller = async (seller) => {
    if (!confirm(`Tem certeza que deseja excluir o vendedor "${seller.name}"?`)) {
      return;
    }
    
    try {
      await deleteSeller(seller.id);
      await loadData();
    } catch (err) {
      alert("Erro ao deletar vendedor: " + err.message);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div style={{ fontSize: "24px", marginBottom: "12px" }}>⏳</div>
        <p>Carregando dados...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div style={{ fontSize: "48px", marginBottom: "12px" }}>⚠️</div>
        <p style={{ color: "#c00", marginBottom: "16px" }}>{error}</p>
        <button 
          onClick={loadData}
          style={{
            padding: "10px 20px",
            border: "none",
            borderRadius: "6px",
            background: "#0070f3",
            color: "#fff",
            cursor: "pointer"
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px" }}>
      {/* Header com botão de adicionar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0 }}>📈 Performance dos Vendedores</h2>
        <button
          onClick={handleAddSeller}
          style={{
            padding: "10px 20px",
            border: "none",
            borderRadius: "8px",
            background: "#0070f3",
            color: "#fff",
            cursor: "pointer",
            fontWeight: "500",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          ➕ Adicionar Vendedor
        </button>
      </div>

      {/* KPIs Globais */}
      <GlobalKPIs leads={leads} />

      {/* Lista de vendedores */}
      {sellers.length === 0 ? (
        <div style={{ 
          textAlign: "center", 
          padding: "60px 20px",
          background: "#f9f9f9",
          borderRadius: "12px"
        }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>👥</div>
          <h3 style={{ margin: "0 0 8px", color: "#333" }}>Nenhum vendedor encontrado</h3>
          <p style={{ color: "#666", marginBottom: "20px" }}>
            Adicione vendedores para acompanhar sua performance
          </p>
          <button
            onClick={handleAddSeller}
            style={{
              padding: "12px 24px",
              border: "none",
              borderRadius: "8px",
              background: "#0070f3",
              color: "#fff",
              cursor: "pointer",
              fontWeight: "500"
            }}
          >
            ➕ Adicionar Primeiro Vendedor
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {sellers.map(seller => (
            <SellerCard
              key={seller.id}
              seller={seller}
              stats={calculateSellerStats(seller)}
              onEdit={handleEditSeller}
              onDelete={handleDeleteSeller}
            />
          ))}
        </div>
      )}

      {/* Modal de adicionar/editar */}
      <SellerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveSeller}
        seller={editingSeller}
        isEditing={!!editingSeller}
      />
    </div>
  );
}

