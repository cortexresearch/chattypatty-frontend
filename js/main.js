// Configure backend URL (local or production)
const BACKEND_URL = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://api.pxpony.com';

const socket = io(BACKEND_URL);
const urlParams = new URLSearchParams(window.location.search);

const WORLD_SIZE = 1000000;
const spawnX = parseFloat(urlParams.get('x')) || Math.floor(Math.random() * WORLD_SIZE);
const spawnY = parseFloat(urlParams.get('y')) || Math.floor(Math.random() * WORLD_SIZE);

let currentPosition = { x: spawnX, y: spawnY };

const adjectives = [
    'Super', 'Funny', 'Wild', 'Happy', 'Lucky', 'Sunny', 'Clever', 'Swift', 'Brave', 'Wise', 'Kind', 'Bold', 'Calm', 'Cool', 'Mega', 'Hyper', 'Silly', 'Quiet', 'Loud', 'Fast',
    'Epic', 'Giant', 'Tiny', 'Shiny', 'Crazy', 'Fancy', 'Jolly', 'Merry', 'Magic', 'Glitzy', 'Spicy', 'Chilly', 'Stormy', 'Breezy', 'Dashing', 'Mighty', 'Noble', 'Grand', 'Elite', 'Primal',
    'Golden', 'Silver', 'Cosmic', 'Solar', 'Lunar', 'Mystic', 'Hidden', 'Ancient', 'Urban', 'Rural', 'Smooth', 'Sharp', 'Bright', 'Dim', 'Frosty', 'Toasty', 'Vivid', 'Silent', 'Vocal', 'Active'
];
const nouns = [
    'Panda', 'Tiger', 'Eagle', 'Dolphin', 'Fox', 'Wolf', 'Bear', 'Lion', 'Hawk', 'Deer', 'Elephant', 'Giraffe', 'Penguin', 'Koala', 'Rabbit', 'Owl', 'Shark', 'Whale', 'Cat', 'Dog',
    'Zebra', 'Monkey', 'Turtle', 'Snake', 'Lizard', 'Frog', 'Otter', 'Seal', 'Walrus', 'Hamster', 'Parrot', 'Falcon', 'Raven', 'Bat', 'Crab', 'Lobster', 'Shrimp', 'Octopus', 'Squid', 'Jellyfish',
    'Moose', 'Bison', 'Rhino', 'Hippo', 'Camel', 'Llama', 'Alpaca', 'Sheep', 'Goat', 'Horse', 'Donkey', 'Mule', 'Swine', 'Boar', 'Badger', 'Skunk', 'Raccoon', 'Beaver', 'Squirrel', 'Mole'
];

// Helper to get color name from HSL hue
function getColorName(hue) {
    if (hue < 15/360 || hue >= 345/360) return 'Red';
    if (hue < 45/360) return 'Orange';
    if (hue < 75/360) return 'Yellow';
    if (hue < 165/360) return 'Green';
    if (hue < 195/360) return 'Cyan';
    if (hue < 255/360) return 'Blue';
    if (hue < 315/360) return 'Purple';
    return 'Pink';
}

const randomHue = Math.random();
const playerColor = Phaser.Display.Color.HSLToColor(randomHue, 0.8, 0.5).color;
const colorName = getColorName(randomHue);
const randomDigits = Math.floor(Math.random() * 900) + 100; // 100-999
const username = `${adjectives[Math.floor(Math.random() * adjectives.length)]}${colorName}${nouns[Math.floor(Math.random() * nouns.length)]}${randomDigits}`;

const adContent = [
    { gif: 'assets/1.gif', url: 'https://groupgpt.tech' },
    { gif: 'assets/Pinly.gif', url: 'https://usepinly.com' },
    { gif: 'assets/3.gif', url: 'https://pxpony.com' },
    { gif: 'assets/4.gif', url: 'https://techieteam.club' }
];

const AD_DURATION = 12000; // Duration to play each ad (2 loops @ 6s each)

const LAT_MIN = -90, LAT_MAX = 90;
const LNG_MIN = -180, LNG_MAX = 180;

function latLngToGame(lat, lng) {
    const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * WORLD_SIZE;
    const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * WORLD_SIZE;
    return { x, y };
}

