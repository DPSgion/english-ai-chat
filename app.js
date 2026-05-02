// ==========================================
// GIAO DIỆN & ĐIỀU HƯỚNG CHUNG
// ==========================================
const menuScreen = document.getElementById('menu-screen');
const guidedContainer = document.getElementById('guided-container');
const freeContainer = document.getElementById('free-container');

function selectMode(mode) {
    menuScreen.classList.add('hidden');
    if (mode === 'guided') {
        guidedContainer.classList.remove('hidden');
        guidedContainer.classList.add('flex');
    } else if (mode === 'free') {
        freeContainer.classList.remove('hidden');
        freeContainer.classList.add('flex');
    }
}

function backToMenu() {
    // Tắt UI các chế độ
    guidedContainer.classList.add('hidden');
    guidedContainer.classList.remove('flex');
    freeContainer.classList.add('hidden');
    freeContainer.classList.remove('flex');
    // Hiện lại Menu
    menuScreen.classList.remove('hidden');
}

// ==========================================
// MODULE 1: GUIDED MODE LOGIC
// ==========================================
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const topicInput = document.getElementById('topic-input');
const chatHeader = document.getElementById('chat-header');
const chatHistoryEl = document.getElementById('chat-history');
const interactionPanel = document.getElementById('interaction-panel');
const targetTextEl = document.getElementById('target-text');
const targetPhoneticsEl = document.getElementById('target-phonetics');
const recordBtn = document.getElementById('record-btn');
const skipBtn = document.getElementById('skip-btn');
const feedbackResult = document.getElementById('feedback-result');
const statusMsg = document.getElementById('status-msg');

const SCENARIO_API = 'https://n8n.laptopxinxo.website/webhook/get-scenario';
const TRANSCRIBE_API = 'https://n8n.laptopxinxo.website/webhook/transcribe';

let currentTopic = "";
let currentTargetText = "";
let conversationHistory = [];
let guidedRecorder;
let guidedChunks = [];
let isGuidedRecording = false;

startBtn.onclick = () => {
    const topic = topicInput.value.trim();
    if (!topic) { alert("Thiếu chủ đề!"); return; }

    currentTopic = topic;
    document.getElementById('current-topic-display').innerText = "Topic: " + topic;

    startScreen.classList.add('hidden');
    chatHeader.classList.remove('hidden');
    chatHistoryEl.classList.remove('hidden');
    interactionPanel.classList.remove('hidden', 'flex');
    interactionPanel.classList.add('flex');

    fetchScenarioFromAI('start');
};

function addGuidedMessage(text, sender) {
    const wrapper = document.createElement('div');
    wrapper.className = `flex ${sender === 'ai' ? 'justify-start' : 'justify-end'}`;
    const bubble = document.createElement('div');
    bubble.className = sender === 'ai'
        ? 'bg-gray-700 p-3 rounded-2xl rounded-tl-sm max-w-[85%] text-[15px] shadow-sm'
        : 'bg-blue-600 p-3 rounded-2xl rounded-tr-sm max-w-[85%] text-[15px] shadow-sm';
    bubble.innerText = text;
    wrapper.appendChild(bubble);
    chatHistoryEl.appendChild(wrapper);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

async function fetchScenarioFromAI(actionType) {
    skipBtn.disabled = true;
    targetTextEl.innerText = "AI is thinking...";
    targetPhoneticsEl.innerText = "";
    recordBtn.disabled = true;
    statusMsg.innerText = "Đang tải dữ liệu...";

    try {
        const response = await fetch(SCENARIO_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: actionType, topic: currentTopic, conversation_history: conversationHistory })
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        let rawData = await response.json();
        let data;

        try {
            if (rawData.text) data = JSON.parse(rawData.text);
            else if (typeof rawData === 'string') data = JSON.parse(rawData);
            else data = rawData;
            skipBtn.disabled = false;
        } catch (e) {
            alert("LLM trả về format sai!");
            recordBtn.disabled = false;
            return;
        }

        conversationHistory.push({ role: "ai", content: data.ai_message });
        addGuidedMessage(data.ai_message, 'ai');

        currentTargetText = data.user_expected_reply;
        targetTextEl.innerText = currentTargetText;
        targetPhoneticsEl.innerText = data.phonetics;

        feedbackResult.classList.add('hidden');
        statusMsg.innerText = "Nhấn nút Micro để đọc câu trên";
        recordBtn.disabled = false;

    } catch (error) {
        statusMsg.innerText = "Lỗi kết nối n8n!";
    }
}

