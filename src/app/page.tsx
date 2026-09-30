import { redirect } from 'next/navigation';

/**
 * Root page redirects to /overview.
 */
export default function Home() {
  redirect('/overview');
}
