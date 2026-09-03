import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * The living room as real 3D, rendered on its own canvas layered over the
 * Phaser game while the project panel is open.
 *
 * This replaces a set of pre-rendered sprites. Sprites could never do what the
 * owner actually needs - the camera is baked into every frame, so there is no
 * way to move around the room. Everything below exists to make the camera
 * movable while keeping the rest of the game untouched.
 *
 * Three.js rather than a second game engine: it shares the page and the same
 * JavaScript heap as Phaser, so object positions can go straight into the
 * existing save file with no interop bridge, and the whole room is a 127KB GLB
 * exported from the same Blender scene that produced the old sprites.
 */

/**
 * One purchasable piece of the room.
 *
 * The room is bought a PIECE at a time rather than a stage at a time, so this
 * is the join between three things that used to live apart: the Blender object
 * name, the price the player pays, and the stage that has to be unlocked
 * before the piece can be bought at all.
 */
export interface RoomPiece {
  /** Blender object name. Every other table joins on this. */
  key: string;
  label: string;
  /** Build stage that has to be unlocked before this can be bought. */
  stage: number;
  /** Price in credits. */
  price: number;
  /**
   * Piece this one physically sits on, if any.
   *
   * A HARD ordering constraint, not a note: the cushions sit at y=0.47 on the
   * sofa and the chair, the books at y=0.76 in the bookcase, the TV at y=0.66
   * on its cabinet, the small plant at y=0.64 on the side table. Buy any of
   * them before its support and it hangs in mid-air - which is exactly how
   * four unassigned cushions used to float in an empty room. Nothing here may
   * ever sit in an earlier stage than what holds it up.
   */
  restsOn?: string;
}

/**
 * The living room, priced.
 *
 * Prices are RELATIVE TO THE OBJECT - a sofa is nearly ten times a cushion,
 * the television is the most expensive thing in the room - rather than a stage
 * total split evenly, which charged the same for a cushion as for a sofa. The
 * stage totals that fall out (2,150 / 3,200 / 4,050, plus the 300 the surfaces
 * stage still costs) escalate, and the room's whole 9,700 credit sink is
 * unchanged from when stages were bought whole.
 */
export const ROOM_PIECES: RoomPiece[] = [
  { key: 'S2_Sofa', label: 'Sofa', stage: 2, price: 1_400 },
  { key: 'S2_Table', label: 'Coffee table', stage: 2, price: 400 },
  { key: 'S2_Rug', label: 'Rug', stage: 2, price: 350 },

  { key: 'S4_TVUnit', label: 'TV cabinet', stage: 3, price: 900 },
  { key: 'S3_Bookcase', label: 'Bookcase', stage: 3, price: 850 },
  { key: 'S4_Chair', label: 'Lounge chair', stage: 3, price: 800 },
  { key: 'S3_Lamp', label: 'Floor lamp', stage: 3, price: 450 },
  { key: 'S4_Books', label: 'Books', stage: 3, price: 200, restsOn: 'S3_Bookcase' },

  { key: 'S4_TV', label: 'Television', stage: 4, price: 1_800, restsOn: 'S4_TVUnit' },
  { key: 'S3_Ceiling', label: 'Sculpture', stage: 4, price: 1_000 },
  { key: 'S4_Plant', label: 'Potted plant', stage: 4, price: 500 },
  { key: 'S4_Side', label: 'Side table', stage: 4, price: 450 },
  { key: 'S4_PlantSmall', label: 'Small plant', stage: 4, price: 150, restsOn: 'S4_Side' },
  { key: 'S4_Pillow', label: 'Cushions', stage: 4, price: 150, restsOn: 'S2_Sofa' }
];

const PIECE_OF: Record<string, RoomPiece> = Object.fromEntries(
  ROOM_PIECES.map((piece) => [piece.key, piece])
);

/** Pieces a stage sells, in the order the panel lists them. */
export function roomPiecesForStage(stage: number): RoomPiece[] {
  return ROOM_PIECES.filter((piece) => piece.stage === stage);
}