recordBtn.onclick = async () => {
    if (!isGuidedRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            guidedRecorder = new MediaRecorder(stream);
            guidedChunks = [];

            guidedRecorder.ondataavailable = (e) => guidedChunks.push(e.data);
            guidedRecorder.onstop = sendGuidedAudio;
            guidedRecorder.start();
            isGuidedRecording = true;

            recordBtn.classList.add('recording', 'bg-red-500');
            recordBtn.classList.remove('bg-gray-700');
            statusMsg.innerText = "Đang nghe...";
            feedbackResult.classList.add('hidden');
        } catch (err) { alert("Chưa cấp quyền Micro!"); }
    } else {
        guidedRecorder.stop();
        isGuidedRecording = false;
        recordBtn.disabled = true;
        recordBtn.classList.remove('recording', 'bg-red-500');
        recordBtn.classList.add('bg-gray-700');
        statusMsg.innerText = "Đang xử lý...";
    }
};

skipBtn.onclick = () => {
    recordBtn.disabled = true;
    skipBtn.disabled = true;
    statusMsg.innerHTML = `<span class="text-yellow-500 font-bold">⏭️ Đã bỏ qua!</span>`;
    conversationHistory.push({ role: "user", content: currentTargetText });
    addGuidedMessage("⏭️ " + currentTargetText, 'user');
    setTimeout(() => fetchScenarioFromAI("continue"), 800);
};

async function sendGuidedAudio() {
    const audioBlob = new Blob(guidedChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('data', audioBlob, 'voice.webm');

    try {
        const response = await fetch(TRANSCRIBE_API, { method: 'POST', body: formData });
        const result = await response.json();
        evaluatePronunciation(currentTargetText, result.raw_text);
    } catch (error) {
        statusMsg.innerHTML = `<span class="text-red-400">Lỗi dịch âm thanh!</span>`;
        recordBtn.disabled = false;
    }
}

function evaluatePronunciation(expected, actual) {
    const cleanExpectedWords = expected.split(/\s+/);
    const actualTextLower = actual.toLowerCase().replace(/[.,!?;:]/g, "");
    const actualWords = actualTextLower.split(/\s+/);

    let errorCount = 0;
    const diffHtml = cleanExpectedWords.map(word => {
        const cleanWord = word.toLowerCase().replace(/[.,!?;:]/g, "");
        if (actualWords.includes(cleanWord)) {
            return `<span class="text-green-400">${word}</span>`;
        } else {
            errorCount++;
            return `<span class="text-red-500 font-bold underline bg-red-900/30 px-1 rounded">${word}</span>`;
        }
    }).join(" ");

    feedbackResult.innerHTML = diffHtml;
    feedbackResult.classList.remove('hidden');

    const errorRate = (errorCount / cleanExpectedWords.length) * 100;
    if (errorRate > 30) {
        statusMsg.innerHTML = `<span class="text-red-400 font-bold">❌ Sai ${errorCount} từ. Thử lại!</span>`;
        recordBtn.disabled = false;
    } else {
        statusMsg.innerHTML = `<span class="text-green-400 font-bold">✅ Chuẩn!</span>`;
        conversationHistory.push({ role: "user", content: expected });
        addGuidedMessage(expected, 'user');
        setTimeout(() => fetchScenarioFromAI("continue"), 1000);
    }
}

// ==========================================
// MODULE 2: FREE CHAT MODE LOGIC
// ==========================================
const freeRecordBtn = document.getElementById('free-record-btn');
const freeBtnText = document.getElementById('free-btn-text');
const freeStatusIcon = document.getElementById('free-status-icon');
const freeChatBox = document.getElementById('free-chat-box');

const VOICE_INPUT_API = 'https://n8n.laptopxinxo.website/webhook/voice-input';

let freeRecorder;
let freeChunks = [];
let isFreeRecording = false;
let freeConversationHistory = [];

freeRecordBtn.onclick = async () => {
    if (!isFreeRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            freeRecorder = new MediaRecorder(stream);
            freeChunks = [];
            freeRecorder.ondataavailable = (e) => freeChunks.push(e.data);
            freeRecorder.onstop = sendFreeData;
            freeRecorder.start();

            isFreeRecording = true;
            freeBtnText.innerText = "Stop & Audit";
            freeStatusIcon.classList.add('bg-red-500', 'free-recording-icon');
        } catch (err) { alert("Chưa cấp quyền Micro!"); }
    } else {
        freeRecorder.stop();
        isFreeRecording = false;
        freeRecordBtn.disabled = true;
        freeBtnText.innerText = "Analyzing...";
        freeStatusIcon.classList.remove('bg-red-500', 'free-recording-icon');
    }
};

