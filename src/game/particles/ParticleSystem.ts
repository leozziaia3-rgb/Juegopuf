/**
 * ParticleSystem.ts - Next-Gen 3D Particle & Collision FX Engine
 * 
 * Includes:
 * 1. Camera-Facing Velocity Ribbons with Analytical Gaussian HDR Core & Blackbody Thermal Radiation
 * 2. Continuous High-Frequency Wall Scraping Spark Cascade (Fricción Continua de Titanio)
 * 3. Chassis Aerodynamic Slipstream Vortices & Wake Entrainment (Estela Turbulenta)
 * 4. Dynamic Specular Ground Contact Glow & Tarmac Scorch Decals (Reflejo en Asfalto y Quemaduras)
 * 5. 3D Carbon Fiber Fracture Shards, Volumetric Bilow Tire Smoke, and Flash Illumination
 */

import * as THREE from 'three';

interface Spark {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface SmokePuff {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  size: number;
  maxSize: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  maxOpacity: number;
  life: number;
  maxLife: number;
  colorR: number;
  colorG: number;
  colorB: number;
}

interface DebrisChunk {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Vector3;
  angVel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface ScorchMark {
  x: number;
  z: number;
  radius: number;
  life: number;
  maxLife: number;
  rotation: number;
  opacity: number;
}

export class ParticleSystem {
  public group: THREE.Group;

  // --- 1. Camera-Facing Velocity-Aligned Ribbon Sparks (Instanced Custom Shader) ---
  private sparks: Spark[] = [];
  private sparkPool: Spark[] = [];
  private sparkMesh!: THREE.Mesh;
  private sparkInstGeo!: THREE.InstancedBufferGeometry;
  private sparkInstPos!: Float32Array;
  private sparkInstVel!: Float32Array;
  private sparkInstLife!: Float32Array;
  private maxSparks = 220;
  private sparkSpawnAccumulator = 0;
  private vortexTime = 0;

  // --- 2. Volumetric Smoke Particles ---
  private smokePuffs: SmokePuff[] = [];
  private smokePoints!: THREE.Points;
  private smokePositions!: Float32Array;
  private smokeColors!: Float32Array;
  private smokeSizes!: Float32Array;
  private maxSmoke = 240;

  // --- 3. 3D Carbon Fiber Fracture Shards (Single Batched InstancedMesh) ---
  private debrisList: DebrisChunk[] = [];
  private debrisPool: DebrisChunk[] = [];
  private debrisMesh!: THREE.InstancedMesh;
  private maxDebris = 60;

  // --- 4. Dynamic Collision Flash Light ---
  private impactLight!: THREE.PointLight;

  // --- 5. Ground Contact Glow (Specular Asphalt Reflection) ---
  private groundGlowMesh!: THREE.Mesh;
  private groundGlowMaterial!: THREE.MeshBasicMaterial;
  private groundGlowPos = new THREE.Vector3();
  private groundGlowIntensity = 0;

  // --- 6. Tarmac Scorch Marks (Quemaduras y Marcas de Hollín) ---
  private scorchList: ScorchMark[] = [];
  private scorchMesh!: THREE.InstancedMesh;
  private maxScorches = 32;
  private scorchTexture!: THREE.CanvasTexture;

  // --- 7. Dynamic 4-Wheel Persistent Tire Skid Marks Mesh ---
  private skidMesh!: THREE.Mesh;
  private skidPositions!: Float32Array;
  private skidAlphas!: Float32Array;
  private maxSkidPoints = 1200; // Optimal performance capacity (7,200 vertices, 86 KB buffer)
  private skidIndex = 0;
  private lastWheelPositions: THREE.Vector3[] = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]; // [FL, FR, RL, RR]
  private lastWheelActive: boolean[] = [false, false, false, false];
  private lastLeftWheelPos: THREE.Vector3 | null = null;
  private lastRightWheelPos: THREE.Vector3 | null = null;

  // --- 8. Aerodynamic Wingtip Vortex Streamer Ribbons ---
  private vortexRibbonMesh!: THREE.Mesh;
  private vortexPositions!: Float32Array;
  private vortexColors!: Float32Array;
  private maxVortexPoints = 48; // 24 segments per wingtip
  private leftVortexHistory: THREE.Vector3[] = [];
  private rightVortexHistory: THREE.Vector3[] = [];

  // Procedural Textures
  private smokeTexture!: THREE.CanvasTexture;
  private groundGlowTexture!: THREE.CanvasTexture;

  // Scratch objects for zero runtime GC allocations
  private prevActiveSparks = 0;
  private prevActiveSmoke = 0;
  private prevActiveDebris = 0;
  private prevActiveScorches = 0;

  // Pools to eliminate GC allocation completely
  private smokePool: SmokePuff[] = [];
  private scorchPool: ScorchMark[] = [];

  /**
   * High-Performance O(1) swap-and-pop to eliminate O(N) array shift memory reindexing
   */
  private popOldest<T>(list: T[]): T {
    if (list.length <= 1) return list.pop()!;
    const oldest = list[0];
    list[0] = list.pop()!;
    return oldest;
  }

  private _scratchVec1 = new THREE.Vector3();
  private _scratchVec2 = new THREE.Vector3();
  private _scratchVec3 = new THREE.Vector3();
  private _scratchVec4 = new THREE.Vector3();

  private _debrisMatrix = new THREE.Matrix4();
  private _debrisQuat = new THREE.Quaternion();
  private _debrisEuler = new THREE.Euler();
  private _debrisScale = new THREE.Vector3();

  private _scorchMatrix = new THREE.Matrix4();
  private _scorchQuat = new THREE.Quaternion();
  private _scorchEuler = new THREE.Euler(-Math.PI / 2, 0, 0);
  private _scorchScale = new THREE.Vector3();
  private _scorchPos = new THREE.Vector3();

  private _skidP1 = new THREE.Vector3();
  private _skidP2 = new THREE.Vector3();
  private _skidP3 = new THREE.Vector3();
  private _skidP4 = new THREE.Vector3();

  constructor() {
    this.group = new THREE.Group();

    // 1. Pre-allocate spark object pool
    for (let i = 0; i < this.maxSparks; i++) {
      this.sparkPool.push({
        position: new THREE.Vector3(0, -99999, 0),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
      });
    }

    // 2. Pre-allocate smoke puff object pool
    for (let i = 0; i < this.maxSmoke; i++) {
      this.smokePool.push({
        position: new THREE.Vector3(0, -99999, 0),
        velocity: new THREE.Vector3(),
        size: 0.5,
        maxSize: 1.5,
        rotation: 0,
        rotationSpeed: 0,
        opacity: 0.8,
        maxOpacity: 0.8,
        life: 0,
        maxLife: 1.0,
        colorR: 0.9,
        colorG: 0.9,
        colorB: 0.9,
      });
    }

    // 3. Pre-allocate debris object pool
    for (let i = 0; i < this.maxDebris; i++) {
      this.debrisPool.push({
        position: new THREE.Vector3(0, -99999, 0),
        velocity: new THREE.Vector3(),
        rotation: new THREE.Vector3(),
        angVel: new THREE.Vector3(),
        life: 0,
        maxLife: 1.0,
      });
    }

    // 4. Pre-allocate scorch marks pool
    for (let i = 0; i < this.maxScorches; i++) {
      this.scorchPool.push({
        x: 0,
        z: 0,
        radius: 0.2,
        life: 0,
        maxLife: 2.0,
        rotation: 0,
        opacity: 0.8,
      });
    }

    this.createTextures();
    this.initSparksShader();
    this.initVolumetricSmoke();
    this.initDebris();
    this.initGroundContactGlow();
    this.initScorchMarks();
    this.initSkidmarks();
    this.initWingtipVortices();
  }

  /**
   * Generates procedural radial alpha masks and scorch textures
   */
  private createTextures(): void {
    // 1. Soft Gaussian Smoke Texture
    const smokeCanvas = document.createElement('canvas');
    smokeCanvas.width = 128;
    smokeCanvas.height = 128;
    const sCtx = smokeCanvas.getContext('2d')!;

    const sGrad = sCtx.createRadialGradient(64, 64, 4, 64, 64, 62);
    sGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    sGrad.addColorStop(0.25, 'rgba(240, 240, 245, 0.85)');
    sGrad.addColorStop(0.55, 'rgba(200, 205, 215, 0.45)');
    sGrad.addColorStop(0.85, 'rgba(160, 165, 175, 0.12)');
    sGrad.addColorStop(1.0, 'rgba(120, 120, 130, 0.0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 128);

    sCtx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    for (let i = 0; i < 20; i++) {
      const x = 30 + Math.random() * 68;
      const y = 30 + Math.random() * 68;
      const r = 10 + Math.random() * 18;
      sCtx.beginPath();
      sCtx.arc(x, y, r, 0, Math.PI * 2);
      sCtx.fill();
    }
    this.smokeTexture = new THREE.CanvasTexture(smokeCanvas);

    // 2. Specular Ground Reflection Glow Texture (Gaussian Radial)
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    const gCtx = glowCanvas.getContext('2d')!;
    const gGrad = gCtx.createRadialGradient(64, 64, 2, 64, 64, 62);
    gGrad.addColorStop(0.0, 'rgba(255, 240, 180, 1.0)');
    gGrad.addColorStop(0.25, 'rgba(255, 180, 60, 0.75)');
    gGrad.addColorStop(0.55, 'rgba(255, 100, 20, 0.35)');
    gGrad.addColorStop(0.85, 'rgba(180, 40, 0, 0.10)');
    gGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    gCtx.fillStyle = gGrad;
    gCtx.fillRect(0, 0, 128, 128);
    this.groundGlowTexture = new THREE.CanvasTexture(glowCanvas);

    // 3. Tarmac Scorch / Carbon Burn Texture
    const scorchCanvas = document.createElement('canvas');
    scorchCanvas.width = 128;
    scorchCanvas.height = 128;
    const scCtx = scorchCanvas.getContext('2d')!;
    const scGrad = scCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
    scGrad.addColorStop(0.0, 'rgba(10, 10, 12, 0.95)');
    scGrad.addColorStop(0.4, 'rgba(18, 18, 22, 0.75)');
    scGrad.addColorStop(0.7, 'rgba(25, 25, 30, 0.35)');
    scGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    scCtx.fillStyle = scGrad;
    scCtx.fillRect(0, 0, 128, 128);

    // Irregular splatter spots around scorch burn
    scCtx.fillStyle = 'rgba(8, 8, 10, 0.6)';
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 38;
      const rx = 64 + Math.cos(angle) * dist;
      const ry = 64 + Math.sin(angle) * dist;
      const rad = 3 + Math.random() * 8;
      scCtx.beginPath();
      scCtx.arc(rx, ry, rad, 0, Math.PI * 2);
      scCtx.fill();
    }
    this.scorchTexture = new THREE.CanvasTexture(scorchCanvas);
  }

