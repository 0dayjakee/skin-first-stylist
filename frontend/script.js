// ---------- STATE ----------
let userImageBase64 = null;
let skinData = null;
let recommendations = null;
let currentGarment = null;

const API_BASE = 'http://localhost:5000/api';

// ---------- DOM REFS ----------
const uploadZone = document.getElementById('uploadZone');
const photoInput = document.getElementById('photoInput');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const analyzeBtn = document.getElementById('analyzeBtn');
const stepResults = document.getElementById('step-results');
const skinScores = document.getElementById('skinScores');
const recReason = document.getElementById('recReason');
const recColors = document.getElementById('recColors');
const recStyles = document.getElementById('recStyles');
const tryOnBtn = document.getElementById('tryOnBtn');
const stepTryon = document.getElementById('step-tryon');
const garmentOptions = document.getElementById('garmentOptions');
const tryonResult = document.getElementById('tryonResult');

// ---------- IMAGE UPLOAD ----------
uploadZone.addEventListener('click', () => photoInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '#667eea';
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = '#ccc';
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '#ccc';
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});

photoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1];
        userImageBase64 = base64;
        previewImage.src = e.target.result;
        previewContainer.style.display = 'block';
        uploadZone.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

// ---------- SKIN ANALYSIS ----------
analyzeBtn.addEventListener('click', async () => {
    if (!userImageBase64) return;

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = '⏳ Analyzing...';

    try {
        const response = await fetch(`${API_BASE}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: userImageBase64 })
        });

        const result = await response.json();

        if (result.error) {
            alert('Error: ' + result.error);
            return;
        }

        skinData = result.skin_data;
        recommendations = result.recommendations;

        displaySkinResults();
        displayRecommendations();

        stepResults.style.display = 'block';
        stepResults.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        alert('Failed to analyze: ' + error.message);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = '🔍 Analyze My Skin';
    }
});

function displaySkinResults() {
    const scores = skinData.scores || {};
    const keyMetrics = ['redness', 'radiance', 'moisture', 'acne', 'oiliness', 'firmness'];
    
    skinScores.innerHTML = '';
    
    keyMetrics.forEach(key => {
        if (scores[key]) {
            const score = scores[key].ui_score || 50;
            const color = score > 70 ? '#4CAF50' : score > 40 ? '#FFC107' : '#F44336';
            
            const card = document.createElement('div');
            card.className = 'score-card';
            card.innerHTML = `
                <div class="label">${key.toUpperCase()}</div>
                <div class="value">${Math.round(score)}</div>
                <div class="bar"><div class="fill" style="width:${score}%;background:${color};"></div></div>
            `;
            skinScores.appendChild(card);
        }
    });
}

function displayRecommendations() {
    if (!recommendations) return;
    
    recReason.textContent = recommendations.reason || 'No specific recommendations available.';
    
    recColors.innerHTML = '<strong>🎨 Recommended Colors:</strong> ' + 
        (recommendations.colors || []).map(c => `<span class="color-tag">${c}</span>`).join('');
    
    recStyles.innerHTML = '<strong>👔 Recommended Styles:</strong> ' + 
        (recommendations.styles || []).map(s => `<span class="style-tag">${s}</span>`).join('');
}

// ---------- VIRTUAL TRY-ON ----------
tryOnBtn.addEventListener('click', () => {
    stepTryon.style.display = 'block';
    stepTryon.scrollIntoView({ behavior: 'smooth' });
    loadGarmentOptions();
});

// Sample garment images (replace with real product images)
const GARMENTS = [
    { id: 'blue_top', name: 'Blue Silk Top', image: 'https://via.placeholder.com/200x300/4A90D9/fff?text=Blue+Top' },
    { id: 'gold_dress', name: 'Gold Evening Dress', image: 'https://via.placeholder.com/200x300/D4AF37/fff?text=Gold+Dress' },
    { id: 'green_blazer', name: 'Forest Green Blazer', image: 'https://via.placeholder.com/200x300/2E7D32/fff?text=Green+Blazer' },
    { id: 'coral_top', name: 'Coral Casual Top', image: 'https://via.placeholder.com/200x300/FF6B6B/fff?text=Coral+Top' },
];

function loadGarmentOptions() {
    garmentOptions.innerHTML = '';
    
    GARMENTS.forEach(g => {
        const btn = document.createElement('button');
        btn.className = 'garment-option';
        btn.innerHTML = `
            <img src="${g.image}" alt="${g.name}" style="width:60px;height:80px;object-fit:cover;border-radius:8px;display:block;margin-bottom:8px;" />
            <strong>${g.name}</strong>
        `;
        btn.addEventListener('click', () => tryOnGarment(g));
        garmentOptions.appendChild(btn);
    });
}

async function tryOnGarment(garment) {
    currentGarment = garment;
    
    // Highlight selected
    document.querySelectorAll('.garment-option').forEach(el => el.classList.remove('selected'));
    event.target.closest('.garment-option')?.classList.add('selected');
    
    tryonResult.innerHTML = '<p>⏳ Generating preview...</p>';
    
    try {
        // Convert garment image to base64
        const garmentBase64 = await imageToBase64(garment.image);
        
        const response = await fetch(`${API_BASE}/tryon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_image: userImageBase64,
                garment_image: garmentBase64
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            tryonResult.innerHTML = `<p>❌ Error: ${result.error}</p>`;
            return;
        }
        
        tryonResult.innerHTML = `
            <img src="${result.tryon_image_url}" alt="Virtual Try-On Result" />
            <p style="margin-top:10px;font-weight:600;">${garment.name}</p>
        `;
        
    } catch (error) {
        tryonResult.innerHTML = `<p>❌ Failed to generate preview: ${error.message}</p>`;
    }
}

// Helper: Convert image URL to base64
function imageToBase64(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg').split(',')[1]);
        };
        img.onerror = reject;
        img.src = url;
    });
}
