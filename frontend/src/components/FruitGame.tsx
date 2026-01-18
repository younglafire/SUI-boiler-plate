import { useEffect, useRef, useState, useCallback } from 'react'
import { useCurrentAccount } from '@mysten/dapp-kit'
import Matter from 'matter-js'
import { mintSeedsToUser, sponsorClient } from '../hooks/useSponsoredTransaction'

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
const SEED_DECIMALS = 1_000_000_000n

const WALL_THICKNESS = 20
const PREVIEW_BALL_Y = 50
const DROP_COOLDOWN = 500

const FRICTION = {
  friction: 0.005,
  frictionStatic: 0.005,
  frictionAir: 0,
  restitution: 0.5,
}

const FRUITS = [
  { level: 1, image: imgCherry, radius: 32, name: 'Cherry', scoreValue: 1 },
  { level: 2, image: imgGrape, radius: 44, name: 'Grape', scoreValue: 3 },
  { level: 3, image: imgOrange, radius: 58, name: 'Orange', scoreValue: 6 },
  { level: 4, image: imgLemon, radius: 72, name: 'Lemon', scoreValue: 10 },
  { level: 5, image: imgApple, radius: 88, name: 'Apple', scoreValue: 15 },
  { level: 6, image: imgPear, radius: 106, name: 'Pear', scoreValue: 21 },
  { level: 7, image: imgPeach, radius: 124, name: 'Peach', scoreValue: 28 },
  { level: 8, image: imgPineapple, radius: 144, name: 'Pineapple', scoreValue: 36 },
  { level: 9, image: imgMelon, radius: 166, name: 'Melon', scoreValue: 45 },
  { level: 10, image: imgWatermelon, radius: 195, name: 'Watermelon', scoreValue: 55 },
]

