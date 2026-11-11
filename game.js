import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// REINO INFINITO — prototipo procedural. Sin backend, datos ni texturas externas.
// Unidades del mundo: metros. Compatible con Quest Browser/WebXR y escritorio.
const canvas = document.querySelector('#world');
const intro = document.querySelector('#intro');
const hudCoords = document.querySelector('#coords');
const hudBiome = document.querySelector('#biome');
const hudChunks = document.querySelector('#chunks');
const loading = document.querySelector('#loading');
const errorBox = document.querySelector('#error');

window.addEventListener('error', e => { errorBox.hidden = false; errorBox.textContent = `Error: ${e.message}`; });
window.addEventListener('unhandledrejection', e => { errorBox.hidden = false; errorBox.textContent = `Error: ${e.reason?.message ?? e.reason}`; });

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = false; // Importante para Quest 2.
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb4d5db);
scene.fog = new THREE.FogExp2(0xb4d5db, 0.0045);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 340);
const player = new THREE.Group();
scene.add(player);
player.add(camera);
camera.position.y = 1.68;
const ambient = new THREE.HemisphereLight(0xe1eeff, 0x687044, 2.05);
scene.add(ambient);
const sunLight = new THREE.DirectionalLight(0xffe4ae, 2.25);
sunLight.position.set(-60, 105, -85);
scene.add(sunLight);
const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 10), new THREE.MeshBasicMaterial({color:0xffe1a3, fog:false}));
sunDisc.position.set(-220, 145, -280);
scene.add(sunDisc);

const settings = { CHUNK: 48, SEGMENTS: 24, RADIUS_DESKTOP: 3, RADIUS_VR: 2, WALK: 4.4, RUN: 7.5, SEED: 83921 };
const PI2 = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const fract = x => x - Math.floor(x);
function hash(a, b = 0, c = 0) { return fract(Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + settings.SEED) * 43758.5453123); }
function smooth(t) { return t * t * (3 - 2 * t); }
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  return lerp(lerp(hash(ix, iz), hash(ix + 1, iz), fx), lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), fx), fz) * 2 - 1;
}
function fbm(x, z, octaves = 4) {
  let sum = 0, amplitude = .5, frequency = 1, normalization = 0;
  for (let i = 0; i < octaves; i++) { sum += noise(x * frequency, z * frequency) * amplitude; normalization += amplitude; frequency *= 2.03; amplitude *= .5; }
  return sum / normalization;
}
function riverCenter(z) { return 82 + 22 * Math.sin(z * .009) + 15 * Math.sin(z * .0037 + .8); }
function riverDist(x, z) { return Math.abs(x - riverCenter(z)); }
function ground(x, z) {
  const hills = fbm(x * .006, z * .006, 5);
  const mountains = Math.pow(Math.max(0, fbm(x * .0029 + 40, z * .0029 - 25) + .19), 2) * 49;
  let y = 3.5 + hills * 9 + mountains + fbm(x * .028, z * .028, 3) * 1.65;
  const d = riverDist(x, z);
  // El cauce queda hundido y las orillas se conectan con el terreno existente.
  const factor = 1 - smooth(clamp((d - 5) / 18, 0, 1));
  y = lerp(y, -1.35 + Math.min(1, d / 5) * .4, factor);
  return y;
}
function biomeAt(x, z) {
  const y = ground(x,z);
  if (riverDist(x,z) < 9) return 'Río de las nieblas';
  if (y > 30) return 'Cumbres del norte';
  if (fbm(x * .016 + 2, z * .016) > .05) return 'Bosque ancestral';
  return 'Praderas olvidadas';
}