  /**
   * Module 1: Camera-Facing Velocity Ribbons with Analytical Gaussian HDR Core & Blackbody Radiance
   */
  private initSparksShader(): void {
    const baseGeo = new THREE.PlaneGeometry(1.0, 1.0);
    this.sparkInstGeo = new THREE.InstancedBufferGeometry();
    this.sparkInstGeo.index = baseGeo.index;
    this.sparkInstGeo.attributes.position = baseGeo.attributes.position;
    this.sparkInstGeo.attributes.uv = baseGeo.attributes.uv;

    this.sparkInstPos = new Float32Array(this.maxSparks * 3);
    this.sparkInstVel = new Float32Array(this.maxSparks * 3);
    this.sparkInstLife = new Float32Array(this.maxSparks * 2);

    // Initialize all instances off-screen
    for (let i = 0; i < this.maxSparks; i++) {
      this.sparkInstPos[i * 3 + 1] = -99999;
      this.sparkInstLife[i * 2 + 1] = 0;
    }

    const posAttr = new THREE.InstancedBufferAttribute(this.sparkInstPos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this.sparkInstGeo.setAttribute('aInstancePos', posAttr);

    const velAttr = new THREE.InstancedBufferAttribute(this.sparkInstVel, 3);
    velAttr.setUsage(THREE.DynamicDrawUsage);
    this.sparkInstGeo.setAttribute('aInstanceVel', velAttr);

    const lifeAttr = new THREE.InstancedBufferAttribute(this.sparkInstLife, 2);
    lifeAttr.setUsage(THREE.DynamicDrawUsage);
    this.sparkInstGeo.setAttribute('aInstanceLife', lifeAttr);

    const sparkMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 aInstancePos;
        attribute vec3 aInstanceVel;
        attribute vec2 aInstanceLife; // (currentLife, maxLife)

        varying vec2 vUv;
        varying float vProgress;

        void main() {
          vUv = uv;
          float maxLife = aInstanceLife.y;
          float life = aInstanceLife.x;
          float progress = maxLife > 0.0 ? clamp(life / maxLife, 0.0, 1.0) : 1.0;
          vProgress = progress;

          if (maxLife <= 0.0 || progress >= 1.0) {
            gl_Position = vec4(0.0, -99999.0, 0.0, 1.0);
            return;
          }

          float speed = length(aInstanceVel);
          vec3 forward = speed > 0.001 ? normalize(aInstanceVel) : vec3(0.0, 0.0, 1.0);

          // Velocity ribbon length & dynamic thickness
          float lengthScale = clamp(speed * 0.075 + 0.18, 0.18, 1.6);
          float thickness = clamp((1.0 - progress) * 0.038, 0.004, 0.038);

          // Calculate view-aligned side vector
          vec3 toCamera = normalize(cameraPosition - aInstancePos);
          vec3 side = cross(forward, toCamera);
          float sideLen = length(side);
          if (sideLen < 0.001) {
            side = abs(forward.y) < 0.99 ? cross(forward, vec3(0.0, 1.0, 0.0)) : cross(forward, vec3(1.0, 0.0, 0.0));
          }
          side = normalize(side);

          // Trailing ribbon vertex computation (front at uv.y = 0.0, tail at uv.y = 1.0)
          vec3 worldPos = aInstancePos - (forward * (uv.y * lengthScale)) + (side * ((uv.x - 0.5) * thickness));

          gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying float vProgress;

        void main() {
          if (vProgress >= 1.0) discard;

          // Transverse analytical Gaussian profile from centerline (uv.x = 0.5)
          float distFromCenter = abs(vUv.x - 0.5) * 2.0;
          float coreGlow = exp(-distFromCenter * distFromCenter * 14.0); // Intense super-white core
          float haloGlow = exp(-distFromCenter * distFromCenter * 3.2) * 0.72; // Soft thermal glow

          // Longitudinal taper: hot needle point at front, smooth decay toward tail
          float tailFade = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.25);
          float alpha = (coreGlow + haloGlow) * tailFade * (1.0 - vProgress);
          if (alpha < 0.005) discard;

          // Blackbody Thermal Radiation Spectrum
          // 0.00 - 0.18: Incandescent White-Hot (+2600K)
          // 0.18 - 0.45: Brilliant Electric Gold (1900K)
          // 0.45 - 0.75: Deep Molten Orange (1200K)
          // 0.75 - 1.00: Dark Cherry Crimson Ember (750K) -> Off
          vec3 thermalColor;
          if (vProgress < 0.18) {
            float f = vProgress / 0.18;
            thermalColor = mix(vec3(1.4, 1.4, 1.3), vec3(1.15, 0.95, 0.28), f);
          } else if (vProgress < 0.45) {
            float f = (vProgress - 0.18) / 0.27;
            thermalColor = mix(vec3(1.15, 0.95, 0.28), vec3(1.0, 0.46, 0.06), f);
          } else if (vProgress < 0.75) {
            float f = (vProgress - 0.45) / 0.30;
            thermalColor = mix(vec3(1.0, 0.46, 0.06), vec3(0.65, 0.08, 0.0), f);
          } else {
            float f = (vProgress - 0.75) / 0.25;
            thermalColor = mix(vec3(0.65, 0.08, 0.0), vec3(0.04, 0.0, 0.0), f);
          }

          vec3 finalColor = mix(thermalColor, vec3(1.6, 1.6, 1.55), coreGlow * (1.0 - vProgress * 0.65));

          gl_FragColor = vec4(finalColor * alpha, alpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
    });

    this.sparkMesh = new THREE.Mesh(this.sparkInstGeo, sparkMaterial);
    this.sparkMesh.frustumCulled = false;
    this.group.add(this.sparkMesh);

    // Dynamic Collision Impact Flash Light
    this.impactLight = new THREE.PointLight(0xffdd66, 0, 18, 2.0);
    this.group.add(this.impactLight);
  }

  /**
   * Module 4: Dynamic Specular Ground Contact Glow (Reflejo en Asfalto)
   */
  private initGroundContactGlow(): void {
    const glowGeo = new THREE.PlaneGeometry(3.6, 3.6);
    glowGeo.rotateX(-Math.PI / 2);

    this.groundGlowMaterial = new THREE.MeshBasicMaterial({
      map: this.groundGlowTexture,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -4.0,
    });

    this.groundGlowMesh = new THREE.Mesh(glowGeo, this.groundGlowMaterial);
    this.groundGlowMesh.position.set(0, 0.015, 0);
    this.groundGlowMesh.visible = false;
    this.group.add(this.groundGlowMesh);
  }

  /**
   * Module 4: Tarmac Scorch Marks (Marcas de Quemaduras y Hollín en el Asfalto)
   */
  private initScorchMarks(): void {
    const scorchGeo = new THREE.PlaneGeometry(1.0, 1.0);
    const scorchMat = new THREE.MeshBasicMaterial({
      map: this.scorchTexture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.5,
      polygonOffsetUnits: -6.0,
    });

    this.scorchMesh = new THREE.InstancedMesh(scorchGeo, scorchMat, this.maxScorches);
    this.scorchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scorchMesh.frustumCulled = false;

    // Initialize all scorch instances off-screen
    const offMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    offMatrix.setPosition(0, -999, 0);
    for (let i = 0; i < this.maxScorches; i++) {
      this.scorchMesh.setMatrixAt(i, offMatrix);
    }
    this.scorchMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.scorchMesh);
  }

  private initVolumetricSmoke(): void {
    const geo = new THREE.BufferGeometry();
    this.smokePositions = new Float32Array(this.maxSmoke * 3);
    this.smokeColors = new Float32Array(this.maxSmoke * 4); // RGBA
    this.smokeSizes = new Float32Array(this.maxSmoke);

    geo.setAttribute('position', new THREE.BufferAttribute(this.smokePositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.smokeColors, 4));

    const mat = new THREE.PointsMaterial({
      size: 2.2,
      map: this.smokeTexture,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      opacity: 0.75,
    });

    this.smokePoints = new THREE.Points(geo, mat);
    this.smokePoints.frustumCulled = false;
    this.group.add(this.smokePoints);
  }