const getRandomDroppableFruitIndex = () => {
  const rand = Math.random()
  if (rand < 0.30) return 0
  if (rand < 0.55) return 1
  if (rand < 0.75) return 2
  if (rand < 0.90) return 3
  return 4
}

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
  const [isPending, setIsPending] = useState(false)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Matter.Engine | null>(null)
  const renderRef = useRef<Matter.Render | null>(null)
  const runnerRef = useRef<Matter.Runner | null>(null)
  const previewBallRef = useRef<Matter.Body | null>(null)
  const gameStateRef = useRef<number>(GameState.MENU)
  const currentFruitIndexRef = useRef(0)
  const nextFruitIndexRef = useRef(0)
  
  // Game Dimensions State (useRef to access inside closures without re-render)
  const gameDimensions = useRef({ width: 900, height: 800, loseHeight: 150, scale: 1 });

  const [areAssetsLoaded, setAreAssetsLoaded] = useState(false)
  const fruitImageElements = useRef<HTMLImageElement[]>([])

  const [, setDisplayCurrentFruit] = useState(0)
  const [displayNextFruit, setDisplayNextFruit] = useState(0)
  const [score, setScore] = useState(0)
  const [seedsPending, setSeedsPending] = useState(0)
  const [txStatus, setTxStatus] = useState<string>('')
  const [gameStarted, setGameStarted] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)
  
  const fruitsMergedRef = useRef<number[]>(Array(FRUITS.length).fill(0))

  useEffect(() => {
    const images = FRUITS.map(f => {
      const img = new Image()
      img.src = f.image
      return img
    })

    let loadedCount = 0
    images.forEach(img => {
      img.onload = () => {
        loadedCount++
        if (loadedCount === images.length) {
          fruitImageElements.current = images
          setAreAssetsLoaded(true)
        }
      }
      img.onerror = () => {
        console.error("Failed to load an image.")
      }
    })
  }, [])

  useEffect(() => {
    if (onGameStateChange) {
      onGameStateChange(gameStarted && !isGameOver)
    }
  }, [gameStarted, isGameOver, onGameStateChange])

  const calculateSeeds = useCallback((level: number): number => {
    if (level <= 3) return 0
    if (level <= 5) return level - 3
    if (level <= 7) return level - 2
    return level
  }, [])

  const calculateScore = useCallback(() => {
    const newScore = fruitsMergedRef.current.reduce((total, count, sizeIndex) => {
      return total + (FRUITS[sizeIndex]?.scoreValue || 0) * count
    }, 0)
    setScore(newScore)
  }, [])

  const generateFruitBody = useCallback((x: number, y: number, sizeIndex: number, extraConfig: object = {}): FruitBody => {
    const fruit = FRUITS[sizeIndex]
    // Scale fruit radius based on game width scaling if needed
    // For now, keep fruits same size for fun, unless screen is VERY small
    const scale = gameDimensions.current.scale;
    
    const body: FruitBody = Matter.Bodies.circle(x, y, fruit.radius * scale, {
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

  const setNextFruitSize = useCallback(() => {
    const next = getRandomDroppableFruitIndex()
    nextFruitIndexRef.current = next
    setDisplayNextFruit(next)
  }, [])

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
    setIsPending(true)
    
    try {
      const amountWithDecimals = BigInt(seedsPending) * SEED_DECIMALS
      
      const result = await mintSeedsToUser(
        account.address,
        amountWithDecimals,
        PACKAGE_ID,
        SEED_ADMIN_CAP
      )
      
      await sponsorClient.waitForTransaction({ digest: result.digest })
      
      const minted = seedsPending
      onSeedsHarvested?.(minted)
      
      setTxStatus(`🎉 Minted ${minted} seeds!`)
      setSeedsPending(0)
      
      setTimeout(() => {
        resetGame()
        setTxStatus('')
      }, 2000)
    } catch (error) {
      console.error('Error minting seeds:', error)
      setTxStatus('Error: ' + (error instanceof Error ? error.message : String(error)))
      setTimeout(() => setTxStatus(''), 5000)
    } finally {
      setIsPending(false)
    }
  }

  const loseGame = useCallback(() => {
    gameStateRef.current = GameState.LOSE
    setIsGameOver(true)
    if (runnerRef.current) {
      runnerRef.current.enabled = false
    }
  }, [])

  useEffect(() => {
    if (!canvasRef.current || !areAssetsLoaded) return

    // --- RESPONSIVE GAME SIZE LOGIC ---
    let width = 900;
    let height = 800;
    let scale = 1;

    if (window.innerWidth < 768) {
        // Mobile Logic
        // Width: 95% of screen width (max 400px to keep it playable)
        width = Math.min(window.innerWidth * 0.95, 450); 
        // Height: 65% of screen height
        height = window.innerHeight * 0.65;
        if (height < 500) height = 500;
        
        // Scale fruits slightly down on small screens to fit more
        scale = Math.min(1, width / 400); 
    }

    gameDimensions.current = {
        width,
        height,
        loseHeight: height * 0.2, // 20% from top
        scale
    };

    const engine = Matter.Engine.create()
    engineRef.current = engine

    const render = Matter.Render.create({
      canvas: canvasRef.current,
      engine: engine,
      options: {
        width: width,
        height: height,
        wireframes: false,
        background: '#e8f5e9',
        pixelRatio: window.devicePixelRatio
      },
    })
    renderRef.current = render

    // Adjust walls to new width/height
    const wallProps = {
      isStatic: true,
      render: { fillStyle: '#FFEEDB' },
      ...FRICTION,
    }

    const walls = [
      // Bottom
      Matter.Bodies.rectangle(
        width / 2, 
        height + WALL_THICKNESS / 2, 
        width + WALL_THICKNESS * 2, 
        WALL_THICKNESS, 
        { ...wallProps, label: 'wall' }
      ),
      // Left
      Matter.Bodies.rectangle(
        -WALL_THICKNESS / 2, 
        height / 2, 
        WALL_THICKNESS, 
        height, 
        { ...wallProps, label: 'wall' }
      ),
      // Right
      Matter.Bodies.rectangle(
        width + WALL_THICKNESS / 2, 
        height / 2, 
        WALL_THICKNESS, 
        height, 
        { ...wallProps, label: 'wall' }
      ),
    ]

    Matter.Composite.add(engine.world, walls)

    const gameOverLine = Matter.Bodies.rectangle(width / 2, gameDimensions.current.loseHeight, width, 2, {
      isStatic: true,
      isSensor: true,
      render: { fillStyle: 'rgba(231, 76, 60, 0.5)' },
      label: 'gameOverLine',
    })
    Matter.Composite.add(engine.world, gameOverLine)

    Matter.Events.on(engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const bodyA = pair.bodyA as FruitBody
        const bodyB = pair.bodyB as FruitBody

        if (bodyA.isStatic || bodyB.isStatic) continue
        if (bodyA.label !== 'fruit' || bodyB.label !== 'fruit') continue

        if (bodyA.sizeIndex === undefined || bodyB.sizeIndex === undefined) continue
        if (bodyA.sizeIndex !== bodyB.sizeIndex) continue
        if (bodyA.popped || bodyB.popped) continue

        const currentSize = bodyA.sizeIndex
        let newSize = currentSize + 1

        if (currentSize >= FRUITS.length - 1) {
          newSize = 0
        }

        bodyA.popped = true
        bodyB.popped = true

        fruitsMergedRef.current[currentSize] += 1

        const midX = (bodyA.position.x + bodyB.position.x) / 2
        const midY = (bodyA.position.y + bodyB.position.y) / 2

        Matter.Composite.remove(engine.world, bodyA)
        Matter.Composite.remove(engine.world, bodyB)

        const newFruit = generateFruitBody(midX, midY, newSize)
        Matter.Composite.add(engine.world, newFruit)

        calculateScore()
        const seeds = calculateSeeds(newSize + 1)
        if (seeds > 0) {
          setSeedsPending(prev => prev + seeds)
        }
      }
    })

    Matter.Events.on(engine, 'afterUpdate', () => {
      if (gameStateRef.current === GameState.LOSE) return
      
      const now = Date.now()
      const bodies = Matter.Composite.allBodies(engine.world)
      for (const body of bodies) {
        const fruitBody = body as FruitBody
        if (fruitBody.label !== 'fruit' || fruitBody.isStatic) continue
        
        const timeSinceDrop = now - (fruitBody.dropTime || now)
        if (timeSinceDrop < 2000) continue
        
        if (fruitBody.position.y < gameDimensions.current.loseHeight && 
            Math.abs(fruitBody.velocity.y) < 0.5 &&
            Math.abs(fruitBody.velocity.x) < 0.5) {
          loseGame()
          break
        }
      }
    })

    const runner = Matter.Runner.create()
    runnerRef.current = runner
    Matter.Runner.run(runner, engine)
    Matter.Render.run(render)

    const fruitImages: HTMLImageElement[] = FRUITS.map(f => {
      const img = new Image()
      img.src = f.image
      return img
    })

    Matter.Events.on(render, 'afterRender', () => {
      const context = render.canvas.getContext('2d')
      if (!context) return

      const bodies = Matter.Composite.allBodies(engine.world)
      for (const body of bodies) {
        const fruitBody = body as FruitBody
        if (fruitBody.label !== 'fruit') continue
        if (fruitBody.sizeIndex === undefined) continue

        const fruit = FRUITS[fruitBody.sizeIndex]
        const img = fruitImages[fruitBody.sizeIndex]
        if (!fruit || !img) continue

        context.save()
        context.translate(fruitBody.position.x, fruitBody.position.y)
        context.rotate(fruitBody.angle)
        
        const scale = gameDimensions.current.scale
        const size = fruit.radius * 2 * scale
        context.drawImage(img, -fruit.radius * scale, -fruit.radius * scale, size, size)
        context.restore()
      }
    })

    const initialFruit = getRandomDroppableFruitIndex()
    currentFruitIndexRef.current = initialFruit
    setDisplayCurrentFruit(initialFruit)
    
    const nextFruit = getRandomDroppableFruitIndex()
    nextFruitIndexRef.current = nextFruit
    setDisplayNextFruit(nextFruit)

    return () => {
      Matter.Render.stop(render)
      Matter.Runner.stop(runner)
      Matter.Engine.clear(engine)
    }
  }, [generateFruitBody, calculateScore, calculateSeeds, loseGame, areAssetsLoaded])

  const startGame = useCallback(() => {
    if (!engineRef.current || !areAssetsLoaded) return

    setGameStarted(true)
    setIsGameOver(false)
    setScore(0)
    fruitsMergedRef.current = Array(FRUITS.length).fill(0)
    gameStateRef.current = GameState.READY

    if (runnerRef.current) {
      runnerRef.current.enabled = true
    }

    // Resize canvas if needed
    if (renderRef.current && canvasRef.current) {
        renderRef.current.canvas.width = gameDimensions.current.width;
        renderRef.current.canvas.height = gameDimensions.current.height;
    }

    const bodies = Matter.Composite.allBodies(engineRef.current.world)
    bodies.forEach(body => {
      if (body.label === 'fruit') {
        Matter.Composite.remove(engineRef.current!.world, body)
      }
    })

    if (previewBallRef.current) {
      Matter.Composite.remove(engineRef.current.world, previewBallRef.current)
    }

    const initialFruit = getRandomDroppableFruitIndex()
    currentFruitIndexRef.current = initialFruit
    setDisplayCurrentFruit(initialFruit)
    
    const nextFruit = getRandomDroppableFruitIndex()
    nextFruitIndexRef.current = nextFruit
    setDisplayNextFruit(nextFruit)

    const preview = generateFruitBody(gameDimensions.current.width / 2, PREVIEW_BALL_Y, initialFruit, {
      isStatic: true,
      collisionFilter: { mask: 0x0000 },
    })
    previewBallRef.current = preview
    Matter.Composite.add(engineRef.current.world, preview)
  }, [generateFruitBody, areAssetsLoaded])

  const resetGame = useCallback(() => {
    if (!engineRef.current) return

    const bodies = Matter.Composite.allBodies(engineRef.current.world)
    bodies.forEach(body => {
      if (body.label === 'fruit') {
        Matter.Composite.remove(engineRef.current!.world, body)
      }
    })

    previewBallRef.current = null
    startGame()
  }, [startGame])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gameStarted || isGameOver || !previewBallRef.current) return
    if (gameStateRef.current !== GameState.READY) return

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    // Scale mouse position to game coordinates
    const scaleX = gameDimensions.current.width / rect.width
    const relativeX = (e.clientX - rect.left) * scaleX

    const scale = gameDimensions.current.scale
    const currentRadius = FRUITS[currentFruitIndexRef.current].radius * scale
    
    const x = Math.max(
      currentRadius + WALL_THICKNESS,
      Math.min(gameDimensions.current.width - currentRadius - WALL_THICKNESS, relativeX)
    )

    Matter.Body.setPosition(previewBallRef.current, { x, y: PREVIEW_BALL_Y })
  }, [gameStarted, isGameOver])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gameStarted) {
      return
    }

    if (isGameOver || gameStateRef.current !== GameState.READY) return
    if (!engineRef.current || !previewBallRef.current) return

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const scaleX = gameDimensions.current.width / rect.width
    const relativeX = (e.clientX - rect.left) * scaleX

    const scale = gameDimensions.current.scale
    const currentRadius = FRUITS[currentFruitIndexRef.current].radius * scale
    
    const x = Math.max(
      currentRadius + WALL_THICKNESS,
      Math.min(gameDimensions.current.width - currentRadius - WALL_THICKNESS, relativeX)
    )

    gameStateRef.current = GameState.DROP

    Matter.Composite.remove(engineRef.current.world, previewBallRef.current)
    previewBallRef.current = null

    const droppedFruit = generateFruitBody(x, PREVIEW_BALL_Y, currentFruitIndexRef.current)
    Matter.Composite.add(engineRef.current.world, droppedFruit)

    currentFruitIndexRef.current = nextFruitIndexRef.current
    setDisplayCurrentFruit(nextFruitIndexRef.current)
    setNextFruitSize()

    setTimeout(() => {
      if (gameStateRef.current === GameState.DROP && engineRef.current) {
        const preview = generateFruitBody(gameDimensions.current.width / 2, PREVIEW_BALL_Y, currentFruitIndexRef.current, {
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
      {txStatus && (
        <div className="tx-status">
          {isPending && <span className="spinner">⏳</span>}
          {txStatus}
        </div>
      )}

      {/* Main Game Layout */}
      <div className="game-main-layout">
        
        {/* Vertical Game Stats */}
        <div className="game-stats-vertical">
          <div className="v-stat">
            <span className="v-stat-label">SCORE</span>
            <span className="v-stat-value">{score}</span>
          </div>
          
          <div className="v-stat">
            <span className="v-stat-label">🌱 SEEDS</span>
            <span className="v-stat-value">{seedsPending}</span>
          </div>

          {gameStarted && !isGameOver && (
            <div className="v-stat next-preview">
              <span className="v-stat-label">NEXT</span>
              <div className="next-preview-box">
                <img src={FRUITS[displayNextFruit].image} alt="Next fruit" className="next-preview-img" />
              </div>
            </div>
          )}
        </div>

        {/* Canvas Area */}
        <div className="canvas-container">
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
            style={{ cursor: (gameStarted && !isGameOver && gameStateRef.current === GameState.READY) ? 'pointer' : 'default' }}
          />
          
          {!gameStarted && (
            <div className="game-overlay start-screen">
              <img src={imgWatermelon} alt="Watery Logo" className="start-logo" style={{ width: '120px', marginBottom: '1rem' }} />
              <h2 style={{ fontSize: '3rem', letterSpacing: '4px' }}>WATERY</h2>
              {!areAssetsLoaded ? (
                <p>Loading Assets...</p>
              ) : (
                <>
                  <div className="instructions">
                    <p>🍎 Drop fruits to merge</p>
                    <p>🌱 Same fruits = bigger fruit + seeds</p>
                    <p>🌾 Mint seeds on-chain when ready</p>
                  </div>
                  <button type="button" className="btn-restart" style={{ fontSize: '1.5rem', padding: '1rem 2.5rem', marginTop: '1rem' }} onClick={startGame}>
                    ▶ PLAY NOW
                  </button>
                </>
              )}
            </div>
          )}

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
              <button type="button" className="btn-restart" onClick={resetGame}>
                🔄 Play Again
              </button>
            </div>
          )}
        </div>
      </div>

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

      <div className="fruit-legend">
        {FRUITS.slice(0, 5).map((f) => (
          <img key={f.level} src={f.image} alt={f.name} className="fruit-img-legend" title={`${f.name} (Lv${f.level})`} />
        ))}
        <span>→</span>
        <img src={FRUITS[9].image} alt="Watermelon" className="fruit-img-legend" title="Watermelon (Lv10)" />
      </div>

      <style>{`
        .fruit-game {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          gap: 20px;
        }

        .game-main-layout {
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          gap: 20px;
          margin-top: 20px;
          padding-right: 80px; 
        }

        .game-stats-vertical {
          display: flex;
          flex-direction: column;
          gap: 15px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          padding: 20px;
          border-radius: 20px;
          border: 3px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          min-width: 120px;
        }

        .v-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .v-stat-label {
          font-size: 0.75rem;
          font-weight: 900;
          color: #a5b4fc;
          letter-spacing: 1px;
          margin-bottom: 5px;
        }

        .v-stat-value {
          font-size: 1.8rem;
          font-weight: 900;
          color: #fff;
          text-shadow: 2px 2px 0 rgba(0,0,0,0.3);
        }

        .next-preview-box {
          width: 80px;
          height: 80px;
          background: rgba(0,0,0,0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 10px;
          border: 3px solid #fff;
          box-shadow: 0 0 15px rgba(255,255,255,0.2);
        }

        .next-preview-img {
          width: 70%;
          height: 70%;
          object-fit: contain;
        }

        .canvas-container {
          position: relative;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 20px 50px rgba(0,0,0,0.4);
          background: #e8f5e9;
          border: 8px solid #34495e;
        }
        
        .canvas-container canvas {
          /* Scale thông minh cho mobile */
          height: 100% !important; 
          width: auto !important; 
          max-width: 100%; 
          object-fit: contain; 
        }

        /* RESPONSIVE MOBILE */
        @media (max-width: 768px) {
          .game-main-layout {
            flex-direction: column;
            align-items: center;
            padding-right: 0; 
            width: 100%;
            gap: 15px;
          }

          .game-stats-vertical {
            flex-direction: row; 
            width: 95%;
            justify-content: space-around;
            padding: 10px;
            min-width: unset;
          }

          .v-stat {
            justify-content: center;
          }
          
          .v-stat-value {
            font-size: 1.4rem;
          }

          .next-preview-box {
            width: 50px;
            height: 50px;
            margin-top: 0;
          }

          .canvas-container {
            width: 95%;
            height: 65vh; 
            min-height: 500px;
          }
          
          .canvas-container canvas {
            width: 100% !important;
            height: 100% !important;
            object-fit: contain; /* Quay về contain để đảm bảo thấy hết game */
          }
        }
      `}</style>
    </div>
  )
}