function gameToLatLng(x, y) {
    const lng = (x / WORLD_SIZE) * (LNG_MAX - LNG_MIN) + LNG_MIN;
    const lat = LAT_MAX - (y / WORLD_SIZE) * (LAT_MAX - LAT_MIN);
    return { lat, lng };
}

let worldViewMode = false;
let leafletMap = null;
let selfMarker = null;
let playerMarkers = new Map();
let mapBtn;

const config = {
    type: Phaser.AUTO,
    parent: "game-container",
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: "#000",
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: { create, update },
};

const game = new Phaser.Game(config);

let player, targetX, targetY, isMoving = false, uiText;
let otherPlayers = new Map();
let otherPlayerWorldPos = new Map();   // current rendered world pos (lerped)
let otherPlayerTargetPos = new Map();  // latest server-reported world pos
let chatBubbles = new Map();
let nameLabels = new Map();
let selfChatBubble = null;
let selfChatTimeout = null;
let lastActivity = Date.now();
let adIndex = 0;
let worldContainer;
let tileGrid = [];
let lastTileGridX = null;
let lastTileGridY = null;
let lastMoveEmit = 0;
let shareBtn, micBtn;
let cursors, wasd;

// WebRTC / voice chat
let localStream = null;
let voiceEnabled = false;
let peerConnections = new Map();
let audioElements = new Map();

const MOVEMENT_SPEED = 4;
const LERP_FACTOR = 0.2;
const PLAYER_RADIUS = 25;
const CHAT_BUBBLE_OFFSET = 60;
const IDLE_FADE_START = 30000;
const IDLE_FADE_COMPLETE = 600000;
const CHAT_DURATION = 5000;
const TILE_SIZE = 100;
const MOVE_EMIT_INTERVAL = 50;
const VOICE_RANGE = 600;
const WORLD_MODE_VOICE_RANGE = 100; // 100 yards/meters radius for local mode

function formatLargeNumber(num) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(num);
}

function createNameLabel(scene, text, x, y, color) {
    const label = scene.add.text(0, 0, text, {
        font: '14px Arial',
        fill: '#ffffff',
        padding: { x: 5, y: 2 },
    });
    label.setOrigin(0.5);
    label.setStroke('#000000', 4);

    const bg = scene.add.graphics();
    const width = label.width + 10;
    const height = label.height + 4;
    
    bg.fillStyle(color, 1);
    bg.lineStyle(3, 0x000000);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 4);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 4);

    const container = scene.add.container(x, y + PLAYER_RADIUS + 15, [bg, label]);
    container.setDepth(2);
    
    return container;
}

function createChatBubble(scene, text, x, y, startTime = Date.now()) {
    const label = scene.add.text(0, 0, text, {
        font: '14px Arial',
        color: '#000000',
        padding: { x: 10, y: 5 },
        wordWrap: { width: 200 },
        align: 'center'
    });
    label.setOrigin(0.5);

    const bg = scene.add.graphics();
    const width = label.width + 10;
    const height = label.height + 4;
    
    bg.fillStyle(0xffffff, 1);
    bg.lineStyle(3, 0x000000);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 4);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 4);

    const container = scene.add.container(x, y - CHAT_BUBBLE_OFFSET, [bg, label]);
    container.setDepth(3);
    container.startTime = startTime;
    container.text = text; // Expose text for map popups
    return container;
}

function updateSelfChat(scene, message) {
    if (selfChatBubble) selfChatBubble.destroy();
    if (selfChatTimeout) clearTimeout(selfChatTimeout);
    selfChatBubble = createChatBubble(scene, message, config.width / 2, config.height / 2);
    // Removed setTimeout to prevent 'snagging' conflict with the update() loop
}

function rotateAds() {
    const adImage = document.getElementById('ad-image');
    const adLink = document.getElementById('ad-link');
    if (!adImage || !adLink) return;

    adIndex = (adIndex + 1) % adContent.length;
    const ad = adContent[adIndex];
    
    // Add cache buster to force GIF restart
    adImage.src = `${ad.gif}?t=${Date.now()}`;
    adLink.href = ad.url;
}