const materials = {
  grass: new THREE.MeshLambertMaterial({ color: 0x65945c, vertexColors: true }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x59422d }),
  pine: new THREE.MeshLambertMaterial({ color: 0x2b6545 }),
  pine2: new THREE.MeshLambertMaterial({ color: 0x3a7952 }),
  rock: new THREE.MeshLambertMaterial({ color: 0x898d83 }),
  stone: new THREE.MeshLambertMaterial({ color: 0x878b83, flatShading: true }),
  darkStone: new THREE.MeshLambertMaterial({ color: 0x666d65, flatShading: true }),
  water: new THREE.MeshPhongMaterial({ color: 0x3f9ba3, emissive: 0x0f3435, transparent: true, opacity: .82, shininess: 85, side: THREE.DoubleSide, depthWrite: false }),
  gold: new THREE.MeshStandardMaterial({ color: 0xcda768, metalness: .6, roughness: .32 }),
  steel: new THREE.MeshStandardMaterial({color: 0xcbd8df, metalness: .8, roughness: .22}),
  leather: new THREE.MeshStandardMaterial({color:0x39291e,roughness:.9}),
};
const trunkGeo = new THREE.CylinderGeometry(.19, .28, 1, 5);
const pineGeo = new THREE.ConeGeometry(1, 1, 6);
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const boxGeo = new THREE.BoxGeometry(1,1,1);
const tempObject = new THREE.Object3D();
const chunks = new Map();
const chunkQueue = [];
const color = new THREE.Color();
const sharedColor = new THREE.Color();

