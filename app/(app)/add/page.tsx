import { ExpenseForm } from '@/components/expense-form'
import { getCategoryGroups, getWallets } from '@/lib/queries'

export default async function AddPage() {
  const [wallets, groups] = await Promise.all([getWallets(), getCategoryGroups()])

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Add expense</h1>
      <div className="mt-6">
        <ExpenseForm wallets={wallets} groups={groups} today={today} />
      </div>
    </>
  )
}