function updatePlayerStatus(player, lastActivity) {
    const timeSinceActivity = Date.now() - lastActivity;
    if (timeSinceActivity > IDLE_FADE_COMPLETE) {
        window.location.reload();
    } else if (timeSinceActivity > IDLE_FADE_START) {
        const fadeProgress = (timeSinceActivity - IDLE_FADE_START) / (IDLE_FADE_COMPLETE - IDLE_FADE_START);
        player.setAlpha(1 - fadeProgress);
        if (nameLabels.has('self')) nameLabels.get('self').setAlpha(1 - fadeProgress);
    } else {
        player.setAlpha(1);
        if (nameLabels.has('self')) nameLabels.get('self').setAlpha(1);
    }
}

function createTiles(scene, centerX, centerY) {
    const tilesX = Math.ceil(config.width / TILE_SIZE) + 8;
    const tilesY = Math.ceil(config.height / TILE_SIZE) + 8;
    
    // Create pool if empty
    if (tileGrid.length === 0) {
        for (let i = 0; i < tilesX * tilesY; i++) {
            const tile = scene.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE, 0xffffff);
            tile.setOrigin(0, 0);
            worldContainer.add(tile);
            tileGrid.push(tile);
        }
    }

    const startX = Math.floor((centerX - (tilesX * TILE_SIZE) / 2) / TILE_SIZE) * TILE_SIZE;
    const startY = Math.floor((centerY - (tilesY * TILE_SIZE) / 2) / TILE_SIZE) * TILE_SIZE;

    if (startX === lastTileGridX && startY === lastTileGridY) return;
    lastTileGridX = startX;
    lastTileGridY = startY;

    let i = 0;
    for (let x = 0; x < tilesX; x++) {
        for (let y = 0; y < tilesY; y++) {
            if (i >= tileGrid.length) break;
            const worldX = startX + x * TILE_SIZE;
            const worldY = startY + y * TILE_SIZE;
            const tile = tileGrid[i];
            tile.x = worldX;
            tile.y = worldY;
            tile.fillColor = generateConsistentColor(worldX, worldY);
            i++;
        }
    }
}

// --- WebRTC helpers ---

function createPeerConnection(peerId) {
    if (peerConnections.has(peerId)) return peerConnections.get(peerId);

    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    });
    peerConnections.set(peerId, pc);

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('webrtc-ice-candidate', { target: peerId, candidate: e.candidate });
    };

    pc.ontrack = (e) => {
        let audio = audioElements.get(peerId);
        if (!audio) {
            audio = new Audio();
            audio.autoplay = true;
            audioElements.set(peerId, audio);
        }
        audio.srcObject = e.streams[0];
        audio.play().catch(() => {});
    };

    return pc;
}

async function initiateVoiceConnection(peerId) {
    try {
        const pc = createPeerConnection(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { target: peerId, offer: pc.localDescription });
    } catch (e) {
        console.error('Voice initiation error:', e);
    }
}

function closePeerConnection(peerId) {
    if (peerConnections.has(peerId)) {
        peerConnections.get(peerId).close();
        peerConnections.delete(peerId);
    }
    if (audioElements.has(peerId)) {
        audioElements.get(peerId).srcObject = null;
        audioElements.delete(peerId);
    }
}

async function toggleVoice() {
    if (!voiceEnabled) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            voiceEnabled = true;
            
            // Connect to all currently visible players
            for (const id of otherPlayers.keys()) {
                if (peerConnections.has(id)) {
                    // Add track to existing connection and renegotiate
                    const pc = peerConnections.get(id);
                    localStream.getTracks().forEach(track => { try { pc.addTrack(track, localStream); } catch(e) {} });
                    try {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        socket.emit('webrtc-offer', { target: id, offer: pc.localDescription });
                    } catch(e) {}
                } else {
                    await initiateVoiceConnection(id);
                }
            }
        } catch (e) {
            console.error('Microphone access denied:', e);
            voiceEnabled = false;
        }
    } else {
        voiceEnabled = false;
        if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
        peerConnections.forEach((_, id) => closePeerConnection(id));
    }
}

// --- Phaser lifecycle ---

