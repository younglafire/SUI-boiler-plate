import { useEffect, useRef, useState, useCallback } from 'react'
import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import Matter from 'matter-js'

const PACKAGE_ID = '0xa99401dc6d117667a13b8c923954fbb7b3726bedb47440699ebc23e9ebb9377b'

// Pinata IPFS gateway base URL
const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs'

// Fruit configurations with IPFS images
const FRUITS = [
  { level: 1, image: `${IPFS_GATEWAY}/bafkreicydu6guwunucel3v5miduloc62s5pjsyirh5pxw5zjrnzcgdsap4`, radius: 20, color: '#e74c3c', name: 'Cherry' },
  { level: 2, image: `${IPFS_GATEWAY}/bafkreifvpkhlj53igt66rcyzylffbfbcdl7nqfqypxdjrxvhpwl3rmpgu4`, radius: 25, color: '#9b59b6', name: 'Grape' },
  { level: 3, image: `${IPFS_GATEWAY}/bafkreibenssqrrj3ctd6bfuycn66ozwrtzt23b3atwegjnt5wkqcnfrndi`, radius: 30, color: '#e67e22', name: 'Orange' },
  { level: 4, image: `${IPFS_GATEWAY}/bafkreiarh47cw5m442fh76qkaws23uk7ztte5wyswqi2qnbgje5pkrcfme`, radius: 35, color: '#f1c40f', name: 'Lemon' },
  { level: 5, image: `${IPFS_GATEWAY}/bafkreibz6wuhdung3neha7jyyf7323qgjrtsvi3y5bixqtk32hawzvf35i`, radius: 40, color: '#c0392b', name: 'Apple' },
  { level: 6, image: `${IPFS_GATEWAY}/bafkreifkvji2k4oyyxo3fyggkn5dvbuouvip765jk5kfa6ewt37tqkwda4`, radius: 45, color: '#27ae60', name: 'Pear' },
  { level: 7, image: `${IPFS_GATEWAY}/bafkreihz77f36frdk7nq332g7zblwt2ctca4cvrr53awr6rybtlp56ohvy`, radius: 50, color: '#fd79a8', name: 'Peach' },
  { level: 8, image: `${IPFS_GATEWAY}/bafkreigkdamx6cylhgcthhrhx5p4rb4otkybrhyvsprvk2huyrnxrm2uya`, radius: 55, color: '#fdcb6e', name: 'Pineapple' },
  { level: 9, image: `${IPFS_GATEWAY}/bafkreifefcjgleils74ujmmjlqakteiwaiotxc4sioeyrkkeul6wmqfka4`, radius: 60, color: '#00b894', name: 'Melon' },
  { level: 10, image: `${IPFS_GATEWAY}/bafybeib4oogwh4auyotbqfcp4bxj4qcjw4xq5htpuafbyjeifuu3dcfkha`, radius: 70, color: '#55a3a3', name: 'Watermelon' },
]

interface GameState {
  score: number
  seedsPending: number
  isGameOver: boolean
}

interface FruitGameProps {
  playerAccountId?: string
  onSeedsHarvested?: (seeds: number) => void
}

