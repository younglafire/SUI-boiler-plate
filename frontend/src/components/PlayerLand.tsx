import { useState, useEffect, useCallback } from 'react'
import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { useSponsoredTransaction, mintSeedsToUser, sponsorClient } from '../hooks/useSponsoredTransaction'

// Soil Assets
import chauDat from '../assets/Chậu đất.svg'
import chauDatNayMam from '../assets/Chậu đất nảy mầm.svg'
import chauDatTuoiCay from '../assets/Chậu đất tưới cây.svg'

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
const RANDOM_OBJECT = '0x8'
const CLOCK_OBJECT = '0x6'

// Grow times based on rarity (in milliseconds)
// Rarer fruits take longer but are worth more!
// Probability: Common 50%, Uncommon 25%, Rare 15%, Epic 8%, Legendary 2%
const GROW_TIMES_BY_RARITY: Record<number, number> = {
  1: 15000,   // Common: 15 seconds - quick for engagement
  2: 30000,   // Uncommon: 30 seconds - slightly longer
  3: 60000,   // Rare: 1 minute - noticeable wait
  4: 180000,  // Epic: 3 minutes - significant investment
  5: 480000,  // Legendary: 8 minutes - real commitment, max reward
}

// Get grow time for a fruit based on its rarity
const getGrowTime = (rarity: number): number => {
  return GROW_TIMES_BY_RARITY[rarity] || GROW_TIMES_BY_RARITY[1]
}

// Format time remaining in a human-readable way
const formatTimeLeft = (seconds: number): string => {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }
  return `${seconds}s`
}

// SeedAdminCap shared object ID (from contract publish)
const SEED_ADMIN_CAP = '0x4d1847752f9470d9cd83a6c76b71801c32623b1c095c8d1f666500223cbfd5ac'

// SEED coin type and decimals
const SEED_COIN_TYPE = `${PACKAGE_ID}::seed::SEED`
const SEED_DECIMALS_FALLBACK = 1_000_000_000n

// Costs in whole SEED tokens
const NEW_LAND_COST = 500n
const LAND_UPGRADE_BASE_COST = 100n

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

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']
const RARITY_COLORS = ['#95a5a6', '#3498db', '#9b59b6', '#e74c3c', '#f39c12']

interface PlantedFruit {
  fruitType: number
  rarity: number
  weight: number
  seedsUsed: number
  plantedAt: number
  speedBoostMs: number  // Speed boost from tools (from contract)
}

interface Slot {
  index: number
  fruit: PlantedFruit | null
}

interface LandInfo {
  id: string
  index: number
  level: number
  maxSlots: number
}

// Shop items type for tools
type ShopItemKey = 'wateringCan' | 'fertilizer' | 'shovel'

interface PlayerLandProps {
  landId: string | null
  inventoryId: string | null
  playerSeeds: number
  seedScale?: bigint
  onDataChanged?: () => void
}