function create() {
    worldContainer = this.add.container(0, 0);
    createTiles(this, this.scale.width / 2, this.scale.height / 2);

    player = this.add.circle(this.scale.width / 2, this.scale.height / 2, PLAYER_RADIUS, playerColor);
    player.setStrokeStyle(3, 0x000000);
    player.setDepth(1);

    const nameLabel = createNameLabel(this, username, this.scale.width / 2, this.scale.height / 2, playerColor);
    nameLabels.set('self', nameLabel);

    // Initialize first ad
    const initialAd = adContent[adIndex];
    document.getElementById('ad-image').src = initialAd.gif;
    document.getElementById('ad-link').href = initialAd.url;
    
    this.time.addEvent({ delay: AD_DURATION, callback: rotateAds, callbackScope: this, loop: true });

    // UI elements
    const shareBtn = document.getElementById('share-btn');
    const micBtn = document.getElementById('mic-btn');
    const mapBtn = document.getElementById('map-btn');

    // Share button logic
    shareBtn.addEventListener('click', () => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?x=${Math.round(currentPosition.x + 50)}&y=${Math.round(currentPosition.y + 50)}`;
        const shareText = `Join me in ${username}'s world at coordinates (${formatLargeNumber(currentPosition.x)}, ${formatLargeNumber(currentPosition.y)})!`;

        const overlay = document.createElement('div');
        overlay.className = 'share-overlay';

        const menu = document.createElement('div');
        menu.className = 'share-menu';
        menu.innerHTML = `
            <h3>Share Location</h3>
            <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}" target="_blank" class="twitter">Twitter / X</a>
            <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}" target="_blank" class="facebook">Facebook</a>
            <a href="https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent('Join PxPony Chat')}" target="_blank" class="linkedin">LinkedIn</a>
            <button class="copy-link">Copy Link</button>
        `;

        overlay.appendChild(menu);
        document.body.appendChild(overlay);

        const copyBtn = menu.querySelector('.copy-link');
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(shareUrl);
                const originalText = copyBtn.innerText;
                copyBtn.innerText = 'Copied!';
                copyBtn.style.backgroundColor = '#45a049';
                setTimeout(() => {
                    copyBtn.innerText = originalText;
                    copyBtn.style.backgroundColor = '#4CAF50';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy: ', err);
            }
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    });

    micBtn.addEventListener('click', () => {
        toggleVoice();
        // Update button text after a short delay to wait for toggleVoice
        setTimeout(() => {
            micBtn.innerText = voiceEnabled ? 'MIC ON' : 'MIC OFF';
            micBtn.style.backgroundColor = voiceEnabled ? '#a2f2a2' : '#cccccc';
        }, 100);
    });

    mapBtn.addEventListener('click', () => {
        worldViewMode = !worldViewMode;
        const mapContainer = document.getElementById('map-container');

        if (worldViewMode) {
            mapContainer.style.display = 'block';
            mapBtn.innerText = '👾';
            
            // Request GPS when entering World View
            requestLocation();

            const latLng = gameToLatLng(currentPosition.x, currentPosition.y);
            console.log('Centering map on:', latLng);

            if (!leafletMap) {
                leafletMap = L.map('map-container').setView([latLng.lat, latLng.lng], 18);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '© OpenStreetMap'
                }).addTo(leafletMap);
            } else {
                if (!isNaN(latLng.lat) && !isNaN(latLng.lng)) {
                    leafletMap.setView([latLng.lat, latLng.lng], 18);
                }
            }
            // Increase timeout and call multiple times to ensure resize happens after DOM update
            setTimeout(() => {
                if (leafletMap) {
                    leafletMap.invalidateSize();
                    console.log('Map size invalidated');
                }
            }, 200);
            updateMapMarkers();
        } else {
            mapContainer.style.display = 'none';
            mapBtn.innerText = '🌐';

            // Randomize position when returning to Pixel Mode
            currentPosition.x = Math.floor(Math.random() * WORLD_SIZE);
            currentPosition.y = Math.floor(Math.random() * WORLD_SIZE);
            
            // Reset world container position to keep coordinates manageable 
            // and force background to update to a new area
            worldContainer.x = 0;
            worldContainer.y = 0;
            lastTileGridX = null;
            lastTileGridY = null;

            // Clear geolocation watch immediately
            if (watchId) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
            }

            // Sync with server
            socket.emit('player-move', { x: currentPosition.x, y: currentPosition.y });

            // Update URL slug without refreshing
            const newUrl = `${window.location.pathname}?x=${Math.round(currentPosition.x)}&y=${Math.round(currentPosition.y)}`;
            window.history.replaceState({ x: currentPosition.x, y: currentPosition.y }, '', newUrl);
        }
    });

    // Chat input
    const chatInput = document.createElement('input');
    chatInput.id = 'chat-input';
    chatInput.style.position = 'fixed';
    chatInput.style.bottom = '20px';
    chatInput.style.left = '50%';
    chatInput.style.transform = 'translateX(-50%)';
    chatInput.style.width = 'calc(80% - 40px)';
    chatInput.style.maxWidth = '320px';
    chatInput.style.padding = '12px 20px';
    chatInput.style.borderRadius = '25px';
    chatInput.style.zIndex = '1000';
    chatInput.placeholder = 'Type to chat...';
    document.body.appendChild(chatInput);

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (chatInput.value.trim()) {
                lastActivity = Date.now();
                const message = chatInput.value.trim();
                socket.emit('chat-message', { message });
                updateSelfChat(this, message);
                chatInput.value = '';
                chatInput.blur(); // Hide keyboard on mobile
            } else {
                chatInput.blur();
            }
        }
    });

    // Ensure input focus doesn't trigger double movement
    chatInput.addEventListener('touchstart', (e) => {
        e.stopPropagation();
    });

    // Handle Resize
    this.scale.on('resize', (gameSize) => {
        const { width, height } = gameSize;
        player.setPosition(width / 2, height / 2);
        if (nameLabels.has('self')) {
            nameLabels.get('self').setPosition(width / 2, height / 2 + PLAYER_RADIUS + 15);
        }
        uiText.setPosition(10, 70);
    });

    // Movement
    this.input.on('pointerdown', (pointer) => {
        if (worldViewMode) return; // Lock movement in World Mode

        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;
        const dx = pointer.x - centerX;
        const dy = pointer.y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        lastActivity = Date.now();

        if (distance <= PLAYER_RADIUS) {
            isMoving = false;
            targetX = null;
            targetY = null;
        } else {
            targetX = currentPosition.x + dx;
            targetY = currentPosition.y + dy;
            isMoving = true;
        }
    });

    // --- Socket events ---
    socket.emit('player-join', { x: currentPosition.x, y: currentPosition.y, username, color: playerColor });

    socket.on('players-sync', (players) => {
        players.forEach(({ id, x, y, username, color, lastChat, lastChatTime }) => {
            if (id !== socket.id && !otherPlayers.has(id)) {
                const screenX = this.scale.width / 2 + (x - currentPosition.x);
                const screenY = this.scale.height / 2 + (y - currentPosition.y);
                const otherPlayer = this.add.circle(screenX, screenY, PLAYER_RADIUS, color);
                otherPlayer.setStrokeStyle(3, 0x000000);
                otherPlayer.setDepth(1);
                otherPlayers.set(id, otherPlayer);
                otherPlayerWorldPos.set(id, { x, y });
                otherPlayerTargetPos.set(id, { x, y });

                nameLabels.set(id, createNameLabel(this, username, screenX, screenY, color));

                if (lastChat && Date.now() - lastChatTime < CHAT_DURATION) {
                    const bubble = createChatBubble(this, lastChat, screenX, screenY, lastChatTime);
                    chatBubbles.set(id, { bubble, timestamp: lastChatTime });
                }
            }
        });
    });

    socket.on('player-joined', ({ id, x, y, username, color }) => {
        if (!otherPlayers.has(id)) {
            const screenX = this.scale.width / 2 + (x - currentPosition.x);
            const screenY = this.scale.height / 2 + (y - currentPosition.y);
            const otherPlayer = this.add.circle(screenX, screenY, PLAYER_RADIUS, color);
            otherPlayer.setStrokeStyle(3, 0x000000);
            otherPlayer.setDepth(1);
            otherPlayers.set(id, otherPlayer);
            otherPlayerWorldPos.set(id, { x, y });
            otherPlayerTargetPos.set(id, { x, y });

            nameLabels.set(id, createNameLabel(this, username, screenX, screenY, color));

            // Initiate voice if we have the mic on
            if (voiceEnabled) initiateVoiceConnection(id);
        }
    });

    // Update only the lerp target — actual position updated each frame
    socket.on('player-moved', ({ id, x, y }) => {
        if (otherPlayerTargetPos.has(id)) {
            otherPlayerTargetPos.set(id, { x, y });
        }
    });

    socket.on('chat-received', ({ id, message, timestamp }) => {
        if (otherPlayers.has(id)) {
            const otherPlayer = otherPlayers.get(id);
            if (chatBubbles.has(id)) chatBubbles.get(id).bubble.destroy();
            chatBubbles.set(id, {
                bubble: createChatBubble(this, message, otherPlayer.x, otherPlayer.y, timestamp),
                timestamp
            });
        }
    });

    socket.on('chat-sent', ({ nearbyPlayers }) => {
        const notification = this.add.text(this.scale.width / 2, this.scale.height - 80,
            `Message sent to ${nearbyPlayers} nearby players`,
            { font: '12px Arial', fill: '#ffffff' }
        ).setOrigin(0.5).setDepth(2);
        setTimeout(() => notification.destroy(), 2000);
    });

    socket.on('player-left', (id) => {
        if (otherPlayers.has(id)) {
            otherPlayers.get(id).destroy();
            otherPlayers.delete(id);
            otherPlayerWorldPos.delete(id);
            otherPlayerTargetPos.delete(id);
            if (nameLabels.has(id)) { nameLabels.get(id).destroy(); nameLabels.delete(id); }
            if (chatBubbles.has(id)) { chatBubbles.get(id).bubble.destroy(); chatBubbles.delete(id); }
            closePeerConnection(id);
        }
    });

    // WebRTC signaling
    socket.on('webrtc-offer', async ({ from, offer }) => {
        try {
            let pc = peerConnections.get(from);
            if (!pc) pc = createPeerConnection(from);

            if (pc.signalingState !== 'stable') {
                await Promise.all([
                    pc.setLocalDescription({ type: 'rollback' }),
                    pc.setRemoteDescription(new RTCSessionDescription(offer))
                ]);
            } else {
                await pc.setRemoteDescription(new RTCSessionDescription(offer));
            }

            if (localStream) {
                localStream.getTracks().forEach(track => { try { pc.addTrack(track, localStream); } catch(e) {} });
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('webrtc-answer', { target: from, answer: pc.localDescription });
        } catch (e) {
            console.error('webrtc-offer error:', e);
        }
    });

    socket.on('webrtc-answer', async ({ from, answer }) => {
        try {
            const pc = peerConnections.get(from);
            if (pc && pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            }
        } catch (e) {
            console.error('webrtc-answer error:', e);
        }
    });

    socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
        try {
            const pc = peerConnections.get(from);
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('webrtc-ice error:', e);
        }
    });

    uiText = this.add.text(10, 70, '', { font: '16px Arial', fill: '#ffffff' }).setDepth(2);
    uiText.setStroke('#000000', 4); // Added black stroke to coords

    // Initialize keyboard controls
    cursors = this.input.keyboard.createCursorKeys();
    wasd = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D
    });
}

