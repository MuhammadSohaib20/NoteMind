import React, { createContext, useContext, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { User } from '../types';
import { apiFetch } from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName?: string) => Promise<void>;
  updateProfile: (updates: Partial<User>) => void;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function enrichUser(u: User, fallbackName?: string): User {
  const savedProfileStr = localStorage.getItem(`notemind_profile_${u.email}`);
  const savedProfile = savedProfileStr ? JSON.parse(savedProfileStr) : {};
  const derivedName =
    savedProfile.fullName ||
    fallbackName ||
    u.fullName ||
    u.email
      .split('@')[0]
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());

  return {
    ...u,
    fullName: derivedName,
    bio: savedProfile.bio || u.bio || '',
    avatarUrl: savedProfile.avatarUrl || u.avatarUrl || '',
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('notemind_user');
    if (!savedUser) return null;
    try {
      const parsed = JSON.parse(savedUser);
      return enrichUser(parsed);
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('notemind_token');
  });

  const login = async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (res.data) {
      queryClient.clear();
      const enriched = enrichUser(res.data.user);
      setToken(res.data.token);
      setUser(enriched);
      localStorage.setItem('notemind_token', res.data.token);
      localStorage.setItem('notemind_user', JSON.stringify(enriched));
    }
  };

  const signup = async (email: string, password: string, fullName?: string) => {
    const res = await apiFetch<{ token: string; user: User }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (res.data) {
      queryClient.clear();
      if (fullName) {
        localStorage.setItem(
          `notemind_profile_${email}`,
          JSON.stringify({ fullName })
        );
      }
      const enriched = enrichUser(res.data.user, fullName);
      setToken(res.data.token);
      setUser(enriched);
      localStorage.setItem('notemind_token', res.data.token);
      localStorage.setItem('notemind_user', JSON.stringify(enriched));
    }
  };

  const updateProfile = (updates: Partial<User>) => {
    if (!user) return;
    const updated: User = { ...user, ...updates };
    setUser(updated);
    localStorage.setItem('notemind_user', JSON.stringify(updated));
    localStorage.setItem(
      `notemind_profile_${updated.email}`,
      JSON.stringify({
        fullName: updated.fullName,
        bio: updated.bio,
        avatarUrl: updated.avatarUrl,
      })
    );
  };

  const updatePassword = async (currentPassword: string, newPassword: string) => {
    await apiFetch<{ message: string }>('/auth/update-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  };

  const logout = () => {
    queryClient.clear();
    setUser(null);
    setToken(null);
    localStorage.removeItem('notemind_token');
    localStorage.removeItem('notemind_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        login,
        signup,
        updateProfile,
        updatePassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
