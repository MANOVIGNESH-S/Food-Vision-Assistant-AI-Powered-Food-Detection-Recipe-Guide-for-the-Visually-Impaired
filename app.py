from flask import Flask, render_template, request, jsonify
import cv2
import json
import pyttsx3
import threading
import queue
import base64
import time
import logging
from inference_sdk import InferenceHTTPClient
from flask_socketio import SocketIO

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize TTS system
tts_queue = queue.Queue()
engine_ready = threading.Event()
tts_lock = threading.Lock()
engine = None
shutdown_flag = threading.Event()

# Initialize Flask-SocketIO
socketio = SocketIO(app)


def init_tts_engine():
    """Initialize TTS engine with error handling"""
    try:
        engine = pyttsx3.init()
        engine.setProperty('rate', 150)  # Speed of speech
        engine.setProperty('volume', 0.9)  # Volume level
        voices = engine.getProperty('voices')
        for voice in voices:
            if "english" in voice.name.lower():
                engine.setProperty('voice', voice.id)
                break
        logger.info("TTS engine initialized successfully")
        return engine
    except Exception as e:
        logger.error(f"Failed to initialize TTS engine: {str(e)}")
        return None


def speak_sync(text):
    """Speak text synchronously (for critical messages)"""
    global engine
    try:
        if engine and not shutdown_flag.is_set():
            with tts_lock:
                engine.say(text)
                engine.runAndWait()
    except Exception as e:
        logger.error(f"Sync speech error: {str(e)}")


def tts_worker():
    """Dedicated TTS worker thread with improved error handling"""
    global engine
    try:
        engine = init_tts_engine()
        if engine is None:
            logger.error("Failed to start TTS worker - engine initialization failed")
            return

        engine_ready.set()
        logger.info("TTS worker started successfully")

        while not shutdown_flag.is_set():
            try:
                text = tts_queue.get(timeout=1.0)  # 1 second timeout
                if text is None:
                    break

                with tts_lock:
                    logger.debug(f"Speaking: {text}")
                    engine.say(text)
                    engine.runAndWait()
                    logger.debug("Finished speaking")

                tts_queue.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"TTS Error while speaking: {str(e)}")
                engine = init_tts_engine()  # Try to reinitialize
    except Exception as e:
        logger.error(f"Fatal TTS worker error: {str(e)}")
    finally:
        engine_ready.set()


def speak(text):
    """Queue text for TTS with verification"""
    if not text or shutdown_flag.is_set():
        return
    try:
        logger.debug(f"Queuing text to speak: {text}")
        tts_queue.put(text)
    except Exception as e:
        logger.error(f"Error queuing text to speak: {str(e)}")


# Start TTS thread
try:
    tts_thread = threading.Thread(target=tts_worker, daemon=True)
    tts_thread.start()
    if not engine_ready.wait(timeout=10):
        logger.error("TTS engine failed to initialize within timeout")
except Exception as e:
    logger.error(f"Error starting TTS thread: {str(e)}")

# Initialize Roboflow client
client = InferenceHTTPClient(
    api_url="https://detect.roboflow.com",
    api_key="oFCpd5K7E1aoaUheWSwp"
)

# Load data
try:
    with open('data/dishes.json') as f:
        dishes = json.load(f)
    with open('data/recipes.json') as f:
        recipes = json.load(f)
except Exception as e:
    logger.error(f"Data load error: {str(e)}")
    dishes = {}
    recipes = {}

# State management
processing_lock = threading.Lock()
current_suggestions = []


@app.route('/')
def index():
    """Homepage with welcoming voice guidance"""
    speak("Welcome to Food Vision Assistant!")
    time.sleep(0.5)
    speak("Please place your food item in front of the camera")
    time.sleep(0.5)
    speak("When ready, press C to capture the image or say 'capture'")
    return render_template('index.html')


@socketio.on('connect')
def handle_connect():
    """Handle WebSocket connection"""
    logger.info("Client connected via WebSocket")


@app.route('/capture', methods=['POST'])
def capture():
    """Capture and analyze food item with comprehensive voice guidance"""
    with processing_lock:
        try:
            # Capture image
            cap = cv2.VideoCapture(0)
            if not cap.isOpened():
                speak("Camera is not available. Please check your camera connection")
                return jsonify({"error": "Camera unavailable", "status": "error"}), 500

            ret, frame = cap.read()
            cap.release()

            if not ret:
                speak("Failed to capture image. Please try again")
                return jsonify({"error": "Capture failed", "status": "error"}), 500

            # Process image
            frame = cv2.resize(frame, (640, 640))
            _, buffer = cv2.imencode('.jpg', frame)
            image_base64 = base64.b64encode(buffer).decode('utf-8')

            # Perform detection
            predictions = client.infer(frame, model_id="fruits-and-vegetables-v3/1").get('predictions', [])

            if predictions:
                best = max(predictions, key=lambda x: x['confidence'])
                suggestions = dishes.get(best['class'].lower(), [])[:9]
                global current_suggestions
                current_suggestions = suggestions

                speak(f"I detected a {best['class']} with {best['confidence'] * 100:.1f}% confidence")
                time.sleep(0.8)

                if suggestions:
                    speak("Here are the suggested dishes you can make")
                    time.sleep(0.5)
                    for i, dish in enumerate(suggestions, 1):
                        speak(f"Number {i}: {dish}")
                        time.sleep(0.8)
                    speak("To hear any recipe, press its number on your keyboard")

                return jsonify({
                    "status": "success",
                    "image": image_base64,
                    "detected_class": best['class'],
                    "confidence": best['confidence'],
                    "suggestions": suggestions
                })
            else:
                speak("No food items were detected. Please try again with a clearer image")
                return jsonify({"message": "No detection", "status": "error"}), 400
        except Exception as e:
            logger.error(f"Capture error: {str(e)}")
            speak("An error occurred during processing. Please try again")
            return jsonify({"error": str(e), "status": "error"}), 500