function update(time, delta) {
// ... (omitting update content for brevity in replace call)
    const adjustedSpeed = MOVEMENT_SPEED * (delta / 16.666);
    const lerpDelta = 1 - Math.pow(1 - LERP_FACTOR, delta / 16.666);

    updatePlayerStatus(player, lastActivity);

    let moveX = 0;
    let moveY = 0;

    // Keyboard Input
    const isTyping = document.activeElement.tagName === 'INPUT';
    if (!isTyping && !worldViewMode) {
        if (cursors.left.isDown || wasd.left.isDown) moveX = -adjustedSpeed;
        else if (cursors.right.isDown || wasd.right.isDown) moveX = adjustedSpeed;

        if (cursors.up.isDown || wasd.up.isDown) moveY = -adjustedSpeed;
        else if (cursors.down.isDown || wasd.down.isDown) moveY = adjustedSpeed;

        if (moveX !== 0 || moveY !== 0) {
            isMoving = false; // Cancel click-to-move if keyboard is used
            targetX = null;
            targetY = null;
        }
    }

    // Click-to-move logic (Only if keyboard isn't moving us)
    if (moveX === 0 && moveY === 0 && isMoving && targetX !== null && targetY !== null) {
        const dx = targetX - currentPosition.x;
        const dy = targetY - currentPosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > adjustedSpeed) {
            moveX = (dx / distance) * adjustedSpeed;
            moveY = (dy / distance) * adjustedSpeed;
        } else {
            isMoving = false;
            targetX = null;
            targetY = null;
        }
    }

    // Apply movement
    if (moveX !== 0 || moveY !== 0) {
        const oldX = currentPosition.x;
        const oldY = currentPosition.y;
        
        currentPosition.x = Math.max(0, Math.min(WORLD_SIZE, currentPosition.x + moveX));
        currentPosition.y = Math.max(0, Math.min(WORLD_SIZE, currentPosition.y + moveY));

        const actualMoveX = currentPosition.x - oldX;
        const actualMoveY = currentPosition.y - oldY;

        worldContainer.x -= actualMoveX;
        worldContainer.y -= actualMoveY;

        if (selfChatBubble) {
            selfChatBubble.x = this.scale.width / 2;
            selfChatBubble.y = this.scale.height / 2 - CHAT_BUBBLE_OFFSET;
        }

        const now = Date.now();
        if (now - lastMoveEmit > MOVE_EMIT_INTERVAL) {
            socket.emit('player-move', { x: currentPosition.x, y: currentPosition.y });
            // Update URL slug without refreshing
            const newUrl = `${window.location.pathname}?x=${Math.round(currentPosition.x)}&y=${Math.round(currentPosition.y)}`;
            window.history.replaceState({ x: currentPosition.x, y: currentPosition.y }, '', newUrl);
            
            lastMoveEmit = now;
            lastActivity = now;
        }
    }

    // Always update tiles to handle initial load and movements
    createTiles(this, this.scale.width / 2 - worldContainer.x, this.scale.height / 2 - worldContainer.y);

    // Lerp other players toward their latest server position, then update screen coords
    otherPlayerWorldPos.forEach((pos, id) => {
        const target = otherPlayerTargetPos.get(id);
        if (target) {
            pos.x += (target.x - pos.x) * lerpDelta;
            pos.y += (target.y - pos.y) * lerpDelta;
        }

        const otherPlayer = otherPlayers.get(id);
        if (otherPlayer) {
            otherPlayer.x = this.scale.width / 2 + (pos.x - currentPosition.x);
            otherPlayer.y = this.scale.height / 2 + (pos.y - currentPosition.y);

            if (nameLabels.has(id)) {
                nameLabels.get(id).setPosition(otherPlayer.x, otherPlayer.y + PLAYER_RADIUS + 15);
            }
            if (chatBubbles.has(id)) {
                chatBubbles.get(id).bubble.x = otherPlayer.x;
                chatBubbles.get(id).bubble.y = otherPlayer.y - CHAT_BUBBLE_OFFSET;
            }
        }
    });

    // Proximity-based audio volume
    audioElements.forEach((audio, id) => {
        const pos = otherPlayerWorldPos.get(id);
        if (pos) {
            const dx = pos.x - currentPosition.x;
            const dy = pos.y - currentPosition.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const range = worldViewMode ? WORLD_MODE_VOICE_RANGE : VOICE_RANGE;
            audio.volume = Math.max(0, 1 - dist / range);
        }
    });

    if (worldViewMode) {
        updateMapMarkers();
    }

    uiText.setText(
        `${username}\nX: ${Math.round(currentPosition.x).toLocaleString()}  Y: ${Math.round(currentPosition.y).toLocaleString()}`
    );

    // Fade and expire chat bubbles
    chatBubbles.forEach(({ bubble, timestamp }, id) => {
        const age = Date.now() - timestamp;
        if (age > CHAT_DURATION) {
            bubble.destroy();
            chatBubbles.delete(id);
        } else {
            bubble.setAlpha(1 - age / CHAT_DURATION);
        }
    });

    if (selfChatBubble) {
        const age = Date.now() - selfChatBubble.startTime;
        if (age > CHAT_DURATION) {
            selfChatBubble.destroy();
            selfChatBubble = null;
        } else {
            selfChatBubble.setAlpha(1 - age / CHAT_DURATION);
        }
    }
}

