// Variables
let localStream;
let peer;
let dataConn; // For sending/receiving sign language text
let handDetector;
let isSignOn = false;

// DOM Elements
const localVideo = document.getElementById('localVideo');
const signCaption = document.getElementById('signCaption');       // YOUR BOX
const remoteSignCaption = document.getElementById('remoteSignCaption'); // REMOTE BOX
const distanceCaption = document.getElementById('distanceCaption'); // TECHNICAL BAR
const statusDiv = document.getElementById('status');
const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d');

function updateStatus(msg) {
    if (statusDiv) statusDiv.textContent = msg;
    console.log(msg);
}

// --- PEERJS SETUP ---
// Initialize Peer when the page loads
function initPeer() {
    peer = new Peer(); 

    peer.on('open', (id) => {
        updateStatus("Your ID: " + id + " (Share this to connect)");
    });

    // Listen for incoming data connections (Remote person calling you)
    peer.on('connection', (conn) => {
        dataConn = conn;
        setupDataListeners();
        updateStatus("Connected to Remote Signer!");
    });
}

function setupDataListeners() {
    dataConn.on('data', (data) => {
        // When we receive a sign from the other person
        if (data.type === 'sign') {
            remoteSignCaption.textContent = data.value;
            remoteSignCaption.style.color = "#FFD700"; // Gold color for remote
        }
    });
}

// --- VIDEO & AI SETUP ---
async function startLocalVideo() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: "user" },
            audio: true
        });
        localVideo.srcObject = localStream;
        updateStatus("Camera ready!");
        initPeer(); // Start PeerJS after camera
    } catch (err) {
        updateStatus("Camera error: " + err.message);
    }
}

async function initHandDetection() {
    updateStatus("Loading AI Model...");
    const model = handPoseDetection.SupportedModels.MediaPipeHands;
    const detectorConfig = { runtime: 'tfjs', modelType: 'full', maxHands: 1 };
    handDetector = await handPoseDetection.createDetector(model, detectorConfig);
    updateStatus("AI Loaded! Wave your hand.");
}

function toggleSign() {
    isSignOn = !isSignOn;
    const btn = document.getElementById('toggleSign');
    if (isSignOn) {
        btn.textContent = "Sign & Distance: ON";
        if (!handDetector) initHandDetection().then(() => detectHands());
        else detectHands();
    } else {
        btn.textContent = "Sign & Distance: OFF";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        signCaption.textContent = "Detection stopped.";
    }
}

// --- CORE DETECTION LOOP ---
async function detectHands() {
    if (!isSignOn || !handDetector || !localVideo) return;

    if (localVideo.readyState === 4) {
        if (canvas.width !== localVideo.videoWidth) {
            canvas.width = localVideo.videoWidth;
            canvas.height = localVideo.videoHeight;
        }

        const hands = await handDetector.estimateHands(localVideo, { flipHorizontal: false });
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (hands && hands.length > 0) {
            const keypoints = hands[0].keypoints;
            
            // Calculate Box and Distance (Technical Feedback)
            const xCoords = keypoints.map(k => k.x);
            const yCoords = keypoints.map(k => k.y);
            const minX = Math.min(...xCoords);
            const maxX = Math.max(...xCoords);
            const minY = Math.min(...yCoords);
            const maxY = Math.max(...yCoords);
            const handWidth = maxX - minX;

            let color = handWidth > 130 && handWidth < 210 ? "#00FF00" : "#FFFF00";
            distanceCaption.textContent = handWidth > 130 && handWidth < 210 ? "Perfect Distance" : "Adjust Distance";
            distanceCaption.style.color = color;

            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.strokeRect(minX - 10, minY - 10, (maxX - minX) + 20, (maxY - minY) + 20);

            // GESTURE RECOGNITION
            const gesture = detectGesture(keypoints);
            if (gesture) {
                signCaption.textContent = gesture;
                
                // SEND TO REMOTE PERSON
                if (dataConn && dataConn.open) {
                    dataConn.send({ type: 'sign', value: gesture });
                }
            }
        }
    }
    requestAnimationFrame(detectHands);
}

// --- PYTHON LOGIC TRANSLATED ---
function detectGesture(posList) {
    let fingers = [];
    const finger_dip = [6, 10, 14, 18], finger_pip = [7, 11, 15, 19], finger_tip = [8, 12, 16, 20];
    
    for (let i = 0; i < 4; i++) {
        if (posList[finger_tip[i]].x + 25 < posList[finger_dip[i]].x) fingers.push(0.25);
        else if (posList[finger_tip[i]].y > posList[finger_dip[i]].y) fingers.push(0);
        else if (posList[finger_tip[i]].y < posList[finger_pip[i]].y) fingers.push(1);
        else fingers.push(0.5);
    }

    const countOnes = fingers.filter(f => f === 1).length;
    const countZeros = fingers.filter(f => f === 0).length;

    // A, B, C, D, L, Y, V Logic
    if (posList[4].y < posList[3].y && countZeros === 4) return "A";
    if (posList[3].x > posList[4].x && countOnes === 4) return "B";
    if (posList[3].x > posList[6].x && fingers.includes(0.5)) return "C";
    if (fingers[0] === 1 && countZeros === 3) return "D";
    if (fingers[0] === 1 && countZeros === 3 && posList[3].x < posList[4].x) return "L";
    if (countZeros === 3 && fingers[3] === 1) return "Y";
    if (countOnes === 2 && posList[8].y < posList[6].y && posList[12].y < posList[10].y) return "V";
    if (countOnes === 4) return "HI";

    return null;
}

// --- CONTROLS ---
document.getElementById('joinCall').addEventListener('click', () => {
    const remoteId = document.getElementById('roomId').value;
    updateStatus("Connecting to: " + remoteId);
    dataConn = peer.connect(remoteId);
    setupDataListeners();
});

document.getElementById('toggleSign').addEventListener('click', toggleSign);
startLocalVideo();