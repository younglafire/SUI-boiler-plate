import { useCurrentAccount } from '@mysten/dapp-kit'

export default function Inventory() {
  const account = useCurrentAccount()

  // Suppress unused variable warning
  void account

  return (
    <div className="inventory-container">
      <div className="inventory-header">
        <h2>🎒 Harvested Fruits</h2>
        <p className="inventory-subtitle">
          Fruits appear here when you harvest them from your land
        </p>
      </div>

      <div className="empty-state">
        <div className="empty-icon">🌾</div>
        <h3>Harvest fruits from your land!</h3>
        <p>Plant seeds in your land slots and wait for them to grow. Once ready, harvest them to add to your collection.</p>
        <p>Your harvested fruits are displayed in the "Your Land" section above.</p>
      </div>
    </div>
  )
}
