import os
import time
import requests
import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

API_KEY = os.getenv('YOUCAM_API_KEY')
API_BASE = os.getenv('YOUCAM_API_BASE', 'https://yce.perfectcorp.com')

# ------------------- HELPER: File Upload -------------------
def upload_file(image_base64, feature='skin-analysis'):
    """Step 1: Upload image to YouCam and get file_id"""
    url = f"{API_BASE}/s2s/v2.0/file/{feature}"
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }
    payload = {
        'file': image_base64,
        'fileName': 'selfie.jpg'
    }
    
    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    return response.json().get('data', {}).get('fileId')

# ------------------- SKIN ANALYSIS -------------------
def analyze_skin(file_id):
    """Step 2: Create skin analysis task"""
    url = f"{API_BASE}/s2s/v2.0/task/skin-analysis"
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }
    payload = {
        'fileId': file_id
    }
    
    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    return response.json().get('data', {}).get('taskId')

def get_skin_result(task_id):
    """Step 3: Poll for skin analysis results"""
    url = f"{API_BASE}/s2s/v2.0/task/skin-analysis/{task_id}"
    headers = {
        'Authorization': f'Bearer {API_KEY}'
    }
    
    max_attempts = 30
    for _ in range(max_attempts):
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json().get('data', {})
        
        if data.get('status') == 'done':
            return data.get('result', {})
        elif data.get('status') == 'failed':
            raise Exception('Skin analysis failed')
        
        time.sleep(2)
    
    raise Exception('Timeout waiting for skin analysis')

# ------------------- APPAREL VTO -------------------
def apparel_vto(user_file_id, garment_file_id):
    """Step 4: Create apparel virtual try-on task"""
    url = f"{API_BASE}/s2s/v2.0/task/cloth-v3"
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }
    payload = {
        'personImageFileId': user_file_id,
        'clothImageFileId': garment_file_id
    }
    
    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    return response.json().get('data', {}).get('taskId')

def get_vto_result(task_id):
    """Step 5: Poll for VTO results"""
    url = f"{API_BASE}/s2s/v2.0/task/cloth-v3/{task_id}"
    headers = {
        'Authorization': f'Bearer {API_KEY}'
    }
    
    max_attempts = 30
    for _ in range(max_attempts):
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json().get('data', {})
        
        if data.get('status') == 'done':
            return data.get('result', {}).get('compositeImageUrl')
        elif data.get('status') == 'failed':
            raise Exception('VTO failed')
        
        time.sleep(2)
    
    raise Exception('Timeout waiting for VTO')

# ------------------- RECOMMENDATION ENGINE -------------------
def get_outfit_recommendation(skin_data):
    """
    Based on skin analysis, recommend outfit colors and styles.
    """
    scores = skin_data.get('scores', {})
    
    # Extract key metrics (0-100 scale, higher = better)
    redness = scores.get('redness', {}).get('ui_score', 50)
    radiance = scores.get('radiance', {}).get('ui_score', 50)
    moisture = scores.get('moisture', {}).get('ui_score', 50)
    acne = scores.get('acne', {}).get('ui_score', 50)
    oiliness = scores.get('oiliness', {}).get('ui_score', 50)
    
    recommendations = {
        'colors': [],
        'styles': [],
        'reason': ''
    }
    
    # Color recommendations based on skin condition
    if redness < 50:
        recommendations['colors'].extend(['Cool Blues', 'Teal', 'Forest Green', 'Navy'])
        recommendations['reason'] += 'Your skin shows some redness. Cool tones like blue and green help neutralize redness. '
    elif radiance < 50:
        recommendations['colors'].extend(['Warm Gold', 'Coral', 'Peach', 'Mustard Yellow'])
        recommendations['reason'] += 'Your skin could use some radiance boost. Warm colors like gold and coral add glow. '
    else:
        recommendations['colors'].extend(['Neutral Tones', 'Pastels', 'Earth Tones'])
        recommendations['reason'] += 'Your skin is balanced! You can pull off most colors. '
    
    # Style recommendations
    if acne < 50 or oiliness > 60:
        recommendations['styles'].extend(['High Neck Tops', 'Collared Shirts', 'Blazers'])
        recommendations['reason'] += 'Consider pieces that draw attention upward to balance your look. '
    elif moisture < 50:
        recommendations['styles'].extend(['Soft Fabrics', 'Layering Pieces', 'Cashmere'])
        recommendations['reason'] += 'Soft, comfortable fabrics complement your skin\'s needs. '
    else:
        recommendations['styles'].extend(['Versatile Basics', 'Statement Pieces', 'Minimalist'])
        recommendations['reason'] += 'Your skin is healthy! Feel free to experiment with different styles. '
    
    return recommendations

# ------------------- MAIN API ROUTES -------------------
@app.route('/api/analyze', methods=['POST'])
def analyze():
    """Main endpoint: upload photo → skin analysis → recommendations"""
    try:
        data = request.get_json()
        image_base64 = data.get('image')
        
        if not image_base64:
            return jsonify({'error': 'No image provided'}), 400
        
        # Step 1: Upload file
        file_id = upload_file(image_base64, 'skin-analysis')
        
        # Step 2: Start skin analysis
        task_id = analyze_skin(file_id)
        
        # Step 3: Get results
        skin_result = get_skin_result(task_id)
        
        # Step 4: Generate recommendations
        recommendations = get_outfit_recommendation(skin_result)
        
        return jsonify({
            'success': True,
            'skin_data': skin_result,
            'recommendations': recommendations
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tryon', methods=['POST'])
def tryon():
    """Try-on a specific outfit"""
    try:
        data = request.get_json()
        user_image = data.get('user_image')
        garment_image = data.get('garment_image')
        
        if not user_image or not garment_image:
            return jsonify({'error': 'Missing images'}), 400
        
        # Upload both images
        user_file_id = upload_file(user_image, 'cloth-v3')
        garment_file_id = upload_file(garment_image, 'cloth-v3')
        
        # Create VTO task
        task_id = apparel_vto(user_file_id, garment_file_id)
        
        # Get result
        result_url = get_vto_result(task_id)
        
        return jsonify({
            'success': True,
            'tryon_image_url': result_url
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
