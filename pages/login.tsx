import Link from 'next/link';
import { LoginForm } from '~/components/auth/login-form';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="flex flex-col items-center gap-4">
        <LoginForm />
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?
          {' '}
          <Link href="/signup" className="underline hover:text-foreground">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
