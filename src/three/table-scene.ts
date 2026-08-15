import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Card } from "../shared/cards";
import type { TableState } from "../server/table";
import { cardBackTexture, cardFaceTexture, feltTexture } from "./textures";

const CARD_W = 1.05;
const CARD_H = 1.47;
const CARD_T = 0.06;

interface CardObject {
  group: THREE.Group;
  face: Card | null;
  faceDown: boolean;
  key: string;
  slotKey: string;
  fromDeck: boolean;
}

interface SlotState {
  group: THREE.Group;
  objects: CardObject[];
}

export class BlackjackScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private timer: THREE.Timer;
  private raf = 0;
  private disposed = false;

  private felt: THREE.Mesh;
  private dealerSlot: SlotState;
  private playerSlots = new Map<string, SlotState[]>();
  private seatPositions = new Map<string, THREE.Vector3>();
  private nameSprites = new Map<string, THREE.Sprite>();
  private chipStacks = new Map<string, THREE.Group>();
  private turnRings = new Map<string, THREE.Mesh>();

  private cardGeom = new RoundedBoxGeometry(CARD_W, CARD_H, CARD_T, 4, 0.09);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 5.4, 7.2);
    this.camera.lookAt(0, 0, 0);

    this.timer = new THREE.Timer();

    this.buildLights();
    this.felt = this.buildTable();
    this.dealerSlot = this.createSlot(new THREE.Vector3(0, 0.02, -3.1), false);

    this.loop();
  }

  update(state: TableState, playerId: string): void {
    const deckPos = new THREE.Vector3(0, 0.6, -4.4);
    this.reconcile(this.dealerSlot, state.dealer.cards.map((c) => ({ face: c, faceDown: false })), deckPos);

    const seatKeys = state.players.map((p) => p.id);
    this.reconcileSeats(state, seatKeys);

    for (const [seatId, slotList] of this.playerSlots) {
      const player = state.players.find((p) => p.id === seatId);
      if (!player) continue;
      const seatPos = this.seatPositions.get(seatId);
      if (!seatPos) continue;
      this.renderChips(seatId, player.bet, seatPos);
    }

    this.updateTurnRings(state);
    this.updateNames(state, playerId);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.cardGeom.dispose();
  }

  private loop(): void {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(() => this.loop());
    this.timer.update();
    const dt = this.timer.getDelta();
    this.animateDeal(dt);
    this.pulseTurnRings(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private buildLights(): void {
    const ambient = new THREE.AmbientLight("#fff6e0", 0.7);
    this.scene.add(ambient);

    const key = new THREE.SpotLight("#fff2d8", 2.4, 40, Math.PI / 5, 0.6, 1.2);
    key.position.set(0, 9, 2);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    this.scene.add(key);
    this.scene.add(key.target);

    const fill = new THREE.PointLight("#7fb6ff", 0.5, 30);
    fill.position.set(-6, 4, -4);
    this.scene.add(fill);
  }

  private buildTable(): THREE.Mesh {
    const group = new THREE.Group();

    const felt = new THREE.Mesh(
      new THREE.CircleGeometry(4.6, 64),
      new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.85, metalness: 0.05 }),
    );
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    group.add(felt);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(4.6, 0.16, 16, 80),
      new THREE.MeshStandardMaterial({ color: "#b8892f", roughness: 0.35, metalness: 0.85 }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.02;
    group.add(rim);

    const innerLine = new THREE.Mesh(
      new THREE.RingGeometry(3.15, 3.22, 80),
      new THREE.MeshBasicMaterial({
        color: "#e8c46a",
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    innerLine.rotation.x = -Math.PI / 2;
    innerLine.position.y = 0.012;
    group.add(innerLine);

    const marker = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 32),
      new THREE.MeshBasicMaterial({ color: "#e8c46a", transparent: true, opacity: 0.12 }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(0, 0.014, -3.1);
    group.add(marker);

    this.scene.add(group);
    return felt;
  }

  private createSlot(position: THREE.Vector3, asPlayer: boolean): SlotState {
    const group = new THREE.Group();
    group.position.copy(position);
    this.scene.add(group);
    return { group, objects: [] };
  }

  private reconcileSeats(state: TableState, seatKeys: string[]): void {
    const playerIds = new Set(seatKeys);
    for (const [seatId] of this.playerSlots) {
      if (!playerIds.has(seatId)) this.removeSeat(seatId);
    }
    for (const p of state.players) {
      if (this.playerSlots.has(p.id)) continue;
      this.addSeat(p.id);
    }
    const deckPos = new THREE.Vector3(0, 0.6, -4.4);
    for (const p of state.players) {
      const slots = this.playerSlots.get(p.id)!;
      const seatPos = this.seatPositions.get(p.id)!;
      for (let h = 0; h < p.hands.length; h++) {
        const slot = slots[h] ?? this.createSlot(seatPos.clone(), true);
        const hand = p.hands[h]!;
        const desired = hand.hiddenCount !== undefined
          ? Array.from({ length: hand.hiddenCount }, () => ({ face: null, faceDown: true }))
          : hand.cards.map((c) => ({ face: c, faceDown: false }));
        this.reconcile(slot, desired, deckPos);
      }
      if (p.hands.length === 0 && slots.length > 0) {
        this.reconcile(slots[0]!, [], deckPos);
      }
    }
  }

  private addSeat(id: string): void {
    const index = this.playerSlots.size;
    const angle = 0.18 + index * 0.32;
    const x = -1.55 + index * 0.62;
    const pos = new THREE.Vector3(x, 0.02, 2.35 - angle);
    this.seatPositions.set(id, pos.clone());
    this.playerSlots.set(id, [this.createSlot(pos, true)]);

    const name = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    name.scale.set(1.5, 0.34, 1);
    name.position.set(pos.x, 0.42, pos.z + 0.55);
    this.scene.add(name);
    this.nameSprites.set(id, name);

    const chips = new THREE.Group();
    chips.position.set(pos.x, 0.03, pos.z - 0.95);
    this.scene.add(chips);
    this.chipStacks.set(id, chips);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.0, 48),
      new THREE.MeshBasicMaterial({
        color: "#ffd166",
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.018, pos.z);
    this.scene.add(ring);
    this.turnRings.set(id, ring);
  }

  private removeSeat(id: string): void {
    const slots = this.playerSlots.get(id);
    if (slots) {
      for (const slot of slots) this.clearSlot(slot);
      this.playerSlots.delete(id);
    }
    this.seatPositions.delete(id);
    const name = this.nameSprites.get(id);
    if (name) {
      this.scene.remove(name);
      name.material.map?.dispose();
      name.material.dispose();
      this.nameSprites.delete(id);
    }
    const chips = this.chipStacks.get(id);
    if (chips) {
      this.scene.remove(chips);
      this.chipStacks.delete(id);
    }
    const ring = this.turnRings.get(id);
    if (ring) {
      this.scene.remove(ring);
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      this.turnRings.delete(id);
    }
  }

  private clearSlot(slot: SlotState): void {
    for (const obj of slot.objects) {
      this.scene.remove(obj.group);
      obj.group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => this.disposeMaterial(m));
          else this.disposeMaterial(mesh.material);
        }
        if (mesh.geometry) mesh.geometry.dispose();
      });
    }
    slot.objects = [];
  }

  private disposeMaterial(material: THREE.Material): void {
    const m = material as THREE.MeshStandardMaterial;
    m.map?.dispose();
    material.dispose();
  }

  private reconcile(
    slot: SlotState,
    desired: { face: Card | null; faceDown: boolean }[],
    deckPos: THREE.Vector3,
  ): void {
    const existing = slot.objects;
    const maxLen = Math.max(existing.length, desired.length);
    const next: CardObject[] = [];
    const spread = (desired.length - 1) * 0.42;
    for (let i = 0; i < maxLen; i++) {
      const want = desired[i];
      let obj = existing[i];
      if (want) {
        const key = want.face ? `${want.face.rank}-${want.face.suit}` : `down-${i}`;
        if (obj && obj.key === key && obj.faceDown === want.faceDown) {
          next.push(obj);
        } else {
          if (obj) this.destroyCard(obj);
          obj = this.createCard(want.face, want.faceDown, deckPos);
          const target = this.cardTarget(i, spread, slot.group.position);
          obj.fromDeck = true;
          obj.group.position.copy(deckPos);
          obj.group.rotation.set(-Math.PI / 2, 0, 0);
          this.moveTo(obj, target, 0.45);
          next.push(obj);
        }
      } else {
        if (obj) this.destroyCard(obj);
      }
    }
    slot.objects = next;
    for (const obj of slot.objects) {
      const target = this.cardTarget(slot.objects.indexOf(obj), spread, slot.group.position);
      if (!obj.fromDeck) this.moveTo(obj, target, 0.28);
    }
  }

  private cardTarget(index: number, spread: number, seat: THREE.Vector3): THREE.Vector3 {
    const x = seat.x - spread / 2 + index * 0.42;
    return new THREE.Vector3(x, 0.06, seat.z);
  }

  private createCard(face: Card | null, faceDown: boolean, at: THREE.Vector3): CardObject {
    const group = new THREE.Group();
    group.position.copy(at);
    const materials = this.cardMaterials(face, faceDown);
    const mesh = new THREE.Mesh(this.cardGeom, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W + 0.12, CARD_H + 0.12),
      new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.25 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.09;
    group.add(shadow);

    this.scene.add(group);
    return { group, face, faceDown, key: face ? `${face.rank}-${face.suit}` : "down", slotKey: "", fromDeck: false };
  }

  private cardMaterials(face: Card | null, faceDown: boolean): THREE.Material[] {
    const front = face
      ? new THREE.MeshStandardMaterial({
          map: cardFaceTexture(face),
          roughness: 0.35,
          metalness: 0.02,
        })
      : new THREE.MeshStandardMaterial({
          map: cardBackTexture(),
          roughness: 0.4,
          metalness: 0.02,
        });
    const back = faceDown
      ? new THREE.MeshStandardMaterial({
          map: cardBackTexture(),
          roughness: 0.4,
          metalness: 0.02,
        })
      : face
        ? new THREE.MeshStandardMaterial({ map: cardFaceTexture(face), roughness: 0.35, metalness: 0.02 })
        : front;
    const edge = new THREE.MeshStandardMaterial({ color: "#f3efe4", roughness: 0.5 });
    // RoundedBoxGeometry groups: +x, -x, +y, -y, +z, -z
    return [edge, edge, edge, edge, front, back];
  }

  private destroyCard(obj: CardObject): void {
    this.scene.remove(obj.group);
    obj.group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.material) {
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => this.disposeMaterial(m));
        else this.disposeMaterial(mesh.material);
      }
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }

  private moveTo(obj: CardObject, target: THREE.Vector3, duration: number): void {
    const start = obj.group.position.clone();
    const rotStart = obj.group.rotation.clone();
    const rotEnd = new THREE.Euler(-Math.PI / 2, 0, 0);
    const t = { start, rotStart, rotEnd, duration, elapsed: 0 };
    obj.group.userData.tween = t;
    void target;
  }

  private animateDeal(dt: number): void {
    const all = [this.dealerSlot, ...Array.from(this.playerSlots.values()).flat()];
    for (const slot of all) {
      for (const obj of slot.objects) {
        const tween = obj.group.userData.tween as
          | { start: THREE.Vector3; rotStart: THREE.Euler; rotEnd: THREE.Euler; duration: number; elapsed: number }
          | undefined;
        if (!tween) continue;
        tween.elapsed += dt;
        const p = Math.min(1, tween.elapsed / tween.duration);
        const e = 1 - Math.pow(1 - p, 3);
        const pos = this.cardTarget(
          slot.objects.indexOf(obj),
          (slot.objects.length - 1) * 0.42,
          slot.group.position,
        );
        obj.group.position.lerpVectors(tween.start, pos, e);
        obj.group.position.y += Math.sin(p * Math.PI) * 1.1;
        obj.group.rotation.x = tween.rotStart.x + (tween.rotEnd.x - tween.rotStart.x) * e;
        if (p >= 1) {
          obj.group.position.copy(pos);
          obj.group.rotation.copy(tween.rotEnd);
          obj.fromDeck = false;
          delete obj.group.userData.tween;
        }
      }
    }
  }

  private renderChips(seatId: string, bet: number, seatPos: THREE.Vector3): void {
    const group = this.chipStacks.get(seatId);
    if (!group) return;
    while (group.children.length) {
      const child = group.children[0] as THREE.Mesh;
      group.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    if (bet <= 0) return;
    const chips = Math.min(6, Math.max(1, Math.round(bet / 25)));
    const colors = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71"];
    for (let i = 0; i < chips; i++) {
      const chip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.06, 24),
        new THREE.MeshStandardMaterial({
          color: colors[i % colors.length]!,
          roughness: 0.4,
          metalness: 0.3,
        }),
      );
      chip.position.set(0, 0.03 + i * 0.06, 0);
      group.add(chip);
    }
  }

  private updateTurnRings(state: TableState): void {
    const activeId = state.phase === "acting" ? state.currentTurn : null;
    for (const [id, ring] of this.turnRings) {
      ring.userData.active = id === activeId;
    }
  }

  private pulseTurnRings(dt: number): void {
    const t = this.timer.getElapsed();
    for (const [, ring] of this.turnRings) {
      const mat = ring.material as THREE.MeshBasicMaterial;
      if (ring.userData.active) {
        const s = 1 + Math.sin(t * 4) * 0.06;
        ring.scale.set(s, s, 1);
        mat.opacity = 0.55 + Math.sin(t * 4) * 0.2;
      } else {
        mat.opacity = 0;
      }
    }
    void dt;
  }

  private updateNames(state: TableState, playerId: string): void {
    for (const p of state.players) {
      const sprite = this.nameSprites.get(p.id);
      if (!sprite) continue;
      const you = p.id === playerId ? " (you)" : "";
      const text = `${p.name}${you} \u00b7 ${p.bankroll}`;
      const tex = this.textSprite(text);
      const mat = sprite.material as THREE.SpriteMaterial;
      if (mat.map !== tex) {
        mat.map?.dispose();
        mat.map = tex;
        mat.needsUpdate = true;
      }
    }
  }

  private textSprite(text: string): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 512, 96);
    ctx.fillStyle = "rgba(10, 20, 16, 0.72)";
    roundedRect2(ctx, 12, 8, 488, 80, 22);
    ctx.fill();
    ctx.strokeStyle = "rgba(232, 196, 106, 0.5)";
    ctx.lineWidth = 3;
    roundedRect2(ctx, 12, 8, 488, 80, 22);
    ctx.stroke();
    ctx.fillStyle = "#f3ecd9";
    ctx.font = "bold 44px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 50);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}

function roundedRect2(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createBlackjackScene(canvas: HTMLCanvasElement): BlackjackScene {
  return new BlackjackScene(canvas);
}