function generateConsistentColor(x, y) {
    const hash = Math.abs((x * 31 + y * 17) % 360);
    // Pastel-ish colors: Moderate saturation (0.6) and balanced lightness (0.75)
    return Phaser.Display.Color.HSLToColor(hash / 360, 0.6, 0.75).color;
}

let watchId = null;

function requestLocation() {
    console.log("Requesting geolocation...");
    if ("geolocation" in navigator) {
        if (watchId) navigator.geolocation.clearWatch(watchId);
        
        watchId = navigator.geolocation.watchPosition((position) => {
            if (!worldViewMode) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
                return;
            }

            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            console.log(`GPS Update: ${lat}, ${lng}`);
            
            const gameCoords = latLngToGame(lat, lng);
            
            currentPosition.x = gameCoords.x;
            currentPosition.y = gameCoords.y;
            
            // Sync with server
            socket.emit('player-move', { x: currentPosition.x, y: currentPosition.y });
            
            // Update URL
            const newUrl = `${window.location.pathname}?x=${Math.round(currentPosition.x)}&y=${Math.round(currentPosition.y)}`;
            window.history.replaceState({ x: currentPosition.x, y: currentPosition.y }, '', newUrl);
            
            if (leafletMap) {
                leafletMap.setView([lat, lng]);
            }
        }, (error) => {
            console.warn("Geolocation error:", error.code, error.message);
        }, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        });
    } else {
        console.warn("Geolocation not supported by browser.");
    }
}

