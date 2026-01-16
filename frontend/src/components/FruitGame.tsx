import { useEffect, useRef, useState, useCallback } from 'react'
import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import Matter from 'matter-js'

const PACKAGE_ID = '0x1664a15686e5eec8e9554734b7309399265a8771f10f98413bba2227a6537b30'

// SeedAdminCap shared object ID (from contract publish)
const SEED_ADMIN_CAP = '0x63a07081520fe716d6a411c773d40313e79aaff63e07e3bff3cf129151b3246d'

// SEED coin has 9 decimals, so multiply by 10^9
const SEED_DECIMALS = 1_000_000_000n

// Game constants
const GAME_WIDTH = 400
const GAME_HEIGHT = 600
const WALL_THICKNESS = 20
const PREVIEW_BALL_Y = 50
const LOSE_HEIGHT = 100
const DROP_COOLDOWN = 500

// Physics settings (like the reference game)
const FRICTION = {
  friction: 0.006,
  frictionStatic: 0.006,
  frictionAir: 0,
  restitution: 0.1,
}

// Fruit configurations with emojis
const FRUITS = [
  { level: 1, emoji: '🍒', radius: 15, name: 'Cherry', scoreValue: 1 },
  { level: 2, emoji: '🍇', radius: 19, name: 'Grape', scoreValue: 3 },
  { level: 3, emoji: '🍊', radius: 24, name: 'Orange', scoreValue: 6 },
  { level: 4, emoji: '🍋', radius: 28, name: 'Lemon', scoreValue: 10 },
  { level: 5, emoji: '🍎', radius: 33, name: 'Apple', scoreValue: 15 },
  { level: 6, emoji: '🍐', radius: 38, name: 'Pear', scoreValue: 21 },
  { level: 7, emoji: '🍑', radius: 44, name: 'Peach', scoreValue: 28 },
  { level: 8, emoji: '🍍', radius: 50, name: 'Pineapple', scoreValue: 36 },
  { level: 9, emoji: '🍈', radius: 58, name: 'Melon', scoreValue: 45 },
  { level: 10, emoji: '🍉', radius: 68, name: 'Watermelon', scoreValue: 55 },
]

// Game states
const GameState = {
  MENU: 0,
  READY: 1,
  DROP: 2,
  LOSE: 3,
} as const

interface FruitBody extends Matter.Body {
  sizeIndex?: number
  popped?: boolean
  dropTime?: number
}

interface FruitGameProps {
  onSeedsHarvested?: (seeds: number) => void
  onGameStateChange?: (isActive: boolean) => void
}

