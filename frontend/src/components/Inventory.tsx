import { useState, useEffect, useMemo } from 'react'
import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { useSponsoredTransaction } from '../hooks/useSponsoredTransaction'

// Fruit Assets
import imgCherry from '../assets/fruit/Cherry.png'
import imgGrape from '../assets/fruit/Nho.png'
import imgOrange from '../assets/fruit/Cam.png'
import imgLemon from '../assets/fruit/Chanh.png'
import imgApple from '../assets/fruit/Táo.png'
import imgPear from '../assets/fruit/Lê.png'
import imgPeach from '../assets/fruit/Đào.png'
import imgPineapple from '../assets/fruit/Thơm.png'
import imgMelon from '../assets/fruit/Dưa lưới.png'
import imgWatermelon from '../assets/fruit/Dưa hấu.png'

const PACKAGE_ID = '0x599868f3b4e190173c1ec1d3bd2738239461d617f74fe136a1a2f021fdf02503'
const SEED_ADMIN_CAP = '0x4d1847752f9470d9cd83a6c76b71801c32623b1c095c8d1f666500223cbfd5ac'
const SEED_COIN_TYPE = `${PACKAGE_ID}::seed::SEED`
const SEED_DECIMALS = 1_000_000_000n
const INVENTORY_UPGRADE_BASE_COST = 200n
const INVENTORY_SLOTS_PER_UPGRADE = 10
const MAX_INVENTORY_SLOTS = 200
const ITEMS_PER_PAGE = 10

const calculateUpgradeCost = (currentSlots: number): bigint => {
  const upgrades = Math.floor((currentSlots - 20) / INVENTORY_SLOTS_PER_UPGRADE)
  return INVENTORY_UPGRADE_BASE_COST * BigInt(upgrades + 1)
}

const FRUITS = [
  { level: 1, image: imgCherry, name: 'Cherry' },
  { level: 2, image: imgGrape, name: 'Grape' },
  { level: 3, image: imgOrange, name: 'Orange' },
  { level: 4, image: imgLemon, name: 'Lemon' },
  { level: 5, image: imgApple, name: 'Apple' },
  { level: 6, image: imgPear, name: 'Pear' },
  { level: 7, image: imgPeach, name: 'Peach' },
  { level: 8, image: imgPineapple, name: 'Pineapple' },
  { level: 9, image: imgMelon, name: 'Melon' },
  { level: 10, image: imgWatermelon, name: 'Watermelon' },
]

interface InventoryFruit {
  fruit_type: number
  rarity: number
  weight: number
  originalIndex: number
}

interface InventoryProps {
  inventoryId: string | null
  playerId?: string | null
  refreshTrigger?: number
  onUpdate?: () => void
  playerSeeds?: number
}