  private initDebris(): void {
    // Realistic 3D aerodynamic carbon composite plate shard
    const shardGeo = new THREE.BoxGeometry(0.18, 0.015, 0.10);
    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x14161a,
      roughness: 0.32,
      metalness: 0.88,
      side: THREE.DoubleSide,
    });

    this.debrisMesh = new THREE.InstancedMesh(shardGeo, carbonMat, this.maxDebris);
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.frustumCulled = false;

    const offMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    offMatrix.setPosition(0, -999, 0);
    for (let i = 0; i < this.maxDebris; i++) {
      this.debrisMesh.setMatrixAt(i, offMatrix);
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.debrisMesh);
  }

  private initSkidmarks(): void {
    const geo = new THREE.BufferGeometry();
    const totalVertices = this.maxSkidPoints * 6;
    this.skidPositions = new Float32Array(totalVertices * 3);
    this.skidAlphas = new Float32Array(totalVertices * 4);

    geo.setAttribute('position', new THREE.BufferAttribute(this.skidPositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.skidAlphas, 4));

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -4.0,
    });

    this.skidMesh = new THREE.Mesh(geo, mat);
    this.skidMesh.frustumCulled = false;
    this.group.add(this.skidMesh);
  }

  /**
   * Spawn a persistent tarmac scorch mark decal that smoothly fades out
   */
  public addScorchMark(x: number, z: number, radius: number = 0.22): void {
    let sc: ScorchMark;
    if (this.scorchPool.length > 0) {
      sc = this.scorchPool.pop()!;
    } else if (this.scorchList.length >= this.maxScorches) {
      sc = this.popOldest(this.scorchList)!;
    } else {
      sc = { x: 0, z: 0, radius: 0.2, life: 0, maxLife: 2.0, rotation: 0, opacity: 0.8 };
    }

    sc.x = x;
    sc.z = z;
    sc.radius = Math.max(0.12, Math.min(0.45, radius));
    sc.life = 0;
    sc.maxLife = 2.2 + Math.random() * 1.0;
    sc.rotation = Math.random() * Math.PI * 2;
    sc.opacity = 0.85;
    this.scorchList.push(sc);
  }

  /**
   * Module 2: Continuous High-Frequency Wall Scraping Spark Cascade (Fricción Continua)
   * Emits dense stream of micro-sparks spraying tangentially along barriers during scraping
   */
  public emitContinuousScrapeSparks(
    contactPos: THREE.Vector3,
    wallNormal: THREE.Vector3,
    carVelocity: THREE.Vector3,
    dt: number,
    intensity: number = 0.5
  ): void {
    const carSpeed = carVelocity.length();
    if (carSpeed < 1.0) return;

    // Tangential direction along the wall
    const dot = carVelocity.dot(wallNormal);
    const tangX = carVelocity.x - wallNormal.x * dot;
    const tangZ = carVelocity.z - wallNormal.z * dot;
    const tangLen = Math.sqrt(tangX * tangX + tangZ * tangZ) || 1.0;
    const dirX = tangX / tangLen;
    const dirZ = tangZ / tangLen;

    // Spawn continuous micro-sparks based on friction intensity and dt (framerate invariant)
    this.sparkSpawnAccumulator += intensity * 180.0 * Math.max(0.001, Math.min(0.05, dt));
    const count = Math.min(12, Math.floor(this.sparkSpawnAccumulator));
    this.sparkSpawnAccumulator -= count;

    for (let i = 0; i < count; i++) {
      let spark: Spark;
      if (this.sparkPool.length > 0) {
        spark = this.sparkPool.pop()!;
      } else if (this.sparks.length < this.maxSparks) {
        spark = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, maxLife: 0 };
      } else {
        spark = this.popOldest(this.sparks)!;
      }

      const spread = 0.25;
      const speed = carSpeed * (0.85 + Math.random() * 0.9) + 4.0;
      spark.position.set(
        contactPos.x + (Math.random() - 0.5) * 0.15,
        contactPos.y + Math.random() * 0.25,
        contactPos.z + (Math.random() - 0.5) * 0.15
      );
      spark.velocity.set(
        dirX * speed + wallNormal.x * (Math.random() * 2.5 + 0.8) + (Math.random() - 0.5) * spread * 6.0,
        Math.random() * 3.2 + 0.4,
        dirZ * speed + wallNormal.z * (Math.random() * 2.5 + 0.8) + (Math.random() - 0.5) * spread * 6.0
      );
      spark.life = 0;
      spark.maxLife = 0.22 + Math.random() * 0.38;
      this.sparks.push(spark);
    }

    // Trigger specular ground contact glow
    this.groundGlowPos.copy(contactPos);
    this.groundGlowIntensity = Math.min(1.0, this.groundGlowIntensity + intensity * 0.6);

    // Random scorch burn on ground under scraping contact
    if (Math.random() < 0.20) {
      this.addScorchMark(contactPos.x + (Math.random() - 0.5) * 0.3, contactPos.z + (Math.random() - 0.5) * 0.3, 0.18 + intensity * 0.15);
    }
  }

  /**
   * Discrete High-Impact Burst on initial barrier collision
   */
  public emitSparks(pos: THREE.Vector3, normal: THREE.Vector3, count: number = 24): void {
    // 1. Dynamic Flash of Incandescent Light on Collision
    if (this.impactLight) {
      this.impactLight.position.copy(pos).addScaledVector(normal, 0.45);
      this.impactLight.intensity = Math.min(12.0, 4.0 + count * 0.20);
    }

    const actualCount = Math.min(count, 32);

    // 2. High-speed incandescent needle sparks
    for (let i = 0; i < actualCount; i++) {
      let spark: Spark;
      if (this.sparkPool.length > 0) {
        spark = this.sparkPool.pop()!;
      } else if (this.sparks.length < this.maxSparks) {
        spark = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, maxLife: 0 };
      } else {
        spark = this.popOldest(this.sparks)!;
      }

      const spread = 0.85;
      const speed = 12.0 + Math.random() * 18.0;
      spark.position.set(
        pos.x + (Math.random() - 0.5) * 0.25,
        pos.y + Math.random() * 0.2,
        pos.z + (Math.random() - 0.5) * 0.25
      );
      const nx = normal.x * 2.2 + (Math.random() - 0.5) * spread;
      const ny = Math.random() * 3.8 + 1.0;
      const nz = normal.z * 2.2 + (Math.random() - 0.5) * spread;
      const len = Math.hypot(nx, ny, nz) || 1.0;
      spark.velocity.set((nx / len) * speed, (ny / len) * speed, (nz / len) * speed);
      spark.life = 0;
      spark.maxLife = 0.35 + Math.random() * 0.55;
      this.sparks.push(spark);
    }

    // 3. Spawn 3D physical carbon fiber shards on collision
    this.emitCarbonDebrisBurst(pos, normal, undefined, Math.min(14, Math.max(3, Math.floor(actualCount / 2))));

    // 4. Trigger Ground Contact Glow & Scorch Mark
    this.groundGlowPos.copy(pos);
    this.groundGlowIntensity = Math.min(1.0, this.groundGlowIntensity + 0.85);
    this.addScorchMark(pos.x, pos.z, 0.28);

    // 5. Impact dust cloud
    this.emitImpactDust(pos, normal);
  }

  /**
   * Emit high-velocity 3D carbon fiber shards & aerodynamic composite debris on violent impacts
   */
  public emitCarbonDebrisBurst(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    carVel?: THREE.Vector3,
    count: number = 16
  ): void {
    const debrisCount = Math.min(count, this.maxDebris - this.debrisList.length);
    for (let d = 0; d < debrisCount; d++) {
      let shard: DebrisChunk;
      if (this.debrisPool.length > 0) {
        shard = this.debrisPool.pop()!;
      } else if (this.debrisList.length >= this.maxDebris) {
        shard = this.popOldest(this.debrisList)!;
      } else {
        shard = {
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          rotation: new THREE.Vector3(),
          angVel: new THREE.Vector3(),
          life: 0,
          maxLife: 1.0,
        };
      }

      const shardSpeed = 5.5 + Math.random() * 11.0;
      const fwdX = carVel ? carVel.x * 0.40 : 0;
      const fwdY = carVel ? carVel.y * 0.40 : 0;
      const fwdZ = carVel ? carVel.z * 0.40 : 0;

      const rawBx = normal.x * 2.6 + (Math.random() - 0.5) * 3.8;
      const rawBy = 2.6 + Math.random() * 4.8;
      const rawBz = normal.z * 2.6 + (Math.random() - 0.5) * 3.8;
      const bLen = Math.hypot(rawBx, rawBy, rawBz) || 1.0;

      shard.position.set(
        pos.x + (Math.random() - 0.5) * 0.35,
        pos.y + 0.18 + Math.random() * 0.25,
        pos.z + (Math.random() - 0.5) * 0.35
      );
      shard.velocity.set(
        (rawBx / bLen) * shardSpeed + fwdX,
        (rawBy / bLen) * shardSpeed + fwdY,
        (rawBz / bLen) * shardSpeed + fwdZ
      );
      shard.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      shard.angVel.set(
        (Math.random() - 0.5) * 32,
        (Math.random() - 0.5) * 32,
        (Math.random() - 0.5) * 32
      );
      shard.life = 0;
      shard.maxLife = 2.0 + Math.random() * 1.5;

      this.debrisList.push(shard);
    }
  }

  /**
   * Emit compressed air aerosol puffs from pneumatic impact wrenches and air jacks (clean white air blast)
   */
  public emitPneumaticBlast(pos: THREE.Vector3, dir: THREE.Vector3, count: number = 3): void {
    for (let i = 0; i < count; i++) {
      let puff: SmokePuff;
      if (this.smokePool.length > 0) {
        puff = this.smokePool.pop()!;
      } else if (this.smokePuffs.length < this.maxSmoke) {
        puff = {
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          size: 0.25,
          maxSize: 0.9,
          rotation: 0,
          rotationSpeed: 0,
          opacity: 0.8,
          maxOpacity: 0.8,
          life: 0,
          maxLife: 0.35,
          colorR: 0.98,
          colorG: 0.99,
          colorB: 1.0,
        };
      } else {
        puff = this.popOldest(this.smokePuffs)!;
      }

      const speed = 2.5 + Math.random() * 3.5;
      puff.position.set(
        pos.x + (Math.random() - 0.5) * 0.1,
        pos.y + (Math.random() - 0.5) * 0.1,
        pos.z + (Math.random() - 0.5) * 0.1
      );
      puff.velocity.set(
        dir.x * speed + (Math.random() - 0.5) * 0.8,
        dir.y * speed + (Math.random() - 0.5) * 0.8,
        dir.z * speed + (Math.random() - 0.5) * 0.8
      );
      puff.size = 0.25;
      puff.maxSize = 0.9 + Math.random() * 0.4;
      puff.rotation = Math.random() * Math.PI * 2;
      puff.rotationSpeed = (Math.random() - 0.5) * 3.0;
      puff.opacity = 0.8;
      puff.maxOpacity = 0.8;
      puff.life = 0;
      puff.maxLife = 0.35 + Math.random() * 0.2;
      puff.colorR = 0.98;
      puff.colorG = 0.99;
      puff.colorB = 1.0;

      this.smokePuffs.push(puff);
    }
  }

  /**
   * Emit dense cryogenic nitrogen vapor plume from pneumatic wheel gun exhaust valve (40 bar rapid decompression)
   */
  public emitCryogenicNitrogenPlume(pos: THREE.Vector3, dir: THREE.Vector3, count: number = 4): void {
    for (let i = 0; i < count; i++) {
      let puff: SmokePuff;
      if (this.smokePool.length > 0) {
        puff = this.smokePool.pop()!;
      } else if (this.smokePuffs.length < this.maxSmoke) {
        puff = {
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          size: 0.12,
          maxSize: 0.55,
          rotation: 0,
          rotationSpeed: 0,
          opacity: 0.92,
          maxOpacity: 0.92,
          life: 0,
          maxLife: 0.22,
          colorR: 0.94,
          colorG: 0.97,
          colorB: 1.0,
        };
      } else {
        puff = this.popOldest(this.smokePuffs)!;
      }

      const coneSpread = 0.35;
      const speed = 4.2 + Math.random() * 5.0;
      puff.position.set(
        pos.x + (Math.random() - 0.5) * 0.06,
        pos.y + (Math.random() - 0.5) * 0.06,
        pos.z + (Math.random() - 0.5) * 0.06
      );
      puff.velocity.set(
        dir.x * speed + (Math.random() - 0.5) * coneSpread * speed,
        dir.y * speed + (Math.random() - 0.5) * coneSpread * speed + 0.3,
        dir.z * speed + (Math.random() - 0.5) * coneSpread * speed
      );
      puff.size = 0.12;
      puff.maxSize = 0.55 + Math.random() * 0.28;
      puff.rotation = Math.random() * Math.PI * 2;
      puff.rotationSpeed = (Math.random() - 0.5) * 6.0;
      puff.opacity = 0.92;
      puff.maxOpacity = 0.92;
      puff.life = 0;
      puff.maxLife = 0.22 + Math.random() * 0.16;
      puff.colorR = 0.94;
      puff.colorG = 0.97;
      puff.colorB = 1.0;

      this.smokePuffs.push(puff);
    }
  }

  /**
   * Emit razor-sharp golden micro-sparks from wheel hub centerlock torquing (WITHOUT dust)
   */
  public emitNutTorqueSparks(pos: THREE.Vector3, count: number = 6): void {
    for (let i = 0; i < count; i++) {
      let spark: Spark;
      if (this.sparkPool.length > 0) {
        spark = this.sparkPool.pop()!;
      } else if (this.sparks.length < this.maxSparks) {
        spark = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, maxLife: 0 };
      } else {
        spark = this.popOldest(this.sparks)!;
      }

      const angle = Math.random() * Math.PI * 2;
      const speed = 4.0 + Math.random() * 6.5;
      spark.position.set(
        pos.x + (Math.random() - 0.5) * 0.05,
        pos.y + (Math.random() - 0.5) * 0.05,
        pos.z + (Math.random() - 0.5) * 0.05
      );
      spark.velocity.set(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed * 0.8 + 1.2,
        (Math.random() - 0.5) * 2.0
      );
      spark.life = 0;
      spark.maxLife = 0.18 + Math.random() * 0.15;

      this.sparks.push(spark);
    }
  }

  /**
   * Emit white/grey dust cloud upon crashing into barrier or ground
   */
  public emitImpactDust(pos: THREE.Vector3, normal: THREE.Vector3): void {
    for (let i = 0; i < 6; i++) {
      let puff: SmokePuff;
      if (this.smokePool.length > 0) {
        puff = this.smokePool.pop()!;
      } else if (this.smokePuffs.length < this.maxSmoke) {
        puff = {
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          size: 0.6,
          maxSize: 2.4,
          rotation: 0,
          rotationSpeed: 0,
          opacity: 0.65,
          maxOpacity: 0.65,
          life: 0,
          maxLife: 0.85,
          colorR: 0.85,
          colorG: 0.85,
          colorB: 0.88,
        };
      } else {
        puff = this.popOldest(this.smokePuffs)!;
      }

      puff.position.set(
        pos.x + (Math.random() - 0.5) * 0.5,
        0.1,
        pos.z + (Math.random() - 0.5) * 0.5
      );
      puff.velocity.set(
        normal.x * 1.8 + (Math.random() - 0.5) * 1.8,
        0.8 + Math.random() * 1.4,
        normal.z * 1.8 + (Math.random() - 0.5) * 1.8
      );
      puff.size = 0.6;
      puff.maxSize = 2.4 + Math.random() * 1.2;
      puff.rotation = Math.random() * Math.PI * 2;
      puff.rotationSpeed = (Math.random() - 0.5) * 1.5;
      puff.opacity = 0.65;
      puff.maxOpacity = 0.65;
      puff.life = 0;
      puff.maxLife = 0.85 + Math.random() * 0.5;
      puff.colorR = 0.85;
      puff.colorG = 0.85;
      puff.colorB = 0.88;

      this.smokePuffs.push(puff);
    }
  }

  /**
   * Emit billowing tire smoke during drift, burnout, or hard braking
   * Ejects smoke with real tire tangential velocity and aerodynamic wake turbulence
   */
  public emitTireSmoke(
    pos: THREE.Vector3,
    count: number = 3,
    slipRatio: number = 0.5,
    tireVelocity?: THREE.Vector3
  ): void {
    const opacityFactor = Math.min(0.92, 0.45 + slipRatio * 0.5);

    for (let i = 0; i < count; i++) {
      let puff: SmokePuff;
      if (this.smokePool.length > 0) {
        puff = this.smokePool.pop()!;
      } else if (this.smokePuffs.length < this.maxSmoke) {
        puff = {
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          size: 0.45,
          maxSize: 2.8,
          rotation: 0,
          rotationSpeed: 0,
          opacity: opacityFactor,
          maxOpacity: opacityFactor,
          life: 0,
          maxLife: 1.1,
          colorR: 0.94,
          colorG: 0.94,
          colorB: 0.96,
        };
      } else {
        puff = this.popOldest(this.smokePuffs)!;
      }

      const vx = tireVelocity ? tireVelocity.x * (0.4 + Math.random() * 0.3) + (Math.random() - 0.5) * 1.2 : (Math.random() - 0.5) * 1.2;
      const vz = tireVelocity ? tireVelocity.z * (0.4 + Math.random() * 0.3) + (Math.random() - 0.5) * 1.2 : (Math.random() - 0.5) * 1.2;
      const vy = 0.55 + Math.random() * 1.1 + (slipRatio * 0.6);

      puff.position.set(
        pos.x + (Math.random() - 0.5) * 0.4,
        0.06 + Math.random() * 0.08,
        pos.z + (Math.random() - 0.5) * 0.4
      );
      puff.velocity.set(vx, vy, vz);
      puff.size = 0.45 + Math.random() * 0.35;
      puff.maxSize = 2.8 + Math.random() * 1.6 + slipRatio * 1.4;
      puff.rotation = Math.random() * Math.PI * 2;
      puff.rotationSpeed = (Math.random() - 0.5) * 2.8;
      puff.opacity = opacityFactor;
      puff.maxOpacity = opacityFactor;
      puff.life = 0;
      puff.maxLife = 1.1 + Math.random() * 0.7;
      puff.colorR = 0.94;
      puff.colorG = 0.94;
      puff.colorB = 0.96;

      this.smokePuffs.push(puff);
    }
  }

  /**
   * Emit realistic exhaust smoke and backfire plumes
   */
  public emitRealisticExhaust(
    pos: THREE.Vector3,
    rearDir: THREE.Vector3,
    mode: 'idle' | 'power' | 'backfire'
  ): void {
    if (mode === 'idle') {
      let puff: SmokePuff;
      if (this.smokePool.length > 0) {
        puff = this.smokePool.pop()!;
      } else if (this.smokePuffs.length < this.maxSmoke) {
        puff = {
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          size: 0.12,
          maxSize: 0.42,
          rotation: 0,
          rotationSpeed: 0,
          opacity: 0.32,
          maxOpacity: 0.32,
          life: 0,
          maxLife: 0.55,
          colorR: 0.88,
          colorG: 0.92,
          colorB: 0.96,
        };
      } else {
        puff = this.popOldest(this.smokePuffs)!;
      }

      puff.position.set(
        pos.x + (Math.random() - 0.5) * 0.05,
        pos.y + (Math.random() - 0.5) * 0.03,
        pos.z + (Math.random() - 0.5) * 0.05
      );
      puff.velocity.set(
        rearDir.x * 0.35 + (Math.random() - 0.5) * 0.15,
        0.32 + Math.random() * 0.22,
        rearDir.z * 0.35 + (Math.random() - 0.5) * 0.15
      );
      puff.size = 0.12;
      puff.maxSize = 0.42 + Math.random() * 0.15;
      puff.rotation = Math.random() * Math.PI * 2;
      puff.rotationSpeed = (Math.random() - 0.5) * 1.2;
      puff.opacity = 0.32;
      puff.maxOpacity = 0.32;
      puff.life = 0;
      puff.maxLife = 0.55 + Math.random() * 0.25;
      puff.colorR = 0.88;
      puff.colorG = 0.92;
      puff.colorB = 0.96;

      this.smokePuffs.push(puff);
    } else if (mode === 'power') {
      let puff: SmokePuff;
      if (this.smokePool.length > 0) {
        puff = this.smokePool.pop()!;
      } else if (this.smokePuffs.length < this.maxSmoke) {
        puff = {
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          size: 0.15,
          maxSize: 0.62,
          rotation: 0,
          rotationSpeed: 0,
          opacity: 0.38,
          maxOpacity: 0.38,
          life: 0,
          maxLife: 0.28,
          colorR: 0.72,
          colorG: 0.75,
          colorB: 0.80,
        };
      } else {
        puff = this.popOldest(this.smokePuffs)!;
      }

      const speed = 4.8 + Math.random() * 3.5;
      puff.position.set(
        pos.x + (Math.random() - 0.5) * 0.04,
        pos.y + (Math.random() - 0.5) * 0.04,
        pos.z + (Math.random() - 0.5) * 0.04
      );
      puff.velocity.set(
        rearDir.x * speed + (Math.random() - 0.5) * 0.25,
        rearDir.y * speed + 0.12,
        rearDir.z * speed + (Math.random() - 0.5) * 0.25
      );
      puff.size = 0.15;
      puff.maxSize = 0.62 + Math.random() * 0.25;
      puff.rotation = Math.random() * Math.PI * 2;
      puff.rotationSpeed = (Math.random() - 0.5) * 3.0;
      puff.opacity = 0.38;
      puff.maxOpacity = 0.38;
      puff.life = 0;
      puff.maxLife = 0.28 + Math.random() * 0.15;
      puff.colorR = 0.72;
      puff.colorG = 0.75;
      puff.colorB = 0.80;

      this.smokePuffs.push(puff);
    } else if (mode === 'backfire') {
      // Hot turbulent dark unburnt fuel soot puffs
      for (let i = 0; i < 2; i++) {
        let puff: SmokePuff;
        if (this.smokePool.length > 0) {
          puff = this.smokePool.pop()!;
        } else if (this.smokePuffs.length < this.maxSmoke) {
          puff = {
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            size: 0.28,
            maxSize: 1.15,
            rotation: 0,
            rotationSpeed: 0,
            opacity: 0.88,
            maxOpacity: 0.88,
            life: 0,
            maxLife: 0.38,
            colorR: 0.14,
            colorG: 0.14,
            colorB: 0.16,
          };
        } else {
          puff = this.popOldest(this.smokePuffs)!;
        }

        puff.position.set(
          pos.x + (Math.random() - 0.5) * 0.08,
          pos.y + (Math.random() - 0.5) * 0.08,
          pos.z + (Math.random() - 0.5) * 0.08
        );
        puff.velocity.set(
          rearDir.x * (8.5 + Math.random() * 5.5) + (Math.random() - 0.5) * 0.8,
          0.45 + Math.random() * 0.45,
          rearDir.z * (8.5 + Math.random() * 5.5) + (Math.random() - 0.5) * 0.8
        );
        puff.size = 0.28;
        puff.maxSize = 1.15 + Math.random() * 0.4;
        puff.rotation = Math.random() * Math.PI * 2;
        puff.rotationSpeed = (Math.random() - 0.5) * 4.5;
        puff.opacity = 0.88;
        puff.maxOpacity = 0.88;
        puff.life = 0;
        puff.maxLife = 0.38 + Math.random() * 0.18;
        puff.colorR = 0.14;
        puff.colorG = 0.14;
        puff.colorB = 0.16;

        this.smokePuffs.push(puff);
      }

      // Burning liquid fuel droplet needle tracers
      for (let s = 0; s < 8; s++) {
        let spark: Spark;
        if (this.sparkPool.length > 0) {
          spark = this.sparkPool.pop()!;
        } else if (this.sparks.length < this.maxSparks) {
          spark = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, maxLife: 0 };
        } else {
          spark = this.popOldest(this.sparks)!;
        }

        const dropletSpeed = 16.0 + Math.random() * 18.0;
        spark.position.set(
          pos.x + (Math.random() - 0.5) * 0.05,
          pos.y + (Math.random() - 0.5) * 0.05,
          pos.z + (Math.random() - 0.5) * 0.05
        );
        spark.velocity.set(
          rearDir.x * dropletSpeed + (Math.random() - 0.5) * 2.2,
          0.4 + Math.random() * 1.5,
          rearDir.z * dropletSpeed + (Math.random() - 0.5) * 2.2
        );
        spark.life = 0;
        spark.maxLife = 0.16 + Math.random() * 0.14;

        this.sparks.push(spark);
      }
    }
  }

  /**
   * Emit progressive engine damage smoke from the hood
   */
  public emitEngineDamageSmoke(pos: THREE.Vector3, engineHealth: number): void {
    const isSevere = engineHealth < 35;
    const isCritical = engineHealth < 20;

    let r = 0.5;
    let g = 0.5;
    let b = 0.52;

    if (isCritical) {
      r = 0.08;
      g = 0.08;
      b = 0.09;
    } else if (isSevere) {
      r = 0.18;
      g = 0.18;
      b = 0.20;
    }

    let puff: SmokePuff;
    if (this.smokePool.length > 0) {
      puff = this.smokePool.pop()!;
    } else if (this.smokePuffs.length < this.maxSmoke) {
      puff = {
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        size: 0.6,
        maxSize: 2.4,
        rotation: 0,
        rotationSpeed: 0,
        opacity: 0.6,
        maxOpacity: 0.6,
        life: 0,
        maxLife: 1.3,
        colorR: r,
        colorG: g,
        colorB: b,
      };
    } else {
      puff = this.popOldest(this.smokePuffs)!;
    }

    puff.position.set(
      pos.x + (Math.random() - 0.5) * 0.4,
      0.25,
      pos.z + (Math.random() - 0.5) * 0.4
    );
    puff.velocity.set(
      (Math.random() - 0.5) * 0.6,
      1.5 + Math.random() * 1.2,
      (Math.random() - 0.5) * 0.6
    );
    puff.size = 0.6;
    puff.maxSize = isSevere ? 3.4 : 2.4;
    puff.rotation = Math.random() * Math.PI * 2;
    puff.rotationSpeed = (Math.random() - 0.5) * 2.2;
    puff.opacity = isSevere ? 0.9 : 0.6;
    puff.maxOpacity = isSevere ? 0.9 : 0.6;
    puff.life = 0;
    puff.maxLife = 1.3 + Math.random() * 0.7;
    puff.colorR = r;
    puff.colorG = g;
    puff.colorB = b;

    this.smokePuffs.push(puff);

    if (isCritical && Math.random() < 0.40) {
      let spark: Spark;
      if (this.sparkPool.length > 0) {
        spark = this.sparkPool.pop()!;
      } else if (this.sparks.length < this.maxSparks) {
        spark = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, maxLife: 0 };
      } else {
        spark = this.popOldest(this.sparks)!;
      }

      spark.position.set(
        pos.x + (Math.random() - 0.5) * 0.3,
        0.3,
        pos.z + (Math.random() - 0.5) * 0.3
      );
      spark.velocity.set(
        (Math.random() - 0.5) * 2.5,
        3.5 + Math.random() * 2.5,
        (Math.random() - 0.5) * 2.5
      );
      spark.life = 0;
      spark.maxLife = 0.4 + Math.random() * 0.3;

      this.sparks.push(spark);
    }
  }

  /**
   * Add continuous independent tire skidmarks on the road surface for all 4 wheels [FL, FR, RL, RR]
   */
  public addFourWheelSkidmarks(
    wheels: THREE.Vector3[],
    slips: number[],
    forwardDir: THREE.Vector3
  ): void {
    const roadY = 0.024;
    const perpX = -forwardDir.z;
    const perpZ = forwardDir.x;

    let minModifiedIndex = Infinity;
    let maxModifiedIndex = -1;

    for (let w = 0; w < 4; w++) {
      const wheelPos = wheels[w];
      const slip = slips[w] || 0;

      if (slip < 0.16) {
        this.lastWheelActive[w] = false;
        continue;
      }

      if (!this.lastWheelActive[w]) {
        this.lastWheelPositions[w].copy(wheelPos);
        this.lastWheelActive[w] = true;
        continue;
      }

      const lastPos = this.lastWheelPositions[w];

      const dist = wheelPos.distanceTo(lastPos);
      if (dist < 0.22) continue;

      // Tire half width (front 0.14m, rear 0.18m) with lateral squish deformation
      const baseWidth = w < 2 ? 0.13 : 0.17;
      const widthSquish = baseWidth * (1.0 + Math.min(0.35, slip * 0.4));

      const hx = perpX * widthSquish;
      const hz = perpZ * widthSquish;

      this._skidP1.set(lastPos.x - hx, roadY, lastPos.z - hz);
      this._skidP2.set(lastPos.x + hx, roadY, lastPos.z + hz);
      this._skidP3.set(wheelPos.x + hx, roadY, wheelPos.z + hz);
      this._skidP4.set(wheelPos.x - hx, roadY, wheelPos.z - hz);

      const baseIndex = (this.skidIndex % this.maxSkidPoints) * 6;
      if (baseIndex < minModifiedIndex) minModifiedIndex = baseIndex;
      if (baseIndex + 5 > maxModifiedIndex) maxModifiedIndex = baseIndex + 5;

      // High-density carbon deposit on heavy slip
      const alpha = Math.min(0.85, Math.max(0.12, (slip - 0.12) * 1.1));

      // Direct zero-allocation writes for 6 quad vertices (P1, P2, P3, P1, P3, P4)
      const p1 = this._skidP1, p2 = this._skidP2, p3 = this._skidP3, p4 = this._skidP4;
      const v0 = (baseIndex) * 3;
      this.skidPositions[v0] = p1.x; this.skidPositions[v0 + 1] = p1.y; this.skidPositions[v0 + 2] = p1.z;
      const v1 = (baseIndex + 1) * 3;
      this.skidPositions[v1] = p2.x; this.skidPositions[v1 + 1] = p2.y; this.skidPositions[v1 + 2] = p2.z;
      const v2 = (baseIndex + 2) * 3;
      this.skidPositions[v2] = p3.x; this.skidPositions[v2 + 1] = p3.y; this.skidPositions[v2 + 2] = p3.z;
      const v3 = (baseIndex + 3) * 3;
      this.skidPositions[v3] = p1.x; this.skidPositions[v3 + 1] = p1.y; this.skidPositions[v3 + 2] = p1.z;
      const v4 = (baseIndex + 4) * 3;
      this.skidPositions[v4] = p3.x; this.skidPositions[v4 + 1] = p3.y; this.skidPositions[v4 + 2] = p3.z;
      const v5 = (baseIndex + 5) * 3;
      this.skidPositions[v5] = p4.x; this.skidPositions[v5 + 1] = p4.y; this.skidPositions[v5 + 2] = p4.z;

      for (let i = 0; i < 6; i++) {
        const colIdx = (baseIndex + i) * 4;
        this.skidAlphas[colIdx] = 0.05;
        this.skidAlphas[colIdx + 1] = 0.05;
        this.skidAlphas[colIdx + 2] = 0.06;
        this.skidAlphas[colIdx + 3] = alpha;
      }

      this.skidIndex++;
      this.lastWheelPositions[w]!.copy(wheelPos);
    }

    // Only upload modified range across PCIe bus if new skid vertices were actually stamped
    if (maxModifiedIndex >= 0) {
      const posAttr = this.skidMesh.geometry.attributes.position as THREE.BufferAttribute;
      const colAttr = this.skidMesh.geometry.attributes.color as THREE.BufferAttribute;
      const vertCount = maxModifiedIndex - minModifiedIndex + 1;
      posAttr.clearUpdateRanges();
      posAttr.addUpdateRange(minModifiedIndex * 3, vertCount * 3);
      posAttr.needsUpdate = true;

      colAttr.clearUpdateRanges();
      colAttr.addUpdateRange(minModifiedIndex * 4, vertCount * 4);
      colAttr.needsUpdate = true;
    }
  }

  /**
   * Add continuous tire skidmarks on the road surface (2-wheel fallback)
   */
  public addSkidmark(leftWheel: THREE.Vector3, rightWheel: THREE.Vector3, intensity: number): void {
    if (!this.lastLeftWheelPos || !this.lastRightWheelPos) {
      this.lastLeftWheelPos = new THREE.Vector3().copy(leftWheel);
      this.lastRightWheelPos = new THREE.Vector3().copy(rightWheel);
      return;
    }

    const dist = leftWheel.distanceTo(this.lastLeftWheelPos);
    if (dist < 0.3) return;

    const tireHalfWidth = 0.16;
    const roadY = 0.024;

    this._skidP1.set(this.lastLeftWheelPos.x - tireHalfWidth, roadY, this.lastLeftWheelPos.z);
    this._skidP2.set(this.lastLeftWheelPos.x + tireHalfWidth, roadY, this.lastLeftWheelPos.z);
    this._skidP3.set(leftWheel.x + tireHalfWidth, roadY, leftWheel.z);
    this._skidP4.set(leftWheel.x - tireHalfWidth, roadY, leftWheel.z);

    const quadVerts = [this._skidP1, this._skidP2, this._skidP3, this._skidP1, this._skidP3, this._skidP4];
    const baseIndex = (this.skidIndex % this.maxSkidPoints) * 6;
    const alpha = Math.min(0.82, intensity * 0.85);

    for (let i = 0; i < 6; i++) {
      const v = quadVerts[i];
      const vertIdx = (baseIndex + i) * 3;
      this.skidPositions[vertIdx] = v.x;
      this.skidPositions[vertIdx + 1] = v.y;
      this.skidPositions[vertIdx + 2] = v.z;

      const colIdx = (baseIndex + i) * 4;
      this.skidAlphas[colIdx] = 0.05;
      this.skidAlphas[colIdx + 1] = 0.05;
      this.skidAlphas[colIdx + 2] = 0.06;
      this.skidAlphas[colIdx + 3] = alpha;
    }

    this.skidIndex++;
    const posAttr = this.skidMesh.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = this.skidMesh.geometry.attributes.color as THREE.BufferAttribute;
    posAttr.clearUpdateRanges();
    posAttr.addUpdateRange(baseIndex * 3, 18);
    posAttr.needsUpdate = true;

    colAttr.clearUpdateRanges();
    colAttr.addUpdateRange(baseIndex * 4, 24);
    colAttr.needsUpdate = true;

    this.lastLeftWheelPos.copy(leftWheel);
    this.lastRightWheelPos.copy(rightWheel);
  }

  public breakSkidmark(): void {
    this.lastLeftWheelPos = null;
    this.lastRightWheelPos = null;
    for (let i = 0; i < 4; i++) {
      this.lastWheelActive[i] = false;
    }
  }

  /**
   * Main Particle Simulation Frame Tick (High performance: zero splice, conditional buffer updates)
   * @param dt delta time in seconds
   * @param carPos optional vehicle position for aerodynamic slipstream wake computation
   * @param carForward optional vehicle forward vector
   * @param carVelocity optional vehicle velocity vector
   */
  public update(
    dt: number,
    carPos?: THREE.Vector3,
    carForward?: THREE.Vector3,
    carVelocity?: THREE.Vector3
  ): void {
    const hasCarAero = Boolean(carPos && carForward && carVelocity && carVelocity.lengthSq() > 4.0);
    const carSpeed = hasCarAero ? carVelocity!.length() : 0;
    const carRightX = hasCarAero ? -carForward!.z : 0;
    const carRightZ = hasCarAero ? carForward!.x : 0;

    // --- 1. Update Camera-Facing Velocity Ribbons & Slipstream Vortices ---
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.sparkPool.push(s);
        this.sparks[i] = this.sparks[this.sparks.length - 1];
        this.sparks.pop();
        continue;
      }

      // Module 3: Aerodynamic Slipstream & Wake Vortices Interaction
      if (hasCarAero) {
        const dx = s.position.x - carPos!.x;
        const dz = s.position.z - carPos!.z;
        const localZ = dx * carForward!.x + dz * carForward!.z; // along heading
        const localX = dx * carRightX + dz * carRightZ; // across width

        // If spark is in the car's aerodynamic envelope (near flanks or behind diffuser)
        if (localZ > -5.5 && localZ < 1.2 && Math.abs(localX) < 3.2) {
          const wakeFactor = Math.exp(-(localZ * localZ) / 10.0);
          
          // Inward Venturi suction towards vehicle centerline
          const suction = -Math.sign(localX) * carSpeed * 2.4 * wakeFactor * dt;
          s.velocity.x += carRightX * suction;
          s.velocity.z += carRightZ * suction;

          // Forward wake drag entrainment
          const wakeDrag = carSpeed * 0.36 * wakeFactor * dt;
          s.velocity.x += carForward!.x * wakeDrag;
          s.velocity.z += carForward!.z * wakeDrag;

          // Diffuser / Wing Upwash vortex swirl
          s.velocity.y += carSpeed * 0.12 * wakeFactor * dt;
        }
      }

      // Ballistic gravity & air drag
      s.velocity.y -= 14.5 * dt;
      s.velocity.x *= Math.max(0, 1.0 - 0.35 * dt);
      s.velocity.z *= Math.max(0, 1.0 - 0.35 * dt);
      s.position.addScaledVector(s.velocity, dt);

      // Bounce on tarmac with realistic friction and restitution
      if (s.position.y < 0.03) {
        s.position.y = 0.03;
        s.velocity.y *= -0.42;
        s.velocity.x *= 0.74;
        s.velocity.z *= 0.74;

        // Ground contact scorch probability
        if (Math.random() < 0.08 && Math.abs(s.velocity.y) > 0.8) {
          this.addScorchMark(s.position.x, s.position.z, 0.14);
        }
      }
    }

    // Upload Instanced Spark Attributes to GPU (Only if there are active sparks or previous ones to clear)
    const activeSparks = this.sparks.length;
    if (activeSparks > 0 || this.prevActiveSparks > 0) {
      const updateLimit = Math.max(activeSparks, this.prevActiveSparks);
      for (let i = 0; i < updateLimit; i++) {
        const pIdx = i * 3;
        const lIdx = i * 2;

        if (i < activeSparks) {
          const s = this.sparks[i];
          this.sparkInstPos[pIdx] = s.position.x;
          this.sparkInstPos[pIdx + 1] = s.position.y;
          this.sparkInstPos[pIdx + 2] = s.position.z;

          this.sparkInstVel[pIdx] = s.velocity.x;
          this.sparkInstVel[pIdx + 1] = s.velocity.y;
          this.sparkInstVel[pIdx + 2] = s.velocity.z;

          this.sparkInstLife[lIdx] = s.life;
          this.sparkInstLife[lIdx + 1] = s.maxLife;
        } else {
          this.sparkInstPos[pIdx] = 0;
          this.sparkInstPos[pIdx + 1] = -99999;
          this.sparkInstPos[pIdx + 2] = 0;

          this.sparkInstVel[pIdx] = 0;
          this.sparkInstVel[pIdx + 1] = 0;
          this.sparkInstVel[pIdx + 2] = 0;

          this.sparkInstLife[lIdx] = 1.0;
          this.sparkInstLife[lIdx + 1] = 0.0;
        }
      }
      const posAttr = this.sparkInstGeo.getAttribute('aInstancePos') as THREE.InstancedBufferAttribute;
      const velAttr = this.sparkInstGeo.getAttribute('aInstanceVel') as THREE.InstancedBufferAttribute;
      const lifeAttr = this.sparkInstGeo.getAttribute('aInstanceLife') as THREE.InstancedBufferAttribute;

      posAttr.clearUpdateRanges();
      posAttr.addUpdateRange(0, updateLimit * 3);
      posAttr.needsUpdate = true;

      velAttr.clearUpdateRanges();
      velAttr.addUpdateRange(0, updateLimit * 3);
      velAttr.needsUpdate = true;

      lifeAttr.clearUpdateRanges();
      lifeAttr.addUpdateRange(0, updateLimit * 2);
      lifeAttr.needsUpdate = true;
    }
    this.prevActiveSparks = activeSparks;

    // --- 2. Update 3D Carbon Fiber Shards ---
    for (let i = this.debrisList.length - 1; i >= 0; i--) {
      const d = this.debrisList[i];
      d.life += dt;
      if (d.life >= d.maxLife) {
        this.debrisPool.push(d);
        this.debrisList[i] = this.debrisList[this.debrisList.length - 1];
        this.debrisList.pop();
        continue;
      }

      // Aerodynamic wake entrainment on carbon shards
      if (hasCarAero) {
        const dx = d.position.x - carPos!.x;
        const dz = d.position.z - carPos!.z;
        const localZ = dx * carForward!.x + dz * carForward!.z;
        if (localZ > -4.5 && localZ < 0.5) {
          const wakeFactor = Math.exp(-(localZ * localZ) / 8.0);
          d.velocity.x += carForward!.x * carSpeed * 0.22 * wakeFactor * dt;
          d.velocity.z += carForward!.z * carSpeed * 0.22 * wakeFactor * dt;
        }
      }

      d.velocity.y -= 13.5 * dt;
      d.position.addScaledVector(d.velocity, dt);

      d.rotation.x += d.angVel.x * dt;
      d.rotation.y += d.angVel.y * dt;
      d.rotation.z += d.angVel.z * dt;

      if (d.position.y < 0.02) {
        d.position.y = 0.02;
        d.velocity.y *= -0.32;
        d.velocity.x *= 0.68;
        d.velocity.z *= 0.68;
        d.angVel.multiplyScalar(0.72);
      }
    }

    if (this.debrisList.length > 0 || this.prevActiveDebris > 0) {
      const maxActive = Math.max(this.debrisList.length, this.prevActiveDebris);
      for (let i = 0; i < maxActive; i++) {
        if (i < this.debrisList.length) {
          const d = this.debrisList[i];
          const fadeProgress = d.life / d.maxLife;
          const scale = Math.max(0.01, 1.0 - Math.pow(fadeProgress, 3) * 0.6);
          this._debrisScale.set(scale, scale, scale);

          this._debrisEuler.set(d.rotation.x, d.rotation.y, d.rotation.z);
          this._debrisQuat.setFromEuler(this._debrisEuler);

          this._debrisMatrix.compose(d.position, this._debrisQuat, this._debrisScale);
          this.debrisMesh.setMatrixAt(i, this._debrisMatrix);
        } else {
          this._debrisScale.set(0, 0, 0);
          this._debrisMatrix.makeScale(0, 0, 0);
          this._debrisMatrix.setPosition(0, -999, 0);
          this.debrisMesh.setMatrixAt(i, this._debrisMatrix);
        }
      }
      this.debrisMesh.count = this.debrisList.length;
      this.debrisMesh.instanceMatrix.needsUpdate = true;
    }
    this.prevActiveDebris = this.debrisList.length;

    // --- 3. Update Impact Point Light & Specular Ground Glow ---
    if (this.impactLight && this.impactLight.intensity > 0.01) {
      this.impactLight.intensity = Math.max(0, this.impactLight.intensity - dt * 32.0);
    }

    if (this.groundGlowIntensity > 0.01) {
      this.groundGlowIntensity = Math.max(0, this.groundGlowIntensity - dt * 2.8);
      this.groundGlowMesh.visible = true;
      this.groundGlowMesh.position.set(this.groundGlowPos.x, 0.012, this.groundGlowPos.z);
      this.groundGlowMaterial.opacity = Math.min(0.85, this.groundGlowIntensity * 0.85);
    } else {
      this.groundGlowMesh.visible = false;
    }

    // --- 4. Update Tarmac Scorch Marks (Smooth Alpha Fade-Out) ---
    for (let i = this.scorchList.length - 1; i >= 0; i--) {
      const sc = this.scorchList[i];
      sc.life += dt;
      if (sc.life >= sc.maxLife) {
        this.scorchPool.push(sc);
        this.scorchList[i] = this.scorchList[this.scorchList.length - 1];
        this.scorchList.pop();
      }
    }

    if (this.scorchList.length > 0 || this.prevActiveScorches > 0) {
      const maxActive = Math.max(this.scorchList.length, this.prevActiveScorches);
      for (let i = 0; i < maxActive; i++) {
        if (i < this.scorchList.length) {
          const sc = this.scorchList[i];
          const fade = Math.max(0, 1.0 - sc.life / sc.maxLife);
          const currentRadius = sc.radius * (0.9 + 0.1 * fade);

          this._scorchScale.set(currentRadius * 2, currentRadius * 2, 1);
          this._scorchEuler.set(-Math.PI / 2, 0, sc.rotation);
          this._scorchQuat.setFromEuler(this._scorchEuler);

          this._scorchPos.set(sc.x, 0.008, sc.z);
          this._scorchMatrix.compose(
            this._scorchPos,
            this._scorchQuat,
            this._scorchScale
          );
          this.scorchMesh.setMatrixAt(i, this._scorchMatrix);
        } else {
          this._scorchScale.set(0, 0, 0);
          this._scorchMatrix.makeScale(0, 0, 0);
          this._scorchMatrix.setPosition(0, -999, 0);
          this.scorchMesh.setMatrixAt(i, this._scorchMatrix);
        }
      }
      this.scorchMesh.count = this.scorchList.length;
      this.scorchMesh.instanceMatrix.needsUpdate = true;
    }
    this.prevActiveScorches = this.scorchList.length;

    // --- 5. Update Volumetric Smoke Puffs ---
    for (let i = this.smokePuffs.length - 1; i >= 0; i--) {
      const p = this.smokePuffs[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.smokePool.push(p);
        this.smokePuffs[i] = this.smokePuffs[this.smokePuffs.length - 1];
        this.smokePuffs.pop();
        continue;
      }

      p.velocity.x *= Math.max(0, 1.0 - 1.2 * dt);
      p.velocity.z *= Math.max(0, 1.0 - 1.2 * dt);
      p.position.addScaledVector(p.velocity, dt);
      p.rotation += p.rotationSpeed * dt;
    }

    if (this.smokePuffs.length > 0 || this.prevActiveSmoke > 0) {
      const maxActive = Math.max(this.smokePuffs.length, this.prevActiveSmoke);
      for (let i = 0; i < maxActive; i++) {
        const pIdx = i * 3;
        const cIdx = i * 4;

        if (i < this.smokePuffs.length) {
          const p = this.smokePuffs[i];
          this.smokePositions[pIdx] = p.position.x;
          this.smokePositions[pIdx + 1] = p.position.y;
          this.smokePositions[pIdx + 2] = p.position.z;

          const progress = p.life / p.maxLife;
          const alpha = p.maxOpacity * Math.sin(progress * Math.PI);

          this.smokeColors[cIdx] = p.colorR;
          this.smokeColors[cIdx + 1] = p.colorG;
          this.smokeColors[cIdx + 2] = p.colorB;
          this.smokeColors[cIdx + 3] = alpha;
        } else {
          this.smokePositions[pIdx] = 0;
          this.smokePositions[pIdx + 1] = -1000;
          this.smokePositions[pIdx + 2] = 0;
          this.smokeColors[cIdx + 3] = 0;
        }
      }

      const posAttr = this.smokePoints.geometry.attributes.position as THREE.BufferAttribute;
      const colAttr = this.smokePoints.geometry.attributes.color as THREE.BufferAttribute;

      posAttr.clearUpdateRanges();
      posAttr.addUpdateRange(0, maxActive * 3);
      posAttr.needsUpdate = true;

      colAttr.clearUpdateRanges();
      colAttr.addUpdateRange(0, maxActive * 4);
      colAttr.needsUpdate = true;
    }
    this.prevActiveSmoke = this.smokePuffs.length;
  }

  /**
   * Initialize dynamic aerodynamic wingtip condensation vortex ribbon mesh
   */
  private initWingtipVortices(): void {
    const segments = 24; // 24 segments per wingtip
    const totalQuads = segments * 2;
    const totalVerts = totalQuads * 6;

    this.vortexPositions = new Float32Array(totalVerts * 3);
    this.vortexColors = new Float32Array(totalVerts * 4);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.vortexPositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.vortexColors, 4));

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.vortexRibbonMesh = new THREE.Mesh(geo, mat);
    this.vortexRibbonMesh.frustumCulled = false;
    this.vortexRibbonMesh.visible = false;
    this.group.add(this.vortexRibbonMesh);

    for (let i = 0; i < 24; i++) {
      this.leftVortexHistory.push(new THREE.Vector3(0, -1000, 0));
      this.rightVortexHistory.push(new THREE.Vector3(0, -1000, 0));
    }
  }

  /**
   * Update aerodynamic wingtip condensation vortex ribbons trailing from rear wingtips
   * @param leftTip World position of left rear wingtip
   * @param rightTip World position of right rear wingtip
   * @param _rearDir Normalized rearward heading direction
   * @param speedKmh Vehicle speed in km/h
   */
  public updateWingtipVortices(
    leftTip: THREE.Vector3,
    rightTip: THREE.Vector3,
    _rearDir: THREE.Vector3,
    speedKmh: number,
    dt: number = 0.016
  ): void {
    if (speedKmh <= 115) {
      if (this.vortexRibbonMesh.visible) {
        this.vortexRibbonMesh.visible = false;
      }
      return;
    }

    this.vortexRibbonMesh.visible = true;
    this.vortexTime += dt;
    const intensity = Math.min(1.0, (speedKmh - 115) / 135);

    // Shift ring history
    for (let i = this.leftVortexHistory.length - 1; i > 0; i--) {
      this.leftVortexHistory[i].copy(this.leftVortexHistory[i - 1]);
      this.rightVortexHistory[i].copy(this.rightVortexHistory[i - 1]);
    }

    this.leftVortexHistory[0].copy(leftTip);
    this.rightVortexHistory[0].copy(rightTip);

    const halfRibbonW = 0.024; // 24mm razor-sharp aerodynamic filament
    let vertOffset = 0;

    const buildSideRibbon = (history: THREE.Vector3[], isRight: boolean) => {
      const segCount = history.length - 1;
      for (let s = 0; s < segCount; s++) {
        const p1 = history[s];
        const p2 = history[s + 1];

        if (p1.y < -500 || p2.y < -500) {
          for (let k = 0; k < 6; k++) {
            const vIdx = (vertOffset + k) * 3;
            const cIdx = (vertOffset + k) * 4;
            this.vortexPositions[vIdx] = 0;
            this.vortexPositions[vIdx + 1] = -1000;
            this.vortexPositions[vIdx + 2] = 0;
            this.vortexColors[cIdx + 3] = 0;
          }
          vertOffset += 6;
          continue;
        }

        const t = s / segCount;
        const fade = Math.pow(1.0 - t, 1.8) * intensity * 0.55;

        // Slight vortex spiral swirl
        const swirlAngle = this.vortexTime * 15.0 + s * 0.45 * (isRight ? 1 : -1);
        const swirlY = Math.sin(swirlAngle) * 0.015;
        const swirlX = Math.cos(swirlAngle) * 0.015;

        const p1L_x = p1.x - halfRibbonW + swirlX, p1L_y = p1.y + swirlY, p1L_z = p1.z;
        const p1R_x = p1.x + halfRibbonW + swirlX, p1R_y = p1.y + swirlY, p1R_z = p1.z;
        const p2L_x = p2.x - halfRibbonW, p2L_y = p2.y, p2L_z = p2.z;
        const p2R_x = p2.x + halfRibbonW, p2R_y = p2.y, p2R_z = p2.z;

        // Direct zero-allocation writes for the 6 quad vertices
        const v0 = vertOffset * 3;
        this.vortexPositions[v0] = p1L_x; this.vortexPositions[v0 + 1] = p1L_y; this.vortexPositions[v0 + 2] = p1L_z;
        const v1 = (vertOffset + 1) * 3;
        this.vortexPositions[v1] = p1R_x; this.vortexPositions[v1 + 1] = p1R_y; this.vortexPositions[v1 + 2] = p1R_z;
        const v2 = (vertOffset + 2) * 3;
        this.vortexPositions[v2] = p2R_x; this.vortexPositions[v2 + 1] = p2R_y; this.vortexPositions[v2 + 2] = p2R_z;
        const v3 = (vertOffset + 3) * 3;
        this.vortexPositions[v3] = p1L_x; this.vortexPositions[v3 + 1] = p1L_y; this.vortexPositions[v3 + 2] = p1L_z;
        const v4 = (vertOffset + 4) * 3;
        this.vortexPositions[v4] = p2R_x; this.vortexPositions[v4 + 1] = p2R_y; this.vortexPositions[v4 + 2] = p2R_z;
        const v5 = (vertOffset + 5) * 3;
        this.vortexPositions[v5] = p2L_x; this.vortexPositions[v5 + 1] = p2L_y; this.vortexPositions[v5 + 2] = p2L_z;

        for (let k = 0; k < 6; k++) {
          const cIdx = (vertOffset + k) * 4;
          // Luminous cyan-white aerodynamic condensation core
          this.vortexColors[cIdx] = 0.85;
          this.vortexColors[cIdx + 1] = 0.95;
          this.vortexColors[cIdx + 2] = 1.0;
          this.vortexColors[cIdx + 3] = fade;
        }

        vertOffset += 6;
      }
    };

    buildSideRibbon(this.leftVortexHistory, false);
    buildSideRibbon(this.rightVortexHistory, true);

    this.vortexRibbonMesh.geometry.attributes.position.needsUpdate = true;
    (this.vortexRibbonMesh.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * Complete GPU resource cleanup
   */
  public dispose(): void {
    if (this.smokeTexture) this.smokeTexture.dispose();
    if (this.groundGlowTexture) this.groundGlowTexture.dispose();
    if (this.scorchTexture) this.scorchTexture.dispose();

    if (this.sparkMesh) {
      this.sparkMesh.geometry.dispose();
      (this.sparkMesh.material as THREE.Material).dispose();
    }
    if (this.smokePoints) {
      this.smokePoints.geometry.dispose();
      (this.smokePoints.material as THREE.Material).dispose();
    }
    if (this.debrisMesh) {
      this.debrisMesh.geometry.dispose();
      (this.debrisMesh.material as THREE.Material).dispose();
    }
    if (this.groundGlowMesh) {
      this.groundGlowMesh.geometry.dispose();
      this.groundGlowMaterial.dispose();
    }
    if (this.scorchMesh) {
      this.scorchMesh.geometry.dispose();
      (this.scorchMesh.material as THREE.Material).dispose();
    }
    if (this.vortexRibbonMesh) {
      this.vortexRibbonMesh.geometry.dispose();
      (this.vortexRibbonMesh.material as THREE.Material).dispose();
    }
    if (this.skidMesh) {
      this.skidMesh.geometry.dispose();
      (this.skidMesh.material as THREE.Material).dispose();
    }
  }
}
