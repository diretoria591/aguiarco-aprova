import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Wordmark } from '@/components/ui';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar' };

export default function LoginPage() {
  return (
    <div className="login">
      <section className="art">
        <Wordmark />
        <div>
          <p className="eyebrow" style={{ color: '#bdb6b0', marginBottom: 14 }}>Plataforma de aprovação</p>
          <h1>Conteúdo enviado, visto e <b>aprovado</b> em um só lugar.</h1>
        </div>
        <p>Inovação através da criatividade.</p>
      </section>
      <section className="form">
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </div>
  );
}