/**
 * Camera scopes, innermost first.
 *
 * Deliberately a LIST rather than three hardcoded zoom levels, because the
 * world is meant to keep widening - room, then house, then street with an
 * outdoor environment, then multiple buildings. Each reveal appends an entry
 * here instead of rewriting the camera.
 *
 * `frame` is how much of the subject's bounding sphere to fit, and `walls`
 * decides what stands between the camera and what you are looking at.
 */
export interface RoomScope {
  key: string;
  label: string;
  frame: number;
  /** 'cutaway' drops the near walls and roof; 'solid' shows the building whole. */
  walls: 'cutaway' | 'solid';
}

export const ROOM_SCOPES: RoomScope[] = [
  // The old 'close' scope was dropped - it framed tighter than the room reads
  // well at. ROOM is now the innermost view, and each step out is the next
  // reveal on the ladder in docs/PROGRESSION_REVEALS.md.
  { key: 'room', label: 'ROOM', frame: 1.0, walls: 'cutaway' },
  // Cutaway too: at house scope you are still looking INTO the home, just from
  // further back. Walls only close up at street scope, where the building
  // should read as a solid object among others.
  { key: 'house', label: 'HOUSE', frame: 1.7, walls: 'cutaway' },
  { key: 'street', label: 'STREET', frame: 3.4, walls: 'solid' }
];

export interface RoomView3DOptions {
  /** Where the canvas sits, in CSS pixels, matching the panel's art area. */
  rect: { x: number; y: number; width: number; height: number };
  /** Keys of the pieces the player has actually bought. */
  built: ReadonlySet<string>;
  onSelect?: (label: string | null) => void;
}

