'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../lib/api.js';
import { defaultLandingFor } from '../lib/access.js';

// Instalação própria da CR Recursos: o login já nasce com a identidade da empresa.
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: { email, password },
      });

      // Armazenar token em cookie HTTP-only (backend envia cookie)
      // Salva no localStorage para uso nas chamadas API
      if (data.token) {
        // Token em localStorage para o header Authorization nas chamadas API
        // O backend também envia cookie httpOnly via Set-Cookie (mais seguro)
        localStorage.setItem('token', data.token);
        localStorage.setItem('auth-token', data.token);
      }

      // Salvar dados do usuário
      const userData = {
        ...data.user,
        role: data.user.role || 'admin'
      };
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('tenant', JSON.stringify(data.tenant));
      
      localStorage.setItem('tenantId', data.tenant?.id || '');

      // Cada perfil entra diretamente na sua página inicial correta.
      if (userData.role === 'super_admin') {
        router.push('/master');
      } else {
        const landing = defaultLandingFor(userData.role);
        router.push(`/dashboard?module=${landing.module}&tab=${landing.tab}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      background: 'radial-gradient(circle at top, #3a0b0e 0%, #14090b 42%, #070708 100%)',
      padding: '20px'
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(157,27,31,0.35)',
        padding: '48px 40px',
        borderRadius: '16px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(157,27,31,0.12)',
        width: '100%',
        maxWidth: '420px'
      }}>
        {/* Identidade própria CR Recursos */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '250px',
            height: '112px',
            marginBottom: '8px',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/cr-recursos.png"
              alt="CR Recursos — Assessoria de Trânsito"
              style={{ width: '250px', height: '112px', objectFit: 'contain', filter: 'drop-shadow(0 0 18px rgba(157,27,31,0.35))' }}
            />
          </div>
        </div>

        <form onSubmit={handleLogin}>
          {error && (
            <div style={{
              background: '#fef2f2',
              color: '#ef4444',
              padding: '12px',
              borderRadius: '6px',
              marginBottom: '20px',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              color: '#94a3b8',
              fontSize: '13px',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              E-mail
            </label>
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(157,27,31,0.35)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              color: '#94a3b8',
              fontSize: '13px',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Senha
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(157,27,31,0.35)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? '#5f171a' : '#8f1d21',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.8 : 1,
              fontSize: '15px',
              fontWeight: '600',
              letterSpacing: '0.3px',
              transition: 'background 0.2s, transform 0.1s',
              boxShadow: loading ? 'none' : '0 4px 16px rgba(143,29,33,0.4)'
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p style={{
          textAlign: 'center',
          marginTop: '24px',
          color: 'rgba(211,207,195,0.35)',
          fontSize: '11px',
          letterSpacing: '0.5px'
        }}>
          © Telun · Todos os direitos reservados
        </p>
      </div>
    </div>
  );
}