export default function Inventory({ inventoryId, refreshTrigger, onUpdate, playerSeeds = 0 }: InventoryProps) {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute, isPending: isTxPending } = useSponsoredTransaction()
  
  const [fruits, setFruits] = useState<InventoryFruit[]>([])
  const [maxSlots, setMaxSlots] = useState(20)
  const [isLoading, setIsLoading] = useState(false)
  const [txStatus, setTxStatus] = useState('')
  const [selectedType, setSelectedType] = useState<number | null>(null)
  const [selectedRarity, setSelectedRarity] = useState<number | null>(null)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    async function fetchInventory() {
      if (!inventoryId) return
      setIsLoading(true)
      try {
        const obj = await suiClient.getObject({ id: inventoryId, options: { showContent: true } })
        if (obj.data?.content?.dataType === 'moveObject') {
           const fields = obj.data.content.fields as any
           const inventoryFruits = fields.fruits || []
           setMaxSlots(Number(fields.max_slots || 20))
           setFruits(inventoryFruits.map((f: any, idx: number) => {
             const fruitData = f.fields || f
             return {
               fruit_type: Number(fruitData.fruit_type || 0),
               rarity: Number(fruitData.rarity || 1),
               weight: Number(fruitData.weight || 100),
               originalIndex: idx 
             }
           }))
        }
      } catch (err) { console.error(err) } finally { setIsLoading(false) }
    }
    fetchInventory()
  }, [inventoryId, suiClient, refreshTrigger])

  useEffect(() => { setCurrentPage(1) }, [selectedType, selectedRarity])

  const groupedByType = useMemo(() => {
    const groups: Record<number, InventoryFruit[]> = {}
    fruits.forEach(f => {
      if (!groups[f.fruit_type]) groups[f.fruit_type] = []
      groups[f.fruit_type].push(f)
    })
    return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b)).map(([type, items]) => ({ type: Number(type), items }))
  }, [fruits])

  const displayedFruits = useMemo(() => {
    return fruits.filter(f => {
      const typeMatch = selectedType === null || f.fruit_type === selectedType
      const rarityMatch = selectedRarity === null || f.rarity === selectedRarity
      return typeMatch && rarityMatch
    })
  }, [fruits, selectedType, selectedRarity])

  const totalPages = Math.ceil(displayedFruits.length / ITEMS_PER_PAGE)
  const paginatedFruits = displayedFruits.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage)
  }

  const getRarityName = (rarity: number) => {
    switch (rarity) {
      case 1: return 'Common'; case 2: return 'Uncommon'; case 3: return 'Rare'; case 4: return 'Epic'; case 5: return 'Legendary'; default: return 'Common'
    }
  }

  const getRarityColor = (rarity: number) => {
    switch (rarity) {
      case 1: return '#a0a0a0'; case 2: return '#2ecc71'; case 3: return '#3498db'; case 4: return '#9b59b6'; case 5: return '#f1c40f'; default: return '#a0a0a0'
    }
  }

  const toggleSelection = (originalIndex: number) => {
    if (!isSelectionMode) return;
    setSelectedIndices(prev => prev.includes(originalIndex) ? prev.filter(idx => idx !== originalIndex) : [...prev, originalIndex])
  }

  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      setIsSelectionMode(false)
      setSelectedIndices([])
    } else {
      setIsSelectionMode(true)
    }
  }

  const selectAllVisible = () => {
    const visibleIndices = displayedFruits.map(f => f.originalIndex)
    if (selectedIndices.length === visibleIndices.length) {
      setSelectedIndices([])
    } else {
      setSelectedIndices(visibleIndices)
    }
  }

  const handleBatchMint = async () => {
    if (!account?.address || !inventoryId || selectedIndices.length === 0) return;
    setTxStatus(`💎 Minting ${selectedIndices.length} NFTs...`);
    try {
      const tx = new Transaction();
      const sortedIndices = [...selectedIndices].sort((a, b) => b - a);
      for (const index of sortedIndices) {
        tx.moveCall({ target: `${PACKAGE_ID}::fruit_nft::mint_from_inventory`, arguments: [tx.object(inventoryId), tx.pure.u64(index)] });
      }
      signAndExecute({ transaction: tx }, {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest });
          setTxStatus(`✅ Successfully minted ${selectedIndices.length} NFTs!`);
          onUpdate?.(); setIsSelectionMode(false); setSelectedIndices([]); setTimeout(() => setTxStatus(''), 3000);
        },
        onError: (error) => { setTxStatus('❌ Mint Failed: ' + error.message); setTimeout(() => setTxStatus(''), 5000); }
      });
    } catch (err) { setTxStatus('❌ Error creating transaction'); }
  };

  const upgradeInventory = async () => {
    if (!account?.address || !inventoryId) return
    const upgradeCost = calculateUpgradeCost(maxSlots)
    const neededSeeds = Number(upgradeCost)
    if (playerSeeds < neededSeeds) { setTxStatus(`❌ Need ${neededSeeds} SEED`); return }
    
    const objects = await suiClient.getOwnedObjects({ owner: account.address, filter: { StructType: `${PACKAGE_ID}::player::PlayerAccount` }, options: { showType: true } })
    const playerObj = objects.data[0]; if (!playerObj?.data?.objectId) return
    setTxStatus('⬆️ Upgrading...');
    
    const seedCoins = await suiClient.getCoins({ owner: account.address, coinType: SEED_COIN_TYPE })     
    if (seedCoins.data.length === 0) return
    
    const tx = new Transaction()
    if (seedCoins.data.length > 1) tx.mergeCoins(tx.object(seedCoins.data[0].coinObjectId), seedCoins.data.slice(1).map(c => tx.object(c.coinObjectId)))
    
    const [payment] = tx.splitCoins(tx.object(seedCoins.data[0].coinObjectId), [tx.pure.u64(upgradeCost * SEED_DECIMALS)])
    tx.moveCall({ target: `${PACKAGE_ID}::player::upgrade_inventory`, arguments: [tx.object(playerObj.data.objectId), tx.object(inventoryId), payment, tx.object(SEED_ADMIN_CAP)] })
    
    signAndExecute({ transaction: tx }, { onSuccess: async (result) => { await suiClient.waitForTransaction({ digest: result.digest }); onUpdate?.(); setTxStatus('✅ Upgraded!'); setTimeout(() => setTxStatus(''), 3000); } })
  }

  const isFull = fruits.length >= maxSlots

  return (
    <div className="inventory-container">
      <div className="inventory-header">
        <h2>🎒 Bags</h2>
        <div className="inventory-actions">
          {fruits.length > 0 && (
            <button className={`select-mode-btn ${isSelectionMode ? 'active' : ''}`} onClick={toggleSelectionMode}>
              {isSelectionMode ? 'Cancel' : '✨ Select to Mint'}
            </button>
          )}
          <div className="inventory-capacity">
            <span className={`capacity-text ${isFull ? 'full' : ''}`}>{fruits.length} / {maxSlots}</span>
            {maxSlots < MAX_INVENTORY_SLOTS && (
              <button className="upgrade-btn" onClick={upgradeInventory} disabled={!!isTxPending}>
                {isTxPending && !isSelectionMode ? '⏳' : '⬆️'}
              </button>
            )}
          </div>
        </div>
      </div>

      {isSelectionMode && (
        <div className="batch-action-bar">
          <div className="selection-count">Selected: <strong>{selectedIndices.length}</strong></div>     
          <div className="batch-buttons">
            <button className="select-all-btn" onClick={selectAllVisible}>
              {selectedIndices.length === displayedFruits.length ? 'Deselect All' : 'Select All'}        
            </button>
            <button className="batch-mint-btn" disabled={selectedIndices.length === 0 || isTxPending} onClick={handleBatchMint}>
              {isTxPending ? '⏳...' : `💎 Mint ${selectedIndices.length} NFTs`}
            </button>
          </div>
        </div>
      )}

      {/* Rarity Filter */}
      {!isSelectionMode && (
        <div className="rarity-filter">
          <button 
            className={`filter-pill ${selectedRarity === null ? 'active' : ''}`} 
            onClick={() => setSelectedRarity(null)}
          >
            All Rarities
          </button>
          {[1, 2, 3, 4, 5].map(r => {
            const color = getRarityColor(r)
            const isActive = selectedRarity === r
            return (
              <button 
                key={r} 
                className={`filter-pill ${isActive ? 'active' : ''}`}
                style={{ 
                  '--btn-color': isActive ? '#fff' : color,
                  '--btn-border': color,
                  '--btn-bg': isActive ? color : 'rgba(255,255,255,0.05)',
                  '--btn-shadow': isActive ? `${color}66` : 'rgba(0,0,0,0.2)'
                } as any}
                onClick={() => setSelectedRarity(isActive ? null : r)}
              >
                {getRarityName(r)}
              </button>
            )
          })}
        </div>
      )}

      {/* Fruit type filter tabs */}
      {groupedByType.length > 0 && !isSelectionMode && (
        <div className="type-filter">
          <button className={`filter-btn ${selectedType === null ? 'active' : ''}`} onClick={() => setSelectedType(null)}>All Types</button>
          {groupedByType.map(({ type, items }) => (
            <button key={type} className={`filter-btn ${selectedType === type ? 'active' : ''}`} onClick={() => setSelectedType(type)}>
              <img src={FRUITS.find(f => f.level === type)?.image} className="filter-fruit-img" /> {items.length}
            </button>
          ))}
        </div>
      )}

      {txStatus && <div className="tx-status">{isTxPending && <span className="spinner">⏳</span>}{txStatus}</div>}

      {isLoading ? <div className="loading">Loading...</div> : fruits.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">🌾</div><h3>Empty Inventory</h3><p>Harvest fruits to see them here!</p></div>
      ) : (
        <>
          <div className={`inventory-grid-large ${isSelectionMode ? 'selection-mode' : ''}`}>
            {paginatedFruits.map((fruit, idx) => {
              const fruitInfo = FRUITS.find(f => f.level === fruit.fruit_type)
              const isSelected = selectedIndices.includes(fruit.originalIndex)
              return (
                <div key={idx} className={`inventory-item-large rarity-${fruit.rarity} ${isSelected ? 'selected' : ''}`} 
                  style={{ 
                    borderColor: getRarityColor(fruit.rarity),
                    background: isSelected 
                      ? `linear-gradient(135deg, ${getRarityColor(fruit.rarity)}80 0%, ${getRarityColor(fruit.rarity)}40 100%)`
                      : `linear-gradient(135deg, ${getRarityColor(fruit.rarity)}35 0%, ${getRarityColor(fruit.rarity)}10 100%)`,
                    boxShadow: isSelected 
                      ? `0 0 30px ${getRarityColor(fruit.rarity)}, inset 0 0 20px rgba(255,255,255,0.4)`
                      : `0 8px 25px rgba(0,0,0,0.4), inset 0 0 15px ${getRarityColor(fruit.rarity)}40`,
                    cursor: isSelectionMode ? 'pointer' : 'default',
                    transform: isSelected ? 'scale(0.96)' : 'none',
                    opacity: isSelectionMode && !isSelected ? 0.6 : 1
                  }}
                  onClick={() => toggleSelection(fruit.originalIndex)}
                >
                  {isSelectionMode && <div className={`checkbox ${isSelected ? 'checked' : ''}`}>{isSelected && '✓'}</div>}
                  <div className="item-icon-large"><img src={fruitInfo?.image} alt={fruitInfo?.name} className="fruit-img-large" /></div>
                  <div className="item-details">
                    <div className="item-name-large">{fruitInfo?.name}</div>
                    <div className="rarity-pill" style={{ backgroundColor: getRarityColor(fruit.rarity) }}>{getRarityName(fruit.rarity)}</div>
                    <div className="weight-pill">{fruit.weight >= 1000 ? `${(fruit.weight / 1000).toFixed(2)}kg` : `${fruit.weight}g`}</div>
                  </div>
                </div>
              )
            })}
          </div>
          {totalPages > 1 && (
            <div className="pagination-compact">
              <button className="page-btn-icon" disabled={currentPage === 1} onClick={() => handlePageChange(1)}>≪</button>
              <button className="page-btn-icon" disabled={currentPage === 1} onClick={() => handlePageChange(currentPage - 1)}>＜</button>
              <div className="page-indicator">{currentPage} / {totalPages}</div>
              <button className="page-btn-icon" disabled={currentPage === totalPages} onClick={() => handlePageChange(currentPage + 1)}>＞</button>
              <button className="page-btn-icon" disabled={currentPage === totalPages} onClick={() => handlePageChange(totalPages)}>≫</button>
            </div>
          )}
        </>
      )}
      <style>{`
        .inventory-container { padding: 20px; }
        
        /* 1. BUTTON BASE (STYLE CHUNG) */
        .select-mode-btn, .upgrade-btn, .filter-btn, .filter-pill {
          cursor: pointer;
          font-weight: 700;
          text-transform: uppercase;
          transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 2px solid rgba(255,255,255,0.2);
          
          /* Hiệu ứng 3D mặc định */
          transform: translateY(-2px);
          box-shadow: 0 4px 0 rgba(0,0,0,0.3);
        }

        /* Hover Effect */
        .select-mode-btn:hover, .upgrade-btn:hover, .filter-btn:hover, .filter-pill:hover {
          filter: brightness(1.1);
          transform: translateY(-4px);
          box-shadow: 0 6px 0 rgba(0,0,0,0.3);
        }

        /* Active/Click Effect */
        .select-mode-btn:active, .upgrade-btn:active, .filter-btn:active, .filter-pill:active,
        .select-mode-btn.active, .filter-btn.active, .filter-pill.active {
          transform: translateY(0px);
          box-shadow: none; /* Lún xuống */
          filter: brightness(1.0);
        }

        /* 2. COLORS & SPECIFICS */
        
        /* Select Mode Button */
        .select-mode-btn {
          background: #3498db; 
          color: white;
          padding: 0.6rem 1.2rem;
          border-color: #2980b9;
          box-shadow: 0 4px 0 #1f618d;
        }
        .select-mode-btn.active {
          background: #e74c3c;
          border-color: #c0392b;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); /* Lún vào trong khi đang active */
        }

        /* Upgrade Button */
        .upgrade-btn {
          background: #8e44ad;
          color: white;
          padding: 0.6rem;
          min-width: 40px;
          border-color: #6c3483;
          box-shadow: 0 4px 0 #512e5f;
        }

        /* Fruit Type Filter */
        .type-filter { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; }
        .filter-btn {
          background: #34495e;
          color: #bdc3c7;
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
          box-shadow: 0 4px 0 #2c3e50;
        }
        .filter-btn.active {
          background: #3498db;
          color: white;
          border-color: #2980b9;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        }

        /* Rarity Filter */
        .rarity-filter { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; }
        .filter-pill {
          background: var(--btn-bg, #34495e);
          color: var(--btn-color, #bdc3c7);
          border-color: var(--btn-border, #2c3e50);
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
          box-shadow: 0 4px 0 var(--btn-shadow, #2c3e50);
        }
        .filter-pill.active {
          background: var(--btn-bg);
          color: white;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        }

        /* Other Layout Styles */
        .inventory-actions { display: flex; align-items: center; gap: 15px; }
        .inventory-capacity { display: flex; align-items: center; gap: 10px; }
        .capacity-text { font-weight: bold; color: #fff; background: rgba(0,0,0,0.3); padding: 5px 10px; border-radius: 8px; }
        .capacity-text.full { color: #e74c3c; }
        
        .batch-action-bar { position: sticky; top: 0; z-index: 10; background: rgba(26, 26, 46, 0.95); padding: 15px; border-radius: 16px; border: 1px solid #3498db; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .batch-buttons { display: flex; gap: 10px; }
        .select-all-btn { background: transparent; border: 1px solid #fff; color: #fff; padding: 8px 16px; border-radius: 8px; cursor: pointer; }
        .batch-mint-btn { background: linear-gradient(135deg, #00c6ff, #0072ff); border: none; color: white; font-weight: bold; padding: 8px 20px; border-radius: 8px; cursor: pointer; }
        
        .inventory-grid-large { display: grid; grid-template-columns: repeat(5, 1fr); gap: 20px; margin-top: 20px; }
        .inventory-item-large { aspect-ratio: 0.65; border-radius: 24px; border: 4px solid; padding: 20px 15px; display: flex; flex-direction: column; align-items: center; position: relative; transition: all 0.2s; overflow: hidden; }
        .item-icon-large { flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; min-height: 100px; }
        .fruit-img-large { width: 95%; height: auto; object-fit: contain; filter: drop-shadow(0 10px 15px rgba(0,0,0,0.2)); }
        .item-details { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 10px; }
        .item-name-large { 
          background: rgba(0,0,0,0.5);
          color: #fff;
          padding: 4px 15px;
          border-radius: 12px;
          font-weight: 900; 
          font-size: 0.9rem; 
          margin-bottom: 2px; 
          text-transform: uppercase; 
          text-align: center; 
          line-height: 1.2;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .rarity-pill, .weight-pill { color: #fff; padding: 4px 12px; border-radius: 12px; font-weight: bold; font-size: 0.75rem; box-shadow: 0 2px 4px rgba(0,0,0,0.2); text-shadow: 0 1px 2px rgba(0,0,0,0.3); }  
        .weight-pill { background: #e67e22; margin-top: 2px; }
        
        .pagination-compact { display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 40px; }
        .page-btn-icon { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; width: 40px; height: 40px; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .page-btn-icon:hover:not(:disabled) { background: #3498db; border-color: #3498db; transform: translateY(-2px); }
        .page-btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }
        .page-indicator { color: white; font-weight: bold; background: rgba(0,0,0,0.3); padding: 8px 20px; border-radius: 10px; }
        
        .checkbox { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.5); background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: transparent; z-index: 5; transition: all 0.2s; }
        .checkbox.checked { background: #2ecc71; border-color: #fff; color: white; box-shadow: 0 0 10px #2ecc71; transform: scale(1.1); }
        
        @media (max-width: 1000px) { .inventory-grid-large { grid-template-columns: repeat(3, 1fr); } }  
        @media (max-width: 600px) { .inventory-grid-large { grid-template-columns: repeat(2, 1fr); } }   
      `}</style>
    </div>
  )
}
