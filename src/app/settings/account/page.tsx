import { AccountForm } from '@/components/settings/AccountForm';
import { PasswordForm } from '@/components/settings/PasswordForm';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AccountSettingsPage() {
  const session = await auth();
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { username: true },
      })
    : null;

  return (
    <div className="settings-groups">
      <AccountForm initialUsername={user?.username ?? ''} />
      <PasswordForm />
    </div>
  );
}