function updateMapMarkers() {
    if (!leafletMap) return;
    
    const selfLatLng = gameToLatLng(currentPosition.x, currentPosition.y);
    if (!selfMarker) {
        selfMarker = L.circleMarker([selfLatLng.lat, selfLatLng.lng], {
            radius: 10,
            fillColor: `#${playerColor.toString(16).padStart(6, '0')}`,
            color: '#000',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(leafletMap).bindPopup(username, { autoClose: false, closeOnClick: false });
    } else {
        selfMarker.setLatLng([selfLatLng.lat, selfLatLng.lng]);
    }

    // Handle Self Chat Bubble on Map
    if (selfChatBubble) {
        const age = Date.now() - selfChatBubble.startTime;
        if (age < CHAT_DURATION) {
            selfMarker.setPopupContent(`${username}<br/><b>${selfChatBubble.text}</b>`);
            if (!selfMarker.isPopupOpen()) selfMarker.openPopup();
            // Fading simulation via opacity isn't direct for popups, but we can set content
        } else {
            selfMarker.setPopupContent(username);
        }
    } else {
        selfMarker.setPopupContent(username);
    }

    otherPlayerWorldPos.forEach((pos, id) => {
        const latLng = gameToLatLng(pos.x, pos.y);
        if (!playerMarkers.has(id)) {
            const marker = L.circleMarker([latLng.lat, latLng.lng], {
                radius: 8,
                fillColor: '#888',
                color: '#000',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.6
            }).addTo(leafletMap).bindPopup('Player', { autoClose: false, closeOnClick: false });
            playerMarkers.set(id, marker);
        } else {
            const marker = playerMarkers.get(id);
            marker.setLatLng([latLng.lat, latLng.lng]);
            
            // Handle Other Player Chat Bubbles on Map
            if (chatBubbles.has(id)) {
                const { bubble, timestamp } = chatBubbles.get(id);
                const age = Date.now() - timestamp;
                if (age < CHAT_DURATION) {
                    marker.setPopupContent(`<b>${bubble.text}</b>`);
                    if (!marker.isPopupOpen()) marker.openPopup();
                } else {
                    marker.closePopup();
                }
            } else {
                marker.closePopup();
            }
        }
    });

    // Cleanup markers for players who left
    playerMarkers.forEach((marker, id) => {
        if (!otherPlayerWorldPos.has(id)) {
            marker.remove();
            playerMarkers.delete(id);
        }
    });
}
