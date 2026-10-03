import { ExpenseForm } from '@/components/expense-form'
import { getCategories, getNetWorthItems, getWallets } from '@/lib/queries'

export default async function AddPage() {
  const [wallets, categories, netWorthItems] = await Promise.all([
    getWallets(),
    getCategories(),
    getNetWorthItems(),
  ])

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Add expense</h1>
      <div className="mt-6">
        <ExpenseForm
          wallets={wallets}
          categories={categories}
          netWorthItems={netWorthItems.filter((item) => item.active)}
        />
      </div>
    </>
  )
}