async function sendFreeData() {
    const audioBlob = new Blob(freeChunks, { type: 'audio/mpeg' });
    const formData = new FormData();
    formData.append('data', audioBlob, 'voice.mp3');

    // ĐÍNH KÈM LỊCH SỬ VÀO FORM DATA
    formData.append('history', JSON.stringify(freeConversationHistory));

    try {
        const response = await fetch(VOICE_INPUT_API, { method: 'POST', body: formData });
        const result = await response.json();

        // Push câu của User vào lịch sử (lấy từ text AI dịch ra)
        freeConversationHistory.push({ role: "user", content: result.user_said });
        appendUserMessageFree(result.user_said, result.grammar_audit);

        setTimeout(() => {
            // Push câu AI trả lời vào lịch sử
            freeConversationHistory.push({ role: "ai", content: result.ai_response });
            appendAIMessageFree(result.ai_response);
        }, 500);

    } catch (error) {
        appendSystemMessageFree("Lỗi n8n, kiểm tra webhook!");
    } finally {
        freeRecordBtn.disabled = false;
        freeBtnText.innerText = "Start Recording";
    }
}

function appendUserMessageFree(text, audit) {
    const wrapper = document.createElement('div');
    wrapper.className = "flex flex-col items-end gap-2 self-end max-w-[85%] mb-4";
    const bubble = `<div class="bg-purple-600 text-white px-4 py-2 rounded-2xl rounded-tr-none shadow-md">${text}</div>`;

    const original = text.trim().toLowerCase().replace(/[.,!?;:]/g, "");
    const corrected = audit.corrected_version.trim().toLowerCase().replace(/[.,!?;:]/g, "");
    const hasError = original !== corrected;

    let auditBox = '';
    if (hasError) {
        const errorList = audit.errors.map(err => `<li class="ml-3 mt-1">• ${err}</li>`).join('');
        auditBox = `
            <div class="bg-gray-800 border border-red-900/50 p-3 rounded-xl text-[11px] w-full shadow-lg">
                <p class="text-red-400 font-bold uppercase text-[9px] mb-1 flex items-center">
                    <span class="mr-1">🚨</span> Grammar Police
                </p>
                <p class="text-green-300 font-medium">✓ ${audit.corrected_version}</p>
                <ul class="text-gray-400 italic mt-1 list-none p-0">${errorList}</ul>
            </div>
        `;
    }

    wrapper.innerHTML = bubble + auditBox;
    freeChatBox.appendChild(wrapper);
    freeChatBox.scrollTo({ top: freeChatBox.scrollHeight, behavior: 'smooth' });
}

function appendAIMessageFree(text) {
    const div = document.createElement('div');
    div.className = "self-start max-w-[80%] bg-gray-700 text-gray-100 px-4 py-2 rounded-2xl rounded-tl-none shadow-md border border-gray-600 mb-4";
    div.innerText = text;
    freeChatBox.appendChild(div);
    freeChatBox.scrollTo({ top: freeChatBox.scrollHeight, behavior: 'smooth' });
}

function appendSystemMessageFree(msg) {
    const div = document.createElement('div');
    div.className = "self-center text-red-500 text-xs italic mb-2";
    div.innerText = msg;
    freeChatBox.appendChild(div);
}