function terrainColor(y, x, z) {
  if (y < .5) color.setRGB(.53,.57,.42);
  else if (y > 39) color.setRGB(.78,.78,.72);
  else if (y > 25) color.setRGB(.48,.53,.45);
  else if (fbm(x*.02,z*.02) > .07) color.setRGB(.32,.49,.29);
  else color.setRGB(.45,.59,.32);
  const variation = .91 + hash(Math.floor(x / 3), Math.floor(z / 3)) * .17;
  return color.multiplyScalar(variation);
}
function meshInstanced(parent, geo, mat, transforms) {
  if (!transforms.length) return;
  const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  transforms.forEach((t,i) => {
    tempObject.position.set(t.x,t.y,t.z);
    tempObject.rotation.set(0,t.rot || 0,0);
    tempObject.scale.set(t.sx,t.sy,t.sz);
    tempObject.updateMatrix();
    mesh.setMatrixAt(i,tempObject.matrix);
  });
  mesh.computeBoundingSphere();
  parent.add(mesh);
}
function createRuin(group, x, z, worldX, worldZ) {
  const y = ground(worldX, worldZ);
  if (y < 2 || riverDist(worldX, worldZ) < 19 || y > 25) return;
  const ruin = new THREE.Group();
  ruin.position.set(x,y-.25,z);
  ruin.rotation.y = hash(worldX,worldZ) * PI2;
  group.add(ruin);
  function block(px,py,pz,sx,sy,sz,mat=materials.stone) {
    const m = new THREE.Mesh(boxGeo,mat);
    m.position.set(px,py,pz);m.scale.set(sx,sy,sz);ruin.add(m);
  }
  // Cuatro muros rotos, dos columnas, dintel y piedras caídas.
  block(-3,1,0,.9,2.2,6);
  block(3,.9,-1,.9,1.8,3);
  block(0,1,-3,6,.9,.75);
  block(-2.1,2.35,2.7,.8,4.7,.8);
  block(2.1,1.8,2.7,.8,3.6,.8);
  block(0,3.9,2.7,5,.6,.9,materials.darkStone);
  for(let i=0;i<7;i++){
    const a=hash(worldX,worldZ,i+6)*PI2, d=3+hash(worldZ,worldX,i+8)*3;
    block(Math.cos(a)*d,.25,Math.sin(a)*d,1.1,.5+.3*hash(i,x),.75);
  }
}
function buildChunk(cx, cz) {
  const k = `${cx},${cz}`;
  if(chunks.has(k)) return;
  const g = new THREE.Group();
  g.position.set(cx * settings.CHUNK, 0, cz * settings.CHUNK);
  const n = settings.SEGMENTS;
  const size = settings.CHUNK;
  const positions = new Float32Array((n+1)*(n+1)*3);
  const colors = new Float32Array(positions.length);
  const indices = [];
  for(let j=0;j<=n;j++) for(let i=0;i<=n;i++){
    const lx = i/n*size, lz = j/n*size, wx=cx*size+lx, wz=cz*size+lz;
    const y=ground(wx,wz), p=(j*(n+1)+i)*3;
    positions[p]=lx;positions[p+1]=y;positions[p+2]=lz;
    const c=terrainColor(y,wx,wz);
    colors[p]=c.r;colors[p+1]=c.g;colors[p+2]=c.b;
    if(i<n && j<n){const a=j*(n+1)+i,b=a+n+1;indices.push(a,b,a+1,b,b+1,a+1);}
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geo.setIndex(indices);geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo,materials.grass);
  terrain.frustumCulled = true;
  g.add(terrain);
  // Superficie continua de río generada por tramos, solo si cruza el chunk.
  const verts=[], waterIndices=[];
  const steps = 12;
  for(let j=0;j<=steps;j++){
    const wz=cz*size+j/steps*size, mid=riverCenter(wz)-cx*size;
    verts.push(mid-5.9,-.55,j/steps*size,mid+5.9,-.55,j/steps*size);
    if(j<steps){const a=j*2;waterIndices.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const riverCrosses = Array.from({length:7},(_,i)=>riverCenter(cz*size+size*i/6)).some(rx => rx >= cx*size-6 && rx <= (cx+1)*size+6);
  if(riverCrosses){
    const waterGeo=new THREE.BufferGeometry();
    waterGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
    waterGeo.setIndex(waterIndices);waterGeo.computeVertexNormals();
    g.add(new THREE.Mesh(waterGeo,materials.water));
  }
  // Bosques y piedras mediante InstancedMesh: pocos draw calls.
  const trunks=[], canopies=[], canopies2=[], rocks=[];
  const density = 38;
  for(let i=0;i<density;i++){
    const lx=3+hash(cx,cz,i*7+1)*(size-6),lz=3+hash(cx,cz,i*7+2)*(size-6);
    const wx=cx*size+lx,wz=cz*size+lz,y=ground(wx,wz);
    const forest=fbm(wx*.016+2,wz*.016);
    const nearRiver=riverDist(wx,wz)<14;
    const h=ground(wx+1,wz)-y, v=ground(wx,wz+1)-y;
    const slope=Math.hypot(h,v);
    if(i<30 && !nearRiver && y>2 && y<36 && slope<1.35 && forest>-.35){
      const height=3.4+hash(wx,wz,3)*5.3;
      const scale=.75+hash(wz,wx,4)*.7;
      const twist=hash(wx,wz,5)*PI2;
      trunks.push({x:lx,y:y+height*.25,z:lz,sx:scale,sy:height*.5,sz:scale,rot:twist});
      const item={x:lx,y:y+height*.77,z:lz,sx:height*.32,sy:height*.75,sz:height*.32,rot:twist};
      (hash(wx,wz,9)>.5?canopies:canopies2).push(item);
    } else if(i%3===0 && slope<2.3 && y>-1){
      const r=.4+hash(wx,wz,8)*1.2;
      rocks.push({x:lx,y:y+r*.3,z:lz,sx:r,sy:r*.6,sz:r*.85,rot:hash(wx,wz,6)*PI2});
    }
  }
  meshInstanced(g,trunkGeo,materials.trunk,trunks);
  meshInstanced(g,pineGeo,materials.pine,canopies);
  meshInstanced(g,pineGeo,materials.pine2,canopies2);
  meshInstanced(g,rockGeo,materials.rock,rocks);
  if(hash(cx,cz,81)>.87 && (Math.abs(cx)>1 || Math.abs(cz)>1)) createRuin(g,size*.5,size*.5,cx*size+size*.5,cz*size+size*.5);
  scene.add(g);
  chunks.set(k,g);
}
function disposeChunk(k) {
  const g=chunks.get(k);if(!g)return;
  g.traverse(obj=>{if(obj.isMesh && obj.geometry !== trunkGeo && obj.geometry !== pineGeo && obj.geometry !== rockGeo && obj.geometry !== boxGeo) obj.geometry.dispose();});
  scene.remove(g);chunks.delete(k);
}
function updateChunkQueue() {
  const cx=Math.floor(player.position.x/settings.CHUNK);
  const cz=Math.floor(player.position.z/settings.CHUNK);
  const radius=renderer.xr.isPresenting?settings.RADIUS_VR:settings.RADIUS_DESKTOP;
  const desired=new Set();const missing=[];
  for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
    if(dx*dx+dz*dz>(radius+.4)*(radius+.4))continue;
    const x=cx+dx,z=cz+dz,k=`${x},${z}`;
    desired.add(k);
    if(!chunks.has(k))missing.push({x,z,k,priority:dx*dx+dz*dz});
  }
  missing.sort((a,b)=>a.priority-b.priority);
  chunkQueue.length=0;chunkQueue.push(...missing);
  for(const k of chunks.keys())if(!desired.has(k))disposeChunk(k);
}

// Espada low-poly: empuñadura, guarda, hoja y punta. Sujetada por el controlador derecho.
function makeSword() {
  const sword=new THREE.Group();
  function part(geo,mat,x,y,z){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);sword.add(m);return m;}
  part(new THREE.CylinderGeometry(.037,.046,.29,8),materials.leather,0,.04,0);
  part(new THREE.SphereGeometry(.075,8,6),materials.gold,0,-.13,0);
  part(new THREE.BoxGeometry(.42,.06,.09),materials.gold,0,.20,0);
  part(new THREE.BoxGeometry(.09,.69,.037),materials.steel,0,.57,0);
  const tip=part(new THREE.ConeGeometry(.063,.23,4),materials.steel,0,1.02,0);
  tip.rotation.y=Math.PI/4;
  part(new THREE.BoxGeometry(.11,.055,.13),materials.gold,0,.24,0);
  return sword;
}
const grip0=renderer.xr.getControllerGrip(0);
const grip1=renderer.xr.getControllerGrip(1);
player.add(grip0,grip1);
const swordVR=makeSword();
swordVR.rotation.x=-Math.PI/2;
swordVR.position.set(0,-.035,-.08);
grip1.add(swordVR);
const swordDesktop=makeSword();
swordDesktop.position.set(.39,-.44,-.66);
swordDesktop.rotation.set(-.75,0,-.36);
swordDesktop.scale.setScalar(.67);
camera.add(swordDesktop);

