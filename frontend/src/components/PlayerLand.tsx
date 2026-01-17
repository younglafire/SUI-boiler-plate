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
const GROW_TIMES_BY_RARITY: Record<number, number> = {
  1: 15000,   // Common
  2: 30000,   // Uncommon
  3: 60000,   // Rare
  4: 180000,  // Epic
  5: 480000,  // Legendary
}

const getGrowTime = (rarity: number): number => {
  return GROW_TIMES_BY_RARITY[rarity] || GROW_TIMES_BY_RARITY[1]
}

const formatTimeLeft = (seconds: number): string => {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }
  return `${seconds}s`
}

const SEED_ADMIN_CAP = '0x4d1847752f9470d9cd83a6c76b71801c32623b1c095c8d1f666500223cbfd5ac'
const SEED_COIN_TYPE = `${PACKAGE_ID}::seed::SEED`
const SEED_DECIMALS_FALLBACK = 1_000_000_000n
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
const RARITY_COLORS = ['#95a5a6', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f']

interface PlantedFruit {
  fruitType: number
  rarity: number
  weight: number
  seedsUsed: number
  plantedAt: number
  speedBoostMs: number
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
  
  const [allLands, setAllLands] = useState<LandInfo[]>([])
  const [activeLandId, setActiveLandId] = useState<string | null>(initialLandId)
  
  const [slots, setSlots] = useState<Slot[]>([])
  const [landLevel, setLandLevel] = useState(1)
  const [maxSlots, setMaxSlots] = useState(4)
  const [txStatus, setTxStatus] = useState('')
  const [currentTime, setCurrentTime] = useState(Date.now())
  
  const [inventoryUsed, setInventoryUsed] = useState(0)
  const [inventoryMax, setInventoryMax] = useState(20)
  
  const [showPlantModal, setShowPlantModal] = useState(false)
  const [plantSlotIndex, setPlantSlotIndex] = useState<number | null>(null)
  const [seedsToPlant, setSeedsToPlant] = useState(1)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchSeeds, setBatchSeeds] = useState(1)
  const [showHarvestWarning, setShowHarvestWarning] = useState(false)
  const [showPlantAllLandsModal, setShowPlantAllLandsModal] = useState(false)
  const [allLandsSeedsPerSlot, setAllLandsSeedsPerSlot] = useState(1)
  
  const [selectedTool, setSelectedTool] = useState<ShopItemKey | null>(null)
  const [slotSpeedBoosts, setSlotSpeedBoosts] = useState<Record<number, number>>({})

  useEffect(() => {
    if (initialLandId && !activeLandId) {
      setActiveLandId(initialLandId)
    }
  }, [initialLandId, activeLandId])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

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
      lands.sort((a, b) => a.index - b.index)
      setAllLands(lands)
      if (!activeLandId && lands.length > 0) setActiveLandId(lands[0].id)
    } catch (error) { console.error(error) }
  }, [account?.address, suiClient, activeLandId])

  const fetchLandData = useCallback(async () => {
    if (!activeLandId) return
    try {
      const landObj = await suiClient.getObject({ id: activeLandId, options: { showContent: true } })
      if (landObj.data?.content && 'fields' in landObj.data.content) {
        const fields = landObj.data.content.fields as Record<string, any>
        setLandLevel(Number(fields.level || 1))
        setMaxSlots(Number(fields.max_slots || 4))
        const slotsData = fields.slots || []
        const parsedSlots: Slot[] = []
        for (let i = 0; i < slotsData.length; i++) {
          const slotOption = slotsData[i]
          if (slotOption?.fields) {
            const slotData = slotOption.fields
            parsedSlots.push({
              index: i,
              fruit: {
                fruitType: Number(slotData.fruit_type || 1),
                rarity: Number(slotData.rarity || 1),
                weight: Number(slotData.weight || 100),
                seedsUsed: Math.floor(Number(slotData.seeds_used || 1) / Number(seedScale)),
                plantedAt: Number(slotData.planted_at || 0),
                speedBoostMs: Number(slotData.speed_boost_ms || 0),
              }
            })
          } else { parsedSlots.push({ index: i, fruit: null }) }
        }
        setSlots(parsedSlots)
      }
    } catch (error) { console.error(error) }
  }, [activeLandId, suiClient, seedScale])

  const fetchInventoryData = useCallback(async () => {
    if (!inventoryId) return
    try {
      const obj = await suiClient.getObject({ id: inventoryId, options: { showContent: true } })
      if (obj.data?.content?.dataType === 'moveObject') {
        const fields = obj.data.content.fields as any
        setInventoryUsed((fields.fruits || []).length)
        setInventoryMax(Number(fields.max_slots || 20))
      }
    } catch (error) { console.error(error) }
  }, [inventoryId, suiClient])

  useEffect(() => { fetchAllLands() }, [fetchAllLands])
  useEffect(() => { fetchLandData(); fetchInventoryData() }, [fetchLandData, fetchInventoryData])

  const createFirstLand = async () => {
    setTxStatus('🏡 Creating your first land...')
    const tx = new Transaction()
    tx.moveCall({ target: `${PACKAGE_ID}::land::create_first_land`, arguments: [tx.object(CLOCK_OBJECT)] })
    signAndExecute({ transaction: tx }, {
      onSuccess: async (result) => {
        await suiClient.waitForTransaction({ digest: result.digest })
        setTxStatus('🎉 Land created!')
        onDataChanged?.()
        setTimeout(() => setTxStatus(''), 2000)
      },
      onError: (e) => setTxStatus('Error: ' + e.message),
    })
  }

  const buyNewLand = async () => {
    if (!account?.address) return
    const cost = Number(NEW_LAND_COST)
    if (playerSeeds < cost) { setTxStatus(`❌ Not enough seeds! Need ${cost} SEED`); return }
    setTxStatus('🏡 Buying new land...')
    const seedCoins = await suiClient.getCoins({ owner: account.address, coinType: SEED_COIN_TYPE })
    if (seedCoins.data.length === 0) return
    const tx = new Transaction()
    if (seedCoins.data.length > 1) {
      const ids = seedCoins.data.map(c => tx.object(c.coinObjectId))
      tx.mergeCoins(ids[0], ids.slice(1))
    }
    const [payment] = tx.splitCoins(tx.object(seedCoins.data[0].coinObjectId), [tx.pure.u64(NEW_LAND_COST * seedScale)])
    tx.moveCall({ target: `${PACKAGE_ID}::land::buy_new_land`, arguments: [payment, tx.object(SEED_ADMIN_CAP), tx.object(CLOCK_OBJECT)] })
    signAndExecute({ transaction: tx }, {
      onSuccess: async (result) => {
        await suiClient.waitForTransaction({ digest: result.digest })
        setTxStatus('🎉 New land purchased!')
        fetchAllLands(); onDataChanged?.()
        setTimeout(() => setTxStatus(''), 2000)
      },
      onError: (e) => setTxStatus('Error: ' + e.message),
    })
  }

  const upgradeLand = async () => {
    if (!activeLandId || !account?.address) return
    const cost = Number(LAND_UPGRADE_BASE_COST) * (1 << landLevel)
    if (playerSeeds < cost) { setTxStatus(`❌ Not enough seeds! Need ${cost} SEED`); return }
    setTxStatus('⬆️ Upgrading land...')
    const seedCoins = await suiClient.getCoins({ owner: account.address, coinType: SEED_COIN_TYPE })
    if (seedCoins.data.length === 0) return
    const tx = new Transaction()
    if (seedCoins.data.length > 1) {
      const ids = seedCoins.data.map(c => tx.object(c.coinObjectId))
      tx.mergeCoins(ids[0], ids.slice(1))
    }
    const [payment] = tx.splitCoins(tx.object(seedCoins.data[0].coinObjectId), [tx.pure.u64(LAND_UPGRADE_BASE_COST * BigInt(1 << landLevel) * seedScale)])
    tx.moveCall({ target: `${PACKAGE_ID}::land::upgrade_land`, arguments: [tx.object(activeLandId), payment, tx.object(SEED_ADMIN_CAP)] })
    signAndExecute({ transaction: tx }, {
      onSuccess: async (result) => {
        await suiClient.waitForTransaction({ digest: result.digest })
        setTxStatus('🎉 Land upgraded!')
        fetchLandData(); onDataChanged?.()
        setTimeout(() => setTxStatus(''), 2000)
      },
      onError: (e) => setTxStatus('Error: ' + e.message),
    })
  }

  // --- MINT TEST SEEDS ---
  const mintTestSeeds = async () => {
    if (!account?.address) return
    setTxStatus('🌱 Minting 1000 test seeds...')
    try {
      const amountWithDecimals = 1000n * seedScale
      const result = await mintSeedsToUser(account.address, amountWithDecimals, PACKAGE_ID, SEED_ADMIN_CAP)
      await sponsorClient.waitForTransaction({ digest: result.digest })
      setTxStatus('🎉 Got 1000 seeds!')
      if (onDataChanged) onDataChanged()
      setTimeout(() => setTxStatus(''), 2000)
    } catch (e: any) {
      console.error(e)
      setTxStatus('Error: ' + (e.message || String(e)))
    }
  }

  // --- SLOT CLICK HANDLER ---
  const handleSlotClick = (slot: Slot) => {
    console.log('Clicked slot:', slot.index, 'Tool:', selectedTool);
    
    // 1. Tool Logic
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

    // 2. Normal Logic
    if (!slot.fruit) {
      setPlantSlotIndex(slot.index)
      setShowPlantModal(true)
    } else {
      const effectiveTime = getEffectiveGrowTime(slot)
      const isReady = currentTime >= slot.fruit.plantedAt + effectiveTime
      
      if (isReady) {
        forceHarvest()
      } else {
        const timeLeft = Math.max(0, Math.ceil((slot.fruit.plantedAt + effectiveTime - currentTime) / 1000))
        setTxStatus(`⏱️ Growing... ${formatTimeLeft(timeLeft)} left`)
        setTimeout(() => setTxStatus(''), 2000)
      }
    }
  }

  // --- TOOLS ---
  const useWateringCan = async (slotIndex: number) => {
    if (!activeLandId || !account?.address) return
    setTxStatus('🚿 Watering...')
    try {
      const seedCoins = await suiClient.getCoins({ owner: account.address, coinType: SEED_COIN_TYPE })
      if (seedCoins.data.length === 0) { 
        setTxStatus('❌ Need 50 SEED'); 
        setSelectedTool(null);
        return 
      }
      
      const tx = new Transaction()
      const primaryCoin = seedCoins.data[0]
      if (seedCoins.data.length > 1) {
        const coinsToMerge = seedCoins.data.slice(1).map(c => tx.object(c.coinObjectId))
        tx.mergeCoins(tx.object(primaryCoin.coinObjectId), coinsToMerge)
      }
      
      const [payment] = tx.splitCoins(tx.object(primaryCoin.coinObjectId), [tx.pure.u64(50n * seedScale)])
      
      tx.moveCall({
        target: `${PACKAGE_ID}::land::use_watering_can`,
        arguments: [tx.object(activeLandId), tx.pure.u64(slotIndex), payment, tx.object(SEED_ADMIN_CAP)]
      })
      
      signAndExecute({ transaction: tx }, {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🚿 Watered! (-25% time)')
          setSlotSpeedBoosts(prev => {
            const slot = slots.find(s => s.index === slotIndex)
            if (!slot?.fruit) return prev
            const base = getGrowTime(slot.fruit.rarity)
            return { ...prev, [slotIndex]: (prev[slotIndex] || 0) + (base * 0.25) }
          })
          fetchLandData()
          if (onDataChanged) onDataChanged()
          setSelectedTool(null)
          setTimeout(() => setTxStatus(''), 2000)
        },
        onError: (e) => {
          console.error(e)
          setTxStatus('Error: ' + e.message)
          setSelectedTool(null)
        }
      })
    } catch (e: any) { 
      console.error(e)
      setTxStatus('Error: ' + e.message) 
      setSelectedTool(null)
    }
  }

  const useFertilizer = async (slotIndex: number) => {
    if (!activeLandId || !account?.address) return
    setTxStatus('🧪 Fertilizing...')
    try {
      const seedCoins = await suiClient.getCoins({ owner: account.address, coinType: SEED_COIN_TYPE })
      if (seedCoins.data.length === 0) { 
        setTxStatus('❌ Need 100 SEED'); 
        setSelectedTool(null);
        return 
      }
      const tx = new Transaction()
      const primaryCoin = seedCoins.data[0]
      if (seedCoins.data.length > 1) {
        const coinsToMerge = seedCoins.data.slice(1).map(c => tx.object(c.coinObjectId))
        tx.mergeCoins(tx.object(primaryCoin.coinObjectId), coinsToMerge)
      }
      const [payment] = tx.splitCoins(tx.object(primaryCoin.coinObjectId), [tx.pure.u64(100n * seedScale)])
      tx.moveCall({
        target: `${PACKAGE_ID}::land::use_fertilizer`,
        arguments: [tx.object(activeLandId), tx.pure.u64(slotIndex), payment, tx.object(SEED_ADMIN_CAP)]
      })
      signAndExecute({ transaction: tx }, {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🧪 Fertilized! (-50% time)')
          setSlotSpeedBoosts(prev => {
            const slot = slots.find(s => s.index === slotIndex)
            if (!slot?.fruit) return prev
            const base = getGrowTime(slot.fruit.rarity)
            return { ...prev, [slotIndex]: (prev[slotIndex] || 0) + (base * 0.5) }
          })
          fetchLandData()
          if (onDataChanged) onDataChanged()
          setSelectedTool(null)
          setTimeout(() => setTxStatus(''), 2000)
        },
        onError: (e) => {
          setTxStatus('Error: ' + e.message)
          setSelectedTool(null)
        }
      })
    } catch (e: any) { 
      setTxStatus('Error: ' + e.message) 
      setSelectedTool(null)
    }
  }

  const useShovel = async (slotIndex: number) => {
    if (!activeLandId || !account?.address) return
    setTxStatus('🪓 Digging...')
    try {
      const seedCoins = await suiClient.getCoins({ owner: account.address, coinType: SEED_COIN_TYPE })
      if (seedCoins.data.length === 0) { 
        setTxStatus('❌ Need 25 SEED'); 
        setSelectedTool(null);
        return 
      }
      const tx = new Transaction()
      const primaryCoin = seedCoins.data[0]
      if (seedCoins.data.length > 1) {
        const coinsToMerge = seedCoins.data.slice(1).map(c => tx.object(c.coinObjectId))
        tx.mergeCoins(tx.object(primaryCoin.coinObjectId), coinsToMerge)
      }
      const [payment] = tx.splitCoins(tx.object(primaryCoin.coinObjectId), [tx.pure.u64(25n * seedScale)])
      tx.moveCall({
        target: `${PACKAGE_ID}::land::use_shovel`,
        arguments: [tx.object(activeLandId), tx.pure.u64(slotIndex), payment, tx.object(SEED_ADMIN_CAP)]
      })
      signAndExecute({ transaction: tx }, {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🪓 Plant removed!')
          setSlots(prev => prev.map(s => s.index === slotIndex ? { ...s, fruit: null } : s))
          fetchLandData()
          if (onDataChanged) onDataChanged()
          setSelectedTool(null)
          setTimeout(() => setTxStatus(''), 2000)
        },
        onError: (e) => {
          setTxStatus('Error: ' + e.message)
          setSelectedTool(null)
        }
      })
    } catch (e: any) { 
      setTxStatus('Error: ' + e.message) 
      setSelectedTool(null)
    }
  }

  const plantInSlot = async () => {
    if (!activeLandId || plantSlotIndex === null || !account?.address) return
    if (playerSeeds < seedsToPlant) { setTxStatus(`❌ Not enough seeds!`); return }
    setTxStatus(`🌱 Planting ${seedsToPlant} seeds...`)
    setShowPlantModal(false)
    const seedCoins = await suiClient.getCoins({ owner: account.address, coinType: SEED_COIN_TYPE })
    if (seedCoins.data.length === 0) return
    const tx = new Transaction()
    if (seedCoins.data.length > 1) {
      const ids = seedCoins.data.map(c => tx.object(c.coinObjectId))
      tx.mergeCoins(ids[0], ids.slice(1))
    }
    const [payment] = tx.splitCoins(tx.object(seedCoins.data[0].coinObjectId), [tx.pure.u64(BigInt(seedsToPlant) * seedScale)])
    tx.moveCall({
      target: `${PACKAGE_ID}::land::plant_in_slot`,
      arguments: [tx.object(activeLandId), tx.pure.u64(plantSlotIndex), payment, tx.object(SEED_ADMIN_CAP), tx.object(CLOCK_OBJECT), tx.object(RANDOM_OBJECT)]
    })
    signAndExecute({ transaction: tx }, {
      onSuccess: async (result) => {
        await suiClient.waitForTransaction({ digest: result.digest })
        setTxStatus('🌳 Seed planted!')
        fetchLandData(); onDataChanged?.()
        setTimeout(() => setTxStatus(''), 3000)
      },
      onError: (e) => setTxStatus('Error: ' + e.message),
    })
  }

  // --- PLANT ALL ---
  const plantAll = async () => {
    if (!activeLandId || !account?.address) return
    const emptyCount = slots.filter(s => !s.fruit).length
    if (emptyCount === 0) return
    
    const totalCost = batchSeeds * emptyCount
    if (playerSeeds < totalCost) {
      setTxStatus(`❌ Not enough seeds! Need ${totalCost}`);
      return
    }

    setTxStatus(`🌱 Planting ${batchSeeds} seeds in ${emptyCount} slots...`)
    setShowBatchModal(false)

    try {
      const seedCoins = await suiClient.getCoins({ owner: account.address, coinType: SEED_COIN_TYPE })
      if (seedCoins.data.length === 0) {
        setTxStatus('❌ No SEED coins found')
        return
      }

      const tx = new Transaction()
      const primaryCoin = seedCoins.data[0]
      if (seedCoins.data.length > 1) {
        const coinsToMerge = seedCoins.data.slice(1).map(c => tx.object(c.coinObjectId))
        tx.mergeCoins(tx.object(primaryCoin.coinObjectId), coinsToMerge)
      }
      
      const [payment] = tx.splitCoins(
        tx.object(primaryCoin.coinObjectId), 
        [tx.pure.u64(BigInt(totalCost) * seedScale)]
      )

      tx.moveCall({
        target: `${PACKAGE_ID}::land::plant_all`,
        arguments: [
          tx.object(activeLandId),
          payment,
          tx.pure.u64(BigInt(batchSeeds) * seedScale),
          tx.object(SEED_ADMIN_CAP),
          tx.object(CLOCK_OBJECT),
          tx.object(RANDOM_OBJECT)
        ]
      })

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            await suiClient.waitForTransaction({ digest: result.digest })
            setTxStatus('🌳 Planted All Successfully!')
            fetchLandData()
            if (onDataChanged) onDataChanged()
            setTimeout(() => setTxStatus(''), 3000)
          },
          onError: (e) => setTxStatus('Error: ' + e.message)
        }
      )
    } catch (e: any) {
      console.error(e)
      setTxStatus('Error: ' + e.message)
    }
  }

  const forceHarvest = async (skipWarning = false) => {
    if (!activeLandId) return
    if (!inventoryId) {
      // ... (create player logic - keep as is)
      return
    }

    // Calculate available slots accurately
    const availableSlots = inventoryMax - inventoryUsed
    const readyCount = slots.filter(s => s.fruit && currentTime >= s.fruit.plantedAt + getEffectiveGrowTime(s)).length
    
    console.log('Harvest Check:', { readyCount, availableSlots, skipWarning, inventoryMax, inventoryUsed });

    // Show warning if trying to harvest more than available space
    if (!skipWarning && readyCount > availableSlots) {
      console.log('Inventory full/near full warning triggered');
      setShowHarvestWarning(true);
      return; // STOP execution here
    }

    setTxStatus('🌾 Harvesting...')
    // ... (transaction logic - keep as is)
    const tx = new Transaction()
    tx.moveCall({ target: `${PACKAGE_ID}::land::harvest_ready`, arguments: [tx.object(activeLandId), tx.object(inventoryId), tx.object(CLOCK_OBJECT)] })
    signAndExecute({ transaction: tx }, {
      onSuccess: async (result) => {
        await suiClient.waitForTransaction({ digest: result.digest })
        setTxStatus('🍎 Fruits harvested!')
        fetchLandData(); fetchInventoryData(); onDataChanged?.()
        setTimeout(() => setTxStatus(''), 3000)
      },
      onError: (e) => setTxStatus('Error: ' + e.message),
    })
  }

  const getEffectiveGrowTime = (slot: Slot): number => {
    if (!slot.fruit) return 0
    const base = getGrowTime(slot.fruit.rarity)
    const boost = Math.max(slot.fruit.speedBoostMs, slotSpeedBoosts[slot.index] || 0)
    return Math.max(base - boost, 1000)
  }

  const readySlots = slots.filter(s => s.fruit && currentTime >= s.fruit.plantedAt + getEffectiveGrowTime(s)).length

  return (
    <div className="player-land">
      <h2>🌍 Your Farm</h2>
      
      {txStatus && <div className="tx-status">{isPending && <span className="spinner">⏳</span>}{txStatus}</div>}

      {activeLandId && (
        <>
          <div className="land-info"><span>Level {landLevel}</span><span>{maxSlots} slots</span></div>

          <div className="land-actions">
            {slots.filter(s => !s.fruit).length > 0 && (
              <button 
                onClick={() => {
                  if (playerSeeds > 0) setShowBatchModal(true)
                  else { setTxStatus('❌ Need seeds!'); setTimeout(() => setTxStatus(''), 2000); }
                }} 
                disabled={isPending}
              >
                🌱 Plant All
              </button>
            )}
            {readySlots > 0 && <button onClick={() => forceHarvest()} disabled={isPending}>🌾 Harvest All ({readySlots} ready)</button>}
            <button onClick={upgradeLand} disabled={isPending || playerSeeds < (Number(LAND_UPGRADE_BASE_COST) * (1 << landLevel))}>
              ⬆️ Upgrade Land — {Number(LAND_UPGRADE_BASE_COST) * (1 << landLevel)} SEED
            </button>
            <button onClick={buyNewLand} disabled={isPending || playerSeeds < Number(NEW_LAND_COST)}>
              🏡 Buy New Land — {Number(NEW_LAND_COST)} SEED
            </button>
            {/* Nút Mint Test Seeds */}
            <button onClick={mintTestSeeds} disabled={isPending} className="mint-test-btn">
              🎁 Mint 1000 Test Seeds
            </button>
          </div>

          <div className="tool-bar">
            <span className="tool-bar-label">🧰 Tools:</span>
            <div className="tool-buttons">
              <button className={`tool-btn ${selectedTool === 'wateringCan' ? 'active' : ''}`} onClick={() => setSelectedTool(selectedTool === 'wateringCan' ? null : 'wateringCan')}>🚿 Water (50 🌱)</button>
              <button className={`tool-btn ${selectedTool === 'fertilizer' ? 'active' : ''}`} onClick={() => setSelectedTool(selectedTool === 'fertilizer' ? null : 'fertilizer')}>🧪 Fertilizer (100 🌱)</button>
              <button className={`tool-btn ${selectedTool === 'shovel' ? 'active' : ''}`} onClick={() => setSelectedTool(selectedTool === 'shovel' ? null : 'shovel')}>🪓 Shovel (25 🌱)</button>
            </div>
            {selectedTool && (
              <div className="tool-hint">
                <p>Select a planted slot to apply.</p>
                <button className="cancel-tool-btn" onClick={() => setSelectedTool(null)}>Cancel</button>
              </div>
            )}
          </div>

          <div className={`slots-grid ${selectedTool ? 'tool-mode' : ''}`}>
            {slots.map((slot) => {
              const effectiveTime = getEffectiveGrowTime(slot)
              const isReady = slot.fruit && currentTime >= slot.fruit.plantedAt + effectiveTime
              const timeLeft = slot.fruit ? Math.max(0, Math.ceil((slot.fruit.plantedAt + effectiveTime - currentTime) / 1000)) : 0
              const fruitData = slot.fruit ? FRUITS[slot.fruit.fruitType - 1] : null
              const hasBoosted = (slot.fruit?.speedBoostMs || 0) > 0 || (slotSpeedBoosts[slot.index] || 0) > 0
              
              return (
                <div key={slot.index} className={`slot ${!slot.fruit ? 'empty' : isReady ? 'ready' : 'growing'} ${selectedTool && slot.fruit ? 'tool-target' : ''}`} 
                  onClick={() => handleSlotClick(slot)}
                >
                  {!slot.fruit ? (
                    <div className="slot-empty"><img src={chauDat} className="soil-img" /><div className="slot-overlay"><span>➕</span><span>Plant</span></div></div>
                  ) : isReady ? (
                    <div className="slot-ready">
                      <img src={chauDatTuoiCay} className="soil-img" />
                      <div className="fruit-display">
                        <img src={fruitData?.image} className="fruit-img-ready" />
                        <span className="slot-name">{fruitData?.name}</span>
                        <div className="slot-stats"><span style={{ color: RARITY_COLORS[slot.fruit.rarity - 1] }}>{RARITIES[slot.fruit.rarity - 1]}</span></div>
                      </div>
                    </div>
                  ) : (
                    <div className="slot-growing">
                      <img src={chauDatNayMam} className="soil-img" />
                      <div className="slot-overlay">
                        <div className="growth-timer">⏱️ {formatTimeLeft(timeLeft)} {hasBoosted && '⚡'}</div>
                        <div className="growth-progress"><div className="growth-bar" style={{ width: `${Math.min(100, ((effectiveTime - (timeLeft * 1000)) / effectiveTime) * 100)}%` }}></div></div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {showBatchModal && (
        <div className="modal-overlay" onClick={() => setShowBatchModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>🌱 Plant All Empty Slots</h3>
            <p>Planting in {slots.filter(s => !s.fruit).length} empty slots.</p>
            <div className="modal-input">
              <label>Seeds per slot:</label>
              <input
                type="number"
                min="1"
                max={Math.floor(playerSeeds / Math.max(1, slots.filter(s => !s.fruit).length))}
                value={batchSeeds}
                onChange={(e) => setBatchSeeds(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <p className="modal-total">
              Total Cost: {batchSeeds * slots.filter(s => !s.fruit).length} SEED
              <br/>
              (You have: {playerSeeds})
            </p>
            <div className="modal-actions">
              <button onClick={() => setShowBatchModal(false)}>Cancel</button>
              <button 
                onClick={plantAll} 
                disabled={isPending || playerSeeds < batchSeeds * slots.filter(s => !s.fruit).length}
              >
                🌱 Plant All
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlantModal && (
        <div className="modal-overlay" onClick={() => setShowPlantModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>🌱 Plant in Slot {(plantSlotIndex ?? 0) + 1}</h3>
            <p>More seeds = Heavier fruits = <strong>Higher rarity chance!</strong></p>
            <div className="rarity-info-box" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
              <small>
                • <strong>Common:</strong> 1 seed<br/>
                • <strong>Uncommon:</strong> 2-3 seeds<br/>
                • <strong>Rare:</strong> 4-9 seeds<br/>
                • <strong>Epic:</strong> 10+ seeds<br/>
                <span style={{ color: '#f1c40f' }}>• <strong>Legendary:</strong> ONLY via Market Merge</span>
              </small>
            </div>
            <div className="modal-input"><input type="number" min="1" max={playerSeeds} value={seedsToPlant} onChange={(e) => setSeedsToPlant(Math.max(1, parseInt(e.target.value) || 1))} /></div>
            <div className="modal-actions"><button onClick={() => setShowPlantModal(false)}>Cancel</button><button onClick={plantInSlot} disabled={isPending || playerSeeds < seedsToPlant}>Plant</button></div>
          </div>
        </div>
      )}
      
      {/* Harvest Warning Modal */}
      {showHarvestWarning && (
        <div className="modal-overlay" onClick={() => setShowHarvestWarning(false)}>
          <div className="modal warning-modal" onClick={e => e.stopPropagation()}>
            <h3>⚠️ Inventory Almost Full!</h3>
            <p>
              You have <strong>{slots.filter(s => s.fruit && currentTime >= s.fruit.plantedAt + getEffectiveGrowTime(s)).length}</strong> fruits ready to harvest, 
              but only <strong>{inventoryMax - inventoryUsed}</strong> inventory slots available.
            </p>
            <p>Some fruits may not be harvested. Consider upgrading your inventory first.</p>
            <div className="inventory-status" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', margin: '15px 0' }}>
              <span>📦 Inventory: {inventoryUsed} / {inventoryMax}</span>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowHarvestWarning(false)}>Cancel</button>
              <button 
                className="btn-warning"
                style={{ background: '#e74c3c', color: 'white' }}
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

      <style>{`
        .mint-test-btn {
          background: linear-gradient(135deg, #f1c40f, #e67e22);
          border: 2px solid #fff;
          color: #000;
          font-weight: 900;
          box-shadow: 0 4px 0 #d35400;
        }
        .mint-test-btn:hover {
          filter: brightness(1.1);
          transform: translateY(-2px);
        }
        .mint-test-btn:active {
          transform: translateY(0);
          box-shadow: none;
        }
        .tool-hint {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #f1c40f;
          font-weight: bold;
          font-size: 0.9rem;
          margin-top: 5px;
        }
        .cancel-tool-btn {
          background: rgba(255,255,255,0.1);
          border: 1px solid #fff;
          padding: 2px 8px;
          border-radius: 4px;
          color: #fff;
          cursor: pointer;
          font-size: 0.8rem;
        }
        .slots-grid.tool-mode .slot.growing {
          cursor: crosshair;
        }
        .slots-grid.tool-mode .slot.tool-target:hover {
          transform: scale(1.05);
          box-shadow: 0 0 15px #f1c40f;
          border-color: #f1c40f;
        }
      `}</style>
    </div>
  )
}
