import * as THREE from 'three';
import QRCode from 'qrcode';
import './style.css';
import './diagnostics.css';
import type { DriveInput, SessionNotice } from './network/protocol';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<main class="layout"><section class="stage"><canvas id="game"></canvas><header class="topbar"><strong class="brand"><span class="brand-mark">K</span> くるくるグランプリ</strong><span class="connection"><i class="connection-dot"></i><span id="link-state">コントローラーを待っています</span></span></header><div class="hud"><div class="score"><span class="coin-icon">★</span><span><b id="medal-count">0</b><small> / 10 コイン</small></span></div><div class="route-wrap"><div class="distance-badge"><small>MARATHON CHALLENGE</small><b><i id="distance-km">0.00</i><span> / 42.195 KM</span></b></div><div class="route"><div class="route-car">🚗</div><div class="progress"><i id="progress"></i></div><div class="route-finish">🏁</div><div class="route-stars"><span>★</span><span>★</span><span>★</span></div><div class="route-labels"><span>10K</span><span>HALF</span><span>30K</span></div></div></div></div><aside class="connect"><div class="connect-heading"><span class="phone-icon">↗</span><div><h1>スマホをハンドルに</h1><p>カメラでQRを読み取ってね</p></div></div><canvas id="qr" width="176" height="176"></canvas><small id="qr-help">接続用QRコードを準備しています</small><button id="sound-toggle" class="sound-toggle">♪ サウンドを有効にする</button></aside><div class="finish hidden" id="finish"><div class="finish-stars">✦　★　✦</div><b>ゴール！</b><span>42.195 KM 完走！　コイン <em id="final-count">0</em> まい</span><button id="again">もういっかい！</button></div><aside class="host-debug hidden" id="host-debug"><b>入力診断</b><span>操舵 <i id="host-steering">0.00</i></span><span>受信後 <i id="host-age">—</i></span><span>ブレーキ <i id="host-brake">OFF</i> ・ クラクション <i id="host-horn">OFF</i></span></aside></section></main>`;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setClearColor('#8ad8ff');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#bcecff', 45, 150);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 250);
camera.position.set(0, 8, 13);
scene.add(new THREE.HemisphereLight(0xffffff, 0x608542, 2.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(-5, 15, 8); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 220), new THREE.MeshStandardMaterial({ color: 0x78d45d, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.z = -70; scene.add(ground);

// Soft hills frame the route and keep the horizon lively without crowding the road.
for (let i = 0; i < 14; i++) {
  const side = i % 2 ? 1 : -1;
  const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ color: [0x8cdb68, 0x6fca5e, 0xb5e77b][i % 3], roughness: 1 }));
  hill.scale.set(8 + (i % 3) * 3, 2.2 + (i % 2), 8);
  hill.position.set(side * (17 + (i % 2) * 7), 0.4, -i * 12 - 5); scene.add(hill);
}
// Puffy clouds and colorful roadside flags add scale and a race-day feel.
for (let i = 0; i < 12; i++) {
  const cloud = new THREE.Group();
  const x = i % 2 ? 1 : -1;
  for (const [dx, dy, scale] of [[0, 0, 1.35], [1, 0.15, 1], [-1, 0.1, 0.92], [0.3, 0.45, 0.85]] as const) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(scale, 12, 9), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
    puff.position.set(dx, dy, 0); cloud.add(puff);
  }
  cloud.position.set(x * (18 + (i % 3) * 8), 10 + (i % 2) * 3, -i * 16 - 8); scene.add(cloud);
}

const road = new THREE.Group(); scene.add(road);
for (let i = 0; i < 11; i++) {
  const z = 10 - i * 13;
  const bend = Math.sin(i * 0.62) * 5;
  const segment = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 14.2), new THREE.MeshStandardMaterial({ color: 0x737d88, roughness: 0.92 }));
  segment.position.set(bend, 0.02, z); segment.rotation.y = -Math.cos(i * 0.62) * 0.19; road.add(segment);
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 14.2), new THREE.MeshStandardMaterial({ color: 0xf6f5eb, roughness: 0.85 }));
    edge.position.set(bend + side * 3.94, 0.12, z); edge.rotation.y = segment.rotation.y; road.add(edge);
  }
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 5), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  line.position.set(bend, 0.1, z); line.rotation.y = segment.rotation.y; road.add(line);
  for (const side of [-1, 1]) {
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), new THREE.MeshStandardMaterial({ color: side < 0 ? 0xffd64d : 0xff8db1 }));
    flower.position.set(bend + side * (6 + Math.random() * 3), 0.35, z + Math.random() * 8); scene.add(flower);
    if (i % 2 === 0) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 1.6, 7), new THREE.MeshStandardMaterial({ color: 0x865338 }));
      trunk.position.set(bend + side * (9 + Math.random() * 4), 0.8, z); scene.add(trunk);
      const crownMaterial = new THREE.MeshStandardMaterial({ color: i % 4 === 0 ? 0x2ab85c : 0x38b84d, roughness: 1 });
      for (const [dx, dy, scale] of [[0, 2.1, 1.15], [-0.62, 1.85, 0.72], [0.58, 1.92, 0.76]] as const) {
        const crown = new THREE.Mesh(new THREE.SphereGeometry(scale, 10, 8), crownMaterial);
        crown.position.set(trunk.position.x + dx, dy, z); scene.add(crown);
      }
      if (i % 4 === 0) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.9, 6), new THREE.MeshStandardMaterial({ color: 0xf7f5e9 }));
        pole.position.set(bend + side * 6.3, 1.45, z - 2.5); scene.add(pole);
        const banner = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.56, 0.06), new THREE.MeshStandardMaterial({ color: [0xff5965, 0xffca3b, 0x42bde9][i % 3], roughness: 0.65 }));
        banner.position.set(pole.position.x + side * 0.43, 2.45, pole.position.z); banner.rotation.z = side * -0.08; scene.add(banner);
      }
    }
  }
}

const car = new THREE.Group(); scene.add(car); car.position.set(0, 0, 5);
const paint = new THREE.MeshStandardMaterial({ color: 0xf43f50, roughness: 0.3, metalness: 0.12 });
const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.62, 2.85), paint); body.position.y = 0.72; car.add(body);
const hood = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.2, 0.95), paint); hood.position.set(0, 1.08, -0.83); car.add(hood);
const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.72, 1.34), new THREE.MeshStandardMaterial({ color: 0x4a7590, roughness: 0.2, metalness: 0.08 })); cabin.position.set(0, 1.3, -0.12); car.add(cabin);
const roof = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1.05), paint); roof.position.set(0, 1.72, -0.13); car.add(roof);
const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.2, 0.18), new THREE.MeshStandardMaterial({ color: 0xfff3e7, roughness: 0.35 })); bumper.position.set(0, 0.48, -1.43); car.add(bumper);
for (const x of [-0.67, 0.67]) {
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffee81, emissive: 0xffbd36, emissiveIntensity: 0.65, roughness: 0.2 }));
  lamp.scale.set(1, 0.75, 0.35); lamp.position.set(x, 0.86, -1.43); car.add(lamp);
}
for (const x of [-1, 1]) { const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), paint); mirror.scale.set(1, 0.8, 0.75); mirror.position.set(x, 1.05, -0.3); car.add(mirror); }
const wheels: THREE.Mesh[] = [];
for (const x of [-0.95, 0.95]) for (const z of [-0.85, 0.9]) {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0x33363d }));
  wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.38, z); car.add(wheel); wheels.push(wheel);
}

const medals = Array.from({ length: 10 }, (_, i) => {
  const medal = new THREE.Group();
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 24), new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.5, roughness: 0.28, emissive: 0x6e3d00, emissiveIntensity: 0.15 }));
  coin.rotation.x = Math.PI / 2; medal.add(coin);
  const star = new THREE.Mesh(new THREE.IcosahedronGeometry(0.23, 0), new THREE.MeshStandardMaterial({ color: 0xfff3ad, emissive: 0xffbf14, emissiveIntensity: 0.3 })); medal.add(star);
  medal.position.set([0, -2.4, 2.6, -2.6, 2.6, -2.6, 2.4, -1.8, 1.5, 0][i]!, 1.5, -7 - i * 10.5); scene.add(medal); return medal;
});
const takenMedals = new Set<number>();

const gate = new THREE.Group(); scene.add(gate); gate.position.set(0, 0, -114);
const rainbowColors = [0xf04c61, 0xffa23e, 0xffd74a, 0x61ce78, 0x52b7ef, 0x9b75e8];
for (let band = 0; band < rainbowColors.length; band++) {
  const radius = 4.4 - band * 0.37;
  const points = Array.from({ length: 25 }, (_, i) => { const a = Math.PI * i / 24; return new THREE.Vector3(Math.cos(a) * radius, 0.25 + Math.sin(a) * radius, 0); });
  const arc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.2, 8, false), new THREE.MeshStandardMaterial({ color: rainbowColors[band], roughness: 0.32 })); gate.add(arc);
}
const sign = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.78, 0.45), new THREE.MeshStandardMaterial({ color: 0xfff0ad, roughness: 0.4 })); sign.position.set(0, 3.15, -0.12); gate.add(sign);
const goal = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.36, 0.5), new THREE.MeshStandardMaterial({ color: 0xf04d62, roughness: 0.4 })); goal.position.set(0, 3.18, -0.4); gate.add(goal);
for (const x of [-4.6, 4.6]) {
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.52, 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })); flag.position.set(x, 4.65, 0); flag.rotation.z = x < 0 ? 0.18 : -0.18; gate.add(flag);
}

const state = { steering: 0, brake: false, connected: false, started: false, complete: false, medals: 0, distance: 0, x: 0, seq: -1 };
const statusNode = document.querySelector('#link-state')!;
let socket: WebSocket | undefined;
let sessionToken = '';
let countdownTimer = 0;
let starting = false;
let audioContext: AudioContext | undefined;
let hornWasPressed = false;
let inputReceivedAt: number | undefined;
const debugEnabled = new URLSearchParams(location.search).get('debug') === '1';
if (debugEnabled) document.querySelector('#host-debug')!.classList.remove('hidden');

document.querySelector<HTMLButtonElement>('#sound-toggle')!.addEventListener('click', async event => {
  audioContext ??= new AudioContext();
  await audioContext.resume();
  (event.currentTarget as HTMLButtonElement).textContent = 'サウンド ON';
});

function playHorn() {
  if (!audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  for (const frequency of [360, 440]) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.065, now + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(now); oscillator.stop(now + 0.25);
  }
}

function queueStart() {
  window.clearInterval(countdownTimer);
  state.started = false;
  starting = true;
  state.brake = true;
  let seconds = 3;
  statusNode.textContent = `スタートまで ${seconds}`;
  countdownTimer = window.setInterval(() => {
    if (!state.connected) { window.clearInterval(countdownTimer); starting = false; return; }
    seconds--;
    if (seconds > 0) statusNode.textContent = `スタートまで ${seconds}`;
    else { window.clearInterval(countdownTimer); starting = false; state.brake = false; state.started = true; statusNode.textContent = 'いってみよう！'; }
  }, 1000);
}

async function connect() {
  const response = await fetch('/api/sessions', { method: 'POST' });
  if (!response.ok) throw new Error(`Session request failed: ${response.status}`);
  const { token } = await response.json() as { token: string };
  sessionToken = token;
  const defaultControllerOrigin = import.meta.env.DEV ? `${location.protocol}//${location.hostname}:5174` : location.origin;
  const controllerOrigin = import.meta.env.VITE_CONTROLLER_ORIGIN || defaultControllerOrigin;
  const usesSeparateControllerOrigin = Boolean(import.meta.env.VITE_CONTROLLER_ORIGIN) || import.meta.env.DEV;
  const controllerPath = usesSeparateControllerOrigin ? '/' : '/controller/';
  const controllerUrl = new URL(controllerPath, controllerOrigin);
  controllerUrl.searchParams.set('host', location.host);
  controllerUrl.searchParams.set('token', token);
  await QRCode.toCanvas(document.querySelector<HTMLCanvasElement>('#qr')!, controllerUrl.toString(), { width: 196, margin: 1, color: { dark: '#21323b', light: '#ffffff' } });
  const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${wsProtocol}//${location.host}/ws?role=host&token=${encodeURIComponent(token)}`);
  socket.addEventListener('open', () => { statusNode.textContent = 'QRコードを読み取って接続'; });
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)) as DriveInput | SessionNotice;
    if (message.type === 'status') {
      state.connected = message.connected;
      statusNode.textContent = message.connected ? 'スマホ接続中！' : 'コントローラーを待っています';
      if (!message.connected) { state.steering = 0; state.brake = true; state.started = false; hornWasPressed = false; }
      else queueStart();
      return;
    }
    if (message.type === 'input' && message.seq > state.seq) {
      state.seq = message.seq; state.steering = message.steering; state.brake = message.brake;
      inputReceivedAt = message.receivedAt;
      if (message.horn && !hornWasPressed) playHorn();
      hornWasPressed = message.horn;
    }
  });
  socket.addEventListener('close', () => { state.connected = false; state.steering = 0; state.brake = true; state.started = false; statusNode.textContent = '通信が切れました'; });
  document.querySelector('#qr-help')!.textContent = `iPhone用 URL: ${controllerUrl.origin}`;
  void sessionToken;
}
void connect().catch(error => { statusNode.textContent = '接続準備に失敗しました'; console.error(error); });

