Food Vision Assistant for the Blind

Overview

Food Vision Assistant is an AI-powered application designed to assist visually impaired individuals in identifying food items and suggesting recipes. The system uses a camera to capture images of food items, detects them using a deep learning model, and provides voice-guided responses to inform users about the identified food and possible recipes they can prepare.

Features

Real-time Food Detection: Uses computer vision to recognize food items.

Voice Guidance: Provides audio feedback for ease of use.

Recipe Suggestions: Suggests dishes based on detected food items.

Hands-free Operation: Users can interact using keyboard shortcuts and voice responses.

Installation & Setup

Prerequisites

Ensure you have Python installed (recommended version: 3.7 or later). Install the necessary dependencies using:

pip install -r requirements.txt

Running the Application

To start the Food Vision Assistant, run:

python app.py

Capturing Food Images

Place a food item in front of the camera.

Press C to capture an image.

The system will process the image and provide voice feedback on the detected food item.

Getting Recipes

After detection, the system suggests dishes.

Press the corresponding number key to hear the recipe.

Follow step-by-step instructions provided via voice guidance.

Supported Food Classes

This application supports detection of the following food items:

abricot, apple, avocado, banana, beet, bell pepper, bitter gourd, broccoli, cabbage, carrot, cauliflower, corn, cucumber, custard apple, durian, eggplant, fig, garlic, grape, hot pepper, kiwi, lemon, mango, melon, onion, orange, papaya, peach, pear, persimmon, pineapple, plum, pomegranate, potato, pumpkin, radish, strawberry, tomato, turnip, watermelon, zucchini

API Integration

The project utilizes the Roboflow Inference API for object detection. Ensure you have an API key configured in app.py.

Acknowledgments

Roboflow: For providing the food detection model.

Flask: For backend development.

OpenAI: For language processing assistance.

Future Enhancements

Voice-based interaction for capturing images.

Integration with smart home devices.

Expanded food dataset for better accuracy.