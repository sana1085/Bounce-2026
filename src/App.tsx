/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Trophy, RefreshCcw, Play, Pause, Circle, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Constants & Types ---
const GRAVITY = 0.5;
const FRICTION = 0.8;
const JUMP_FORCE = -12;
const ACCELERATION = 0.8;
const MAX_SPEED = 6;
const BOUNCE_FACTOR = 0.4;
const BALL_RADIUS = 15;

interface Rect { x: number; y: number; w: number; h: number; }
interface Ring { x: number; y: number; r: number; collected?: boolean; }

const LEVEL = {
  width: 2000,
  height: 600,
  start: { x: 100, y: 500 },
  platforms: [
    { x: 0, y: 550, w: 2000, h: 50 }, // Ground
    { x: 300, y: 430, w: 150, h: 20 },
    { x: 550, y: 330, w: 150, h: 20 },
    { x: 800, y: 230, w: 250, h: 20 },
    { x: 1100, y: 350, w: 200, h: 20 },
    { x: 1400, y: 450, w: 200, h: 20 },
    { x: 1700, y: 350, w: 200, h: 20 },
    { x: 1000, y: 480, w: 100, h: 70 }, // Obstacle
  ],
  spikes: [
    { x: 450, y: 530, w: 30, h: 20 },
    { x: 480, y: 530, w: 30, h: 20 },
    { x: 510, y: 530, w: 30, h: 20 },
    { x: 1200, y: 530, w: 30, h: 20 },
    { x: 1230, y: 530, w: 30, h: 20 },
    { x: 1260, y: 530, w: 30, h: 20 },
    { x: 850, y: 210, w: 30, h: 20 }, // Spike on platform
  ],
  rings: [
    { x: 375, y: 380, r: 15 },
    { x: 625, y: 280, r: 15 },
    { x: 925, y: 180, r: 15 },
    { x: 1500, y: 400, r: 15 },
    { x: 1800, y: 300, r: 15 },
  ],
  door: { x: 1900, y: 500, w: 50, h: 50 },
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover' | 'complete'>('menu');
  const [ringsCollected, setRingsCollected] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  
  // Ref-based state for game loop optimization
  const ballRef = useRef({
    x: LEVEL.start.x,
    y: LEVEL.start.y,
    vx: 0,
    vy: 0,
    radius: BALL_RADIUS,
    onGround: false
  });
  
  const ringsRef = useRef<Ring[]>(LEVEL.rings.map(r => ({ ...r, collected: false })));
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const cameraRef = useRef({ x: 0, y: 0 });
  const requestRef = useRef<number>(null);

  // --- Initialization & Controls ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => (keysRef.current[e.key] = true);
    const handleKeyUp = (e: KeyboardEvent) => (keysRef.current[e.key] = false);
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const resetGame = useCallback(() => {
    ballRef.current = {
      x: LEVEL.start.x,
      y: LEVEL.start.y,
      vx: 0,
      vy: 0,
      radius: BALL_RADIUS,
      onGround: false
    };
    ringsRef.current = LEVEL.rings.map(r => ({ ...r, collected: false }));
    setRingsCollected(0);
    setGameState('playing');
    setIsPaused(false);
  }, []);

  // --- Collision Logic ---
  const checkCircleRectCollision = (circle: { x: number, y: number, r: number }, rect: Rect) => {
    const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
    
    const distanceX = circle.x - closestX;
    const distanceY = circle.y - closestY;
    
    const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
    return {
      collided: distanceSquared < (circle.r * circle.r),
      closestX,
      closestY
    };
  };

  // --- Game Loop ---
  const update = useCallback(() => {
    if (gameState !== 'playing' || isPaused) return;

    const ball = ballRef.current;
    const keys = keysRef.current;

    // Horizontal Movement
    if (keys['ArrowLeft']) ball.vx -= ACCELERATION;
    if (keys['ArrowRight']) ball.vx += ACCELERATION;
    
    ball.vx *= FRICTION;
    if (Math.abs(ball.vx) > MAX_SPEED) ball.vx = Math.sign(ball.vx) * MAX_SPEED;

    // Vertical Movement
    ball.vy += GRAVITY;
    
    if (keys['ArrowUp'] && ball.onGround) {
      ball.vy = JUMP_FORCE;
      ball.onGround = false;
    }

    // Apply movement
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Collision Detection: Platforms
    ball.onGround = false;
    LEVEL.platforms.forEach(p => {
      const collision = checkCircleRectCollision({ x: ball.x, y: ball.y, r: ball.radius }, p);
      if (collision.collided) {
        // Find which side we hit
        const overlapX = ball.radius - Math.abs(ball.x - collision.closestX);
        const overlapY = ball.radius - Math.abs(ball.y - collision.closestY);

        if (overlapX < overlapY) {
          // Horizontal collision
          ball.x += (ball.x > collision.closestX ? 1 : -1) * overlapX;
          ball.vx *= -BOUNCE_FACTOR;
        } else {
          // Vertical collision
          ball.y += (ball.y > collision.closestY ? 1 : -1) * overlapY;
          if (ball.y < p.y) {
            ball.onGround = true;
            ball.vy = 0;
          } else {
            ball.vy *= -BOUNCE_FACTOR;
          }
        }
      }
    });

    // Collision Detection: Spikes
    LEVEL.spikes.forEach(s => {
      if (checkCircleRectCollision({ x: ball.x, y: ball.y, r: ball.radius }, s).collided) {
        setGameState('gameover');
      }
    });

    // Collision Detection: Rings
    ringsRef.current.forEach((r) => {
      if (!r.collected) {
        const dx = ball.x - r.x;
        const dy = ball.y - r.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < ball.radius + r.r) {
          r.collected = true;
          setRingsCollected(prev => prev + 1);
        }
      }
    });

    // Collision Detection: Door
    const doorCollision = checkCircleRectCollision({ x: ball.x, y: ball.y, r: ball.radius }, LEVEL.door);
    if (doorCollision.collided) {
      if (ringsRef.current.every(r => r.collected)) {
        setGameState('complete');
      }
    }

    // Level Boundaries
    if (ball.x < ball.radius) { ball.x = ball.radius; ball.vx *= -BOUNCE_FACTOR; }
    if (ball.x > LEVEL.width - ball.radius) { ball.x = LEVEL.width - ball.radius; ball.vx *= -BOUNCE_FACTOR; }
    if (ball.y > LEVEL.height) setGameState('gameover'); // Fall off

    // Camera Update
    const targetCamX = Math.max(0, Math.min(ball.x - 400, LEVEL.width - 800));
    cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.1;

  }, [gameState, isPaused]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const camX = cameraRef.current.x;

    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Background
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camX, 0);

    // Draw Grid Lines (Subtle)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < LEVEL.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, LEVEL.height);
      ctx.stroke();
    }

    // Draw Platforms
    LEVEL.platforms.forEach(p => {
      ctx.fillStyle = '#334155';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // Highlighted edge
      ctx.fillStyle = '#475569';
      ctx.fillRect(p.x, p.y, p.w, 2);
    });

    // Draw Spikes
    LEVEL.spikes.forEach(s => {
      ctx.fillStyle = '#64748B';
      ctx.beginPath();
      const spikeWidth = 20;
      for (let i = 0; i < s.w; i += spikeWidth) {
        ctx.moveTo(s.x + i, s.y + s.h);
        ctx.lineTo(s.x + i + spikeWidth / 2, s.y);
        ctx.lineTo(s.x + i + spikeWidth, s.y + s.h);
      }
      ctx.fill();
    });

    // Draw Rings
    ringsRef.current.forEach(r => {
      if (!r.collected) {
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(250, 204, 21, 0.15)';
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Draw Door
    const allRings = ringsRef.current.every(r => r.collected);
    ctx.fillStyle = allRings ? '#22C55E' : '#1E293B';
    ctx.strokeStyle = allRings ? '#4ADE80' : '#EF4444';
    ctx.lineWidth = 4;
    const { x, y, w, h } = LEVEL.door;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    // Draw Ball
    const ball = ballRef.current;
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#EF4444';
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }, []);

  const loop = useCallback(() => {
    update();
    draw();
    requestRef.current = requestAnimationFrame(loop);
  }, [update, draw]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loop]);

  const getStatusText = () => {
    if (gameState === 'complete') return 'Win!';
    if (gameState === 'gameover') return 'Dead';
    return isPaused ? 'Paused' : 'Playing';
  };

  const getStatusColor = () => {
    if (gameState === 'complete') return 'text-green-500';
    if (gameState === 'gameover') return 'text-red-500';
    return 'text-green-500';
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-white font-sans flex flex-col items-center justify-center">
      <div className="w-[1024px] h-[768px] bg-[#0F172A] flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Header / HUD */}
        <header className="h-20 px-8 flex items-center justify-between bg-[#1E293B] border-b-4 border-[#334155] shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#EF4444] border-2 border-white shadow-[0_0_15px_rgba(239,68,68,0.5)]"></div>
            <h1 className="text-2xl font-black tracking-tighter uppercase italic">Red Bounce v1.0</h1>
          </div>
          
          <div className="flex gap-8">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Rings Collected</span>
              <span className="text-3xl font-black text-[#FACC15]">
                {ringsCollected} / {LEVEL.rings.length}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Status</span>
              <span className={`text-3xl font-black uppercase ${getStatusColor()}`}>
                {getStatusText()}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsPaused(!isPaused)}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors border-b-2 border-slate-900 bg-slate-800"
            >
              {isPaused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5 fill-current" />}
            </button>
            <button 
              onClick={resetGame}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors border-b-2 border-slate-900 bg-slate-800"
            >
              <RefreshCcw className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main Game Viewport */}
        <main className="relative flex-grow bg-[#0F172A] overflow-hidden">
          <canvas
            ref={canvasRef}
            width={1024}
            height={472}
            className="w-full h-full block"
          />

          {/* Overlays */}
          <AnimatePresence>
            {gameState === 'menu' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center z-50"
              >
                <motion.div
                  initial={{ y: 20 }}
                  animate={{ y: 0 }}
                  className="mb-8"
                >
                  <div className="w-24 h-24 bg-red-500 rounded-full border-4 border-white shadow-[0_0_30px_rgba(239,68,68,0.6)] mx-auto mb-6 animate-bounce" />
                  <h2 className="text-7xl font-black mb-4 tracking-tighter uppercase italic">BOUNCE</h2>
                  <p className="text-slate-400 max-w-sm mx-auto text-lg">A Modern 2D Platforming Experiment. Navigate the red ball through all rings to escape.</p>
                </motion.div>
                
                <button
                  onClick={resetGame}
                  className="group bg-white text-black py-4 px-12 rounded-full font-black text-2xl hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-3 shadow-xl"
                >
                  START MISSION
                  <ChevronRight className="w-8 h-8 group-hover:translate-x-1 transition-transform" />
                </button>
              </motion.div>
            )}

            {gameState === 'gameover' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-red-500/10 backdrop-blur-sm flex flex-col items-center justify-center z-50"
              >
                <h2 className="text-8xl font-black uppercase italic mb-4 text-[#EF4444] tracking-tighter">GAME OVER</h2>
                <p className="text-2xl text-slate-300 mb-8 uppercase font-bold tracking-widest">Press the restart icon to retry</p>
                <button
                  onClick={resetGame}
                  className="bg-white text-black py-4 px-12 rounded-full font-black text-xl hover:bg-red-500 hover:text-white transition-all shadow-2xl"
                >
                  CONTINUE?
                </button>
              </motion.div>
            )}

            {gameState === 'complete' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-green-500/10 backdrop-blur-sm flex flex-col items-center justify-center z-50"
              >
                <Trophy className="w-24 h-24 text-yellow-400 mb-6 animate-bounce" />
                <h2 className="text-8xl font-black uppercase italic mb-4 text-[#22C55E] tracking-tighter">SUCCESS!</h2>
                <p className="text-2xl text-slate-300 mb-8 uppercase font-bold tracking-widest">Target reached flawlessly</p>
                <button
                  onClick={() => setGameState('menu')}
                  className="bg-white text-black py-4 px-12 rounded-full font-black text-xl hover:bg-green-500 hover:text-white transition-all shadow-2xl"
                >
                  RETURN TO BASE
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer / Controls */}
        <footer className="h-24 px-8 flex items-center justify-between bg-[#1E293B] border-t-4 border-[#334155] shrink-0">
          <div className="flex gap-4">
            <div className="px-6 py-2 bg-[#334155] rounded border-b-4 border-slate-950 flex items-center gap-3">
              <span className="text-[#EF4444] font-black italic underline text-xl">← →</span>
              <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Roll</span>
            </div>
            <div className="px-6 py-2 bg-[#334155] rounded border-b-4 border-slate-950 flex items-center gap-3">
              <span className="text-[#EF4444] font-black italic underline text-xl">↑</span>
              <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Jump</span>
            </div>
          </div>
          <p className="text-slate-500 font-bold italic uppercase tracking-tighter">A Modern 2D Platforming Experiment</p>
        </footer>

      </div>
    </div>
  );
}
