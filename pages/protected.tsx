import Link from 'next/link';
import { useRouter } from 'next/router';
import type { InferGetServerSidePropsType } from 'next';
import { useQuery } from '@tanstack/react-query';
import * as z from 'zod';
import { requireAuth, serializeUser } from '~/lib/ssr/require-auth';
import { signOut } from '~/lib/auth-client';

export const getServerSideProps = requireAuth(async (_ctx, session) => ({
  props: {
    user: serializeUser(session.user),
  },
}));

export default function Protected({ user }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['protected-examples-count'],
    queryFn: async () => {
      const response = await fetch('/api/protected/examples');
      const data = await response.json();
      return z.object({ count: z.number() }).parse(data);
    },
  });

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-12 py-32 px-16 bg-white dark:bg-black">
        <div className="flex flex-col items-center gap-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-300 to-emerald-400 text-4xl shadow-lg">
            🔒
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-black dark:text-zinc-50">
            Protected Page
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            This page is protected by authentication.
            Only logged-in users can see this content.
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Logged in as
            {' '}
            {user.email}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {isLoading
              ? 'Loading...'
              : `There are ${data?.count ?? 0} example records in the database.`}
          </p>
        </div>

        <div className="flex gap-4">
          <Link
            href="/"
            className="flex h-12 items-center justify-center rounded-full border border-solid border-black/8 px-6 text-base font-medium transition-colors hover:border-transparent hover:bg-black/4 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Back to Home
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-12 cursor-pointer items-center justify-center rounded-full border border-solid border-black/8 px-6 text-base font-medium transition-colors hover:border-transparent hover:bg-black/4 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Logout
          </button>
        </div>
      </main>
    </div>
  );
}