export default function PlayerLand({ 
  landId: initialLandId, 
  inventoryId,
  playerSeeds,
  seedScale = SEED_DECIMALS_FALLBACK,
  onDataChanged
}: PlayerLandProps) {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute, isPending } = useSponsoredTransaction()
  
  // Multi-land support
  const [allLands, setAllLands] = useState<LandInfo[]>([])
  const [activeLandId, setActiveLandId] = useState<string | null>(initialLandId)
  
  const [slots, setSlots] = useState<Slot[]>([])
  const [landLevel, setLandLevel] = useState(1)
  const [maxSlots, setMaxSlots] = useState(4)
  const [txStatus, setTxStatus] = useState('')
  const [currentTime, setCurrentTime] = useState(Date.now())
  
  // Inventory capacity tracking
  const [inventoryUsed, setInventoryUsed] = useState(0)
  const [inventoryMax, setInventoryMax] = useState(20)
  
  // Modal states
  const [showPlantModal, setShowPlantModal] = useState(false)
  const [plantSlotIndex, setPlantSlotIndex] = useState<number | null>(null)
  const [seedsToPlant, setSeedsToPlant] = useState(1)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchSeeds, setBatchSeeds] = useState(1)
  const [showHarvestWarning, setShowHarvestWarning] = useState(false)
  const [showPlantAllLandsModal, setShowPlantAllLandsModal] = useState(false)
  const [allLandsSeedsPerSlot, setAllLandsSeedsPerSlot] = useState(1)
  
  // Tool usage state
  const [selectedTool, setSelectedTool] = useState<ShopItemKey | null>(null)
  
  // Speed boost tracking - stores time reductions for each slot
  const [slotSpeedBoosts, setSlotSpeedBoosts] = useState<Record<number, number>>({})

  // Update active land when initialLandId changes
  useEffect(() => {
    if (initialLandId && !activeLandId) {
      setActiveLandId(initialLandId)
    }
  }, [initialLandId, activeLandId])

  // Update timer every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch all lands owned by player
  const fetchAllLands = useCallback(async () => {
    if (!account?.address) return
    
    try {
      const objects = await suiClient.getOwnedObjects({
        owner: account.address,
        options: { showType: true, showContent: true },
        filter: { StructType: `${PACKAGE_ID}::land::PlayerLand` }
      })
      
      const lands: LandInfo[] = []
      for (const obj of objects.data) {
        if (obj.data?.content?.dataType === 'moveObject') {
          const fields = obj.data.content.fields as any
          lands.push({
            id: obj.data.objectId,
            index: Number(fields.land_index || 0),
            level: Number(fields.level || 1),
            maxSlots: Number(fields.max_slots || 6),
          })
        }
      }
      
      // Sort by index
      lands.sort((a, b) => a.index - b.index)
      setAllLands(lands)
      
      // Set active land if not set
      if (!activeLandId && lands.length > 0) {
        setActiveLandId(lands[0].id)
      }
    } catch (error) {
      console.error('Error fetching lands:', error)
    }
  }, [account?.address, suiClient, activeLandId])

  // Fetch land data for active land
  const fetchLandData = useCallback(async () => {
    if (!activeLandId) return
    
    try {
      const landObj = await suiClient.getObject({
        id: activeLandId,
        options: { showContent: true }
      })
      
      if (landObj.data?.content && 'fields' in landObj.data.content) {
        const fields = landObj.data.content.fields as Record<string, unknown>
        
        setLandLevel(Number(fields.level || 1))
        setMaxSlots(Number(fields.max_slots || 4))
        
        // Parse slots
        const slotsData = fields.slots as Array<{
          fields?: {
            fruit_type?: number
            rarity?: number
            weight?: number
            seeds_used?: number
            planted_at?: string
            speed_boost_ms?: string
          } | null
        } | null> || []
        
        const parsedSlots: Slot[] = []
        for (let i = 0; i < slotsData.length; i++) {
          const slotOption = slotsData[i]
          if (slotOption && 'fields' in slotOption && slotOption.fields) {
            const slotData = slotOption.fields
            parsedSlots.push({
              index: i,
              fruit: {
                fruitType: Number(slotData.fruit_type || 1),
                rarity: Number(slotData.rarity || 1),
                weight: Number(slotData.weight || 100),
                seedsUsed: Math.floor(Number(slotData.seeds_used || 1) / Number(seedScale || 1n)),
                plantedAt: Number(slotData.planted_at || 0),
                speedBoostMs: Number(slotData.speed_boost_ms || 0),
              }
            })
          } else {
            parsedSlots.push({ index: i, fruit: null })
          }
        }
        setSlots(parsedSlots)
      }
    } catch (error) {
      console.error('Error fetching land data:', error)
    }
  }, [activeLandId, suiClient])

  // Fetch inventory capacity
  const fetchInventoryData = useCallback(async () => {
    if (!inventoryId) return
    
    try {
      const obj = await suiClient.getObject({
        id: inventoryId,
        options: { showContent: true }
      })
      
      if (obj.data?.content?.dataType === 'moveObject') {
        const fields = obj.data.content.fields as any
        const fruits = fields.fruits || []
        setInventoryUsed(fruits.length)
        setInventoryMax(Number(fields.max_slots || 20))
      }
    } catch (error) {
      console.error('Error fetching inventory:', error)
    }
  }, [inventoryId, suiClient])

  useEffect(() => {
    fetchAllLands()
  }, [fetchAllLands])

  useEffect(() => {
    fetchLandData()
    fetchInventoryData()
  }, [fetchLandData, fetchInventoryData])

  // Create first land (for new players)
  const createFirstLand = async () => {
    setTxStatus('🏡 Creating your first land...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::create_first_land`,
      arguments: [
        tx.object(CLOCK_OBJECT),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🎉 Land created!')
          if (onDataChanged) await onDataChanged()
          setTimeout(() => setTxStatus(''), 2000)
        },
        onError: (error) => {
          console.error('Error creating land:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  // Buy additional land
  const buyNewLand = async () => {
    if (!account?.address) return
    
    const costInSeeds = Number(NEW_LAND_COST)
    if (playerSeeds < costInSeeds) {
      setTxStatus(`❌ Not enough seeds! Need ${costInSeeds} SEED`)
      return
    }
    
    setTxStatus('🏡 Buying new land...')
    
    // Get all SEED coins
    const seedCoins = await suiClient.getCoins({
      owner: account.address,
      coinType: SEED_COIN_TYPE,
    })
    
    if (seedCoins.data.length === 0) {
      setTxStatus('❌ No SEED coins found')
      return
    }
    
    const tx = new Transaction()
    
    // Merge all coins into first one if multiple coins exist
    if (seedCoins.data.length > 1) {
      const coinIds = seedCoins.data.map(coin => tx.object(coin.coinObjectId))
      tx.mergeCoins(coinIds[0], coinIds.slice(1))
    }
    
    // Split exact amount needed from merged coin
    const cost = NEW_LAND_COST * seedScale
    const [payment] = tx.splitCoins(
      tx.object(seedCoins.data[0].coinObjectId),
      [tx.pure.u64(cost)]
    )
    
    tx.moveCall({
      target: `${PACKAGE_ID}::land::buy_new_land`,
      arguments: [
        payment,
        tx.object(SEED_ADMIN_CAP),
        tx.object(CLOCK_OBJECT),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🎉 New land purchased!')
          fetchAllLands()
          if (onDataChanged) await onDataChanged()
          setTimeout(() => setTxStatus(''), 2000)
        },
        onError: (error) => {
          console.error('Error buying land:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  // Upgrade land to get more slots
  const upgradeLand = async () => {
    if (!activeLandId || !account?.address) return
    
    // Cost doubles with each level: 100, 200, 400, 800...
    const costInSeeds = Number(LAND_UPGRADE_BASE_COST) * (1 << landLevel)
    if (playerSeeds < costInSeeds) {
      setTxStatus(`❌ Not enough seeds! Need ${costInSeeds} SEED`)
      return
    }
    
    setTxStatus('⬆️ Upgrading land...')
    
    // Get all SEED coins
    const seedCoins = await suiClient.getCoins({
      owner: account.address,
      coinType: SEED_COIN_TYPE,
    })
    
    if (seedCoins.data.length === 0) {
      setTxStatus('❌ No SEED coins found')
      return
    }
    
    const tx = new Transaction()
    
    // Merge all coins into first one if multiple coins exist
    if (seedCoins.data.length > 1) {
      const coinIds = seedCoins.data.map(coin => tx.object(coin.coinObjectId))
      tx.mergeCoins(coinIds[0], coinIds.slice(1))
    }
    
    // Split the required amount
    const cost = LAND_UPGRADE_BASE_COST * BigInt(1 << landLevel) * seedScale
    const [payment] = tx.splitCoins(
      tx.object(seedCoins.data[0].coinObjectId),
      [tx.pure.u64(cost)]
    )
    
    tx.moveCall({
      target: `${PACKAGE_ID}::land::upgrade_land`,
      arguments: [
        tx.object(activeLandId),
        payment,
        tx.object(SEED_ADMIN_CAP),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🎉 Land upgraded!')
          fetchAllLands()
          await fetchLandData()
          if (onDataChanged) await onDataChanged()
          setTimeout(() => setTxStatus(''), 2000)
        },
        onError: (error) => {
          console.error('Error upgrading land:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  // Plant in single slot
  const plantInSlot = async () => {
    console.log('plantInSlot called', { activeLandId, plantSlotIndex, seedsToPlant })
    
    if (!activeLandId) {
      setTxStatus('❌ Land not found')
      return
    }
    if (plantSlotIndex === null) {
      setTxStatus('❌ No slot selected')
      return
    }
    if (!account?.address) {
      setTxStatus('❌ Wallet not connected')
      return
    }
    if (playerSeeds < seedsToPlant) {
      setTxStatus(`❌ Not enough seeds! You have ${playerSeeds}, need ${seedsToPlant}`)
      return
    }
    
    setTxStatus(`🌱 Planting ${seedsToPlant} seeds in slot ${plantSlotIndex + 1}...`)
    setShowPlantModal(false)
    
    // Get all SEED coins
    const seedCoins = await suiClient.getCoins({
      owner: account.address,
      coinType: SEED_COIN_TYPE,
    })
    
    if (seedCoins.data.length === 0) {
      setTxStatus('❌ No SEED coins found')
      return
    }
    
    const tx = new Transaction()
    
    // Merge all coins into first one if multiple coins exist
    if (seedCoins.data.length > 1) {
      const coinIds = seedCoins.data.map(coin => tx.object(coin.coinObjectId))
      tx.mergeCoins(coinIds[0], coinIds.slice(1))
    }
    
    // Split the required amount (with decimals)
    const amountWithDecimals = BigInt(seedsToPlant) * seedScale
    const [payment] = tx.splitCoins(
      tx.object(seedCoins.data[0].coinObjectId),
      [tx.pure.u64(amountWithDecimals)]
    )
    
    tx.moveCall({
      target: `${PACKAGE_ID}::land::plant_in_slot`,
      arguments: [
        tx.object(activeLandId),
        tx.pure.u64(plantSlotIndex),
        payment,
        tx.object(SEED_ADMIN_CAP),
        tx.object(CLOCK_OBJECT),
        tx.object(RANDOM_OBJECT),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🌳 Seed planted!')
          await fetchLandData()
          if (onDataChanged) await onDataChanged()
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error planting:', error)
          setTxStatus('Error: ' + error.message)
          setTimeout(() => setTxStatus(''), 5000)
        },
      }
    )
  }

  // Plant all empty slots (current land)
  const plantAll = async () => {
    console.log('plantAll called', { activeLandId, batchSeeds })
    
    if (!account) {
      setTxStatus('❌ Please connect your wallet first')
      return
    }
    if (!activeLandId) {
      setTxStatus('❌ Land not found')
      return
    }
    if (!account?.address) {
      setTxStatus('❌ Wallet not connected')
      return
    }
    
    const emptyCount = slots.filter(s => !s.fruit).length
    if (emptyCount === 0) {
      setTxStatus('No empty slots!')
      return
    }
    
    const totalNeeded = batchSeeds * emptyCount
    if (playerSeeds < totalNeeded) {
      setTxStatus(`❌ Not enough seeds! You have ${playerSeeds}, need ${totalNeeded}`)
      return
    }
    
    setTxStatus(`🌱 Planting ${batchSeeds} seeds in ${emptyCount} slots...`)
    setShowBatchModal(false)
    
    // Get all SEED coins
    const seedCoins = await suiClient.getCoins({
      owner: account.address,
      coinType: SEED_COIN_TYPE,
    })
    
    if (seedCoins.data.length === 0) {
      setTxStatus('❌ No SEED coins found')
      return
    }
    
    const tx = new Transaction()
    
    // Merge all coins into first one if multiple coins exist
    if (seedCoins.data.length > 1) {
      const coinIds = seedCoins.data.map(coin => tx.object(coin.coinObjectId))
      tx.mergeCoins(coinIds[0], coinIds.slice(1))
    }
    
    // Total amount needed (with decimals)
    const totalAmountWithDecimals = BigInt(totalNeeded) * seedScale
    const [payment] = tx.splitCoins(
      tx.object(seedCoins.data[0].coinObjectId),
      [tx.pure.u64(totalAmountWithDecimals)]
    )
    
    tx.moveCall({
      target: `${PACKAGE_ID}::land::plant_all`,
      arguments: [
        tx.object(activeLandId),
        payment,
        tx.pure.u64(BigInt(batchSeeds) * seedScale), // seeds_per_slot with decimals
        tx.object(SEED_ADMIN_CAP),
        tx.object(CLOCK_OBJECT),
        tx.object(RANDOM_OBJECT),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          await fetchLandData()
          if (onDataChanged) await onDataChanged()
          setTxStatus(`🌳 Planted in ${emptyCount} slots!`)
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error batch planting:', error)
          setTxStatus('Error: ' + error.message)
          setTimeout(() => setTxStatus(''), 5000)
        },
      }
    )
  }

  // Force harvest (triggers auto-harvest)
  const forceHarvest = async (skipWarning = false) => {
    console.log('forceHarvest called', { activeLandId, inventoryId })
    
    if (!activeLandId) {
      setTxStatus('❌ Land not found')
      setTimeout(() => setTxStatus(''), 3000)
      return
    }
    
    if (!inventoryId) {
      setTxStatus('❌ Inventory not found. Creating player account...')
      // Auto-create player account (which includes inventory)
      const tx = new Transaction()
      tx.moveCall({
        target: `${PACKAGE_ID}::player::create_player`,
        arguments: [
          tx.object(CLOCK_OBJECT),
        ],
      })
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            await suiClient.waitForTransaction({ digest: result.digest })
            setTxStatus('✅ Account created! Now try harvesting again.')
            onDataChanged?.()
            setTimeout(() => setTxStatus(''), 3000)
          },
          onError: (error) => {
            console.error('Error creating player:', error)
            setTxStatus('Error: ' + error.message)
          },
        }
      )
      return
    }
    
    // Count ready fruits
    const readyCount = slots.filter(s => {
      if (!s.fruit) return false
      const effectiveGrowTime = getEffectiveGrowTime(s)
      return currentTime >= s.fruit.plantedAt + effectiveGrowTime
    }).length
    
    // Check inventory capacity
    const availableSlots = inventoryMax - inventoryUsed
    if (!skipWarning && readyCount > availableSlots) {
      setShowHarvestWarning(true)
      return
    }
    
    setTxStatus('🌾 Harvesting ready fruits...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::harvest_ready`,
      arguments: [
        tx.object(activeLandId),
        tx.object(inventoryId),
        tx.object(CLOCK_OBJECT),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🍎 Fruits harvested to inventory!')
          fetchLandData()
          fetchInventoryData()
          onDataChanged?.()
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error harvesting:', error)
          setTxStatus('Error: ' + error.message)
          setTimeout(() => setTxStatus(''), 5000)
        },
      }
    )
  }

  // Mint test seeds (for testing/hackathon) - SPONSORED TRANSACTION (no wallet popup!)
  const mintTestSeeds = async () => {
    if (!account?.address) {
      setTxStatus('❌ Connect wallet first')
      setTimeout(() => setTxStatus(''), 3000)
      return
    }
    
    setTxStatus('🌱 Minting 1000 test seeds...')
    
    try {
      // Multiply by 10^9 for 9 decimals
      const amountWithDecimals = 1000n * seedScale
      
      // Use sponsored transaction - NO WALLET POPUP!
      const result = await mintSeedsToUser(
        account.address,
        amountWithDecimals,
        PACKAGE_ID,
        SEED_ADMIN_CAP
      )
      
      await sponsorClient.waitForTransaction({ digest: result.digest })
      if (onDataChanged) await onDataChanged()
      setTxStatus('🎉 Got 1000 seeds!')
      setTimeout(() => setTxStatus(''), 2000)
    } catch (error) {
      console.error('Error minting seeds:', error)
      setTxStatus('Error: ' + (error instanceof Error ? error.message : String(error)))
      setTimeout(() => setTxStatus(''), 5000)
    }
  }

  // Get effective grow time for a slot (accounting for speed boosts from contract)
  const getEffectiveGrowTime = (slot: Slot): number => {
    if (!slot.fruit) return 0
    const baseGrowTime = getGrowTime(slot.fruit.rarity)
    // Use speed boost from contract OR local state (for immediate UI feedback)
    const contractBoost = slot.fruit.speedBoostMs || 0
    const localBoost = slotSpeedBoosts[slot.index] || 0
    const totalBoost = Math.max(contractBoost, localBoost)
    return Math.max(baseGrowTime - totalBoost, 1000) // Minimum 1 second
  }

  const emptySlots = slots.filter(s => !s.fruit).length
  const readySlots = slots.filter(s => {
    if (!s.fruit) return false
    const effectiveGrowTime = getEffectiveGrowTime(s)
    return currentTime >= s.fruit.plantedAt + effectiveGrowTime
  }).length

  // Plant all lands at once
  const plantAllLands = async () => {
    if (!account?.address || allLands.length === 0) return
    
    setTxStatus(`🌱 Planting in all ${allLands.length} lands...`)
    
    // Get SEED coins
    const seedCoins = await suiClient.getCoins({
      owner: account.address,
      coinType: SEED_COIN_TYPE,
    })
    
    if (seedCoins.data.length === 0) {
      setTxStatus('❌ No SEED coins found')
      return
    }
    
    const tx = new Transaction()
    
    // Merge coins
    if (seedCoins.data.length > 1) {
      const coinIds = seedCoins.data.map(coin => tx.object(coin.coinObjectId))
      tx.mergeCoins(coinIds[0], coinIds.slice(1))
    }
    
    // For each land, call plant_all
    for (const land of allLands) {
      const seedsPerLand = BigInt(batchSeeds * 6) * seedScale // Assume 6 slots avg
      const [payment] = tx.splitCoins(
        tx.object(seedCoins.data[0].coinObjectId),
        [tx.pure.u64(seedsPerLand)]
      )
      
      tx.moveCall({
        target: `${PACKAGE_ID}::land::plant_all`,
        arguments: [
          tx.object(land.id),
          payment,
          tx.pure.u64(BigInt(batchSeeds) * seedScale), // seeds_per_slot with decimals
          tx.object(SEED_ADMIN_CAP),
          tx.object(CLOCK_OBJECT),
          tx.object(RANDOM_OBJECT),
        ],
      })
    }
    
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          await fetchAllLands()
          await fetchLandData()
          if (onDataChanged) await onDataChanged()
          setTxStatus(`🌳 Planted in all ${allLands.length} lands!`)
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error planting all lands:', error)
          setTxStatus('Error: ' + error.message)
          setTimeout(() => setTxStatus(''), 5000)
        },
      }
    )
  }

  // Use watering can on a slot (25% speed boost) - calls contract
  const useWateringCan = async (slotIndex: number) => {
    const slot = slots.find(s => s.index === slotIndex)
    if (!slot?.fruit || !account?.address || !activeLandId) {
      setTxStatus('❌ No plant in this slot!')
      setTimeout(() => setTxStatus(''), 2000)
      return
    }
    
    setTxStatus('🚿 Using watering can...')
    
    try {
      // Get SEED coins
      const seedCoins = await suiClient.getCoins({
        owner: account.address,
        coinType: SEED_COIN_TYPE,
      })
      
      if (seedCoins.data.length === 0) {
        setTxStatus('❌ No SEED coins found')
        setTimeout(() => setTxStatus(''), 2000)
        return
      }
      
      const tx = new Transaction()
      
      // Merge coins if multiple
      if (seedCoins.data.length > 1) {
        const coinIds = seedCoins.data.map(coin => tx.object(coin.coinObjectId))
        tx.mergeCoins(coinIds[0], coinIds.slice(1))
      }
      
      const cost = 50n * seedScale // Watering can cost
      const coinToUse = tx.splitCoins(tx.object(seedCoins.data[0].coinObjectId), [cost])
      
      tx.moveCall({
        target: `${PACKAGE_ID}::land::use_watering_can`,
        arguments: [
          tx.object(activeLandId),
          tx.pure.u64(slotIndex),
          coinToUse,
          tx.object(SEED_ADMIN_CAP),
        ],
      })
      
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            await suiClient.waitForTransaction({ digest: result.digest })
            // Update local state for immediate feedback
            const baseGrowTime = getGrowTime(slot.fruit!.rarity)
            const speedBoost = Math.floor(baseGrowTime * 0.25)
            setSlotSpeedBoosts(prev => ({
              ...prev,
              [slotIndex]: (prev[slotIndex] || 0) + speedBoost
            }))
            if (onDataChanged) onDataChanged()
            setTxStatus('🚿 Watered! Growth sped up by 25%!')
            setTimeout(() => setTxStatus(''), 2000)
          },
          onError: (error) => {
            console.error('Error using watering can:', error)
            setTxStatus('❌ Failed to use watering can')
            setTimeout(() => setTxStatus(''), 2000)
          },
        }
      )
    } catch (error) {
      console.error('Error using watering can:', error)
      setTxStatus('❌ Error: ' + (error as Error).message)
      setTimeout(() => setTxStatus(''), 2000)
    }
    setSelectedTool(null)
  }

  // Use fertilizer on a slot (50% speed boost) - calls contract
  const useFertilizer = async (slotIndex: number) => {
    const slot = slots.find(s => s.index === slotIndex)
    if (!slot?.fruit || !account?.address || !activeLandId) {
      setTxStatus('❌ No plant in this slot!')
      setTimeout(() => setTxStatus(''), 2000)
      return
    }
    
    setTxStatus('🧪 Using fertilizer...')
    
    try {
      // Get SEED coins
      const seedCoins = await suiClient.getCoins({
        owner: account.address,
        coinType: SEED_COIN_TYPE,
      })
      
      if (seedCoins.data.length === 0) {
        setTxStatus('❌ No SEED coins found')
        setTimeout(() => setTxStatus(''), 2000)
        return
      }
      
      const tx = new Transaction()
      
      // Merge coins if multiple
      if (seedCoins.data.length > 1) {
        const coinIds = seedCoins.data.map(coin => tx.object(coin.coinObjectId))
        tx.mergeCoins(coinIds[0], coinIds.slice(1))
      }
      
      const cost = 100n * seedScale // Fertilizer cost
      const coinToUse = tx.splitCoins(tx.object(seedCoins.data[0].coinObjectId), [cost])
      
      tx.moveCall({
        target: `${PACKAGE_ID}::land::use_fertilizer`,
        arguments: [
          tx.object(activeLandId),
          tx.pure.u64(slotIndex),
          coinToUse,
          tx.object(SEED_ADMIN_CAP),
        ],
      })
      
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            await suiClient.waitForTransaction({ digest: result.digest })
            // Update local state for immediate feedback
            const baseGrowTime = getGrowTime(slot.fruit!.rarity)
            const speedBoost = Math.floor(baseGrowTime * 0.50)
            setSlotSpeedBoosts(prev => ({
              ...prev,
              [slotIndex]: (prev[slotIndex] || 0) + speedBoost
            }))
            if (onDataChanged) onDataChanged()
            setTxStatus('🧪 Fertilized! Growth sped up by 50%!')
            setTimeout(() => setTxStatus(''), 2000)
          },
          onError: (error) => {
            console.error('Error using fertilizer:', error)
            setTxStatus('❌ Failed to use fertilizer')
            setTimeout(() => setTxStatus(''), 2000)
          },
        }
      )
    } catch (error) {
      console.error('Error using fertilizer:', error)
      setTxStatus('❌ Error: ' + (error as Error).message)
      setTimeout(() => setTxStatus(''), 2000)
    }
    setSelectedTool(null)
  }

  // Use shovel on a slot (remove planted fruit) - calls contract
  const useShovel = async (slotIndex: number) => {
    const slot = slots.find(s => s.index === slotIndex)
    if (!slot?.fruit || !account?.address || !activeLandId) {
      setTxStatus('❌ No plant in this slot!')
      setTimeout(() => setTxStatus(''), 2000)
      return
    }
    
    setTxStatus('🪓 Using shovel...')
    
    try {
      // Get SEED coins
      const seedCoins = await suiClient.getCoins({
        owner: account.address,
        coinType: SEED_COIN_TYPE,
      })
      
      if (seedCoins.data.length === 0) {
        setTxStatus('❌ No SEED coins found')
        setTimeout(() => setTxStatus(''), 2000)
        return
      }
      
      const tx = new Transaction()
      
      // Merge coins if multiple
      if (seedCoins.data.length > 1) {
        const coinIds = seedCoins.data.map(coin => tx.object(coin.coinObjectId))
        tx.mergeCoins(coinIds[0], coinIds.slice(1))
      }
      
      const cost = 25n * seedScale // Shovel cost
      const coinToUse = tx.splitCoins(tx.object(seedCoins.data[0].coinObjectId), [cost])
      
      tx.moveCall({
        target: `${PACKAGE_ID}::land::use_shovel`,
        arguments: [
          tx.object(activeLandId),
          tx.pure.u64(slotIndex),
          coinToUse,
          tx.object(SEED_ADMIN_CAP),
        ],
      })
      
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            await suiClient.waitForTransaction({ digest: result.digest })
            // Update local state for immediate feedback
            setSlots(prev => prev.map(s => 
              s.index === slotIndex ? { ...s, fruit: null } : s
            ))
            setSlotSpeedBoosts(prev => {
              const newBoosts = { ...prev }
              delete newBoosts[slotIndex]
              return newBoosts
            })
            if (onDataChanged) onDataChanged()
            setTxStatus('🪓 Plant removed!')
            setTimeout(() => setTxStatus(''), 2000)
          },
          onError: (error) => {
            console.error('Error using shovel:', error)
            setTxStatus('❌ Failed to use shovel')
            setTimeout(() => setTxStatus(''), 2000)
          },
        }
      )
    } catch (error) {
      console.error('Error using shovel:', error)
      setTxStatus('❌ Error: ' + (error as Error).message)
      setTimeout(() => setTxStatus(''), 2000)
    }
    setSelectedTool(null)
  }

  // Click on empty slot
  const handleSlotClick = (slot: Slot) => {
    console.log('handleSlotClick', { slot, playerSeeds, activeLandId, selectedTool })
    
    // If a tool is selected, use it on the slot
    if (selectedTool) {
      if (!slot.fruit) {
        setTxStatus('❌ Select a slot with a plant!')
        setTimeout(() => setTxStatus(''), 2000)
        return
      }
      
      switch (selectedTool) {
        case 'wateringCan':
          useWateringCan(slot.index)
          break
        case 'fertilizer':
          useFertilizer(slot.index)
          break
        case 'shovel':
          useShovel(slot.index)
          break
      }
      return
    }
    
    if (!slot.fruit) {
      // Empty slot - open plant modal
      if (playerSeeds > 0) {
        console.log('Opening plant modal for slot', slot.index)
        setPlantSlotIndex(slot.index)
        setSeedsToPlant(1)
        setShowPlantModal(true)
      } else {
        setTxStatus('❌ You need seeds! Play the game or mint test seeds.')
        setTimeout(() => setTxStatus(''), 3000)
      }
    } else {
      // Has fruit - check if ready, trigger harvest
      const effectiveGrowTime = getEffectiveGrowTime(slot)
      const isReady = currentTime >= slot.fruit.plantedAt + effectiveGrowTime
      if (isReady) {
        forceHarvest()
      } else {
        const timeLeft = Math.max(0, Math.ceil((slot.fruit.plantedAt + effectiveGrowTime - currentTime) / 1000))
        setTxStatus(`⏱️ Still growing... ${formatTimeLeft(timeLeft)} left`)
        setTimeout(() => setTxStatus(''), 2000)
      }
    }
  }

  return (
    <div className="player-land">
      <h2>🌍 Your Farm</h2>
      
      {/* Transaction Status */}
      {txStatus && (
        <div className="tx-status">
          {isPending && <span className="spinner">⏳</span>}
          {txStatus}
        </div>
      )}



      {/* No Land */}
      {!activeLandId && account && (
        <div className="create-land-prompt">
          <h3>🏡 No Land Yet</h3>
          <p>Create your first land for FREE!</p>
          <button onClick={createFirstLand} disabled={isPending}>
            {isPending ? 'Creating...' : '🌱 Create First Land'}
          </button>
        </div>
      )}

      {/* No PlayerAccount */}
      {!account && (
        <div className="create-account-prompt">
          <h3>🎮 Create Account First</h3>
          <p>You need to create a player account before getting land.</p>
        </div>
      )}

      {/* Has Land */}
      {activeLandId && (
        <>
          {/* Land Switcher */}
          {allLands.length > 1 && (
            <div className="land-switcher">
              <span className="switcher-label">🏞️ Your Lands:</span>
              <div className="land-tabs">
                {allLands.map((land, idx) => (
                  <button
                    key={land.id}
                    className={`land-tab ${land.id === activeLandId ? 'active' : ''}`}
                    onClick={() => setActiveLandId(land.id)}
                  >
                    Land {idx + 1}
                    <span className="land-tab-info">Lv.{land.level}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Land Info */}
          <div className="land-info">
            <span>Level {landLevel}</span>
            <span>{maxSlots} slots</span>
          </div>

          {/* Action Buttons */}
          <div className="land-actions">
            {emptySlots > 0 && (
              <button 
                onClick={() => {
                  if (playerSeeds === 0) {
                    setTxStatus('❌ You need seeds first! Play the game or mint test seeds.')
                    setTimeout(() => setTxStatus(''), 3000)
                    return
                  }
                  setShowBatchModal(true)
                }} 
                disabled={isPending}
                className={playerSeeds > 0 ? '' : 'disabled-hint'}
              >
                🌱 Plant All ({emptySlots} slots) {playerSeeds === 0 && '- Need seeds!'}
              </button>
            )}
            {readySlots > 0 && (
              <button onClick={() => forceHarvest()} disabled={isPending}>
                🌾 Harvest All ({readySlots} ready)
              </button>
            )}
            {allLands.length > 1 && (
              <button 
                onClick={() => {
                  if (playerSeeds === 0) {
                    setTxStatus('❌ You need seeds first!')
                    setTimeout(() => setTxStatus(''), 3000)
                    return
                  }
                  setAllLandsSeedsPerSlot(1)
                  setShowPlantAllLandsModal(true)
                }}
                disabled={isPending}
                className="plant-all-lands-btn"
              >
                🌍 Plant All Lands ({allLands.length} lands, ~{allLands.length * 6} slots)
              </button>
            )}
            <button 
              onClick={upgradeLand} 
              disabled={
                isPending ||
                !account ||
                playerSeeds < (Number(LAND_UPGRADE_BASE_COST) * (1 << landLevel))
              }
              title={`Costs ${Number(LAND_UPGRADE_BASE_COST) * (1 << landLevel)} SEED to upgrade`}
            >
              ⬆️ Upgrade Land — {Number(LAND_UPGRADE_BASE_COST) * (1 << landLevel)} SEED
            </button>
            <button 
              onClick={buyNewLand} 
              disabled={
                isPending ||
                !account ||
                playerSeeds < Number(NEW_LAND_COST)
              }
              title={`Costs ${Number(NEW_LAND_COST)} SEED to buy new land`}
            >
              🏡 Buy New Land — {Number(NEW_LAND_COST)} SEED
            </button>
            <button 
              onClick={mintTestSeeds} 
              disabled={isPending}
              className="mint-test-btn"
              title="Mint 1000 free test seeds (hackathon only)"
            >
              🎁 Mint 1000 Test Seeds
            </button>
          </div>

          {/* Tool Selection Bar - Always shown, tools cost SEED to use */}
          <div className="tool-bar">
            <span className="tool-bar-label">🧰 Tools (pay per use):</span>
            <div className="tool-buttons">
              <button 
                className={`tool-btn ${selectedTool === 'wateringCan' ? 'active' : ''}`}
                onClick={() => setSelectedTool(selectedTool === 'wateringCan' ? null : 'wateringCan')}
              >
                🚿 Watering Can (50 🌱)
              </button>
              <button 
                className={`tool-btn ${selectedTool === 'fertilizer' ? 'active' : ''}`}
                onClick={() => setSelectedTool(selectedTool === 'fertilizer' ? null : 'fertilizer')}
              >
                🧪 Fertilizer (100 🌱)
              </button>
              <button 
                className={`tool-btn ${selectedTool === 'shovel' ? 'active' : ''}`}
                onClick={() => setSelectedTool(selectedTool === 'shovel' ? null : 'shovel')}
              >
                🪓 Shovel (25 🌱)
              </button>
            </div>
            {selectedTool && (
              <div className="tool-hint">
                Click on a planted slot to use the {selectedTool === 'wateringCan' ? 'Watering Can (-25% time)' : selectedTool === 'fertilizer' ? 'Fertilizer (-50% time)' : 'Shovel (remove plant)'}
                <button className="cancel-tool-btn" onClick={() => setSelectedTool(null)}>✕ Cancel</button>
              </div>
            )}
          </div>

          {/* Slots Grid */}
          <div className={`slots-grid ${selectedTool ? 'tool-mode' : ''}`}>
            {slots.map((slot) => {
              const effectiveGrowTime = slot.fruit ? getEffectiveGrowTime(slot) : 0
              const isReady = slot.fruit && currentTime >= slot.fruit.plantedAt + effectiveGrowTime
              const timeLeft = slot.fruit ? Math.max(0, Math.ceil((slot.fruit.plantedAt + effectiveGrowTime - currentTime) / 1000)) : 0
              const fruitData = slot.fruit ? FRUITS[slot.fruit.fruitType - 1] : null
              const hasBoosted = (slot.fruit?.speedBoostMs || 0) > 0 || (slotSpeedBoosts[slot.index] || 0) > 0
              
              return (
                <div
                  key={slot.index}
                  className={`slot ${!slot.fruit ? 'empty' : isReady ? 'ready' : 'growing'} ${selectedTool && slot.fruit ? 'tool-target' : ''}`}
                  onClick={() => handleSlotClick(slot)}
                >
                  {!slot.fruit ? (
                    <div className="slot-empty">
                      <img src={chauDat} alt="Soil" className="soil-img" />
                      <div className="slot-overlay">
                        <span className="slot-icon">➕</span>
                        <span className="slot-label">Plant</span>
                      </div>
                    </div>
                  ) : isReady ? (
                    <div className="slot-ready">
                      <img src={chauDatTuoiCay} alt="Pot" className="soil-img" />
                      <div className="fruit-display">
                        <img src={fruitData?.image} alt={fruitData?.name} className="fruit-img-ready" />
                        <span className="slot-name">{fruitData?.name}</span>
                        <div className="slot-stats">
                          <span className="slot-rarity" style={{ color: RARITY_COLORS[slot.fruit.rarity - 1] }}>
                            {RARITIES[slot.fruit.rarity - 1]}
                          </span>
                          <span className="slot-weight"> • {slot.fruit.weight >= 1000 ? `${(slot.fruit.weight / 1000).toFixed(2)}kg` : `${slot.fruit.weight}g`}</span>
                        </div>
                      </div>
                      <span className="slot-harvest">🌾 Tap to Harvest</span>
                    </div>
                  ) : (
                    <div className="slot-growing">
                      <img src={chauDatNayMam} alt="Growing" className="soil-img" />
                      <div className="slot-overlay">
                        <div className="growth-timer">
                          <span className="timer-icon">⏱️</span>
                          <span className="timer-text">{formatTimeLeft(timeLeft)}</span>
                          {hasBoosted && <span className="boost-indicator">⚡</span>}
                        </div>
                        <div className="growth-progress">
                          <div 
                            className={`growth-bar ${hasBoosted ? 'boosted' : ''}`}
                            style={{ width: `${Math.min(100, ((effectiveGrowTime - (timeLeft * 1000)) / effectiveGrowTime) * 100)}%` }}
                          ></div>
                        </div>
                        <span className="slot-seeds">{slot.fruit.seedsUsed} seeds</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Plant Single Modal */}
      {showPlantModal && (
        <div className="modal-overlay" onClick={() => setShowPlantModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>🌱 Plant in Slot {(plantSlotIndex ?? 0) + 1}</h3>
            <p>More seeds = higher chance for rare fruits!</p>
            <div className="modal-input">
              <label>Seeds to plant:</label>
              <input
                type="number"
                min="1"
                max={playerSeeds}
                value={seedsToPlant}
                onChange={(e) => setSeedsToPlant(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowPlantModal(false)}>Cancel</button>
              <button onClick={plantInSlot} disabled={isPending || playerSeeds < seedsToPlant}>
                🌱 Plant
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Plant Modal */}
      {showBatchModal && (
        <div className="modal-overlay" onClick={() => setShowBatchModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>🌱 Plant All Empty Slots</h3>
            <p>Plant in {emptySlots} empty slots</p>
            <div className="modal-input">
              <label>Seeds per slot:</label>
              <input
                type="number"
                min="1"
                max={Math.floor(playerSeeds / emptySlots)}
                value={batchSeeds}
                onChange={(e) => setBatchSeeds(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <p className="modal-total">Cost: {playerSeeds} → {Math.max(0, playerSeeds - (batchSeeds * emptySlots))} seeds</p>
            <div className="modal-actions">
              <button onClick={() => setShowBatchModal(false)}>Cancel</button>
              <button onClick={plantAll} disabled={isPending || playerSeeds < batchSeeds * emptySlots}>
                🌱 Plant All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Harvest Warning Modal */}
      {showHarvestWarning && (
        <div className="modal-overlay" onClick={() => setShowHarvestWarning(false)}>
          <div className="modal warning-modal" onClick={e => e.stopPropagation()}>
            <h3>⚠️ Inventory Almost Full!</h3>
            <p>
              You have <strong>{slots.filter(s => {
                if (!s.fruit) return false
                const effectiveGrowTime = getEffectiveGrowTime(s)
                return currentTime >= s.fruit.plantedAt + effectiveGrowTime
              }).length}</strong> fruits ready to harvest, 
              but only <strong>{inventoryMax - inventoryUsed}</strong> inventory slots available.
            </p>
            <p>Some fruits may not be harvested. Consider upgrading your inventory first.</p>
            <div className="inventory-status">
              <span>📦 Inventory: {inventoryUsed} / {inventoryMax}</span>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowHarvestWarning(false)}>Cancel</button>
              <button 
                className="btn-warning"
                onClick={() => {
                  setShowHarvestWarning(false)
                  forceHarvest(true) // Skip warning on retry
                }}
              >
                Harvest Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plant All Lands Modal */}
      {showPlantAllLandsModal && (
        <div className="modal-overlay" onClick={() => setShowPlantAllLandsModal(false)}>
          <div className="modal plant-modal" onClick={e => e.stopPropagation()}>
            <h3>🌍 Plant All Lands</h3>
            <p>
              You have <strong>{allLands.length}</strong> lands with approximately <strong>{allLands.length * 6}</strong> empty slots total.
            </p>
            <div className="plant-input-section">
              <label>🌱 Seeds per slot:</label>
              <input
                type="number"
                min="1"
                max="100"
                value={allLandsSeedsPerSlot}
                onChange={e => setAllLandsSeedsPerSlot(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="cost-preview">
              <p>💰 Estimated cost: <strong>{allLandsSeedsPerSlot * allLands.length * 6}</strong> SEED</p>
              <p className="balance-info">Your balance: <strong>{playerSeeds}</strong> SEED</p>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowPlantAllLandsModal(false)}>Cancel</button>
              <button 
                className="btn-primary"
                disabled={isPending || playerSeeds < allLandsSeedsPerSlot * allLands.length * 6}
                onClick={() => {
                  setShowPlantAllLandsModal(false)
                  setBatchSeeds(allLandsSeedsPerSlot)
                  plantAllLands()
                }}
              >
                {isPending ? '⏳ Planting...' : '🌱 Plant All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