const inputSources = new Map();
for(const [index,controller] of [renderer.xr.getController(0),renderer.xr.getController(1)].entries()){
  player.add(controller);
  controller.addEventListener('connected', e=>{
    inputSources.set(index,e.data);
    // Si el mando derecho es 0, pasa la espada a ese grip.
    if(e.data.handedness==='right') (index===0?grip0:grip1).add(swordVR);
  });
  controller.addEventListener('disconnected',()=>inputSources.delete(index));
}
const keys = new Set();
let desktopYaw=0, desktopPitch=0, lastSnap=0, elapsed=0;
const desktopDirection=new THREE.Vector3();
const forward=new THREE.Vector3();
const sideways=new THREE.Vector3();
const up=new THREE.Vector3(0,1,0);
const clock=new THREE.Clock();
let lastChunkX=NaN,lastChunkZ=NaN;
let introDismissed=false;

function dismissIntro(){introDismissed=true;intro.classList.add('hidden');document.querySelector('#loading').textContent='';}
document.querySelector('#explore').addEventListener('click',()=>{
  dismissIntro();if(!renderer.xr.isPresenting) canvas.requestPointerLock?.();
});
canvas.addEventListener('click',()=>{if(!renderer.xr.isPresenting && introDismissed)canvas.requestPointerLock?.();});
document.addEventListener('pointerlockchange',()=>document.body.classList.toggle('locked',document.pointerLockElement===canvas));
document.addEventListener('mousemove',e=>{
  if(document.pointerLockElement!==canvas || renderer.xr.isPresenting)return;
  desktopYaw-=e.movementX*.0022;
  desktopPitch=clamp(desktopPitch-e.movementY*.0022,-1.45,1.45);
  camera.rotation.set(desktopPitch,desktopYaw,0,'YXZ');
});
document.addEventListener('keydown',e=>{
  keys.add(e.code);
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>keys.clear());
function gamepadAxes(src){
  const a=src?.gamepad?.axes;if(!a?.length)return [0,0];
  const x=a.length>=4?a[2]:a[0], y=a.length>=4?a[3]:a[1];
  const deadzone=.18;
  return [Math.abs(x)>deadzone?x:0,Math.abs(y)>deadzone?y:0];
}
function updateMovement(dt){
  let mx=0,mz=0,speed=settings.WALK;
  if(renderer.xr.isPresenting){
    let left=null,right=null;
    for(const src of inputSources.values()){
      if(src.handedness==='left')left=src;
      if(src.handedness==='right')right=src;
    }
    left ||= inputSources.get(0);
    right ||= inputSources.get(1);
    [mx,mz]=gamepadAxes(left);
    const [turnX]=gamepadAxes(right);
    // Giro por saltos de 30 grados, cómodo en VR y compatible con Quest.
    if(Math.abs(turnX)>.72 && elapsed-lastSnap>.35){player.rotation.y-=Math.sign(turnX)*Math.PI/6;lastSnap=elapsed;}
    if(left?.gamepad?.buttons?.[1]?.pressed)speed=settings.RUN;
    // Movimiento dirigido por la mirada horizontal, sin influir la inclinación.
    renderer.xr.getCamera().getWorldDirection(forward);
    forward.y=0;
    if(forward.lengthSq()<.001)forward.set(0,0,-1);
    forward.normalize();
  } else {
    mx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    mz=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
    speed=(keys.has('ShiftLeft')||keys.has('ShiftRight'))?settings.RUN:settings.WALK;
    camera.getWorldDirection(forward);forward.y=0;forward.normalize();
  }
  sideways.crossVectors(forward,up).normalize();
  const total=Math.hypot(mx,mz);
  if(total>.05){
    mx/=Math.max(1,total);mz/=Math.max(1,total);
    // Eje y de los joysticks hacia abajo es positivo.
    player.position.addScaledVector(sideways,mx*speed*dt);
    player.position.addScaledVector(forward,-mz*speed*dt);
    if(!renderer.xr.isPresenting){swordDesktop.rotation.z=-.36+Math.sin(elapsed*9)*.045;}
  }
  const target=ground(player.position.x,player.position.z);
  player.position.y=lerp(player.position.y,target,Math.min(1,dt*11));
}

function resize(){
  const w=window.innerWidth,h=window.innerHeight;
  renderer.setSize(w,h);
  camera.aspect=w/h;camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);
renderer.xr.addEventListener('sessionstart',()=>{
  dismissIntro();document.exitPointerLock?.();document.body.classList.add('is-vr');
  swordDesktop.visible=false;
  // Altura real del casco: WebXR aporta la posición sobre local-floor.
  camera.position.set(0,0,0);camera.rotation.set(0,0,0);
  lastChunkX=NaN;updateChunkQueue();
});
renderer.xr.addEventListener('sessionend',()=>{
  document.body.classList.remove('is-vr');swordDesktop.visible=true;
  camera.position.set(0,1.68,0);camera.rotation.set(desktopPitch,desktopYaw,0,'YXZ');
  lastChunkX=NaN;updateChunkQueue();
});

player.position.set(0,ground(0,0),0);
updateChunkQueue();
// Preparamos el entorno inicial antes de revelar la pantalla de inicio.
for(let i=0;i<Math.min(9,chunkQueue.length);i++){
  const c=chunkQueue.shift();buildChunk(c.x,c.z);
}
loading.textContent='Mundo preparado. ¡Entra a explorar!';
const vrButton=VRButton.createButton(renderer,{optionalFeatures:['local-floor','bounded-floor']});
document.body.appendChild(vrButton);

renderer.setAnimationLoop(()=>{
  const dt=Math.min(clock.getDelta(),.05);
  elapsed+=dt;
  updateMovement(dt);
  const cx=Math.floor(player.position.x/settings.CHUNK),cz=Math.floor(player.position.z/settings.CHUNK);
  if(cx!==lastChunkX||cz!==lastChunkZ){lastChunkX=cx;lastChunkZ=cz;updateChunkQueue();}
  // Genera hasta dos sectores por frame para evitar bloqueos largos.
  for(let i=0;i<2 && chunkQueue.length;i++){
    const c=chunkQueue.shift();if(!chunks.has(c.k))buildChunk(c.x,c.z);
  }
  if(!renderer.xr.isPresenting){
    hudCoords.textContent=`X ${Math.round(player.position.x)}  ·  Z ${Math.round(player.position.z)}`;
    if(Math.floor(elapsed*2)!==Math.floor((elapsed-dt)*2)){
      hudBiome.textContent=`✧ ${biomeAt(player.position.x,player.position.z)}`;
      hudChunks.textContent=`${chunks.size} SECTORES · MUNDO PROCEDURAL`;
    }
  }
  renderer.render(scene,camera);
});
