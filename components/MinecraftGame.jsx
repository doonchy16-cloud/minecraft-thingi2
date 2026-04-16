'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK, HOTBAR_ORDER, INITIAL_INVENTORY, blockLabel, createBlockTexturePatterns, getDropForBlock } from '../lib/blockTypes';
import { RECIPES, applyRecipe, canCraft } from '../lib/recipes';
import { collidesWorld, getBaseBlock, getBlock, isExposed, keyOf, raycastVoxel, terrainHeight } from '../lib/world';

const PLAYER_SIZE = { radius: 0.32, height: 1.8, eyeHeight: 1.62 };
const GRAVITY = 26;
const MOVE_SPEED = 5.4;
const JUMP_SPEED = 9.4;
const REACH = 6;
const RENDER_RADIUS = 10;
const MAX_BASE_RENDER_HEIGHT = 22;
const MAX_HEALTH = 10;
const SUN_SPEED = 0.01;
const HUD_SAMPLE_SECONDS = 0.18;

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  const int = Number.parseInt(value, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function createPixelTexture(palette, label = 'all') {
  const size = 16;
  const data = new Uint8Array(size * size * 4);

  const colorAt = (x, y) => {
    const i = (x * 3 + y * 5 + ((x ^ y) % 4)) % palette.length;
    return hexToRgb(palette[i]);
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      let { r, g, b } = colorAt(x, y);
      let a = 255;

      if (label === 'top' && y < 3) {
        r = Math.min(255, Math.round(r * 1.12));
        g = Math.min(255, Math.round(g * 1.12));
        b = Math.min(255, Math.round(b * 1.12));
      }

      if (label === 'side' && y > 10) {
        r = Math.max(0, Math.round(r * 0.9));
        g = Math.max(0, Math.round(g * 0.9));
        b = Math.max(0, Math.round(b * 0.9));
      }

      if (label === 'front' && x >= 3 && x <= 12 && y >= 5 && y <= 11) {
        r = Math.max(0, Math.round(r * 0.82));
        g = Math.max(0, Math.round(g * 0.82));
        b = Math.max(0, Math.round(b * 0.82));
        if (x >= 5 && x <= 10 && y >= 7 && y <= 9) {
          a = 0;
        }
      }

      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = a;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function useBlockMaterials() {
  return useMemo(() => {
    const patterns = createBlockTexturePatterns();
    const materials = {};

    Object.entries(patterns).forEach(([id, pattern]) => {
      const transparent = Boolean(pattern.transparent);
      const make = (palette, label) => new THREE.MeshLambertMaterial({
        map: createPixelTexture(palette, label),
        transparent,
        alphaTest: transparent ? 0.25 : 0,
      });

      materials[id] = [
        make(pattern.side ?? pattern.all, 'side'),
        make(pattern.side ?? pattern.all, 'side'),
        make(pattern.top ?? pattern.all, 'top'),
        make(pattern.bottom ?? pattern.all, 'bottom'),
        make(pattern.front ?? pattern.side ?? pattern.all, 'front'),
        make(pattern.side ?? pattern.all, 'side'),
      ];
    });

    return materials;
  }, []);
}

function VoxelLayer({ positions, materials }) {
  const ref = useRef(null);
  const temp = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    positions.forEach((pos, index) => {
      temp.position.set(pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5);
      temp.updateMatrix();
      ref.current.setMatrixAt(index, temp.matrix);
    });

    ref.current.count = positions.length;
    ref.current.instanceMatrix.needsUpdate = true;
  }, [positions, temp]);

  if (!positions.length) {
    return null;
  }

  return (
    <instancedMesh ref={ref} args={[null, null, positions.length]} material={materials} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

function SelectionBox({ target }) {
  if (!target) {
    return null;
  }

  return (
    <lineSegments position={[target.x + 0.5, target.y + 0.5, target.z + 0.5]}>
      <edgesGeometry args={[new THREE.BoxGeometry(1.02, 1.02, 1.02)]} />
      <lineBasicMaterial color="#ffffff" />
    </lineSegments>
  );
}

function EnemyLayer({ mobsRef, revision }) {
  return (
    <group key={revision}>
      {mobsRef.current.map((mob) => (
        <mesh key={mob.id} position={[mob.position.x, mob.position.y + 0.55, mob.position.z]}>
          <boxGeometry args={[0.9, 0.9, 0.9]} />
          <meshLambertMaterial color={mob.kind === 'slime' ? '#6ecc45' : '#9f5c35'} />
        </mesh>
      ))}
    </group>
  );
}

function SceneController({
  editsRef,
  editsVersion,
  renderAnchor,
  controlsRef,
  targetRef,
  targetState,
  setTargetState,
  playerRef,
  playerSampleRef,
  setPlayerSample,
  timeRef,
  setTimeOfDay,
  healthRef,
  setHealth,
  mobsRef,
  mobRevision,
  setMobRevision,
}) {
  const materials = useBlockMaterials();
  const { camera, gl, scene } = useThree();
  const keysRef = useRef({});
  const velocityRef = useRef(new THREE.Vector3());
  const sampleAccumulatorRef = useRef(0);
  const mobSpawnAccumulatorRef = useRef(0);
  const fogRef = useRef(null);
  const sunRef = useRef(null);

  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const horizontal = useMemo(() => new THREE.Vector3(), []);
  const aimDirection = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const background = useMemo(() => new THREE.Color('#7eb6ff'), []);

  const blockPositions = useMemo(() => {
    const groups = new Map();
    HOTBAR_ORDER.concat(BLOCK.LEAVES).forEach((id) => groups.set(id, []));

    for (let x = renderAnchor.x - RENDER_RADIUS; x <= renderAnchor.x + RENDER_RADIUS; x += 1) {
      for (let z = renderAnchor.z - RENDER_RADIUS; z <= renderAnchor.z + RENDER_RADIUS; z += 1) {
        const height = terrainHeight(x, z);
        const columnMaxY = Math.min(MAX_BASE_RENDER_HEIGHT, height + 6);
        for (let y = 0; y <= columnMaxY; y += 1) {
          const blockId = getBlock(x, y, z, editsRef.current);
          if (blockId !== BLOCK.AIR && isExposed(x, y, z, editsRef.current)) {
            groups.get(blockId)?.push([x, y, z]);
          }
        }
      }
    }

    editsRef.current.forEach((value, key) => {
      if (value === BLOCK.AIR) {
        return;
      }
      const [x, y, z] = key.split(',').map(Number);
      if (Math.abs(x - renderAnchor.x) > RENDER_RADIUS || Math.abs(z - renderAnchor.z) > RENDER_RADIUS) {
        return;
      }
      if (isExposed(x, y, z, editsRef.current)) {
        groups.get(value)?.push([x, y, z]);
      }
    });

    return groups;
  }, [editsRef, editsVersion, renderAnchor.x, renderAnchor.z]);

  useEffect(() => {
    const startY = terrainHeight(0, 0) + 1.25;
    playerRef.current.position = new THREE.Vector3(0, startY, 0);
    playerSampleRef.current = { x: 0, y: startY, z: 0, onGround: false };
    setPlayerSample(playerSampleRef.current);
    camera.position.set(0, startY + PLAYER_SIZE.eyeHeight, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = 0;
    camera.rotation.x = -0.35;
    controlsRef.current.yaw = 0;
    controlsRef.current.pitch = -0.35;
    gl.setClearColor('#7eb6ff');

    const fog = new THREE.Fog('#7eb6ff', 28, 80);
    fogRef.current = fog;
    scene.fog = fog;
    scene.background = background;
  }, [background, camera, controlsRef, gl, playerRef, playerSampleRef, scene, setPlayerSample]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      keysRef.current[event.code] = true;
    };
    const handleKeyUp = (event) => {
      keysRef.current[event.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useFrame((_, delta) => {
    const player = playerRef.current;
    const velocity = velocityRef.current;
    const keys = keysRef.current;

    timeRef.current = (timeRef.current + delta * SUN_SPEED) % 1;
    const cycle = Math.sin(timeRef.current * Math.PI * 2);
    const daylight = Math.max(0.2, cycle * 0.8 + 0.35);
    background.setRGB(0.08 + daylight * 0.4, 0.12 + daylight * 0.5, 0.18 + daylight * 0.7);
    scene.background = background;
    if (fogRef.current) {
      fogRef.current.color.copy(background);
    }

    camera.rotation.order = 'YXZ';
    camera.rotation.y = controlsRef.current.yaw;
    camera.rotation.x = controlsRef.current.pitch;

    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) {
      forward.set(0, 0, -1);
    }
    forward.normalize();
    right.crossVectors(forward, up).normalize();

    horizontal.set(0, 0, 0);
    if (keys.KeyW) horizontal.add(forward);
    if (keys.KeyS) horizontal.sub(forward);
    if (keys.KeyA) horizontal.sub(right);
    if (keys.KeyD) horizontal.add(right);
    if (horizontal.lengthSq() > 0) {
      horizontal.normalize().multiplyScalar(MOVE_SPEED);
    }

    velocity.x = horizontal.x;
    velocity.z = horizontal.z;
    velocity.y -= GRAVITY * delta;

    if (player.onGround && keys.Space) {
      velocity.y = JUMP_SPEED;
      player.onGround = false;
    }

    const next = player.position.clone();

    next.x += velocity.x * delta;
    if (!collidesWorld(next, PLAYER_SIZE, editsRef.current)) {
      player.position.x = next.x;
    }

    next.copy(player.position);
    next.z += velocity.z * delta;
    if (!collidesWorld(next, PLAYER_SIZE, editsRef.current)) {
      player.position.z = next.z;
    }

    next.copy(player.position);
    next.y += velocity.y * delta;
    if (!collidesWorld(next, PLAYER_SIZE, editsRef.current)) {
      player.position.y = next.y;
      player.onGround = false;
    } else {
      if (velocity.y < 0) {
        player.onGround = true;
      }
      velocity.y = 0;
    }

    if (player.position.y < -16) {
      const safeY = terrainHeight(0, 0) + 1.25;
      player.position.set(0, safeY, 0);
      velocity.set(0, 0, 0);
      healthRef.current = MAX_HEALTH;
      setHealth(MAX_HEALTH);
    }

    camera.position.set(player.position.x, player.position.y + PLAYER_SIZE.eyeHeight, player.position.z);
    camera.getWorldDirection(aimDirection);

    const hit = raycastVoxel(camera.position, aimDirection, REACH, editsRef.current);
    const nextTarget = hit?.block ?? null;
    const previous = targetRef.current;
    const changed = !previous || !nextTarget
      ? previous !== nextTarget
      : previous.x !== nextTarget.x || previous.y !== nextTarget.y || previous.z !== nextTarget.z;
    if (changed) {
      targetRef.current = nextTarget;
      setTargetState(nextTarget);
    }

    const isNight = timeRef.current > 0.62 || timeRef.current < 0.15;
    mobSpawnAccumulatorRef.current += delta;
    if (isNight && mobSpawnAccumulatorRef.current > 3 && mobsRef.current.length < 4) {
      mobSpawnAccumulatorRef.current = 0;
      const angle = Math.random() * Math.PI * 2;
      const distance = 8 + Math.random() * 8;
      const x = Math.round(player.position.x + Math.cos(angle) * distance);
      const z = Math.round(player.position.z + Math.sin(angle) * distance);
      const y = terrainHeight(x, z) + 1;
      mobsRef.current = mobsRef.current.concat({
        id: `mob-${Math.random().toString(36).slice(2)}`,
        kind: Math.random() < 0.6 ? 'slime' : 'golem',
        hp: 3,
        position: { x: x + 0.5, y, z: z + 0.5 },
      });
      setMobRevision((value) => value + 1);
    }

    let mobsChanged = false;
    mobsRef.current = mobsRef.current.filter((mob) => {
      const dx = player.position.x - mob.position.x;
      const dz = player.position.z - mob.position.z;
      const dist = Math.hypot(dx, dz);
      if (isNight && dist > 1.1 && dist < 20) {
        mob.position.x += (dx / dist) * delta * 1.4;
        mob.position.z += (dz / dist) * delta * 1.4;
        mob.position.y = terrainHeight(Math.floor(mob.position.x), Math.floor(mob.position.z)) + 1;
      }
      if (!isNight && dist > 22) {
        mobsChanged = true;
        return false;
      }
      if (dist < 1.25) {
        const now = performance.now();
        if (!mob.lastHitAt || now - mob.lastHitAt > 1000) {
          mob.lastHitAt = now;
          const nextHealth = Math.max(0, healthRef.current - 1);
          healthRef.current = nextHealth;
          setHealth(nextHealth);
        }
      }
      if (mob.hp <= 0) {
        mobsChanged = true;
        return false;
      }
      return true;
    });
    if (mobsChanged) {
      setMobRevision((value) => value + 1);
    }

    sampleAccumulatorRef.current += delta;
    if (sampleAccumulatorRef.current >= HUD_SAMPLE_SECONDS) {
      sampleAccumulatorRef.current = 0;
      const sample = {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        onGround: player.onGround,
      };
      playerSampleRef.current = sample;
      setPlayerSample(sample);
      setTimeOfDay(timeRef.current);
    }
  });

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight ref={sunRef} intensity={1.2} position={[18, 28, 12]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshLambertMaterial color="#4b8a3f" />
      </mesh>
      {Array.from(blockPositions.entries()).map(([blockId, positions]) => (
        <VoxelLayer key={blockId} positions={positions} materials={materials[blockId]} />
      ))}
      <EnemyLayer mobsRef={mobsRef} revision={mobRevision} />
      <SelectionBox target={targetState} />
    </>
  );
}

function hearts(health) {
  return Array.from({ length: MAX_HEALTH }, (_, index) => (index < health ? '♥' : '♡')).join(' ');
}

export default function MinecraftGame() {
  const editsRef = useRef(new Map());
  const playerRef = useRef({ position: new THREE.Vector3(0, terrainHeight(0, 0) + 1.25, 0), onGround: false });
  const playerSampleRef = useRef({ x: 0, y: terrainHeight(0, 0) + 1.25, z: 0, onGround: false });
  const controlsRef = useRef({ yaw: 0, pitch: -0.35 });
  const targetRef = useRef(null);
  const mobsRef = useRef([]);
  const timeRef = useRef(0.25);
  const healthRef = useRef(MAX_HEALTH);
  const canvasWrapRef = useRef(null);

  const [renderAnchor, setRenderAnchor] = useState({ x: 0, z: 0 });
  const [editsVersion, setEditsVersion] = useState(0);
  const [playerSample, setPlayerSample] = useState(playerSampleRef.current);
  const [targetState, setTargetState] = useState(null);
  const [timeOfDay, setTimeOfDay] = useState(0.25);
  const [health, setHealth] = useState(MAX_HEALTH);
  const [inventory, setInventory] = useState(INITIAL_INVENTORY);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [showCrafting, setShowCrafting] = useState(true);
  const [message, setMessage] = useState('Click Play to lock the cursor and start mining.');
  const [isLocked, setIsLocked] = useState(false);
  const [mobRevision, setMobRevision] = useState(0);

  const messageTimerRef = useRef(null);
  const selectedBlock = HOTBAR_ORDER[selectedSlot];

  const setToast = useCallback((text) => {
    setMessage(text);
    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
    }
    messageTimerRef.current = window.setTimeout(() => {
      setMessage('');
    }, 2400);
  }, []);

  const setWorldBlock = useCallback((x, y, z, nextBlock) => {
    const key = keyOf(x, y, z);
    const base = getBaseBlock(x, y, z);
    if (nextBlock === base) {
      editsRef.current.delete(key);
    } else {
      editsRef.current.set(key, nextBlock);
    }
    setEditsVersion((value) => value + 1);
  }, []);

  const requestPlay = useCallback(() => {
    const target = document.body;
    if (target?.requestPointerLock) {
      target.requestPointerLock();
    }
    setIsLocked(true);
    setToast('Cursor locked. Explore, mine, craft, and build.');
  }, [setToast]);

  const damageMobInFront = useCallback(() => {
    const origin = new THREE.Vector3(
      playerRef.current.position.x,
      playerRef.current.position.y + PLAYER_SIZE.eyeHeight,
      playerRef.current.position.z,
    );

    const direction = new THREE.Vector3(
      Math.sin(controlsRef.current.yaw) * Math.cos(controlsRef.current.pitch),
      Math.sin(controlsRef.current.pitch),
      -Math.cos(controlsRef.current.yaw) * Math.cos(controlsRef.current.pitch),
    ).normalize();

    let bestMob = null;
    let bestScore = Infinity;

    mobsRef.current.forEach((mob) => {
      const toMob = new THREE.Vector3(mob.position.x, mob.position.y + 0.25, mob.position.z).sub(origin);
      const distance = toMob.length();
      if (distance > 4.2) {
        return;
      }
      toMob.normalize();
      const alignment = direction.dot(toMob);
      if (alignment < 0.92) {
        return;
      }
      const score = distance - alignment;
      if (score < bestScore) {
        bestScore = score;
        bestMob = mob;
      }
    });

    if (!bestMob) {
      return false;
    }

    bestMob.hp -= 1;
    if (bestMob.hp <= 0) {
      setInventory((current) => ({ ...current, [BLOCK.STONE]: (current[BLOCK.STONE] ?? 0) + 1 }));
      setToast('Mob defeated. +1 stone');
      setMobRevision((value) => value + 1);
    } else {
      setToast('Hit!');
    }
    return true;
  }, [setToast]);

  const breakTargetBlock = useCallback(() => {
    if (damageMobInFront()) {
      return;
    }

    const target = targetRef.current;
    if (!target) {
      return;
    }

    const blockId = getBlock(target.x, target.y, target.z, editsRef.current);
    if (blockId === BLOCK.AIR) {
      return;
    }

    setWorldBlock(target.x, target.y, target.z, BLOCK.AIR);
    const drop = getDropForBlock(blockId);
    if (drop !== BLOCK.AIR) {
      setInventory((current) => ({ ...current, [drop]: (current[drop] ?? 0) + 1 }));
      setToast(`Collected ${blockLabel(drop)}.`);
    }
  }, [damageMobInFront, setToast, setWorldBlock]);

  const placeTargetBlock = useCallback(() => {
    const target = targetRef.current;
    if (!target) {
      return;
    }

    const inventoryCount = inventory[selectedBlock] ?? 0;
    if (inventoryCount <= 0) {
      return;
    }

    const origin = new THREE.Vector3(
      playerRef.current.position.x,
      playerRef.current.position.y + PLAYER_SIZE.eyeHeight,
      playerRef.current.position.z,
    );
    const direction = new THREE.Vector3(
      Math.sin(controlsRef.current.yaw) * Math.cos(controlsRef.current.pitch),
      Math.sin(controlsRef.current.pitch),
      -Math.cos(controlsRef.current.yaw) * Math.cos(controlsRef.current.pitch),
    ).normalize();
    const hit = raycastVoxel(origin, direction, REACH, editsRef.current);
    if (!hit) {
      return;
    }

    const placeX = hit.block.x + hit.faceNormal.x;
    const placeY = hit.block.y + hit.faceNormal.y;
    const placeZ = hit.block.z + hit.faceNormal.z;

    if (getBlock(placeX, placeY, placeZ, editsRef.current) !== BLOCK.AIR) {
      return;
    }

    const playerPos = playerRef.current.position;
    const minX = playerPos.x - PLAYER_SIZE.radius;
    const maxX = playerPos.x + PLAYER_SIZE.radius;
    const minY = playerPos.y;
    const maxY = playerPos.y + PLAYER_SIZE.height;
    const minZ = playerPos.z - PLAYER_SIZE.radius;
    const maxZ = playerPos.z + PLAYER_SIZE.radius;
    const intersects = !(maxX <= placeX || minX >= placeX + 1 || maxY <= placeY || minY >= placeY + 1 || maxZ <= placeZ || minZ >= placeZ + 1);
    if (intersects) {
      setToast('Cannot place a block inside the player.');
      return;
    }

    setWorldBlock(placeX, placeY, placeZ, selectedBlock);
    setInventory((current) => ({ ...current, [selectedBlock]: Math.max(0, (current[selectedBlock] ?? 0) - 1) }));
    setToast(`Placed ${blockLabel(selectedBlock)}.`);
  }, [inventory, selectedBlock, setToast, setWorldBlock]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (document.pointerLockElement !== document.body) {
        return;
      }
      controlsRef.current.yaw -= event.movementX * 0.0026;
      controlsRef.current.pitch -= event.movementY * 0.0022;
      controlsRef.current.pitch = Math.max(-1.45, Math.min(1.45, controlsRef.current.pitch));
    };

    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement === document.body;
      setIsLocked(locked);
      if (!locked) {
        setMessage('Cursor unlocked. Click Play to continue.');
      }
    };

    const handleMouseDown = (event) => {
      if (document.pointerLockElement !== document.body) {
        return;
      }
      if (event.button === 0) {
        breakTargetBlock();
      } else if (event.button === 2) {
        event.preventDefault();
        placeTargetBlock();
      }
    };

    const handleKeyDown = (event) => {
      if (/Digit[1-6]/.test(event.code)) {
        setSelectedSlot(Number(event.code.replace('Digit', '')) - 1);
      } else if (event.code === 'KeyC') {
        setShowCrafting((value) => !value);
      } else if (event.code === 'Escape') {
        setIsLocked(false);
      }
    };

    const handleWheel = (event) => {
      setSelectedSlot((current) => {
        const delta = event.deltaY > 0 ? 1 : -1;
        return (current + delta + HOTBAR_ORDER.length) % HOTBAR_ORDER.length;
      });
    };

    const preventContextMenu = (event) => event.preventDefault();

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('contextmenu', preventContextMenu);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('contextmenu', preventContextMenu);
    };
  }, [breakTargetBlock, placeTargetBlock]);

  useEffect(() => {
    const anchorX = Math.round(playerSample.x);
    const anchorZ = Math.round(playerSample.z);
    if (Math.abs(anchorX - renderAnchor.x) >= 3 || Math.abs(anchorZ - renderAnchor.z) >= 3) {
      setRenderAnchor({ x: anchorX, z: anchorZ });
    }
  }, [playerSample.x, playerSample.z, renderAnchor.x, renderAnchor.z]);

  useEffect(() => {
    if (health <= 0) {
      healthRef.current = MAX_HEALTH;
      setHealth(MAX_HEALTH);
      setToast('You respawned.');
    }
  }, [health, setToast]);

  const craftRecipe = useCallback((recipe) => {
    if (!canCraft(recipe, inventory)) {
      return;
    }
    setInventory(applyRecipe(recipe, inventory));
    setToast(`Crafted ${recipe.name}.`);
  }, [inventory, setToast]);

  return (
    <div ref={canvasWrapRef} className="game-shell">
      <div className="hud top-left">
        <div className="panel title-panel">
          <h1>MiniCraft 3D</h1>
          <p>A small Minecraft-style prototype built for the browser.</p>
        </div>
        <div className="panel stats-panel">
          <div><strong>Health:</strong> <span className="hearts">{hearts(health)}</span></div>
          <div><strong>Coords:</strong> {playerSample.x.toFixed(1)}, {playerSample.y.toFixed(1)}, {playerSample.z.toFixed(1)}</div>
          <div><strong>Time:</strong> {timeOfDay > 0.62 || timeOfDay < 0.15 ? 'Night' : 'Day'}</div>
          <div><strong>Target:</strong> {targetState ? `${targetState.x}, ${targetState.y}, ${targetState.z}` : 'None'}</div>
        </div>
      </div>

      <div className="hud top-right">
        <div className="panel controls-panel">
          <h2>Controls</h2>
          <ul>
            <li>WASD move</li>
            <li>Space jump</li>
            <li>Left click break / hit</li>
            <li>Right click place</li>
            <li>1-6 or mouse wheel switch block</li>
            <li>C toggle crafting</li>
            <li>Esc unlock cursor</li>
          </ul>
          <button id="play-button" className="play-button" onClick={requestPlay}>{isLocked ? 'Playing' : 'Play'}</button>
        </div>
        {showCrafting ? (
          <div className="panel crafting-panel">
            <h2>Crafting</h2>
            {RECIPES.map((recipe) => (
              <button key={recipe.id} className="craft-btn" disabled={!canCraft(recipe, inventory)} onClick={() => craftRecipe(recipe)}>
                <span>{recipe.name}</span>
                <small>{recipe.description}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="hud bottom-left">
        <div className="panel inventory-panel">
          <h2>Inventory</h2>
          <div className="inventory-grid">
            {HOTBAR_ORDER.concat(BLOCK.LEAVES).map((blockId) => (
              <div key={blockId} className="inventory-row">
                <span>{blockLabel(blockId)}</span>
                <strong>{inventory[blockId] ?? 0}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hud bottom-center">
        <div className="hotbar">
          {HOTBAR_ORDER.map((blockId, index) => (
            <button key={blockId} className={`slot ${index === selectedSlot ? 'selected' : ''}`} onClick={() => setSelectedSlot(index)}>
              <span>{index + 1}</span>
              <strong>{blockLabel(blockId)}</strong>
              <em>{inventory[blockId] ?? 0}</em>
            </button>
          ))}
        </div>
        <div className="crosshair" />
        {message ? <div className="message">{message}</div> : null}
      </div>

      <Canvas shadows={false} gl={{ antialias: false, powerPreference: 'high-performance' }} camera={{ fov: 75, near: 0.1, far: 120 }} dpr={[1, 1]}>
        <SceneController
          editsRef={editsRef}
          editsVersion={editsVersion}
          renderAnchor={renderAnchor}
          controlsRef={controlsRef}
          targetRef={targetRef}
          targetState={targetState}
          setTargetState={setTargetState}
          playerRef={playerRef}
          playerSampleRef={playerSampleRef}
          setPlayerSample={setPlayerSample}
          timeRef={timeRef}
          setTimeOfDay={setTimeOfDay}
          healthRef={healthRef}
          setHealth={setHealth}
          mobsRef={mobsRef}
          mobRevision={mobRevision}
          setMobRevision={setMobRevision}
        />
      </Canvas>
    </div>
  );
}