export default function FruitGame({ playerAccountId, onSeedsHarvested }: FruitGameProps) {
  const account = useCurrentAccount()
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction()
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Matter.Engine | null>(null)
  const renderRef = useRef<Matter.Render | null>(null)
  const runnerRef = useRef<Matter.Runner | null>(null)
  
  const [nextFruit, setNextFruit] = useState(0)
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    seedsPending: 0,
    isGameOver: false,
  })
  const [canDrop, setCanDrop] = useState(true)
  const [txStatus, setTxStatus] = useState<string>('')
  const [gameStarted, setGameStarted] = useState(false)
  
  const fruitsRef = useRef<Map<number, { body: Matter.Body; level: number; index: number; dropTime: number }>>(new Map())
  const fruitIndexCounter = useRef(0)

  // Calculate seeds based on fruit level
  const calculateSeeds = (level: number): number => {
    if (level <= 3) return 0
    if (level <= 5) return level - 3
    if (level <= 7) return level - 2
    return level
  }

  // Mint seeds on-chain (ONLY transaction needed!)
  const mintSeedsOnChain = async () => {
    if (!account?.address || !playerAccountId) {
      setTxStatus('❌ Connect wallet and create account first')
      setTimeout(() => setTxStatus(''), 3000)
      return
    }
    if (gameState.seedsPending === 0) {
      setTxStatus('❌ No seeds to mint')
      setTimeout(() => setTxStatus(''), 3000)
      return
    }
    
    setTxStatus(`🌱 Minting ${gameState.seedsPending} seeds...`)
    const tx = new Transaction()
    
    tx.moveCall({
      target: `${PACKAGE_ID}::player::mint_seeds`,
      arguments: [
        tx.object(playerAccountId),
        tx.pure.u64(gameState.seedsPending),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async () => {
          const minted = gameState.seedsPending
          onSeedsHarvested?.(minted)
          
          setTxStatus(`🎉 Minted ${minted} seeds!`)
          setGameState(prev => ({ ...prev, seedsPending: 0 }))
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error minting seeds:', error)
          setTxStatus('Error: ' + error.message)
          setTimeout(() => setTxStatus(''), 5000)
        },
      }
    )
  }

  // Reset game locally (no transaction!)
  const resetGame = () => {
    if (!engineRef.current) return
    
    // Clear all fruits
    for (const [, fruit] of fruitsRef.current) {
      Matter.Composite.remove(engineRef.current.world, fruit.body)
    }
    fruitsRef.current.clear()
    fruitIndexCounter.current = 0
    
    setGameState({
      score: 0,
      seedsPending: 0,
      isGameOver: false,
    })
    setNextFruit(Math.floor(Math.random() * 3))
    setGameStarted(true)
  }

  // Initialize Matter.js
  useEffect(() => {
    if (!canvasRef.current) return

    const width = 400
    const height = 600
    const wallThickness = 20

    const engine = Matter.Engine.create()
    engineRef.current = engine

    const render = Matter.Render.create({
      canvas: canvasRef.current,
      engine: engine,
      options: {
        width,
        height,
        wireframes: false,
        background: '#1a1a2e',
      },
    })
    renderRef.current = render

    const walls = [
      Matter.Bodies.rectangle(width / 2, height + wallThickness / 2, width + wallThickness * 2, wallThickness, {
        isStatic: true,
        render: { fillStyle: '#4a4a6a' },
        label: 'wall',
      }),
      Matter.Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height, {
        isStatic: true,
        render: { fillStyle: '#4a4a6a' },
        label: 'wall',
      }),
      Matter.Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height, {
        isStatic: true,
        render: { fillStyle: '#4a4a6a' },
        label: 'wall',
      }),
    ]

    Matter.Composite.add(engine.world, walls)

    const gameOverLine = Matter.Bodies.rectangle(width / 2, 100, width, 2, {
      isStatic: true,
      isSensor: true,
      render: { fillStyle: '#e74c3c' },
      label: 'gameOverLine',
    })
    Matter.Composite.add(engine.world, gameOverLine)

    // Collision detection for merging
    Matter.Events.on(engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const bodyA = pair.bodyA
        const bodyB = pair.bodyB

        if (bodyA.label === 'wall' || bodyB.label === 'wall') continue
        if (bodyA.label === 'gameOverLine' || bodyB.label === 'gameOverLine') continue

        const fruitA = fruitsRef.current.get(bodyA.id)
        const fruitB = fruitsRef.current.get(bodyB.id)

        if (fruitA && fruitB && fruitA.level === fruitB.level && fruitA.level < 10) {
          const newLevel = fruitA.level + 1
          const midX = (bodyA.position.x + bodyB.position.x) / 2
          const midY = (bodyA.position.y + bodyB.position.y) / 2

          // Remove old fruits
          Matter.Composite.remove(engine.world, bodyA)
          Matter.Composite.remove(engine.world, bodyB)
          fruitsRef.current.delete(bodyA.id)
          fruitsRef.current.delete(bodyB.id)

          // Create new bigger fruit
          const newFruitConfig = FRUITS[newLevel - 1]
          const newBody = Matter.Bodies.circle(midX, midY, newFruitConfig.radius, {
            restitution: 0.3,
            friction: 0.5,
            render: { fillStyle: newFruitConfig.color },
            label: 'fruit',
          })
          
          const newIndex = fruitIndexCounter.current++
          fruitsRef.current.set(newBody.id, { body: newBody, level: newLevel, index: newIndex, dropTime: Date.now() })
          Matter.Composite.add(engine.world, newBody)

          // Update local game state
          const seeds = calculateSeeds(newLevel)
          setGameState((prev) => ({
            ...prev,
            score: prev.score + newLevel * 10,
            seedsPending: prev.seedsPending + seeds,
          }))
        }
      }
    })

    // Check for game over
    Matter.Events.on(engine, 'afterUpdate', () => {
      const now = Date.now()
      for (const [, fruit] of fruitsRef.current) {
        const timeSinceDrop = now - fruit.dropTime
        if (timeSinceDrop > 2000 &&
            fruit.body.position.y < 120 &&
            Math.abs(fruit.body.velocity.y) < 1 &&
            Math.abs(fruit.body.velocity.x) < 1) {
          setGameState((prev) => {
            if (!prev.isGameOver) {
              return { ...prev, isGameOver: true }
            }
            return prev
          })
          break
        }
      }
    })

    const runner = Matter.Runner.create()
    runnerRef.current = runner
    Matter.Runner.run(runner, engine)
    Matter.Render.run(render)

    setNextFruit(Math.floor(Math.random() * 3))

    return () => {
      Matter.Render.stop(render)
      Matter.Runner.stop(runner)
      Matter.Engine.clear(engine)
      fruitsRef.current.clear()
    }
  }, [])

  // Drop fruit locally (no transaction!)
  const dropFruit = useCallback(
    (x: number) => {
      if (!engineRef.current || !canDrop || gameState.isGameOver || !gameStarted) return

      const fruit = FRUITS[nextFruit]
      const body = Matter.Bodies.circle(x, 50, fruit.radius, {
        restitution: 0.3,
        friction: 0.5,
        render: { fillStyle: fruit.color },
        label: 'fruit',
      })

      const newIndex = fruitIndexCounter.current++
      fruitsRef.current.set(body.id, { body, level: fruit.level, index: newIndex, dropTime: Date.now() })
      Matter.Composite.add(engineRef.current.world, body)

      setCanDrop(false)
      setTimeout(() => setCanDrop(true), 500)
      setNextFruit(Math.floor(Math.random() * 3))
    },
    [nextFruit, canDrop, gameState.isGameOver, gameStarted]
  )

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gameStarted) {
      resetGame()
      return
    }
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    dropFruit(x)
  }

  return (
    <div className="fruit-game">
      {/* Transaction Status */}
      {txStatus && (
        <div className="tx-status">
          {isPending && <span className="spinner">⏳</span>}
          {txStatus}
        </div>
      )}

      {/* Stats Panel */}
      <div className="game-stats">
        <div className="stat">
          <span className="stat-label">Score</span>
          <span className="stat-value">{gameState.score}</span>
        </div>
        <div className="stat seeds">
          <span className="stat-label">🌱 Seeds</span>
          <span className="stat-value">{gameState.seedsPending}</span>
        </div>
      </div>

      {/* Next Fruit Preview */}
      {gameStarted && !gameState.isGameOver && (
        <div className="next-fruit">
          <span>Next: </span>
          <img src={FRUITS[nextFruit].image} alt={FRUITS[nextFruit].name} className="fruit-img-preview" />
        </div>
      )}

      {/* Game Canvas */}
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ cursor: (gameStarted && canDrop && !gameState.isGameOver) ? 'pointer' : 'default' }}
        />
        
        {/* Start Screen */}
        {!gameStarted && (
          <div className="game-overlay start-screen">
            <h2>🍉 Fruit Merge</h2>
            <p>Click to start!</p>
            <div className="instructions">
              <p>🍒 Drop fruits to merge</p>
              <p>🌱 Same fruits = bigger fruit + seeds</p>
              <p>🌾 Mint seeds on-chain when ready</p>
            </div>
          </div>
        )}

        {/* Game Over */}
        {gameState.isGameOver && (
          <div className="game-overlay game-over">
            <h2>💥 Game Over!</h2>
            <p className="score-display">Score: {gameState.score}</p>
            {gameState.seedsPending > 0 && (
              <div className="harvest-prompt">
                <p className="seeds-earned">🌱 {gameState.seedsPending} seeds earned!</p>
                {account && playerAccountId ? (
                  <button 
                    className="btn-harvest" 
                    onClick={mintSeedsOnChain} 
                    disabled={isPending}
                  >
                    {isPending ? '⏳ Minting...' : '🌾 Mint Seeds On-Chain'}
                  </button>
                ) : (
                  <p className="connect-hint">Connect wallet to mint seeds</p>
                )}
              </div>
            )}
            <button className="btn-restart" onClick={resetGame}>
              🔄 Play Again
            </button>
          </div>
        )}
      </div>

      {/* Mint Button - Available during gameplay */}
      {gameStarted && !gameState.isGameOver && gameState.seedsPending > 0 && (
        <div className="mint-during-game">
          {account && playerAccountId ? (
            <button 
              className="btn-mint" 
              onClick={mintSeedsOnChain}
              disabled={isPending}
            >
              {isPending ? '⏳ Minting...' : `🌱 Mint ${gameState.seedsPending} Seeds`}
            </button>
          ) : (
            <span className="hint">Connect wallet to mint seeds</span>
          )}
        </div>
      )}

      {/* Fruit Legend */}
      <div className="fruit-legend">
        {FRUITS.slice(0, 5).map((f) => (
          <img key={f.level} src={f.image} alt={f.name} title={`${f.name} (Lv${f.level})`} className="fruit-img-legend" />
        ))}
        <span>→</span>
        <img src={FRUITS[9].image} alt="Watermelon" title="Watermelon (Lv10)" className="fruit-img-legend" />
      </div>
    </div>
  )
}
