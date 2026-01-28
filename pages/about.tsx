import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import * as z from 'zod';

export default function About() {
  const { data, isLoading } = useQuery({
    queryKey: ['examples-count'],
    queryFn: async () => {
      const response = await fetch('/api/examples');
      const data = await response.json();
      return z.object({ count: z.number() }).parse(data);
    },
  });
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-12 py-32 px-16 bg-white dark:bg-black">
        <div className="flex flex-col items-center gap-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-sky-300 to-sky-400 text-4xl shadow-lg">
            ~
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-black dark:text-zinc-50">
            Vibe Template
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            A vibing-oriented template for building modern web applications with
            Next.js, TypeScript, and Tailwind CSS.
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {isLoading
              ? 'Loading...'
              : `There are ${data?.count ?? 0} example records in the database.`}
          </p>
        </div>

        <Link
          href="/"
          className="flex h-12 items-center justify-center rounded-full border border-solid border-black/8 px-6 text-base font-medium transition-colors hover:border-transparent hover:bg-black/4 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Back to Home
        </Link>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Created by
          {' '}
          <a
            href="https://github.com/daleal"
            target="_blank"
            rel="noopener noreferrer"
            className="underline transition-colors hover:text-sky-500 dark:hover:text-sky-300"
          >
            Daniel Leal
          </a>
        </p>
      </main>
    </div>
  );
}
