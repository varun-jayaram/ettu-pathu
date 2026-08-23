import { ExpenseForm } from '@/components/expense-form'
import { getCategories, getWallets } from '@/lib/queries'

export default async function AddPage() {
  const [wallets, categories] = await Promise.all([getWallets(), getCategories()])

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Add expense</h1>
      <div className="mt-6">
        <ExpenseForm wallets={wallets} categories={categories} />
      </div>
    </>
  )
}