document.querySelector<HTMLButtonElement>('#again')!.addEventListener('click', () => {
  state.complete = false; state.started = state.connected; state.distance = 0; state.medals = 0; state.x = 0;
  takenMedals.clear();
  for (const medal of medals) medal.visible = true;
  document.querySelector('#finish')!.classList.add('hidden');
  document.querySelector('#medal-count')!.textContent = '0';
});

const clock = new THREE.Clock();
function resize() {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.started && !state.complete) {
    const speed = state.brake ? 0.8 : 3;
    state.distance += speed * dt;
    car.position.z = 5 - state.distance;
    state.x += state.steering * 3.2 * dt;
    state.x = THREE.MathUtils.clamp(state.x, -3.2, 3.2);
    car.position.x = THREE.MathUtils.lerp(car.position.x, state.x, 0.12);
    car.rotation.z = THREE.MathUtils.lerp(car.rotation.z, -state.steering * 0.13, 0.1);
    wheels.forEach(wheel => { wheel.rotation.x += speed * dt; });
    for (const [index, medal] of medals.entries()) {
      medal.rotation.y += dt * 1.5; medal.position.y = 1.5 + Math.sin(clock.elapsedTime * 2 + medal.position.z) * 0.16;
      if (!takenMedals.has(index) && medal.position.distanceTo(car.position.clone().setY(1.1)) < 1.25) {
        takenMedals.add(index); medal.visible = false; state.medals++;
        document.querySelector('#medal-count')!.textContent = String(state.medals);
      }
    }
    const progress = Math.min(state.distance / 120, 1);
    document.querySelector<HTMLElement>('#progress')!.style.width = `${progress * 100}%`;
    document.querySelector<HTMLElement>('#distance-km')!.textContent = (progress * 42.195).toFixed(2);
    if (progress >= 1) {
      state.complete = true; state.started = false;
      document.querySelector('#final-count')!.textContent = String(state.medals);
      document.querySelector('#finish')!.classList.remove('hidden');
    }
  }
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, car.position.x * 0.35, 0.04);
  camera.position.z = car.position.z + 13;
  camera.lookAt(car.position.x * 0.3, 1.1, car.position.z - 12);
  renderer.render(scene, camera);
}
tick();
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); statusNode.textContent = '画面を復旧しています…'; });
canvas.addEventListener('webglcontextrestored', () => { statusNode.textContent = state.connected ? 'スマホ接続中！' : 'コントローラーを待っています'; });
window.setInterval(() => {
  if (!debugEnabled) return;
  document.querySelector('#host-steering')!.textContent = state.steering.toFixed(2);
  document.querySelector('#host-age')!.textContent = inputReceivedAt === undefined ? '—' : `${Math.max(0, Date.now() - inputReceivedAt)} ms`;
  document.querySelector('#host-brake')!.textContent = state.brake ? 'ON' : 'OFF';
  document.querySelector('#host-horn')!.textContent = hornWasPressed ? 'ON' : 'OFF';
}, 100);

window.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') event.preventDefault();
  if (event.key === 'ArrowLeft') state.steering = -1;
  if (event.key === 'ArrowRight') state.steering = 1;
  if (event.key === ' ') state.brake = true;
  if (!state.started && !starting && !state.complete) { state.connected = true; queueStart(); }
});
window.addEventListener('keyup', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') state.steering = 0;
  if (event.key === ' ') state.brake = false;
});