export default function FruitGame({ onSeedsHarvested, onGameStateChange }: FruitGameProps) {
  const account = useCurrentAccount()
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction()
  
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Matter.Engine | null>(null)
  const renderRef = useRef<Matter.Render | null>(null)
  const runnerRef = useRef<Matter.Runner | null>(null)
  const previewBallRef = useRef<Matter.Body | null>(null)
  const gameStateRef = useRef<number>(GameState.MENU)
  const currentFruitIndexRef = useRef(0)
  const nextFruitIndexRef = useRef(0)
  
  const [, setDisplayCurrentFruit] = useState(0)
  const [displayNextFruit, setDisplayNextFruit] = useState(0)
  const [score, setScore] = useState(0)
  const [seedsPending, setSeedsPending] = useState(0)
  const [txStatus, setTxStatus] = useState<string>('')
  const [gameStarted, setGameStarted] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)
  
  const fruitsMergedRef = useRef<number[]>(Array(FRUITS.length).fill(0))

  // Notify parent component about game state
  useEffect(() => {
    if (onGameStateChange) {
      onGameStateChange(gameStarted && !isGameOver)
    }
  }, [gameStarted, isGameOver, onGameStateChange])

  // Calculate seeds based on fruit level
  const calculateSeeds = useCallback((level: number): number => {
    if (level <= 3) return 0
    if (level <= 5) return level - 3
    if (level <= 7) return level - 2
    return level
  }, [])

  // Calculate score from merges
  const calculateScore = useCallback(() => {
    const newScore = fruitsMergedRef.current.reduce((total, count, sizeIndex) => {
      return total + (FRUITS[sizeIndex]?.scoreValue || 0) * count
    }, 0)
    setScore(newScore)
  }, [])

  // Generate a fruit body with emoji rendering
  const generateFruitBody = useCallback((x: number, y: number, sizeIndex: number, extraConfig: object = {}): FruitBody => {
    const fruit = FRUITS[sizeIndex]
    const body: FruitBody = Matter.Bodies.circle(x, y, fruit.radius, {
      ...FRICTION,
      ...extraConfig,
      label: 'fruit',
      render: {
        fillStyle: 'transparent',
      }
    })
    body.sizeIndex = sizeIndex
    body.popped = false
    body.dropTime = Date.now()
    return body
  }, [])

  // Set next fruit size (random 0-4 for small fruits)
  const setNextFruitSize = useCallback(() => {
    const next = Math.floor(Math.random() * 5)
    nextFruitIndexRef.current = next
    setDisplayNextFruit(next)
  }, [])

  // Mint seeds on-chain
  const mintSeedsOnChain = async () => {
    if (!account?.address) {
      setTxStatus('❌ Connect wallet first')
      setTimeout(() => setTxStatus(''), 3000)
      return
    }
    if (seedsPending === 0) {
      setTxStatus('❌ No seeds to mint')
      setTimeout(() => setTxStatus(''), 3000)
      return
    }
    
    setTxStatus(`🌱 Minting ${seedsPending} seeds...`)
    const tx = new Transaction()
    
    // Multiply by 10^9 for 9 decimals
    const amountWithDecimals = BigInt(seedsPending) * SEED_DECIMALS
    
    tx.moveCall({
      target: `${PACKAGE_ID}::player::mint_seeds`,
      arguments: [
        tx.object(SEED_ADMIN_CAP),
        tx.pure.u64(amountWithDecimals),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async () => {
          const minted = seedsPending
          onSeedsHarvested?.(minted)
          
          setTxStatus(`🎉 Minted ${minted} seeds!`)
          setSeedsPending(0)
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

  // Lose game handler
  const loseGame = useCallback(() => {
    gameStateRef.current = GameState.LOSE
    setIsGameOver(true)
    if (runnerRef.current) {
      runnerRef.current.enabled = false
    }
  }, [])

  // Initialize Matter.js engine
  useEffect(() => {
    if (!canvasRef.current) return

    const engine = Matter.Engine.create()
    engineRef.current = engine

    const render = Matter.Render.create({
      canvas: canvasRef.current,
      engine: engine,
      options: {
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        wireframes: false,
        background: '#ffdcae',
      },
    })
    renderRef.current = render

    // Wall properties
    const wallProps = {
      isStatic: true,
      render: { fillStyle: '#FFEEDB' },
      ...FRICTION,
    }

    // Create walls - left, right, bottom
    const walls = [
      // Bottom
      Matter.Bodies.rectangle(
        GAME_WIDTH / 2, 
        GAME_HEIGHT + WALL_THICKNESS / 2, 
        GAME_WIDTH + WALL_THICKNESS * 2, 
        WALL_THICKNESS, 
        { ...wallProps, label: 'wall' }
      ),
      // Left
      Matter.Bodies.rectangle(
        -WALL_THICKNESS / 2, 
        GAME_HEIGHT / 2, 
        WALL_THICKNESS, 
        GAME_HEIGHT, 
        { ...wallProps, label: 'wall' }
      ),
      // Right
      Matter.Bodies.rectangle(
        GAME_WIDTH + WALL_THICKNESS / 2, 
        GAME_HEIGHT / 2, 
        WALL_THICKNESS, 
        GAME_HEIGHT, 
        { ...wallProps, label: 'wall' }
      ),
    ]

    Matter.Composite.add(engine.world, walls)

    // Game over line (visual indicator)
    const gameOverLine = Matter.Bodies.rectangle(GAME_WIDTH / 2, LOSE_HEIGHT, GAME_WIDTH, 2, {
      isStatic: true,
      isSensor: true,
      render: { fillStyle: 'rgba(231, 76, 60, 0.5)' },
      label: 'gameOverLine',
    })
    Matter.Composite.add(engine.world, gameOverLine)

    // Collision detection for merging
    Matter.Events.on(engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const bodyA = pair.bodyA as FruitBody
        const bodyB = pair.bodyB as FruitBody

        // Skip walls and sensors
        if (bodyA.isStatic || bodyB.isStatic) continue
        if (bodyA.label !== 'fruit' || bodyB.label !== 'fruit') continue

        // Check if same size fruits
        if (bodyA.sizeIndex === undefined || bodyB.sizeIndex === undefined) continue
        if (bodyA.sizeIndex !== bodyB.sizeIndex) continue
        if (bodyA.popped || bodyB.popped) continue

        const currentSize = bodyA.sizeIndex
        let newSize = currentSize + 1

        // If max size, wrap to smallest
        if (currentSize >= FRUITS.length - 1) {
          newSize = 0
        }

        // Mark as popped
        bodyA.popped = true
        bodyB.popped = true

        // Track merge for scoring
        fruitsMergedRef.current[currentSize] += 1

        // Calculate merge position
        const midX = (bodyA.position.x + bodyB.position.x) / 2
        const midY = (bodyA.position.y + bodyB.position.y) / 2

        // Remove old fruits
        Matter.Composite.remove(engine.world, bodyA)
        Matter.Composite.remove(engine.world, bodyB)

        // Create new bigger fruit
        const newFruit = generateFruitBody(midX, midY, newSize)
        Matter.Composite.add(engine.world, newFruit)

        // Update score and seeds
        calculateScore()
        const seeds = calculateSeeds(newSize + 1)
        if (seeds > 0) {
          setSeedsPending(prev => prev + seeds)
        }
      }
    })

    // Check for game over - fruits staying above lose line for 2+ seconds
    Matter.Events.on(engine, 'afterUpdate', () => {
      if (gameStateRef.current === GameState.LOSE) return
      
      const now = Date.now()
      const bodies = Matter.Composite.allBodies(engine.world)
      for (const body of bodies) {
        const fruitBody = body as FruitBody
        if (fruitBody.label !== 'fruit' || fruitBody.isStatic) continue
        
        // Must have been dropped at least 2 seconds ago
        const timeSinceDrop = now - (fruitBody.dropTime || now)
        if (timeSinceDrop < 2000) continue
        
        // Check if fruit is above lose line and has settled
        if (fruitBody.position.y < LOSE_HEIGHT && 
            Math.abs(fruitBody.velocity.y) < 0.5 &&
            Math.abs(fruitBody.velocity.x) < 0.5) {
          loseGame()
          break
        }
      }
    })

    // Runner
    const runner = Matter.Runner.create()
    runnerRef.current = runner
    Matter.Runner.run(runner, engine)
    Matter.Render.run(render)

    // Custom emoji rendering
    Matter.Events.on(render, 'afterRender', () => {
      const context = render.canvas.getContext('2d')
      if (!context) return

      const bodies = Matter.Composite.allBodies(engine.world)
      for (const body of bodies) {
        const fruitBody = body as FruitBody
        if (fruitBody.label !== 'fruit') continue
        if (fruitBody.sizeIndex === undefined) continue

        const fruit = FRUITS[fruitBody.sizeIndex]
        if (!fruit) continue

        context.save()
        context.translate(fruitBody.position.x, fruitBody.position.y)
        context.rotate(fruitBody.angle)
        context.font = `${fruit.radius * 2}px Arial`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(fruit.emoji, 0, 0)
        context.restore()
      }
    })

    // Initialize first fruit
    const initialFruit = Math.floor(Math.random() * 5)
    currentFruitIndexRef.current = initialFruit
    setDisplayCurrentFruit(initialFruit)
    
    const nextFruit = Math.floor(Math.random() * 5)
    nextFruitIndexRef.current = nextFruit
    setDisplayNextFruit(nextFruit)

    return () => {
      Matter.Render.stop(render)
      Matter.Runner.stop(runner)
      Matter.Engine.clear(engine)
    }
  }, [generateFruitBody, calculateScore, calculateSeeds, loseGame])

  // Start game
  const startGame = useCallback(() => {
    if (!engineRef.current) return

    setGameStarted(true)
    setIsGameOver(false)
    setScore(0)
    setSeedsPending(0)
    fruitsMergedRef.current = Array(FRUITS.length).fill(0)
    gameStateRef.current = GameState.READY

    if (runnerRef.current) {
      runnerRef.current.enabled = true
    }

    // Create preview ball
    const initialFruit = Math.floor(Math.random() * 5)
    currentFruitIndexRef.current = initialFruit
    setDisplayCurrentFruit(initialFruit)
    
    const nextFruit = Math.floor(Math.random() * 5)
    nextFruitIndexRef.current = nextFruit
    setDisplayNextFruit(nextFruit)

    const preview = generateFruitBody(GAME_WIDTH / 2, PREVIEW_BALL_Y, initialFruit, {
      isStatic: true,
      collisionFilter: { mask: 0x0000 },
    })
    previewBallRef.current = preview
    Matter.Composite.add(engineRef.current.world, preview)
  }, [generateFruitBody])

  // Reset game
  const resetGame = useCallback(() => {
    if (!engineRef.current) return

    // Remove all fruits
    const bodies = Matter.Composite.allBodies(engineRef.current.world)
    bodies.forEach(body => {
      if (body.label === 'fruit') {
        Matter.Composite.remove(engineRef.current!.world, body)
      }
    })

    previewBallRef.current = null
    startGame()
  }, [startGame])

  // Handle mouse move for preview ball
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gameStarted || isGameOver || !previewBallRef.current) return
    if (gameStateRef.current !== GameState.READY) return

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const currentRadius = FRUITS[currentFruitIndexRef.current].radius
    const x = Math.max(
      currentRadius + 5,
      Math.min(GAME_WIDTH - currentRadius - 5, e.clientX - rect.left)
    )

    Matter.Body.setPosition(previewBallRef.current, { x, y: PREVIEW_BALL_Y })
  }, [gameStarted, isGameOver])

  // Handle click to drop fruit
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gameStarted) {
      startGame()
      return
    }

    if (isGameOver || gameStateRef.current !== GameState.READY) return
    if (!engineRef.current || !previewBallRef.current) return

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const currentRadius = FRUITS[currentFruitIndexRef.current].radius
    const x = Math.max(
      currentRadius + 5,
      Math.min(GAME_WIDTH - currentRadius - 5, e.clientX - rect.left)
    )

    gameStateRef.current = GameState.DROP

    // Remove preview ball
    Matter.Composite.remove(engineRef.current.world, previewBallRef.current)
    previewBallRef.current = null

    // Drop actual fruit
    const droppedFruit = generateFruitBody(x, PREVIEW_BALL_Y, currentFruitIndexRef.current)
    Matter.Composite.add(engineRef.current.world, droppedFruit)

    // Prepare next fruit
    currentFruitIndexRef.current = nextFruitIndexRef.current
    setDisplayCurrentFruit(nextFruitIndexRef.current)
    setNextFruitSize()

    // Cooldown before next drop
    setTimeout(() => {
      if (gameStateRef.current === GameState.DROP && engineRef.current) {
        // Create new preview ball
        const preview = generateFruitBody(GAME_WIDTH / 2, PREVIEW_BALL_Y, currentFruitIndexRef.current, {
          isStatic: true,
          collisionFilter: { mask: 0x0000 },
        })
        previewBallRef.current = preview
        Matter.Composite.add(engineRef.current.world, preview)
        gameStateRef.current = GameState.READY
      }
    }, DROP_COOLDOWN)
  }, [gameStarted, isGameOver, startGame, generateFruitBody, setNextFruitSize])

  return (
    <div className="fruit-game" ref={containerRef}>
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
          <span className="stat-value">{score}</span>
        </div>
        <div className="stat seeds">
          <span className="stat-label">🌱 Seeds</span>
          <span className="stat-value">{seedsPending}</span>
        </div>
        {gameStarted && !isGameOver && (
          <div className="stat next">
            <span className="stat-label">Next</span>
            <div className="next-fruit-emoji">
              {FRUITS[displayNextFruit].emoji}
            </div>
          </div>
        )}
      </div>

      {/* Game Canvas */}
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          style={{ cursor: (gameStarted && !isGameOver && gameStateRef.current === GameState.READY) ? 'pointer' : 'default' }}
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
        {isGameOver && (
          <div className="game-overlay game-over">
            <h2>💥 Game Over!</h2>
            <p className="score-display">Score: {score}</p>
            {seedsPending > 0 && (
              <div className="harvest-prompt">
                <p className="seeds-earned">🌱 {seedsPending} seeds earned!</p>
                {account ? (
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
      {gameStarted && !isGameOver && seedsPending > 0 && (
        <div className="mint-during-game">
          {account ? (
            <button 
              className="btn-mint" 
              onClick={mintSeedsOnChain}
              disabled={isPending}
            >
              {isPending ? '⏳ Minting...' : `🌱 Mint ${seedsPending} Seeds`}
            </button>
          ) : (
            <span className="hint">Connect wallet to mint seeds</span>
          )}
        </div>
      )}

      {/* Fruit Legend */}
      <div className="fruit-legend">
        {FRUITS.slice(0, 5).map((f) => (
          <span key={f.level} className="fruit-emoji-legend" title={`${f.name} (Lv${f.level})`}>{f.emoji}</span>
        ))}
        <span>→</span>
        <span className="fruit-emoji-legend" title="Watermelon (Lv10)">{FRUITS[9].emoji}</span>
      </div>
    </div>
  )
}
