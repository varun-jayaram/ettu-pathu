import { ExpenseForm } from '@/components/expense-form'
import { getCategoryGroups, getWallets } from '@/lib/queries'

export default async function AddPage() {
  const [wallets, groups] = await Promise.all([getWallets(), getCategoryGroups()])

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Add expense</h1>
      <div className="mt-6">
        <ExpenseForm wallets={wallets} groups={groups} />
      </div>
    </>
  )
}
