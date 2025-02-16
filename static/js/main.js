document.addEventListener('DOMContentLoaded', function() {
    const captureBtn = document.getElementById('captureBtn');
    let currentDishes = [];

    // Add to main.js
    document.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', (e) => {
            showLoading();
        });
    });

    async function captureImage() {
        showLoading();
        try {
            const response = await fetch('/capture', { method: 'POST' });
            if (!response.ok) throw new Error('Network error');

            const data = await response.json();
            hideLoading();

            if (data.error) throw new Error(data.error);

            updateUI(data);
            currentDishes = data.suggestions || [];
            setupDishListeners();

        } catch (error) {
            hideLoading();
            showError(error.message);
        }
    }

    function showLoading() {
        $('#loading').removeClass('d-none');
        $('#captureBtn').prop('disabled', true);
    }

    function hideLoading() {
        $('#loading').addClass('d-none');
        $('#captureBtn').prop('disabled', false);
    }

    function updateUI(data) {
        if (data.image) {
            $('#capturedImage').attr('src', `data:image/jpeg;base64,${data.image}`);
            $('#resultsContent').removeClass('d-none');
        }

        if (data.detected_class) {
            $('#detectedItem').text(data.detected_class);
            $('#confidenceValue').text(`${(data.confidence * 100).toFixed(1)}%`);
            showSuggestions(data.suggestions);
        } else {
            showError('No food detected. Please try again.');
        }
    }

    function showSuggestions(suggestions) {
        const grid = $('#suggestionsGrid').empty();
        $('#suggestions').removeClass('d-none');

        suggestions.forEach((dish, index) => {
            const card = $('<div>')
                .addClass('col-md-6 dish-item')
                .html(`
                    <div class="d-flex align-items-center">
                        <span class="badge bg-primary me-2">${index + 1}</span>
                        <h5 class="mb-0">${dish}</h5>
                    </div>
                `)
                .click(() => handleDishClick(index + 1));

            grid.append(card);
        });

        setupDishListeners();
    }

    function setupDishListeners() {
        $('.dish-item').off('click').on('click', function() {
            const index = $(this).index();
            handleDishClick(index + 1);
        });
    }

    function handleDishClick(number) {
        fetch(`/recipe/${number}`, { method: 'POST' })
            .then(response => {
                if (!response.ok) throw new Error('Recipe not found');
                return response.text();
            })
            .then(html => {
                document.body.innerHTML = html;
            })
            .catch(error => {
                alert(error.message);
            });
    }

    function handleContinue(choice) {
        fetch('/continue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ choice })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'continue') {
                resetUI();
            } else {
                window.location.href = '/';
            }
        });
    }

    function showError(message) {
        $('#detectionResults').prepend(`
            <div class="alert alert-danger alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `);
    }

    // Toggle voice status display
    function toggleVoiceStatus(show) {
        document.getElementById('voiceStatus').style.display = show ? 'block' : 'none';
    }

    // Wrap all speak calls
    function speak(text) {
        toggleVoiceStatus(true);

        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            window.speechSynthesis.speak(utterance);

            utterance.onend = () => toggleVoiceStatus(false); // Hide status when done speaking
        }

        toggleVoiceStatus(false); // Hide immediately after starting to speak
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'c' || e.key === 'C') captureImage();
        if (e.key === 'y' || e.key === 'Y') handleContinue('y');
        if (e.key === 'n' || e.key === 'N') handleContinue('n');

        if (e.key >= '1' && e.key <= '9') {
            const index = parseInt(e.key);
            if (index <= currentDishes.length) handleDishClick(index);
        }
    });

    if (captureBtn) {
        captureBtn.addEventListener('click', captureImage);
    }
});
