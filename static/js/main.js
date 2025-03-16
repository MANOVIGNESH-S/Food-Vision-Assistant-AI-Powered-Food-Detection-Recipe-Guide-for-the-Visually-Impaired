document.addEventListener('DOMContentLoaded', function() {
    const socket = io();
    const captureBtn = document.getElementById('captureBtn');
    let currentDishes = [];
    let recognition = null;
    let voiceCommandsActive = true;

    // WebSocket event listeners
    socket.on('navigation_command', handleNavigationCommand);
    socket.on('voice_command_debug', handleVoiceCommandDebug);

    // Initialize core functionality
    initializePage();

    function initializePage() {
        setupEventListeners();
        initSpeechRecognition();
        checkPageState();
    }

    function setupEventListeners() {
        document.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', showLoading);
        });

        if (captureBtn) {
            captureBtn.addEventListener('click', captureImage);
        }

        const voiceToggle = document.getElementById('voiceCommandsToggle');
        if (voiceToggle) {
            voiceToggle.addEventListener('change', handleVoiceToggle);
        }

        document.addEventListener('keydown', handleKeyboardShortcuts);
    }

    async function captureImage() {
        showLoading();
        try {
            const response = await fetch('/capture', { method: 'POST' });
            handleCaptureResponse(response);
        } catch (error) {
            handleCaptureError(error);
        }
    }

    async function handleCaptureResponse(response) {
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();

        hideLoading();
        if (data.error) throw new Error(data.error);

        updateUI(data);
        currentDishes = data.suggestions || [];
        setupDishListeners();
    }

    function handleCaptureError(error) {
        hideLoading();
        showError(error.message);
        console.error('Capture error:', error);
    }

    function updateUI(data) {
        console.log('Updating UI with data:', data);
        if (data.image) {
            document.getElementById('capturedImage').src = `data:image/jpeg;base64,${data.image}`;
            document.getElementById('resultsContent').classList.remove('d-none');
        }

        if (data.detected_class) {
            document.getElementById('detectedItem').textContent = data.detected_class;
            document.getElementById('confidenceValue').textContent = `${(data.confidence * 100).toFixed(1)}%`;
            showSuggestions(data.suggestions);
            document.getElementById('suggestions').classList.remove('d-none'); // Ensure visibility
            console.log('Suggestions section made visible');
        } else {
            showError('No food detected. Please try again.');
        }
    }

    function showSuggestions(suggestions) {
        const grid = document.getElementById('suggestionsGrid');
        if (!grid) {
            console.error('Suggestions grid not found in DOM');
            return;
        }

        console.log('Showing suggestions:', suggestions);
        grid.innerHTML = '';

        if (suggestions && suggestions.length > 0) {
            suggestions.forEach((dish, index) => {
                const card = createSuggestionCard(dish, index);
                grid.appendChild(card);
            });
            console.log('Suggestions added to grid');
        } else {
            grid.innerHTML = '<p>No suggestions available.</p>';
            console.log('No suggestions to display');
        }
    }

    function createSuggestionCard(dish, index) {
        const card = document.createElement('div');
        card.className = 'col-md-6 dish-item';
        card.innerHTML = `
            <div class="d-flex align-items-center">
                <span class="badge bg-primary me-2">${index + 1}</span>
                <h5 class="mb-0">${dish}</h5>
            </div>
        `;
        card.addEventListener('click', () => handleDishClick(index + 1));
        return card;
    }

    function setupDishListeners() {
        document.querySelectorAll('.dish-item').forEach(item => {
            item.removeEventListener('click', handleDishClick);
            item.addEventListener('click', (e) => {
                const index = Array.from(e.currentTarget.parentNode.children).indexOf(e.currentTarget);
                handleDishClick(index + 1);
            });
        });
        console.log('Dish listeners set up');
    }

    function handleDishClick(number) {
        if (recognition) recognition.stop();

        fetch(`/recipe/${number}`, { method: 'POST' })
            .then(handleRecipeResponse)
            .then(updatePageContent)
            .catch(handleRecipeError);
    }

    function handleRecipeResponse(response) {
        if (!response.ok) throw new Error('Recipe not found');
        return response.text();
    }

    function updatePageContent(html) {
        document.body.innerHTML = html;
        initializePage();
    }

    function handleRecipeError(error) {
        alert(error.message);
        console.error('Recipe error:', error);
    }

    function handleContinue(choice) {
        if (recognition) recognition.stop();

        fetch('/continue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ choice })
        }).then(() => {
            window.location.href = '/';
        });
    }

    function handleNavigation() {
        console.log('Initiating navigation...');
        if (recognition) {
            recognition.stop();
            recognition = null;
        }
        window.location.href = '/';
    }

    function handleNavigationCommand(data) {
        console.log('Received navigation command:', data.command);
        if (data.command === 'go_home') {
            handleNavigation();
        }
    }

    function handleVoiceCommandDebug(data) {
        console.log('Voice command debug:', data.message);
    }

    function initSpeechRecognition() {
        if (recognition) recognition.stop();

        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onresult = handleVoiceResult;
            recognition.onerror = handleRecognitionError;
            recognition.onend = handleRecognitionEnd;

            if (voiceCommandsActive) {
                recognition.start();
                console.log('Speech recognition started');
            }
        } else {
            console.log('Speech recognition not supported');
        }
    }

    function handleVoiceResult(event) {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        console.log('Voice command:', transcript);
        socket.emit('voice_command', { command: transcript });
        showVoiceCommandToast(transcript);

        if (transcript.includes('home') || transcript.includes('back') || transcript.includes('return')) {
            handleNavigation();
        }

        if (document.body.dataset.page === 'index' && transcript.includes('capture')) {
            captureImage();
        }
    }

    function handleRecognitionError(event) {
        console.error('Speech recognition error:', event.error);
    }

    function handleRecognitionEnd() {
        if (voiceCommandsActive && recognition) {
            recognition.start();
            console.log('Speech recognition restarted');
        }
    }

    function handleVoiceToggle(event) {
        voiceCommandsActive = event.target.checked;
        if (voiceCommandsActive) {
            initSpeechRecognition();
        } else if (recognition) {
            recognition.stop();
            console.log('Speech recognition stopped');
        }
    }

    function showLoading() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) loadingIndicator.classList.remove('d-none');
        if (captureBtn) captureBtn.disabled = true;
    }

    function hideLoading() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) loadingIndicator.classList.add('d-none');
        if (captureBtn) captureBtn.disabled = false;
    }

    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-danger alert-dismissible fade show';
        errorDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.getElementById('detectionResults').prepend(errorDiv);
    }

    function showVoiceCommandToast(command) {
        const toastEl = document.getElementById('voiceCommandToast');
        if (!toastEl) return;

        const bodyEl = document.getElementById('voiceCommandToastBody');
        if (bodyEl) bodyEl.textContent = `Heard: "${command}"`;

        if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
            new bootstrap.Toast(toastEl).show();
        } else {
            toastEl.style.display = 'block';
            setTimeout(() => toastEl.style.display = 'none', 3000);
        }
    }

    function checkPageState() {
        if (document.body.dataset.page === 'recipe') {
            initializeRecipePage();
        }
    }

    function initializeRecipePage() {
        const tryBtn = document.getElementById('tryContinueBtn');
        const exitBtn = document.getElementById('exitBtn');
        if (tryBtn) tryBtn.addEventListener('click', () => handleContinue('y'));
        if (exitBtn) exitBtn.addEventListener('click', () => handleContinue('n'));
    }

    function handleKeyboardShortcuts(e) {
        const currentPage = document.body.dataset.page;

        if (currentPage === 'index') {
            if (e.key === 'c' || e.key === 'C') captureImage();
            if (e.key >= '1' && e.key <= '9') {
                const index = parseInt(e.key);
                if (index <= currentDishes.length) handleDishClick(index);
            }
        }

        if (currentPage === 'recipe' && (e.key === 'h' || e.key === 'H' || e.key === 'Escape')) {
            handleNavigation();
        }

        if (e.key === 'y' || e.key === 'Y') handleContinue('y');
        if (e.key === 'n' || e.key === 'N') handleContinue('n');
    }
});