from difflib import get_close_matches
from fuzzywuzzy import process


def find_closest_recipe(dish_name, recipe_dict):
    """Find the closest matching recipe name if exact match isn't found."""
    matches = get_close_matches(dish_name, recipe_dict.keys(), n=1, cutoff=0.5)
    return matches[0] if matches else None


@app.route('/recipe/<int:number>', methods=['POST'])
def get_recipe_by_number(number):
    """Handle recipe selection with fuzzy matching"""
    try:
        if 1 <= number <= len(current_suggestions):
            selected_dish = current_suggestions[number - 1].strip().lower()
            best_match, score = process.extractOne(selected_dish, recipes.keys())

            if score >= 80:
                recipe = recipes[best_match]
                speak(f"Here's how to make {best_match}")
                time.sleep(0.5)
                speak("You will need these ingredients:")
                time.sleep(0.5)
                for ingredient in recipe.get('ingredients', []):
                    speak(ingredient)
                    time.sleep(0.8)
                speak("Now, follow these steps:")
                time.sleep(0.5)
                for i, step in enumerate(recipe.get('instructions', []), 1):
                    speak(f"Step {i}: {step}")
                    time.sleep(1)
                speak("At any time, you can say 'home' or 'back' to return to the main screen")
                speak("Would you like to try another dish? Press Y for yes, or N for no")

                return render_template(
                    "recipe.html",
                    dish=best_match.title(),
                    ingredients=recipe.get('ingredients', []),
                    instructions=recipe.get('instructions', [])
                )
            else:
                speak(f"I couldn't find a recipe for {selected_dish}")
                return render_template("error.html", message="Recipe not found"), 404
        else:
            speak(f"Please press a number between 1 and {len(current_suggestions)}")
            return render_template("error.html", message="Invalid selection"), 400
    except Exception as e:
        logger.error(f"Recipe error: {str(e)}")
        speak("An error occurred while getting the recipe. Please try again")
        return render_template("error.html", message="Something went wrong"), 500


@app.route('/continue', methods=['POST'])
def continue_session():
    """Handle continuation with clear voice guidance"""
    choice = request.json.get('choice', '').lower()
    if choice == 'y':
        speak("Great! Let's try another dish")
        time.sleep(0.5)
        speak("Please place your next food item in front of the camera")
        time.sleep(0.5)
        speak("Press C when ready to capture, or say 'capture'")
        return jsonify({"status": "continue"})
    elif choice == 'n':
        speak("Thank you for using Food Vision Assistant")
        time.sleep(0.5)
        speak("Have a great day!")
        return jsonify({"status": "end"})
    else:
        speak("Please press Y for yes or N for no")
        return jsonify({"error": "Invalid choice", "status": "error"}), 400


@app.route('/go-home', methods=['POST'])
def go_home():
    """Handle returning to home screen"""
    speak("Returning to home screen")
    return jsonify({"status": "home"})


@socketio.on('voice_command')
def handle_voice_command(data):
    """Handle voice commands via WebSocket"""
    command = data.get('command', '').lower()
    logger.info(f"Received voice command: {command}")

    if command in ['home', 'back', 'return']:
        socketio.emit('redirect', {'url': '/'})
        return {'status': 'success', 'action': 'redirect'}

    return {'status': 'error', 'message': 'Unknown command'}


@app.errorhandler(404)
def not_found_error(error):
    """Handle 404 errors with voice guidance"""
    speak("Sorry, I couldn't find what you were looking for")
    return jsonify({"error": "Not found", "status": "error"}), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors with voice guidance"""
    speak("An internal error occurred. Please try again")
    return jsonify({"error": "Internal server error", "status": "error"}), 500


def shutdown_server():
    """Graceful shutdown of the server"""
    shutdown_flag.set()
    speak("System shutting down")
    time.sleep(1)
    tts_queue.put(None)
    tts_thread.join(timeout=1)

if __name__ == '__main__':
    try:
        speak("Food Vision Assistant is ready")
        socketio.run(app, debug=False)
    finally:
        shutdown_server()