export class RoomView3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private key!: THREE.DirectionalLight;
  private fill!: THREE.DirectionalLight;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private root: THREE.Object3D | null = null;
  private pickable: THREE.Object3D[] = [];
  private frame = 0;
  /** In-flight flashes retain the true resting material state across re-taps. */
  private flashes = new Map<THREE.Mesh, {
    frame: number;
    original: Array<{ m: THREE.MeshStandardMaterial; colour: THREE.Color; intensity: number }>;
  }>();
  private disposed = false;
  private onSelect?: (label: string | null) => void;

  /** Orbit state. Kept here rather than using OrbitControls so the drag can be
   *  constrained - the room is a cutaway box and only reads from one side. */
  // Opens on the corner the room was modelled to be seen from - the two solid
  // walls behind, the open sides toward the camera. 0.25 put the camera behind
  // the house looking at its back.
  private azimuth = Math.PI * 0.75;
  // asin(0.31 / 0.6) - the board's own isometric elevation, so the 3D world
  // sits at the same angle as the 2D game it lives inside.
  private elevation = Math.asin(0.31 / 0.6);
  private distance = 40;
  /** Half the vertical world-units the frustum covers - the real zoom control. */
  private halfHeight = 5;
  private zoomAccum = 0;
  /** Key light offset from the camera's azimuth, in radians. */
  private lightAzOffset = 0.7;
  /** Key light height above the horizon, in radians. */
  private lightElevation = 0.85;
  /** Radius of the loaded model, used to size each scope's frame. */
  private radius = 5;
  private scopeIndex = 0;
  /** Walls between the camera and the interior, dropped when looking inside. */
  private nearWalls: THREE.Object3D[] = [];
  private roof: THREE.Object3D[] = [];
  private target = new THREE.Vector3(0, 0.9, 0);
  private dragging = false;
  private moved = 0;
  private lastX = 0;
  private lastY = 0;

  constructor(private canvas: HTMLCanvasElement, private options: RoomView3DOptions) {
    this.onSelect = options.onSelect;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Three.js ships with shadows OFF, so every object was floating on the
    // floor with nothing grounding it. Soft PCF because hard shadow edges fight
    // the flat, minimal look.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // Orthographic, not perspective: this is what makes it read as true
    // isometric rather than a 3D room seen from above, and it matches the
    // board's own projection.
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);

    // Same fixed key-plus-fill the Blender renders used, so the room reads the
    // way it did as sprites rather than arriving with different lighting.
    // The key follows the camera instead of sitting at a fixed world position.
    // A static light means one side of the building is always in shadow, and
    // orbiting to it leaves you looking at an unlit face - fine for a single
    // baked render, wrong once the camera moves.
    this.key = new THREE.DirectionalLight(0xfff4e6, 2.4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0012;
    this.key.shadow.normalBias = 0.02;
    this.scene.add(this.key);
    this.scene.add(this.key.target);

    this.fill = new THREE.DirectionalLight(0xdfe8ef, 0.55);
    this.scene.add(this.fill);
    // Sky/ground ambient keeps the shadowed faces inside the palette instead
    // of crushing to black.
    this.scene.add(new THREE.HemisphereLight(0xd6e2ea, 0x3a3a36, 0.7));

    this.applyRect(options.rect);
    this.bindInput();
  }

  async load(url: string): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(url);
    if (this.disposed) return;
    this.root = gltf.scene;

    // Blender's origin is the room's far corner; centring on the floor keeps
    // the orbit pivot in the middle of the room rather than at one edge.
    const box = new THREE.Box3().setFromObject(this.root);
    const centre = box.getCenter(new THREE.Vector3());
    this.root.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z));
    this.scene.add(this.root);

    const size = box.getSize(new THREE.Vector3());
    this.radius = Math.max(size.x, size.z) * 0.5;
    // Far enough back that nothing clips; with an orthographic camera the
    // distance does not affect apparent size, only what stays inside the near
    // and far planes.
    this.distance = size.length() * 4;
    this.target.set(0, size.y * 0.34, 0);

    // An orthographic shadow camera has to be sized by hand; too small and
    // shadows are clipped, too large and they turn blocky.
    const span = Math.max(size.x, size.z) * 0.85;
    const cam = this.key.shadow.camera;
    cam.left = -span; cam.right = span;
    cam.top = span; cam.bottom = -span;
    cam.near = 0.5; cam.far = size.length() * 6;
    cam.updateProjectionMatrix();

    /**
     * Resolves which piece a mesh belongs to.
     *
     * An object with two materials exports as several glTF primitives, so a
     * sofa arrives as `S2_Sofa` AND `S2_Sofa_1`, sometimes under a group of the
     * same name. Matching the exact name alone left those extra parts
     * unclickable and label-less, which is why only some of a piece responded.
     */
    const ownerKey = (obj: THREE.Object3D): string | undefined => {
      for (let node: THREE.Object3D | null = obj; node; node = node.parent) {
        if (PIECE_OF[node.name] !== undefined) return node.name;
        // The separator is OPTIONAL because glTF names do not survive the
        // loader intact: three sanitizes them through
        // `PropertyBinding.sanitizeNodeName`, which DELETES `.` `[` `]` `:`
        // `/` rather than substituting them. Blender's duplicate suffix makes
        // the four cushions `S4_Pillow.001`..`.004`, which arrive as
        // `S4_Pillow001` - so a pattern that required the dot matched none of
        // them, they resolved to no piece, and never having a stage meant
        // never being hidden: four cushions floating in an empty room from
        // the first frame of a new game. Multi-primitive parts keep their
        // underscore (`S2_Sofa_1`), so both forms have to work.
        const stripped = node.name.replace(/[._]?\d+$/, '');
        if (PIECE_OF[stripped] !== undefined) return stripped;
      }
      return undefined;
    };

    this.root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      // Opt-in per mesh in three.js. Without both flags the shadow map renders
      // but nothing appears in it.
      obj.castShadow = true;
      obj.receiveShadow = true;
      const key = ownerKey(obj);
      const piece = key === undefined ? undefined : PIECE_OF[key];
      if (piece !== undefined && key !== undefined) {
        obj.visible = this.options.built.has(key);
        obj.userData.label = piece.label;
        obj.userData.pieceKey = key;
        // Meshes exported from one Blender scene SHARE material instances, so
        // flashing a sofa's emissive also lit every other piece using the same
        // upholstery. Each selectable piece gets its own copy; the walls can
        // keep sharing, since nothing ever highlights them.
        obj.material = Array.isArray(obj.material)
          ? obj.material.map((m) => m.clone())
          : obj.material.clone();
        this.pickable.push(obj);
      }
    });
    // Blender tagged every wall piece so the runtime knows which to drop.
    this.root.traverse((obj) => {
      const group = obj.userData?.wallGroup as string | undefined;
      if (group === 'near') this.nearWalls.push(obj);
      else if (group === 'roof') this.roof.push(obj);
    });

    this.setBuilt(this.options.built);
    this.setScope(this.scopeIndex);
  }

  /**
   * Shows only the pieces the player has actually bought.
   *
   * Per piece rather than per stage, because a stage is now furnished one
   * purchase at a time - a stage-3 room can hold a bookcase and no lamp.
   */
  setBuilt(built: ReadonlySet<string>): void {
    this.options.built = built;
    this.root?.traverse((obj) => {
      const key = (obj.userData?.pieceKey as string | undefined) ?? obj.name;
      if (PIECE_OF[key] !== undefined) obj.visible = built.has(key);
    });
    this.render();
  }

  /**
   * Discrete zoom. The player steps between composed views rather than
   * scrubbing a free zoom, which is what keeps every framing deliberate.
   */
  setScope(index: number): RoomScope {
    this.scopeIndex = THREE.MathUtils.clamp(index, 0, ROOM_SCOPES.length - 1);
    const scope = ROOM_SCOPES[this.scopeIndex];
    this.halfHeight = this.radius * scope.frame;

    // The rule is "hide what stands between the camera and the subject" - not
    // "hide the room's walls". It reads the same when a neighbouring building
    // blocks the street later.
    const cutaway = scope.walls === 'cutaway';
    for (const o of this.nearWalls) o.visible = !cutaway;
    for (const o of this.roof) o.visible = !cutaway;

    this.updateFrustum();
    this.render();
    return scope;
  }

  /**
   * Moves the key light and reports where it ended up.
   *
   * Exists so the light can be positioned BY EYE. The right angle here is a
   * look judgement that is much easier to find by dragging than to describe,
   * so the values get nudged live and then baked into the defaults above.
   */
  nudgeLight(dAzimuth: number, dElevation: number): { offset: number; elevation: number } {
    this.lightAzOffset += dAzimuth;
    this.lightElevation = THREE.MathUtils.clamp(this.lightElevation + dElevation, 0.12, 1.45);
    this.render();
    return {
      offset: Math.round(this.lightAzOffset * 100) / 100,
      elevation: Math.round(this.lightElevation * 100) / 100
    };
  }

  scope(): RoomScope { return ROOM_SCOPES[this.scopeIndex]; }
  zoomIn(): RoomScope { return this.setScope(this.scopeIndex - 1); }
  zoomOut(): RoomScope { return this.setScope(this.scopeIndex + 1); }

  applyRect(rect: RoomView3DOptions['rect']): void {
    this.options.rect = rect;
    const { x, y, width, height } = rect;
    Object.assign(this.canvas.style, {
      position: 'absolute', left: `${x}px`, top: `${y}px`,
      // Phaser sits above this canvas and forwards input, so it must never
      // capture events itself - the panel's buttons are up there.
      width: `${width}px`, height: `${height}px`, pointerEvents: 'none'
    });
    this.renderer.setSize(width, height, false);
    this.updateFrustum();
    this.render();
  }

  /**
   * An orthographic camera has no `aspect`; its frustum is set explicitly.
   * `halfHeight` comes from the current scope and the subject's size, so
   * zooming is a change of scope rather than a change of camera position.
   */
  private updateFrustum(): void {
    const { width, height } = this.options.rect;
    const aspect = width / Math.max(1, height);
    const h = this.halfHeight;
    this.camera.left = -h * aspect;
    this.camera.right = h * aspect;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }

  private bindInput(): void {
    const down = (e: PointerEvent) => {
      this.dragging = true; this.moved = 0;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.azimuth -= dx * 0.008;
      // Clamped: the room is a cutaway with two walls, so swinging under the
      // floor or over the top shows the missing sides.
      this.elevation = THREE.MathUtils.clamp(this.elevation - dy * 0.006, 0.15, 1.25);
      this.render();
    };
    const up = (e: PointerEvent) => {
      this.dragging = false;
      this.canvas.releasePointerCapture?.(e.pointerId);
      // A drag orbits; only a genuine tap selects.
      if (this.moved <= 6) this.pick(e);
    };
    this.canvas.addEventListener('pointerdown', down);
    this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distance = THREE.MathUtils.clamp(this.distance + e.deltaY * 0.01, 4, 24);
      this.render();
    }, { passive: false });
  }

  /**
   * Camera control driven from OUTSIDE.
   *
   * The 3D canvas sits under Phaser's so the room can fill the screen behind
   * the panel UI - which means Phaser receives every pointer event and this
   * canvas receives none. Phaser forwards them here instead of the canvas
   * listening for itself.
   */
  /**
   * Rotation only, and it settles on quarter turns.
   *
   * Elevation is fixed: an isometric game has one viewing angle, and letting it
   * drift is what makes a 3D scene stop reading as isometric. Drag spins the
   * building; releasing snaps to the nearest corner so no resting view is
   * halfway between two.
   */
  orbitBy(dx: number, _dy: number): void {
    this.azimuth -= dx * 0.008;
    this.render();
  }

  /** Settles onto the nearest quarter turn. */
  settleRotation(): void {
    const quarter = Math.PI / 2;
    // Offset by 45 degrees. Snapping to bare multiples of 90 lands the camera
    // FACE-ON to a wall; the isometric corner views - where two walls recede
    // symmetrically - sit at 45, 135, 225 and 315.
    const corner = Math.PI / 4;
    const to = Math.round((this.azimuth - corner) / quarter) * quarter + corner;
    const from = this.azimuth;
    if (Math.abs(to - from) < 0.001) return;
    const start = performance.now();
    const step = (): void => {
      if (this.disposed) return;
      const t = Math.min(1, (performance.now() - start) / 220);
      const e = 1 - Math.pow(1 - t, 3);
      this.azimuth = from + (to - from) * e;
      this.render();
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  }

  /** Accumulates wheel/pinch until it crosses a threshold, then steps a scope -
   *  so the input still feels continuous but every resting view is composed. */
  zoomBy(delta: number): RoomScope | null {
    this.zoomAccum += delta;
    if (Math.abs(this.zoomAccum) < 0.6) return null;
    const step = this.zoomAccum > 0 ? 1 : -1;
    this.zoomAccum = 0;
    const before = this.scopeIndex;
    const scope = this.setScope(this.scopeIndex + step);
    return this.scopeIndex === before ? null : scope;
  }

  /**
   * Pick from normalised device coordinates, -1..1 with +Y up.
   *
   * Takes NDC rather than pixels because the caller is Phaser, which works in
   * its own scene units - converting there avoids depending on DOM event
   * shapes, and `TouchEvent` has no clientX/clientY anyway.
   */
  pickAt(ndcX: number, ndcY: number): void {
    this.pointer.x = ndcX;
    this.pointer.y = ndcY;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickable.filter((o) => o.visible), false)[0];
    this.onSelect?.(hit ? (hit.object.userData.label as string) : null);
    if (hit) this.flashPiece(hit.object as THREE.Mesh);
  }

  private pick(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickable.filter((o) => o.visible), false)[0];
    this.onSelect?.(hit ? (hit.object.userData.label as string) : null);
    if (hit) this.flashPiece(hit.object as THREE.Mesh);
  }

  /** Treats every glTF primitive belonging to one authored object as one item. */
  private flashPiece(hit: THREE.Mesh): void {
    const pieceKey = hit.userData.pieceKey as string | undefined;
    const meshes = pieceKey
      ? this.pickable.filter((mesh) => mesh.userData.pieceKey === pieceKey) as THREE.Mesh[]
      : [hit];
    for (const mesh of meshes) this.flash(mesh);
  }

  /**
   * The tapped piece pulses, so a selection is felt and not just read off a
   * label. The sprite version faded the whole image; in 3D the equivalent is a
   * brief emissive lift, which reads on a lit object where an alpha fade would
   * just make it look broken.
   */
  private flash(mesh: THREE.Mesh): void {
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      .filter((m): m is THREE.MeshStandardMaterial => 'emissive' in m);
    if (mats.length === 0) return;

    // Cancel a flash already running on this mesh, or two taps fight over the
    // same emissive value and it never returns to rest.
    const running = this.flashes.get(mesh);
    if (running) {
      cancelAnimationFrame(running.frame);
      for (const { m, colour, intensity } of running.original) {
        m.emissive.copy(colour);
        m.emissiveIntensity = intensity;
      }
    }

    const original = mats.map((m) => ({ m, colour: m.emissive.clone(), intensity: m.emissiveIntensity }));
    const flashState = { frame: 0, original };
    this.flashes.set(mesh, flashState);
    const start = performance.now();
    const DURATION = 320;
    const step = (): void => {
      const t = Math.min(1, (performance.now() - start) / DURATION);
      // Up fast, down slow - the shape of a tap being acknowledged.
      const curve = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
      for (const { m, colour } of original) {
        m.emissive.copy(colour).lerp(new THREE.Color(0xdfe9f2), curve * 0.55);
        m.emissiveIntensity = 1;
      }
      this.render();
      if (t < 1) {
        flashState.frame = requestAnimationFrame(step);
      } else {
        for (const { m, colour, intensity } of original) {
          m.emissive.copy(colour);
          m.emissiveIntensity = intensity;
        }
        this.flashes.delete(mesh);
        this.render();
      }
    };
    step();
  }

  /** Rendered on demand rather than in a rAF loop: the room only changes when
   *  the player moves the camera, so an idle panel costs nothing. */
  render(): void {
    if (this.disposed) return;
    const cosE = Math.cos(this.elevation);
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * cosE * this.distance,
      this.target.y + Math.sin(this.elevation) * this.distance,
      this.target.z + Math.cos(this.azimuth) * cosE * this.distance
    );
    this.camera.lookAt(this.target);

    // Key follows the camera so the lit face is always the one being looked at.
    // The offset and height are tunable at runtime - see `nudgeLight` - because
    // the right values are a judgement call, not something to derive.
    const lightAz = this.azimuth + this.lightAzOffset;
    const d = this.distance;
    const ce = Math.cos(this.lightElevation);
    this.key.position.set(
      this.target.x + Math.sin(lightAz) * d * ce,
      this.target.y + Math.sin(this.lightElevation) * d,
      this.target.z + Math.cos(lightAz) * d * ce
    );
    this.key.target.position.copy(this.target);
    this.key.target.updateMatrixWorld();
    this.fill.position.set(
      this.target.x - Math.sin(lightAz) * d * 0.5,
      this.target.y + d * 0.3,
      this.target.z - Math.cos(lightAz) * d * 0.5
    );

    this.renderer.render(this.scene, this.camera);
    this.frame++;
  }

  dispose(): void {
    this.disposed = true;
    for (const flash of this.flashes.values()) cancelAnimationFrame(flash.frame);
    this.flashes.clear();
    this.renderer.dispose();
    this.root?.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    this.canvas.remove();
  }
}
